import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, SkipForward, ChevronLeft, ChevronRight, MapPin, FileText, Download, Zap, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Payment {
  id: string;
  doctor_name: string;
  doctor_company_name: string | null;
  doctor_cnpj: string | null;
  amount: number;
  nf_number: string | null;
  nf_issue_date: string | null;
  location: string | null;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payments: Payment[];
  onRefresh: () => void;
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function PaymentQueueDialog({ open, onOpenChange, payments, onRefresh }: Props) {
  const { toast } = useToast();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [pixSentCount, setPixSentCount] = useState(0);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [bankOpened, setBankOpened] = useState(false);
  const [finished, setFinished] = useState(false);
  const [sendingPix, setSendingPix] = useState(false);

  const total = payments.length;
  const current = payments[currentIndex] ?? null;

  const resetState = useCallback(() => {
    setCurrentIndex(0);
    setProcessedCount(0);
    setSkippedCount(0);
    setPixSentCount(0);
    setCopiedField(null);
    setBankOpened(false);
    setFinished(false);
    setSendingPix(false);
  }, []);

  const handleOpenChange = (v: boolean) => {
    if (!v) resetState();
    onOpenChange(v);
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const advance = () => {
    if (currentIndex + 1 >= total) {
      setFinished(true);
    } else {
      setCurrentIndex((i) => i + 1);
      setCopiedField(null);
    }
  };

  const handleMarkPaid = async () => {
    if (!current) return;
    await supabase
      .from("professional_payments")
      .update({ status: "pagamento_enviado" })
      .eq("id", current.id);

    // Auto-generate receipt
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const session = (await supabase.auth.getSession()).data.session;
      if (session) {
        fetch(`https://${projectId}.supabase.co/functions/v1/generate-receipt`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ payment_id: current.id }),
        }).catch(() => {});
      }
    } catch {}

    setProcessedCount((c) => c + 1);
    advance();
  };

  const handlePayViaPix = async () => {
    if (!current) return;
    const cleanCnpjValue = (current.doctor_cnpj || "").replace(/\D/g, "");
    if (!cleanCnpjValue) {
      toast({ title: "⚠️ Sem CNPJ", description: "Não é possível enviar PIX.", variant: "destructive" });
      return;
    }

    setSendingPix(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("Não autenticado");

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/sicredi-multipag?action=pix-chave`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            paymentId: current.id,
            chavePix: cleanCnpjValue,
            documentoBeneficiario: cleanCnpjValue,
            valorPagamento: Number(current.amount),
            nomeBeneficiario: current.doctor_company_name || current.doctor_name,
            mensagemPix: `NF ${current.nf_number || "S/N"} - ${current.doctor_name}`,
          }),
        }
      );

      const result = await res.json();

      if (result.ok) {
        toast({ title: "✅ PIX enviado!", description: `${current.doctor_name} — ${result.sicrediStatus}` });
        // Auto-generate receipt after successful PIX
        try {
          fetch(`https://${projectId}.supabase.co/functions/v1/generate-receipt`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`,
              "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ payment_id: current.id }),
          }).catch(() => {});
        } catch {}
        setPixSentCount((c) => c + 1);
        advance();
      } else {
        toast({ title: "❌ Erro PIX", description: result.error || "Tente novamente", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro ao enviar PIX", description: err.message, variant: "destructive" });
    } finally {
      setSendingPix(false);
    }
  };

  const handleSkip = () => {
    setSkippedCount((c) => c + 1);
    advance();
  };

  const handleOpenBank = () => {
    if (!bankOpened) {
      window.open("https://ibpj.sicredi.com.br/ib-view/loginpj/preauth.html", "_blank");
      setBankOpened(true);
    }
  };

  const cleanCnpj = (cnpj: string) => cnpj.replace(/\D/g, "");
  const rawAmount = (amount: number) => amount.toFixed(2);

  const handleExportCsv = () => {
    const header = "CNPJ;Valor;Nome;Empresa;NF;Local";
    const rows = payments.map((p) =>
      [
        p.doctor_cnpj ? cleanCnpj(p.doctor_cnpj) : "",
        Number(p.amount).toFixed(2),
        p.doctor_name,
        p.doctor_company_name || "",
        p.nf_number || "",
        p.location || "",
      ].join(";")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pagamentos-pix-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exportado com sucesso!" });
  };

  if (total === 0) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg sm:max-w-xl max-h-[95vh] overflow-y-auto p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center justify-between">
            <span>Fila de Pagamentos PIX</span>
            <Button variant="outline" size="sm" onClick={handleExportCsv} className="text-xs">
              <Download className="h-3.5 w-3.5 mr-1" />
              Exportar CSV
            </Button>
          </DialogTitle>
        </DialogHeader>

        {finished ? (
          <div className="p-6 space-y-6 text-center">
            <div className="text-5xl">🎉</div>
            <h3 className="text-xl font-semibold">Fila concluída!</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-4">
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{pixSentCount}</p>
                <p className="text-sm text-muted-foreground">PIX Enviados</p>
              </div>
              <div className="rounded-lg bg-success/10 border border-success/20 p-4">
                <p className="text-3xl font-bold text-success">{processedCount}</p>
                <p className="text-sm text-muted-foreground">Manual</p>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <p className="text-3xl font-bold">{skippedCount}</p>
                <p className="text-sm text-muted-foreground">Pulados</p>
              </div>
            </div>
            <Button onClick={() => { handleOpenChange(false); onRefresh(); }} className="w-full">
              Fechar
            </Button>
          </div>
        ) : current ? (
          <div className="p-6 pt-4 space-y-5">
            {/* Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{currentIndex + 1} de {total}</span>
                <span>{pixSentCount} PIX · {processedCount} manual · {skippedCount} pulados</span>
              </div>
              <Progress value={((currentIndex + 1) / total) * 100} className="h-2" />
            </div>

            {/* Professional info */}
            <div className="rounded-lg border bg-card p-4 space-y-1">
              <p className="text-lg font-semibold">{current.doctor_name}</p>
              {current.doctor_company_name && (
                <p className="text-sm text-muted-foreground">{current.doctor_company_name}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                {current.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {current.location}
                  </span>
                )}
                {current.nf_number && (
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    NF {current.nf_number}
                  </span>
                )}
              </div>
            </div>

            {/* Copy buttons */}
            <div className="grid grid-cols-1 gap-3">
              {/* CNPJ */}
              <button
                onClick={() => current.doctor_cnpj && copyToClipboard(cleanCnpj(current.doctor_cnpj), "cnpj")}
                disabled={!current.doctor_cnpj}
                className="flex items-center justify-between rounded-lg border-2 border-dashed p-4 transition-all hover:border-primary hover:bg-primary/5 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="text-left">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Chave PIX (CNPJ)</p>
                  <p className="text-xl font-mono font-bold mt-1 tracking-wider">
                    {current.doctor_cnpj ? cleanCnpj(current.doctor_cnpj) : "Sem CNPJ"}
                  </p>
                </div>
                <div className="flex-shrink-0 ml-3">
                  {copiedField === "cnpj" ? (
                    <Badge variant="outline" className="bg-success/15 text-success border-success/30 text-xs">
                      <Check className="h-3 w-3 mr-1" /> Copiado!
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      <Copy className="h-3 w-3 mr-1" /> Copiar
                    </Badge>
                  )}
                </div>
              </button>

              {/* Valor */}
              <button
                onClick={() => copyToClipboard(rawAmount(Number(current.amount)), "valor")}
                className="flex items-center justify-between rounded-lg border-2 border-dashed p-4 transition-all hover:border-primary hover:bg-primary/5 active:scale-[0.98]"
              >
                <div className="text-left">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Valor</p>
                  <p className="text-2xl font-bold mt-1 tabular-nums">
                    {formatCurrency(Number(current.amount))}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    Copia: {rawAmount(Number(current.amount))}
                  </p>
                </div>
                <div className="flex-shrink-0 ml-3">
                  {copiedField === "valor" ? (
                    <Badge variant="outline" className="bg-success/15 text-success border-success/30 text-xs">
                      <Check className="h-3 w-3 mr-1" /> Copiado!
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      <Copy className="h-3 w-3 mr-1" /> Copiar
                    </Badge>
                  )}
                </div>
              </button>
            </div>

            {/* PIX Automático button */}
            {current.doctor_cnpj && (
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handlePayViaPix}
                disabled={sendingPix}
              >
                {sendingPix ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                {sendingPix ? "Enviando PIX..." : "⚡ Pagar via PIX Automático"}
              </Button>
            )}

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t" />
              <span className="text-xs text-muted-foreground">ou manualmente</span>
              <div className="flex-1 border-t" />
            </div>

            {/* Open bank button */}
            {!bankOpened && (
              <Button variant="outline" className="w-full" onClick={handleOpenBank}>
                🏦 Abrir Internet Banking (Sicredi)
              </Button>
            )}
            {bankOpened && (
              <p className="text-xs text-center text-muted-foreground">
                Internet banking aberto em outra aba. Copie os dados acima e cole lá.
              </p>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleSkip}
              >
                <SkipForward className="h-4 w-4 mr-1" />
                Pular
              </Button>
              <Button
                className="flex-1 bg-success hover:bg-success/90 text-white"
                onClick={handleMarkPaid}
              >
                <Check className="h-4 w-4 mr-1" />
                Pago Manual ✓
              </Button>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-center gap-2 pt-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={currentIndex === 0}
                onClick={() => { setCurrentIndex((i) => i - 1); setCopiedField(null); }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">Navegar</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={currentIndex >= total - 1}
                onClick={() => { setCurrentIndex((i) => i + 1); setCopiedField(null); }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
