import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, addDays, addWeeks, subWeeks, getWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, Settings, CalendarDays, Copy, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GradeCard } from "./GradeCard";
import { ShiftCell } from "./ShiftCell";
import { ScheduleConfigDialog } from "./ScheduleConfigDialog";
import { AssignShiftDialog } from "./AssignShiftDialog";
import { RotationPatternDialog } from "./RotationPatternDialog";
import { EditShiftDialog } from "./EditShiftDialog";
import { SwapRequestDialog } from "./SwapRequestDialog";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

interface Props {
  companyId: string;
}

export function WeeklyScheduleGrid({ companyId }: Props) {
  const { isMaster, user } = useAuth();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ gradeId: string; date: string; slotIndex: number } | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapTarget, setSwapTarget] = useState<{ assignmentId: string; type: "troca" | "passagem" } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editAssignment, setEditAssignment] = useState<any>(null);
  const [editGrade, setEditGrade] = useState<any>(null);
  const [rotationOpen, setRotationOpen] = useState(false);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekNumber = getWeek(currentDate, { weekStartsOn: 1 });

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

  // Fetch grades for selected schedule
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

  // Fetch assignments for the week
  const dateFrom = format(days[0], "yyyy-MM-dd");
  const dateTo = format(days[6], "yyyy-MM-dd");
  const gradeIds = grades.map((g: any) => g.id);

  const { data: assignments = [] } = useQuery({
    queryKey: ["shift-assignments", gradeIds, dateFrom, dateTo],
    queryFn: async () => {
      if (gradeIds.length === 0) return [];
      const { data, error } = await supabase
        .from("shift_assignments")
        .select("*, user_profiles!shift_assignments_user_id_fkey(full_name, phone)")
        .in("grade_id", gradeIds)
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("slot_index");
      if (error) throw error;
      return data;
    },
    enabled: gradeIds.length > 0,
  });

  // Fetch user profiles for assignment dialog
  const { data: users = [] } = useQuery({
    queryKey: ["company-users", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_company_access")
        .select("user_id, user_profiles!user_company_access_user_id_profiles_fkey(full_name, phone)")
        .eq("company_id", companyId);
      if (error) throw error;
      return data;
    },
  });

  const deleteAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shift_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
      toast({ title: "Plantão removido" });
    },
  });

  const setInactive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shift_assignments").update({ status: "inativo" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
      toast({ title: "Plantão marcado como inativo" });
    },
  });

  const copyPreviousWeek = useMutation({
    mutationFn: async () => {
      if (gradeIds.length === 0) throw new Error("Nenhuma grade configurada");
      const prevWeekStart = subWeeks(weekStart, 1);
      const prevFrom = format(prevWeekStart, "yyyy-MM-dd");
      const prevTo = format(addDays(prevWeekStart, 6), "yyyy-MM-dd");

      const { data: prevAssignments, error } = await supabase
        .from("shift_assignments")
        .select("grade_id, user_id, slot_index, status, date")
        .in("grade_id", gradeIds)
        .gte("date", prevFrom)
        .lte("date", prevTo);
      if (error) throw error;
      if (!prevAssignments || prevAssignments.length === 0) throw new Error("Nenhum plantão na semana anterior");

      // Map each assignment to the same weekday in current week
      const inserts = prevAssignments.map((a: any) => {
        const prevDate = new Date(a.date + "T12:00:00");
        const dayOfWeek = (prevDate.getDay() + 6) % 7; // 0=Mon
        const newDate = format(addDays(weekStart, dayOfWeek), "yyyy-MM-dd");
        return {
          grade_id: a.grade_id,
          user_id: a.user_id,
          slot_index: a.slot_index,
          status: "confirmado",
          date: newDate,
          created_by: user?.id,
        };
      });

      const { error: insertError } = await supabase.from("shift_assignments").insert(inserts);
      if (insertError) throw insertError;
      return inserts.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
      toast({ title: `${count} plantão(ões) copiado(s) da semana anterior` });
    },
    onError: (e: any) => {
      toast({ title: "Erro ao copiar", description: e.message, variant: "destructive" });
    },
  });

  const getGradeSlotCount = (grade: any) => {
    if (!grade.start_time || !grade.end_time) return 2;
    const [sh, sm] = grade.start_time.split(":").map(Number);
    const [eh, em] = grade.end_time.split(":").map(Number);
    let startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    let durationMin = endMin > startMin ? endMin - startMin : (1440 - startMin) + endMin;
    // If duration is 0 (same start/end = 24h) or full day, default to 2 slots (2x12h)
    if (durationMin <= 0 || durationMin >= 1440) return 2;
    return Math.max(1, Math.floor(1440 / durationMin));
  };

  const getAssignmentsForCell = (gradeId: string, date: string) =>
    assignments.filter((a: any) => a.grade_id === gradeId && a.date === date);

  const handleSlotClick = (gradeId: string, date: string, slotIndex: number) => {
    setAssignTarget({ gradeId, date, slotIndex });
    setAssignOpen(true);
  };

  const selectedSchedule = schedules.find((s: any) => s.id === selectedScheduleId);

  return (
    <div className="space-y-4">
      {/* Header controls */}
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

            {isMaster && (
              <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)} className="gap-2">
                <Settings className="h-4 w-4" />
                {schedules.length === 0 ? "Criar Escala" : "Configurar"}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subWeeks(currentDate, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/60 border border-border/30">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                Semana {weekNumber} de {format(currentDate, "yyyy")}
              </span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addWeeks(currentDate, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
              Hoje
            </Button>
            {isMaster && grades.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => copyPreviousWeek.mutate()}
                  disabled={copyPreviousWeek.isPending}
                >
                  {copyPreviousWeek.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                  Copiar Semana Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setRotationOpen(true)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Revezamento
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Weekly grid */}
      {grades.length > 0 ? (
        <Card className="border-border/50 bg-card/80 backdrop-blur-sm overflow-visible">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="w-[200px] p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
                    Grade
                  </th>
                  {days.map((day) => {
                    const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                    return (
                      <th
                        key={day.toISOString()}
                        className={`p-3 text-center text-xs font-semibold uppercase tracking-wider min-w-[120px] ${
                          isToday ? "bg-primary/10 text-primary" : "text-muted-foreground bg-muted/30"
                        }`}
                      >
                        <div>{format(day, "EEE", { locale: ptBR })}</div>
                        <div className={`text-lg font-bold mt-0.5 ${isToday ? "text-primary" : "text-foreground"}`}>
                          {format(day, "dd")}
                        </div>
                        <div className="text-[10px] font-normal opacity-60">{format(day, "MMM", { locale: ptBR })}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {grades.map((grade: any) => (
                  <tr key={grade.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                    <td className="p-2">
                      <GradeCard grade={grade} />
                    </td>
                    {days.map((day) => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const cellAssignments = getAssignmentsForCell(grade.id, dateStr);
                      const maxSlots = getGradeSlotCount(grade);
                      const isToday = dateStr === format(new Date(), "yyyy-MM-dd");

                      return (
                        <td
                          key={dateStr}
                          className={`p-1.5 align-top border-l border-border/20 ${
                            isToday ? "bg-primary/[0.04]" : ""
                          }`}
                        >
                          <div className="flex flex-col gap-1.5 min-h-[80px] h-full">
                            {Array.from({ length: maxSlots }, (_, slotIdx) => {
                              const assignment = cellAssignments.find((a: any) => a.slot_index === slotIdx);
                              if (assignment) {
                                return (
                                  <ShiftCell
                                    key={assignment.id}
                                    assignment={assignment}
                                    gradeName={grade.name}
                                    gradeTime={`${grade.start_time?.slice(0,5)} - ${grade.end_time?.slice(0,5)}`}
                                    gradeColor={grade.color}
                                    isMaster={isMaster}
                                    isOwnShift={assignment.user_id === user?.id}
                                    onDelete={() => deleteAssignment.mutate(assignment.id)}
                                    onRequestSwap={(type) => {
                                      setSwapTarget({ assignmentId: assignment.id, type });
                                      setSwapOpen(true);
                                    }}
                                    onEdit={() => {
                                      setEditAssignment(assignment);
                                      setEditGrade(grade);
                                      setEditOpen(true);
                                    }}
                                    onSetInactive={() => setInactive.mutate(assignment.id)}
                                  />
                                );
                              }
                              if (isMaster) {
                                return (
                                  <Tooltip key={`empty-${slotIdx}`}>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => handleSlotClick(grade.id, dateStr, slotIdx)}
                                        className="w-full flex-1 rounded-lg border-2 border-dashed border-border/40 text-muted-foreground/40 hover:border-primary/40 hover:text-primary/60 hover:bg-primary/5 transition-all text-xs flex items-center justify-center gap-1"
                                      >
                                        <Plus className="h-3.5 w-3.5" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>Adicionar plantão</TooltipContent>
                                  </Tooltip>
                                );
                              }
                              return (
                                <div key={`empty-${slotIdx}`} className="w-full flex-1 rounded-lg border-2 border-dashed border-border/20 text-muted-foreground/20 text-xs flex items-center justify-center">
                                  —
                                </div>
                              );
                            })}
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
          <p className="text-sm text-muted-foreground mb-4">
            Configure as grades (turnos) para começar a montar a escala semanal.
          </p>
          {isMaster && (
            <Button onClick={() => setConfigOpen(true)} className="gap-2">
              <Settings className="h-4 w-4" />
              Configurar Grades
            </Button>
          )}
        </Card>
      ) : (
        <Card className="p-12 text-center bg-card/80 backdrop-blur-sm border-border/50">
          <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Bem-vindo ao módulo de Escalas</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Crie sua primeira escala para começar a gerenciar os plantões.
          </p>
          {isMaster && (
            <Button onClick={() => setConfigOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Criar Escala
            </Button>
          )}
        </Card>
      )}

      {/* Dialogs */}
      <ScheduleConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        companyId={companyId}
        schedule={selectedSchedule}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["schedules"] });
          queryClient.invalidateQueries({ queryKey: ["schedule-grades"] });
        }}
      />

      {assignTarget && (
        <AssignShiftDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          gradeId={assignTarget.gradeId}
          date={assignTarget.date}
          slotIndex={assignTarget.slotIndex}
          users={users}
          grades={grades}
          assignments={assignments}
          maxWeeklyHours={selectedSchedule?.max_weekly_hours ?? 44}
          onAssigned={() => {
            queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
            setAssignOpen(false);
          }}
        />
      )}

      {swapTarget && (
        <SwapRequestDialog
          open={swapOpen}
          onOpenChange={setSwapOpen}
          assignmentId={swapTarget.assignmentId}
          type={swapTarget.type}
          users={users}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
            queryClient.invalidateQueries({ queryKey: ["swap-requests"] });
          }}
        />
      )}

      {editAssignment && (
        <EditShiftDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          assignment={editAssignment}
          gradeStartTime={editGrade?.start_time}
          gradeEndTime={editGrade?.end_time}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
            setEditOpen(false);
          }}
        />
      )}

      {selectedScheduleId && (
        <RotationPatternDialog
          open={rotationOpen}
          onOpenChange={setRotationOpen}
          companyId={companyId}
          scheduleId={selectedScheduleId}
          grades={grades}
          users={users}
          onGenerated={() => {
            queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
          }}
        />
      )}
    </div>
  );
}
