import { getSystemSetting } from '@/hooks/useSystemSettings';

// ── Types ──────────────────────────────────────────────────────────

export interface ChatwootConfig {
  baseUrl: string;
  token: string;
  accountId: string;
}

export interface ChatwootInbox {
  id: number;
  name: string;
  channel_type: string;
  channel_id?: number;
  phone_number?: string;
  avatar_url?: string;
  [key: string]: any;
}

export interface ChatwootConversation {
  id: number;
  inbox_id: number;
  status: string;
  unread_count: number;
  last_non_activity_message?: {
    content?: string;
    created_at?: number;
  };
  timestamp?: number;
  meta: {
    sender?: {
      id: number;
      name: string;
      phone_number?: string;
      thumbnail?: string;
      [key: string]: any;
    };
    channel?: string;
    [key: string]: any;
  };
  messages?: ChatwootMessage[];
  [key: string]: any;
}

export interface ChatwootMessage {
  id: number;
  content: string | null;
  message_type: number; // 0 = incoming, 1 = outgoing, 2 = activity
  created_at: number;
  conversation_id?: number;
  content_type?: string;
  sender?: {
    id: number;
    name: string;
    type?: string;
    thumbnail?: string;
    [key: string]: any;
  };
  attachments?: ChatwootAttachment[];
  [key: string]: any;
}

export interface ChatwootAttachment {
  id: number;
  message_id: number;
  file_type: string;
  account_id: number;
  data_url: string;
  thumb_url?: string;
  extension?: string;
  [key: string]: any;
}

export interface ChatwootContact {
  id: number;
  name: string;
  phone_number?: string;
  email?: string;
  thumbnail?: string;
  [key: string]: any;
}

// ── Config loader ──────────────────────────────────────────────────

/** Load global Chatwoot config from system_settings (legacy / fallback) */
export async function getChatwootConfig(): Promise<ChatwootConfig | null> {
  try {
    const [baseUrl, token, accountId] = await Promise.all([
      getSystemSetting('api_base_url'),
      getSystemSetting('chatwoot_api_token'),
      getSystemSetting('chatwoot_account_id'),
    ]);

    if (!baseUrl || !token || !accountId) return null;

    return {
      baseUrl: baseUrl.replace(/\/+$/, ''),
      token,
      accountId,
    };
  } catch (err) {
    console.error('[Chatwoot] Erro ao carregar config:', err);
    return null;
  }
}

/** Load per-company Chatwoot config from company_chatwoot_config table */
export async function getChatwootConfigForCompany(companyId: string): Promise<(ChatwootConfig & { inboxId?: number }) | null> {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase
      .from('company_chatwoot_config' as any)
      .select('chatwoot_base_url, chatwoot_api_token, chatwoot_account_id, inbox_id')
      .eq('company_id', companyId)
      .maybeSingle();

    if (error || !data) return null;
    const row = data as any;
    if (!row.chatwoot_base_url || !row.chatwoot_api_token || !row.chatwoot_account_id) return null;

    return {
      baseUrl: row.chatwoot_base_url.replace(/\/+$/, ''),
      token: row.chatwoot_api_token,
      accountId: row.chatwoot_account_id,
      inboxId: row.inbox_id ?? undefined,
    };
  } catch (err) {
    console.error('[Chatwoot] Erro ao carregar config da empresa:', err);
    return null;
  }
}

// ── Generic fetch wrapper (via Edge Function proxy) ────────────────

async function chatwootFetch<T = any>(
  config: ChatwootConfig,
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body as string) : undefined;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const functionUrl = `${supabaseUrl}/functions/v1/chatwoot-api`;

  const res = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ config, endpoint, method, body }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Chatwoot] Proxy error:', res.status, errorText);
    throw new Error(`Chatwoot proxy error: ${res.status} ${errorText}`);
  }

  return await res.json() as T;
}

// ── API functions ──────────────────────────────────────────────────

