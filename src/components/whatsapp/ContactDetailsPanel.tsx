import { useEffect, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  getContact, updateContact,
  type ChatwootConfig, type ChatwootContactFull,
} from '@/lib/chatwootApi';

interface Props {
  config: ChatwootConfig;
  contactId: number;
  onClose: () => void;
}

export default function ContactDetailsPanel({ config, contactId, onClose }: Props) {
  const [contact, setContact] = useState<ChatwootContactFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await getContact(config, contactId);
      setContact(c);
      setName(c.name || '');
      setEmail(c.email || '');
      setPhone(c.phone_number || '');
      setCompany(c.company_name || '');
    } catch {
      toast.error('Erro ao carregar contato');
    } finally {
      setLoading(false);
    }
  }, [config, contactId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateContact(config, contactId, {
        name: name.trim(),
        email: email.trim() || null,
        phone_number: phone.trim() || null,
        company_name: company.trim() || null,
      });
      setContact(updated);
      toast.success('Contato atualizado!');
    } catch {
      toast.error('Erro ao salvar contato');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-l flex flex-col h-full min-h-0 w-[300px]">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <span className="text-sm font-semibold">Detalhes do contato</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-2">
                <Avatar className="h-16 w-16">
                  {contact?.thumbnail && <AvatarImage src={contact.thumbnail} />}
                  <AvatarFallback className="text-lg bg-primary/10 text-primary">
                    {name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-sm">{name || 'Sem nome'}</span>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Telefone</Label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">E-mail</Label>
                  <Input value={email} onChange={e => setEmail(e.target.value)} type="email" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Empresa</Label>
                  <Input value={company} onChange={e => setCompany(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full" size="sm">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar
              </Button>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
