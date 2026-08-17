import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EMPLOYEE_STATUS_LABELS } from "@/lib/documentCategories";
import { EmployeeDocuments } from "./EmployeeDocuments";
import { EmployeeForm } from "./EmployeeForm";
import { format } from "date-fns";
import { Search, Plus, Pencil, Trash2 } from "lucide-react";

export function EmployeesList() {
  const { selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState<any>(null);
  const [deleteEmployee, setDeleteEmployee] = useState<any>(null);

  const { data: employees = [], isLoading, error: queryError } = useQuery({
    queryKey: ["employees", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany) return [];
      const { data, error } = await supabase
        .from("employees")
        .select("*, employee_documents(id)")
        .eq("company_id", selectedCompany.id)
        .order("full_name");
      if (error) throw error;
      return data.map((e: any) => ({ ...e, doc_count: e.employee_documents?.length || 0 }));
    },
    enabled: !!selectedCompany?.id,
    retry: 1,
  });

  useEffect(() => {
    if (queryError) {
      toast.error("Erro ao carregar funcionários. Tente novamente.");
    }
  }, [queryError]);

  const filtered = employees.filter((e: any) => {
    const matchSearch = !search || e.full_name.toLowerCase().includes(search.toLowerCase()) || (e.cpf && e.cpf.includes(search));
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleRowClick = (emp: any) => {
    setSelectedEmployee(emp);
    setSheetOpen(true);
  };

  const handleEdit = (e: React.MouseEvent, emp: any) => {
    e.stopPropagation();
    setEditEmployee(emp);
    setFormOpen(true);
  };

  const handleNew = () => {
    setEditEmployee(null);
    setFormOpen(true);
  };

  const handleDeleteEmployee = async () => {
    if (!deleteEmployee) return;
    // Delete associated documents first
    await supabase.from("employee_documents").delete().eq("employee_id", deleteEmployee.id);
    const { error } = await supabase.from("employees").delete().eq("id", deleteEmployee.id);
    if (error) {
      toast.error("Erro ao excluir funcionário: " + error.message);
    } else {
      toast.success("Funcionário excluído!");
      queryClient.invalidateQueries({ queryKey: ["employees", selectedCompany?.id] });
    }
    setDeleteEmployee(null);
  };

  const statusVariant = (s: string) => s === "active" ? "default" : s === "dismissed" ? "destructive" : "secondary";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou CPF..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
            <SelectItem value="dismissed">Desligados</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleNew}><Plus className="h-4 w-4 mr-1" /> Novo Funcionário</Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>{employees.length === 0 ? "Nenhum funcionário cadastrado." : "Nenhum resultado encontrado."}</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden md:table-cell">Cargo</TableHead>
                <TableHead className="hidden lg:table-cell">Departamento</TableHead>
                <TableHead className="hidden md:table-cell">Admissão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Docs</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((emp: any) => (
                <TableRow key={emp.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleRowClick(emp)}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{emp.full_name}</p>
                      {emp.cpf && <p className="text-xs text-muted-foreground">{emp.cpf}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{emp.position}</TableCell>
                  <TableCell className="hidden lg:table-cell">{emp.department || "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {emp.admission_date ? format(new Date(emp.admission_date + "T12:00:00"), "dd/MM/yyyy") : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(emp.status)}>{EMPLOYEE_STATUS_LABELS[emp.status] || emp.status}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">{emp.doc_count}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => handleEdit(e, emp)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {emp.status !== "active" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteEmployee(emp); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <EmployeeDocuments employee={selectedEmployee} open={sheetOpen} onOpenChange={setSheetOpen} />
      <EmployeeForm open={formOpen} onOpenChange={setFormOpen} employee={editEmployee} />

      <AlertDialog open={!!deleteEmployee} onOpenChange={(o) => { if (!o) setDeleteEmployee(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir funcionário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteEmployee?.full_name}</strong>? Todos os documentos associados também serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEmployee} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
