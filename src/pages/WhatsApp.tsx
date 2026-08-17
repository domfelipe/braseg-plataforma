import { useEffect, useMemo, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Send, Loader2, RefreshCw, MessageSquare, AlertTriangle, UserCircle, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import {
  getChatwootConfigForCompany, listConversations, getMessages, sendMessage,
  type ChatwootConfig, type ChatwootConversation, type ChatwootMessage, type ChatwootAttachment,
} from '@/lib/chatwootApi';
import { useCompany } from '@/hooks/useCompany';
import { useIsMobile } from '@/hooks/use-mobile';
import ConversationLabels from '@/components/whatsapp/ConversationLabels';
import ContactDetailsPanel from '@/components/whatsapp/ContactDetailsPanel';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { PullToRefresh } from '@/components/PullToRefresh';

function formatTimestamp(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function AttachmentPreview({ attachment }: { attachment: ChatwootAttachment }) {
  const url = attachment.data_url;
  if (!url) return null;
  if (attachment.file_type === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={attachment.thumb_url || url} alt="imagem" className="max-w-full rounded-md border mb-1" />
      </a>
    );
  }
  if (attachment.file_type === 'audio') {
    return <audio controls src={url} className="max-w-full" />;
  }
  if (attachment.file_type === 'video') {
    return <video controls className="w-full rounded-md border"><source src={url} /></video>;
  }
  return <a href={url} target="_blank" rel="noreferrer" className="underline text-xs">📎 Abrir arquivo</a>;
}

export default function WhatsApp() {
  const { selectedCompany } = useCompany();
  const isMobile = useIsMobile();

  const [chatwootConfig, setChatwootConfig] = useState<ChatwootConfig | null>(null);
  const [companyInboxId, setCompanyInboxId] = useState<number | undefined>(undefined);
  const [configLoading, setConfigLoading] = useState(true);
  const [noConfig, setNoConfig] = useState(false);

  const [conversations, setConversations] = useState<ChatwootConversation[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);

  const [messages, setMessages] = useState<ChatwootMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Load per-company config
  useEffect(() => {
    if (!selectedCompany) {
      setChatwootConfig(null);
      setNoConfig(true);
      setConfigLoading(false);
      return;
    }
    (async () => {
      setConfigLoading(true);
      setNoConfig(false);
      setSelectedConvId(null);
      setMessages([]);
      setConversations([]);
      try {
        const cfg = await getChatwootConfigForCompany(selectedCompany.id);
        if (cfg) {
          setChatwootConfig(cfg);
          setCompanyInboxId(cfg.inboxId);
          setNoConfig(false);
        } else {
          setChatwootConfig(null);
          setNoConfig(true);
        }
      } catch {
        setChatwootConfig(null);
        setNoConfig(true);
      } finally {
        setConfigLoading(false);
      }
    })();
  }, [selectedCompany]);

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!chatwootConfig) return;
    setConvLoading(true);
    try {
      const convs = await listConversations(chatwootConfig, companyInboxId);
      setConversations(convs);
    } catch {
      toast.error('Erro ao carregar conversas do WhatsApp');
    } finally {
      setConvLoading(false);
    }
  }, [chatwootConfig, companyInboxId]);

  useEffect(() => { if (chatwootConfig) loadConversations(); }, [chatwootConfig, loadConversations]);

  // Load messages
  const loadMessages = useCallback(async (convId: number) => {
    if (!chatwootConfig) return;
    setMsgLoading(true);
    try {
      const msgs = await getMessages(chatwootConfig, convId);
      setMessages(msgs.sort((a, b) => a.created_at - b.created_at));
    } catch {
      toast.error('Erro ao carregar mensagens');
    } finally {
      setMsgLoading(false);
    }
  }, [chatwootConfig]);

  useEffect(() => { if (selectedConvId !== null) loadMessages(selectedConvId); }, [selectedConvId, loadMessages]);

  // Send message
  const handleSend = async () => {
    if (!messageText.trim() || selectedConvId === null || !chatwootConfig) return;
    setSending(true);
    try {
      const newMsg = await sendMessage(chatwootConfig, selectedConvId, messageText.trim());
      setMessages(prev => [...prev, newMsg]);
      setMessageText('');
      toast.success('Mensagem enviada!');
    } catch {
      toast.error('Erro ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter(c => {
      const name = (c.meta?.sender?.name ?? '').toLowerCase();
      const lastMsg = (c.last_non_activity_message?.content ?? '').toLowerCase();
      return name.includes(term) || lastMsg.includes(term);
    });
  }, [conversations, search]);

  const selectedConv = useMemo(() => conversations.find(c => c.id === selectedConvId) ?? null, [conversations, selectedConvId]);
  const displayName = selectedConv?.meta?.sender?.name ?? (selectedConvId ? `Conversa #${selectedConvId}` : '');

  // On mobile, determine which pane to show
  const showConvList = !isMobile || selectedConvId === null;
  const showMessages = !isMobile || selectedConvId !== null;

  // No config for this company
  if (!configLoading && noConfig) {
    return (
      <div className="p-4 sm:p-6 flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full p-6 sm:p-8 text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
          <h2 className="text-xl font-semibold">WhatsApp não configurado</h2>
          <p className="text-sm text-muted-foreground">
            A empresa <strong>{selectedCompany?.trade_name || selectedCompany?.name || 'selecionada'}</strong> ainda não possui configuração do Chatwoot. Solicite a um super administrador que configure na página de Integrações.
          </p>
        </Card>
      </div>
    );
  }

  const conversationListPane = (
    <div className={`border-r flex flex-col min-h-0 ${isMobile ? 'w-full animate-fade-in' : 'w-[340px]'} shrink-0`}>
      <div className="px-3 pt-4 pb-3 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Conversas</h2>
          <Button variant="ghost" size="icon" onClick={loadConversations} disabled={convLoading} className="h-8 w-8">
            {convLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
        <Input placeholder="Buscar por nome ou mensagem…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isMobile ? (
        <PullToRefresh onRefresh={loadConversations} className="flex-1 min-h-0">
          <div className="space-y-1 px-3 pb-4">
            {(convLoading || configLoading) && (
              <div className="space-y-2 p-2">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
              </div>
            )}
            {!convLoading && !configLoading && filteredConversations.length === 0 && (
              <div className="text-sm text-muted-foreground px-2 py-4 text-center">Nenhuma conversa</div>
            )}
            {filteredConversations.map(conv => {
              const active = conv.id === selectedConvId;
              const senderName = conv.meta?.sender?.name ?? `#${conv.id}`;
              const lastMsg = conv.last_non_activity_message?.content ?? '';
              const ts = conv.timestamp ? formatTimestamp(conv.timestamp) : null;
              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.id)}
                  className={`block w-full text-left px-3 py-2.5 rounded-xl transition-colors ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/50'}`}
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className={`text-xs ${active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary'}`}>
                        {senderName[0]?.toUpperCase() ?? '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">{senderName}</span>
                        {conv.unread_count > 0 && (
                          <Badge className={`ml-1 text-[10px] px-1.5 py-0 h-5 shrink-0 ${active ? 'bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30' : ''}`}>{conv.unread_count}</Badge>
                        )}
                      </div>
                      <div className={`text-xs truncate ${active ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{lastMsg}</div>
                      {ts && <div className={`text-[10px] ${active ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>{ts}</div>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </PullToRefresh>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-1 px-3 pb-4">
            {(convLoading || configLoading) && (
              <div className="space-y-2 p-2">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
              </div>
            )}
            {!convLoading && !configLoading && filteredConversations.length === 0 && (
              <div className="text-sm text-muted-foreground px-2 py-4 text-center">Nenhuma conversa</div>
            )}
            {filteredConversations.map(conv => {
              const active = conv.id === selectedConvId;
              const senderName = conv.meta?.sender?.name ?? `#${conv.id}`;
              const lastMsg = conv.last_non_activity_message?.content ?? '';
              const ts = conv.timestamp ? formatTimestamp(conv.timestamp) : null;
              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.id)}
                  className={`block w-full text-left px-3 py-2.5 rounded-xl transition-colors ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/50'}`}
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className={`text-xs ${active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary'}`}>
                        {senderName[0]?.toUpperCase() ?? '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">{senderName}</span>
                        {conv.unread_count > 0 && (
                          <Badge className={`ml-1 text-[10px] px-1.5 py-0 h-5 shrink-0 ${active ? 'bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30' : ''}`}>{conv.unread_count}</Badge>
                        )}
                      </div>
                      <div className={`text-xs truncate ${active ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{lastMsg}</div>
                      {ts && <div className={`text-[10px] ${active ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>{ts}</div>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );

  const messagesPane = (
    <div className={`flex flex-col h-full min-h-0 flex-1 ${isMobile ? 'animate-slide-in-from-right' : ''}`}>
      <div className="px-3 sm:px-4 py-3 border-b flex items-center gap-2 sm:gap-3">
        {selectedConvId !== null ? (
          <>
            {isMobile && (
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSelectedConvId(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarFallback className="text-xs">{displayName?.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate">{displayName}</div>
              <div className="text-xs text-muted-foreground">{messages.length} mensagens</div>
            </div>
            {chatwootConfig && (
              <ConversationLabels config={chatwootConfig} conversationId={selectedConvId} />
            )}
            {selectedConv?.meta?.sender?.id && (
              <Button
                variant={showDetails ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setShowDetails(prev => !prev)}
              >
                <UserCircle className="h-4 w-4" />
              </Button>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground">Selecione uma conversa</div>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0 px-3 sm:px-4 py-4">
        <div className="space-y-3">
          {msgLoading && <div className="text-sm text-muted-foreground text-center py-4">Carregando mensagens…</div>}
          {!msgLoading && messages.length === 0 && selectedConvId !== null && (
            <div className="text-sm text-muted-foreground text-center py-4">Nenhuma mensagem</div>
          )}
          {!msgLoading && selectedConvId === null && (
            <div className="flex flex-col items-center justify-center h-full py-20 text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">Selecione uma conversa para ver as mensagens</p>
            </div>
          )}
          {messages.map((m) => {
            if (m.message_type === 2) return null;
            const isOutgoing = m.message_type === 1;
            const ts = m.created_at ? formatTimestamp(m.created_at) : null;
            return (
              <div key={m.id} className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                  isOutgoing ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-bl-sm'
                }`}>
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="space-y-1 mb-1">
                      {m.attachments.map(att => <AttachmentPreview key={att.id} attachment={att} />)}
                    </div>
                  )}
                  {m.content && <div>{m.content}</div>}
                  {ts && <div className={`mt-1 text-[10px] opacity-70 ${isOutgoing ? 'text-primary-foreground' : 'text-foreground/70'}`}>{ts}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {selectedConvId !== null && (
        <div className="px-3 sm:px-4 py-3 border-t flex items-center gap-2">
          <Input
            placeholder="Digite uma mensagem…"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyPress}
            disabled={sending}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={sending || !messageText.trim()} size="icon">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </div>
  );

  const contactDetailsContent = showDetails && selectedConv?.meta?.sender?.id && chatwootConfig && (
    <ContactDetailsPanel
      config={chatwootConfig}
      contactId={selectedConv.meta.sender.id}
      onClose={() => setShowDetails(false)}
    />
  );

  return (
    <div className="h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)] p-2 sm:p-4">
      <Card className="h-full overflow-hidden">
        <div className="h-full min-h-0 flex">
          {/* On mobile: show either list or messages */}
          {showConvList && conversationListPane}
          {showMessages && messagesPane}

          {/* Contact details: sheet on mobile, inline on desktop */}
          {isMobile ? (
            <Sheet open={showDetails && !!selectedConv?.meta?.sender?.id} onOpenChange={(open) => !open && setShowDetails(false)}>
              <SheetContent side="right" className="p-0 w-[85vw] sm:w-[400px]">
                {contactDetailsContent}
              </SheetContent>
            </Sheet>
          ) : (
            contactDetailsContent
          )}
        </div>
      </Card>
    </div>
  );
}
