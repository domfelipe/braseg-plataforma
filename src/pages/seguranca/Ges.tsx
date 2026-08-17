import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, ChevronDown, Pencil, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { api } from "@/integrations/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { compressImage } from "@/lib/seguranca/photo";
import { AGENT_GROUP_LABELS, type SegAgent, type SegSector } from "@/lib/seguranca/types";

interface GesRow {
  id: string;
  code: string;
  name: string;
  sector_id: string | null;
  sector_name: string | null;
  activities: string;
  agent_codes: string[];
  photo_count: number;
  risk_count: number;
}

interface PhotoRow {
  id: string;
  blob_url: string;
  caption: string;
  created_at: string;
}

interface Props {
  clientId: string;
  companyId: string;
}

const GROUP_ORDER = ["QUÍMICOS", "FÍSICOS", "BIOLÓGICOS", "OUTROS", "AUSÊNCIA"];

export default function Ges({ clientId, companyId }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<GesRow | null>(null);
  const [form, setForm] = useState({ name: "", activities: "", sector_id: "none" });
  const [agentSearch, setAgentSearch] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [photosFor, setPhotosFor] = useState<GesRow | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const ges = useQuery({
    queryKey: ["seg-ges", companyId, clientId],
    queryFn: () => api.get<{ ges: GesRow[] }>("/seguranca/clients/" + clientId + "/ges", { companyId }),
    enabled: Boolean(clientId && companyId),
  });
  const sectors = useQuery({
    queryKey: ["seg-sectors", companyId, clientId],
    queryFn: () => api.get<{ sectors: SegSector[] }>("/seguranca/clients/" + clientId + "/sectors", { companyId }),
    enabled: Boolean(clientId && companyId),
  });
  const catalog = useQuery({
    queryKey: ["seg-catalogs", companyId],
    queryFn: () => api.get<{ agents: SegAgent[] }>("/seguranca/catalogs", { companyId }),
    enabled: Boolean(companyId),
  });
  const photos = useQuery({
    queryKey: ["seg-ges-photos", companyId, photosFor?.id],
    queryFn: () => api.get<{ photos: PhotoRow[] }>("/seguranca/ges/" + photosFor?.id + "/photos", { companyId }),
    enabled: Boolean(photosFor?.id && companyId),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["seg-ges", companyId, clientId] });
    void qc.invalidateQueries({ queryKey: ["seg-client", companyId, clientId] });
  };

  const generate = useMutation({
    mutationFn: () => api.post<{ created: GesRow[] }>("/seguranca/clients/" + clientId + "/ges", { companyId, mode: "auto" }),
    onSuccess: (d) => { toast.success(d.created.length + " GES criado(s) automaticamente"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao gerar GES"),
  });
  const save = useMutation({
    mutationFn: () =>
      api.patch("/seguranca/clients/" + clientId + "/ges", {
        companyId,
        gesId: editing?.id,
        name: form.name,
        activities: form.activities,
        sector_id: form.sector_id === "none" ? null : form.sector_id,
        agent_codes: [...selectedAgents],
      }),
    onSuccess: () => { toast.success("GES atualizado"); setEditing(null); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar GES"),
  });
  const remove = useMutation({
    mutationFn: (gesId: string) => api.del("/seguranca/clients/" + clientId + "/ges", { companyId, gesId }),
    onSuccess: () => { toast.success("GES removido"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover GES"),
  });
  const uploadPhoto = useMutation({
    mutationFn: (dataUrl: string) =>
      api.post("/seguranca/ges/" + photosFor?.id + "/photos", { companyId, data_url: dataUrl, caption: "" }),
    onSuccess: () => { toast.success("Foto adicionada"); void qc.invalidateQueries({ queryKey: ["seg-ges-photos", companyId, photosFor?.id] }); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao enviar foto"),
  });
  const removePhoto = useMutation({
    mutationFn: (photoId: string) => api.del("/seguranca/ges/" + photosFor?.id + "/photos", { companyId, photoId }),
    onSuccess: () => { toast.success("Foto removida"); void qc.invalidateQueries({ queryKey: ["seg-ges-photos", companyId, photosFor?.id] }); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover foto"),
  });

  const groupedAgents = useMemo(() => {
    if (!catalog.data) return new Map<string, SegAgent[]>();
    const q = agentSearch.trim().toLowerCase();
    const map = new Map<string, SegAgent[]>();
    for (const grp of GROUP_ORDER) {
      const items = catalog.data.agents.filter(
        (a) => a.grp === grp && (q === "" || a.agent.toLowerCase().includes(q) || a.code.includes(q))
      );
      if (items.length > 0) map.set(grp, items);
    }
    return map;
  }, [catalog.data, agentSearch]);

  const agentRow = (a: SegAgent) => {
    const checked = selectedAgents.has(a.code);
    return (
      <label
        key={a.code}
        className={"flex cursor-pointer items-center gap-2 rounded-md p-1.5 text-sm " + (checked ? "bg-primary/5" : "hover:bg-background/60")}
      >
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 rounded accent-[#1f3d9d]"
          checked={checked}
          onChange={() => {
            const next = new Set(selectedAgents);
            if (checked) next.delete(a.code);
            else next.add(a.code);
            setSelectedAgents(next);
          }}
        />
        <span className="truncate">{a.agent}</span>
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{a.code}</span>
      </label>
    );
  };

  const openEdit = (g: GesRow) => {
    setEditing(g);
    setForm({ name: g.name, activities: g.activities, sector_id: g.sector_id ?? "none" });
    setSelectedAgents(new Set(g.agent_codes));
    setAgentSearch("");
    setOpenGroups(new Set());
  };

  const onFile = async (file: File) => {
    try {
      const dataUrl = await compressImage(file);
      uploadPhoto.mutate(dataUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao processar foto");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Grupos de Exposição Similar gerados a partir dos cargos do levantamento.
        </p>
        <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
          <Sparkles className="h-4 w-4" /> {generate.isPending ? "Gerando..." : "Gerar GES automaticamente"}
        </Button>
      </div>

      {ges.isLoading && <Skeleton className="h-24 rounded-[10px]" />}
      {ges.data?.ges.length === 0 && !ges.isLoading && (
        <Card className="rounded-[10px] p-8 text-center">
          <p className="text-sm font-semibold">Nenhum GES ainda</p>
          <p className="mt-1 text-xs text-muted-foreground">Clique em "Gerar GES automaticamente" para agrupar os cargos do levantamento.</p>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {ges.data?.ges.map((g) => (
          <Card key={g.id} className="rounded-[10px] p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.code}</p>
                <h4 className="font-display mt-0.5 text-sm font-bold">{g.name}</h4>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{g.activities || "Sem descrição de atividades."}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" aria-label="Editar GES" onClick={() => openEdit(g)}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" aria-label="Remover GES" onClick={() => remove.mutate(g.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="text-xs">{g.agent_codes.length} agente(s)</Badge>
              <Badge variant="secondary" className="text-xs">{g.risk_count} risco(s) na matriz</Badge>
              <Button size="sm" variant="outline" className="h-6 gap-1 text-xs" onClick={() => setPhotosFor(g)}>
                <Camera className="h-3 w-3" /> {g.photo_count} foto(s)
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Editar GES */}
      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
          <DialogHeader className="shrink-0">
            <DialogTitle>Editar {editing?.code}</DialogTitle>
            <DialogDescription>Nome, atividades e agentes de risco do grupo.</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <div>
              <Label htmlFor="ges-name" className="text-xs">Nome</Label>
              <Input id="ges-name" className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="ges-sector" className="text-xs">Setor</Label>
              <Select value={form.sector_id} onValueChange={(v) => setForm((f) => ({ ...f, sector_id: v }))}>
                <SelectTrigger id="ges-sector" className="mt-1"><SelectValue placeholder="Sem setor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem setor</SelectItem>
                  {sectors.data?.sectors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ges-act" className="text-xs">Descrição das atividades</Label>
              <Textarea id="ges-act" className="mt-1" rows={3} value={form.activities} onChange={(e) => setForm((f) => ({ ...f, activities: e.target.value }))} />
            </div>

            <div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Buscar agente..." value={agentSearch} onChange={(e) => setAgentSearch(e.target.value)} />
              </div>

              {agentSearch.trim() !== "" ? (
                <div className="mt-2 space-y-3">
                  {[...groupedAgents.entries()].map(([grp, items]) => (
                    <div key={grp}>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{AGENT_GROUP_LABELS[grp] ?? grp}</p>
                      <div className="mt-1 space-y-0.5">{items.map(agentRow)}</div>
                    </div>
                  ))}
                  {groupedAgents.size === 0 && (
                    <p className="py-6 text-center text-xs text-muted-foreground">Nenhum agente encontrado para a busca.</p>
                  )}
                </div>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {[...groupedAgents.entries()].map(([grp, items]) => {
                    const selectedCount = items.filter((a) => selectedAgents.has(a.code)).length;
                    const open = openGroups.has(grp);
                    return (
                      <Collapsible
                        key={grp}
                        open={open}
                        onOpenChange={(o) =>
                          setOpenGroups((prev) => {
                            const next = new Set(prev);
                            if (o) next.add(grp);
                            else next.delete(grp);
                            return next;
                          })
                        }
                      >
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-left text-xs hover:bg-background/80"
                          >
                            <span className="flex items-center gap-2 font-semibold">
                              <ChevronDown className={"h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform " + (open ? "rotate-180" : "")} />
                              {AGENT_GROUP_LABELS[grp] ?? grp}
                            </span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {selectedCount}/{items.length} selecionados
                            </span>
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-1 space-y-0.5 rounded-lg border border-border p-1.5">{items.map(agentRow)}</div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar {selectedAgents.size} agente(s)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fotos do GES */}
      <Dialog open={photosFor !== null} onOpenChange={(open) => { if (!open) setPhotosFor(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Evidências — {photosFor?.name}</DialogTitle>
            <DialogDescription>Até 5 fotos por GES, comprimidas automaticamente (≤5MB).</DialogDescription>
          </DialogHeader>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }} />
          <div className="grid grid-cols-2 gap-3">
            {photos.data?.photos.map((p) => (
              <div key={p.id} className="relative overflow-hidden rounded-lg border border-border">
                <img src={p.blob_url} alt={"Evidência do GES " + (photosFor?.name ?? "")} className="h-32 w-full object-cover" />
                <button type="button" aria-label="Remover foto" className="absolute right-1.5 top-1.5 rounded-full bg-background/80 p-1 text-destructive" onClick={() => removePhoto.mutate(p.id)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {photos.data && photos.data.photos.length < 5 && (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadPhoto.isPending}
                className="flex h-32 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-primary/40">
                <Plus className="h-5 w-5" />
                {uploadPhoto.isPending ? "Enviando..." : "Adicionar foto"}
              </button>
            )}
          </div>
          {photos.data?.photos.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma foto ainda.</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhotosFor(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
