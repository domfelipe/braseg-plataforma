import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, FileText, Clock, CalendarDays } from "lucide-react";
import { format, startOfMonth, endOfMonth, differenceInMinutes, eachDayOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export function ProfessionalClockReport() {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: entries, isLoading } = useQuery({
    queryKey: ["prof-clock-report", selectedCompany?.id, user?.id, dateFrom, dateTo, filterStatus],
    queryFn: async () => {
      if (!selectedCompany?.id || !user?.id) return [];
      let query = supabase
        .from("clock_entries")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .eq("user_id", user.id)
        .gte("timestamp", `${dateFrom}T00:00:00`)
        .lte("timestamp", `${dateTo}T23:59:59`)
        .order("timestamp", { ascending: false });

      if (filterStatus === "valid") query = query.eq("valid", true);
      if (filterStatus === "invalid") query = query.eq("valid", false);

      const { data } = await query;
      return data || [];
    },
    enabled: !!selectedCompany?.id && !!user?.id,
  });

  // Fetch shift assignments for the period to show schedule comparison
  const { data: shiftAssignments = [] } = useQuery({
    queryKey: ["prof-shifts-report", selectedCompany?.id, user?.id, dateFrom, dateTo],
    queryFn: async () => {
      if (!selectedCompany?.id || !user?.id) return [];

      const { data: schedules } = await supabase
        .from("schedules")
        .select("id")
        .eq("company_id", selectedCompany.id);

      if (!schedules?.length) return [];

      const { data: grades } = await supabase
        .from("schedule_grades")
        .select("id, name, start_time, end_time, color, schedule_id")
        .in("schedule_id", schedules.map((s) => s.id));

      if (!grades?.length) return [];

      const { data: shifts } = await supabase
        .from("shift_assignments")
        .select("*")
        .in("grade_id", grades.map((g) => g.id))
        .eq("user_id", user.id)
        .eq("status", "confirmado")
        .gte("date", dateFrom)
        .lte("date", dateTo);

      if (!shifts?.length) return [];

      const gradeMap = Object.fromEntries(grades.map((g) => [g.id, g]));
      return shifts.map((s) => {
        const grade = gradeMap[s.grade_id];
        return {
          ...s,
          gradeName: grade?.name || "—",
          startTime: s.custom_start_time?.slice(0, 5) || grade?.start_time?.slice(0, 5) || "—",
          endTime: s.custom_end_time?.slice(0, 5) || grade?.end_time?.slice(0, 5) || "—",
        };
      });
    },
    enabled: !!selectedCompany?.id && !!user?.id,
  });

  const hoursSummary = (() => {
    if (!entries?.length) return null;
    const sorted = [...entries].filter((e) => e.valid).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    let totalMinutes = 0;
    let i = 0;
    while (i < sorted.length - 1) {
      if (sorted[i].type === "entrada" && sorted[i + 1].type === "saida") {
        totalMinutes += differenceInMinutes(
          new Date(sorted[i + 1].timestamp),
          new Date(sorted[i].timestamp)
        );
        i += 2;
      } else {
        i++;
      }
    }
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const decimal = (totalMinutes / 60).toFixed(3).replace(".", ",");
    return { totalMinutes, formatted: `${hours}h ${mins}min (${decimal})` };
  })();

  // Build daily comparison: schedule vs actual
  const dailyComparison = useMemo(() => {
    if (!shiftAssignments.length) return null;

    const shiftsByDate: Record<string, any[]> = {};
    for (const s of shiftAssignments) {
      if (!shiftsByDate[s.date]) shiftsByDate[s.date] = [];
      shiftsByDate[s.date].push(s);
    }

    const entriesByDate: Record<string, any[]> = {};
    for (const e of (entries || [])) {
      const d = e.timestamp.split("T")[0];
      if (!entriesByDate[d]) entriesByDate[d] = [];
      entriesByDate[d].push(e);
    }

    const allDates = new Set([...Object.keys(shiftsByDate), ...Object.keys(entriesByDate)]);
    const result: {
      date: string;
      shifts: any[];
      clockedIn: boolean;
      status: "presente" | "ausente" | "atrasado";
    }[] = [];

    for (const date of Array.from(allDates).sort()) {
      const shifts = shiftsByDate[date] || [];
      const dayEntries = (entriesByDate[date] || []).filter((e: any) => e.valid);
      const hasEntrada = dayEntries.some((e: any) => e.type === "entrada");

      if (shifts.length === 0) continue; // no shift scheduled, skip

      let status: "presente" | "ausente" | "atrasado" = "ausente";
      if (hasEntrada) {
        // Check if late (entrada > start_time + 15 min tolerance)
        const firstEntrada = dayEntries
          .filter((e: any) => e.type === "entrada")
          .sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp))[0];

        const shiftStart = shifts[0].startTime;
        if (firstEntrada && shiftStart && shiftStart !== "—") {
          const [sh, sm] = shiftStart.split(":").map(Number);
          const entradaDate = new Date(firstEntrada.timestamp);
          const entradaMin = entradaDate.getHours() * 60 + entradaDate.getMinutes();
          const shiftStartMin = sh * 60 + sm;
          status = entradaMin > shiftStartMin + 15 ? "atrasado" : "presente";
        } else {
          status = "presente";
        }
      }

      result.push({ date, shifts, clockedIn: hasEntrada, status });
    }

    return result;
  }, [shiftAssignments, entries]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Meu Relatório de Ponto
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="valid">Válidos</SelectItem>
                <SelectItem value="invalid">Inválidos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !entries?.length ? (
          <p className="text-sm text-muted-foreground">Nenhum registro encontrado.</p>
        ) : (
          <>
            {hoursSummary && (
              <Card className="bg-muted/50">
                <CardContent className="flex items-center gap-3 py-4 px-4">
                  <Clock className="h-5 w-5 text-accent" />
                  <div>
                    <p className="text-sm font-medium">Total de Horas Trabalhadas</p>
                    <p className="text-lg font-bold font-mono">{hoursSummary.formatted}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Schedule vs Clock comparison */}
            {dailyComparison && dailyComparison.length > 0 && (
              <Card className="bg-muted/30 border-border/50">
                <CardContent className="py-4 px-4 space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    Escala vs. Ponto
                  </p>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Data</TableHead>
                          <TableHead className="text-xs">Escala Prevista</TableHead>
                          <TableHead className="text-xs">Presença</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailyComparison.map((day) => (
                          <TableRow key={day.date}>
                            <TableCell className="font-mono text-sm whitespace-nowrap">
                              {format(new Date(day.date + "T12:00:00"), "EEE dd/MM", { locale: ptBR })}
                            </TableCell>
                            <TableCell className="text-sm">
                              {day.shifts.map((s: any, i: number) => (
                                <span key={i} className="block text-xs">
                                  {s.gradeName}: {s.startTime}–{s.endTime}
                                </span>
                              ))}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  day.status === "presente" ? "default" :
                                  day.status === "atrasado" ? "secondary" : "destructive"
                                }
                                className="text-[10px]"
                              >
                                {day.status === "presente" ? "✓ Presente" :
                                 day.status === "atrasado" ? "⏰ Atrasado" : "✗ Ausente"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Data/Hora</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Distância</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-sm">
                        {format(new Date(entry.timestamp), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={entry.type === "entrada" ? "default" : "secondary"}>
                          {entry.type === "entrada" ? "Entrada" : "Saída"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {entry.valid ? (
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm">
                            <CheckCircle className="h-3.5 w-3.5" /> Válido
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-destructive text-sm">
                            <XCircle className="h-3.5 w-3.5" /> Inválido
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {entry.distance_meters != null ? `${entry.distance_meters}m` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
