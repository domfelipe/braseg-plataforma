import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Check,
  X,
  ArrowLeftRight,
  ArrowRight,
  Clock,
  User,
  CalendarDays,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { fetchEnrichedSwapRequests, EnrichedSwapRequest } from "@/lib/swapRequestQueries";
import { reviewShiftSwap, statusLabel, statusVariant } from "@/lib/swapRequestFlow";

interface Props {
  companyId: string;
}

export function SwapRequestsList({ companyId }: Props) {
  const { isMaster } = useAuth();
  const queryClient = useQueryClient();
  const [reviewTarget, setReviewTarget] = useState<{
    req: EnrichedSwapRequest;
    approve: boolean;
  } | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["swap-requests", companyId],
    queryFn: () => fetchEnrichedSwapRequests(companyId),
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      reviewShiftSwap({
        requestId: reviewTarget!.req.id,
        approve: reviewTarget!.approve,
        notes: reviewNotes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swap-requests"] });
      queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
      toast({
        title: reviewTarget?.approve ? "Troca aprovada" : "Troca recusada",
      });
      setReviewTarget(null);
      setReviewNotes("");
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const reviewQueue = requests.filter((r) => r.status === "aguardando_admin");
  const waitingDoctor = requests.filter((r) => r.status === "aguardando_medico");
  const history = requests.filter(
    (r) => !["aguardando_admin", "aguardando_medico"].includes(r.status),
  );

  if (isLoading) {
    return (
      <Card className="p-8 text-center bg-card/80 backdrop-blur-sm border-border/50">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Carregando solicitações...
        </div>
      </Card>
    );
  }

  if (requests.length === 0) {
    return (
      <Card className="p-12 text-center bg-card/80 backdrop-blur-sm border-border/50">
        <ArrowLeftRight className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Nenhuma solicitação de troca
        </h3>
        <p className="text-sm text-muted-foreground">
          Quando profissionais solicitarem trocas ou passagens, elas aparecerão aqui.
        </p>
      </Card>
    );
  }

  const renderRequest = (req: EnrichedSwapRequest, showAdminActions: boolean) => (
    <Card
      key={req.id}
      className="p-4 bg-card/80 backdrop-blur-sm border-border/50 hover:shadow-md transition-shadow"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div
            className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
              req.type === "passagem" ? "bg-blue-500/10" : "bg-violet-500/10"
            }`}
          >
            {req.type === "passagem" ? (
              <ArrowRight className="h-5 w-5 text-blue-500" />
            ) : (
              <ArrowLeftRight className="h-5 w-5 text-violet-500" />
            )}
          </div>
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px] capitalize font-medium">
                {req.type}
              </Badge>
              <Badge variant={statusVariant(req.status)}>{statusLabel(req.status)}</Badge>
              {req.schedule_name && (
                <Badge variant="secondary" className="text-[10px]">
                  <span
                    className="w-2 h-2 rounded-full mr-1 inline-block"
                    style={{ backgroundColor: req.schedule_color ?? undefined }}
                  />
                  {req.schedule_name}
                </Badge>
              )}
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-medium text-foreground">{req.from_user_name}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium text-foreground">
                  {req.to_user_name ?? "—"}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                {req.assignment_date && (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {format(new Date(req.assignment_date + "T12:00:00"), "dd/MM/yyyy (EEE)", { locale: ptBR })}
                  </span>
                )}
                {req.grade_name && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {req.grade_name}
                    {req.grade_time && ` • ${req.grade_time}`}
                  </span>
                )}
              </div>

              {req.type === "troca" && req.counter_assignment_date && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap pt-1 border-t border-border/40 mt-1">
                  <span className="font-medium text-foreground/80">Retorno:</span>
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {format(new Date(req.counter_assignment_date + "T12:00:00"), "dd/MM/yyyy (EEE)", { locale: ptBR })}
                  </span>
                  {req.counter_grade_name && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {req.counter_grade_name}
                      {req.counter_grade_time && ` • ${req.counter_grade_time}`}
                    </span>
                  )}
                </div>
              )}
            </div>

            {req.notes && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1 mt-1 italic">
                "{req.notes}"
              </p>
            )}
            {req.counterparty_notes && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1 mt-1 italic">
                Médico: "{req.counterparty_notes}"
              </p>
            )}
            {req.admin_notes && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1 mt-1 italic whitespace-pre-line">
                Admin: "{req.admin_notes.trim()}"
              </p>
            )}

            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
              <Clock className="h-2.5 w-2.5" />
              {format(new Date(req.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              {req.approved_by_name && <span>• por {req.approved_by_name}</span>}
            </div>
          </div>
        </div>

        {showAdminActions && isMaster && (
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                setReviewTarget({ req, approve: true });
                setReviewNotes("");
              }}
            >
              <Check className="h-3.5 w-3.5" />
              Confirmar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => {
                setReviewTarget({ req, approve: false });
                setReviewNotes("");
              }}
            >
              <X className="h-3.5 w-3.5" />
              Recusar
            </Button>
          </div>
        )}
      </div>
    </Card>
  );

  return (
    <>
      <Tabs defaultValue="review" className="space-y-4">
        <TabsList className="bg-muted/60 backdrop-blur-sm border border-border/50">
          <TabsTrigger value="review" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Revisão Admin
            {reviewQueue.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]">
                {reviewQueue.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="waiting" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Aguardando Médico
            {waitingDoctor.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]">
                {waitingDoctor.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="review" className="space-y-3">
          {reviewQueue.length === 0 ? (
            <Card className="p-8 text-center bg-card/80 backdrop-blur-sm border-border/50">
              <Check className="h-10 w-10 mx-auto text-emerald-500/40 mb-3" />
              <p className="text-sm text-muted-foreground">Nada para revisar</p>
            </Card>
          ) : (
            reviewQueue.map((r) => renderRequest(r, true))
          )}
        </TabsContent>

        <TabsContent value="waiting" className="space-y-3">
          {waitingDoctor.length === 0 ? (
            <Card className="p-8 text-center bg-card/80 backdrop-blur-sm border-border/50">
              <p className="text-sm text-muted-foreground">Nenhuma pendência com médicos</p>
            </Card>
          ) : (
            waitingDoctor.map((r) => renderRequest(r, false))
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          {history.length === 0 ? (
            <Card className="p-8 text-center bg-card/80 backdrop-blur-sm border-border/50">
              <p className="text-sm text-muted-foreground">Sem histórico</p>
            </Card>
          ) : (
            history.map((r) => renderRequest(r, false))
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!reviewTarget} onOpenChange={(o) => !o && setReviewTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reviewTarget?.approve ? "Confirmar troca" : "Recusar troca"}
            </DialogTitle>
            <DialogDescription>
              {reviewTarget?.approve
                ? "Ao confirmar, a troca será executada na escala."
                : "Adicione um motivo para o registro da recusa."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder="Observação (opcional)"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => reviewMutation.mutate()}
              disabled={reviewMutation.isPending}
              className={reviewTarget?.approve ? "bg-emerald-600 hover:bg-emerald-700" : ""}
              variant={reviewTarget?.approve ? "default" : "destructive"}
            >
              {reviewMutation.isPending
                ? "Processando..."
                : reviewTarget?.approve
                  ? "Confirmar"
                  : "Recusar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
