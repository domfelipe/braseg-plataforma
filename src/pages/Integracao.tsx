import { useAuth } from '@/hooks/useAuth';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Plug, Calendar, CheckCircle2, XCircle, Loader2, ExternalLink, RefreshCw, Clock, AlertTriangle, ShieldCheck, HardDrive, Save, Upload } from 'lucide-react';
import CompanyChatwootConfig from '@/components/integrations/CompanyChatwootConfig';
import { useCompany } from '@/hooks/useCompany';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// CNPJs that support Google integration
const GOOGLE_ENABLED_CNPJS = ['57.016.034/0001-91', '30.636.545/0001-50'];

export default function Integracao() {
  const { roles } = useAuth();
  const { selectedCompany } = useCompany();
  const isSuperAdmin = roles.includes('super-admin');
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settingUpWatch, setSettingUpWatch] = useState(false);

  const googleCompanyId = selectedCompany && GOOGLE_ENABLED_CNPJS.includes(selectedCompany.cnpj)
    ? selectedCompany.id
    : null;

  const isVgaf = selectedCompany?.cnpj === '57.016.034/0001-91';

  const { data: syncConfig, isLoading: configLoading } = useQuery({
    queryKey: ['calendar-sync-config', googleCompanyId],
    queryFn: async () => {
      if (!googleCompanyId) return null;
      const { data, error } = await supabase
        .from('calendar_sync_config')
        .select('*')
        .eq('company_id', googleCompanyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!googleCompanyId,
  });

  const isConnected = !!syncConfig?.refresh_token;

  // Show toast based on OAuth redirect params
  useEffect(() => {
    const googleStatus = searchParams.get('google');
    if (googleStatus === 'success') {
      toast({ title: 'Google conectado com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['calendar-sync-config'] });
    } else if (googleStatus === 'error') {
      toast({ title: 'Erro ao conectar Google', description: searchParams.get('message') || '', variant: 'destructive' });
    }
  }, [searchParams]);

  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;

  const handleConnect = async () => {
    if (!googleCompanyId) return;
    try {
      const { data, error } = await supabase.functions.invoke('google-auth-callback', {
        body: { company_id: googleCompanyId },
      });
      if (error) throw error;
      if (data?.auth_url) {
        window.location.href = data.auth_url;
      }
    } catch (err: any) {
      toast({ title: 'Erro ao iniciar conexão', description: err.message, variant: 'destructive' });
    }
  };

  const handleSetupWatch = async () => {
    if (!googleCompanyId) return;
    setSettingUpWatch(true);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-webhook', {
        method: 'PUT',
        body: { company_id: googleCompanyId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      toast({ title: 'Sincronização bidirecional ativada!', description: 'Eventos do Google Calendar foram importados.' });
      queryClient.invalidateQueries({ queryKey: ['calendar-sync-config'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    } catch (err: any) {
      toast({ title: 'Erro ao configurar webhook', description: err.message, variant: 'destructive' });
    } finally {
      setSettingUpWatch(false);
    }
  };

  const handleDisconnect = async () => {
    if (!googleCompanyId) return;
    try {
      const { error } = await supabase
        .from('calendar_sync_config')
        .delete()
        .eq('company_id', googleCompanyId);
      if (error) throw error;
      toast({ title: 'Google desconectado' });
      queryClient.invalidateQueries({ queryKey: ['calendar-sync-config'] });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background p-8 border border-primary/20">
        <div className="relative space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Plug className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Integrações</h1>
          </div>
          <p className="text-muted-foreground ml-14">
            Configure as integrações externas do sistema
            {selectedCompany && <span className="font-medium"> — {selectedCompany.trade_name || selectedCompany.name}</span>}
          </p>
        </div>
      </div>

      {/* Google Connection */}
      {googleCompanyId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-lg">Google {isVgaf ? 'Calendar + Drive' : 'Drive'}</CardTitle>
                  <CardDescription>
                    {isVgaf 
                      ? 'Sincronização bidirecional de eventos e upload de NFs' 
                      : 'Upload automático de Notas Fiscais para o Google Drive'}
                  </CardDescription>
                </div>
              </div>
              <Badge variant={isConnected ? "default" : "secondary"} className="gap-1">
                {isConnected ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                {isConnected ? "Conectado" : "Desconectado"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {configLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Verificando conexão...
              </div>
            ) : isConnected ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {isVgaf 
                    ? 'Eventos criados ou editados no sistema serão sincronizados automaticamente com o Google Calendar e vice-versa.'
                    : 'Conta Google conectada. As notas fiscais serão enviadas automaticamente para o Google Drive.'}
                </p>

                {/* OAuth Session Health */}
                <OAuthSessionCard syncConfig={syncConfig} onReconnect={handleConnect} />

                {isVgaf && <WebhookStatusCard syncConfig={syncConfig} />}

                <div className="flex gap-2">
                  {isVgaf && (
                    <Button onClick={handleSetupWatch} disabled={settingUpWatch} variant="outline" size="sm" className="gap-1">
                      {settingUpWatch ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      {syncConfig?.sync_channel_id ? 'Renovar webhook' : 'Ativar sincronização bidirecional'}
                    </Button>
                  )}
                  <Button onClick={handleDisconnect} variant="ghost" size="sm" className="text-destructive hover:text-destructive gap-1">
                    <XCircle className="h-3.5 w-3.5" /> Desconectar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Conecte uma conta do Google para {isVgaf ? 'sincronizar eventos e enviar NFs ao Drive' : 'enviar notas fiscais automaticamente ao Google Drive'}.
                </p>
                <Button onClick={handleConnect} className="gap-2">
                  <ExternalLink className="h-4 w-4" /> Conectar Google
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Google Drive Config */}
      {googleCompanyId && isConnected && <GoogleDriveConfig companyId={googleCompanyId} />}

      {/* Chatwoot */}
      <CompanyChatwootConfig />
    </div>
  );
}

function OAuthSessionCard({ syncConfig, onReconnect }: { syncConfig: any; onReconnect: () => void }) {
  const status = useMemo(() => {
    const updatedAt = syncConfig?.updated_at;
    if (!updatedAt) {
      return { level: 'unknown' as const, label: 'Desconhecido', description: 'Sem dados de sessão', progressValue: 0, diffDays: 0 };
    }

    const lastAuth = new Date(updatedAt);
    const now = new Date();
    const daysSinceAuth = (now.getTime() - lastAuth.getTime()) / (1000 * 60 * 60 * 24);
    const maxDays = 7;
    const daysRemaining = Math.max(0, maxDays - daysSinceAuth);
    const progressValue = Math.max(0, Math.min(100, (daysRemaining / maxDays) * 100));

    const lastAuthStr = lastAuth.toLocaleDateString('pt-BR') + ' às ' + lastAuth.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const expiresAt = new Date(lastAuth.getTime() + maxDays * 24 * 60 * 60 * 1000);
    const expiresStr = expiresAt.toLocaleDateString('pt-BR') + ' às ' + expiresAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    if (daysRemaining <= 0) {
      return { level: 'expired' as const, label: 'Sessão expirada', description: `Última autenticação: ${lastAuthStr}`, progressValue: 0, diffDays: 0 };
    }
    if (daysRemaining <= 2) {
      return { level: 'warning' as const, label: 'Expirando em breve', description: `Expira em ${expiresStr}`, progressValue, diffDays: daysRemaining };
    }
    return { level: 'active' as const, label: 'Sessão ativa', description: `Expira em ${expiresStr}`, progressValue, diffDays: daysRemaining };
  }, [syncConfig]);

  const config = {
    expired: { icon: XCircle, badgeVariant: 'destructive' as const, progressClass: 'bg-destructive', borderClass: 'border-destructive/30 bg-destructive/5', textClass: 'text-destructive' },
    warning: { icon: AlertTriangle, badgeVariant: 'secondary' as const, progressClass: 'bg-orange-500', borderClass: 'border-orange-500/30 bg-orange-500/5', textClass: 'text-orange-600 dark:text-orange-400' },
    active: { icon: ShieldCheck, badgeVariant: 'default' as const, progressClass: '', borderClass: 'border-primary/20 bg-primary/5', textClass: 'text-primary' },
    unknown: { icon: AlertTriangle, badgeVariant: 'secondary' as const, progressClass: '', borderClass: 'border-muted bg-muted/30', textClass: 'text-muted-foreground' },
  };

  const c = config[status.level];
  const Icon = c.icon;

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${c.borderClass}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${c.textClass}`} />
          <span className={`text-sm font-medium ${c.textClass}`}>Sessão OAuth (Google)</span>
        </div>
        <Badge variant={c.badgeVariant} className="text-xs gap-1">
          {status.level === 'active' && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse" />}
          {status.label}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Clock className="h-3 w-3" />
        {status.description}
      </p>

      {status.level !== 'unknown' && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Validade da sessão (7 dias)</span>
            <span>{status.diffDays < 1 ? `${Math.max(0, Math.round(status.diffDays * 24))}h` : `${Math.round(status.diffDays)}d`}</span>
          </div>
          <Progress value={status.progressValue} className={`h-1.5 ${c.progressClass ? `[&>div]:${c.progressClass}` : ''}`} />
        </div>
      )}

      {(status.level === 'expired' || status.level === 'warning') && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {status.level === 'expired'
              ? 'A sessão expirou. Reconecte para continuar sincronizando.'
              : 'Renove a sessão para evitar interrupções.'}
          </p>
          <Button onClick={onReconnect} size="sm" variant="outline" className="gap-1 ml-2 shrink-0">
            <RefreshCw className="h-3 w-3" /> Reconectar
          </Button>
        </div>
      )}

      {status.level === 'active' && (
        <p className="text-[11px] text-muted-foreground/70">
          Em modo de teste do Google, a sessão expira a cada 7 dias. Reconecte quando necessário.
        </p>
      )}
    </div>
  );
}

function WebhookStatusCard({ syncConfig }: { syncConfig: any }) {
  const status = useMemo(() => {
    if (!syncConfig?.sync_channel_id) {
      return { level: 'inactive' as const, label: 'Inativo', description: 'Webhook não configurado' };
    }
    if (!syncConfig?.sync_expiration) {
      return { level: 'active' as const, label: 'Ativo', description: 'Sem data de expiração registrada' };
    }

    const now = new Date();
    const expiration = new Date(syncConfig.sync_expiration);
    const diffMs = expiration.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    const totalDays = 7; // Google watch channels last ~7 days
    const progressValue = Math.max(0, Math.min(100, (diffDays / totalDays) * 100));

    if (diffMs <= 0) {
      return { level: 'expired' as const, label: 'Expirado', description: `Expirou em ${expiration.toLocaleDateString('pt-BR')} às ${expiration.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, progressValue: 0, diffDays: 0 };
    }
    if (diffDays <= 2) {
      return { level: 'warning' as const, label: 'Expirando em breve', description: `Expira em ${expiration.toLocaleDateString('pt-BR')} às ${expiration.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, progressValue, diffDays };
    }
    return { level: 'active' as const, label: 'Ativo', description: `Expira em ${expiration.toLocaleDateString('pt-BR')} às ${expiration.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, progressValue, diffDays };
  }, [syncConfig]);

  const config = {
    expired: { icon: XCircle, badgeVariant: 'destructive' as const, progressClass: 'bg-destructive', borderClass: 'border-destructive/30 bg-destructive/5', textClass: 'text-destructive' },
    warning: { icon: AlertTriangle, badgeVariant: 'secondary' as const, progressClass: 'bg-orange-500', borderClass: 'border-orange-500/30 bg-orange-500/5', textClass: 'text-orange-600 dark:text-orange-400' },
    active: { icon: ShieldCheck, badgeVariant: 'default' as const, progressClass: '', borderClass: 'border-primary/20 bg-primary/5', textClass: 'text-primary' },
    inactive: { icon: XCircle, badgeVariant: 'secondary' as const, progressClass: '', borderClass: 'border-muted bg-muted/30', textClass: 'text-muted-foreground' },
  };

  const c = config[status.level];
  const Icon = c.icon;

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${c.borderClass}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${c.textClass}`} />
          <span className={`text-sm font-medium ${c.textClass}`}>Watch Channel</span>
        </div>
        <Badge variant={c.badgeVariant} className="text-xs gap-1">
          {status.level === 'active' && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse" />}
          {status.label}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Clock className="h-3 w-3" />
        {status.description}
      </p>

      {status.progressValue !== undefined && status.level !== 'inactive' && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Tempo restante</span>
            <span>{status.diffDays !== undefined ? (status.diffDays < 1 ? `${Math.max(0, Math.round(status.diffDays * 24))}h` : `${Math.round(status.diffDays)}d`) : ''}</span>
          </div>
          <Progress value={status.progressValue} className={`h-1.5 ${c.progressClass ? `[&>div]:${c.progressClass}` : ''}`} />
        </div>
      )}

      {status.level === 'expired' && (
        <p className="text-xs text-destructive/80">
          A renovação automática ocorre diariamente às 03:00. Clique em "Renovar webhook" para renovar agora.
        </p>
      )}
      {status.level === 'active' && (
        <p className="text-[11px] text-muted-foreground/70">
          Renovação automática agendada diariamente às 03:00 AM.
        </p>
      )}
    </div>
  );
}

function GoogleDriveConfig({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [folderId, setFolderId] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ total: 0, done: 0, errors: 0 });
  const [failedNFs, setFailedNFs] = useState<{ id: string; doctor_name: string; nf_number: string | null; error: string }[]>([]);

  const settingKey = `google_drive_root_folder_id_${companyId}`;

  // Query pending NFs count
  const { data: pendingNFs } = useQuery({
    queryKey: ['pending-drive-nfs', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professional_payments')
        .select('id, doctor_name, nf_number')
        .eq('company_id', companyId)
        .not('nf_file_url', 'is', null)
        .is('drive_file_id', null);
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    setLoaded(false);
    setFolderId('');
    (async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', settingKey)
        .eq('is_active', true)
        .maybeSingle();
      if (data?.value) {
        setFolderId(data.value);
      } else {
        const { data: global } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'google_drive_root_folder_id')
          .eq('is_active', true)
          .maybeSingle();
        if (global?.value) setFolderId(global.value);
      }
      setLoaded(true);
    })();
  }, [companyId, settingKey]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from('system_settings')
        .select('id')
        .eq('key', settingKey)
        .maybeSingle();

      if (existing) {
        await supabase.from('system_settings').update({ value: folderId, is_active: true }).eq('id', existing.id);
      } else {
        await supabase.from('system_settings').insert({ key: settingKey, value: folderId, description: `ID da pasta raiz do Google Drive (${companyId})`, is_active: true });
      }
      toast({ title: 'Pasta do Google Drive salva!' });
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleBatchSync = async () => {
    if (!pendingNFs?.length) return;
    setSyncing(true);
    setSyncProgress({ total: pendingNFs.length, done: 0, errors: 0 });
    setFailedNFs([]);

    let done = 0;
    let errors = 0;
    const failed: typeof failedNFs = [];

    for (const nf of pendingNFs) {
      try {
        const { data, error } = await supabase.functions.invoke('sync-drive', {
          body: { payment_id: nf.id, company_id: companyId },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        done++;
      } catch (err: any) {
        const errMsg = err?.message || 'Erro desconhecido';
        console.error(`Erro ao sincronizar NF ${nf.nf_number || nf.id}:`, err);
        errors++;
        failed.push({ id: nf.id, doctor_name: nf.doctor_name, nf_number: nf.nf_number, error: errMsg });
      }
      setSyncProgress({ total: pendingNFs.length, done: done + errors, errors });
    }

    setFailedNFs(failed);
    setSyncing(false);
    toast({
      title: 'Sincronização em lote concluída',
      description: `${done} NFs enviadas com sucesso${errors > 0 ? `, ${errors} erro(s) - veja detalhes abaixo` : ''}`,
      variant: errors > 0 ? 'destructive' : 'default',
    });
  };

  if (!loaded) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
            <HardDrive className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <CardTitle className="text-lg">Google Drive</CardTitle>
            <CardDescription>Upload automático de Notas Fiscais organizadas por cidade e mês</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="drive-folder-id">ID da Pasta Raiz do Google Drive</Label>
          <div className="flex gap-2">
            <Input
              id="drive-folder-id"
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              placeholder="Ex: 1AbCdEfGhIjKlMnOpQrStUvWxYz"
              className="flex-1"
            />
            <Button onClick={handleSave} disabled={saving || !folderId.trim()} className="gap-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Copie o ID da pasta do Google Drive (parte final da URL da pasta). As NFs serão organizadas em subpastas: Cidade → Mês.
          </p>
        </div>
        {folderId && (
          <Badge variant="outline" className="gap-1 text-xs">
            <CheckCircle2 className="h-3 w-3" /> Pasta configurada
          </Badge>
        )}

        {/* Batch Sync */}
        {folderId && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Sincronização em lote</span>
              </div>
              <Badge variant="secondary" className="text-xs">
                {pendingNFs?.length || 0} NFs pendentes
              </Badge>
            </div>

            {syncing ? (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Enviando para o Drive...</span>
                  <span>{syncProgress.done}/{syncProgress.total}{syncProgress.errors > 0 && ` (${syncProgress.errors} erros)`}</span>
                </div>
                <Progress value={(syncProgress.done / syncProgress.total) * 100} className="h-2" />
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Enviar todas as NFs pendentes para o Google Drive de uma vez.
                </p>
                <Button
                  onClick={handleBatchSync}
                  disabled={!pendingNFs?.length}
                  size="sm"
                  variant="outline"
                  className="gap-1 shrink-0"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Sincronizar tudo
                </Button>
              </div>
            )}

            {/* Failed NFs details */}
            {failedNFs.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium text-destructive flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5" />
                  {failedNFs.length} NF(s) com erro:
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1.5">
                  {failedNFs.map((nf) => (
                    <div key={nf.id} className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{nf.nf_number ? `NF ${nf.nf_number}` : 'NF sem número'}</span>
                        <span className="text-muted-foreground"> — {nf.doctor_name}</span>
                        <p className="text-muted-foreground truncate mt-0.5">{nf.error}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs shrink-0"
                        onClick={async () => {
                          try {
                            const { data, error } = await supabase.functions.invoke('sync-drive', {
                              body: { payment_id: nf.id, company_id: companyId },
                            });
                            if (error) throw error;
                            if (data?.error) throw new Error(data.error);
                            setFailedNFs(prev => prev.filter(f => f.id !== nf.id));
                            toast({ title: `NF ${nf.nf_number || ''} sincronizada com sucesso!` });
                          } catch (err: any) {
                            toast({ title: 'Erro ao reenviar', description: err?.message, variant: 'destructive' });
                          }
                        }}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Reenviar
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
