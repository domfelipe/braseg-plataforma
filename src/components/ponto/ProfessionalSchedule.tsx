import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarDays } from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfessionalSchedule() {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const [dateFrom, setDateFrom] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(addMonths(new Date(), 1)), "yyyy-MM-dd"));

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["prof-schedule", selectedCompany?.id, user?.id, dateFrom, dateTo],
    queryFn: async () => {
      if (!user?.id || !selectedCompany?.id) return [];

      // Get all grades for this company's schedules
      const { data: schedules } = await supabase
        .from("schedules")
        .select("id, name, color")
        .eq("company_id", selectedCompany.id);

      if (!schedules?.length) return [];

      const scheduleIds = schedules.map((s) => s.id);
      const { data: grades } = await supabase
        .from("schedule_grades")
        .select("id, name, start_time, end_time, color, schedule_id")
        .in("schedule_id", scheduleIds);

      if (!grades?.length) return [];

      const gradeIds = grades.map((g) => g.id);
      const { data: shifts } = await supabase
        .from("shift_assignments")
        .select("*")
        .in("grade_id", gradeIds)
        .eq("user_id", user.id)
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date", { ascending: true });

      if (!shifts?.length) return [];

      const gradeMap = Object.fromEntries(grades.map((g) => [g.id, g]));
      const scheduleMap = Object.fromEntries(schedules.map((s) => [s.id, s]));

      return shifts.map((s) => {
        const grade = gradeMap[s.grade_id];
        const schedule = grade ? scheduleMap[grade.schedule_id] : null;
        return {
          ...s,
          gradeName: grade?.name || "—",
          gradeColor: grade?.color || "#888",
          startTime: grade?.start_time?.slice(0, 5) || "—",
          endTime: grade?.end_time?.slice(0, 5) || "—",
          scheduleName: schedule?.name || "—",
        };
      });
    },
    enabled: !!user?.id && !!selectedCompany?.id,
  });

  const isPast = (date: string) => new Date(date + "T23:59:59") < new Date();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          Minha Escala
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
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !assignments.length ? (
          <p className="text-sm text-muted-foreground">Nenhum plantão encontrado no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Data</TableHead>
                  <TableHead>Escala</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a: any) => (
                  <TableRow key={a.id} className={isPast(a.date) ? "opacity-60" : ""}>
                    <TableCell className="font-mono text-sm whitespace-nowrap">
                      {format(new Date(a.date + "T12:00:00"), "EEE, dd/MM", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-sm">{a.scheduleName}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: a.gradeColor }}
                        />
                        {a.gradeName}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {a.custom_start_time?.slice(0, 5) || a.startTime} — {a.custom_end_time?.slice(0, 5) || a.endTime}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          a.status === "confirmado" ? "default" :
                          a.status === "inativo" ? "destructive" :
                          a.status === "troca_pendente" ? "secondary" : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {a.status === "confirmado" ? "Confirmado" :
                         a.status === "inativo" ? "Inativo" :
                         a.status === "troca_pendente" ? "Troca pendente" : a.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
