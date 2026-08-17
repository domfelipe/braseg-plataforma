import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  companyId: string;
}

interface Category {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
}

export default function CategoriesManager({ companyId }: Props) {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", type: "despesa", parent_id: "" });
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("financial_categories")
      .select("id, name, type, parent_id")
      .eq("company_id", companyId)
      .order("type")
      .order("name");
    if (data) setCategories(data as Category[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [companyId]);

  const resetForm = () => {
    setForm({ name: "", type: "despesa", parent_id: "" });
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.name) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      company_id: companyId,
      name: form.name,
      type: form.type,
      parent_id: form.parent_id || null,
    };

    let error;
    if (editingId) {
      const { error: e } = await supabase.from("financial_categories").update(payload).eq("id", editingId);
      error = e;
    } else {
      const { error: e } = await supabase.from("financial_categories").insert(payload);
      error = e;
    }

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingId ? "Categoria atualizada!" : "Categoria criada!" });
      setDialogOpen(false);
      resetForm();
      fetchData();
    }
    setSaving(false);
  };

  const handleEdit = (cat: Category) => {
    setForm({ name: cat.name, type: cat.type, parent_id: cat.parent_id || "" });
    setEditingId(cat.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("financial_categories").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Categoria excluída!" });
      fetchData();
    }
  };

  const getParentName = (id: string | null) => categories.find((c) => c.id === id)?.name || "-";

  const despesas = categories.filter((c) => c.type === "despesa");
  const receitas = categories.filter((c) => c.type === "receita");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Categorias Financeiras</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-accent hover:bg-accent/90">
                <Plus className="h-4 w-4 mr-1" />
                Nova Categoria
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar" : "Nova"} Categoria</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="despesa">Despesa</SelectItem>
                      <SelectItem value="receita">Receita</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Categoria Pai (opcional)</Label>
                  <Select value={form.parent_id || "none"} onValueChange={(v) => setForm({ ...form, parent_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {categories
                        .filter((c) => c.type === form.type && c.id !== editingId)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleSave} className="w-full bg-accent hover:bg-accent/90" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Salvar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
        ) : (
          <div className="space-y-6">
            {[{ label: "Despesas", items: despesas }, { label: "Receitas", items: receitas }].map(({ label, items }) => (
              <div key={label}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">{label}</h3>
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma categoria.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Categoria Pai</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((cat) => (
                        <TableRow key={cat.id}>
                          <TableCell className="font-medium">{cat.name}</TableCell>
                          <TableCell>{getParentName(cat.parent_id)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(cat)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(cat.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
