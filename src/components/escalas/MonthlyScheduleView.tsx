import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Download,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  companyId: string;
}

export function MonthlyScheduleView({ companyId }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("all");

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  // Build calendar days grid
  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    let day = calendarStart;
    while (day <= calendarEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [calendarStart.toISOString(), calendarEnd.toISOString()]);

  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      result.push(calendarDays.slice(i, i + 7));
    }
    return result;
  }, [calendarDays]);

  // Fetch schedules
  const { data: schedules = [] } = useQuery({
    queryKey: ["schedules", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedules")
        .select("*")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (schedules.length > 0 && !selectedScheduleId) {
      setSelectedScheduleId(schedules[0].id);
    }
  }, [schedules, selectedScheduleId]);

  // Fetch grades
  const { data: grades = [] } = useQuery({
    queryKey: ["schedule-grades", selectedScheduleId],
    queryFn: async () => {
      if (!selectedScheduleId) return [];
      const { data, error } = await supabase
        .from("schedule_grades")
        .select("*")
        .eq("schedule_id", selectedScheduleId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedScheduleId,
  });

  const gradeIds = grades.map((g: any) => g.id);
  const dateFrom = format(calendarStart, "yyyy-MM-dd");
  const dateTo = format(calendarEnd, "yyyy-MM-dd");

  // Fetch assignments for the whole visible calendar
  const { data: assignments = [] } = useQuery({
    queryKey: ["shift-assignments-monthly", gradeIds, dateFrom, dateTo],
    queryFn: async () => {
      if (gradeIds.length === 0) return [];
      const { data, error } = await supabase
        .from("shift_assignments")
        .select("*, user_profiles!shift_assignments_user_id_fkey(full_name)")
        .in("grade_id", gradeIds)
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("slot_index");
      if (error) throw error;
      return data;
    },
    enabled: gradeIds.length > 0,
  });

  // Fetch users for filter
  const { data: users = [] } = useQuery({
    queryKey: ["company-users", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_company_access")
        .select("user_id, user_profiles!user_company_access_user_id_profiles_fkey(full_name)")
        .eq("company_id", companyId);
      if (error) throw error;
      return data;
    },
  });

  // Group assignments by date
  const assignmentsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    assignments.forEach((a: any) => {
      if (selectedUserId !== "all" && a.user_id !== selectedUserId) return;
      if (!map[a.date]) map[a.date] = [];
      map[a.date].push(a);
    });
    return map;
  }, [assignments, selectedUserId]);

  // Grade lookup
  const gradeMap = useMemo(() => {
    const map: Record<string, any> = {};
    grades.forEach((g: any) => {
      map[g.id] = g;
    });
    return map;
  }, [grades]);

  const today = new Date();

  const handleExportPDF = () => {
    const scheduleName = schedules.find((s: any) => s.id === selectedScheduleId)?.name || "Escala";
    const monthLabel = format(currentDate, "MMMM yyyy", { locale: ptBR });

    const html = generateMonthlyHtml(
      scheduleName,
      monthLabel,
      weeks,
      assignmentsByDate,
      gradeMap,
      monthStart
    );

    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 500);
    }
  };

  const weekDayHeaders = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4 bg-card/80 backdrop-blur-sm border-border/50">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            {schedules.length > 0 ? (
              <Select value={selectedScheduleId || ""} onValueChange={setSelectedScheduleId}>
                <SelectTrigger className="w-[240px] bg-background">
                  <SelectValue placeholder="Selecione uma escala" />
                </SelectTrigger>
                <SelectContent>
                  {schedules.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma escala criada</p>
            )}

            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-[200px] bg-background">
                <div className="flex items-center gap-2">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Todos os profissionais" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os profissionais</SelectItem>
                {users.map((u: any) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.user_profiles?.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/60 border border-border/30">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium capitalize">
                {format(currentDate, "MMMM yyyy", { locale: ptBR })}
              </span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
              Hoje
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleExportPDF}
              disabled={grades.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              Exportar PDF
            </Button>
          </div>
        </div>
      </Card>

      {/* Calendar grid */}
      {grades.length > 0 ? (
        <Card className="border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50">
                  {weekDayHeaders.map((d) => (
                    <th
                      key={d}
                      className="p-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30 w-[14.28%]"
                    >
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week, wi) => (
                  <tr key={wi} className="border-b border-border/30">
                    {week.map((day) => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const isCurrentMonth = isSameMonth(day, monthStart);
                      const isToday = isSameDay(day, today);
                      const dayAssignments = assignmentsByDate[dateStr] || [];

                      return (
                        <td
                          key={dateStr}
                          className={`p-1.5 align-top border-l border-border/20 h-[120px] ${
                            !isCurrentMonth ? "bg-muted/20 opacity-50" : ""
                          } ${isToday ? "bg-primary/[0.06]" : ""}`}
                        >
                          <div className="flex flex-col gap-1">
                            <span
                              className={`text-xs font-semibold self-end px-1.5 py-0.5 rounded-full ${
                                isToday
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {format(day, "d")}
                            </span>
                            <div className="flex flex-col gap-0.5 overflow-y-auto max-h-[85px]">
                              {dayAssignments.map((a: any) => {
                                const grade = gradeMap[a.grade_id];
                                const name = a.user_profiles?.full_name || "—";
                                const firstName = name.split(" ")[0];
                                const statusColor =
                                  a.status === "inativo"
                                    ? "bg-muted text-muted-foreground line-through"
                                    : "";

                                return (
                                  <Tooltip key={a.id}>
                                    <TooltipTrigger asChild>
                                      <div
                                        className={`text-[10px] leading-tight px-1.5 py-0.5 rounded truncate cursor-default ${statusColor}`}
                                        style={{
                                          backgroundColor: a.status !== "inativo" ? (grade?.color || "hsl(var(--primary))") + "22" : undefined,
                                          color: a.status !== "inativo" ? grade?.color || "hsl(var(--primary))" : undefined,
                                          borderLeft: `3px solid ${grade?.color || "hsl(var(--primary))"}`,
                                        }}
                                      >
                                        {firstName}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="text-xs">
                                      <div className="space-y-0.5">
                                        <p className="font-semibold">{name}</p>
                                        <p className="text-muted-foreground">
                                          {grade?.name} • {grade?.start_time?.slice(0, 5)}-{grade?.end_time?.slice(0, 5)}
                                        </p>
                                        {a.status !== "confirmado" && (
                                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                                            {a.status}
                                          </Badge>
                                        )}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : selectedScheduleId ? (
        <Card className="p-12 text-center bg-card/80 backdrop-blur-sm border-border/50">
          <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Nenhuma grade configurada</h3>
          <p className="text-sm text-muted-foreground">
            Configure as grades na aba Escala Semanal para visualizar o calendário mensal.
          </p>
        </Card>
      ) : (
        <Card className="p-12 text-center bg-card/80 backdrop-blur-sm border-border/50">
          <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Selecione uma escala</h3>
          <p className="text-sm text-muted-foreground">
            Crie ou selecione uma escala para ver o calendário mensal.
          </p>
        </Card>
      )}
    </div>
  );
}

function generateMonthlyHtml(
  scheduleName: string,
  monthLabel: string,
  weeks: Date[][],
  assignmentsByDate: Record<string, any[]>,
  gradeMap: Record<string, any>,
  monthStart: Date
): string {
  const weekDays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  const rowsHtml = weeks
    .map((week) => {
      const cells = week
        .map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const isCurrentMonth = isSameMonth(day, monthStart);
          const dayAssignments = assignmentsByDate[dateStr] || [];

          const badges = dayAssignments
            .map((a: any) => {
              const grade = gradeMap[a.grade_id];
              const name = a.user_profiles?.full_name || "—";
              const color = grade?.color || "#3b82f6";
              const inactive = a.status === "inativo" ? "text-decoration:line-through;opacity:0.5;" : "";
              return `<div style="font-size:10px;padding:1px 4px;border-radius:3px;background:${color}22;color:${color};border-left:3px solid ${color};margin-bottom:2px;${inactive}">${name.split(" ")[0]} <span style="color:#888;font-size:9px">${grade?.name || ""}</span></div>`;
            })
            .join("");

          return `<td style="padding:4px;vertical-align:top;border:1px solid #e5e7eb;height:90px;width:14.28%;${!isCurrentMonth ? "opacity:0.35;" : ""}">
            <div style="font-size:11px;font-weight:600;text-align:right;color:#888;margin-bottom:3px;">${format(day, "d")}</div>
            ${badges}
          </td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const headersHtml = weekDays
    .map(
      (d) =>
        `<th style="padding:6px;text-align:center;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;border:1px solid #e5e7eb;background:#f9fafb;">${d}</th>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>${scheduleName} - ${monthLabel}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
    h1 { font-size: 18px; margin-bottom: 2px; }
    .subtitle { color: #666; font-size: 13px; margin-bottom: 16px; text-transform: capitalize; }
    table { width: 100%; border-collapse: collapse; }
    @media print { body { padding: 10px; } }
  </style>
</head>
<body>
  <h1>${scheduleName}</h1>
  <p class="subtitle">${monthLabel}</p>
  <table>
    <thead><tr>${headersHtml}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;
}
