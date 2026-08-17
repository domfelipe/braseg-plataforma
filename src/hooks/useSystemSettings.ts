import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseSystemSettingsReturn {
  settings: Record<string, string>;
  loading: boolean;
  error: Error | null;
  refreshSettings: () => Promise<void>;
}

export const useSystemSettings = (key?: string): UseSystemSettingsReturn => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('system_settings' as any)
        .select('key, value')
        .eq('is_active', true);

      if (key) {
        const { data, error: fetchError } = await query.eq('key', key).single();
        if (fetchError) throw fetchError;
        if (data) {
          setSettings({ [(data as any).key]: (data as any).value });
        } else {
          setSettings({});
        }
        return;
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      if (Array.isArray(data)) {
        const settingsObj = data.reduce((acc: Record<string, string>, item: any) => {
          acc[item.key] = item.value;
          return acc;
        }, {});
        setSettings(settingsObj);
      } else {
        setSettings({});
      }
    } catch (err) {
      console.error('Erro ao buscar configurações do sistema:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [key]);

  return { settings, loading, error, refreshSettings: fetchSettings };
};

export async function getSystemSetting(key: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('system_settings' as any)
      .select('value')
      .eq('key', key)
      .eq('is_active', true)
      .single();

    if (error || !data) return null;
    return (data as any).value;
  } catch {
    return null;
  }
}

export async function upsertSetting(key: string, value: string, description: string) {
  const { data: existing } = await supabase
    .from('system_settings' as any)
    .select('id')
    .eq('key', key)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('system_settings' as any)
      .update({ value } as any)
      .eq('key', key);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('system_settings' as any)
      .insert({ key, value, description, is_active: true } as any);
    if (error) throw error;
  }
}
