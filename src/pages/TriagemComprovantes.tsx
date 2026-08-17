import { useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Upload, Sparkles, FileText, Trash2, Loader2, CheckCircle2, AlertCircle, Save } from "lucide-react";
import { getCompanyLocations } from "@/lib/companyLocations";
import UnassignedDocumentsInbox from "@/components/financial/UnassignedDocumentsInbox";


type ItemStatus = "idle" | "extracting" | "ready" | "saving" | "saved" | "error";

interface TriageItem {
  id: string;
  file: File;
  previewUrl: string | null;
  status: ItemStatus;
  errorMsg?: string;
  // editable fields
  companyId: string;
  city: string;
  description: string;
  amount: string;
  paymentDate: string;
  category: string;
  notes: string;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TriagemComprovantes() {
  const navigate = useNavigate();
  const { companies, selectedCompany } = useCompany();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<TriageItem[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [defaultCompanyId, setDefaultCompanyId] = useState<string>(selectedCompany?.id || "");

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

  const stats = useMemo(() => ({
    total: items.length,
    ready: items.filter((i) => i.status === "ready").length,
    saved: items.filter((i) => i.status === "saved").length,
    pendingCompany: items.filter((i) => !i.companyId).length,
  }), [items]);

  const addFiles = (files: FileList | File[]) => {
    const accepted = Array.from(files).filter((f) =>
      ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(f.type)
    );
    const newItems: TriageItem[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      status: "idle",
      companyId: defaultCompanyId,
      city: "",
      description: "",
      amount: "",
      paymentDate: todayIso(),
      category: "",
      notes: "",
    }));
    setItems((prev) => [...prev, ...newItems]);
  };

