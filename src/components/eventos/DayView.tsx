import { format, isSameDay, parseISO, getHours, getMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getEventColorClass } from "./EventDialog";

interface EventRow {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  color: string | null;
  location: string | null;
}

interface DayViewProps {
  currentDate: Date;
  events: EventRow[];
  onSlotClick: (hour: number) => void;
  onEventClick: (event: EventRow) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function DayView({ currentDate, events, onSlotClick, onEventClick }: DayViewProps) {
  const today = new Date();
  const isToday = isSameDay(currentDate, today);

  const dayEvents = events.filter((e) => {
    const start = parseISO(e.start_at);
    const end = parseISO(e.end_at);
    return isSameDay(start, currentDate) || (currentDate >= start && currentDate <= end);
  });

  const allDayEvs = dayEvents.filter(e => e.all_day);
  const timedEvs = dayEvents.filter(e => !e.all_day);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-muted/50 border-b border-border text-center">
        <div className="text-sm text-muted-foreground">{format(currentDate, "EEEE", { locale: ptBR })}</div>
        <div className={`text-2xl font-bold w-10 h-10 mx-auto flex items-center justify-center rounded-full ${isToday ? "bg-primary text-primary-foreground" : ""}`}>
          {format(currentDate, "d")}
        </div>
        <div className="text-xs text-muted-foreground mt-1">{format(currentDate, "MMMM yyyy", { locale: ptBR })}</div>
      </div>

      {/* All-day events */}
      {allDayEvs.length > 0 && (
        <div className="p-2 border-b border-border space-y-1">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Dia inteiro</div>
          {allDayEvs.map((ev) => (
            <div
              key={ev.id}
              className={`text-xs px-2 py-1 rounded border cursor-pointer ${getEventColorClass(ev.color)}`}
              onClick={() => onEventClick(ev as any)}
            >
              {ev.title}
            </div>
          ))}
        </div>
      )}

      {/* Time grid */}
      <div className="overflow-y-auto max-h-[600px]">
        {HOURS.map((hour) => {
          const hourEvents = timedEvs.filter((e) => getHours(parseISO(e.start_at)) === hour);
          return (
            <div
              key={hour}
              className="grid grid-cols-[60px_1fr] border-b border-border/50 min-h-[56px] cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => onSlotClick(hour)}
            >
              <div className="text-xs text-muted-foreground text-right pr-3 pt-1">
                {String(hour).padStart(2, "0")}:00
              </div>
              <div className="border-l border-border/50 p-1 relative">
                {hourEvents.map((ev) => {
                  const start = parseISO(ev.start_at);
                  const end = parseISO(ev.end_at);
                  const startMin = getMinutes(start);
                  const durationMin = Math.max(15, (end.getTime() - start.getTime()) / 60000);
                  const heightPx = Math.min(durationMin * (56 / 60), 224);
                  return (
                    <div
                      key={ev.id}
                      className={`absolute left-1 right-1 rounded px-2 py-1 text-xs border overflow-hidden cursor-pointer z-10 ${getEventColorClass(ev.color)}`}
                      style={{ top: `${startMin * (56 / 60)}px`, height: `${heightPx}px` }}
                      onClick={(e) => { e.stopPropagation(); onEventClick(ev as any); }}
                    >
                      <div className="font-medium truncate">{ev.title}</div>
                      <div className="truncate">{format(start, "HH:mm")} - {format(end, "HH:mm")}</div>
                      {ev.location && <div className="truncate text-[10px] opacity-70">{ev.location}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
