import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/integrations/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface PlanItem {
  id: string;
  description: string;
  responsible: string | null;
  deadline: string | null;
  status: "pendente" | "em_andamento" | "concluido";
  risk_id: string | null;
  agent_code: string | null;
  ges_name: string | null;
  agent: string | null;
}

interface RiskRef {
  id: string;
  agent_code: string;
  agent: string | null;
  ges_name: string;
}

interface Props {
  clientId: string;
  companyId: string;
}

const STATUS_LABEL: Record<PlanItem["status"], string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

const STATUS_CHIP: Record<PlanItem["status"], string> = {
  pendente: "bg-warning/10 text-warning border-warning/40",
  em_andamento: "bg-primary/10 text-primary border-primary/40",
  concluido: "bg-success/10 text-success border-success/40",
};

export default function PlanoAcao({ clientId, companyId }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ description: "", responsible: "", deadline: "", risk_id: "none" });

  const items = useQuery({
    queryKey: ["seg-plan", companyId, clientId],
    queryFn: () => api.get<{ items: PlanItem[] }>("/seguranca/clients/" + clientId + "/action-plan", { companyId }),
    enabled: Boolean(clientId && companyId),
  });
  const risks = useQuery({
    queryKey: ["seg-inventory", companyId, clientId],
    queryFn: () => api.get<{ risks: RiskRef[] }>("/seguranca/clients/" + clientId + "/inventory", { companyId }),
    enabled: Boolean(clientId && companyId),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["seg-plan", companyId, clientId] });
    void qc.invalidateQueries({ queryKey: ["seg-client", companyId, clientId] });
  };

  const add = useMutation({
    mutationFn: () =>
      api.post("/seguranca/clients/" + clientId + "/action-plan", {
        companyId,
        description: form.description,
        responsible: form.responsible || null,
        deadline: form.deadline || null,
        risk_id: form.risk_id === "none" ? null : form.risk_id,
        status: "pendente",
      }),
    onSuccess: () => { toast.success("Item adicionado ao plano"); setForm({ description: "", responsible: "", deadline: "", risk_id: "none" }); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao adicionar item"),
  });
  const setStatus = useMutation({
    mutationFn: (args: { itemId: string; status: PlanItem["status"] }) =>
      api.patch("/seguranca/clients/" + clientId + "/action-plan", { companyId, itemId: args.itemId, status: args.status }),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar status"),
  });
  const remove = useMutation({
    mutationFn: (itemId: string) => api.del("/seguranca/clients/" + clientId + "/action-plan", { companyId, itemId }),
    onSuccess: () => { toast.success("Item removido"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover item"),
  });

  const sorted = [...(items.data?.items ?? [])].sort((a, b) => {
    const order: Record<PlanItem["status"], number> = { pendente: 0, em_andamento: 1, concluido: 2 };
    return order[a.status] - order[b.status];
  });

  return (
    <div className="space-y-4">
      <Card className="rounded-[10px] p-5">
        <h3 className="font-display text-sm font-bold">Novo item</h3>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
          onSubmit={(e) => { e.preventDefault(); if (form.description.trim()) add.mutate(); }}
        >
          <div>
            <Label htmlFor="plan-desc" className="text-xs">Descrição *</Label>
            <Input id="plan-desc" className="mt-1" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Ex.: Instalar enclausuramento na serra" />
          </div>
          <div>
            <Label htmlFor="plan-resp" className="text-xs">Responsável</Label>
            <Input id="plan-resp" className="mt-1" value={form.responsible} onChange={(e) => setForm((f) => ({ ...f, responsible: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="plan-deadline" className="text-xs">Prazo</Label>
            <Input id="plan-deadline" type="date" className="mt-1" value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="plan-risk" className="text-xs">Origem (risco)</Label>
            <Select value={form.risk_id} onValueChange={(v) => setForm((f) => ({ ...f, risk_id: v }))}>
              <SelectTrigger id="plan-risk" className="mt-1"><SelectValue placeholder="Sem origem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem origem</SelectItem>
                {risks.data?.risks.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.ges_name} — {r.agent ?? r.agent_code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" size="sm" disabled={!form.description.trim() || add.isPending}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        </form>
      </Card>

      <div className="space-y-2">
        {items.isLoading && <Skeleton className="h-16 rounded-[10px]" />}
        {!items.isLoading && items.data?.items.length === 0 && (
          <Card className="rounded-[10px] p-8 text-center">
            <p className="text-sm font-semibold">Plano de ação vazio</p>
            <p className="mt-1 text-xs text-muted-foreground">Adicione medidas para os riscos identificados na matriz.</p>
          </Card>
        )}
        {sorted.map((item) => {
          const origin = item.ges_name && item.agent ? "Origem: " + item.ges_name + " — " + item.agent : item.responsible ? "Responsável: " + item.responsible : "";
          const resp = item.responsible && item.ges_name ? " · Responsável: " + item.responsible : "";
          const deadline = item.deadline ? " · Prazo: " + item.deadline.split("-").reverse().join("/") : "";
          return (
            <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-[10px] border border-border bg-background/60 p-3">
              <div className="min-w-0 flex-1">
                <p className={"text-sm font-semibold " + (item.status === "concluido" ? "line-through text-muted-foreground" : "")}>
                  {item.description}
                </p>
                <p className="text-[11px] text-muted-foreground">{origin + resp + deadline}</p>
              </div>
              <Badge className={"border text-xs " + STATUS_CHIP[item.status]}>{STATUS_LABEL[item.status]}</Badge>
              <Select value={item.status} onValueChange={(v) => setStatus.mutate({ itemId: item.id, status: v as PlanItem["status"] })}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" className="text-destructive" aria-label="Remover item" onClick={() => remove.mutate(item.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
