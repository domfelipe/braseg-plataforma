import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ClipboardList, ChevronDown, ChevronUp, Trash2, Pencil, ArrowUp, ArrowDown, Loader2, CalendarX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/integrations/api/client";
import { formatLocalDateTime } from "@/lib/utils";
import { ChecklistItem, ChecklistTemplate, ChecklistRow } from "@/lib/checklist";
import { cn } from "@/lib/utils";

interface HistoryRow extends ChecklistRow {
  plate: string;
  brand: string;
  model: string;
}

type TemplateWithItems = ChecklistTemplate & { items: ChecklistItem[] };

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  conforme: { label: "Conforme", className: "bg-success/10 text-success" },
  nao_conforme: { label: "Não conforme", className: "bg-destructive/10 text-destructive" },
};

export function InspecoesTab() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [templates, setTemplates] = useState<TemplateWithItems[]>([]);
  const [todayIds, setTodayIds] = useState<Set<string>>(new Set());
  const [activeVehicles, setActiveVehicles] = useState<{ id: string; plate: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);

  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  // Editor de template
  const [editingTemplate, setEditingTemplate] = useState<ChecklistTemplate | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [tplName, setTplName] = useState("");
  const [tplCategory, setTplCategory] = useState("pre_uso");
  const [newItem, setNewItem] = useState("");
  const [savingTpl, setSavingTpl] = useState(false);

  const companyId = selectedCompany?.id;

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const [ckRes, tplRes, vehRes] = await Promise.all([
      api.get<{ rows: HistoryRow[]; todayIds: string[] }>("/fleet/checklists", { companyId }),
      api.get<TemplateWithItems[]>("/fleet/templates", { companyId }),
      api.get<{ id: string; plate: string; status: string }[]>("/fleet/vehicles", { companyId }),
    ]);

    setRows(ckRes.rows);
    setTemplates(tplRes);
    const actives = vehRes.filter((v) => v.status === "ativo");
    setActiveVehicles(actives);
    setTodayIds(new Set(ckRes.todayIds));
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const missingToday = useMemo(
    () => activeVehicles.filter((v) => !todayIds.has(v.id)),
    [activeVehicles, todayIds]
  );

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const plate = (r.plate || "").toLowerCase();
        const driver = (r.driver_name || "").toLowerCase();
        if (!plate.includes(q) && !driver.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filterStatus, search]);

  const openTemplateEditor = async (tpl: ChecklistTemplate) => {
    setEditingTemplate(tpl);
    setTplName(tpl.name);
    setTplCategory(tpl.category);
    setItems((tpl as unknown as { items?: ChecklistItem[] }).items || []);
    setNewItem("");
  };

  const createTemplate = () => {
    setEditingTemplate(null);
    setTplName("");
    setTplCategory("pre_uso");
    setItems([]);
    setNewItem("");
  };

  const saveTemplate = async () => {
    if (!companyId) return;
    if (tplName.trim().length < 3) {
      toast({ title: "Nome muito curto", description: "Informe um nome com pelo menos 3 caracteres.", variant: "destructive" });
      return;
    }
    if (items.length === 0) {
      toast({ title: "Adicione itens", description: "Um modelo precisa de pelo menos um item.", variant: "destructive" });
      return;
    }
    setSavingTpl(true);

    try {
      if (editingTemplate) {
        await api.patch("/fleet/templates", {
          companyId,
          id: editingTemplate.id,
          name: tplName.trim(),
          category: tplCategory,
          items: items.map((it, i) => ({ id: it.id || undefined, description: it.description, required: true, sort_order: i + 1 })),
        });
      } else {
        await api.post("/fleet/templates", {
          companyId,
          name: tplName.trim(),
          category: tplCategory,
          active: true,
          items: items.map((it, i) => ({ description: it.description, required: true, sort_order: i + 1 })),
        });
      }
      toast({ title: "Modelo salvo!" });
      setEditingTemplate(null);
    } catch (err) {
      toast({ title: "Erro ao salvar modelo", description: err instanceof Error ? err.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setSavingTpl(false);
      load();
    }
  };

  const toggleTemplateActive = async (tpl: ChecklistTemplate) => {
    await api.patch("/fleet/templates", { companyId, id: tpl.id, active: !tpl.active });
    load();
  };

  const deleteTemplate = async (tpl: ChecklistTemplate) => {
    if (rows.some((r) => r.template_id === tpl.id)) {
      toast({ title: "Modelo em uso", description: "Há inspeções registradas com este modelo; desative-o em vez de excluir.", variant: "destructive" });
      return;
    }
    await api.del("/fleet/templates", { companyId, id: tpl.id });
    toast({ title: "Modelo excluído" });
    load();
  };

  const addItem = () => {
    if (newItem.trim().length < 3) return;
    setItems((p) => [...p, { id: "", template_id: editingTemplate?.id || "", description: newItem.trim(), required: true, sort_order: p.length + 1 } as ChecklistItem]);
    setNewItem("");
  };

  const moveItem = (index: number, dir: -1 | 1) => {
    setItems((p) => {
      const next = [...p];
      const target = index + dir;
      if (target < 0 || target >= next.length) return p;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((it, i) => ({ ...it, sort_order: i + 1 }));
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-[10px] bg-muted" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumo do dia */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="rounded-[10px] p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Inspeções hoje</p>
          <p className="font-display mt-1 text-3xl font-bold tabular-nums">{todayIds.size}</p>
        </Card>
        <Card className={cn("rounded-[10px] p-5", missingToday.length > 0 && "border-warning/40")}>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Sem inspeção hoje</p>
          <div className="mt-1 flex items-center gap-3">
            <p className="font-display text-3xl font-bold tabular-nums">{missingToday.length}</p>
            {missingToday.length > 0 && (
              <Badge className="h-5 border-0 bg-warning/15 px-2 text-[11px] font-semibold text-warning-foreground">
                <CalendarX className="mr-1 h-3 w-3" /> atenção
              </Badge>
            )}
          </div>
          {missingToday.length > 0 && (
            <p className="mt-2 truncate text-xs text-muted-foreground">
              {missingToday.map((v) => v.plate).join(" · ")}
            </p>
          )}
        </Card>
      </div>

      {/* Ações e filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button variant="solid" onClick={() => navigate("/frotas/inspecoes/nova")}>
          <Plus className="h-4 w-4" /> Nova inspeção
        </Button>
        <Input placeholder="Buscar por placa ou condutor" value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 sm:max-w-xs" />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-10 w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="conforme">Conforme</SelectItem>
            <SelectItem value="nao_conforme">Não conforme</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Histórico */}
      {filtered.length === 0 ? (
        <Card className="rounded-[10px]">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Nenhuma inspeção encontrada</p>
            <p className="max-w-xs text-xs text-muted-foreground">Registre a primeira inspeção diária do veículo com fotos e assinatura.</p>
            <Button variant="outline" onClick={() => navigate("/frotas/inspecoes/nova")}>Nova inspeção</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const st = STATUS_LABEL[r.status] || { label: r.status, className: "bg-muted text-muted-foreground" };
            const missing = !todayIds.has(r.vehicle_id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => navigate("/frotas/inspecoes/" + r.id)}
                className="flex w-full items-center gap-4 rounded-[10px] border border-border bg-card p-4 text-left transition-all hover:-translate-y-px hover:shadow-[0_4px_16px_rgb(23_35_63/0.08)] focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/[0.07]">
                  <ClipboardList className="h-5 w-5 text-accent" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {r.plate || "Veículo"} <span className="font-normal text-muted-foreground">· {r.brand} {r.model}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.driver_name || "Condutor não informado"} · {formatLocalDateTime(r.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {missing && <Badge className="hidden h-5 border-0 bg-warning/15 px-2 text-[10px] font-semibold text-warning-foreground sm:inline-flex">sem inspeção hoje</Badge>}
                  <Badge className={cn("h-5 border-0 px-2 text-[11px] font-semibold", st.className)}>{st.label}</Badge>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Modelos */}
      <div className="rounded-[10px] border border-border bg-card">
        <button type="button" onClick={() => setShowTemplates((s) => !s)} className="flex w-full items-center justify-between p-4 text-left">
          <span className="font-display text-sm font-bold">Modelos de checklist</span>
          {showTemplates ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {showTemplates && (
          <div className="space-y-2 border-t border-border p-4">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-[10px] border border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-xs capitalize text-muted-foreground">{t.category.replace("_", " ")}</p>
                </div>
                <Switch checked={t.active} onCheckedChange={() => toggleTemplateActive(t)} aria-label={"Ativar " + t.name} />
                <Button variant="ghost" size="icon" onClick={() => openTemplateEditor(t)} aria-label="Editar modelo"><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => deleteTemplate(t)} aria-label="Excluir modelo"><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={createTemplate}><Plus className="h-4 w-4" /> Novo modelo</Button>
          </div>
        )}
      </div>

      {/* Editor de modelo */}
      <Dialog open={editingTemplate !== null} onOpenChange={(o) => !o && setEditingTemplate(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editingTemplate ? "Editar modelo" : "Novo modelo"}</DialogTitle>
            <DialogDescription>Defina o nome e os itens do checklist.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Nome</Label>
              <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Ex.: Inspeção Semanal" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Categoria</Label>
              <Select value={tplCategory} onValueChange={setTplCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre_uso">Pré-uso</SelectItem>
                  <SelectItem value="manutencao">Manutenção</SelectItem>
                  <SelectItem value="vistoria">Vistoria</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Itens ({items.length})</Label>
              {items.map((it, i) => (
                <div key={it.id || "new" + i} className="flex items-center gap-2">
                  <span className="font-display w-5 text-center text-xs font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                  <Input value={it.description} onChange={(e) => setItems((p) => p.map((x, xi) => (xi === i ? { ...x, description: e.target.value } : x)))} />
                  <Button variant="ghost" size="icon" onClick={() => moveItem(i, -1)} disabled={i === 0} aria-label="Subir item"><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1} aria-label="Descer item"><ArrowDown className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setItems((p) => p.filter((_, xi) => xi !== i))} aria-label="Remover item"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Novo item (ex.: Verificar estepe)" onKeyDown={(e) => e.key === "Enter" && addItem()} />
                <Button type="button" variant="outline" onClick={addItem} disabled={newItem.trim().length < 3}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>Cancelar</Button>
            <Button variant="solid" onClick={saveTemplate} disabled={savingTpl}>
              {savingTpl ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}