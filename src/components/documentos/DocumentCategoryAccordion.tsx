import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DOCUMENT_CATEGORIES, getDocumentTypeLabel } from "@/lib/documentCategories";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Trash2, FileText, FileCheck, CalendarClock, HeartPulse, UserX, Receipt } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  admissao: FileCheck,
  periodico: CalendarClock,
  atestado: HeartPulse,
  desligamento: UserX,
  comprovante: Receipt,
};

interface DocumentCategoryAccordionProps {
  documents: any[];
  employeeId: string;
}

export function DocumentCategoryAccordion({ documents, employeeId }: DocumentCategoryAccordionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleDownload = async (filePath: string, fileName: string) => {
    const { data, error } = await supabase.storage.from("employee-documents").download(filePath);
    if (error) {
      toast({ title: "Erro ao baixar", description: error.message, variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (doc: any) => {
    const { error: storageError } = await supabase.storage.from("employee-documents").remove([doc.file_path]);
    if (storageError) {
      toast({ title: "Erro ao remover arquivo", description: storageError.message, variant: "destructive" });
      return;
    }
    const { error: dbError } = await supabase.from("employee_documents").delete().eq("id", doc.id);
    if (dbError) {
      toast({ title: "Erro ao remover registro", description: dbError.message, variant: "destructive" });
    } else {
      toast({ title: "Documento removido" });
      queryClient.invalidateQueries({ queryKey: ["employee-documents", employeeId] });
    }
  };

  return (
    <Accordion type="multiple" className="w-full">
      {DOCUMENT_CATEGORIES.map((cat) => {
        const catDocs = documents.filter((d) => d.category === cat.key);
        const Icon = CATEGORY_ICONS[cat.key] || FileText;

        return (
          <AccordionItem key={cat.key} value={cat.key}>
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span>{cat.label}</span>
                <Badge variant="secondary" className="ml-1 text-xs">{catDocs.length}</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {catDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Nenhum documento nesta categoria.</p>
              ) : (
                <div className="space-y-2">
                  {catDocs.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{doc.document_name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          {doc.reference_month && <span>Ref: {doc.reference_month}</span>}
                          <span>{format(new Date(doc.uploaded_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                          {doc.file_size && <span>{(doc.file_size / 1024).toFixed(0)} KB</span>}
                        </div>
                        {doc.observation && <p className="text-xs text-muted-foreground mt-1">{doc.observation}</p>}
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(doc.file_path, doc.file_name)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
                              <AlertDialogDescription>Esta ação não pode ser desfeita. O arquivo será removido permanentemente.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(doc)}>Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
