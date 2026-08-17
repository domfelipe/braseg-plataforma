import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Trash2, X } from "lucide-react";
import { api } from "@/integrations/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useOfflineSync } from "@/lib/seguranca/useOfflineSync";
import { AGENT_GROUP_LABELS, type SegAgent, type SegEmployee, type SegRole, type SegSector } from "@/lib/seguranca/types";

interface Props {
  clientId: string;
  companyId: string;
}

const GROUP_ORDER = ["QUÍMICOS", "FÍSICOS", "BIOLÓGICOS", "OUTROS", "AUSÊNCIA"];

export default function Levantamento({ clientId, companyId }: Props) {
  const qc = useQueryClient();
  const off = useOfflineSync(clientId, companyId);
  const [busy, setBusy] = useState<string | null>(null);
  const [newSector, setNewSector] = useState("");
  const [newEmployee, setNewEmployee] = useState({ name: "", role_id: "none", sector_id: "none" });
  const [editingRole, setEditingRole] = useState<SegRole | null>(null);
  const [agentSearch, setAgentSearch] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [roleForm, setRoleForm] = useState({ name: "", description: "", sector_id: "none" });

  const sectors = useQuery({
    queryKey: ["seg-sectors", companyId, clientId],
    queryFn: () => api.get<{ sectors: SegSector[] }>("/seguranca/clients/" + clientId + "/sectors", { companyId }),
    enabled: Boolean(clientId && companyId) && off.online,
  });
  const roles = useQuery({
    queryKey: ["seg-roles", companyId, clientId],
    queryFn: () => api.get<{ roles: SegRole[] }>("/seguranca/clients/" + clientId + "/roles", { companyId }),
    enabled: Boolean(clientId && companyId) && off.online,
  });
  const employees = useQuery({
    queryKey: ["seg-employees", companyId, clientId],
    queryFn: () => api.get<{ employees: SegEmployee[] }>("/seguranca/clients/" + clientId + "/employees", { companyId }),
    enabled: Boolean(clientId && companyId) && off.online,
  });
  const catalog = useQuery({
    queryKey: ["seg-catalogs", companyId],
    queryFn: () => api.get<{ agents: SegAgent[] }>("/seguranca/catalogs", { companyId }),
    enabled: Boolean(companyId) && off.online,
  });

  // Fonte de dados: online → API; offline → snapshot do campo (IndexedDB)
  const sectorsData: SegSector[] = off.online ? sectors.data?.sectors ?? [] : ((off.snapshot?.sectors ?? []) as SegSector[]);
  const rolesData: SegRole[] = off.online ? roles.data?.roles ?? [] : ((off.snapshot?.roles ?? []) as SegRole[]);
  const employeesData: SegEmployee[] = off.online ? employees.data?.employees ?? [] : ((off.snapshot?.employees ?? []) as SegEmployee[]);
  const agentsCatalog: SegAgent[] = off.online ? catalog.data?.agents ?? [] : ((off.snapshot?.agents ?? []) as SegAgent[]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["seg-sectors", companyId, clientId] });
    void qc.invalidateQueries({ queryKey: ["seg-roles", companyId, clientId] });
    void qc.invalidateQueries({ queryKey: ["seg-employees", companyId, clientId] });
    void qc.invalidateQueries({ queryKey: ["seg-client", companyId, clientId] });
  };

  const act = async (label: string, apiCall: () => Promise<unknown>, mutation: Parameters<typeof off.runOrQueue>[1], optimistic?: Parameters<typeof off.runOrQueue>[2], successMsg?: string) => {
    setBusy(label);
    try {
      await off.runOrQueue(apiCall, mutation, optimistic);
      if (navigator.onLine && successMsg) toast.success(successMsg);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na operação");
    } finally {
      setBusy(null);
    }
  };

  const addSector = () => {
    if (!newSector.trim()) return;
    const id = crypto.randomUUID();
    const name = newSector.trim();
    void act(
      "sector-add",
      () => api.post("/seguranca/clients/" + clientId + "/sectors", { companyId, name }),
      { entity: "sectors", operation: "insert", payload: { id, name } },
      (s) => ({ ...s, sectors: [...s.sectors, { id, name, sort_order: 0 }] }),
      "Setor adicionado"
    );
    setNewSector("");
  };

  const removeSector = (sectorId: string) =>
    void act(
      "sector-del",
      () => api.del("/seguranca/clients/" + clientId + "/sectors", { companyId, sectorId }),
      { entity: "sectors", operation: "delete", payload: { sector_id: sectorId } },
      (s) => ({ ...s, sectors: s.sectors.filter((x) => (x as SegSector).id !== sectorId) }),
      "Setor removido"
    );

  const addRole = () => {
    if (!roleForm.name.trim()) return;
    const id = crypto.randomUUID();
    const name = roleForm.name.trim();
    const description = roleForm.description;
    const sectorId = roleForm.sector_id === "none" ? null : roleForm.sector_id;
    const role: SegRole = { id, name, description, sector_id: sectorId, sector_name: null, agent_codes: [] };
    void act(
      "role-add",
      () => api.post("/seguranca/clients/" + clientId + "/roles", { companyId, name, description, sector_id: sectorId }),
      { entity: "roles", operation: "insert", payload: { id, name, description, sector_id: sectorId, agent_codes: [] } },
      (s) => ({ ...s, roles: [...s.roles, role] }),
      "Cargo adicionado"
    );
    setRoleForm({ name: "", description: "", sector_id: "none" });
  };

  const removeRole = (roleId: string) =>
    void act(
      "role-del",
      () => api.del("/seguranca/clients/" + clientId + "/roles", { companyId, roleId }),
      { entity: "roles", operation: "delete", payload: { role_id: roleId } },
      (s) => ({ ...s, roles: s.roles.filter((x) => (x as SegRole).id !== roleId) }),
      "Cargo removido"
    );

  const saveRoleAgents = () => {
    if (!editingRole) return;
    const roleId = editingRole.id;
    const codes = [...selectedAgents];
    void act(
      "role-agents",
      () => api.patch("/seguranca/clients/" + clientId + "/roles", { companyId, roleId, agent_codes: codes }),
      { entity: "roles", operation: "update", payload: { role_id: roleId, agent_codes: codes } },
      (s) => ({ ...s, roles: s.roles.map((x) => ((x as SegRole).id === roleId ? { ...(x as SegRole), agent_codes: codes } : x)) }),
      "Agentes de risco atualizados"
    );
    setEditingRole(null);
  };

  const addEmployee = () => {
    if (!newEmployee.name.trim()) return;
    const id = crypto.randomUUID();
    const name = newEmployee.name.trim();
    const roleId = newEmployee.role_id === "none" ? null : newEmployee.role_id;
    const sectorId = newEmployee.sector_id === "none" ? null : newEmployee.sector_id;
    const emp: SegEmployee = { id, name, role_id: roleId, sector_id: sectorId, active: true, role_name: null, sector_name: null };
    void act(
      "emp-add",
      () => api.post("/seguranca/clients/" + clientId + "/employees", { companyId, name, role_id: roleId, sector_id: sectorId }),
      { entity: "employees", operation: "insert", payload: { id, name, role_id: roleId, sector_id: sectorId } },
      (s) => ({ ...s, employees: [...s.employees, emp] }),
      "Funcionário adicionado"
    );
    setNewEmployee({ name: "", role_id: "none", sector_id: "none" });
  };

  const toggleEmployee = (emp: SegEmployee) =>
    void act(
      "emp-toggle",
      () => api.patch("/seguranca/clients/" + clientId + "/employees", { companyId, employeeId: emp.id, active: !emp.active }),
      { entity: "employees", operation: "update", payload: { employee_id: emp.id, active: !emp.active } },
      (s) => ({ ...s, employees: s.employees.map((x) => ((x as SegEmployee).id === emp.id ? { ...(x as SegEmployee), active: !emp.active } : x)) })
    );

  const removeEmployee = (employeeId: string) =>
    void act(
      "emp-del",
      () => api.del("/seguranca/clients/" + clientId + "/employees", { companyId, employeeId }),
      { entity: "employees", operation: "delete", payload: { employee_id: employeeId } },
      (s) => ({ ...s, employees: s.employees.filter((x) => (x as SegEmployee).id !== employeeId) }),
      "Funcionário removido"
    );

  const groupedAgents = useMemo(() => {
    const source: SegAgent[] = off.online ? catalog.data?.agents ?? [] : ((off.snapshot?.agents ?? []) as SegAgent[]);
    const q = agentSearch.trim().toLowerCase();
    const map = new Map<string, SegAgent[]>();
    for (const grp of GROUP_ORDER) {
      const items = source.filter(
        (a) => a.grp === grp && (q === "" || a.agent.toLowerCase().includes(q) || a.code.includes(q) || a.subgroup.toLowerCase().includes(q))
      );
      if (items.length > 0) map.set(grp, items);
    }
    return map;
  }, [off.online, catalog.data, off.snapshot, agentSearch]);

  const openAgents = (role: SegRole) => {
    setEditingRole(role);
    setSelectedAgents(new Set(role.agent_codes));
    setAgentSearch("");
  };

  const loading = off.online && (sectors.isLoading || roles.isLoading || employees.isLoading);

  return (
    <div className="space-y-6">
      {!off.online && (
        <div className="rounded-[10px] border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
          <strong>Modo campo (offline):</strong> as alterações ficam salvas neste dispositivo e são sincronizadas automaticamente ao reconectar
          {off.pendingCount > 0 ? " — " + off.pendingCount + " pendência(s)." : "."}
        </div>
      )}

      {/* Setores */}
      <Card className="rounded-[10px] p-5">
        <h3 className="font-display text-sm font-bold">Setores</h3>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => { e.preventDefault(); addSector(); }}
        >
          <Input value={newSector} onChange={(e) => setNewSector(e.target.value)} placeholder="Ex.: Produção, Administrativo..." className="max-w-xs" />
          <Button type="submit" size="sm" disabled={!newSector.trim() || busy !== null}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {sectorsData.map((s) => (
            <Badge key={s.id} variant="secondary" className="gap-1.5 pr-1">
              {s.name}
              <button type="button" aria-label={"Remover setor " + s.name} className="rounded-full p-0.5 hover:bg-foreground/10" onClick={() => removeSector(s.id)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {sectorsData.length === 0 && <p className="text-xs text-muted-foreground">Nenhum setor ainda.</p>}
        </div>
      </Card>

      {/* Cargos + agentes */}
      <Card className="rounded-[10px] p-5">
        <h3 className="font-display text-sm font-bold">Cargos e agentes de risco</h3>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => { e.preventDefault(); addRole(); }}
        >
          <div>
            <Label htmlFor="role-name" className="text-xs">Cargo *</Label>
            <Input id="role-name" className="mt-1" value={roleForm.name} onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex.: Serrador" />
          </div>
          <div>
            <Label htmlFor="role-sector" className="text-xs">Setor</Label>
            <Select value={roleForm.sector_id} onValueChange={(v) => setRoleForm((f) => ({ ...f, sector_id: v }))}>
              <SelectTrigger id="role-sector" className="mt-1"><SelectValue placeholder="Sem setor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem setor</SelectItem>
                {sectorsData.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" size="sm" disabled={!roleForm.name.trim() || busy !== null}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="role-desc" className="text-xs">Descrição das atividades (entra na caracterização do GES)</Label>
            <Textarea id="role-desc" className="mt-1" rows={2} value={roleForm.description} onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))} placeholder="Ex.: Opera serra de bancada para corte de pedras..." />
          </div>
        </form>

        <div className="mt-4 space-y-2">
          {loading && <Skeleton className="h-16 rounded-[10px]" />}
          {rolesData.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border bg-background/60 p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.sector_name ?? "Sem setor"} · {r.agent_codes.length} agente(s) de risco
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => openAgents(r)}>Agentes ({r.agent_codes.length})</Button>
                <Button size="sm" variant="ghost" className="text-destructive" aria-label={"Remover cargo " + r.name} onClick={() => removeRole(r.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {!loading && rolesData.length === 0 && <p className="text-xs text-muted-foreground">Nenhum cargo ainda.</p>}
        </div>
      </Card>

      {/* Funcionários */}
      <Card className="rounded-[10px] p-5">
        <h3 className="font-display text-sm font-bold">Funcionários</h3>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
          onSubmit={(e) => { e.preventDefault(); addEmployee(); }}
        >
          <div>
            <Label htmlFor="emp-name" className="text-xs">Nome *</Label>
            <Input id="emp-name" className="mt-1" value={newEmployee.name} onChange={(e) => setNewEmployee((f) => ({ ...f, name: e.target.value }))} placeholder="Nome do funcionário" />
          </div>
          <div>
            <Label htmlFor="emp-role" className="text-xs">Cargo</Label>
            <Select value={newEmployee.role_id} onValueChange={(v) => setNewEmployee((f) => ({ ...f, role_id: v }))}>
              <SelectTrigger id="emp-role" className="mt-1"><SelectValue placeholder="Sem cargo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem cargo</SelectItem>
                {rolesData.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="emp-sector" className="text-xs">Setor</Label>
            <Select value={newEmployee.sector_id} onValueChange={(v) => setNewEmployee((f) => ({ ...f, sector_id: v }))}>
              <SelectTrigger id="emp-sector" className="mt-1"><SelectValue placeholder="Sem setor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem setor</SelectItem>
                {sectorsData.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" size="sm" disabled={!newEmployee.name.trim() || busy !== null}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        </form>

        <div className="mt-4 space-y-2">
          {employeesData.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border bg-background/60 p-3">
              <div className="min-w-0">
                <p className={"text-sm font-semibold " + (e.active ? "" : "line-through text-muted-foreground")}>{e.name}</p>
                <p className="text-xs text-muted-foreground">
                  {e.role_name ?? "Sem cargo"} · {e.sector_name ?? "Sem setor"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => toggleEmployee(e)}>{e.active ? "Inativar" : "Ativar"}</Button>
                <Button size="sm" variant="ghost" className="text-destructive" aria-label={"Remover " + e.name} onClick={() => removeEmployee(e.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {employeesData.length === 0 && <p className="text-xs text-muted-foreground">Nenhum funcionário ainda.</p>}
        </div>
      </Card>

      {/* Dialog de agentes por cargo */}
      <Dialog open={editingRole !== null} onOpenChange={(open) => { if (!open) setEditingRole(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Agentes de risco — {editingRole?.name}</DialogTitle>
            <DialogDescription>Marque os agentes aos quais o cargo está exposto (catálogo eSocial Tabela 24, S-1.3).</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar agente ou código..." value={agentSearch} onChange={(e) => setAgentSearch(e.target.value)} />
          </div>
          <div className="mt-2 max-h-72 space-y-4 overflow-y-auto">
            {[...groupedAgents.entries()].map(([grp, items]) => (
              <div key={grp}>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{AGENT_GROUP_LABELS[grp] ?? grp}</p>
                <div className="mt-1.5 grid gap-1.5">
                  {items.map((a) => {
                    const checked = selectedAgents.has(a.code);
                    return (
                      <label key={a.code} className={"flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition-colors " + (checked ? "border-primary/50 bg-primary/5" : "border-border hover:bg-background/60")}>
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded accent-[#1f3d9d]"
                          checked={checked}
                          onChange={() => {
                            const next = new Set(selectedAgents);
                            if (checked) next.delete(a.code); else next.add(a.code);
                            setSelectedAgents(next);
                          }}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{a.agent}</span>
                          <span className="block text-xs text-muted-foreground">{a.code} · {a.subgroup}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            {groupedAgents.size === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Nenhum agente encontrado para a busca.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRole(null)}>Cancelar</Button>
            <Button onClick={saveRoleAgents} disabled={busy !== null}>Salvar {selectedAgents.size} agente(s)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