export async function listInboxes(config: ChatwootConfig): Promise<ChatwootInbox[]> {
  const data = await chatwootFetch<{ payload?: ChatwootInbox[] }>(config, '/inboxes');
  return data.payload ?? (Array.isArray(data) ? data : []);
}

export async function listConversations(
  config: ChatwootConfig,
  inboxId?: number,
  page = 1,
): Promise<ChatwootConversation[]> {
  const params = new URLSearchParams({ page: String(page) });
  if (inboxId) params.set('inbox_id', String(inboxId));

  const data = await chatwootFetch<{ data?: { payload?: ChatwootConversation[] } }>(
    config,
    `/conversations?${params.toString()}`,
  );

  const payload = data?.data?.payload ?? (data as any)?.payload ?? [];
  return Array.isArray(payload) ? payload : [];
}

export async function getMessages(
  config: ChatwootConfig,
  conversationId: number,
): Promise<ChatwootMessage[]> {
  const data = await chatwootFetch<{ payload?: ChatwootMessage[] }>(
    config,
    `/conversations/${conversationId}/messages`,
  );
  return data.payload ?? (Array.isArray(data) ? data : []);
}

export async function sendMessage(
  config: ChatwootConfig,
  conversationId: number,
  content: string,
): Promise<ChatwootMessage> {
  return await chatwootFetch<ChatwootMessage>(
    config,
    `/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ content, message_type: 'outgoing' }),
    },
  );
}

export async function searchContacts(
  config: ChatwootConfig,
  query: string,
): Promise<ChatwootContact[]> {
  const data = await chatwootFetch<{ payload?: ChatwootContact[] }>(
    config,
    `/contacts/search?q=${encodeURIComponent(query)}`,
  );
  return data.payload ?? (Array.isArray(data) ? data : []);
}

// ── Helpers ────────────────────────────────────────────────────────

export function isWhatsAppInbox(inbox: ChatwootInbox): boolean {
  if (inbox.channel_type === 'Channel::Whatsapp') return true;
  const name = (inbox.name ?? '').toLowerCase();
  return name.includes('whatsapp') || name.includes('baileys');
}

// ── Labels ────────────────────────────────────────────────────────

export interface ChatwootLabel {
  id: number;
  title: string;
  description: string | null;
  color: string;
  show_on_sidebar: boolean;
}

export async function listLabels(config: ChatwootConfig): Promise<ChatwootLabel[]> {
  const data = await chatwootFetch<{ payload?: ChatwootLabel[] }>(config, '/labels');
  return data.payload ?? (Array.isArray(data) ? data : []);
}

export async function getConversationLabels(config: ChatwootConfig, conversationId: number): Promise<string[]> {
  const data = await chatwootFetch<{ payload?: string[] }>(config, `/conversations/${conversationId}/labels`);
  return data.payload ?? (Array.isArray(data) ? data : []);
}

export async function updateConversationLabels(config: ChatwootConfig, conversationId: number, labels: string[]): Promise<string[]> {
  const data = await chatwootFetch<{ payload?: string[] }>(
    config,
    `/conversations/${conversationId}/labels`,
    { method: 'POST', body: JSON.stringify({ labels }) },
  );
  return data.payload ?? (Array.isArray(data) ? data : []);
}

// ── Contacts ──────────────────────────────────────────────────────

export interface ChatwootContactFull {
  id: number;
  name: string;
  email: string | null;
  phone_number: string | null;
  company_name?: string | null;
  additional?: Record<string, any>;
  thumbnail?: string;
  [key: string]: any;
}

export async function getContact(config: ChatwootConfig, contactId: number): Promise<ChatwootContactFull> {
  const data = await chatwootFetch<ChatwootContactFull | { payload?: ChatwootContactFull }>(config, `/contacts/${contactId}`);
  return (data as any)?.payload ?? data;
}

export async function updateContact(
  config: ChatwootConfig,
  contactId: number,
  data: Partial<Pick<ChatwootContactFull, 'name' | 'email' | 'phone_number' | 'company_name'>>,
): Promise<ChatwootContactFull> {
  return await chatwootFetch<ChatwootContactFull>(config, `/contacts/${contactId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
