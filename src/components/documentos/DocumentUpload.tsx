import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { DOCUMENT_CATEGORIES } from "@/lib/documentCategories";
import { Upload } from "lucide-react";

interface DocumentUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  companyId: string;
}

export function DocumentUpload({ open, onOpenChange, employeeId, companyId }: DocumentUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    category: "",
    document_type: "",
    reference_month: "",
    observation: "",
  });

  const selectedCategory = DOCUMENT_CATEGORIES.find((c) => c.key === form.category);
  const types = selectedCategory?.types || [];

  const handleUpload = async () => {
    if (!file || !form.category || !form.document_type) {
      toast({ title: "Preencha os campos obrigatórios", description: "Categoria, tipo e arquivo são obrigatórios.", variant: "destructive" });
      return;
    }

    setLoading(true);
    const ext = file.name.split(".").pop() || "pdf";
    const refMonth = form.reference_month || new Date().toISOString().slice(0, 7);
    const timestamp = Math.floor(Date.now() / 1000);
    const fileName = `${form.document_type}-${refMonth}-${timestamp}.${ext}`;
    const filePath = `${companyId}/${employeeId}/${form.category}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("employee-documents")
      .upload(filePath, file, { contentType: file.type });

    if (uploadError) {
      setLoading(false);
      toast({ title: "Erro no upload", description: uploadError.message, variant: "destructive" });
      return;
    }

    const typeLabel = types.find((t) => t.slug === form.document_type)?.label || form.document_type;
    const refYear = form.reference_month ? parseInt(form.reference_month.slice(0, 4)) : null;

    const { error: dbError } = await supabase.from("employee_documents").insert({
      employee_id: employeeId,
      company_id: companyId,
      category: form.category,
      document_type: form.document_type,
      document_name: typeLabel,
      file_path: filePath,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      reference_month: form.reference_month || null,
      reference_year: refYear,
      observation: form.observation.trim() || null,
      uploaded_by: user?.id,
    });

    setLoading(false);
    if (dbError) {
      toast({ title: "Erro ao salvar documento", description: dbError.message, variant: "destructive" });
    } else {
      toast({ title: "Documento enviado com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["employee-documents", employeeId] });
      setFile(null);
      setForm({ category: "", document_type: "", reference_month: "", observation: "" });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar Documento</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Categoria *</Label>
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v, document_type: "" }))}>
              <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
              <SelectContent>
                {DOCUMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.category && (
            <div className="grid gap-2">
              <Label>Tipo de documento *</Label>
              <Select value={form.document_type} onValueChange={(v) => setForm((f) => ({ ...f, document_type: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.slug} value={t.slug}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-2">
            <Label>Mês/Ano de referência</Label>
            <Input type="month" value={form.reference_month} onChange={(e) => setForm((f) => ({ ...f, reference_month: e.target.value }))} />
          </div>
          <div className="grid gap-2">
            <Label>Observação</Label>
            <Textarea value={form.observation} onChange={(e) => setForm((f) => ({ ...f, observation: e.target.value }))} rows={2} />
          </div>
          <div className="grid gap-2">
            <Label>Arquivo *</Label>
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {file ? file.name : "Clique para selecionar um arquivo"}
              </p>
              {file && <p className="text-xs text-muted-foreground mt-1">{(file.size / 1024).toFixed(0)} KB</p>}
            </div>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleUpload} disabled={loading}>{loading ? "Enviando..." : "Enviar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
