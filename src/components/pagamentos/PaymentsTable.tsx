import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, Check, Upload, Pencil, Trash2, Loader2, RefreshCw, Clock, AlertCircle, MapPin, Download, Zap, Search, FileCheck, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ValidationBadge from "@/components/pagamentos/ValidationBadge";

interface Payment {
  id: string;
  doctor_name: string;
  doctor_company_name: string | null;
  doctor_cnpj: string | null;
  amount: number;
  nf_number: string | null;
  nf_issue_date: string | null;
  nf_description: string | null;
  nf_file_url: string | null;
  location: string | null;
  status: string;
  payment_date: string | null;
  receipt_url: string | null;
  error_message: string | null;
  created_at: string;
  sicredi_status?: string | null;
  sicredi_id_transacao?: string | null;
  sicredi_end_to_end?: string | null;
  validation_status?: string | null;
  validation_issues?: string[] | null;
  validation_warnings?: string[] | null;
  validation_data?: any;
}

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  processando_nf: { label: "Processando NF", icon: RefreshCw, color: "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400" },
  aguardando_pagamento: { label: "Aguardando Pagamento", icon: Clock, color: "bg-warning/20 text-warning-foreground border-warning/30" },
  pix_enviado: { label: "PIX Enviado", icon: Zap, color: "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400" },
  pagamento_enviado: { label: "Pagamento Enviado", icon: CreditCard, color: "bg-accent/20 text-accent border-accent/30" },
  pago: { label: "Pago", icon: Check, color: "bg-success/20 text-success border-success/30" },
  pix_erro: { label: "Erro PIX", icon: AlertCircle, color: "bg-destructive/20 text-destructive border-destructive/30" },
  pix_incerto: { label: "⚠️ Verificar Extrato", icon: AlertCircle, color: "bg-amber-500/25 text-amber-700 border-amber-500/40 dark:text-amber-300 font-semibold" },
  erro: { label: "Erro", icon: AlertCircle, color: "bg-destructive/20 text-destructive border-destructive/30" },
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface Props {
  payments: Payment[];
  onEdit: (payment: Payment) => void;
  onDelete: (payment: Payment) => void;
  onPayViaBank: (payment: Payment) => void;
  onConfirmPayment: (payment: Payment) => void;
  onPayViaPix?: (payment: Payment) => void;
  onCheckPixStatus?: (payment: Payment) => void;
  pixSending?: string | null;
  onSendWhatsApp?: (doctorName: string, message: string, payment?: Payment) => void;
}

export default function PaymentsTable({ payments, onEdit, onDelete, onPayViaBank, onConfirmPayment, onPayViaPix, onCheckPixStatus, pixSending, onSendWhatsApp }: Props) {
  const { toast } = useToast();

  const handleDownload = async (fileUrl: string) => {
    try {
      let storagePath = fileUrl;
      const bucketPart = "/storage/v1/object/public/invoices/";
      if (storagePath.includes(bucketPart)) {
        storagePath = decodeURIComponent(storagePath.split(bucketPart)[1]);
      }
      const { data, error } = await supabase.storage.from("invoices").createSignedUrl(storagePath, 300);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch {
      toast({ title: "Erro ao abrir arquivo", variant: "destructive" });
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Profissional</TableHead>
            <TableHead>CNPJ</TableHead>
            <TableHead>Local</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>NF</TableHead>
            <TableHead>Emissão</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Pagamento</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment) => {
            const cfg = statusConfig[payment.status];
            const StatusIcon = cfg?.icon || Clock;
            const isProcessing = payment.status === "processando_nf";
            const isSendingPix = pixSending === payment.id;

            return (
              <TableRow key={payment.id}>
                <TableCell>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{payment.doctor_name}</p>
                    {payment.doctor_company_name && (
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{payment.doctor_company_name}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">{payment.doctor_cnpj || "-"}</TableCell>
                <TableCell>
                  {payment.location ? (
                    <span className="text-xs flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      {payment.location}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {isProcessing && payment.amount === 0 ? (
                    <span className="text-muted-foreground text-xs">Extraindo...</span>
                  ) : (
                    formatCurrency(Number(payment.amount))
                  )}
                </TableCell>
                <TableCell className="text-xs">{payment.nf_number || "-"}</TableCell>
                <TableCell className="text-xs">
                  {payment.nf_issue_date
                    ? new Date(payment.nf_issue_date + "T00:00:00").toLocaleDateString("pt-BR")
                    : "-"}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${cfg?.color || ""}`}>
                      {isProcessing ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <StatusIcon className="h-3 w-3 mr-1" />
                      )}
                      {cfg?.label}
                    </Badge>
                    {payment.validation_status && (
                      <ValidationBadge
                        status={payment.validation_status}
                        issues={payment.validation_issues || []}
                        warnings={payment.validation_warnings || []}
                        validationData={payment.validation_data}
                        compact
                      />
                    )}
                    {payment.sicredi_status && (
                      <p className="text-[10px] text-muted-foreground font-mono">
                        Sicredi: {payment.sicredi_status}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  {payment.status === "pago" && payment.payment_date
                    ? new Date(payment.payment_date + "T00:00:00").toLocaleDateString("pt-BR")
                    : "-"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {payment.nf_file_url && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDownload(payment.nf_file_url!)} title="Download NF">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {payment.status === "aguardando_pagamento" && (
                      <>
                        {onPayViaPix && payment.doctor_cnpj && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-blue-600 dark:text-blue-400"
                            onClick={() => onPayViaPix(payment)}
                            disabled={isSendingPix}
                            title="Pagar via PIX Automático"
                          >
                            {isSendingPix ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-accent" onClick={() => onPayViaBank(payment)} title="Pagar via Banking Manual">
                          <CreditCard className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => onConfirmPayment(payment)} title="Marcar como pago">
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {(payment.status === "pix_enviado" || payment.status === "pix_erro" || payment.status === "pix_incerto") && onCheckPixStatus && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600 dark:text-blue-400" onClick={() => onCheckPixStatus(payment)} title="Consultar status PIX">
                        <Search className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {payment.status === "pix_erro" && onPayViaPix && payment.doctor_cnpj && !(payment as any).sicredi_end_to_end && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600 dark:text-blue-400" onClick={() => onPayViaPix(payment)} title="Reenviar PIX">
                        <Zap className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {payment.status === "pagamento_enviado" && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => onConfirmPayment(payment)} title="Confirmar pagamento">
                        <Upload className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {payment.receipt_url && (
                      <>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={() => window.open(payment.receipt_url!, "_blank")} title="Ver comprovante">
                          <FileCheck className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-green-600 dark:text-green-400"
                          onClick={() => {
                            const firstName = payment.doctor_name.split(" ")[0];
                            const msg = `Olá Dra. ${firstName}, seu pagamento foi efetuado por nossa equipe financeira, segue o seu comprovante de recebimento!\n\n${payment.receipt_url}\n\nMuito obrigado!\n\nEquipe Acudir Saúde.`;
                            if (onSendWhatsApp) {
                              onSendWhatsApp(payment.doctor_name, msg, payment);
                            } else {
                              window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
                            }
                          }}
                          title="Enviar comprovante via WhatsApp"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {payment.status !== "processando_nf" && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(payment)} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => onDelete(payment)} title="Excluir">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
