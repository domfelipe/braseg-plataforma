import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { DocumentCategoryAccordion } from "./DocumentCategoryAccordion";
import { DocumentUpload } from "./DocumentUpload";
import { EMPLOYEE_STATUS_LABELS } from "@/lib/documentCategories";
import { Upload, ArrowLeft } from "lucide-react";

interface EmployeeDocumentsProps {
  employee: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmployeeDocuments({ employee, open, onOpenChange }: EmployeeDocumentsProps) {
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: documents = [] } = useQuery({
    queryKey: ["employee-documents", employee?.id],
    queryFn: async () => {
      if (!employee) return [];
      const { data, error } = await supabase
        .from("employee_documents")
        .select("*")
        .eq("employee_id", employee.id)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!employee?.id,
  });

  if (!employee) return null;

  const statusVariant = employee.status === "active" ? "default" : employee.status === "dismissed" ? "destructive" : "secondary";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <SheetTitle className="flex-1">{employee.full_name}</SheetTitle>
            </div>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
              <Badge variant={statusVariant}>{EMPLOYEE_STATUS_LABELS[employee.status] || employee.status}</Badge>
              {employee.position && <span>{employee.position}</span>}
              {employee.department && <span>• {employee.department}</span>}
              {employee.cpf && <span>• CPF: {employee.cpf}</span>}
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Documentos ({documents.length})</h3>
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="h-4 w-4 mr-1" /> Enviar documento
              </Button>
            </div>

            <DocumentCategoryAccordion documents={documents} employeeId={employee.id} />
          </div>
        </SheetContent>
      </Sheet>

      <DocumentUpload open={uploadOpen} onOpenChange={setUploadOpen} employeeId={employee.id} companyId={employee.company_id} />
    </>
  );
}
