import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, Plus } from "lucide-react";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SignatureCanvas } from "@/components/frotas/checklist/SignatureCanvas";

interface DocRow {
  id: string;
  doc_type: "pgr" | "pgrtr";
  version: string;
  status: string;
  valid_from: string;
  valid_until: string;
  generated_at: string;
  has_pdf: boolean;
  has_docx: boolean;
  pdf_blob_url?: string;
  docx_blob_url?: string;
}

interface Props {
  clientId: string;
  companyId: string;
}

const TYPE_LABEL: Record<DocRow["doc_type"], string> = {
  pgr: "PGR — NR-01 | NR-09",
  pgrtr: "PGRTR — NR-31 (Rural)",
};

export default function Documentos({ clientId, companyId }: Props) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    doc_type: "pgr",
    version: "1",
    valid_from: new Date().toISOString().slice(0, 10),
    status_target: "final",
    consultant_name: profile?.full_name ?? "",
    revision_note: "Emissão inicial",
  });
  const [signature, setSignature] = useState("");

  const list = useQuery({
    queryKey: ["seg-documents", companyId, clientId],
    queryFn: () => api.get<{ documents: DocRow[] }>("/seguranca/documents", { companyId, clientId }),
    enabled: Boolean(clientId && companyId),
  });

  const generate = useMutation({
    mutationFn: () =>
      api.post<{ document: DocRow }>("/seguranca/documents", {
        companyId,
        clientId,
        doc_type: form.doc_type,
        version: form.version,
        valid_from: form.valid_from,
        status_target: form.status_target,
        consultant_name: form.consultant_name,
        revision_note: form.revision_note,
        signature_data_url: signature || null,
      }),
    onSuccess: (d) => {
      toast.success("Documento gerado: " + TYPE_LABEL[d.document.doc_type] + " v" + d.document.version);
      setOpen(false);
      setSignature("");
      void qc.invalidateQueries({ queryKey: ["seg-documents", companyId, clientId] });
      void qc.invalidateQueries({ queryKey: ["seg-client", companyId, clientId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao gerar documento"),
  });

  const needsSignature = form.status_target === "final";

  const fmt = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Geração do documento completo (capa, sumário, 20 seções e anexos) em PDF e DOCX editável.
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Gerar documento
        </Button>
      </div>

      {list.isLoading && <Skeleton className="h-20 rounded-[10px]" />}
      {list.data?.documents.length === 0 && !list.isLoading && (
        <Card className="rounded-[10px] p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">Nenhum documento gerado</p>
          <p className="mt-1 text-xs text-muted-foreground">Complete levantamento, GES, matriz e plano de ação para gerar o primeiro PGR/PGRTR.</p>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {list.data?.documents.map((d) => (
          <Card key={d.id} className="rounded-[10px] p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-display text-sm font-bold">{TYPE_LABEL[d.doc_type]}</h4>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Versão {d.version} · {fmt(d.valid_from)} a {fmt(d.valid_until)} · {fmt(d.generated_at.slice(0, 10))}
                </p>
              </div>
              <Badge className="shrink-0 border text-xs" variant={d.status === "final" ? "secondary" : "outline"}>
                {d.status === "final" ? "Final" : d.status === "gerando" ? "Gerando..." : "Rascunho"}
              </Badge>
            </div>
            <div className="mt-3 flex gap-2">
              {d.has_pdf && d.pdf_blob_url && (
                <Button size="sm" variant="outline" asChild>
                  <a href={d.pdf_blob_url} download={d.doc_type + "-v" + d.version + ".pdf"} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4" /> PDF
                  </a>
                </Button>
              )}
              {d.has_docx && d.docx_blob_url && (
                <Button size="sm" variant="outline" asChild>
                  <a href={d.docx_blob_url} download={d.doc_type + "-v" + d.version + ".docx"} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4" /> DOCX
                  </a>
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSignature(""); }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerar documento</DialogTitle>
            <DialogDescription>
              O documento replica a anatomia completa (capa, sumário, 20 seções e anexos). A geração pode levar alguns segundos.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="doc-type" className="text-xs">Tipo</Label>
                <Select value={form.doc_type} onValueChange={(v) => setForm((f) => ({ ...f, doc_type: v }))}>
                  <SelectTrigger id="doc-type" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pgr">PGR (NR-01 | NR-09)</SelectItem>
                    <SelectItem value="pgrtr">PGRTR (NR-31 Rural)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="doc-version" className="text-xs">Versão</Label>
                <Input id="doc-version" className="mt-1" value={form.version} onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="doc-valid" className="text-xs">Início da vigência</Label>
                <Input id="doc-valid" type="date" className="mt-1" value={form.valid_from} onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="doc-status" className="text-xs">Status</Label>
                <Select value={form.status_target} onValueChange={(v) => setForm((f) => ({ ...f, status_target: v }))}>
                  <SelectTrigger id="doc-status" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="final">Final (com assinatura)</SelectItem>
                    <SelectItem value="rascunho">Rascunho</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="doc-consultant" className="text-xs">Consultor responsável</Label>
              <Input id="doc-consultant" className="mt-1" value={form.consultant_name} onChange={(e) => setForm((f) => ({ ...f, consultant_name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="doc-note" className="text-xs">Descrição da revisão</Label>
              <Textarea id="doc-note" className="mt-1" rows={2} value={form.revision_note} onChange={(e) => setForm((f) => ({ ...f, revision_note: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Assinatura manuscrita{needsSignature ? " *" : " (opcional)"}</Label>
              <div className="mt-1.5 rounded-lg border border-border p-1">
                <SignatureCanvas onChange={setSignature} />
              </div>
              {needsSignature && !signature && <p className="mt-1 text-xs text-destructive">Assinatura obrigatória para a versão final.</p>}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => generate.mutate()}
              disabled={generate.isPending || !form.consultant_name.trim() || !form.version.trim() || (needsSignature && !signature)}
            >
              {generate.isPending ? "Gerando documento..." : "Gerar PGR/PGRTR"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
