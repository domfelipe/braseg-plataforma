import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/integrations/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  SEVERITIES,
  SEVERITY_LABELS,
  classifyRisk,
  isFrequency,
  isSeverity,
  riskLevel,
  type RiskFrequency,
} from "@/lib/seguranca/matrix";
import type { SegNr } from "@/lib/seguranca/types";

interface RiskRow {
  id: string;
  ges_id: string;
  agent_code: string;
  frequency: string;
  severity: number;
  classification: string;
  effects: string;
  existing_measures: string;
  proposed_measures: string;
  record_control: string;
  nr_codes: string[];
  agent: string | null;
  grp: string | null;
  ges_code: string;
  ges_name: string;
}

interface GesRow {
  id: string;
  code: string;
  name: string;
  agent_codes: string[];
}

interface Props {
  clientId: string;
  companyId: string;
}

const LEVEL_CHIP: Record<number, string> = {
  1: "bg-success/10 text-success border-success/40",
  2: "bg-warning/10 text-warning border-warning/40",
  3: "bg-warning/10 text-warning border-warning/40",
  4: "bg-destructive/10 text-destructive border-destructive/40",
  5: "bg-destructive/10 text-destructive border-destructive/40",
};

export default function Matriz({ clientId, companyId }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<RiskRow | null>(null);
  const [addingFor, setAddingFor] = useState<GesRow | null>(null);
  const [newAgent, setNewAgent] = useState("");
  const [form, setForm] = useState({
    frequency: "C" as string,
    severity: "3" as string,
    effects: "",
    existing_measures: "",
    proposed_measures: "",
    record_control: "",
    nr_codes: [] as string[],
  });

  const risks = useQuery({
    queryKey: ["seg-inventory", companyId, clientId],
    queryFn: () => api.get<{ risks: RiskRow[] }>("/seguranca/clients/" + clientId + "/inventory", { companyId }),
    enabled: Boolean(clientId && companyId),
  });
  const ges = useQuery({
    queryKey: ["seg-ges", companyId, clientId],
    queryFn: () => api.get<{ ges: GesRow[] }>("/seguranca/clients/" + clientId + "/ges", { companyId }),
    enabled: Boolean(clientId && companyId),
  });
  const catalog = useQuery({
    queryKey: ["seg-catalogs", companyId],
    queryFn: () => api.get<{ agents: { code: string; agent: string }[]; nrs: SegNr[] }>("/seguranca/catalogs", { companyId }),
    enabled: Boolean(companyId),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["seg-inventory", companyId, clientId] });
    void qc.invalidateQueries({ queryKey: ["seg-client", companyId, clientId] });
    void qc.invalidateQueries({ queryKey: ["seg-ges", companyId, clientId] });
  };

  const save = useMutation({
    mutationFn: (riskId: string | null) =>
      api.put("/seguranca/clients/" + clientId + "/inventory", {
        companyId,
        riskId,
        ges_id: editing?.ges_id ?? addingFor?.id,
        agent_code: editing?.agent_code ?? newAgent,
        frequency: form.frequency,
        severity: Number(form.severity),
        effects: form.effects,
        existing_measures: form.existing_measures,
        proposed_measures: form.proposed_measures,
        record_control: form.record_control,
        nr_codes: form.nr_codes,
      }),
    onSuccess: () => { toast.success("Risco salvo na matriz"); setEditing(null); setAddingFor(null); setNewAgent(""); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar risco"),
  });
  const remove = useMutation({
    mutationFn: (riskId: string) => api.del("/seguranca/clients/" + clientId + "/inventory", { companyId, riskId }),
    onSuccess: () => { toast.success("Risco removido"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover risco"),
  });

  const byGes = useMemo(() => {
    const map = new Map<string, RiskRow[]>();
    for (const r of risks.data?.risks ?? []) {
      const list = map.get(r.ges_id) ?? [];
      list.push(r);
      map.set(r.ges_id, list);
    }
    return map;
  }, [risks.data]);

  const agentName = (code: string) => catalog.data?.agents.find((a) => a.code === code)?.agent ?? code;

  const openEdit = (r: RiskRow) => {
    setEditing(r);
    setForm({
      frequency: r.frequency,
      severity: String(r.severity),
      effects: r.effects,
      existing_measures: r.existing_measures,
      proposed_measures: r.proposed_measures,
      record_control: r.record_control,
      nr_codes: r.nr_codes,
    });
  };

  const classification = isFrequency(form.frequency) && isSeverity(Number(form.severity))
    ? classifyRisk(form.frequency as RiskFrequency, Number(form.severity) as 1 | 2 | 3 | 4 | 5)
    : null;

  const missingAgents = (g: GesRow) => {
    const existing = new Set((byGes.get(g.id) ?? []).map((r) => r.agent_code));
    return g.agent_codes.filter((c) => !existing.has(c));
  };

  return (
    <div className="space-y-4">
      {ges.isLoading || risks.isLoading ? (
        <Skeleton className="h-32 rounded-[10px]" />
      ) : ges.data?.ges.length === 0 ? (
        <Card className="rounded-[10px] p-8 text-center">
          <p className="text-sm font-semibold">Gere os GES antes da matriz</p>
          <p className="mt-1 text-xs text-muted-foreground">A matriz de risco é construída por GES — use a aba "GES" primeiro.</p>
        </Card>
      ) : (
        ges.data?.ges.map((g) => {
          const rows = byGes.get(g.id) ?? [];
          const missing = missingAgents(g);
          return (
            <Card key={g.id} className="rounded-[10px] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.code}</p>
                  <h4 className="font-display text-sm font-bold">{g.name}</h4>
                </div>
                {missing.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => { setAddingFor(g); setNewAgent(missing[0]); }}>
                    <Plus className="h-4 w-4" /> Adicionar risco ({missing.length})
                  </Button>
                )}
              </div>

              <div className="mt-3 space-y-2">
                {rows.length === 0 && missing.length === 0 && (
                  <p className="text-xs text-muted-foreground">Este GES não possui agentes de risco vinculados.</p>
                )}
                {rows.map((r) => {
                  const level = riskLevel(r.classification as Parameters<typeof riskLevel>[0]);
                  return (
                    <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/60 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{r.agent ?? r.agent_code}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {r.frequency} · {SEVERITY_LABELS[r.severity as 1 | 2 | 3 | 4 | 5]} · {r.nr_codes.length > 0 ? r.nr_codes.join(", ") : "sem NR vinculada"}
                        </p>
                      </div>
                      <Badge className={"border text-xs " + (LEVEL_CHIP[level] ?? "border-border")}>{r.classification}</Badge>
                      <Button size="sm" variant="ghost" aria-label="Editar risco" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive" aria-label="Remover risco" onClick={() => remove.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })
      )}

      {/* Dialog editar/adicionar risco */}
      <Dialog
        open={editing !== null || addingFor !== null}
        onOpenChange={(open) => { if (!open) { setEditing(null); setAddingFor(null); } }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar risco" : "Adicionar risco"} — {editing?.ges_name ?? addingFor?.name}</DialogTitle>
            <DialogDescription>Classificação sempre calculada pelo motor 5×5 (nunca digitada).</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div>
              <Label className="text-xs">Agente de risco</Label>
              {editing ? (
                <p className="mt-1 text-sm font-semibold">{editing.agent ?? editing.agent_code} <span className="text-xs font-normal text-muted-foreground">({editing.agent_code})</span></p>
              ) : (
                <Select value={newAgent} onValueChange={setNewAgent}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o agente" /></SelectTrigger>
                  <SelectContent>
                    {addingFor?.agent_codes.map((c) => (
                      <SelectItem key={c} value={c}>{agentName(c)} ({c})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="risk-freq" className="text-xs">Frequência (probabilidade)</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm((f) => ({ ...f, frequency: v }))}>
                  <SelectTrigger id="risk-freq" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((fq) => (
                      <SelectItem key={fq} value={fq}>{fq} — {FREQUENCY_LABELS[fq]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="risk-sev" className="text-xs">Severidade</Label>
                <Select value={form.severity} onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}>
                  <SelectTrigger id="risk-sev" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((s) => (
                      <SelectItem key={s} value={String(s)}>{s} — {SEVERITY_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {classification && (
              <div className={"rounded-lg border px-3 py-2 text-sm font-semibold " + (LEVEL_CHIP[riskLevel(classification)] ?? "border-border")}>
                Classificação: {classification}
              </div>
            )}

            <div>
              <Label htmlFor="risk-effects" className="text-xs">Efeitos à saúde</Label>
              <Textarea id="risk-effects" className="mt-1" rows={2} value={form.effects} onChange={(e) => setForm((f) => ({ ...f, effects: e.target.value }))} placeholder="Ex.: Perda auditiva" />
            </div>
            <div>
              <Label htmlFor="risk-existing" className="text-xs">Medidas de proteção existentes</Label>
              <Textarea id="risk-existing" className="mt-1" rows={2} value={form.existing_measures} onChange={(e) => setForm((f) => ({ ...f, existing_measures: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="risk-proposed" className="text-xs">Medidas de proteção propostas</Label>
              <Textarea id="risk-proposed" className="mt-1" rows={2} value={form.proposed_measures} onChange={(e) => setForm((f) => ({ ...f, proposed_measures: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="risk-record" className="text-xs">Forma de registro e controle</Label>
              <Textarea id="risk-record" className="mt-1" rows={2} value={form.record_control} onChange={(e) => setForm((f) => ({ ...f, record_control: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">NRs aplicáveis</Label>
              <div className="mt-1.5 max-h-36 overflow-y-auto rounded-lg border border-border p-2">
                {catalog.data?.nrs.map((n) => {
                  const checked = form.nr_codes.includes(n.code);
                  return (
                    <label key={n.code} className="flex cursor-pointer items-center gap-2 rounded p-1 text-xs hover:bg-background/60">
                      <input type="checkbox" className="h-3.5 w-3.5 rounded accent-[#1f3d9d]" checked={checked} onChange={() => {
                        setForm((f) => ({
                          ...f,
                          nr_codes: checked ? f.nr_codes.filter((c) => c !== n.code) : [...f.nr_codes, n.code],
                        }));
                      }} />
                      <span className="font-semibold">{n.code}</span>
                      <span className="truncate text-muted-foreground">{n.title}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditing(null); setAddingFor(null); }}>Cancelar</Button>
            <Button onClick={() => save.mutate(editing?.id ?? null)} disabled={save.isPending || (!editing && !newAgent)}>
              Salvar risco
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
