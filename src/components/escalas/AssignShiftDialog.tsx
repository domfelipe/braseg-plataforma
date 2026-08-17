import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { User, Search, AlertTriangle, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { detectConflicts, type ConflictResult } from "@/lib/scheduleConflicts";
import { format, startOfWeek, addDays } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gradeId: string;
  date: string;
  slotIndex: number;
  users: any[];
  grades: any[];
  assignments: any[];
  maxWeeklyHours: number;
  onAssigned: () => void;
}

export function AssignShiftDialog({ open, onOpenChange, gradeId, date, slotIndex, users, grades, assignments, maxWeeklyHours, onAssigned }: Props) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);

  const targetGrade = grades.find((g: any) => g.id === gradeId);

  // Compute week dates for the target date
  const weekDates = useMemo(() => {
    const d = new Date(date + "T12:00:00");
    const ws = startOfWeek(d, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => format(addDays(ws, i), "yyyy-MM-dd"));
  }, [date]);

  const filteredUsers = users.filter((u: any) => {
    const name = u.user_profiles?.full_name || "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  // Get conflicts for hovered user
  const hoveredConflicts = useMemo((): ConflictResult[] => {
    if (!hoveredUserId || !targetGrade) return [];
    return detectConflicts(
      hoveredUserId,
      date,
      targetGrade,
      slotIndex,
      assignments,
      grades,
      maxWeeklyHours,
      weekDates
    );
  }, [hoveredUserId, targetGrade, date, slotIndex, assignments, grades, maxWeeklyHours, weekDates]);

  // Precompute conflicts for all users to show icons
  const userConflictsMap = useMemo(() => {
    if (!targetGrade) return new Map<string, ConflictResult[]>();
    const map = new Map<string, ConflictResult[]>();
    for (const u of filteredUsers) {
      const conflicts = detectConflicts(
        u.user_id,
        date,
        targetGrade,
        slotIndex,
        assignments,
        grades,
        maxWeeklyHours,
        weekDates
      );
      if (conflicts.length > 0) map.set(u.user_id, conflicts);
    }
    return map;
  }, [filteredUsers, targetGrade, date, slotIndex, assignments, grades, maxWeeklyHours, weekDates]);

  const assignMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("shift_assignments").insert({
        grade_id: gradeId,
        date,
        user_id: userId,
        slot_index: slotIndex,
        status: "confirmado",
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Profissional escalado" });
      onAssigned();
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const handleAssign = (userId: string) => {
    const conflicts = userConflictsMap.get(userId) || [];
    const hasError = conflicts.some((c) => c.severity === "error");
    if (hasError) {
      toast({
        title: "Conflito detectado",
        description: conflicts.find((c) => c.severity === "error")?.message,
        variant: "destructive",
      });
      return;
    }
    // Warnings: assign but show toast
    if (conflicts.length > 0) {
      toast({
        title: "Atenção",
        description: conflicts[0].message,
      });
    }
    assignMutation.mutate(userId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Escalar Profissional</DialogTitle>
          <DialogDescription>Selecione o profissional para este plantão ({date})</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar profissional..."
              className="pl-9"
            />
          </div>

          {/* Conflict alert for hovered user */}
          {hoveredConflicts.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 space-y-1">
              {hoveredConflicts.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {c.severity === "error" ? (
                    <ShieldAlert className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                  )}
                  <span className={c.severity === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-400"}>
                    {c.message}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {filteredUsers.map((u: any) => {
              const conflicts = userConflictsMap.get(u.user_id);
              const hasError = conflicts?.some((c) => c.severity === "error");
              const hasWarning = conflicts && !hasError;

              return (
                <button
                  key={u.user_id}
                  onClick={() => handleAssign(u.user_id)}
                  onMouseEnter={() => setHoveredUserId(u.user_id)}
                  onMouseLeave={() => setHoveredUserId(null)}
                  disabled={assignMutation.isPending}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/60 transition-colors text-left ${
                    hasError ? "opacity-60" : ""
                  }`}
                >
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                    hasError ? "bg-destructive/10" : hasWarning ? "bg-warning/10" : "bg-primary/10"
                  }`}>
                    {hasError ? (
                      <ShieldAlert className="h-4 w-4 text-destructive" />
                    ) : hasWarning ? (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    ) : (
                      <User className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{u.user_profiles?.full_name}</p>
                    {u.user_profiles?.phone && (
                      <p className="text-xs text-muted-foreground">{u.user_profiles.phone}</p>
                    )}
                  </div>
                  {hasError && (
                    <span className="text-[10px] text-destructive font-medium shrink-0">CONFLITO</span>
                  )}
                  {hasWarning && (
                    <span className="text-[10px] text-amber-500 font-medium shrink-0">ATENÇÃO</span>
                  )}
                </button>
              );
            })}
            {filteredUsers.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">Nenhum profissional encontrado</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
