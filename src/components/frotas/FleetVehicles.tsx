import { useState, useEffect } from "react";
import { api } from "@/integrations/api/client";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Car, Search, LayoutGrid, List } from "lucide-react";
import { format } from "date-fns";

interface Vehicle {
  id: string;
  company_id: string;
  plate: string;
  brand: string;
  model: string;
  year: number | null;
  color: string | null;
  fuel_type: string | null;
  current_mileage: number;
  renavam: string | null;
  chassis: string | null;
  status: string;
  ipva_due_date: string | null;
  licensing_due_date: string | null;
  insurance_due_date: string | null;
  insurance_company: string | null;
  acquisition_date: string | null;
  acquisition_cost: number | null;
  notes: string | null;
  created_at: string;
}

const emptyForm = {
  plate: "", brand: "", model: "", year: "", color: "", fuel_type: "flex",
  current_mileage: "", renavam: "", chassis: "", status: "ativo",
  ipva_due_date: "", licensing_due_date: "", insurance_due_date: "",
  insurance_company: "", acquisition_date: "", acquisition_cost: "", notes: "",
};

export default function FleetVehicles() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [saving, setSaving] = useState(false);
  const [inspectedToday, setInspectedToday] = useState<Set<string>>(new Set());

  const companyId = selectedCompany?.id;

  const fetchVehicles = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const vehicles = await api.get<Vehicle[]>("/fleet/vehicles", { companyId });
      setVehicles(vehicles);
    } catch (err) {
      toast({ title: "Erro ao carregar veículos", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchVehicles(); }, [companyId]);

  // Veículos inspecionados hoje (selo "sem inspeção hoje")
  useEffect(() => {
    if (!companyId) return;
    api
      .get<{ rows: unknown[]; todayIds: string[] }>("/fleet/checklists", { companyId })
      .then((data) => {
        setInspectedToday(new Set(data.todayIds));
      })
      .catch(() => {
        setInspectedToday(new Set());
      });
  }, [companyId]);

  const handleEdit = (v: Vehicle) => {
    setEditingId(v.id);
    setForm({
      plate: v.plate, brand: v.brand, model: v.model,
      year: v.year?.toString() || "", color: v.color || "",
      fuel_type: v.fuel_type || "flex", current_mileage: v.current_mileage?.toString() || "0",
      renavam: v.renavam || "", chassis: v.chassis || "", status: v.status,
      ipva_due_date: v.ipva_due_date || "", licensing_due_date: v.licensing_due_date || "",
      insurance_due_date: v.insurance_due_date || "", insurance_company: v.insurance_company || "",
      acquisition_date: v.acquisition_date || "", acquisition_cost: v.acquisition_cost?.toString() || "",
      notes: v.notes || "",
    });
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!companyId || !form.plate || !form.brand || !form.model) {
      toast({ title: "Preencha placa, marca e modelo", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      company_id: companyId,
      plate: form.plate.toUpperCase(),
      brand: form.brand,
      model: form.model,
      year: form.year ? parseInt(form.year) : null,
      color: form.color || null,
      fuel_type: form.fuel_type || null,
      current_mileage: form.current_mileage ? parseInt(form.current_mileage) : 0,
      renavam: form.renavam || null,
      chassis: form.chassis || null,
      status: form.status,
      ipva_due_date: form.ipva_due_date || null,
      licensing_due_date: form.licensing_due_date || null,
      insurance_due_date: form.insurance_due_date || null,
      insurance_company: form.insurance_company || null,
      acquisition_date: form.acquisition_date || null,
      acquisition_cost: form.acquisition_cost ? parseFloat(form.acquisition_cost) : null,
      notes: form.notes || null,
    };

    try {
      if (editingId) {
        await api.patch("/fleet/vehicles", { companyId, id: editingId, ...payload });
      } else {
        await api.post("/fleet/vehicles", { companyId, ...payload });
      }
      toast({ title: editingId ? "Veículo atualizado" : "Veículo cadastrado" });
      setDialogOpen(false);
      fetchVehicles();
    } catch (err) {
      toast({ title: "Erro ao salvar", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.del("/fleet/vehicles", { companyId, id: deleteId });
    } catch (err) {
      toast({ title: "Erro ao excluir", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
    {
      toast({ title: "Veículo excluído" });
      fetchVehicles();
    }
    setDeleteId(null);
  };

  const filtered = vehicles.filter(v =>
    `${v.plate} ${v.brand} ${v.model}`.toLowerCase().includes(search.toLowerCase())
  );

  const fuelLabels: Record<string, string> = { flex: "Flex", gasolina: "Gasolina", etanol: "Etanol", diesel: "Diesel", eletrico: "Elétrico", gnv: "GNV" };

  const isDateNear = (d: string | null) => {
    if (!d) return false;
    const diff = (new Date(d).getTime() - Date.now()) / 86400000;
    return diff >= 0 && diff <= 30;
  };
  const isDateOverdue = (d: string | null) => {
    if (!d) return false;
    return new Date(d).getTime() < Date.now();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por placa, marca ou modelo..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2">
          <div className="flex border rounded-md">
            <Button variant={viewMode === "cards" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("cards")}><LayoutGrid className="h-4 w-4" /></Button>
            <Button variant={viewMode === "table" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("table")}><List className="h-4 w-4" /></Button>
          </div>
          <Button onClick={handleNew}><Plus className="h-4 w-4 mr-2" />Novo Veículo</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Car className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>Nenhum veículo encontrado</p>
        </CardContent></Card>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(v => (
            <Card key={v.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base font-bold">{v.plate}</CardTitle>
                  <div className="flex items-center gap-1.5">
                    {v.status === "ativo" && !inspectedToday.has(v.id) && (
                      <Badge className="border-0 bg-warning/15 text-[10px] font-semibold text-warning-foreground">sem inspeção hoje</Badge>
                    )}
                    <Badge variant={v.status === "ativo" ? "default" : "secondary"}>{v.status === "ativo" ? "Ativo" : "Inativo"}</Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{v.brand} {v.model} {v.year || ""}</p>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Km atual</span>
                  <span className="font-medium">{v.current_mileage?.toLocaleString("pt-BR")} km</span>
                </div>
                {v.fuel_type && <div className="flex justify-between"><span className="text-muted-foreground">Combustível</span><span>{fuelLabels[v.fuel_type] || v.fuel_type}</span></div>}
                {v.ipva_due_date && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">IPVA</span>
                    <Badge variant={isDateOverdue(v.ipva_due_date) ? "destructive" : isDateNear(v.ipva_due_date) ? "secondary" : "outline"} className="text-xs">
                      {format(new Date(v.ipva_due_date + "T12:00:00"), "dd/MM/yyyy")}
                    </Badge>
                  </div>
                )}
                {v.licensing_due_date && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Licenciamento</span>
                    <Badge variant={isDateOverdue(v.licensing_due_date) ? "destructive" : isDateNear(v.licensing_due_date) ? "secondary" : "outline"} className="text-xs">
                      {format(new Date(v.licensing_due_date + "T12:00:00"), "dd/MM/yyyy")}
                    </Badge>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(v)}><Pencil className="h-3 w-3 mr-1" />Editar</Button>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(v.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Placa</TableHead><TableHead>Veículo</TableHead><TableHead>Ano</TableHead>
              <TableHead>Km</TableHead><TableHead>Status</TableHead><TableHead>IPVA</TableHead><TableHead>Licenciamento</TableHead><TableHead className="text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(v => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.plate}{v.status === "ativo" && !inspectedToday.has(v.id) && <Badge className="ml-2 border-0 bg-warning/15 text-[10px] font-semibold text-warning-foreground">sem inspeção</Badge>}</TableCell>
                  <TableCell>{v.brand} {v.model}</TableCell>
                  <TableCell>{v.year || "-"}</TableCell>
                  <TableCell>{v.current_mileage?.toLocaleString("pt-BR")}</TableCell>
                  <TableCell><Badge variant={v.status === "ativo" ? "default" : "secondary"}>{v.status === "ativo" ? "Ativo" : "Inativo"}</Badge></TableCell>
                  <TableCell>{v.ipva_due_date ? <Badge variant={isDateOverdue(v.ipva_due_date) ? "destructive" : "outline"} className="text-xs">{format(new Date(v.ipva_due_date + "T12:00:00"), "dd/MM/yy")}</Badge> : "-"}</TableCell>
                  <TableCell>{v.licensing_due_date ? <Badge variant={isDateOverdue(v.licensing_due_date) ? "destructive" : "outline"} className="text-xs">{format(new Date(v.licensing_due_date + "T12:00:00"), "dd/MM/yy")}</Badge> : "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(v)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(v.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Dialog de cadastro/edição */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Veículo" : "Novo Veículo"}</DialogTitle>
            <DialogDescription>Preencha os dados do veículo.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label>Placa *</Label><Input value={form.plate} onChange={e => setForm({...form, plate: e.target.value})} placeholder="ABC-1D23" /></div>
            <div><Label>Marca *</Label><Input value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} placeholder="Toyota" /></div>
            <div><Label>Modelo *</Label><Input value={form.model} onChange={e => setForm({...form, model: e.target.value})} placeholder="Corolla" /></div>
            <div><Label>Ano</Label><Input type="number" value={form.year} onChange={e => setForm({...form, year: e.target.value})} /></div>
            <div><Label>Cor</Label><Input value={form.color} onChange={e => setForm({...form, color: e.target.value})} /></div>
            <div><Label>Combustível</Label>
              <Select value={form.fuel_type} onValueChange={v => setForm({...form, fuel_type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="flex">Flex</SelectItem>
                  <SelectItem value="gasolina">Gasolina</SelectItem>
                  <SelectItem value="etanol">Etanol</SelectItem>
                  <SelectItem value="diesel">Diesel</SelectItem>
                  <SelectItem value="eletrico">Elétrico</SelectItem>
                  <SelectItem value="gnv">GNV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Km atual</Label><Input type="number" value={form.current_mileage} onChange={e => setForm({...form, current_mileage: e.target.value})} /></div>
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Renavam</Label><Input value={form.renavam} onChange={e => setForm({...form, renavam: e.target.value})} /></div>
            <div><Label>Chassi</Label><Input value={form.chassis} onChange={e => setForm({...form, chassis: e.target.value})} /></div>
            <div><Label>Vencimento IPVA</Label><Input type="date" value={form.ipva_due_date} onChange={e => setForm({...form, ipva_due_date: e.target.value})} /></div>
            <div><Label>Vencimento Licenciamento</Label><Input type="date" value={form.licensing_due_date} onChange={e => setForm({...form, licensing_due_date: e.target.value})} /></div>
            <div><Label>Vencimento Seguro</Label><Input type="date" value={form.insurance_due_date} onChange={e => setForm({...form, insurance_due_date: e.target.value})} /></div>
            <div><Label>Seguradora</Label><Input value={form.insurance_company} onChange={e => setForm({...form, insurance_company: e.target.value})} /></div>
            <div><Label>Data de Aquisição</Label><Input type="date" value={form.acquisition_date} onChange={e => setForm({...form, acquisition_date: e.target.value})} /></div>
            <div><Label>Valor de Aquisição</Label><Input type="number" step="0.01" value={form.acquisition_cost} onChange={e => setForm({...form, acquisition_cost: e.target.value})} /></div>
            <div className="sm:col-span-2"><Label>Observações</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir veículo?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. Todas as manutenções e vencimentos associados serão excluídos.</AlertDialogDescription>
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