import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, FileText, X, ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  companyId: string;
  type: "receita" | "despesa";
  onSuccess: () => void;
}

export default function ReceiptUploadDialog({ companyId, type, onSuccess }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [selectedType, setSelectedType] = useState<string>(type);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (selected: File | null) => {
    if (selected && selected.size > 20 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "O tamanho máximo é 20MB.", variant: "destructive" });
      return;
    }
    setFile(selected);
    if (selected && selected.type.startsWith("image/")) {
      const url = URL.createObjectURL(selected);
      setPreview(url);
    } else {
      setPreview(null);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setSelectedType(type);
    setUploading(false);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Sessão expirada", description: "Faça login novamente.", variant: "destructive" });
        setUploading(false);
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("company_id", companyId);
      formData.append("type", selectedType);

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/upload-receipt`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao processar comprovante");
      }

      toast({
        title: "Comprovante enviado!",
        description: result.extracted
          ? "Os dados foram extraídos automaticamente pela IA."
          : "O comprovante foi salvo mas a extração automática falhou. Edite os dados manualmente.",
      });

      setOpen(false);
      reset();
      onSuccess();
    } catch (err) {
      console.error("Upload error:", err);
      toast({
        title: "Erro ao enviar comprovante",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="h-4 w-4 mr-1" />
          Enviar Comprovante
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar Comprovante</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Anexe um comprovante (PDF, JPG, PNG ou WebP) e a IA extrairá automaticamente os dados como valor, data e descrição.
          </p>

          <div>
            <Label>Tipo</Label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="despesa">Despesa</SelectItem>
                <SelectItem value="receita">Receita</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!file ? (
            <div
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-colors"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) handleFileChange(dropped);
              }}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Clique ou arraste o arquivo aqui</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG ou WebP (máx. 20MB)</p>
            </div>
          ) : (
            <div className="border rounded-lg p-3">
              {preview ? (
                <div className="relative mb-2">
                  <img src={preview} alt="Preview" className="w-full max-h-48 object-contain rounded" />
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive w-full"
                onClick={() => { setFile(null); setPreview(null); }}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Remover arquivo
              </Button>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
          />

          <Button
            onClick={handleUpload}
            className="w-full bg-accent hover:bg-accent/90"
            disabled={!file || uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processando com IA...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Enviar e Extrair Dados
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
