import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DollarSign, Lock, Unlock, Clock, User, CalendarDays, ChevronDown, ChevronUp,
  FileText, TrendingUp, Users, BarChart3, Download,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { format, differenceInHours, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  companyId: string;
}

interface ProfessionalSummary {
  userId: string;
  name: string;
  totalShifts: number;
  totalHours: number;
  totalMinutes: number;
  presentes: number;
  ausentes: number;
  atrasados: number;
  byGrade: { gradeName: string; gradeColor: string; shifts: number; hours: number; minutes: number }[];
}

function calcShiftDuration(startTime: string, endTime: string): { hours: number; minutes: number } {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let totalMin = (eh * 60 + em) - (sh * 60 + sm);
  if (totalMin <= 0) totalMin += 24 * 60; // overnight shift
  return { hours: Math.floor(totalMin / 60), minutes: totalMin % 60 };
}

function formatDuration(hours: number, minutes: number): string {
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${minutes.toString().padStart(2, "0")}`;
}

export function ScheduleClosing({ companyId }: Props) {
  const { isMaster, user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [periodStart, setPeriodStart] = useState(
    format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd")
  );
  const [periodEnd, setPeriodEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [expandedSchedule, setExpandedSchedule] = useState<string | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailScheduleId, setDetailScheduleId] = useState<string | null>(null);

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

  // Fetch closings
  const { data: closings = [] } = useQuery({
    queryKey: ["schedule-closings", companyId],
    queryFn: async () => {
      const scheduleIds = schedules.map((s: any) => s.id);
      if (scheduleIds.length === 0) return [];
      const { data, error } = await supabase
        .from("schedule_closings")
        .select("*")
        .in("schedule_id", scheduleIds)
        .order("period_end", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: schedules.length > 0,
  });

  // Fetch grades and assignments for period calculation
  const { data: allGrades = [] } = useQuery({
    queryKey: ["closing-grades", companyId],
    queryFn: async () => {
      const scheduleIds = schedules.map((s: any) => s.id);
      if (scheduleIds.length === 0) return [];
      const { data, error } = await supabase
        .from("schedule_grades")
        .select("*")
        .in("schedule_id", scheduleIds)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: schedules.length > 0,
  });

  const { data: periodAssignments = [] } = useQuery({
    queryKey: ["closing-assignments", companyId, periodStart, periodEnd],
    queryFn: async () => {
      const gradeIds = allGrades.map((g: any) => g.id);
      if (gradeIds.length === 0) return [];
      const { data, error } = await supabase
        .from("shift_assignments")
        .select("*")
        .in("grade_id", gradeIds)
        .gte("date", periodStart)
        .lte("date", periodEnd)
        .eq("status", "confirmado");
      if (error) throw error;

      // Fetch user profiles separately
      const userIds = [...new Set((data || []).map((a: any) => a.user_id).filter(Boolean))];
      if (userIds.length === 0) return data || [];

      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, full_name")
        .in("id", userIds);

      const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));

      return (data || []).map((a: any) => ({
        ...a,
        user_profiles: a.user_id ? profileMap[a.user_id] || null : null,
      }));
    },
    enabled: allGrades.length > 0,
  });

  // Fetch clock entries linked to shift assignments for presence tracking
  const { data: clockEntries = [] } = useQuery({
    queryKey: ["closing-clock-entries", companyId, periodStart, periodEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clock_entries")
        .select("id, user_id, shift_assignment_id, type, timestamp, valid")
        .eq("company_id", companyId)
        .gte("timestamp", `${periodStart}T00:00:00`)
        .lte("timestamp", `${periodEnd}T23:59:59`)
        .eq("valid", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Calculate summaries per schedule
  const scheduleSummaries = useMemo(() => {
    const result: Record<string, {
      totalShifts: number;
      totalHours: number;
      totalMinutes: number;
      professionals: ProfessionalSummary[];
    }> = {};

    for (const schedule of schedules) {
      const scheduleGrades = allGrades.filter((g: any) => g.schedule_id === schedule.id);
      const gradeIds = scheduleGrades.map((g: any) => g.id);
      const gradeMap = Object.fromEntries(scheduleGrades.map((g: any) => [g.id, g]));
      const schedAssignments = periodAssignments.filter((a: any) => gradeIds.includes(a.grade_id));

      // Group by professional
      const byUser: Record<string, ProfessionalSummary> = {};

      for (const a of schedAssignments) {
        if (!a.user_id) continue;
        const grade = gradeMap[a.grade_id];
        if (!grade) continue;

        const duration = calcShiftDuration(
          grade.start_time?.slice(0, 5) || "07:00",
          grade.end_time?.slice(0, 5) || "19:00"
        );

        if (!byUser[a.user_id]) {
          byUser[a.user_id] = {
            userId: a.user_id,
            name: a.user_profiles?.full_name || "—",
            totalShifts: 0,
            totalHours: 0,
            totalMinutes: 0,
            presentes: 0,
            ausentes: 0,
            atrasados: 0,
            byGrade: [],
          };
        }

        // Check presence via clock entries
        const linkedEntries = clockEntries.filter(
          (ce: any) => ce.shift_assignment_id === a.id && ce.type === "entrada"
        );
        const dateEntries = clockEntries.filter(
          (ce: any) => ce.user_id === a.user_id && ce.type === "entrada" && ce.timestamp.startsWith(a.date)
        );
        const hasEntry = linkedEntries.length > 0 || dateEntries.length > 0;

        if (hasEntry) {
          // Check if late
          const entrada = linkedEntries[0] || dateEntries[0];
          const startTime = a.custom_start_time?.slice(0, 5) || grade.start_time?.slice(0, 5) || "07:00";
          const [sh, sm] = startTime.split(":").map(Number);
          const entradaDate = new Date(entrada.timestamp);
          const entradaMin = entradaDate.getHours() * 60 + entradaDate.getMinutes();
          if (entradaMin > sh * 60 + sm + 15) {
            byUser[a.user_id].atrasados += 1;
          } else {
            byUser[a.user_id].presentes += 1;
          }
        } else {
          // Only mark absent if date is in the past
          const shiftDate = new Date(a.date + "T23:59:59");
          if (shiftDate < new Date()) {
            byUser[a.user_id].ausentes += 1;
          }
        }

        byUser[a.user_id].totalShifts += 1;
        byUser[a.user_id].totalMinutes += duration.hours * 60 + duration.minutes;

        // Group by grade
        let gradeEntry = byUser[a.user_id].byGrade.find((g) => g.gradeName === grade.name);
        if (!gradeEntry) {
          gradeEntry = { gradeName: grade.name, gradeColor: grade.color, shifts: 0, hours: 0, minutes: 0 };
          byUser[a.user_id].byGrade.push(gradeEntry);
        }
        gradeEntry.shifts += 1;
        gradeEntry.minutes += duration.hours * 60 + duration.minutes;
      }

      // Convert minutes to hours
      const professionals = Object.values(byUser).map((p) => ({
        ...p,
        totalHours: Math.floor(p.totalMinutes / 60),
        totalMinutes: p.totalMinutes % 60,
        byGrade: p.byGrade.map((g) => ({
          ...g,
          hours: Math.floor(g.minutes / 60),
          minutes: g.minutes % 60,
        })),
      }));
      professionals.sort((a, b) => b.totalMinutes + b.totalHours * 60 - (a.totalMinutes + a.totalHours * 60));

      const totalShifts = professionals.reduce((s, p) => s + p.totalShifts, 0);
      const totalAllMin = professionals.reduce((s, p) => s + p.totalHours * 60 + p.totalMinutes, 0);

      result[schedule.id] = {
        totalShifts,
        totalHours: Math.floor(totalAllMin / 60),
        totalMinutes: totalAllMin % 60,
        professionals,
      };
    }

    return result;
  }, [schedules, allGrades, periodAssignments, clockEntries]);

  const closeSchedules = useMutation({
    mutationFn: async () => {
      for (const scheduleId of selectedIds) {
        const { error } = await supabase.from("schedule_closings").insert({
          schedule_id: scheduleId,
          period_start: periodStart,
          period_end: periodEnd,
          status: "fechado",
          closed_at: new Date().toISOString(),
          closed_by: user?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Escalas fechadas com sucesso" });
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ["schedule-closings"] });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const reopenClosing = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("schedule_closings")
        .update({ status: "aberto", closed_at: null, closed_by: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Período reaberto" });
      queryClient.invalidateQueries({ queryKey: ["schedule-closings"] });
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const getLastClosing = (scheduleId: string) =>
    closings.find((c: any) => c.schedule_id === scheduleId && c.status === "fechado");

  const getClosingHistory = (scheduleId: string) =>
    closings.filter((c: any) => c.schedule_id === scheduleId);

  const detailSchedule = schedules.find((s: any) => s.id === detailScheduleId);
  const detailSummary = detailScheduleId ? scheduleSummaries[detailScheduleId] : null;

  // Totals across all selected schedules
  const globalTotals = useMemo(() => {
    let shifts = 0, minutes = 0, professionals = new Set<string>();
    for (const s of schedules) {
      const summary = scheduleSummaries[s.id];
      if (!summary) continue;
      shifts += summary.totalShifts;
      minutes += summary.totalHours * 60 + summary.totalMinutes;
      summary.professionals.forEach((p) => professionals.add(p.userId));
    }
    return {
      shifts,
      hours: Math.floor(minutes / 60),
      minutes: minutes % 60,
      professionals: professionals.size,
    };
  }, [schedules, scheduleSummaries]);

  if (schedules.length === 0) {
    return (
      <Card className="p-12 text-center bg-card/80 backdrop-blur-sm border-border/50">
        <DollarSign className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Nenhuma escala para fechar</h3>
        <p className="text-sm text-muted-foreground">Crie escalas primeiro na aba "Escala Semanal".</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <Card className="p-4 bg-card/80 backdrop-blur-sm border-border/50">
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Início do Período</Label>
            <Input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-[180px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Fim do Período</Label>
            <Input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-[180px]"
            />
          </div>
          {isMaster && selectedIds.length > 0 && (
            <Button
              onClick={() => closeSchedules.mutate()}
              disabled={closeSchedules.isPending}
              className="gap-2"
            >
              <Lock className="h-4 w-4" />
              {closeSchedules.isPending ? "Fechando..." : `Fechar ${selectedIds.length} Escala(s)`}
            </Button>
          )}
        </div>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 bg-gradient-to-br from-primary/5 to-primary/[0.02] border-primary/10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{globalTotals.shifts}</p>
              <p className="text-xs text-muted-foreground">Plantões no período</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-accent/5 to-accent/[0.02] border-accent/10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {formatDuration(globalTotals.hours, globalTotals.minutes)}
              </p>
              <p className="text-xs text-muted-foreground">Horas totais</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-secondary/5 to-secondary/[0.02] border-secondary/10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-secondary/50 flex items-center justify-center">
              <Users className="h-5 w-5 text-secondary-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{globalTotals.professionals}</p>
              <p className="text-xs text-muted-foreground">Profissionais escalados</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Schedules list */}
      <div className="space-y-3">
        {schedules.map((schedule: any) => {
          const lastClosing = getLastClosing(schedule.id);
          const summary = scheduleSummaries[schedule.id];
          const isExpanded = expandedSchedule === schedule.id;

          return (
            <Card
              key={schedule.id}
              className="overflow-hidden bg-card/80 backdrop-blur-sm border-border/50 transition-shadow hover:shadow-md"
            >
              {/* Schedule header */}
              <div className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {isMaster && (
                      <Checkbox
                        checked={selectedIds.includes(schedule.id)}
                        onCheckedChange={() => toggleSelect(schedule.id)}
                      />
                    )}
                    <div
                      className="w-4 h-4 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: schedule.color }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-foreground">{schedule.name}</p>
                        {lastClosing && (
                          <Badge variant={lastClosing.status === "fechado" ? "default" : "secondary"} className="text-[10px]">
                            {lastClosing.status === "fechado" ? "Fechado" : "Aberto"}
                          </Badge>
                        )}
                      </div>
                      {lastClosing ? (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Último: {format(new Date(lastClosing.period_start + "T12:00:00"), "dd/MM", { locale: ptBR })} - {format(new Date(lastClosing.period_end + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">Sem fechamentos anteriores</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {/* Mini stats */}
                    {summary && summary.totalShifts > 0 && (
                      <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {summary.totalShifts} plantões
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(summary.totalHours, summary.totalMinutes)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {summary.professionals.length}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5">
                      {summary && summary.totalShifts > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-xs"
                          onClick={() => {
                            setDetailScheduleId(schedule.id);
                            setDetailDialogOpen(true);
                          }}
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                          Detalhes
                        </Button>
                      )}
                      {isMaster && lastClosing?.status === "fechado" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-xs"
                          onClick={() => reopenClosing.mutate(lastClosing.id)}
                          disabled={reopenClosing.isPending}
                        >
                          <Unlock className="h-3.5 w-3.5" />
                          Reabrir
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setExpandedSchedule(isExpanded ? null : schedule.id)}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded: quick professional list */}
              {isExpanded && summary && summary.professionals.length > 0 && (
                <div className="border-t border-border/30 bg-muted/20">
                  <div className="p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      Resumo por Profissional
                    </p>
                    <div className="space-y-2">
                      {summary.professionals.map((prof) => (
                        <div
                          key={prof.userId}
                          className="flex items-center justify-between gap-4 p-2.5 rounded-lg bg-background/60 border border-border/30"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{prof.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {prof.byGrade.map((g) => (
                                  <span
                                    key={g.gradeName}
                                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                                  >
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: g.gradeColor }}
                                    />
                                    {g.gradeName}: {g.shifts}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {prof.presentes > 0 && (
                              <Badge variant="default" className="text-[9px] px-1.5 py-0">
                                ✓ {prof.presentes}
                              </Badge>
                            )}
                            {prof.atrasados > 0 && (
                              <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                                ⏰ {prof.atrasados}
                              </Badge>
                            )}
                            {prof.ausentes > 0 && (
                              <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                                ✗ {prof.ausentes}
                              </Badge>
                            )}
                            <div className="text-right">
                              <p className="text-sm font-bold text-foreground">
                                {formatDuration(prof.totalHours, prof.totalMinutes)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {prof.totalShifts} {prof.totalShifts === 1 ? "plantão" : "plantões"}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {isExpanded && summary && summary.professionals.length === 0 && (
                <div className="border-t border-border/30 p-6 text-center">
                  <p className="text-sm text-muted-foreground">Nenhum plantão confirmado neste período</p>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailSchedule && (
                <span
                  className="w-3 h-3 rounded-full inline-block"
                  style={{ backgroundColor: detailSchedule.color }}
                />
              )}
              {detailSchedule?.name} — Detalhamento
            </DialogTitle>
            <DialogDescription>
              Período: {format(new Date(periodStart + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })} a{" "}
              {format(new Date(periodEnd + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
            </DialogDescription>
          </DialogHeader>

          {detailSummary && (
            <div className="space-y-5">
              {/* Export buttons */}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    const header = "Profissional;Plantões;Horas;Detalhamento\n";
                    const rows = detailSummary.professionals.map((p) => {
                      const detail = p.byGrade.map((g) => `${g.gradeName}: ${g.shifts}x (${formatDuration(g.hours, g.minutes)})`).join(" | ");
                      return `${p.name};${p.totalShifts};${formatDuration(p.totalHours, p.totalMinutes)};${detail}`;
                    }).join("\n");
                    const totalRow = `\nTOTAL;${detailSummary.totalShifts};${formatDuration(detailSummary.totalHours, detailSummary.totalMinutes)};\n`;
                    const blob = new Blob(["\uFEFF" + header + rows + totalRow], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `fechamento-${detailSchedule?.name || "escala"}-${periodStart}_${periodEnd}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast({ title: "CSV exportado com sucesso!" });
                  }}
                >
                  <Download className="h-3.5 w-3.5" /> CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    const periodLabel = `${format(new Date(periodStart + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })} a ${format(new Date(periodEnd + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}`;
                    let html = `<html><head><title>Fechamento - ${detailSchedule?.name || ""}</title>
                    <style>
                      body{font-family:Arial,sans-serif;padding:30px;color:#333;font-size:13px}
                      h1{font-size:18px;margin-bottom:2px}
                      .sub{font-size:12px;color:#666;margin-bottom:20px}
                      table{width:100%;border-collapse:collapse;margin-top:12px}
                      th,td{border:1px solid #ddd;padding:7px 10px;text-align:left;font-size:12px}
                      th{background:#f5f5f5}
                      .r{text-align:right} .c{text-align:center}
                      .total td{font-weight:700;background:#f0f7ff;border-top:2px solid #333}
                      .kpi{display:inline-block;border:1px solid #ddd;border-radius:6px;padding:8px 16px;margin-right:8px;text-align:center}
                      .kpi .v{font-size:18px;font-weight:700} .kpi .l{font-size:10px;color:#888}
                      @media print{body{padding:16px}}
                    </style></head><body>
                    <h1>Relatório de Fechamento — ${detailSchedule?.name || ""}</h1>
                    <p class="sub">Período: ${periodLabel}</p>
                    <div style="margin-bottom:16px">
                      <span class="kpi"><span class="v">${detailSummary.totalShifts}</span><br/><span class="l">Plantões</span></span>
                      <span class="kpi"><span class="v">${formatDuration(detailSummary.totalHours, detailSummary.totalMinutes)}</span><br/><span class="l">Horas</span></span>
                      <span class="kpi"><span class="v">${detailSummary.professionals.length}</span><br/><span class="l">Profissionais</span></span>
                    </div>
                    <table>
                      <tr><th>Profissional</th><th class="c">Plantões</th><th class="c">Horas</th><th>Detalhamento por Grade</th></tr>`;
                    detailSummary.professionals.forEach((p) => {
                      const detail = p.byGrade.map((g) => `${g.gradeName}: ${g.shifts}× (${formatDuration(g.hours, g.minutes)})`).join(", ");
                      html += `<tr><td>${p.name}</td><td class="c">${p.totalShifts}</td><td class="c">${formatDuration(p.totalHours, p.totalMinutes)}</td><td>${detail}</td></tr>`;
                    });
                    html += `<tr class="total"><td>TOTAL</td><td class="c">${detailSummary.totalShifts}</td><td class="c">${formatDuration(detailSummary.totalHours, detailSummary.totalMinutes)}</td><td></td></tr></table>`;
                    html += `<p style="margin-top:20px;font-size:10px;color:#999">Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}</p></body></html>`;
                    const w = window.open("", "_blank");
                    if (w) { w.document.write(html); w.document.close(); w.print(); }
                    toast({ title: "PDF gerado para impressão!" });
                  }}
                >
                  <FileText className="h-3.5 w-3.5" /> PDF
                </Button>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted/40 p-3 text-center">
                  <p className="text-xl font-bold text-foreground">{detailSummary.totalShifts}</p>
                  <p className="text-[11px] text-muted-foreground">Plantões</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3 text-center">
                  <p className="text-xl font-bold text-foreground">
                    {formatDuration(detailSummary.totalHours, detailSummary.totalMinutes)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Horas Totais</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3 text-center">
                  <p className="text-xl font-bold text-foreground">{detailSummary.professionals.length}</p>
                  <p className="text-[11px] text-muted-foreground">Profissionais</p>
                </div>
              </div>

              {/* Detailed table */}
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs font-semibold">Profissional</TableHead>
                      <TableHead className="text-xs font-semibold text-center">Plantões</TableHead>
                      <TableHead className="text-xs font-semibold text-center">Presença</TableHead>
                      <TableHead className="text-xs font-semibold text-center">Horas</TableHead>
                      <TableHead className="text-xs font-semibold">Detalhamento por Grade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailSummary.professionals.map((prof) => (
                      <TableRow key={prof.userId} className="hover:bg-muted/10">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <User className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <span className="text-sm font-medium">{prof.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="text-xs font-semibold">
                            {prof.totalShifts}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {prof.presentes > 0 && (
                              <Badge variant="default" className="text-[9px] px-1.5 py-0">✓{prof.presentes}</Badge>
                            )}
                            {prof.atrasados > 0 && (
                              <Badge variant="secondary" className="text-[9px] px-1.5 py-0">⏰{prof.atrasados}</Badge>
                            )}
                            {prof.ausentes > 0 && (
                              <Badge variant="destructive" className="text-[9px] px-1.5 py-0">✗{prof.ausentes}</Badge>
                            )}
                            {prof.presentes === 0 && prof.atrasados === 0 && prof.ausentes === 0 && (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm font-bold text-foreground">
                            {formatDuration(prof.totalHours, prof.totalMinutes)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1.5">
                            {prof.byGrade.map((g) => (
                              <span
                                key={g.gradeName}
                                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted/60 border border-border/30"
                              >
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: g.gradeColor }}
                                />
                                {g.gradeName}: {g.shifts}× ({formatDuration(g.hours, g.minutes)})
                              </span>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
