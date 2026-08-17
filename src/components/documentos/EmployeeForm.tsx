import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface EmployeeFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: any;
}

export function EmployeeForm({ open, onOpenChange, employee }: EmployeeFormProps) {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    full_name: "",
    cpf: "",
    rg: "",
    position: "",
    department: "",
    admission_date: "",
    dismissal_date: "",
    status: "active",
    notes: "",
  });

  useEffect(() => {
    if (employee) {
      setForm({
        full_name: employee.full_name || "",
        cpf: employee.cpf || "",
        rg: employee.rg || "",
        position: employee.position || "",
        department: employee.department || "",
        admission_date: employee.admission_date || "",
        dismissal_date: employee.dismissal_date || "",
        status: employee.status || "active",
        notes: employee.notes || "",
      });
    } else {
      setForm({
        full_name: "", cpf: "", rg: "", position: "", department: "",
        admission_date: "", dismissal_date: "", status: "active", notes: "",
      });
    }
  }, [employee, open]);

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.position.trim() || !selectedCompany) {
      toast({ title: "Preencha os campos obrigatórios", description: "Nome e cargo são obrigatórios.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const payload = {
      full_name: form.full_name.trim(),
      cpf: form.cpf.trim() || null,
      rg: form.rg.trim() || null,
      position: form.position.trim(),
      department: form.department.trim() || null,
      admission_date: form.admission_date || null,
      dismissal_date: form.dismissal_date || null,
      status: form.status,
      notes: form.notes.trim() || null,
      company_id: selectedCompany.id,
      ...(employee ? {} : { created_by: user?.id }),
    };

    const { error } = employee
      ? await supabase.from("employees").update(payload).eq("id", employee.id)
      : await supabase.from("employees").insert(payload);

    setLoading(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: employee ? "Funcionário atualizado" : "Funcionário cadastrado" });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{employee ? "Editar Funcionário" : "Novo Funcionário"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="full_name">Nome completo *</Label>
            <Input id="full_name" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input id="cpf" value={form.cpf} onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))} placeholder="000.000.000-00" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rg">RG</Label>
              <Input id="rg" value={form.rg} onChange={(e) => setForm((f) => ({ ...f, rg: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="position">Cargo *</Label>
              <Input id="position" value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="department">Departamento</Label>
              <Input id="department" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="admission_date">Data de admissão</Label>
              <Input id="admission_date" type="date" value={form.admission_date} onChange={(e) => setForm((f) => ({ ...f, admission_date: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dismissal_date">Data de desligamento</Label>
              <Input id="dismissal_date" type="date" value={form.dismissal_date} onChange={(e) => setForm((f) => ({ ...f, dismissal_date: e.target.value }))} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
                <SelectItem value="dismissed">Desligado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
