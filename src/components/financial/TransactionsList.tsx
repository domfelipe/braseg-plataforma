import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Check, X, Loader2, Paperclip, FileText, Trash2, Link, Eye, ArrowUp, ArrowDown, ArrowUpDown, Info } from "lucide-react";
import ReceiptUploadDialog from "./ReceiptUploadDialog";
import TransactionDrawer from "./TransactionDrawer";
import { useToast } from "@/hooks/use-toast";
import { getCompanyLocations } from "@/lib/companyLocations";
import { FinancialFiltersState } from "./FinancialFilters";
import { parseBRLAmount } from "@/lib/money";
import { operationalRefDate } from "@/lib/financialStatus";
import { fetchAllPaged } from "@/lib/financialData";
import { AlertCircle } from "lucide-react";



interface Props {
  companyId: string;
  type: "receita" | "despesa";
  filters?: FinancialFiltersState;
  /** Filtro de origem da ingestão (WhatsApp / importação manual / sistema). */
  origin?: "all" | "whatsapp" | "manual" | "sistema";
}


interface Transaction {
  id: string;
  description: string;
  amount: number;
  due_date: string;
  payment_date: string | null;
  status: string;
  category_id: string | null;
  cost_center: string | null;
  city: string | null;
  notes: string | null;
  recurrence: string | null;
  attachment_url: string | null;
  source_payment_id: string | null;
  created_at: string | null;
}

interface Category {
  id: string;
  name: string;
}

const statusOptions = ["pendente", "pago", "vencido", "cancelado", "processando"];

const statusColors: Record<string, string> = {
  pendente: "bg-warning/20 text-warning-foreground border-warning/30",
  pago: "bg-success/20 text-success border-success/30",
  vencido: "bg-destructive/20 text-destructive border-destructive/30",
  cancelado: "bg-muted text-muted-foreground",
  processando: "bg-accent/20 text-accent border-accent/30",
};

const recurrenceLabels: Record<string, string> = {
  unica: "Única",
  mensal: "Mensal",
  quinzenal: "Quinzenal",
  semanal: "Semanal",
};

