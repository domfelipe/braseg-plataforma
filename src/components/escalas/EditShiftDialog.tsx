import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Clock, Ban } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: any;
  gradeStartTime?: string;
  gradeEndTime?: string;
  onUpdated: () => void;
}

export function EditShiftDialog({ open, onOpenChange, assignment, gradeStartTime, gradeEndTime, onUpdated }: Props) {
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [status, setStatus] = useState("confirmado");

  useEffect(() => {
    if (open && assignment) {
      setStartTime(assignment.custom_start_time?.slice(0, 5) || gradeStartTime?.slice(0, 5) || "07:00");
      setEndTime(assignment.custom_end_time?.slice(0, 5) || gradeEndTime?.slice(0, 5) || "19:00");
      setStatus(assignment.status || "confirmado");
    }
  }, [open, assignment?.id]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("shift_assignments")
        .update({
          custom_start_time: startTime + ":00",
          custom_end_time: endTime + ":00",
          status,
        })
        .eq("id", assignment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Plantão atualizado" });
      onUpdated();
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const userName = assignment?.user_profiles?.full_name || "Profissional";
  const dateLabel = assignment?.date
    ? format(new Date(assignment.date + "T12:00:00"), "EEEE, dd/MM/yyyy", { locale: ptBR })
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Plantão</DialogTitle>
          <DialogDescription>
            {userName} — {dateLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Início
              </Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Fim
              </Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmado">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Confirmado
                  </div>
                </SelectItem>
                <SelectItem value="aberto">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Aberto
                  </div>
                </SelectItem>
                <SelectItem value="inativo">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-gray-400" />
                    Inativo
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
