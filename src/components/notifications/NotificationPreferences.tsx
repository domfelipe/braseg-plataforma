import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Bell, Smartphone, Loader2 } from "lucide-react";

const PREF_LABELS: Record<string, string> = {
  pagamento_recebido: "Novas notas fiscais recebidas",
  pagamento_status: "Mudanças de status em pagamentos",
  vencimento_proximo: "Vencimentos próximos",
  vencimento_frota: "Vencimentos de veículos (IPVA, licenciamento, seguro)",
  sistema: "Notificações do sistema",
};

type Prefs = Record<string, boolean>;

function PushToggle() {
  const { isSupported, isSubscribed, permission, loading, subscribe, unsubscribe } = usePushNotifications();

  if (!isSupported) return null;

  const denied = permission === "denied";

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Smartphone className="h-4 w-4 text-muted-foreground" />
        <div>
          <span className="text-sm">Notificações push no navegador</span>
          {denied && (
            <p className="text-[11px] text-destructive">
              Permissão bloqueada. Desbloqueie nas configurações do navegador.
            </p>
          )}
        </div>
      </div>
      <Switch
        checked={isSubscribed}
        onCheckedChange={(v) => (v ? subscribe() : unsubscribe())}
        disabled={loading || denied}
      />
    </div>
  );
}

export function NotificationPreferences() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from("user_profiles")
      .select("notification_preferences")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        setPrefs((data?.notification_preferences as Prefs) || {
          pagamento_recebido: true,
          pagamento_status: true,
          vencimento_proximo: true,
          sistema: true,
        });
      });
  }, [session?.user?.id]);

  const toggle = async (key: string, value: boolean) => {
    if (!session?.user?.id || !prefs) return;
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    setSaving(true);
    const { error } = await supabase
      .from("user_profiles")
      .update({ notification_preferences: updated as any })
      .eq("id", session.user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar preferências", variant: "destructive" });
      setPrefs(prefs); // revert
    }
  };

  if (!prefs) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="h-5 w-5" /> Notificações
        </CardTitle>
        <CardDescription>Escolha quais notificações deseja receber</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <PushToggle />
        <div className="border-t pt-4 space-y-4">
          {Object.entries(PREF_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm">{label}</span>
              <Switch
                checked={prefs[key] !== false}
                onCheckedChange={(v) => toggle(key, v)}
                disabled={saving}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
