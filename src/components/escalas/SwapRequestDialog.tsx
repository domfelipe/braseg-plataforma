import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowLeftRight, ArrowRight, Search, User, CalendarDays } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { requestShiftSwap } from "@/lib/swapRequestFlow";
import { fetchUserFutureAssignments } from "@/lib/swapRequestQueries";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  type: "troca" | "passagem";
  users: any[];
  onCreated: () => void;
}

export function SwapRequestDialog({
  open,
  onOpenChange,
  assignmentId,
  type,
  users,
  onCreated,
}: Props) {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const [notes, setNotes] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [counterAssignmentId, setCounterAssignmentId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) {
      setNotes("");
      setSelectedUserId(null);
      setCounterAssignmentId(null);
      setSearch("");
    }
  }, [open]);

  const filteredUsers = users.filter((u: any) => {
    if (u.user_id === user?.id) return false;
    const name = u.user_profiles?.full_name || "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  // For "troca", load future shifts of the selected counterparty
  const { data: counterShifts = [] } = useQuery({
    queryKey: ["counterparty-shifts", selectedCompany?.id, selectedUserId],
    enabled:
      type === "troca" && !!selectedCompany?.id && !!selectedUserId && open,
    queryFn: () =>
      fetchUserFutureAssignments(selectedCompany!.id, selectedUserId!),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      requestShiftSwap({
        assignmentId,
        type,
        toUserId: selectedUserId!,
        counterpartyAssignmentId:
          type === "troca" ? counterAssignmentId : null,
        notes: notes || null,
      }),
    onSuccess: () => {
      toast({
        title:
          type === "troca" ? "Troca solicitada" : "Passagem solicitada",
        description: "Aguardando resposta da contraparte.",
      });
      onCreated();
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({
        title: "Erro",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const isPassagem = type === "passagem";
  const canSubmit =
    !!selectedUserId &&
    (isPassagem || !!counterAssignmentId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isPassagem ? (
              <>
                <ArrowRight className="h-5 w-5 text-primary" /> Passar Plantão
              </>
            ) : (
              <>
                <ArrowLeftRight className="h-5 w-5 text-primary" /> Solicitar Troca
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isPassagem
              ? "Selecione o profissional para quem deseja passar este plantão."
              : "Selecione o colega e o plantão dele que você assumirá em retorno."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{isPassagem ? "Passar para" : "Trocar com"}</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar profissional..."
                className="pl-9"
              />
            </div>
            <div className="max-h-[180px] overflow-y-auto space-y-0.5 rounded-lg border border-border/50 p-1">
              {filteredUsers.map((u: any) => (
                <button
                  key={u.user_id}
                  onClick={() => {
                    setSelectedUserId(
                      selectedUserId === u.user_id ? null : u.user_id,
                    );
                    setCounterAssignmentId(null);
                  }}
                  className={`w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors text-sm ${
                    selectedUserId === u.user_id
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "hover:bg-muted/60"
                  }`}
                >
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                      selectedUserId === u.user_id ? "bg-primary/20" : "bg-muted"
                    }`}
                  >
                    <User className="h-3.5 w-3.5" />
                  </div>
                  <span className="font-medium">
                    {u.user_profiles?.full_name}
                  </span>
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-4">
                  Nenhum profissional encontrado
                </p>
              )}
            </div>
          </div>

          {!isPassagem && selectedUserId && (
            <div className="space-y-2">
              <Label>Plantão de retorno</Label>
              <div className="max-h-[180px] overflow-y-auto space-y-0.5 rounded-lg border border-border/50 p-1">
                {counterShifts.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-4">
                    Este profissional não tem plantões confirmados futuros.
                  </p>
                )}
                {counterShifts.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() =>
                      setCounterAssignmentId(
                        counterAssignmentId === s.id ? null : s.id,
                      )
                    }
                    className={`w-full flex items-center gap-3 p-2 rounded-md text-left text-sm transition-colors ${
                      counterAssignmentId === s.id
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "hover:bg-muted/60"
                    }`}
                  >
                    <CalendarDays className="h-4 w-4 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">
                        {format(new Date(s.date + "T12:00:00"), "EEE, dd/MM", {
                          locale: ptBR,
                        })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.grade_name} • {s.grade_time}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Observação</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Motivo da troca ou observações..."
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!canSubmit || createMutation.isPending}
              className="gap-2"
            >
              {isPassagem ? (
                <ArrowRight className="h-4 w-4" />
              ) : (
                <ArrowLeftRight className="h-4 w-4" />
              )}
              {createMutation.isPending
                ? "Enviando..."
                : isPassagem
                  ? "Passar Plantão"
                  : "Solicitar Troca"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
