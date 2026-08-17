import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Trash2, Building2, CheckCircle2, XCircle, Link, ShieldCheck, Hash, Plug2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { listInboxes, type ChatwootConfig, type ChatwootInbox } from '@/lib/chatwootApi';

interface CompanyConfig {
  id?: string;
  company_id: string;
  chatwoot_base_url: string;
  chatwoot_api_token: string;
  chatwoot_account_id: string;
  inbox_id: number | null;
  inbox_name: string | null;
}

interface Company {
  id: string;
  name: string;
  trade_name: string | null;
  cnpj: string;
}

export default function CompanyChatwootConfig() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [configs, setConfigs] = useState<CompanyConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; inboxes: ChatwootInbox[] }>>({});

  // Form state per company
  const [forms, setForms] = useState<Record<string, { url: string; token: string; accountId: string; inboxId: string }>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [companiesRes, configsRes] = await Promise.all([
      supabase.from('companies').select('id, name, trade_name, cnpj').order('name'),
      supabase.from('company_chatwoot_config' as any).select('*'),
    ]);

    const comps = (companiesRes.data ?? []) as Company[];
    const cfgs = (configsRes.data ?? []) as any as CompanyConfig[];
    setCompanies(comps);
    setConfigs(cfgs);

    // Initialize forms
    const f: Record<string, { url: string; token: string; accountId: string; inboxId: string }> = {};
    comps.forEach(c => {
      const existing = cfgs.find(cfg => cfg.company_id === c.id);
      f[c.id] = {
        url: existing?.chatwoot_base_url ?? '',
        token: existing?.chatwoot_api_token ?? '',
        accountId: existing?.chatwoot_account_id ?? '',
        inboxId: existing?.inbox_id ? String(existing.inbox_id) : '',
      };
    });
    setForms(f);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateForm = (companyId: string, field: string, value: string) => {
    setForms(prev => ({
      ...prev,
      [companyId]: { ...prev[companyId], [field]: value },
    }));
  };

  const handleTest = async (companyId: string) => {
    const form = forms[companyId];
    if (!form?.url || !form?.token || !form?.accountId) {
      toast.error('Preencha URL, Token e Account ID');
      return;
    }
    setTestingId(companyId);
    try {
      const cfg: ChatwootConfig = {
        baseUrl: form.url.replace(/\/+$/, ''),
        token: form.token,
        accountId: form.accountId,
      };
      const inboxList = await listInboxes(cfg);
      setTestResults(prev => ({ ...prev, [companyId]: { ok: true, inboxes: inboxList } }));
      toast.success(`Conexão OK! ${inboxList.length} inbox(es) encontrada(s).`);
    } catch {
      setTestResults(prev => ({ ...prev, [companyId]: { ok: false, inboxes: [] } }));
      toast.error('Falha na conexão. Verifique as credenciais.');
    } finally {
      setTestingId(null);
    }
  };

  const handleSave = async (companyId: string) => {
    const form = forms[companyId];
    if (!form?.url || !form?.token || !form?.accountId) {
      toast.error('Preencha URL, Token e Account ID');
      return;
    }
    setSavingId(companyId);
    try {
      const existing = configs.find(c => c.company_id === companyId);
      const inboxName = testResults[companyId]?.inboxes.find(i => i.id === Number(form.inboxId))?.name ?? null;
      const payload = {
        company_id: companyId,
        chatwoot_base_url: form.url.replace(/\/+$/, ''),
        chatwoot_api_token: form.token,
        chatwoot_account_id: form.accountId,
        inbox_id: form.inboxId ? Number(form.inboxId) : null,
        inbox_name: inboxName,
      };

      if (existing?.id) {
        await supabase.from('company_chatwoot_config' as any).update(payload as any).eq('id', existing.id);
      } else {
        await supabase.from('company_chatwoot_config' as any).insert(payload as any);
      }
      toast.success('Configuração salva!');
      await fetchData();
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (companyId: string) => {
    const existing = configs.find(c => c.company_id === companyId);
    if (!existing?.id) return;
    setDeletingId(companyId);
    try {
      await supabase.from('company_chatwoot_config' as any).delete().eq('id', existing.id);
      toast.success('Configuração removida');
      setTestResults(prev => { const n = { ...prev }; delete n[companyId]; return n; });
      await fetchData();
    } catch {
      toast.error('Erro ao remover');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-64" /><Skeleton className="h-4 w-96 mt-1" /></CardHeader>
        <CardContent className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-48 w-full rounded-lg" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          Configuração Chatwoot por Empresa
        </CardTitle>
        <CardDescription>
          Configure credenciais diferentes do Chatwoot (URL, Token, Account ID) para cada empresa
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {companies.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma empresa cadastrada</p>
        )}
        {companies.map(company => {
          const form = forms[company.id] ?? { url: '', token: '', accountId: '', inboxId: '' };
          const existing = configs.find(c => c.company_id === company.id);
          const isSaving = savingId === company.id;
          const isDeleting = deletingId === company.id;
          const isTesting = testingId === company.id;
          const testResult = testResults[company.id];

          return (
            <div key={company.id} className="p-4 rounded-lg border bg-muted/30 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{company.trade_name || company.name}</span>
                  <span className="text-xs text-muted-foreground">{company.cnpj}</span>
                  {existing && <Badge variant="outline" className="text-[10px]">Configurado</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  {testResult && (
                    testResult.ok
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      : <XCircle className="w-4 h-4 text-destructive" />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1 text-xs"><Link className="w-3 h-3" />URL do Chatwoot</Label>
                  <Input
                    placeholder="http://seu-servidor:3000"
                    value={form.url}
                    onChange={e => updateForm(company.id, 'url', e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1 text-xs"><ShieldCheck className="w-3 h-3" />Token API</Label>
                  <Input
                    type="password"
                    placeholder="api_access_token"
                    value={form.token}
                    onChange={e => updateForm(company.id, 'token', e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1 text-xs"><Hash className="w-3 h-3" />Account ID</Label>
                  <Input
                    placeholder="1"
                    value={form.accountId}
                    onChange={e => updateForm(company.id, 'accountId', e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>

              {/* Optional inbox selector after testing */}
              {testResult?.ok && testResult.inboxes.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Inbox específica (opcional)</Label>
                  <Select value={form.inboxId} onValueChange={val => updateForm(company.id, 'inboxId', val === '_none' ? '' : val)}>
                    <SelectTrigger className="w-full md:w-[300px]">
                      <SelectValue placeholder="Todas as inboxes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Todas as inboxes</SelectItem>
                      {testResult.inboxes.map(inbox => (
                        <SelectItem key={inbox.id} value={String(inbox.id)}>{inbox.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleTest(company.id)} disabled={isTesting} className="gap-1.5">
                  {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug2 className="w-3.5 h-3.5" />}
                  Testar Conexão
                </Button>
                <Button size="sm" onClick={() => handleSave(company.id)} disabled={isSaving} className="gap-1.5">
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Salvar
                </Button>
                {existing && (
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(company.id)} disabled={isDeleting} className="gap-1.5 text-destructive hover:text-destructive">
                    {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Remover
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
