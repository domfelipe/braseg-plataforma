import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, RefreshCw, AlertTriangle, AlertCircle, Info, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Alert {
  severity: "info" | "warning" | "critical";
  title: string;
  action: string;
}

interface Summary {
  summary_text: string;
  highlights: string[];
  alerts: Alert[];
  generated_at: string;
  cached?: boolean;
}

const severityIcon = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const severityClass = {
  critical: "border-destructive/30 bg-destructive/5 text-destructive",
  warning: "border-warning/30 bg-warning/5 text-warning-foreground",
  info: "border-primary/30 bg-primary/5 text-primary",
};

export function AISummaryCard({ companyId }: { companyId: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSummary = async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("dashboard-ai-summary", {
        body: { company_id: companyId, force },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      setData(result);
    } catch (e: any) {
      toast({ title: "Erro ao gerar resumo", description: e.message || "Tente novamente", variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (companyId) fetchSummary(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <Card className="relative overflow-hidden border-0 shadow-xl">
        <div className="absolute inset-0 gradient-primary opacity-95" />
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -left-10 -bottom-10 h-48 w-48 rounded-full bg-white/5 blur-2xl" />
        <CardContent className="relative z-10 p-6 sm:p-7 text-white">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-white/70 font-semibold">Briefing executivo</p>
                <h2 className="text-lg sm:text-xl font-bold">Resumo do dia</h2>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => fetchSummary(true)}
              disabled={refreshing || loading}
              className="text-white hover:bg-white/15 hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full bg-white/15" />
              <Skeleton className="h-4 w-5/6 bg-white/15" />
              <Skeleton className="h-4 w-3/4 bg-white/15" />
            </div>
          ) : data ? (
            <>
              <p className="text-sm sm:text-base leading-relaxed text-white/95 mb-5 whitespace-pre-line">
                {data.summary_text}
              </p>

              {data.highlights?.length > 0 && (
                <div className="mb-5">
                  <p className="text-[11px] uppercase tracking-wider text-white/60 font-semibold mb-2">Destaques</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {data.highlights.map((h, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-white/90 bg-white/10 rounded-lg px-3 py-2 backdrop-blur-sm">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-white/80" />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.alerts?.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-white/60 font-semibold mb-2">Alertas e ações</p>
                  <div className="space-y-2">
                    {data.alerts.map((a, i) => {
                      const Icon = severityIcon[a.severity] || Info;
                      return (
                        <div key={i} className={`flex items-start gap-3 rounded-lg border bg-white/95 px-3 py-2.5 ${severityClass[a.severity]}`}>
                          <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold leading-tight">{a.title}</p>
                            <p className="text-xs opacity-80 mt-0.5">{a.action}</p>
                          </div>
                          <Badge variant="outline" className="text-[10px] uppercase border-current bg-transparent">
                            {a.severity === "critical" ? "Crítico" : a.severity === "warning" ? "Atenção" : "Info"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-white/50 mt-4">
                Gerado em {new Date(data.generated_at).toLocaleString("pt-BR")}
                {data.cached ? " · cache" : ""}
              </p>
            </>
          ) : (
            <p className="text-sm text-white/80">Nenhum resumo disponível.</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
