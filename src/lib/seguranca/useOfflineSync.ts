import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/integrations/api/client";
import {
  enqueueMutation,
  listMutations,
  loadSnapshot,
  offlineStore,
  removeMutations,
  saveSnapshot,
  type OutboxMutation,
  type SegSnapshot,
} from "@/lib/seguranca/offline";

/**
 * Sincronização offline do módulo Segurança do Trabalho.
 * - "Preparar para campo" baixa o snapshot do cliente + catálogos (IndexedDB).
 * - Sem conexão, mutações de coleta vão para o outbox e o snapshot é atualizado
 *   de forma otimista (UI continua funcionando).
 * - Ao reconectar, o outbox é reaplicado em ordem via /seguranca/sync (idempotente).
 */
export function useOfflineSync(clientId: string | null, companyId: string | null) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [snapshot, setSnapshot] = useState<SegSnapshot | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [preparing, setPreparing] = useState(false);

  const refreshPending = useCallback(async () => {
    const items = await listMutations(clientId ?? undefined);
    setPendingCount(items.length);
  }, [clientId]);

  useEffect(() => {
    const goOnline = () => { setOnline(true); void refreshPending(); };
    const goOffline = () => { setOnline(false); void refreshPending(); };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [refreshPending]);

  useEffect(() => {
    void refreshPending();
    return offlineStore.subscribe(() => void refreshPending());
  }, [refreshPending]);

  useEffect(() => {
    if (clientId) {
      void loadSnapshot(clientId).then((s) => setSnapshot(s ?? null));
    }
  }, [clientId]);

  const prepareField = useCallback(async () => {
    if (!clientId || !companyId) return;
    setPreparing(true);
    try {
      const [sectors, roles, employees, ges, risks, plan, catalogs] = await Promise.all([
        api.get<{ sectors: unknown[] }>("/seguranca/clients/" + clientId + "/sectors", { companyId }),
        api.get<{ roles: unknown[] }>("/seguranca/clients/" + clientId + "/roles", { companyId }),
        api.get<{ employees: unknown[] }>("/seguranca/clients/" + clientId + "/employees", { companyId }),
        api.get<{ ges: unknown[] }>("/seguranca/clients/" + clientId + "/ges", { companyId }),
        api.get<{ risks: unknown[] }>("/seguranca/clients/" + clientId + "/inventory", { companyId }),
        api.get<{ items: unknown[] }>("/seguranca/clients/" + clientId + "/action-plan", { companyId }),
        api.get<{ agents: unknown[]; nrs: unknown[] }>("/seguranca/catalogs", { companyId }),
      ]);
      const snap: SegSnapshot = {
        clientId,
        sectors: sectors.sectors,
        roles: roles.roles,
        employees: employees.employees,
        ges: ges.ges,
        risks: risks.risks,
        plan: plan.items,
        agents: catalogs.agents,
        nrs: catalogs.nrs,
        savedAt: new Date().toISOString(),
      };
      await saveSnapshot(snap);
      setSnapshot(snap);
      toast.success("Cliente pronto para o campo — dados disponíveis offline");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao preparar para o campo");
    } finally {
      setPreparing(false);
    }
  }, [clientId, companyId]);

  const flush = useCallback(async () => {
    if (!companyId || syncing) return;
    const items = await listMutations(clientId ?? undefined);
    if (items.length === 0) return;
    setSyncing(true);
    try {
      const res = await api.post<{ ok: boolean; results?: Array<{ client_mutation_id: string; status: string }> }>(
        "/seguranca/sync",
        { companyId, mutations: items }
      );
      const done = new Set((res.results ?? []).filter((r) => r.status === "applied" || r.status === "duplicate").map((r) => r.client_mutation_id));
      await removeMutations([...done]);
      const remaining = await listMutations(clientId ?? undefined);
      setPendingCount(remaining.length);
      offlineStore.notify();
      toast.success("Sincronização concluída — " + done.size + " alteração(ões) enviada(s)");
      if (clientId) {
        void loadSnapshot(clientId).then((s) => setSnapshot(s ?? null));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao sincronizar — tente novamente");
    } finally {
      setSyncing(false);
    }
  }, [companyId, clientId, syncing]);

  // Reconectou → sincroniza automaticamente
  useEffect(() => {
    if (online) void flush();
  }, [online, flush]);

  /** Executa a mutação online OU enfileira offline com atualização otimista do snapshot. */
  const runOrQueue = useCallback(
    async (apiCall: () => Promise<unknown>, mutation: Omit<OutboxMutation, "client_mutation_id" | "created_at" | "client_id">, optimistic?: (snap: SegSnapshot) => SegSnapshot) => {
      if (navigator.onLine) {
        return apiCall();
      }
      const m: OutboxMutation = {
        ...mutation,
        client_id: clientId ?? "",
        client_mutation_id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      };
      await enqueueMutation(m);
      if (optimistic && snapshot) {
        const next = optimistic(snapshot);
        await saveSnapshot(next);
        setSnapshot(next);
      }
      setPendingCount((c) => c + 1);
      toast.info("Salvo offline — será sincronizado ao reconectar");
      return undefined;
    },
    [clientId, snapshot]
  );

  return { online, pendingCount, snapshot, syncing, preparing, prepareField, flush, runOrQueue };
}