  const updateItem = (id: string, patch: Partial<TriageItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const it = prev.find((i) => i.id === id);
      if (it?.previewUrl) URL.revokeObjectURL(it.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const extractOne = async (item: TriageItem) => {
    updateItem(item.id, { status: "extracting", errorMsg: undefined });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada");

      const fd = new FormData();
      fd.append("file", item.file);

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/extract-receipt`,
        { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: fd }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Falha na extração");

      const ex = result.extracted || {};
      updateItem(item.id, {
        status: "ready",
        description: ex.description || item.description || item.file.name,
        amount: ex.amount ? String(ex.amount) : item.amount,
        paymentDate: ex.payment_date || ex.due_date || item.paymentDate,
        category: ex.category_suggestion || item.category,
        notes: ex.notes || item.notes,
      });
    } catch (err) {
      console.error(err);
      updateItem(item.id, {
        status: "error",
        errorMsg: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  };

  const extractAll = async () => {
    setBulkBusy(true);
    const targets = items.filter((i) => i.status === "idle" || i.status === "error");
    // limit concurrency to 3
    const queue = [...targets];
    const workers = Array.from({ length: 3 }, async () => {
      while (queue.length) {
        const next = queue.shift();
        if (next) await extractOne(next);
      }
    });
    await Promise.all(workers);
    setBulkBusy(false);
    toast.success("Extração finalizada");
  };

  const validateItem = (i: TriageItem): string | null => {
    if (!i.companyId) return "Selecione a empresa";
    if (!i.description.trim()) return "Descrição obrigatória";
    const amt = Number(i.amount);
    if (!amt || amt <= 0) return "Valor inválido";
    if (!i.paymentDate) return "Data de pagamento obrigatória";
    return null;
  };

  const saveOne = async (item: TriageItem) => {
    const err = validateItem(item);
    if (err) {
      updateItem(item.id, { status: "error", errorMsg: err });
      return false;
    }
    updateItem(item.id, { status: "saving", errorMsg: undefined });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada");

      const fd = new FormData();
      fd.append("file", item.file);
      fd.append("company_id", item.companyId);
      fd.append("type", "despesa");
      fd.append("status", "pago");
      fd.append("city", item.city || "");
      fd.append("description", item.description);
      fd.append("amount", String(Number(item.amount)));
      fd.append("payment_date", item.paymentDate);
      fd.append("due_date", item.paymentDate);
      if (item.category) fd.append("category_name", item.category);
      if (item.notes) fd.append("notes", item.notes);

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/save-receipt-triaged`,
        { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: fd }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Falha ao salvar");

      updateItem(item.id, { status: "saved" });
      return true;
    } catch (err) {
      console.error(err);
      updateItem(item.id, {
        status: "error",
        errorMsg: err instanceof Error ? err.message : "Erro ao salvar",
      });
      return false;
    }
  };

  const saveAll = async () => {
    setBulkBusy(true);
    const targets = items.filter((i) => i.status !== "saved" && i.status !== "saving");
    let ok = 0, fail = 0;
    for (const it of targets) {
      const success = await saveOne(it);
      if (success) ok++; else fail++;
    }
    setBulkBusy(false);
    if (ok) toast.success(`${ok} comprovante(s) salvos como pagos`);
    if (fail) toast.error(`${fail} com erro — revise os cards em vermelho`);
  };

  const clearSaved = () => {
    setItems((prev) => {
      prev.filter((i) => i.status === "saved").forEach((i) => i.previewUrl && URL.revokeObjectURL(i.previewUrl));
      return prev.filter((i) => i.status !== "saved");
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/financeiro")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Triagem de Comprovantes</h1>
            <p className="text-sm text-muted-foreground">
              Envie vários comprovantes, deixe a IA preencher os dados e classifique empresa/cidade em lote.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Total: {stats.total}</Badge>
          <Badge variant="outline" className="text-emerald-600 border-emerald-600/40">Salvos: {stats.saved}</Badge>
          {stats.pendingCompany > 0 && (
            <Badge variant="outline" className="text-amber-600 border-amber-600/40">
              Sem empresa: {stats.pendingCompany}
            </Badge>
          )}
        </div>
      </div>

      <UnassignedDocumentsInbox />



      <Card className="p-4 space-y-4">
        <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
          <div>
            <Label>Empresa padrão para novos uploads</Label>
            <Select value={defaultCompanyId} onValueChange={setDefaultCompanyId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.trade_name || c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" /> Adicionar arquivos
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
          />
        </div>

        <div
          className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center text-sm text-muted-foreground cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-colors"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files) addFiles(e.dataTransfer.files); }}
        >
          Arraste PDFs/imagens aqui ou clique para selecionar (até 50–300 arquivos)
        </div>

        {items.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={extractAll} disabled={bulkBusy} variant="secondary">
              {bulkBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Extrair com IA (não processados)
            </Button>
            <Button onClick={saveAll} disabled={bulkBusy} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {bulkBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar todos como PAGO
            </Button>
            {stats.saved > 0 && (
              <Button onClick={clearSaved} variant="ghost">
                Remover salvos da lista ({stats.saved})
              </Button>
            )}
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const cities = item.companyId ? getCompanyLocations(item.companyId) : [];
          return (
            <Card
              key={item.id}
              className={`p-4 space-y-3 ${
                item.status === "saved" ? "border-emerald-500/50 bg-emerald-500/5" :
                item.status === "error" ? "border-destructive/50 bg-destructive/5" : ""
              }`}
            >
              <div className="flex gap-3">
                <div className="w-20 h-20 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" title={item.file.name}>{item.file.name}</p>
                  <p className="text-xs text-muted-foreground">{(item.file.size / 1024).toFixed(0)} KB</p>
                  <div className="mt-1 flex items-center gap-1">
                    {item.status === "extracting" && <Badge variant="outline"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Extraindo</Badge>}
                    {item.status === "ready" && <Badge variant="outline" className="text-blue-600 border-blue-600/40">Pronto</Badge>}
                    {item.status === "saving" && <Badge variant="outline"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Salvando</Badge>}
                    {item.status === "saved" && <Badge variant="outline" className="text-emerald-600 border-emerald-600/40"><CheckCircle2 className="h-3 w-3 mr-1" />Salvo</Badge>}
                    {item.status === "error" && <Badge variant="outline" className="text-destructive border-destructive/40"><AlertCircle className="h-3 w-3 mr-1" />Erro</Badge>}
                  </div>
                </div>
                {item.status !== "saved" && (
                  <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>

              {item.errorMsg && (
                <p className="text-xs text-destructive">{item.errorMsg}</p>
              )}

              {item.status !== "saved" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Empresa *</Label>
                      <Select value={item.companyId} onValueChange={(v) => updateItem(item.id, { companyId: v, city: "" })}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {companies.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.trade_name || c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Cidade</Label>
                      {cities.length > 0 ? (
                        <Select value={item.city} onValueChange={(v) => updateItem(item.id, { city: v })}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input className="h-8" value={item.city} onChange={(e) => updateItem(item.id, { city: e.target.value })} />
                      )}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Descrição *</Label>
                    <Input className="h-8" value={item.description} onChange={(e) => updateItem(item.id, { description: e.target.value })} />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Valor (R$) *</Label>
                      <Input className="h-8" type="number" step="0.01" value={item.amount} onChange={(e) => updateItem(item.id, { amount: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Data pagamento *</Label>
                      <Input className="h-8" type="date" value={item.paymentDate} onChange={(e) => updateItem(item.id, { paymentDate: e.target.value })} />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Categoria</Label>
                    <Input className="h-8" value={item.category} onChange={(e) => updateItem(item.id, { category: e.target.value })} placeholder="Ex: Energia Elétrica" />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="flex-1" disabled={item.status === "extracting"} onClick={() => extractOne(item)}>
                      <Sparkles className="h-3 w-3 mr-1" /> IA
                    </Button>
                    <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={item.status === "saving"} onClick={() => saveOne(item)}>
                      <Save className="h-3 w-3 mr-1" /> Salvar
                    </Button>
                  </div>
                </>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
