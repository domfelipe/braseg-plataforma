import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { AGENT_GROUP_LABELS, type SegAgent, type SegEmployee, type SegRole, type SegSector } from "@/lib/seguranca/types";

interface Props {
  clientId: string;
  companyId: string;
}

const GROUP_ORDER = ["QUÍMICOS", "FÍSICOS", "BIOLÓGICOS", "OUTROS", "AUSÊNCIA"];

export default function Levantamento({ clientId, companyId }: Props) {
  const qc = useQueryClient();
  const [newSector, setNewSector] = useState("");
  const [newEmployee, setNewEmployee] = useState({ name: "", role_id: "none", sector_id: "none" });
  const [editingRole, setEditingRole] = useState<SegRole | null>(null);
  const [agentSearch, setAgentSearch] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [roleForm, setRoleForm] = useState({ name: "", description: "", sector_id: "none" });

  const sectors = useQuery({
    queryKey: ["seg-sectors", companyId, clientId],
    queryFn: () => api.get<{ sectors: SegSector[] }>("/seguranca/clients/" + clientId + "/sectors", { companyId }),
    enabled: Boolean(clientId && companyId),
  });
  const roles = useQuery({
    queryKey: ["seg-roles", companyId, clientId],
    queryFn: () => api.get<{ roles: SegRole[] }>("/seguranca/clients/" + clientId + "/roles", { companyId }),
    enabled: Boolean(clientId && companyId),
  });
  const employees = useQuery({
    queryKey: ["seg-employees", companyId, clientId],
    queryFn: () => api.get<{ employees: SegEmployee[] }>("/seguranca/clients/" + clientId + "/employees", { companyId }),
    enabled: Boolean(clientId && companyId),
  });
  const catalog = useQuery({
    queryKey: ["seg-catalogs", companyId],
    queryFn: () => api.get<{ agents: SegAgent[] }>("/seguranca/catalogs", { companyId }),
    enabled: Boolean(companyId),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["seg-sectors", companyId, clientId] });
    void qc.invalidateQueries({ queryKey: ["seg-roles", companyId, clientId] });
    void qc.invalidateQueries({ queryKey: ["seg-employees", companyId, clientId] });
    void qc.invalidateQueries({ queryKey: ["seg-client", companyId, clientId] });
  };

  const addSector = useMutation({
    mutationFn: (name: string) => api.post("/seguranca/clients/" + clientId + "/sectors", { companyId, name }),
    onSuccess: () => { toast.success("Setor adicionado"); setNewSector(""); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao adicionar setor"),
  });
  const removeSector = useMutation({
    mutationFn: (sectorId: string) => api.del("/seguranca/clients/" + clientId + "/sectors", { companyId, sectorId }),
    onSuccess: () => { toast.success("Setor removido"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover setor"),
  });
  const addRole = useMutation({
    mutationFn: () =>
      api.post("/seguranca/clients/" + clientId + "/roles", {
        companyId,
        name: roleForm.name,
        description: roleForm.description,
        sector_id: roleForm.sector_id === "none" ? null : roleForm.sector_id,
      }),
    onSuccess: () => { toast.success("Cargo adicionado"); setRoleForm({ name: "", description: "", sector_id: "none" }); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao adicionar cargo"),
  });
  const removeRole = useMutation({
    mutationFn: (roleId: string) => api.del("/seguranca/clients/" + clientId + "/roles", { companyId, roleId }),
    onSuccess: () => { toast.success("Cargo removido"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover cargo"),
  });
  const saveRoleAgents = useMutation({
    mutationFn: () =>
      api.patch("/seguranca/clients/" + clientId + "/roles", {
        companyId,
        roleId: editingRole?.id,
        agent_codes: [...selectedAgents],
      }),
    onSuccess: () => { toast.success("Agentes de risco atualizados"); setEditingRole(null); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar agentes"),
  });
  const addEmployee = useMutation({
    mutationFn: () =>
      api.post("/seguranca/clients/" + clientId + "/employees", {
        companyId,
        name: newEmployee.name,
        role_id: newEmployee.role_id === "none" ? null : newEmployee.role_id,
        sector_id: newEmployee.sector_id === "none" ? null : newEmployee.sector_id,
      }),
    onSuccess: () => { toast.success("Funcionário adicionado"); setNewEmployee({ name: "", role_id: "none", sector_id: "none" }); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao adicionar funcionário"),
  });
  const toggleEmployee = useMutation({
    mutationFn: (emp: SegEmployee) =>
      api.patch("/seguranca/clients/" + clientId + "/employees", { companyId, employeeId: emp.id, active: !emp.active }),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar funcionário"),
  });
  const removeEmployee = useMutation({
    mutationFn: (employeeId: string) => api.del("/seguranca/clients/" + clientId + "/employees", { companyId, employeeId }),
    onSuccess: () => { toast.success("Funcionário removido"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover funcionário"),
  });

  const groupedAgents = useMemo(() => {
    if (!catalog.data) return new Map<string, SegAgent[]>();
    const q = agentSearch.trim().toLowerCase();
    const map = new Map<string, SegAgent[]>();
    for (const grp of GROUP_ORDER) {
      const items = catalog.data.agents.filter(
        (a) => a.grp === grp && (q === "" || a.agent.toLowerCase().includes(q) || a.code.includes(q) || a.subgroup.toLowerCase().includes(q))
      );
      if (items.length > 0) map.set(grp, items);
    }
    return map;
  }, [catalog.data, agentSearch]);

  const openAgents = (role: SegRole) => {
    setEditingRole(role);
    setSelectedAgents(new Set(role.agent_codes));
    setAgentSearch("");
  };

  const loading = sectors.isLoading || roles.isLoading || employees.isLoading;

  return (
    <div className="space-y-6">
      {/* Setores */}
      <Card className="rounded-[10px] p-5">
        <h3 className="font-display text-sm font-bold">Setores</h3>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (newSector.trim()) addSector.mutate(newSector.trim()); }}
        >
          <Input value={newSector} onChange={(e) => setNewSector(e.target.value)} placeholder="Ex.: Produção, Administrativo..." className="max-w-xs" />
          <Button type="submit" size="sm" disabled={!newSector.trim() || addSector.isPending}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {sectors.data?.sectors.map((s) => (
            <Badge key={s.id} variant="secondary" className="gap-1.5 pr-1">
              {s.name}
              <button
                type="button"
                aria-label={"Remover setor " + s.name}
                className="rounded-full p-0.5 hover:bg-foreground/10"
                onClick={() => removeSector.mutate(s.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {sectors.data?.sectors.length === 0 && <p className="text-xs text-muted-foreground">Nenhum setor ainda.</p>}
        </div>
      </Card>

      {/* Cargos + agentes */}
      <Card className="rounded-[10px] p-5">
        <h3 className="font-display text-sm font-bold">Cargos e agentes de risco</h3>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => { e.preventDefault(); if (roleForm.name.trim()) addRole.mutate(); }}
        >
          <div>
            <Label htmlFor="role-name" className="text-xs">Cargo *</Label>
            <Input id="role-name" className="mt-1" value={roleForm.name} onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex.: Serrador" />
          </div>
          <div>
            <Label htmlFor="role-sector" className="text-xs">Setor</Label>
            <Select value={roleForm.sector_id} onValueChange={(v) => setRoleForm((f) => ({ ...f, sector_id: v }))}>
              <SelectTrigger id="role-sector" className="mt-1">
                <SelectValue placeholder="Sem setor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem setor</SelectItem>
                {sectors.data?.sectors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" size="sm" disabled={!roleForm.name.trim() || addRole.isPending}>
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
          {roles.data?.roles.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border bg-background/60 p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.sector_name ?? "Sem setor"} · {r.agent_codes.length} agente(s) de risco
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => openAgents(r)}>
                  Agentes ({r.agent_codes.length})
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" aria-label={"Remover cargo " + r.name} onClick={() => removeRole.mutate(r.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {!loading && roles.data?.roles.length === 0 && <p className="text-xs text-muted-foreground">Nenhum cargo ainda.</p>}
        </div>
      </Card>

      {/* Funcionários */}
      <Card className="rounded-[10px] p-5">
        <h3 className="font-display text-sm font-bold">Funcionários</h3>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
          onSubmit={(e) => { e.preventDefault(); if (newEmployee.name.trim()) addEmployee.mutate(); }}
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
                {roles.data?.roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="emp-sector" className="text-xs">Setor</Label>
            <Select value={newEmployee.sector_id} onValueChange={(v) => setNewEmployee((f) => ({ ...f, sector_id: v }))}>
              <SelectTrigger id="emp-sector" className="mt-1"><SelectValue placeholder="Sem setor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem setor</SelectItem>
                {sectors.data?.sectors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" size="sm" disabled={!newEmployee.name.trim() || addEmployee.isPending}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        </form>

        <div className="mt-4 space-y-2">
          {employees.data?.employees.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border bg-background/60 p-3">
              <div className="min-w-0">
                <p className={"text-sm font-semibold " + (e.active ? "" : "line-through text-muted-foreground")}>{e.name}</p>
                <p className="text-xs text-muted-foreground">
                  {e.role_name ?? "Sem cargo"} · {e.sector_name ?? "Sem setor"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => toggleEmployee.mutate(e)}>
                  {e.active ? "Inativar" : "Ativar"}
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" aria-label={"Remover " + e.name} onClick={() => removeEmployee.mutate(e.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {employees.data?.employees.length === 0 && <p className="text-xs text-muted-foreground">Nenhum funcionário ainda.</p>}
        </div>
      </Card>

      {/* Dialog de agentes por cargo */}
      <Dialog open={editingRole !== null} onOpenChange={(open) => { if (!open) setEditingRole(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Agentes de risco — {editingRole?.name}</DialogTitle>
            <DialogDescription>
              Marque os agentes aos quais o cargo está exposto (catálogo eSocial Tabela 24, S-1.3).
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar agente ou código..."
              value={agentSearch}
              onChange={(e) => setAgentSearch(e.target.value)}
            />
          </div>
          <div className="mt-2 space-y-4">
            {[...groupedAgents.entries()].map(([grp, items]) => (
              <div key={grp}>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{AGENT_GROUP_LABELS[grp] ?? grp}</p>
                <div className="mt-1.5 grid gap-1.5">
                  {items.map((a) => {
                    const checked = selectedAgents.has(a.code);
                    return (
                      <label
                        key={a.code}
                        className={"flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition-colors " + (checked ? "border-primary/50 bg-primary/5" : "border-border hover:bg-background/60")}
                      >
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
            <Button onClick={() => saveRoleAgents.mutate()} disabled={saveRoleAgents.isPending}>
              Salvar {selectedAgents.size} agente(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
