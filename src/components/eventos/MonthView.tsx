import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getEventColorClass } from "./EventDialog";

interface EventRow {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  color: string | null;
}

interface MonthViewProps {
  currentDate: Date;
  events: EventRow[];
  onDayClick: (day: Date) => void;
  onEventClick: (event: EventRow) => void;
}

export function MonthView({ currentDate, events, onDayClick, onEventClick }: MonthViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { locale: ptBR });
  const calendarEnd = endOfWeek(monthEnd, { locale: ptBR });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const today = new Date();

  const getEventsForDay = (day: Date) =>
    events.filter((e) => {
      const start = parseISO(e.start_at);
      const end = parseISO(e.end_at);
      return isSameDay(start, day) || (day >= start && day <= end);
    });

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="grid grid-cols-7 bg-muted/50">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground border-b border-border">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {calendarDays.map((day, i) => {
          const dayEvents = getEventsForDay(day);
          const isToday = isSameDay(day, today);
          const isCurrentMonth = isSameMonth(day, currentDate);
          return (
            <div
              key={i}
              className={`min-h-[80px] md:min-h-[100px] p-1 border-b border-r border-border cursor-pointer hover:bg-muted/30 transition-colors ${!isCurrentMonth ? "bg-muted/20" : ""}`}
              onClick={() => onDayClick(day)}
            >
              <div className={`text-xs font-medium p-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-primary text-primary-foreground" : isCurrentMonth ? "text-foreground" : "text-muted-foreground/50"}`}>
                {format(day, "d")}
              </div>
              <div className="space-y-0.5 mt-0.5">
                {dayEvents.slice(0, 3).map((ev) => (
                  <div
                    key={ev.id}
                    className={`text-[10px] md:text-xs px-1.5 py-0.5 rounded border truncate cursor-pointer ${getEventColorClass(ev.color)}`}
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev as any); }}
                    title={ev.title}
                  >
                    {ev.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} mais</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
