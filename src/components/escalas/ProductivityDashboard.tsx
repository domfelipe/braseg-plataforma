import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, differenceInMinutes, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, TrendingUp, Users, Award, AlertTriangle } from "lucide-react";

interface Props {
  companyId: string;
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
];

export function ProductivityDashboard({ companyId }: Props) {
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");

  const monthStart = startOfMonth(new Date(selectedMonth + "-01"));
  const monthEnd = endOfMonth(monthStart);
  const dateFrom = format(monthStart, "yyyy-MM-dd");
  const dateTo = format(monthEnd, "yyyy-MM-dd");

  // Last 6 months for selector
  const monthOptions = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), i);
      return { value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy", { locale: ptBR }) };
    });
  }, []);

  const { data: schedules = [] } = useQuery({
    queryKey: ["schedules", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("schedules").select("*").eq("company_id", companyId).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: grades = [] } = useQuery({
    queryKey: ["schedule-grades-all", selectedScheduleId],
    queryFn: async () => {
      if (!selectedScheduleId) return [];
      const { data, error } = await supabase.from("schedule_grades").select("*").eq("schedule_id", selectedScheduleId).order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedScheduleId,
  });

  const gradeIds = grades.map((g: any) => g.id);

  const { data: assignments = [] } = useQuery({
    queryKey: ["prod-assignments", gradeIds, dateFrom, dateTo],
    queryFn: async () => {
      if (gradeIds.length === 0) return [];
      const { data, error } = await supabase
        .from("shift_assignments")
        .select("*, user_profiles!shift_assignments_user_id_fkey(full_name)")
        .in("grade_id", gradeIds)
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .neq("status", "inativo");
      if (error) throw error;
      return data;
    },
    enabled: gradeIds.length > 0,
  });

  const { data: clockEntries = [] } = useQuery({
    queryKey: ["prod-clock", companyId, dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clock_entries")
        .select("user_id, type, timestamp")
        .eq("company_id", companyId)
        .gte("timestamp", `${dateFrom}T00:00:00`)
        .lte("timestamp", `${dateTo}T23:59:59`)
        .order("timestamp");
      if (error) throw error;
      return data;
    },
  });

  // Compute metrics per professional
  const professionalMetrics = useMemo(() => {
    const userMap = new Map<string, {
      name: string;
      totalShifts: number;
      clockedShifts: number;
      totalHoursWorked: number;
      lateCount: number;
    }>();

    // Build clock entries map per user per date
    const clockByUserDate = new Map<string, any[]>();
    for (const ce of clockEntries) {
      const key = `${ce.user_id}-${format(parseISO(ce.timestamp), "yyyy-MM-dd")}`;
      if (!clockByUserDate.has(key)) clockByUserDate.set(key, []);
      clockByUserDate.get(key)!.push(ce);
    }

    for (const a of assignments) {
      if (!a.user_id) continue;
      const name = (a as any).user_profiles?.full_name || "Sem nome";

      if (!userMap.has(a.user_id)) {
        userMap.set(a.user_id, { name, totalShifts: 0, clockedShifts: 0, totalHoursWorked: 0, lateCount: 0 });
      }

      const metrics = userMap.get(a.user_id)!;
      metrics.totalShifts++;

      const grade = grades.find((g: any) => g.id === a.grade_id);
      const startTime = (a.custom_start_time || grade?.start_time)?.slice(0, 5) || "07:00";
      const endTime = (a.custom_end_time || grade?.end_time)?.slice(0, 5) || "19:00";

      // Calculate shift duration
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      let durationMin = (eh * 60 + em) - (sh * 60 + sm);
      if (durationMin <= 0) durationMin += 1440;

      // Check clock entries for this shift
      const clockKey = `${a.user_id}-${a.date}`;
      const dayClocks = clockByUserDate.get(clockKey) || [];
      const entradas = dayClocks.filter((c: any) => c.type === "entrada");

      if (entradas.length > 0) {
        metrics.clockedShifts++;
        metrics.totalHoursWorked += durationMin / 60;

        // Check if late (entry > 15min after shift start)
        const firstEntry = entradas[0];
        const entryTime = parseISO(firstEntry.timestamp);
        const shiftStartDate = new Date(`${a.date}T${startTime}:00`);
        const diffMin = differenceInMinutes(entryTime, shiftStartDate);
        if (diffMin > 15) metrics.lateCount++;
      }
    }

    return Array.from(userMap.entries())
      .map(([userId, m]) => ({
        userId,
        ...m,
        presenceRate: m.totalShifts > 0 ? (m.clockedShifts / m.totalShifts) * 100 : 0,
        punctualityRate: m.clockedShifts > 0 ? ((m.clockedShifts - m.lateCount) / m.clockedShifts) * 100 : 0,
      }))
      .sort((a, b) => b.presenceRate - a.presenceRate);
  }, [assignments, clockEntries, grades]);

  // KPIs
  const totalShifts = professionalMetrics.reduce((s, m) => s + m.totalShifts, 0);
  const totalClocked = professionalMetrics.reduce((s, m) => s + m.clockedShifts, 0);
  const totalHours = professionalMetrics.reduce((s, m) => s + m.totalHoursWorked, 0);
  const avgPresence = totalShifts > 0 ? (totalClocked / totalShifts) * 100 : 0;
  const totalLate = professionalMetrics.reduce((s, m) => s + m.lateCount, 0);
  const avgPunctuality = totalClocked > 0 ? ((totalClocked - totalLate) / totalClocked) * 100 : 0;

  // Chart data
  const barData = professionalMetrics.slice(0, 10).map((m) => ({
    name: m.name.split(" ")[0],
    horas: Math.round(m.totalHoursWorked),
    presenca: Math.round(m.presenceRate),
  }));

  const pieData = [
    { name: "Presentes", value: totalClocked },
    { name: "Ausentes", value: totalShifts - totalClocked },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="p-4 bg-card/80 backdrop-blur-sm border-border/50">
        <div className="flex flex-wrap items-center gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Escala</Label>
            <Select value={selectedScheduleId} onValueChange={setSelectedScheduleId}>
              <SelectTrigger className="w-[200px] bg-background">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {schedules.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Período</Label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[180px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((mo) => (
                  <SelectItem key={mo.value} value={mo.value}>{mo.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {!selectedScheduleId ? (
        <Card className="p-12 text-center bg-card/80 border-border/50">
          <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Selecione uma escala para visualizar os indicadores.</p>
        </Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4 bg-card/80 border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Profissionais</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{professionalMetrics.length}</p>
              <p className="text-xs text-muted-foreground">{totalShifts} plantões escalados</p>
            </Card>
            <Card className="p-4 bg-card/80 border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <span className="text-xs text-muted-foreground">Presença</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{avgPresence.toFixed(0)}%</p>
              <p className="text-xs text-muted-foreground">{totalClocked} de {totalShifts} registrados</p>
            </Card>
            <Card className="p-4 bg-card/80 border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">Total de Horas</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{totalHours.toFixed(0)}h</p>
              <p className="text-xs text-muted-foreground">Pontualidade: {avgPunctuality.toFixed(0)}%</p>
            </Card>
            <Card className="p-4 bg-card/80 border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-xs text-muted-foreground">Atrasos</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{totalLate}</p>
              <p className="text-xs text-muted-foreground">nos {totalClocked} registros</p>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Bar chart */}
            <Card className="p-4 bg-card/80 border-border/50 col-span-2">
              <h3 className="text-sm font-semibold text-foreground mb-4">Horas por Profissional</h3>
              {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="horas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Horas" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                  Sem dados para o período selecionado
                </div>
              )}
            </Card>

            {/* Pie chart */}
            <Card className="p-4 bg-card/80 border-border/50">
              <h3 className="text-sm font-semibold text-foreground mb-4">Taxa de Presença</h3>
              {totalShifts > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      <Cell fill="hsl(var(--primary))" />
                      <Cell fill="hsl(var(--muted))" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                  Sem dados
                </div>
              )}
            </Card>
          </div>

          {/* Ranking */}
          <Card className="p-4 bg-card/80 border-border/50">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" />
              Ranking de Profissionais
            </h3>
            <div className="space-y-1.5">
              {professionalMetrics.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum dado disponível</p>
              ) : (
                professionalMetrics.map((m, idx) => (
                  <div key={m.userId} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors">
                    <span className={`text-sm font-bold w-6 text-center ${idx < 3 ? "text-primary" : "text-muted-foreground"}`}>
                      {idx + 1}º
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>{m.totalShifts} plantões</span>
                        <span>{m.totalHoursWorked.toFixed(0)}h</span>
                        {m.lateCount > 0 && <span className="text-amber-500">{m.lateCount} atrasos</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={m.presenceRate >= 90 ? "default" : m.presenceRate >= 70 ? "secondary" : "destructive"} className="text-[10px]">
                        {m.presenceRate.toFixed(0)}% presença
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {m.punctualityRate.toFixed(0)}% pontual
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
