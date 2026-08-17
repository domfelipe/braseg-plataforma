import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ArrowLeftRight,
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  Inbox,
  Send,
  User,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  EnrichedSwapRequest,
  fetchEnrichedSwapRequests,
} from "@/lib/swapRequestQueries";
import {
  respondShiftSwap,
  statusLabel,
  statusVariant,
} from "@/lib/swapRequestFlow";

export function ProfessionalSwapRequests() {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const [respondTarget, setRespondTarget] = useState<{
    req: EnrichedSwapRequest;
    accept: boolean;
  } | null>(null);
  const [respondNotes, setRespondNotes] = useState("");

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["swap-requests", selectedCompany?.id],
    queryFn: () => fetchEnrichedSwapRequests(selectedCompany!.id),
    enabled: !!selectedCompany?.id,
  });

  const respond = useMutation({
    mutationFn: () =>
      respondShiftSwap({
        requestId: respondTarget!.req.id,
        accept: respondTarget!.accept,
        notes: respondNotes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swap-requests"] });
      queryClient.invalidateQueries({ queryKey: ["prof-schedule"] });
      toast({
        title: respondTarget?.accept
          ? "Solicitação aceita"
          : "Solicitação recusada",
      });
      setRespondTarget(null);
      setRespondNotes("");
    },
    onError: (e: any) =>
      toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const received = requests.filter(
    (r) => r.to_user_id === user?.id && r.status === "aguardando_medico",
  );
  const sent = requests.filter(
    (r) =>
      r.from_user_id === user?.id &&
      ["aguardando_medico", "aguardando_admin"].includes(r.status),
  );
  const history = requests.filter(
    (r) =>
      (r.from_user_id === user?.id || r.to_user_id === user?.id) &&
      !["aguardando_medico", "aguardando_admin"].includes(r.status),
  );

  const renderRequest = (req: EnrichedSwapRequest, canRespond: boolean) => (
    <Card key={req.id} className="p-4 border-border/50">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
              req.type === "passagem" ? "bg-blue-500/10" : "bg-violet-500/10"
            }`}
          >
            {req.type === "passagem" ? (
              <ArrowRight className="h-4 w-4 text-blue-500" />
            ) : (
              <ArrowLeftRight className="h-4 w-4 text-violet-500" />
            )}
          </div>
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px] capitalize">
                {req.type}
              </Badge>
              <Badge variant={statusVariant(req.status)} className="text-[10px]">
                {statusLabel(req.status)}
              </Badge>
            </div>
            <div className="text-sm flex items-center gap-2 flex-wrap">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">{req.from_user_name}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">{req.to_user_name ?? "—"}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              {req.assignment_date && (
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  {format(
                    new Date(req.assignment_date + "T12:00:00"),
                    "dd/MM (EEE)",
                    { locale: ptBR },
                  )}
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
              <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap pt-1 border-t border-border/30 mt-1">
                <span className="font-medium text-foreground/80">Retorno:</span>
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  {format(
                    new Date(req.counter_assignment_date + "T12:00:00"),
                    "dd/MM (EEE)",
                    { locale: ptBR },
                  )}
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
            {req.notes && (
              <p className="text-xs italic bg-muted/40 rounded px-2 py-1">
                "{req.notes}"
              </p>
            )}
          </div>
        </div>
        {canRespond && (
          <div className="flex gap-2">
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
              onClick={() => {
                setRespondTarget({ req, accept: true });
                setRespondNotes("");
              }}
            >
              <Check className="h-3.5 w-3.5" /> Aceitar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 flex-1"
              onClick={() => {
                setRespondTarget({ req, accept: false });
                setRespondNotes("");
              }}
            >
              <X className="h-3.5 w-3.5" /> Recusar
            </Button>
          </div>
        )}
      </div>
    </Card>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4" />
          Trocas de Plantão
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <Tabs defaultValue="received">
            <TabsList>
              <TabsTrigger value="received" className="gap-2">
                <Inbox className="h-3.5 w-3.5" />
                Recebidas
                {received.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]">
                    {received.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="sent" className="gap-2">
                <Send className="h-3.5 w-3.5" />
                Enviadas
                {sent.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]">
                    {sent.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="history">Histórico</TabsTrigger>
            </TabsList>
            <TabsContent value="received" className="space-y-3 mt-4">
              {received.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhuma solicitação recebida.
                </p>
              ) : (
                received.map((r) => renderRequest(r, true))
              )}
            </TabsContent>
            <TabsContent value="sent" className="space-y-3 mt-4">
              {sent.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhuma solicitação enviada.
                </p>
              ) : (
                sent.map((r) => renderRequest(r, false))
              )}
            </TabsContent>
            <TabsContent value="history" className="space-y-3 mt-4">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Sem histórico.
                </p>
              ) : (
                history.map((r) => renderRequest(r, false))
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>

      <Dialog open={!!respondTarget} onOpenChange={(o) => !o && setRespondTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {respondTarget?.accept ? "Aceitar solicitação" : "Recusar solicitação"}
            </DialogTitle>
            <DialogDescription>
              {respondTarget?.accept
                ? "Ao aceitar, o admin será notificado para confirmar a troca."
                : "Adicione um motivo (opcional)."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={respondNotes}
            onChange={(e) => setRespondNotes(e.target.value)}
            placeholder="Observação (opcional)"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRespondTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => respond.mutate()}
              disabled={respond.isPending}
              className={respondTarget?.accept ? "bg-emerald-600 hover:bg-emerald-700" : ""}
              variant={respondTarget?.accept ? "default" : "destructive"}
            >
              {respond.isPending
                ? "Processando..."
                : respondTarget?.accept
                  ? "Aceitar"
                  : "Recusar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
