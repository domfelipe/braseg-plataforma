import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ExternalLink, FileText, History } from "lucide-react";

interface Props {
  transactionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

interface Tx {
  id: string;
  company_id: string;
  description: string;
  amount: number;
  status: string;
  type: string;
  due_date: string;
  payment_date: string | null;
  city: string | null;
  notes: string | null;
  attachment_url: string | null;
  file_hash: string | null;
}

interface AuditRow {
  id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  action: string | null;
  created_at: string;
}

interface SourceDoc {
  id: string;
  source_key: string;
  storage_bucket: string | null;
  storage_path: string | null;
  processing_status: string;
  attachment_status: string;
  original_filename: string | null;
}

export default function TransactionDrawer({ transactionId, open, onOpenChange, onChanged }: Props) {
  const [tx, setTx] = useState<Tx | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [docs, setDocs] = useState<SourceDoc[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!open || !transactionId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setPdfUrl(null);
      try {
        const { data: userRes } = await supabase.auth.getUser();
        if (userRes.user) {
          const { data: r } = await supabase.from("user_roles").select("role")
            .eq("user_id", userRes.user.id).in("role", ["master", "super-admin"]);
          if (!cancelled) setIsAdmin(!!r && r.length > 0);
        }

        const [txRes, auditRes, docsRes] = await Promise.all([
          supabase.from("financial_transactions").select("*").eq("id", transactionId).maybeSingle(),
          supabase.from("financial_backfill_audit").select("id, field, old_value, new_value, reason, action, created_at")
            .eq("transaction_id", transactionId).order("created_at", { ascending: false }).limit(50),
          supabase.from("financial_source_documents").select("id, source_key, storage_bucket, storage_path, processing_status, attachment_status, original_filename")
            .eq("transaction_id", transactionId).limit(20),
        ]);
        if (cancelled) return;
        setTx(txRes.data as any);
        setAudit((auditRes.data as any) ?? []);
        setDocs((docsRes.data as any) ?? []);

        const doc = (docsRes.data as any)?.find((d: SourceDoc) => d.storage_bucket && d.storage_path);
        if (doc?.storage_bucket && doc?.storage_path) {
          const { data: signed } = await supabase.storage.from(doc.storage_bucket).createSignedUrl(doc.storage_path, 600);
          if (!cancelled) setPdfUrl(signed?.signedUrl ?? null);
        } else if ((txRes.data as any)?.attachment_url) {
          setPdfUrl((txRes.data as any).attachment_url);
        }
      } catch (e) {
        toast.error("Erro ao carregar detalhes: " + ((e as Error).message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, transactionId]);

  const handleMarkPaid = async () => {
    if (!transactionId || !payDate) return;
    setBusy(true);
    const { error } = await supabase.rpc("mark_transaction_paid", {
      _transaction_id: transactionId, _payment_date: payDate, _notes: reason || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Transação marcada como paga");
    setReason(""); onChanged?.(); onOpenChange(false);
  };

  const handleReverse = async () => {
    if (!transactionId) return;
    if (!reason.trim()) { toast.error("Informe o motivo da reversão"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("reverse_transaction_payment", {
      _transaction_id: transactionId, _reason: reason,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pagamento revertido para pendente");
    setReason(""); onChanged?.(); onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Detalhes da transação
          </SheetTitle>
        </SheetHeader>

        {loading || !tx ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
          </div>
        ) : (
          <div className="space-y-6 mt-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-muted-foreground text-xs">Descrição</div><div className="font-medium">{tx.description}</div></div>
              <div><div className="text-muted-foreground text-xs">Valor</div><div className="font-medium tabular-nums">R$ {Number(tx.amount).toFixed(2)}</div></div>
              <div><div className="text-muted-foreground text-xs">Status</div><Badge variant="outline">{tx.status}</Badge></div>
              <div><div className="text-muted-foreground text-xs">Cidade</div><div>{tx.city ?? "-"}</div></div>
              <div><div className="text-muted-foreground text-xs">Vencimento</div><div>{new Date(tx.due_date + "T12:00:00").toLocaleDateString("pt-BR")}</div></div>
              <div><div className="text-muted-foreground text-xs">Pagamento</div><div>{tx.payment_date ? new Date(tx.payment_date + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</div></div>
            </div>

            {tx.notes && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Notas</div>
                <div className="text-xs whitespace-pre-wrap bg-muted/30 rounded p-2 max-h-32 overflow-y-auto">{tx.notes}</div>
              </div>
            )}

            {pdfUrl && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs text-muted-foreground">Comprovante</div>
                  <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-xs inline-flex items-center gap-1 text-accent hover:underline">
                    Abrir <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <iframe src={pdfUrl} className="w-full h-72 border rounded" title="Comprovante" />
              </div>
            )}

            {docs.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Documentos-fonte vinculados</div>
                <ul className="text-xs space-y-1">
                  {docs.map(d => (
                    <li key={d.id} className="flex items-center justify-between border rounded px-2 py-1">
                      <span className="truncate">{d.original_filename ?? d.source_key}</span>
                      <Badge variant="outline" className="text-[10px]">{d.processing_status}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isAdmin && (
              <div className="space-y-3 border rounded-lg p-3 bg-muted/20">
                <div className="text-sm font-medium">Ações de conciliação (master/super-admin)</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Data de pagamento</Label>
                    <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Motivo / observação</Label>
                  <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                    placeholder="Obrigatório para reverter; opcional ao marcar como pago" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy || tx.status === "pago"} onClick={handleMarkPaid}>
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Marcar como pago"}
                  </Button>
                  <Button size="sm" variant="destructive" disabled={busy || tx.status !== "pago"} onClick={handleReverse}>
                    Reverter pagamento
                  </Button>
                </div>
              </div>
            )}

            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><History className="h-3 w-3" /> Histórico de auditoria</div>
              {audit.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">Sem alterações registradas.</div>
              ) : (
                <ul className="text-xs space-y-1 max-h-48 overflow-y-auto">
                  {audit.map(a => (
                    <li key={a.id} className="border rounded px-2 py-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{a.action ?? a.field}</span>
                        <span className="text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-BR")}</span>
                      </div>
                      <div className="text-muted-foreground">
                        {a.field}: {a.old_value ?? "∅"} → {a.new_value ?? "∅"}
                      </div>
                      {a.reason && <div className="text-[11px] italic">{a.reason}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
