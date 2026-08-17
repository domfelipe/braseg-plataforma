import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Pencil, Plus, Search, Trash2, UserCog } from "lucide-react";

interface Contact {
  id: string;
  company_id: string;
  name_key: string;
  doctor_name_original: string;
  phone: string;
  updated_at: string;
}

const normalizeKey = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const sanitizePhone = (v: string) => v.replace(/\D/g, "");

const formatPhone = (digits: string) => {
  const d = sanitizePhone(digits);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
};

export default function ProfessionalContactsManager() {
  const { companies, selectedCompany, setSelectedCompanyId } = useCompany();
  const { toast } = useToast();

  const [companyId, setCompanyId] = useState<string>(selectedCompany?.id || "");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<Contact | null>(null);

  useEffect(() => {
    if (selectedCompany && !companyId) setCompanyId(selectedCompany.id);
  }, [selectedCompany, companyId]);

  const fetchContacts = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("payment_professional_contacts")
      .select("*")
      .eq("company_id", companyId)
      .order("doctor_name_original");
    if (error) {
      toast({ title: "Erro ao carregar contatos", description: error.message, variant: "destructive" });
    } else {
      setContacts((data || []) as Contact[]);
    }
    setLoading(false);
  }, [companyId, toast]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const filtered = useMemo(() => {
    const q = normalizeKey(search);
    if (!q) return contacts;
    return contacts.filter(
      (c) => c.name_key.includes(q) || sanitizePhone(c.phone).includes(sanitizePhone(search)),
    );
  }, [contacts, search]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setPhone("");
    setDialogOpen(true);
  };

  const openEdit = (c: Contact) => {
    setEditing(c);
    setName(c.doctor_name_original);
    setPhone(formatPhone(c.phone));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const cleanName = name.trim();
    const cleanPhone = sanitizePhone(phone);
    if (!cleanName) {
      toast({ title: "Informe o nome", variant: "destructive" });
      return;
    }
    if (cleanPhone.length < 10) {
      toast({ title: "Telefone inválido", description: "Inclua DDD + número.", variant: "destructive" });
      return;
    }
    if (!companyId) return;
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        name_key: normalizeKey(cleanName),
        doctor_name_original: cleanName,
        phone: cleanPhone,
      };
      if (editing) {
        const { error } = await supabase
          .from("payment_professional_contacts")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast({ title: "Contato atualizado" });
      } else {
        const { error } = await supabase
          .from("payment_professional_contacts")
          .upsert(payload, { onConflict: "company_id,name_key" });
        if (error) throw error;
        toast({ title: "Contato cadastrado" });
      }
      setDialogOpen(false);
      await fetchContacts();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase
      .from("payment_professional_contacts")
      .delete()
      .eq("id", confirmDelete.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Contato excluído" });
      setConfirmDelete(null);
      await fetchContacts();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <UserCog className="h-5 w-5 text-accent" />
          Contatos de Profissionais
        </CardTitle>
        <CardDescription>
          Cadastre nome e telefone dos médicos por empresa para uso no módulo de Pagamentos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 min-w-0">
            <Label>Empresa</Label>
            <Select
              value={companyId}
              onValueChange={(v) => {
                setCompanyId(v);
                setSelectedCompanyId(v);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.trade_name || c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-0">
            <Label>Buscar</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome ou telefone"
                className="pl-9"
              />
            </div>
          </div>
          <Button onClick={openCreate} className="bg-accent hover:bg-accent/90" disabled={!companyId}>
            <Plus className="h-4 w-4 mr-1" /> Novo contato
          </Button>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead className="w-[120px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    Nenhum contato cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.doctor_name_original}</TableCell>
                    <TableCell>{formatPhone(c.phone)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfirmDelete(c)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar contato" : "Novo contato"}</DialogTitle>
              <DialogDescription>
                Dados usados para envio de comprovantes via WhatsApp.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome do profissional *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr(a). Nome Sobrenome" />
              </div>
              <div>
                <Label>Telefone (WhatsApp) *</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(14) 99999-9999"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Inclua DDD. Para celular, 9 dígitos após o DDD.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving} className="bg-accent hover:bg-accent/90">
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmDelete?.doctor_name_original} será removido. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
