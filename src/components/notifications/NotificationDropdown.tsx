import { Bell, CheckCheck, FileText, CreditCard, Clock, Info, Car, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useNotifications, Notification } from "@/hooks/useNotifications";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";

const typeConfig: Record<string, { icon: typeof Bell; className: string }> = {
  pagamento_recebido: { icon: FileText, className: "text-blue-500" },
  pagamento_status: { icon: CreditCard, className: "text-emerald-500" },
  vencimento_proximo: { icon: Clock, className: "text-amber-500" },
  vencimento_frota: { icon: Car, className: "text-orange-500" },
  sistema: { icon: Info, className: "text-muted-foreground" },
};

function NotificationItem({ notification, onRead }: { notification: Notification; onRead: (n: Notification) => void }) {
  const config = typeConfig[notification.type] || typeConfig.sistema;
  const Icon = config.icon;

  return (
    <button
      onClick={() => onRead(notification)}
      className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-muted/50 transition-colors ${!notification.read ? "bg-primary/5" : ""}`}
    >
      <div className={`mt-0.5 shrink-0 ${config.className}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-tight ${!notification.read ? "font-semibold" : "font-medium"}`}>
          {notification.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.message}</p>
        <p className="text-[10px] text-muted-foreground mt-1">
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: ptBR })}
        </p>
      </div>
      {!notification.read && (
        <span className="mt-1.5 shrink-0 h-2 w-2 rounded-full bg-primary" />
      )}
    </button>
  );
}

export function NotificationDropdown() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleRead = (n: Notification) => {
    if (!n.read) markAsRead(n.id);
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-primary/5 transition-colors">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <h4 className="font-semibold text-sm">Notificações</h4>
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={markAllAsRead}>
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar todas
              </Button>
            )}
            {notifications.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={clearAll}>
                <Trash2 className="h-3.5 w-3.5" />
                Limpar
              </Button>
            )}
          </div>
        </div>
        <Separator />
        <ScrollArea className="h-80">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma notificação
            </div>
          ) : (
            notifications.map((n) => (
              <NotificationItem key={n.id} notification={n} onRead={handleRead} />
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
