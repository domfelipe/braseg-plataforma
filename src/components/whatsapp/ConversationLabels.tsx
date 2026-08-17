import { useEffect, useState, useCallback, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tags, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  listLabels, getConversationLabels, updateConversationLabels,
  type ChatwootConfig, type ChatwootLabel,
} from '@/lib/chatwootApi';

interface Props {
  config: ChatwootConfig;
  conversationId: number;
}

export default function ConversationLabels({ config, conversationId }: Props) {
  const [allLabels, setAllLabels] = useState<ChatwootLabel[]>([]);
  const [activeLabels, setActiveLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Ref to track the latest desired labels for debounced save
  const pendingLabelsRef = useRef<string[] | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [all, active] = await Promise.all([
        listLabels(config),
        getConversationLabels(config, conversationId),
      ]);
      setAllLabels(all);
      setActiveLabels(active);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [config, conversationId]);

  useEffect(() => { load(); }, [load]);

  // Flush pending labels to the API
  const flushSave = useCallback(async () => {
    if (pendingLabelsRef.current === null) return;
    if (isSavingRef.current) return; // will be retried after current save

    const labelsToSave = pendingLabelsRef.current;
    pendingLabelsRef.current = null;
    isSavingRef.current = true;
    setSaving(true);

    try {
      const result = await updateConversationLabels(config, conversationId, labelsToSave);
      setActiveLabels(result);
    } catch {
      toast.error('Erro ao atualizar etiquetas');
    } finally {
      isSavingRef.current = false;
      // If more changes came in while we were saving, flush again
      if (pendingLabelsRef.current !== null) {
        flushSave();
      } else {
        setSaving(false);
      }
    }
  }, [config, conversationId]);

  const toggle = (label: string, checked: boolean) => {
    setActiveLabels(prev => {
      const next = checked
        ? [...prev, label]
        : prev.filter(l => l !== label);

      // Schedule a debounced save
      pendingLabelsRef.current = next;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        flushSave();
      }, 500);

      return next;
    });
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const getLabelColor = (title: string) => {
    const found = allLabels.find(l => l.title === title);
    return found?.color || undefined;
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {activeLabels.map(label => (
        <Badge
          key={label}
          variant="outline"
          className="text-[10px] px-1.5 py-0 h-5"
          style={getLabelColor(label) ? { borderColor: getLabelColor(label), color: getLabelColor(label) } : undefined}
        >
          {label}
        </Badge>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Tags className="h-3 w-3" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="text-xs font-medium mb-2 text-muted-foreground flex items-center gap-2">
            Etiquetas
            {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <ScrollArea className="max-h-48">
            <div className="space-y-1">
              {allLabels.map(label => {
                const isActive = activeLabels.includes(label.title);
                return (
                  <label
                    key={label.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={isActive}
                      onCheckedChange={(checked) => toggle(label.title, !!checked)}
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: label.color || 'hsl(var(--muted-foreground))' }}
                    />
                    <span className="truncate">{label.title}</span>
                  </label>
                );
              })}
              {allLabels.length === 0 && !loading && (
                <div className="text-xs text-muted-foreground text-center py-2">Nenhuma etiqueta</div>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
