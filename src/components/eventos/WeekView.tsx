import { format, eachDayOfInterval, startOfWeek, endOfWeek, isSameDay, parseISO, getHours, getMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getEventColorClass } from "./EventDialog";

interface EventRow {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  color: string | null;
}

interface WeekViewProps {
  currentDate: Date;
  events: EventRow[];
  onSlotClick: (day: Date, hour: number) => void;
  onEventClick: (event: EventRow) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function WeekView({ currentDate, events, onSlotClick, onEventClick }: WeekViewProps) {
  const weekStart = startOfWeek(currentDate, { locale: ptBR });
  const weekEnd = endOfWeek(currentDate, { locale: ptBR });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const today = new Date();

  const getEventsForDay = (day: Date) =>
    events.filter((e) => {
      const start = parseISO(e.start_at);
      const end = parseISO(e.end_at);
      return isSameDay(start, day) || (day >= start && day <= end);
    });

  const allDayEvents = (day: Date) => getEventsForDay(day).filter(e => e.all_day);
  const timedEvents = (day: Date) => getEventsForDay(day).filter(e => !e.all_day);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] bg-muted/50 border-b border-border">
        <div className="p-2" />
        {days.map((day) => (
          <div key={day.toISOString()} className="p-2 text-center border-l border-border">
            <div className="text-xs text-muted-foreground">{format(day, "EEE", { locale: ptBR })}</div>
            <div className={`text-sm font-medium w-7 h-7 mx-auto flex items-center justify-center rounded-full ${isSameDay(day, today) ? "bg-primary text-primary-foreground" : ""}`}>
              {format(day, "d")}
            </div>
          </div>
        ))}
      </div>

      {/* All-day row */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border min-h-[32px]">
        <div className="p-1 text-[10px] text-muted-foreground text-right pr-2 flex items-center justify-end">dia todo</div>
        {days.map((day) => {
          const adEvents = allDayEvents(day);
          return (
            <div key={day.toISOString()} className="p-0.5 border-l border-border">
              {adEvents.slice(0, 2).map((ev) => (
                <div
                  key={ev.id}
                  className={`text-[10px] px-1 py-0.5 rounded truncate cursor-pointer border ${getEventColorClass(ev.color)}`}
                  onClick={() => onEventClick(ev as any)}
                >
                  {ev.title}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="overflow-y-auto max-h-[600px]">
        {HOURS.map((hour) => (
          <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border/50 min-h-[48px]">
            <div className="text-[10px] text-muted-foreground text-right pr-2 pt-0.5">
              {String(hour).padStart(2, "0")}:00
            </div>
            {days.map((day) => {
              const hourEvents = timedEvents(day).filter((e) => {
                const h = getHours(parseISO(e.start_at));
                return h === hour;
              });
              return (
                <div
                  key={day.toISOString()}
                  className="border-l border-border/50 p-0.5 cursor-pointer hover:bg-muted/30 transition-colors relative"
                  onClick={() => onSlotClick(day, hour)}
                >
                  {hourEvents.map((ev) => {
                    const start = parseISO(ev.start_at);
                    const end = parseISO(ev.end_at);
                    const startMin = getMinutes(start);
                    const durationMin = Math.max(15, (end.getTime() - start.getTime()) / 60000);
                    const heightPx = Math.min(durationMin * (48 / 60), 192);
                    return (
                      <div
                        key={ev.id}
                        className={`absolute left-0.5 right-0.5 rounded px-1 py-0.5 text-[10px] leading-tight border overflow-hidden cursor-pointer z-10 ${getEventColorClass(ev.color)}`}
                        style={{ top: `${startMin * (48 / 60)}px`, height: `${heightPx}px` }}
                        onClick={(e) => { e.stopPropagation(); onEventClick(ev as any); }}
                        title={ev.title}
                      >
                        <div className="font-medium truncate">{ev.title}</div>
                        <div className="truncate">{format(start, "HH:mm")} - {format(end, "HH:mm")}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
