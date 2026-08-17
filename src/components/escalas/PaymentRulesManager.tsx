import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, DollarSign, Moon, CalendarHeart, Star, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  companyId: string;
}

const RULE_TYPES = [
  { value: "base", label: "Valor Base", icon: DollarSign, description: "Valor-hora padrão da grade" },
  { value: "noturno", label: "Adicional Noturno", icon: Moon, description: "Multiplicador para horário noturno (22h-06h)" },
  { value: "feriado", label: "Feriado", icon: CalendarHeart, description: "Multiplicador para dias de feriado" },
  { value: "especialidade", label: "Especialidade", icon: Star, description: "Valor diferenciado por especialidade" },
];

export function PaymentRulesManager({ companyId }: Props) {
  const { isMaster } = useAuth();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");

  // Form state
  const [formGradeId, setFormGradeId] = useState<string>("");
  const [formRuleType, setFormRuleType] = useState("base");
  const [formMultiplier, setFormMultiplier] = useState(1.0);
  const [formFixedValue, setFormFixedValue] = useState<string>("");
  const [formBaseRate, setFormBaseRate] = useState<string>("");
  const [formDescription, setFormDescription] = useState("");

  const { data: schedules = [] } = useQuery({
    queryKey: ["schedules", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("schedules").select("*").eq("company_id", companyId).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: grades = [] } = useQuery({
    queryKey: ["schedule-grades", selectedScheduleId],
    queryFn: async () => {
      if (!selectedScheduleId) return [];
      const { data, error } = await supabase.from("schedule_grades").select("*").eq("schedule_id", selectedScheduleId).order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedScheduleId,
  });

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["payment-rules", selectedScheduleId],
    queryFn: async () => {
      if (!selectedScheduleId) return [];
      const { data, error } = await supabase
        .from("schedule_payment_rules" as any)
        .select("*")
        .eq("schedule_id", selectedScheduleId)
        .order("created_at");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!selectedScheduleId,
  });

  const addRule = useMutation({
    mutationFn: async () => {
      const payload: any = {
        schedule_id: selectedScheduleId,
        grade_id: formGradeId || null,
        rule_type: formRuleType,
        multiplier: formMultiplier,
        fixed_value: formFixedValue ? Number(formFixedValue) : null,
        base_hourly_rate: formBaseRate ? Number(formBaseRate) : null,
        description: formDescription,
      };
      const { error } = await supabase.from("schedule_payment_rules" as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Regra adicionada" });
      queryClient.invalidateQueries({ queryKey: ["payment-rules"] });
      setAddOpen(false);
      resetForm();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("schedule_payment_rules" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Regra removida" });
      queryClient.invalidateQueries({ queryKey: ["payment-rules"] });
    },
  });

  const resetForm = () => {
    setFormGradeId("");
    setFormRuleType("base");
    setFormMultiplier(1.0);
    setFormFixedValue("");
    setFormBaseRate("");
    setFormDescription("");
  };

  const getRuleIcon = (type: string) => {
    const rt = RULE_TYPES.find((r) => r.value === type);
    return rt ? rt.icon : DollarSign;
  };

  const getRuleLabel = (type: string) => {
    const rt = RULE_TYPES.find((r) => r.value === type);
    return rt?.label || type;
  };

  const getGradeName = (gradeId: string | null) => {
    if (!gradeId) return "Todas as grades";
    const grade = grades.find((g: any) => g.id === gradeId);
    return grade?.name || "Grade";
  };

  if (!schedules.length) {
    return (
      <Card className="p-8 text-center bg-card/80 border-border/50">
        <DollarSign className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">Crie uma escala primeiro para configurar regras de repasse.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-card/80 backdrop-blur-sm border-border/50">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Select value={selectedScheduleId} onValueChange={setSelectedScheduleId}>
              <SelectTrigger className="w-[240px] bg-background">
                <SelectValue placeholder="Selecione uma escala" />
              </SelectTrigger>
              <SelectContent>
                {schedules.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isMaster && selectedScheduleId && (
            <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Nova Regra
            </Button>
          )}
        </div>
      </Card>

      {selectedScheduleId && (
        <div className="grid gap-3">
          {rules.length === 0 && !isLoading ? (
            <Card className="p-8 text-center bg-card/80 border-border/50">
              <DollarSign className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <h3 className="font-semibold text-foreground mb-1">Nenhuma regra configurada</h3>
              <p className="text-sm text-muted-foreground">Adicione regras de repasse para definir valores por turno, noturno e feriados.</p>
            </Card>
          ) : (
            rules.map((rule: any) => {
              const Icon = getRuleIcon(rule.rule_type);
              return (
                <Card key={rule.id} className="p-4 bg-card/80 border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="h-4.5 w-4.5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{rule.description || getRuleLabel(rule.rule_type)}</span>
                          <Badge variant="secondary" className="text-[10px]">{getRuleLabel(rule.rule_type)}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>Grade: {getGradeName(rule.grade_id)}</span>
                          {rule.base_hourly_rate && <span>Base: R$ {Number(rule.base_hourly_rate).toFixed(2)}/h</span>}
                          <span>Multiplicador: {Number(rule.multiplier).toFixed(2)}x</span>
                          {rule.fixed_value && <span>Fixo: R$ {Number(rule.fixed_value).toFixed(2)}</span>}
                        </div>
                      </div>
                    </div>
                    {isMaster && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteRule.mutate(rule.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Add Rule Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Regra de Repasse</DialogTitle>
            <DialogDescription>Configure valores e multiplicadores para plantões</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de Regra</Label>
              <Select value={formRuleType} onValueChange={setFormRuleType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_TYPES.map((rt) => (
                    <SelectItem key={rt.value} value={rt.value}>
                      <div>
                        <span>{rt.label}</span>
                        <span className="text-xs text-muted-foreground ml-2">— {rt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Grade (opcional)</Label>
              <Select value={formGradeId} onValueChange={setFormGradeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as grades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as grades</SelectItem>
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor-hora base (R$)</Label>
                <Input type="number" step="0.01" value={formBaseRate} onChange={(e) => setFormBaseRate(e.target.value)} placeholder="Ex: 120.00" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Multiplicador</Label>
                <Input type="number" step="0.1" value={formMultiplier} onChange={(e) => setFormMultiplier(Number(e.target.value))} min={0.1} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Valor fixo por hora (alternativo)</Label>
              <Input type="number" step="0.01" value={formFixedValue} onChange={(e) => setFormFixedValue(e.target.value)} placeholder="Opcional" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Descrição</Label>
              <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Ex: Noturno IGT 1.5x" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
              <Button onClick={() => addRule.mutate()} disabled={addRule.isPending}>
                {addRule.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar Regra
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
