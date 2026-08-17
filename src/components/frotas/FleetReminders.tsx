import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Plus, Pencil, Trash2, Bell, CheckCircle, AlertTriangle, Clock, Search, Paperclip, X, ExternalLink } from "lucide-react";
import { format, differenceInDays } from "date-fns";

interface Reminder {
  id: string;
  vehicle_id: string;
  company_id: string;
  type: string;
  title: string;
  due_date: string;
  status: string;
  cost: number | null;
  paid_date: string | null;
  notes: string | null;
  attachment_url: string | null;
  created_at: string;
}

interface Vehicle { id: string; plate: string; brand: string; model: string; }

const typeLabels: Record<string, string> = {
  ipva: "IPVA", licenciamento: "Licenciamento", seguro: "Seguro",
  revisao: "Revisão", troca_oleo: "Troca de Óleo", troca_pneu: "Troca de Pneu", outro: "Outro",
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pendente: { label: "Pendente", variant: "secondary", icon: Clock },
  pago: { label: "Pago", variant: "default", icon: CheckCircle },
  vencido: { label: "Vencido", variant: "destructive", icon: AlertTriangle },
};

const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function FleetReminders() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    vehicle_id: "", type: "ipva", title: "", due_date: "",
    status: "pendente", cost: "", paid_date: "", notes: "", existingAttachment: "",
  });

  const companyId = selectedCompany?.id;

  const fetchData = async () => {
    if (!companyId) return;
    setLoading(true);
    const [{ data: rData }, { data: vData }] = await Promise.all([
      supabase.from("fleet_reminders").select("*").eq("company_id", companyId).order("due_date"),
      supabase.from("fleet_vehicles").select("id, plate, brand, model").eq("company_id", companyId).order("plate"),
    ]);
    // Auto-mark overdue
    const now = new Date();
    const processed = ((rData as any[]) || []).map(r => {
      if (r.status === "pendente" && new Date(r.due_date) < now) return { ...r, status: "vencido" };
      return r;
    });
    setReminders(processed);
    setVehicles((vData as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [companyId]);

  const handleNew = () => {
    setEditingId(null);
    setForm({ vehicle_id: "", type: "ipva", title: "", due_date: "", status: "pendente", cost: "", paid_date: "", notes: "", existingAttachment: "" });
    setFile(null);
    setDialogOpen(true);
  };

  const handleEdit = (r: Reminder) => {
    setEditingId(r.id);
    setForm({
      vehicle_id: r.vehicle_id, type: r.type, title: r.title, due_date: r.due_date,
      status: r.status, cost: r.cost?.toString() || "", paid_date: r.paid_date || "",
      notes: r.notes || "", existingAttachment: r.attachment_url || "",
    });
    setFile(null);
    setDialogOpen(true);
  };

  const handleMarkPaid = async (r: Reminder) => {
    const now = new Date(); const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    const { error } = await supabase.from("fleet_reminders").update({ status: "pago", paid_date: todayStr }).eq("id", r.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Marcado como pago" }); fetchData(); }
  };

  const handleSave = async () => {
    if (!companyId || !form.vehicle_id || !form.title || !form.due_date) {
      toast({ title: "Preencha veículo, título e data de vencimento", variant: "destructive" });
      return;
    }
    setSaving(true);

    let attachment_url: string | null = form.existingAttachment || null;
    if (file) {
      const ext = file.name.split(".").pop();
      const path = `${companyId}/frotas/reminders/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("invoices").upload(path, file);
      if (upErr) { toast({ title: "Erro no upload", description: upErr.message, variant: "destructive" }); setSaving(false); return; }
      const { data: urlData } = supabase.storage.from("invoices").getPublicUrl(path);
      attachment_url = urlData.publicUrl;
    }

    const payload: any = {
      company_id: companyId, vehicle_id: form.vehicle_id, type: form.type,
      title: form.title, due_date: form.due_date, status: form.status,
      cost: form.cost ? parseFloat(form.cost) : null,
      paid_date: form.paid_date || null, notes: form.notes || null, attachment_url,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("fleet_reminders").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("fleet_reminders").insert(payload));
    }

    if (error) toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    else { toast({ title: editingId ? "Vencimento atualizado" : "Vencimento cadastrado" }); setDialogOpen(false); fetchData(); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("fleet_reminders").delete().eq("id", deleteId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Vencimento excluído" }); fetchData(); }
    setDeleteId(null);
  };

  const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, v]));
  const filtered = reminders.filter(r => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (filterVehicle !== "all" && r.vehicle_id !== filterVehicle) return false;
    const v = vehicleMap[r.vehicle_id];
    return `${v?.plate || ""} ${r.title}`.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 flex-1">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterVehicle} onValueChange={setFilterVehicle}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os veículos</SelectItem>
              {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.plate}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="vencido">Vencido</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleNew}><Plus className="h-4 w-4 mr-2" />Novo Vencimento</Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Bell className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>Nenhum vencimento encontrado</p>
        </CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Vencimento</TableHead><TableHead>Veículo</TableHead><TableHead>Tipo</TableHead>
              <TableHead>Título</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(r => {
                const v = vehicleMap[r.vehicle_id];
                const days = differenceInDays(new Date(r.due_date), new Date());
                const sc = statusConfig[r.status] || statusConfig.pendente;
                const Icon = sc.icon;
                return (
                  <TableRow key={r.id} className={r.status === "vencido" ? "bg-destructive/5" : days <= 7 && r.status === "pendente" ? "bg-yellow-500/5" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{format(new Date(r.due_date + "T12:00:00"), "dd/MM/yyyy")}</span>
                        {r.status === "pendente" && days <= 7 && days >= 0 && (
                          <Badge variant="secondary" className="text-[10px]">{days === 0 ? "Hoje" : `${days}d`}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{v?.plate || "-"}</TableCell>
                    <TableCell>{typeLabels[r.type] || r.type}</TableCell>
                    <TableCell>{r.title}</TableCell>
                    <TableCell><Badge variant={sc.variant}><Icon className="h-3 w-3 mr-1" />{sc.label}</Badge></TableCell>
                    <TableCell className="text-right">{r.cost ? formatCurrency(r.cost) : "-"}</TableCell>
                    <TableCell className="text-right">
                      {r.status !== "pago" && (
                        <Button variant="ghost" size="sm" className="text-green-600" onClick={() => handleMarkPaid(r)} title="Marcar como pago"><CheckCircle className="h-4 w-4" /></Button>
                      )}
                      {r.attachment_url && <Button variant="ghost" size="sm" asChild><a href={r.attachment_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>}
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4" /></Button>
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
            <DialogTitle>{editingId ? "Editar Vencimento" : "Novo Vencimento"}</DialogTitle>
            <DialogDescription>Cadastre um vencimento ou obrigação do veículo.</DialogDescription>
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
                <Select value={form.type} onValueChange={v => setForm({...form, type: v, title: form.title || typeLabels[v] || ""})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(typeLabels).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="vencido">Vencido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Título *</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Ex: IPVA 2026" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Vencimento *</Label><Input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} /></div>
              <div><Label>Valor (R$)</Label><Input type="number" step="0.01" value={form.cost} onChange={e => setForm({...form, cost: e.target.value})} /></div>
            </div>
            {form.status === "pago" && (
              <div><Label>Data do Pagamento</Label><Input type="date" value={form.paid_date} onChange={e => setForm({...form, paid_date: e.target.value})} /></div>
            )}
            <div>
              <Label>Anexo (boleto/comprovante)</Label>
              {form.existingAttachment && !file && (
                <div className="flex items-center gap-2 mb-2 text-sm">
                  <Paperclip className="h-4 w-4" />
                  <a href={form.existingAttachment} target="_blank" rel="noopener noreferrer" className="text-primary underline truncate max-w-[200px]">Arquivo</a>
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
            <AlertDialogTitle>Excluir vencimento?</AlertDialogTitle>
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
