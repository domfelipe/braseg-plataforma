import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Download } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { generateInvoiceHtml } from "@/lib/invoiceHtml";
import type { Tables } from "@/integrations/supabase/types";

type Invoice = Tables<"clock_invoices">;

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "outline" },
  emitida: { label: "Emitida", variant: "default" },
  cancelada: { label: "Cancelada", variant: "destructive" },
};

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pct = (v: number) => `${Number(v).toFixed(1)}%`;

interface Props {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InvoiceViewModal({ invoice, open, onOpenChange }: Props) {
  if (!invoice) return null;

  const cfg = statusConfig[invoice.status] || statusConfig.rascunho;

  const handleDownloadPDF = () => {
    const html = generateInvoiceHtml(invoice);
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      w.print();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Nota Fiscal
            <Badge variant={cfg.variant}>{cfg.label}</Badge>
          </DialogTitle>
          <DialogDescription>
            Gerada em {format(new Date(invoice.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Profissional */}
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Profissional</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground text-xs">Nome</span><br />{invoice.professional_name}</div>
              <div><span className="text-muted-foreground text-xs">CPF/CNPJ</span><br />{invoice.professional_cpf_cnpj || "—"}</div>
              <div><span className="text-muted-foreground text-xs">Função</span><br />{invoice.professional_role || "—"}</div>
              <div><span className="text-muted-foreground text-xs">Cód. Municipal</span><br />{invoice.municipal_code || "—"}</div>
            </div>
          </div>

          <Separator />

          {/* Período */}
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Período e Serviço</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Período</span><br />
                {format(new Date(invoice.period_from + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })} a{" "}
                {format(new Date(invoice.period_to + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Total de Horas</span><br />
                <span className="font-mono">{Number(invoice.total_hours).toFixed(1)}h</span>
              </div>
            </div>
            {invoice.service_description && (
              <div className="mt-2 text-sm">
                <span className="text-muted-foreground text-xs">Descrição</span><br />
                {invoice.service_description}
              </div>
            )}
          </div>

          <Separator />

          {/* Valores */}
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Valores</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Valor Hora</span>
                <span className="font-mono">{fmt(Number(invoice.hourly_rate))}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Total Bruto ({Number(invoice.total_hours).toFixed(1)}h)</span>
                <span className="font-mono">{fmt(Number(invoice.total_amount))}</span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between text-muted-foreground">
                <span>ISS ({pct(Number(invoice.iss_rate))})</span>
                <span className="font-mono">- {fmt(Number(invoice.iss_amount))}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>INSS ({pct(Number(invoice.inss_rate))})</span>
                <span className="font-mono">- {fmt(Number(invoice.inss_amount))}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>IRRF ({pct(Number(invoice.irrf_rate))})</span>
                <span className="font-mono">- {fmt(Number(invoice.irrf_amount))}</span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between font-bold text-base">
                <span>Valor Líquido</span>
                <span className="font-mono">{fmt(Number(invoice.net_amount))}</span>
              </div>
            </div>
          </div>

          {invoice.notes && (
            <>
              <Separator />
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Observações</h4>
                <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">{invoice.notes}</p>
              </div>
            </>
          )}

          <Button onClick={handleDownloadPDF} className="w-full">
            <Download className="h-4 w-4 mr-2" />
            Baixar PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
