import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sun, Moon, Users, Building2, Plus, Trash2, Loader2, Pencil } from "lucide-react";
import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import ProfessionalContactsManager from "@/components/pagamentos/ProfessionalContactsManager";
import { Constants } from "@/integrations/supabase/types";

const ALL_MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "financial", label: "Financeiro" },
  { key: "financial_pagar", label: "Financeiro (apenas Contas a Pagar)" },
  { key: "financial_receber", label: "Financeiro (apenas Contas a Receber)" },
  { key: "payments", label: "Pagamentos" },
  { key: "documents", label: "Documentos" },
  { key: "timesheet", label: "Ponto" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "events", label: "Eventos" },
  { key: "fleet", label: "Frotas" },
  { key: "schedules", label: "Escalas" },
];
const ROLE_LABELS: Record<string, string> = {
  "super-admin": "Super Admin",
  master: "Master",
  operacional: "Operacional",
  profissional: "Profissional",
};

interface UserData {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  roles: string[];
  companies: { company_id: string; modules: string[] }[];
}

export default function Configuracoes() {
  const { isMaster, session } = useAuth();
  const { companies } = useCompany();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();

  // User management state
  const [users, setUsers] = useState<UserData[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);

  // Create user form
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState("operacional");
  const [newCompanyIds, setNewCompanyIds] = useState<string[]>([]);
  const [newModules, setNewModules] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Edit user form
  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("operacional");
  const [editCompanyIds, setEditCompanyIds] = useState<string[]>([]);
  const [editModules, setEditModules] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Company editing
  const [editingCompany, setEditingCompany] = useState<any | null>(null);
  const [companyForm, setCompanyForm] = useState<any>({});
  const [savingCompany, setSavingCompany] = useState(false);

  const fetchUsers = async () => {
    if (!isMaster) return;
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: { action: "list_users" },
      });
      if (error) {
        console.error("Error fetching users:", error);
        toast({ title: "Erro ao carregar usuários", variant: "destructive" });
      } else if (data?.error) {
        console.error("Edge function error:", data.error);
        toast({ title: "Erro ao carregar usuários", description: data.error, variant: "destructive" });
      } else if (data) {
        const profiles = data.profiles || [];
        const roles = data.roles || [];
        const access = data.access || [];
        const merged: UserData[] = profiles.map((p: any) => ({
          id: p.id,
          full_name: p.full_name,
          email: p.email || "",
          phone: p.phone,
          roles: roles.filter((r: any) => r.user_id === p.id).map((r: any) => r.role),
          companies: access
            .filter((a: any) => a.user_id === p.id)
            .map((a: any) => ({ company_id: a.company_id, modules: a.modules || [] })),
        }));
        setUsers(merged);
      }
    } catch (err) {
      console.error("Unexpected error fetching users:", err);
      toast({ title: "Erro ao carregar usuários", description: "Serviço indisponível no momento.", variant: "destructive" });
    }
    setLoadingUsers(false);
  };

  useEffect(() => {
    if (isMaster) fetchUsers();
  }, [isMaster]);

  const handleCreateUser = async () => {
    if (!newEmail || !newPassword || !newFullName) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("manage-users", {
      body: {
        action: "create_user",
        email: newEmail,
        password: newPassword,
        full_name: newFullName,
        phone: newPhone || null,
        role: newRole,
        company_ids: newCompanyIds,
        modules: newModules,
      },
    });
    setCreating(false);
    if (error || data?.error) {
      toast({ title: "Erro ao criar usuário", description: data?.error || error?.message, variant: "destructive" });
    } else {
      toast({ title: "Usuário criado com sucesso!" });
      setShowCreateDialog(false);
      setNewEmail(""); setNewPassword(""); setNewFullName(""); setNewPhone(""); setNewRole("operacional");
      setNewCompanyIds([]); setNewModules([]);
      fetchUsers();
    }
  };

  const openEditDialog = (user: UserData) => {
    setEditingUser(user);
    setEditFullName(user.full_name);
    setEditPhone(user.phone || "");
    setEditRole(user.roles[0] || "operacional");
    setEditCompanyIds(user.companies.map((c) => c.company_id));
    // Merge all modules from all company accesses
    const allMods = new Set<string>();
    user.companies.forEach((c) => c.modules.forEach((m) => allMods.add(m)));
    setEditModules(Array.from(allMods));
    setShowEditDialog(true);
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("manage-users", {
      body: {
        action: "update_user",
        user_id: editingUser.id,
        full_name: editFullName,
        phone: editPhone || null,
        role: editRole,
        company_ids: editCompanyIds,
        modules: editModules,
      },
    });
    setSaving(false);
    if (error || data?.error) {
      toast({ title: "Erro ao atualizar usuário", description: data?.error || error?.message, variant: "destructive" });
    } else {
      toast({ title: "Usuário atualizado com sucesso!" });
      setShowEditDialog(false);
      setEditingUser(null);
      fetchUsers();
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const { data, error } = await supabase.functions.invoke("manage-users", {
      body: { action: "delete_user", user_id: userId },
    });
    if (error || data?.error) {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    } else {
      toast({ title: "Usuário excluído" });
      fetchUsers();
    }
  };

  const handleSaveCompany = async () => {
    if (!editingCompany) return;
    setSavingCompany(true);
    const { error } = await supabase
      .from("companies")
      .update(companyForm)
      .eq("id", editingCompany.id);
    setSavingCompany(false);
    if (error) {
      toast({ title: "Erro ao salvar empresa", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Empresa atualizada!" });
      setEditingCompany(null);
    }
  };

  const getCompanyName = (id: string) => {
    const c = companies.find((co) => co.id === id);
    return c?.trade_name || c?.name || id;
  };

  // Reusable form for modules + companies
  const renderCompanyCheckboxes = (selectedIds: string[], setSelectedIds: (ids: string[]) => void) => (
    <div className="space-y-2 max-h-40 overflow-y-auto">
      {companies.map((c) => (
        <div key={c.id} className="flex items-center gap-2">
          <Checkbox
            checked={selectedIds.includes(c.id)}
            onCheckedChange={(checked) => {
              setSelectedIds(checked ? [...selectedIds, c.id] : selectedIds.filter((id) => id !== c.id));
            }}
          />
          <span className="text-sm">{c.trade_name || c.name}</span>
        </div>
      ))}
    </div>
  );

  const renderModuleCheckboxes = (selectedMods: string[], setSelectedMods: (mods: string[]) => void) => (
    <div className="grid grid-cols-2 gap-2">
      {ALL_MODULES.map((m) => (
        <div key={m.key} className="flex items-center gap-2">
          <Checkbox
            checked={selectedMods.includes(m.key)}
            onCheckedChange={(checked) => {
              setSelectedMods(checked ? [...selectedMods, m.key] : selectedMods.filter((mod) => mod !== m.key));
            }}
          />
          <span className="text-sm">{m.label}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <Tabs defaultValue="aparencia">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="w-max sm:w-auto">
            <TabsTrigger value="aparencia">Aparência</TabsTrigger>
            <TabsTrigger value="notificacoes">Notificações</TabsTrigger>
            {isMaster && <TabsTrigger value="usuarios">Usuários</TabsTrigger>}
            {isMaster && <TabsTrigger value="empresas">Empresas</TabsTrigger>}
            {isMaster && <TabsTrigger value="contatos">Contatos Profissionais</TabsTrigger>}
          </TabsList>
        </div>

        {/* Appearance */}
        <TabsContent value="aparencia">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Aparência</CardTitle>
              <CardDescription>Escolha o tema do sistema</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {theme === "light" ? <Sun className="h-5 w-5 text-amber-500" /> : <Moon className="h-5 w-5 text-blue-400" />}
                  <div>
                    <p className="font-medium text-sm">{theme === "light" ? "Modo Claro" : "Modo Escuro"}</p>
                    <p className="text-xs text-muted-foreground">Alterne entre os temas claro e escuro</p>
                  </div>
                </div>
                <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-lg">Versão do aplicativo</CardTitle>
              <CardDescription>Identifique quando uma nova atualização foi aplicada</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Build</p>
                <Badge variant="secondary" className="font-mono text-xs">
                  {new Date(__APP_BUILD_TIME__).toLocaleString("pt-BR")}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">ID</p>
                <code className="text-xs text-muted-foreground">
                  {__APP_BUILD_TIME__.replace(/[-:.TZ]/g, "").slice(0, 14)}
                </code>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2"
                onClick={() => window.location.reload()}
              >
                Verificar atualizações
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notificacoes">
          <NotificationPreferences />
        </TabsContent>

        {/* User Management (master only) */}
        {isMaster && (
          <TabsContent value="usuarios">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2"><Users className="h-5 w-5" /> Gestão de Usuários</CardTitle>
                  <CardDescription>Crie, edite e gerencie os usuários do sistema</CardDescription>
                </div>
                <Button onClick={() => setShowCreateDialog(true)} size="sm" className="gap-1 w-full sm:w-auto">
                  <Plus className="h-4 w-4" /> Novo Usuário
                </Button>
              </CardHeader>
              <CardContent>
                {loadingUsers ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                           <TableHead>Nome</TableHead>
                           <TableHead>Email</TableHead>
                           <TableHead>Roles</TableHead>
                           <TableHead>Empresas</TableHead>
                           <TableHead className="w-24"></TableHead>
                         </TableRow>
                       </TableHeader>
                       <TableBody>
                         {users.map((u) => (
                           <TableRow key={u.id}>
                             <TableCell className="font-medium">{u.full_name}</TableCell>
                             <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {u.roles.map((r) => (
                                  <Badge key={r} variant="secondary" className="text-xs">{ROLE_LABELS[r] || r}</Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {u.companies.map((c) => (
                                  <Badge key={c.company_id} variant="outline" className="text-xs">{getCompanyName(c.company_id)}</Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(u)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteUser(u.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Create User Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                   <DialogTitle>Novo Usuário</DialogTitle>
                   <DialogDescription>Preencha os dados para criar um novo usuário no sistema.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome Completo *</Label>
                    <Input value={newFullName} onChange={(e) => setNewFullName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email *</Label>
                    <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input
                      type="tel"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use DDI+DDD para envio via WhatsApp (ex: 5514999999999)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Senha *</Label>
                    <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={newRole} onValueChange={setNewRole}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Constants.public.Enums.app_role.map((r) => (
                          <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Empresas</Label>
                    {renderCompanyCheckboxes(newCompanyIds, setNewCompanyIds)}
                  </div>
                  <div className="space-y-2">
                    <Label>Módulos</Label>
                    {renderModuleCheckboxes(newModules, setNewModules)}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
                  <Button onClick={handleCreateUser} disabled={creating} className="gap-1">
                    {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                    Criar Usuário
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Edit User Dialog */}
            <Dialog open={showEditDialog} onOpenChange={(o) => { if (!o) { setShowEditDialog(false); setEditingUser(null); } }}>
              <DialogContent
                className="max-w-md max-h-[85vh] overflow-y-auto"
                onOpenAutoFocus={(event) => event.preventDefault()}
              >
                <DialogHeader>
                   <DialogTitle>Editar Usuário</DialogTitle>
                   <DialogDescription>Altere os dados, role, empresas e módulos do usuário.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <Input value={editingUser?.email || ""} readOnly aria-readonly="true" className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome Completo</Label>
                    <Input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use DDI+DDD para envio via WhatsApp (ex: 5514999999999)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={editRole} onValueChange={setEditRole}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Constants.public.Enums.app_role.map((r) => (
                          <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Empresas</Label>
                    {renderCompanyCheckboxes(editCompanyIds, setEditCompanyIds)}
                  </div>
                  <div className="space-y-2">
                    <Label>Módulos</Label>
                    {renderModuleCheckboxes(editModules, setEditModules)}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditingUser(null); }}>Cancelar</Button>
                  <Button onClick={handleUpdateUser} disabled={saving} className="gap-1">
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>
        )}

        {/* Company Management (master only) */}
        {isMaster && (
          <TabsContent value="empresas">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Building2 className="h-5 w-5" /> Gestão de Empresas</CardTitle>
                <CardDescription>Visualize e edite os dados cadastrais das empresas</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {companies.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                    <div>
                      <p className="font-medium text-sm">{c.trade_name || c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.cnpj}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingCompany(c);
                        setCompanyForm({
                          name: c.name,
                          trade_name: c.trade_name || "",
                          phone: c.phone || "",
                          email: c.email || "",
                        });
                      }}
                    >
                      Editar
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Edit Company Dialog */}
            <Dialog open={!!editingCompany} onOpenChange={(o) => !o && setEditingCompany(null)}>
              <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                   <DialogTitle>Editar Empresa</DialogTitle>
                   <DialogDescription>Atualize os dados cadastrais da empresa.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Razão Social</Label>
                    <Input value={companyForm.name || ""} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome Fantasia</Label>
                    <Input value={companyForm.trade_name || ""} onChange={(e) => setCompanyForm({ ...companyForm, trade_name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input value={companyForm.phone || ""} onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={companyForm.email || ""} onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingCompany(null)}>Cancelar</Button>
                  <Button onClick={handleSaveCompany} disabled={savingCompany} className="gap-1">
                    {savingCompany && <Loader2 className="h-4 w-4 animate-spin" />}
                    Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>
        )}

        {isMaster && (
          <TabsContent value="contatos">
            <ProfessionalContactsManager />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
