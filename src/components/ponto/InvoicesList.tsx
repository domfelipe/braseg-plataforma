import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { generateInvoiceHtml } from "@/lib/invoiceHtml";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Copy, Eye, FileText, MessageCircle, Search, XCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { InvoiceViewModal } from "./InvoiceViewModal";
import type { Tables } from "@/integrations/supabase/types";

type Invoice = Tables<"clock_invoices">;

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "outline" },
  emitida: { label: "Emitida", variant: "default" },
  cancelada: { label: "Cancelada", variant: "destructive" },
};

const sanitizePhone = (phone: string) =>
  phone.replace(/[^\d]/g, "");

export function InvoicesList() {
  const { selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [whatsappInvoice, setWhatsappInvoice] = useState<Invoice | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState("");

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["clock-invoices", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data } = await supabase
        .from("clock_invoices")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!selectedCompany?.id,
  });

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleCancel = async () => {
    if (!cancelId) return;
    const { error } = await supabase
      .from("clock_invoices")
      .update({ status: "cancelada" })
      .eq("id", cancelId);
    if (error) {
      toast.error("Erro ao cancelar: " + error.message);
    } else {
      toast.success("NF cancelada.");
      queryClient.invalidateQueries({ queryKey: ["clock-invoices"] });
    }
    setCancelId(null);
  };

  const buildWhatsAppUrl = (pdfUrl?: string) => {
    if (!whatsappInvoice) return "";
    const cleanPhone = sanitizePhone(whatsappPhone);
    const phoneWithCountry = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
    const inv = whatsappInvoice;
    let msg =
      `📄 *Nota Fiscal*\n` +
      `Profissional: ${inv.professional_name}\n` +
      `Período: ${format(new Date(inv.period_from + "T12:00:00"), "dd/MM/yy")} a ${format(new Date(inv.period_to + "T12:00:00"), "dd/MM/yy")}\n` +
      `Horas: ${Number(inv.total_hours).toFixed(1)}h\n` +
      `Valor Bruto: ${fmt(Number(inv.total_amount))}\n` +
      `Valor Líquido: ${fmt(Number(inv.net_amount))}`;
    if (pdfUrl) {
      msg += `\n\n📎 Ver NF completa:\n${pdfUrl}`;
    }
    const text = encodeURIComponent(msg);
    return cleanPhone ? `https://wa.me/${phoneWithCountry}?text=${text}` : "";
  };

  const uploadInvoiceHtml = async (inv: Invoice): Promise<string | undefined> => {
    try {
      const html = generateInvoiceHtml(inv);
      const blob = new Blob([html], { type: "text/html" });
      const path = `${inv.company_id}/nf-html/${inv.id}.html`;
      const { error } = await supabase.storage
        .from("invoices")
        .upload(path, blob, { contentType: "text/html", upsert: true });
      if (error) {
        console.error("Upload error:", error);
        return undefined;
      }
      const { data } = supabase.storage.from("invoices").getPublicUrl(path);
      return data?.publicUrl;
    } catch (e) {
      console.error("Failed to upload invoice HTML:", e);
      return undefined;
    }
  };

  const validatePhone = () => {
    const cleanPhone = sanitizePhone(whatsappPhone);
    if (cleanPhone.length < 10 || cleanPhone.length > 13) {
      toast.error("Informe um número de WhatsApp válido (com DDD).");
      return false;
    }
    return true;
  };


  const [sending, setSending] = useState(false);

  const handleSendWhatsApp = async () => {
    if (!whatsappInvoice || !validatePhone()) return;
    setSending(true);
    const pdfUrl = await uploadInvoiceHtml(whatsappInvoice);
    const url = buildWhatsAppUrl(pdfUrl);
    setSending(false);
    if (!url) {
      toast.error("Não foi possível gerar o link do WhatsApp.");
      return;
    }
    const inv = whatsappInvoice;
    setWhatsappInvoice(null);
    setWhatsappPhone("");

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const handleCopyWhatsAppLink = async () => {
    if (!whatsappInvoice || !validatePhone()) return;
    setSending(true);
    const pdfUrl = await uploadInvoiceHtml(whatsappInvoice);
    const url = buildWhatsAppUrl(pdfUrl);
    setSending(false);
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Link copiado! Cole no navegador para abrir o WhatsApp.");
      setWhatsappInvoice(null);
      setWhatsappPhone("");
    }).catch(() => {
      toast.error("Não foi possível copiar o link.");
    });
  };

  const filtered = invoices?.filter(
    (inv) =>
      !search ||
      inv.professional_name.toLowerCase().includes(search.toLowerCase()) ||
      inv.professional_cpf_cnpj?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Notas Fiscais Geradas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por profissional..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !filtered?.length ? (
          <p className="text-sm text-muted-foreground">Nenhuma nota fiscal encontrada.</p>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Horas</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Líquido</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => {
                  const cfg = statusConfig[inv.status] || statusConfig.rascunho;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.professional_name}</TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(inv.period_from + "T12:00:00"), "dd/MM/yy", { locale: ptBR })} –{" "}
                        {format(new Date(inv.period_to + "T12:00:00"), "dd/MM/yy", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-right font-mono">{Number(inv.total_hours).toFixed(1)}h</TableCell>
                      <TableCell className="text-right font-mono">{fmt(Number(inv.total_amount))}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(Number(inv.net_amount))}</TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setViewInvoice(inv)}
                            title="Visualizar"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setWhatsappInvoice(inv);
                              setWhatsappPhone("");
                            }}
                            title="Enviar por WhatsApp"
                            className="text-success hover:text-success/80"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                          {inv.status !== "cancelada" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setCancelId(inv.id)}
                              className="text-destructive"
                              title="Cancelar"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Dialog para informar número do WhatsApp */}
        <Dialog
          open={!!whatsappInvoice}
          onOpenChange={(open) => {
            if (!open) {
              setWhatsappInvoice(null);
              setWhatsappPhone("");
            }
          }}
        >
          <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-success" />
                Enviar NF por WhatsApp
              </DialogTitle>
              <DialogDescription>
                Informe o número do profissional{whatsappInvoice ? ` (${whatsappInvoice.professional_name})` : ""} para enviar o resumo da nota fiscal.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 w-full">
              <div className="space-y-1.5 w-full">
                <Label className="text-sm">Número do WhatsApp</Label>
                <Input
                  placeholder="(11) 99999-9999"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="off"
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                  maxLength={20}
                  autoFocus
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Digite com DDD. O código do Brasil (55) será adicionado automaticamente.
                </p>
              </div>
            </div>
            <DialogFooter className="!grid !grid-cols-1 sm:!grid-cols-3 !gap-2">
              <Button variant="outline" onClick={() => setWhatsappInvoice(null)} className="w-full" disabled={sending}>
                Cancelar
              </Button>
              <Button variant="secondary" onClick={handleCopyWhatsAppLink} className="w-full" disabled={sending}>
                <Copy className="h-4 w-4 mr-2" />
                {sending ? "Gerando..." : "Copiar Link"}
              </Button>
              <Button onClick={handleSendWhatsApp} className="w-full bg-success hover:bg-success/90 text-success-foreground" disabled={sending}>
                <MessageCircle className="h-4 w-4 mr-2" />
                {sending ? "Gerando..." : "Enviar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar Nota Fiscal</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja cancelar esta nota fiscal? Essa ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground">
                Cancelar NF
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <InvoiceViewModal
          invoice={viewInvoice}
          open={!!viewInvoice}
          onOpenChange={(open) => !open && setViewInvoice(null)}
        />
      </CardContent>
    </Card>
  );
}
