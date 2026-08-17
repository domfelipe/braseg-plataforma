import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  schedule?: any;
  onSaved: () => void;
}

interface GradeForm {
  id?: string;
  name: string;
  start_time: string;
  end_time: string;
  specialty: string;
  shift_type: string;
  color: string;
}

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

const defaultGrade: GradeForm = {
  name: "",
  start_time: "07:00",
  end_time: "19:00",
  specialty: "",
  shift_type: "",
  color: "#10b981",
};

export function ScheduleConfigDialog({ open, onOpenChange, companyId, schedule, onSaved }: Props) {
  const queryClient = useQueryClient();
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleColor, setScheduleColor] = useState("#3b82f6");
  const [maxWeeklyHours, setMaxWeeklyHours] = useState(44);
  const [grades, setGrades] = useState<GradeForm[]>([]);
  const isEditing = !!schedule;

  // Load existing grades
  const { data: existingGrades = [] } = useQuery({
    queryKey: ["schedule-grades-config", schedule?.id],
    queryFn: async () => {
      if (!schedule?.id) return [];
      const { data, error } = await supabase
        .from("schedule_grades")
        .select("*")
        .eq("schedule_id", schedule.id)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!schedule?.id && open,
  });

  // Only reset form when dialog opens or schedule ID changes, not on object reference changes
  const scheduleId = schedule?.id;
  useEffect(() => {
    if (!open) return;
    if (schedule) {
      setScheduleName(schedule.name);
      setScheduleColor(schedule.color || "#3b82f6");
      setMaxWeeklyHours(schedule.max_weekly_hours ?? 44);
    } else {
      setScheduleName("");
      setScheduleColor("#3b82f6");
      setMaxWeeklyHours(44);
      setGrades([{ ...defaultGrade }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleId, open]);

  useEffect(() => {
    if (!open || !isEditing) return;
    if (existingGrades.length > 0) {
      setGrades(
        existingGrades.map((g: any) => ({
          id: g.id,
          name: g.name,
          start_time: g.start_time?.slice(0, 5) || "07:00",
          end_time: g.end_time?.slice(0, 5) || "19:00",
          specialty: g.specialty || "",
          shift_type: g.shift_type || "",
          color: g.color || "#10b981",
        }))
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingGrades]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      let scheduleId = schedule?.id;

      if (isEditing) {
        const { error } = await supabase
          .from("schedules")
          .update({ name: scheduleName, color: scheduleColor, max_weekly_hours: maxWeeklyHours } as any)
          .eq("id", scheduleId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("schedules")
          .insert({ name: scheduleName, color: scheduleColor, company_id: companyId, max_weekly_hours: maxWeeklyHours } as any)
          .select("id")
          .single();
        if (error) throw error;
        scheduleId = data.id;
      }

      // Delete removed grades
      if (isEditing) {
        const existingIds = grades.filter((g) => g.id).map((g) => g.id!);
        const toDelete = existingGrades.filter((g: any) => !existingIds.includes(g.id));
        for (const g of toDelete) {
          await supabase.from("schedule_grades").delete().eq("id", g.id);
        }
      }

      // Upsert grades
      for (let i = 0; i < grades.length; i++) {
        const g = grades[i];
        const payload = {
          schedule_id: scheduleId,
          name: g.name,
          start_time: g.start_time,
          end_time: g.end_time,
          specialty: g.specialty || null,
          shift_type: g.shift_type || null,
          color: g.color,
          sort_order: i,
        };

        if (g.id) {
          await supabase.from("schedule_grades").update(payload).eq("id", g.id);
        } else {
          await supabase.from("schedule_grades").insert(payload);
        }
      }
    },
    onSuccess: () => {
      toast({ title: isEditing ? "Escala atualizada" : "Escala criada" });
      onSaved();
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    },
  });

  const addGrade = () => setGrades([...grades, { ...defaultGrade, color: COLORS[grades.length % COLORS.length] }]);
  const removeGrade = (idx: number) => setGrades(grades.filter((_, i) => i !== idx));
  const updateGrade = (idx: number, field: keyof GradeForm, value: string) => {
    const updated = [...grades];
    updated[idx] = { ...updated[idx], [field]: value };
    setGrades(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Configurar Escala" : "Nova Escala"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Edite as grades e turnos da escala." : "Crie uma nova escala com seus turnos."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Schedule info */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Nome da Escala</Label>
              <Input
                value={scheduleName}
                onChange={(e) => setScheduleName(e.target.value)}
                placeholder="Ex: PLANTÃO IGT"
              />
            </div>
            <div className="space-y-2">
              <Label>Máx. Horas/Semana</Label>
              <Input
                type="number"
                value={maxWeeklyHours}
                onChange={(e) => setMaxWeeklyHours(Number(e.target.value))}
                min={1}
                max={168}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex gap-2 flex-wrap pt-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setScheduleColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      scheduleColor === c ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Grades */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Grades (Turnos)</Label>
              <Button variant="outline" size="sm" onClick={addGrade} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Adicionar Grade
              </Button>
            </div>

            {grades.map((grade, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-border/50 p-3 space-y-3 bg-muted/20"
                style={{ borderLeftColor: grade.color, borderLeftWidth: 3 }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="grid grid-cols-2 gap-3 flex-1">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome</Label>
                      <Input
                        value={grade.name}
                        onChange={(e) => updateGrade(idx, "name", e.target.value)}
                        placeholder="Ex: Reta"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Início</Label>
                        <Input
                          type="time"
                          value={grade.start_time}
                          onChange={(e) => updateGrade(idx, "start_time", e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Fim</Label>
                        <Input
                          type="time"
                          value={grade.end_time}
                          onChange={(e) => updateGrade(idx, "end_time", e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Especialidade</Label>
                      <Input
                        value={grade.specialty}
                        onChange={(e) => updateGrade(idx, "specialty", e.target.value)}
                        placeholder="Ex: Clínica Médica"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Tipo</Label>
                      <Input
                        value={grade.shift_type}
                        onChange={(e) => updateGrade(idx, "shift_type", e.target.value)}
                        placeholder="Ex: Retaguarda"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-2 pt-5">
                    <div className="flex gap-1">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => updateGrade(idx, "color", c)}
                          className={`w-4 h-4 rounded-full border transition-all ${
                            grade.color === c ? "border-foreground scale-125" : "border-transparent"
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    {grades.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeGrade(idx)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!scheduleName.trim() || grades.some((g) => !g.name.trim()) || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