export default function TransactionsList({ companyId, type, filters, origin = "all" }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const predefinedLocations = useMemo(() => getCompanyLocations(companyId), [companyId]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [saving, setSaving] = useState(false);
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [file, setFile] = useState<File | null>(null);
  const [existingAttachment, setExistingAttachment] = useState<string | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>("due_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // Form state
  const [form, setForm] = useState({
    description: "",
    amount: "",
    due_date: "",
    category_id: "",
    cost_center: "",
    city: "",
    notes: "",
    recurrence: "unica",
  });

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const fetchData = async () => {
    setLoading(true);
    try {
      setLoadError(null);
      // Paginação determinística: `.limit()` não contorna o cap do PostgREST e
      // podia ocultar linhas em empresas com muitos lançamentos.
      const [tx, cats] = await Promise.all([
        fetchAllPaged<Transaction>(() =>
          supabase
            .from("financial_transactions")
            .select("id, description, amount, due_date, payment_date, status, category_id, cost_center, city, notes, recurrence, attachment_url, source_payment_id, created_at")
            .eq("company_id", companyId)
            .eq("type", type)
            .order("due_date", { ascending: false })
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
        ),
        fetchAllPaged<Category>(() =>
          supabase
            .from("financial_categories")
            .select("id, name")
            .eq("company_id", companyId)
            .eq("type", type)
            .order("id", { ascending: true })
        ),
      ]);
      setTransactions(tx);
      setCategories(cats);
    } catch (e) {
      console.error("Erro ao carregar lançamentos:", e);
      setTransactions([]);
      setCategories([]);
      setLoadError(e instanceof Error ? e.message : "Falha ao carregar lançamentos");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    // Realtime: reage a INSERT / UPDATE / DELETE da própria empresa
    const channel = supabase
      .channel(`financial_transactions_${companyId}_${type}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "financial_transactions",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as any;
          if (!row) return;

          if (payload.eventType === "DELETE") {
            setTransactions((prev) => prev.filter((tx) => tx.id !== row.id));
            return;
          }

          if (row.type !== type) {
            // Mudou de tipo (ex.: despesa -> receita): sai desta lista
            setTransactions((prev) => prev.filter((tx) => tx.id !== row.id));
            return;
          }

          setTransactions((prev) => {
            const exists = prev.some((tx) => tx.id === row.id);
            if (exists) {
              return prev.map((tx) => (tx.id === row.id ? { ...tx, ...row } : tx));
            }
            return [row as Transaction, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, type]);

  /** Abre o comprovante: URLs http vão direto, caminhos do storage são assinados na hora. */
  const openAttachment = async (url: string) => {
    if (/^https?:\/\//i.test(url)) {
      window.open(url, "_blank");
      return;
    }
    const { data } = await supabase.storage.from("receipts").createSignedUrl(url, 60 * 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };


  const resetForm = () => {
    setForm({ description: "", amount: "", due_date: "", category_id: "", cost_center: "", city: "", notes: "", recurrence: "unica" });
    setEditingId(null);
    setFile(null);
    setExistingAttachment(null);
    setRemoveAttachment(false);
  };

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.due_date) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }

    setSaving(true);

    let attachment_url: string | null = existingAttachment;

    // Upload new file if selected
    if (file) {
      const ext = file.name.split(".").pop();
      const filePath = `${companyId}/${type}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("invoices").upload(filePath, file);
      if (uploadError) {
        toast({ title: "Erro ao enviar arquivo", description: uploadError.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("invoices").getPublicUrl(filePath);
      attachment_url = urlData.publicUrl;
    }

    // Remove attachment if requested
    if (removeAttachment && !file) {
      attachment_url = null;
    }

    const parsedAmount = parseBRLAmount(form.amount);
    if (!parsedAmount.ok) {
      toast({ title: "Valor inválido", description: parsedAmount.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    const payload = {
      company_id: companyId,
      type,
      description: form.description,
      amount: parsedAmount.value as number,

      due_date: form.due_date,
      category_id: form.category_id || null,
      cost_center: form.cost_center || null,
      city: form.city || null,
      notes: form.notes || null,
      recurrence: form.recurrence as any,
      created_by: user?.id,
      attachment_url,
    };

    let error;
    if (editingId) {
      const { error: e } = await supabase.from("financial_transactions").update(payload).eq("id", editingId);
      error = e;
    } else {
      const { error: e } = await supabase.from("financial_transactions").insert(payload);
      error = e;
    }

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingId ? "Atualizado!" : "Criado com sucesso!" });
      setDialogOpen(false);
      resetForm();
      fetchData();
    }
    setSaving(false);
  };

  const handleEdit = (tx: Transaction) => {
    setForm({
      description: tx.description,
      amount: String(tx.amount),
      due_date: tx.due_date,
      category_id: tx.category_id || "",
      cost_center: tx.cost_center || "",
      city: tx.city || "",
      notes: tx.notes || "",
      recurrence: tx.recurrence || "unica",
    });
    setEditingId(tx.id);
    setFile(null);
    setExistingAttachment(tx.attachment_url);
    setRemoveAttachment(false);
    setDialogOpen(true);
  };

  const handleMarkPaid = async (id: string) => {
    const now = new Date(); const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    await supabase.from("financial_transactions").update({ status: "pago", payment_date: today }).eq("id", id);
    toast({ title: type === "despesa" ? "Marcado como pago!" : "Baixa realizada!" });
    fetchData();
  };

  const handleCancel = async (id: string) => {
    await supabase.from("financial_transactions").update({ status: "cancelado" }).eq("id", id);
    toast({ title: "Cancelado!" });
    fetchData();
  };

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("financial_transactions").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Transação excluída!" });
      fetchData();
    }
    setDeleteId(null);
  };

  const getCategoryName = (id: string | null) => categories.find((c) => c.id === id)?.name || "-";

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      const matchSearch = tx.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === "all" || tx.status === statusFilter;
      const matchCity = cityFilter === "all" || tx.city === cityFilter;
      if (filters) {
        // Visibilidade operacional: pagas com data de pagamento entram pelo
        // payment_date; pendentes/vencidas e pagas sem payment_date entram pelo
        // due_date para não desaparecerem da lista (não é data de caixa).
        const refDate = operationalRefDate(tx, filters.dateBase);

        if (filters.dateFrom || filters.dateTo) {
          if (!refDate) return false;
          if (filters.dateFrom && refDate < filters.dateFrom) return false;
          if (filters.dateTo && refDate > filters.dateTo) return false;
        }
        if (filters.city !== "all" && tx.city !== filters.city) return false;
        if (filters.categoryId !== "all" && tx.category_id !== filters.categoryId) return false;
      }
      if (origin !== "all") {
        const notes = tx.notes ?? "";
        const isWhatsapp = notes.includes("Mensagem do contato:");
        const isManual = notes.includes("Importacao manual auditada");
        if (origin === "whatsapp" && !isWhatsapp) return false;
        if (origin === "manual" && !isManual) return false;
        if (origin === "sistema" && (isWhatsapp || isManual)) return false;
      }
      return matchSearch && matchStatus && matchCity;
    });
  }, [transactions, searchTerm, statusFilter, cityFilter, filters, origin]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let va: any, vb: any;
      switch (sortColumn) {
        case "description": va = a.description.toLowerCase(); vb = b.description.toLowerCase(); break;
        case "category": va = getCategoryName(a.category_id); vb = getCategoryName(b.category_id); break;
        case "city": va = a.city || ""; vb = b.city || ""; break;
        case "amount": return dir * (Number(a.amount) - Number(b.amount));
        case "due_date": va = a.due_date; vb = b.due_date; break;
        case "status": va = a.status; vb = b.status; break;
        default: va = a.due_date; vb = b.due_date;
      }
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return 0;
    });
    return list;
  }, [filtered, sortColumn, sortDir, categories]);

  const toggleSort = useCallback((col: string) => {
    if (sortColumn === col) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(col);
      setSortDir("asc");
    }
  }, [sortColumn]);

  const SortIcon = ({ col }: { col: string }) => {
    if (sortColumn !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const uniqueCities = [...new Set(transactions.map((tx) => tx.city).filter(Boolean))] as string[];

  const title = type === "despesa" ? "Contas a Pagar" : "Contas a Receber";

  return (
    <Card>
      {loadError && (
        <div className="m-4 mb-0 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex items-start gap-3">
          <AlertCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-destructive">
              Falha ao carregar a lista — o recorte exibido pode estar incompleto.
            </p>
            <p className="text-xs text-muted-foreground break-words">{loadError}</p>
          </div>
          <Button size="sm" variant="outline" onClick={fetchData}>
            Tentar novamente
          </Button>
        </div>
      )}
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex items-center gap-2">
            <ReceiptUploadDialog companyId={companyId} type={type} onSuccess={fetchData} />
            <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-accent hover:bg-accent/90">
                  <Plus className="h-4 w-4 mr-1" />
                  {type === "despesa" ? "Nova Conta a Pagar" : "Nova Conta a Receber"}
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar" : "Nova"} {type === "despesa" ? "Conta a Pagar" : "Conta a Receber"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Descrição *</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Valor *</Label>
                    <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" />
                  </div>
                  <div>
                    <Label>Vencimento *</Label>
                    <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Centro de custo</Label>
                    <Input value={form.cost_center} onChange={(e) => setForm({ ...form, cost_center: e.target.value })} />
                  </div>
                  <div>
                    <Label>Cidade / Local</Label>
                    {predefinedLocations.length > 0 ? (
                      <Select value={form.city || "sem_cidade"} onValueChange={(v) => setForm({ ...form, city: v === "sem_cidade" ? "" : v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione o local" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sem_cidade">Sem local</SelectItem>
                          {predefinedLocations.map((loc) => (
                            <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Ex: São Paulo" />
                    )}
                  </div>
                </div>
                <div>
                  <Label>Recorrência</Label>
                  <Select value={form.recurrence} onValueChange={(v) => setForm({ ...form, recurrence: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(recurrenceLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Observações</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
                </div>
                <div>
                  <Label>Anexo</Label>
                  {(existingAttachment && !removeAttachment && !file) ? (
                    <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <a href={existingAttachment} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline truncate flex-1">
                        Arquivo anexado
                      </a>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setRemoveAttachment(true)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 cursor-pointer w-full border rounded-md px-3 py-2 hover:bg-muted/50 transition-colors">
                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground truncate">
                          {file ? file.name : "Selecionar arquivo..."}
                        </span>
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                          onChange={(e) => {
                            const selected = e.target.files?.[0] || null;
                            if (selected && selected.size > 10 * 1024 * 1024) {
                              toast({ title: "Arquivo muito grande", description: "O tamanho máximo é 10MB.", variant: "destructive" });
                              return;
                            }
                            setFile(selected);
                            setRemoveAttachment(false);
                          }}
                        />
                      </label>
                      {file && (
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => setFile(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <Button onClick={handleSave} className="w-full bg-accent hover:bg-accent/90" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Salvar
                </Button>
              </div>
            </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <Input
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {uniqueCities.length > 0 && (
            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os locais</SelectItem>
                {uniqueCities.sort().map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma transação encontrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors" onClick={() => toggleSort("description")}>
                    <div className="flex items-center">Descrição <SortIcon col="description" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors" onClick={() => toggleSort("category")}>
                    <div className="flex items-center">Categoria <SortIcon col="category" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors" onClick={() => toggleSort("city")}>
                    <div className="flex items-center">Local <SortIcon col="city" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors text-right" onClick={() => toggleSort("amount")}>
                    <div className="flex items-center justify-end">Valor <SortIcon col="amount" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors" onClick={() => toggleSort("due_date")}>
                    <div className="flex items-center">Vencimento <SortIcon col="due_date" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors" onClick={() => toggleSort("status")}>
                    <div className="flex items-center">Status <SortIcon col="status" /></div>
                  </TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        {tx.source_payment_id && (
                          <span title="Sincronizado do módulo de pagamentos"><Link className="h-3.5 w-3.5 text-accent shrink-0" /></span>
                        )}
                        {tx.description}
                      </div>
                    </TableCell>
                    <TableCell>{getCategoryName(tx.category_id)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{tx.city || "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(Number(tx.amount))}</TableCell>
                    <TableCell>{new Date(tx.due_date + "T12:00:00").toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[tx.status] || ""}>
                        {tx.status === "processando" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        {tx.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Detalhes" onClick={() => setDrawerId(tx.id)}>
                          <Info className="h-3.5 w-3.5" />
                        </Button>
                        {tx.attachment_url && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-accent" title="Ver comprovante" onClick={() => openAttachment(tx.attachment_url!)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {!tx.source_payment_id && tx.status !== "processando" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(tx)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {tx.status === "pendente" && !tx.source_payment_id && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-success" onClick={() => handleMarkPaid(tx.id)}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleCancel(tx.id)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {!tx.source_payment_id && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(tx.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir transação</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta transação? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TransactionDrawer transactionId={drawerId} open={!!drawerId} onOpenChange={(o) => { if (!o) setDrawerId(null); }} onChanged={fetchData} />
    </Card>
  );
}
