import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, RefreshCw, User, Calendar, Loader2, Eye } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { format, addDays, startOfWeek, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  scheduleId: string;
  grades: any[];
  users: any[];
  onGenerated: () => void;
}

interface GroupEntry {
  label: string;
  userIds: string[];
}

export function RotationPatternDialog({ open, onOpenChange, companyId, scheduleId, grades, users, onGenerated }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedGradeId, setSelectedGradeId] = useState<string>("");
  const [patternName, setPatternName] = useState("A/B");
  const [cycleDays, setCycleDays] = useState(7);
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 27), "yyyy-MM-dd"));
  const [groups, setGroups] = useState<GroupEntry[]>([
    { label: "A", userIds: [] },
    { label: "B", userIds: [] },
  ]);
  const [showPreview, setShowPreview] = useState(false);

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u: any) => map.set(u.user_id, u.user_profiles?.full_name || "Sem nome"));
    return map;
  }, [users]);

  const addGroup = () => {
    const labels = "ABCDEFGH";
    const nextLabel = labels[groups.length] || `G${groups.length + 1}`;
    setGroups([...groups, { label: nextLabel, userIds: [] }]);
  };

  const removeGroup = (idx: number) => {
    if (groups.length <= 2) return;
    setGroups(groups.filter((_, i) => i !== idx));
  };

  const toggleUserInGroup = (groupIdx: number, userId: string) => {
    const updated = [...groups];
    const group = updated[groupIdx];
    if (group.userIds.includes(userId)) {
      group.userIds = group.userIds.filter((id) => id !== userId);
    } else {
      // Remove from other groups first
      updated.forEach((g, i) => {
        if (i !== groupIdx) g.userIds = g.userIds.filter((id) => id !== userId);
      });
      group.userIds = [...group.userIds, userId];
    }
    setGroups(updated);
  };

  const getUserGroup = (userId: string): string | null => {
    for (const g of groups) {
      if (g.userIds.includes(userId)) return g.label;
    }
    return null;
  };

  // Generate preview of assignments
  const previewAssignments = useMemo(() => {
    if (!selectedGradeId || groups.every((g) => g.userIds.length === 0)) return [];

    const start = new Date(startDate + "T12:00:00");
    const end = new Date(endDate + "T12:00:00");
    const days = eachDayOfInterval({ start, end });

    const activeGroups = groups.filter((g) => g.userIds.length > 0);
    if (activeGroups.length === 0) return [];

    const result: { date: string; groupLabel: string; userIds: string[] }[] = [];
    
    days.forEach((day, dayIndex) => {
      const cyclePosition = Math.floor(dayIndex / cycleDays) % activeGroups.length;
      const group = activeGroups[cyclePosition];
      result.push({
        date: format(day, "yyyy-MM-dd"),
        groupLabel: group.label,
        userIds: group.userIds,
      });
    });

    return result;
  }, [selectedGradeId, groups, cycleDays, startDate, endDate]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGradeId) throw new Error("Selecione uma grade");
      if (previewAssignments.length === 0) throw new Error("Nenhum plantão para gerar");

      // Check existing assignments to avoid duplicates
      const { data: existing } = await supabase
        .from("shift_assignments")
        .select("date, user_id, slot_index")
        .eq("grade_id", selectedGradeId)
        .gte("date", startDate)
        .lte("date", endDate);

      const existingSet = new Set(
        (existing || []).map((e: any) => `${e.date}-${e.user_id}-${e.slot_index}`)
      );

      const inserts: any[] = [];
      for (const pa of previewAssignments) {
        pa.userIds.forEach((userId, slotIdx) => {
          const key = `${pa.date}-${userId}-${slotIdx}`;
          if (!existingSet.has(key)) {
            inserts.push({
              grade_id: selectedGradeId,
              date: pa.date,
              user_id: userId,
              slot_index: slotIdx,
              status: "confirmado",
              created_by: user?.id,
            });
          }
        });
      }

      if (inserts.length === 0) throw new Error("Todos os plantões já existem para este período");

      // Insert in batches of 100
      for (let i = 0; i < inserts.length; i += 100) {
        const batch = inserts.slice(i, i + 100);
        const { error } = await supabase.from("shift_assignments").insert(batch);
        if (error) throw error;
      }

      // Save pattern config
      await supabase.from("schedule_rotation_patterns" as any).insert({
        schedule_id: scheduleId,
        grade_id: selectedGradeId,
        pattern_name: patternName,
        pattern_config: groups,
        cycle_days: cycleDays,
        start_date: startDate,
      });

      return inserts.length;
    },
    onSuccess: (count) => {
      toast({ title: `${count} plantão(ões) gerado(s) com sucesso` });
      queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
      onGenerated();
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({ title: "Erro ao gerar escala", description: e.message, variant: "destructive" });
    },
  });

  const selectedGrade = grades.find((g: any) => g.id === selectedGradeId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Escala de Revezamento Automático
          </DialogTitle>
          <DialogDescription>
            Configure grupos de profissionais que se alternam em ciclos regulares
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Config row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Grade</Label>
              <Select value={selectedGradeId} onValueChange={setSelectedGradeId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {grades.map((g: any) => (
                    <SelectItem key={g.id} value={g.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                        {g.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nome do Padrão</Label>
              <Input value={patternName} onChange={(e) => setPatternName(e.target.value)} className="h-9 text-sm" placeholder="Ex: A/B" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ciclo (dias)</Label>
              <Input type="number" value={cycleDays} onChange={(e) => setCycleDays(Number(e.target.value))} min={1} max={30} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Início</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Fim do Período</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          {/* Groups */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Grupos de Revezamento</Label>
              <Button variant="outline" size="sm" onClick={addGroup} className="gap-1.5 h-7 text-xs">
                <Plus className="h-3 w-3" />
                Grupo
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {groups.map((group, gIdx) => (
                <Card key={gIdx} className="p-3 space-y-2 border-border/50">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-xs font-semibold">
                      Grupo {group.label}
                    </Badge>
                    {groups.length > 2 && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeGroup(gIdx)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1 max-h-[150px] overflow-y-auto">
                    {users.map((u: any) => {
                      const userGroup = getUserGroup(u.user_id);
                      const isInThisGroup = userGroup === group.label;
                      const isInOther = userGroup && !isInThisGroup;

                      return (
                        <button
                          key={u.user_id}
                          onClick={() => toggleUserInGroup(gIdx, u.user_id)}
                          className={`w-full flex items-center gap-2 p-1.5 rounded text-left text-xs transition-colors ${
                            isInThisGroup
                              ? "bg-primary/10 text-primary font-medium"
                              : isInOther
                              ? "opacity-40 cursor-not-allowed"
                              : "hover:bg-muted/60"
                          }`}
                        >
                          <User className="h-3 w-3 shrink-0" />
                          <span className="truncate">{u.user_profiles?.full_name || "Sem nome"}</span>
                          {isInOther && <Badge variant="outline" className="text-[9px] ml-auto h-4">{userGroup}</Badge>}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {group.userIds.length} profissional(is)
                  </p>
                </Card>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowPreview(!showPreview)}
              disabled={previewAssignments.length === 0}
            >
              <Eye className="h-3.5 w-3.5" />
              {showPreview ? "Ocultar" : "Visualizar"} Preview ({previewAssignments.length} dias)
            </Button>

            {showPreview && previewAssignments.length > 0 && (
              <Card className="p-3 max-h-[200px] overflow-y-auto border-border/50">
                <div className="grid grid-cols-7 gap-1 text-[10px]">
                  {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                    <div key={d} className="text-center font-semibold text-muted-foreground pb-1">{d}</div>
                  ))}
                  {/* Pad start of first week */}
                  {(() => {
                    const firstDate = new Date(previewAssignments[0].date + "T12:00:00");
                    const dayOfWeek = (firstDate.getDay() + 6) % 7;
                    return Array.from({ length: dayOfWeek }, (_, i) => (
                      <div key={`pad-${i}`} />
                    ));
                  })()}
                  {previewAssignments.map((pa) => (
                    <div
                      key={pa.date}
                      className="text-center p-1 rounded border border-border/30"
                    >
                      <div className="font-medium">{format(new Date(pa.date + "T12:00:00"), "dd")}</div>
                      <Badge
                        variant="secondary"
                        className="text-[9px] px-1 h-4 mt-0.5"
                        style={{
                          backgroundColor: selectedGrade?.color ? `${selectedGrade.color}20` : undefined,
                          color: selectedGrade?.color,
                        }}
                      >
                        {pa.groupLabel}
                      </Badge>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending || previewAssignments.length === 0 || !selectedGradeId}
              className="gap-2"
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Calendar className="h-4 w-4" />
              )}
              Gerar {previewAssignments.length} Plantões
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
