import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Inbox, ExternalLink, Loader2, Save, Trash2 } from "lucide-react";
import { getCompanyLocations } from "@/lib/companyLocations";

interface InboxDoc {
  id: string;
  company_id: string | null;
  document_sha256: string;
  storage_bucket: string;
  storage_path: string;
  original_filename: string | null;
  payer_name: string | null;
  payer_cnpj: string | null;
  extracted_amount: number | null;
  extracted_due_date: string | null;
  extracted_payment_date: string | null;
  extracted_description: string | null;
  reason: string | null;
  status: string;
  conversation_id: number | null;
  created_at: string;
}

interface Draft {
  companyId: string;
  city: string;
  category: string;
  description: string;
  amount: string;
  paymentDate: string;
  busy: boolean;
}

/**
 * Fila de comprovantes recebidos sem empresa identificada (ou sem valor legível).
 * O master atribui empresa/local/categoria e promove para o financeiro de forma
 * idempotente (por hash) através da edge function promote-unassigned-document.
 */
export default function UnassignedDocumentsInbox() {
  const { companies } = useCompany();
  const [docs, setDocs] = useState<InboxDoc[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("financial_unassigned_documents")
      .select("*")
      .in("status", ["needs_review", "assigned"])
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      toast.error("Não foi possível carregar a fila de comprovantes sem empresa");
    }
    const rows = (data ?? []) as InboxDoc[];
    setDocs(rows);
    setDrafts((prev) => {
      const next = { ...prev };
      rows.forEach((d) => {
        if (!next[d.id]) {
          next[d.id] = {
            companyId: d.company_id ?? "",
            city: "",
            category: "",
            description: d.extracted_description ?? "",
            amount: d.extracted_amount ? String(d.extracted_amount) : "",
            paymentDate: d.extracted_payment_date ?? d.extracted_due_date ?? "",
            busy: false,
          };
        }
      });
      return next;
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("unassigned-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "financial_unassigned_documents" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const setDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  const openFile = async (doc: InboxDoc) => {
    const { data, error } = await supabase.storage
      .from(doc.storage_bucket)
      .createSignedUrl(doc.storage_path, 60 * 10);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível abrir o arquivo");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const run = async (doc: InboxDoc, action: "promote" | "discard") => {
    const d = drafts[doc.id];
    setDraft(doc.id, { busy: true });
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const { data, error } = await supabase.functions.invoke("promote-unassigned-document", {
        body:
          action === "discard"
            ? { inbox_id: doc.id, action: "discard" }
            : {
                inbox_id: doc.id,
                action: "promote",
                company_id: d.companyId,
                city: d.city || null,
                category_name: d.category || null,
                description: d.description || null,
                amount: d.amount ? Number(d.amount.replace(/\./g, "").replace(",", ".")) : undefined,
                payment_date: d.paymentDate || null,
              },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (error) throw error;
      const state = (data as { state?: string })?.state;
      if (state === "duplicate") toast.warning("Documento já existia no financeiro (não duplicado)");
      else if (state === "discarded") toast.success("Documento descartado da fila");
      else toast.success("Lançamento criado no financeiro");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao processar documento");
    } finally {
      setDraft(doc.id, { busy: false });
    }
  };

  const pending = useMemo(() => docs.length, [docs]);

  if (!loading && pending === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          Comprovantes sem empresa identificada
        </CardTitle>
        <Badge variant="outline">{pending} na fila</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {docs.map((doc) => {
          const d = drafts[doc.id];
          if (!d) return null;
          const locations = d.companyId ? getCompanyLocations(d.companyId) : [];
          return (
            <div key={doc.id} className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <strong className="truncate max-w-[240px]">
                  {doc.original_filename || doc.document_sha256.slice(0, 12)}
                </strong>
                {doc.payer_name && (
                  <Badge variant="secondary" className="font-normal">
                    Pagador: {doc.payer_name}
                  </Badge>
                )}
                {doc.reason && <span className="text-muted-foreground">{doc.reason}</span>}
                <Button size="sm" variant="ghost" onClick={() => openFile(doc)}>
                  <ExternalLink className="mr-1 h-3 w-3" /> Ver arquivo
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label className="text-xs">Empresa</Label>
                  <Select value={d.companyId} onValueChange={(v) => setDraft(doc.id, { companyId: v, city: "" })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Local (opcional)</Label>
                  <Select value={d.city || "none"} onValueChange={(v) => setDraft(doc.id, { city: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Sem local" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem local</SelectItem>
                      {locations.map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Categoria</Label>
                  <Input value={d.category} onChange={(e) => setDraft(doc.id, { category: e.target.value })} placeholder="Ex: Serviços Contábeis" />
                </div>
                <div className="lg:col-span-2">
                  <Label className="text-xs">Descrição</Label>
                  <Input value={d.description} onChange={(e) => setDraft(doc.id, { description: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Valor</Label>
                    <Input value={d.amount} onChange={(e) => setDraft(doc.id, { amount: e.target.value })} placeholder="0,00" />
                  </div>
                  <div>
                    <Label className="text-xs">Pagamento</Label>
                    <Input type="date" value={d.paymentDate} onChange={(e) => setDraft(doc.id, { paymentDate: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button size="sm" disabled={d.busy || !d.companyId || !d.amount} onClick={() => run(doc, "promote")}>
                  {d.busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                  Lançar no financeiro
                </Button>
                <Button size="sm" variant="outline" disabled={d.busy} onClick={() => run(doc, "discard")}>
                  <Trash2 className="mr-1 h-3 w-3" /> Descartar
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
