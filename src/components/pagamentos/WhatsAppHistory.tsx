import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Loader2, MessageCircle, Search, Trash2, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface HistoryRow {
  id: string;
  company_id: string;
  payment_id: string | null;
  doctor_name: string;
  amount: number | null;
  message_preview: string | null;
  status: string;
  sent_by: string | null;
  sent_at: string;
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  enviado: { label: "Enviado", cls: "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400" },
  confirmado: { label: "Confirmado", cls: "bg-success/20 text-success border-success/30" },
  falhou: { label: "Falhou", cls: "bg-destructive/20 text-destructive border-destructive/30" },
};

const formatCurrency = (v: number | null) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function WhatsAppHistory() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");

  const fetchHistory = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("whatsapp_send_history")
      .select("*")
      .eq("company_id", selectedCompany.id)
      .order("sent_at", { ascending: false })
      .limit(500);
    if (error) {
      toast({ title: "Erro ao carregar histórico", description: error.message, variant: "destructive" });
    } else {
      setRows((data || []) as HistoryRow[]);
    }
    setLoading(false);
  }, [selectedCompany, toast]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "todos" && r.status !== statusFilter) return false;
      if (!q) return true;
      return r.doctor_name.toLowerCase().includes(q);
    });
  }, [rows, search, statusFilter]);

  const updateStatus = async (row: HistoryRow, status: string) => {
    const { error } = await supabase
      .from("whatsapp_send_history")
      .update({ status })
      .eq("id", row.id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } else {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)));
    }
  };

  const removeRow = async (row: HistoryRow) => {
    const { error } = await supabase
      .from("whatsapp_send_history")
      .delete()
      .eq("id", row.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-accent" />
          Histórico de Envios WhatsApp
        </CardTitle>
        <CardDescription>
          Acompanhe os comprovantes enviados, com data, médico e status do envio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 min-w-0">
            <Label>Buscar médico</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome do profissional"
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-full sm:w-48">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="enviado">Enviado</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="falhou">Falhou</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={fetchHistory} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
          </Button>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Médico</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhum envio registrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const cfg = STATUS_LABELS[row.status] || STATUS_LABELS.enviado;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(row.sent_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="font-medium">{row.doctor_name}</TableCell>
                      <TableCell>{formatCurrency(row.amount)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cfg.cls}>
                          {cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.status !== "confirmado" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Marcar como confirmado"
                            onClick={() => updateStatus(row, "confirmado")}
                            className="text-success hover:text-success"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        {row.status !== "falhou" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Marcar como falhou"
                            onClick={() => updateStatus(row, "falhou")}
                            className="text-destructive hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Excluir registro"
                          onClick={() => removeRow(row)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
