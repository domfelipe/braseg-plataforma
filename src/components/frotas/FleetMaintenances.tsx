import { useState, useEffect } from "react";
import { api } from "@/integrations/api/client";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Wrench, Search, Paperclip, ExternalLink, X } from "lucide-react";
import { format } from "date-fns";

interface Maintenance {
  id: string;
  vehicle_id: string;
  company_id: string;
  type: string;
  description: string;
  date: string;
  mileage_at_service: number | null;
  cost: number;
  vendor: string | null;
  items_replaced: string[];
  attachment_url: string | null;
  notes: string | null;
  created_at: string;
}

interface Vehicle {
  id: string;
  plate: string;
  brand: string;
  model: string;
}

const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function FleetMaintenances() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    vehicle_id: "", type: "corretiva", description: "", date: "",
    mileage_at_service: "", cost: "", vendor: "", items_replaced: "",
    notes: "", existingAttachment: "",
  });

  const companyId = selectedCompany?.id;

  const fetchData = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [mList, vList] = await Promise.all([
        api.get<Maintenance[]>("/fleet/maintenances", { companyId }),
        api.get<Vehicle[]>("/fleet/vehicles", { companyId }),
      ]);
      setMaintenances(mList);
      setVehicles(vList);
    } catch (err) {
      toast({ title: "Erro ao carregar", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [companyId]);

  const handleNew = () => {
    setEditingId(null);
    setForm({ vehicle_id: "", type: "corretiva", description: "", date: "", mileage_at_service: "", cost: "", vendor: "", items_replaced: "", notes: "", existingAttachment: "" });
    setFile(null);
    setDialogOpen(true);
  };

  const handleEdit = (m: Maintenance) => {
    setEditingId(m.id);
    setForm({
      vehicle_id: m.vehicle_id, type: m.type, description: m.description,
      date: m.date, mileage_at_service: m.mileage_at_service?.toString() || "",
      cost: m.cost?.toString() || "", vendor: m.vendor || "",
      items_replaced: (m.items_replaced || []).join(", "), notes: m.notes || "",
      existingAttachment: m.attachment_url || "",
    });
    setFile(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!companyId || !form.vehicle_id || !form.description || !form.date) {
      toast({ title: "Preencha veículo, descrição e data", variant: "destructive" });
      return;
    }
    setSaving(true);

    // Anexos ficam para a v2 (Vercel Blob); campo mantido por compatibilidade
    const attachment_url: string | null = form.existingAttachment || null;

    const items = form.items_replaced.split(",").map(s => s.trim()).filter(Boolean);
    const payload = {
      company_id: companyId, vehicle_id: form.vehicle_id, type: form.type,
      description: form.description, date: form.date,
      mileage_at_service: form.mileage_at_service ? parseInt(form.mileage_at_service) : null,
      cost: form.cost ? parseFloat(form.cost) : 0, vendor: form.vendor || null,
      items_replaced: items, attachment_url, notes: form.notes || null,
    };

    try {
      if (editingId) {
        await api.patch("/fleet/maintenances", { companyId, id: editingId, ...payload });
      } else {
        await api.post("/fleet/maintenances", { companyId, ...payload });
      }
      toast({ title: editingId ? "Manutenção atualizada" : "Manutenção registrada" });
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      toast({ title: "Erro ao salvar", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.del("/fleet/maintenances", { companyId, id: deleteId });
      toast({ title: "Manutenção excluída" });
      fetchData();
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setDeleteId(null);
    }
  };

  const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, v]));
  const filtered = maintenances.filter(m => {
    if (filterVehicle !== "all" && m.vehicle_id !== filterVehicle) return false;
    const v = vehicleMap[m.vehicle_id];
    const txt = `${v?.plate || ""} ${m.description} ${m.vendor || ""}`.toLowerCase();
    return txt.includes(search.toLowerCase());
  });

  const totalCost = filtered.reduce((s, m) => s + (m.cost || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 flex-1">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterVehicle} onValueChange={setFilterVehicle}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Todos os veículos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os veículos</SelectItem>
              {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.plate} - {v.brand} {v.model}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Total: <strong className="text-foreground">{formatCurrency(totalCost)}</strong></span>
          <Button onClick={handleNew}><Plus className="h-4 w-4 mr-2" />Nova Manutenção</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Wrench className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>Nenhuma manutenção encontrada</p>
        </CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Veículo</TableHead><TableHead>Tipo</TableHead>
              <TableHead>Descrição</TableHead><TableHead>Itens trocados</TableHead>
              <TableHead className="text-right">Custo</TableHead><TableHead className="text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(m => {
                const v = vehicleMap[m.vehicle_id];
                return (
                  <TableRow key={m.id}>
                    <TableCell>{format(new Date(m.date + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="font-medium">{v?.plate || "-"}</TableCell>
                    <TableCell><Badge variant={m.type === "preventiva" ? "default" : "secondary"}>{m.type === "preventiva" ? "Preventiva" : "Corretiva"}</Badge></TableCell>
                    <TableCell className="max-w-[200px] truncate">{m.description}</TableCell>
                    <TableCell className="max-w-[150px]">
                      {m.items_replaced?.length > 0 ? m.items_replaced.join(", ") : "-"}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(m.cost)}</TableCell>
                    <TableCell className="text-right">
                      {m.attachment_url && <Button variant="ghost" size="sm" asChild><a href={m.attachment_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>}
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(m)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(m.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Manutenção" : "Nova Manutenção"}</DialogTitle>
            <DialogDescription>Registre o serviço realizado no veículo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Veículo *</Label>
              <Select value={form.vehicle_id} onValueChange={v => setForm({...form, vehicle_id: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.plate} - {v.brand} {v.model}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Tipo</Label>
                <Select value={form.type} onValueChange={v => setForm({...form, type: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preventiva">Preventiva</SelectItem>
                    <SelectItem value="corretiva">Corretiva</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Data *</Label><Input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
            </div>
            <div><Label>Descrição *</Label><Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Ex: Troca de óleo e filtro" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Custo (R$)</Label><Input type="number" step="0.01" value={form.cost} onChange={e => setForm({...form, cost: e.target.value})} /></div>
              <div><Label>Km no serviço</Label><Input type="number" value={form.mileage_at_service} onChange={e => setForm({...form, mileage_at_service: e.target.value})} /></div>
            </div>
            <div><Label>Fornecedor</Label><Input value={form.vendor} onChange={e => setForm({...form, vendor: e.target.value})} /></div>
            <div><Label>Itens trocados (separados por vírgula)</Label><Input value={form.items_replaced} onChange={e => setForm({...form, items_replaced: e.target.value})} placeholder="Óleo, Filtro de óleo, Filtro de ar" /></div>
            <div>
              <Label>Anexo</Label>
              {form.existingAttachment && !file && (
                <div className="flex items-center gap-2 mb-2 text-sm">
                  <Paperclip className="h-4 w-4" />
                  <a href={form.existingAttachment} target="_blank" rel="noopener noreferrer" className="text-primary underline truncate max-w-[200px]">Arquivo anexado</a>
                  <Button variant="ghost" size="sm" onClick={() => setForm({...form, existingAttachment: ""})}><X className="h-3 w-3" /></Button>
                </div>
              )}
              <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>
            <div><Label>Observações</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir manutenção?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
