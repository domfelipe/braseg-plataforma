import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { NO_BANK_BALANCE_NOTICE } from "@/lib/financialStatus";
import { fetchAllPaged } from "@/lib/financialData";
import { computeRealizedKpis } from "@/lib/financialKpis";

import { formatLocalDate } from "@/lib/utils";
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle, FileText, ArrowUpRight, ArrowDownRight, Truck, Calendar, Clock, FolderOpen, CalendarDays, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { AISummaryCard } from "@/components/dashboard/AISummaryCard";
import { ModuleWidget } from "@/components/dashboard/ModuleWidget";
import { useDashboardModules } from "@/hooks/useDashboardModules";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

type Period = "month" | "quarter" | "year";

const periodLabels: Record<Period, string> = {
  month: "Mês",
  quarter: "Trimestre",
  year: "Ano",
};

function getDateRange(period: Period, offset: number = 0, anchor?: Date) {
  const now = anchor ?? new Date();
  let start: Date, end: Date;

  if (period === "month") {
    start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  } else if (period === "quarter") {
    const currentQ = Math.floor(now.getMonth() / 3);
    const q = currentQ + offset;
    const year = now.getFullYear() + Math.floor(q / 4);
    const qMod = ((q % 4) + 4) % 4;
    start = new Date(year, qMod * 3, 1);
    end = new Date(year, qMod * 3 + 3, 0);
  } else {
    start = new Date(now.getFullYear() + offset, 0, 1);
    end = new Date(now.getFullYear() + offset, 12, 0);
  }

  return {
    start: formatLocalDate(start),
    end: formatLocalDate(end),
  };
}

function getChartBuckets(period: Period, anchor?: Date) {
  const now = anchor ?? new Date();
  const buckets: { name: string; start: string; end: string }[] = [];

  if (period === "month") {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        name: d.toLocaleDateString("pt-BR", { month: "short" }),
        start: formatLocalDate(d),
        end: formatLocalDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
      });
    }
  } else if (period === "quarter") {
    for (let i = 3; i >= 0; i--) {
      const currentQ = Math.floor(now.getMonth() / 3);
      const q = currentQ - i;
      const year = now.getFullYear() + Math.floor(q / 4);
      const qMod = ((q % 4) + 4) % 4;
      const s = new Date(year, qMod * 3, 1);
      const e = new Date(year, qMod * 3 + 3, 0);
      buckets.push({
        name: `T${qMod + 1}/${year.toString().slice(2)}`,
        start: formatLocalDate(s),
        end: formatLocalDate(e),
      });
    }
  } else {
    for (let i = 2; i >= 0; i--) {
      const y = now.getFullYear() - i;
      buckets.push({
        name: String(y),
        start: formatLocalDate(new Date(y, 0, 1)),
        end: formatLocalDate(new Date(y, 12, 0)),
      });
    }
  }

  return buckets;
}

// Generate selectable months: from 23 months ago up to 11 months from now
function getMonthOptions() {
  const now = new Date();
  const opts: { value: string; label: string }[] = [];
  for (let i = -23; i <= 0; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return opts.reverse(); // newest first
}

function parseMonthKey(key: string): Date {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

interface KPIs {
  receitas: number;
  despesas: number;
  saldo: number;
  vencendo7dias: number;
  prevReceitas: number;
  prevDespesas: number;
  prevSaldo: number;
  prevVencendo: number;
  receitasPrev: number; // previsão período atual (pendente+pago)
  despesasPrev: number;
  saldoPrev: number;
}

interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: string;
  due_date: string;
  status: string;
  source?: "financial" | "professional";
}

export default function Dashboard() {
  const { selectedCompany, isAcudir, userModules } = useCompany();
  const [period, setPeriod] = useState<Period>("month");
  const [selectedMonth, setSelectedMonth] = useState<string>("current"); // "current" or "YYYY-MM"
  const [kpis, setKpis] = useState<KPIs>({ receitas: 0, despesas: 0, saldo: 0, vencendo7dias: 0, prevReceitas: 0, prevDespesas: 0, prevSaldo: 0, prevVencendo: 0, receitasPrev: 0, despesasPrev: 0, saldoPrev: 0 });
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [pendingNFs, setPendingNFs] = useState(0);
  const navigate = useNavigate();
  const moduleStats = useDashboardModules(selectedCompany?.id || null);

  const has = (m: string) => userModules.includes(m);

  // When a specific month is selected, period is forced to "month" anchored on that month
  const monthOptions = useMemo(() => getMonthOptions(), []);
  const isCustomMonth = selectedMonth !== "current";
  const effectivePeriod: Period = isCustomMonth ? "month" : period;
  const anchorDate: Date | undefined = isCustomMonth ? parseMonthKey(selectedMonth) : undefined;

  useEffect(() => {
    if (!selectedCompany) return;

    const fetchData = async () => {
      const now = new Date();
      const today = formatLocalDate(now);
      const in7days = formatLocalDate(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));

      const current = getDateRange(effectivePeriod, 0, anchorDate);
      const prev = getDateRange(effectivePeriod, -1, anchorDate);

      // KPIs: current + previous period
      // NOTE: professional_payments are already mirrored into financial_transactions
      // via the sync_payment_to_financial trigger, so we read ONLY financial_transactions
      // to stay consistent with the Financeiro module and avoid double counting.
      // A janela cobre tanto vencimento (previsão/vencendo) quanto data de
      // pagamento (realizado), para nunca perder linhas pagas fora do vencimento.
      // Paginação determinística: `.limit()` não contorna o cap do PostgREST e
      // truncava silenciosamente o conjunto (KPI parcial).
      const allTxForKpis = await fetchAllPaged<{
        id: string;
        type: string;
        amount: number;
        status: string;
        due_date: string;
        payment_date: string | null;
      }>(() =>
        supabase
          .from("financial_transactions")
          .select("id, type, amount, status, due_date, payment_date")
          .eq("company_id", selectedCompany.id)
          .neq("status", "cancelado")
          .or(
            `and(due_date.gte.${prev.start},due_date.lte.${current.end}),and(payment_date.gte.${prev.start},payment_date.lte.${current.end})`
          )
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
      );

      if (allTxForKpis.length > 0) {
        const inRange = (d: string | null, start: string, end: string) =>
          !!d && d >= start && d <= end;
        // Realizado = MESMO helper do módulo Financeiro (src/lib/financialKpis.ts):
        // status pago + payment_date no período, sem fallback de vencimento.
        const cur = computeRealizedKpis(allTxForKpis, { from: current.start, to: current.end });
        const prevRealized = computeRealizedKpis(allTxForKpis, { from: prev.start, to: prev.end });
        // Previsão / vencendo = por vencimento (a query já exclui cancelado).
        const curTx = allTxForKpis.filter((t) => inRange(t.due_date, current.start, current.end));
        const prevTx = allTxForKpis.filter((t) => inRange(t.due_date, prev.start, prev.end));

        const receitas = cur.receitas;
        const despesas = cur.despesas;
        const vencendo = curTx.filter((t) => t.status === "pendente" && t.due_date >= today && t.due_date <= in7days).length;

        const receitasPrev = curTx.filter((t) => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0);
        const despesasPrev = curTx.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0);

        const prevReceitas = prevRealized.receitas;
        const prevDespesas = prevRealized.despesas;
        const prevVencendo = prevTx.filter((t) => t.status === "pendente").length;


        setKpis({
          receitas, despesas, saldo: receitas - despesas, vencendo7dias: vencendo,
          prevReceitas, prevDespesas, prevSaldo: prevReceitas - prevDespesas, prevVencendo,
          receitasPrev, despesasPrev, saldoPrev: receitasPrev - despesasPrev,
        });
      } else {
        setKpis({ receitas: 0, despesas: 0, saldo: 0, vencendo7dias: 0, prevReceitas: 0, prevDespesas: 0, prevSaldo: 0, prevVencendo: 0, receitasPrev: 0, despesasPrev: 0, saldoPrev: 0 });
      }



      // Recent transactions (always latest 5, exclude cancelado) + professional payments
      const [{ data: recent }, { data: recentProf }] = await Promise.all([
        supabase
          .from("financial_transactions")
          .select("id, description, amount, type, due_date, status, created_at")
          .eq("company_id", selectedCompany.id)
          .neq("status", "cancelado")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("professional_payments")
          .select("id, doctor_name, amount, status, payment_date, created_at")
          .eq("company_id", selectedCompany.id)
          .neq("status", "erro")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const financialRecent: Transaction[] = (recent || []).map((t: any) => ({
        ...t,
        source: "financial" as const,
      }));

      const profRecent: Transaction[] = (recentProf || [])
        .filter((p: any) => Number(p.amount) > 0)
        .map((p: any) => ({
          id: p.id,
          description: `Pagamento - ${p.doctor_name}`,
          amount: p.amount,
          type: "despesa",
          due_date: p.payment_date || p.created_at?.split("T")[0] || "",
          status: p.status === "pago" ? "pago" : p.status === "aguardando_pagamento" ? "pendente" : p.status,
          source: "professional" as const,
          created_at: p.created_at,
        }));

      const merged = [...financialRecent, ...profRecent]
        .sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || ""))
        .slice(0, 5);

      setRecentTransactions(merged);

      // Chart data
      const buckets = getChartBuckets(effectivePeriod, anchorDate);

      const allTxForChart = await fetchAllPaged<{
        id: string;
        type: string;
        amount: number;
        due_date: string;
      }>(() =>
        supabase
          .from("financial_transactions")
          .select("id, type, amount, due_date")
          .eq("company_id", selectedCompany.id)
          .neq("status", "cancelado")
          .gte("due_date", buckets[0].start)
          .lte("due_date", buckets[buckets.length - 1].end)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
      );



      const chart = buckets.map((b) => {
        const bTx = allTxForChart.filter((t) => t.due_date >= b.start && t.due_date <= b.end);
        return {
          name: b.name,
          Receitas: bTx.filter((t) => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0),
          Despesas: bTx.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0),
        };
      });
      setChartData(chart);

      if (isAcudir) {
        const { count } = await supabase
          .from("professional_payments")
          .select("*", { count: "exact", head: true })
          .eq("company_id", selectedCompany.id)
          .eq("status", "aguardando_pagamento");
        setPendingNFs(count || 0);
      }
    };

    fetchData();
  }, [selectedCompany, isAcudir, effectivePeriod, selectedMonth]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const calcVariation = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / Math.abs(previous)) * 100;
  };

  const variationLabel = effectivePeriod === "month" ? "vs mês ant." : effectivePeriod === "quarter" ? "vs trim. ant." : "vs ano ant.";

  const statusColors: Record<string, string> = {
    pendente: "bg-warning/15 text-warning-foreground border-warning/20",
    pago: "bg-success/15 text-success border-success/20",
    vencido: "bg-destructive/15 text-destructive border-destructive/20",
    cancelado: "bg-muted text-muted-foreground",
  };

  const periodSuffix = isCustomMonth
    ? `de ${monthOptions.find((o) => o.value === selectedMonth)?.label || ""}`
    : effectivePeriod === "month" ? "do mês" : effectivePeriod === "quarter" ? "do trimestre" : "do ano";

  const kpiCards = [
    {
      label: `Receitas recebidas ${periodSuffix}`,
      value: formatCurrency(kpis.receitas),
      icon: TrendingUp,
      gradient: "gradient-success",
      variation: calcVariation(kpis.receitas, kpis.prevReceitas),
      positiveIsGood: true,
      forecast: formatCurrency(kpis.receitasPrev),
    },
    {
      label: `Despesas pagas ${periodSuffix}`,
      value: formatCurrency(kpis.despesas),
      icon: TrendingDown,
      gradient: "gradient-destructive",
      variation: calcVariation(kpis.despesas, kpis.prevDespesas),
      positiveIsGood: false,
      forecast: formatCurrency(kpis.despesasPrev),
    },
    {
      label: "Resultado do período (caixa, por data de pagamento)",

      value: formatCurrency(kpis.saldo),
      icon: DollarSign,
      gradient: "gradient-primary",
      valueColor: kpis.saldo >= 0 ? "text-success" : "text-destructive",
      variation: calcVariation(kpis.saldo, kpis.prevSaldo),
      positiveIsGood: true,
      forecast: formatCurrency(kpis.saldoPrev),
    },
    {
      label: "Vencendo em 7 dias",
      value: String(kpis.vencendo7dias),
      icon: AlertTriangle,
      gradient: "gradient-warning",
      variation: calcVariation(kpis.vencendo7dias, kpis.prevVencendo),
      positiveIsGood: false,
    },
  ];

  return (
    <div className="space-y-8 max-w-7xl">
      {/* Header with period filter */}
      <motion.div initial="hidden" animate="visible" custom={0} variants={fadeUp} className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight gradient-text">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral financeira da empresa</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border/50">
            {(["month", "quarter", "year"] as Period[]).map((p) => {
              const active = !isCustomMonth && period === p;
              return (
                <Button
                  key={p}
                  size="sm"
                  variant="ghost"
                  onClick={() => { setSelectedMonth("current"); setPeriod(p); }}
                  className={`h-8 px-4 rounded-lg text-xs font-medium transition-all ${
                    active
                      ? "gradient-primary text-white shadow-md hover:opacity-90 hover:text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {periodLabels[p]}
                </Button>
              );
            })}
          </div>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger
              className={`h-10 w-[200px] text-xs font-medium rounded-xl ${
                isCustomMonth ? "border-primary/50 bg-primary/5" : ""
              }`}
            >
              <Calendar className="h-3.5 w-3.5 mr-1.5 opacity-60" />
              <SelectValue placeholder="Filtrar por mês" />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value="current">Período atual</SelectItem>
              {monthOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* AI Daily Briefing */}
      {selectedCompany && <AISummaryCard companyId={selectedCompany.id} />}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpiCards.map((kpi, index) => (
          <motion.div key={kpi.label} initial="hidden" animate="visible" custom={index + 1} variants={fadeUp}>
            <Card className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 h-full">
              <CardContent className="p-5">
                <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-foreground/[0.03]" />
                <div className="absolute -right-2 -bottom-8 h-20 w-20 rounded-full bg-foreground/[0.02]" />
                <div className="flex items-start justify-between relative z-10">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
                    <p className={`text-xl sm:text-2xl font-bold tabular-nums tracking-tight ${kpi.valueColor || "text-foreground"}`}>
                      {kpi.value}
                    </p>
                    <div className="flex items-center gap-1">
                      {kpi.variation !== 0 ? (
                        <>
                          {(kpi.positiveIsGood ? kpi.variation > 0 : kpi.variation < 0) ? (
                            <ArrowUpRight className="h-3 w-3 text-success" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3 text-destructive" />
                          )}
                          <span className={`text-[11px] font-semibold tabular-nums ${
                            (kpi.positiveIsGood ? kpi.variation > 0 : kpi.variation < 0)
                              ? "text-success" : "text-destructive"
                          }`}>
                            {kpi.variation > 0 ? "+" : ""}{kpi.variation.toFixed(1)}%
                          </span>
                          <span className="text-[10px] text-muted-foreground">{variationLabel}</span>
                        </>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Sem variação</span>
                      )}
                    </div>
                    {kpi.forecast && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Previsão por vencimento:{" "}
                        <span className="font-semibold tabular-nums text-foreground/80">{kpi.forecast}</span>
                      </p>
                    )}
                  </div>
                  <div className={`h-11 w-11 rounded-xl ${kpi.gradient} flex items-center justify-center shrink-0 shadow-lg`}>
                    <kpi.icon className="h-5 w-5 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Realizado = status pago com <strong>data de pagamento</strong> no período. Previsão ={" "}
        <strong>por vencimento</strong>. {NO_BANK_BALANCE_NOTICE}
      </p>

      {/* Acudir: Pending NFs */}
      {isAcudir && (
        <motion.div initial="hidden" animate="visible" custom={5} variants={fadeUp}>
          <Card
            className="relative overflow-hidden border-0 cursor-pointer hover:shadow-xl transition-all duration-300 group"
            onClick={() => navigate("/pagamentos")}
          >
            <div className="absolute inset-0 gradient-accent opacity-90" />
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
            <div className="absolute -left-5 -bottom-5 h-24 w-24 rounded-full bg-white/5" />
            <CardContent className="flex items-center justify-between p-6 relative z-10">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <FileText className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-base font-semibold text-white">Notas Fiscais pendentes</p>
                  <p className="text-sm text-white/70">Aguardando pagamento</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-4xl font-bold text-white tabular-nums">{pendingNFs}</span>
                <ArrowUpRight className="h-5 w-5 text-white/60 group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Adaptive module widgets */}
      {(() => {
        const widgets: JSX.Element[] = [];
        const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

        if (has("payments")) {
          widgets.push(
            <ModuleWidget
              key="payments"
              title="Pagamentos"
              subtitle="Notas fiscais e profissionais"
              icon={FileText}
              gradient="gradient-warning"
              navigateTo="/pagamentos"
              delay={0.05}
              badge={moduleStats.payments.pending > 0 ? { label: `${moduleStats.payments.pending} pend.`, tone: "warning" } : undefined}
              stats={[
                { label: "A pagar", value: fmt(moduleStats.payments.pendingTotal), tone: moduleStats.payments.pendingTotal > 0 ? "warning" : "default" },
                { label: "Pagos no mês", value: fmt(moduleStats.payments.paidMonthTotal), tone: "success" },
              ]}
            />
          );
        }
        if (has("schedules")) {
          widgets.push(
            <ModuleWidget key="schedules" title="Escalas" subtitle="Plantões e turnos" icon={Calendar} gradient="gradient-primary" navigateTo="/escalas" delay={0.1}
              badge={moduleStats.schedules.openSlots > 0 ? { label: `${moduleStats.schedules.openSlots} vagas`, tone: "destructive" } : undefined}
              stats={[
                { label: "Plantões hoje", value: moduleStats.schedules.todayShifts },
                { label: "Próx. 7 dias", value: moduleStats.schedules.weekShifts },
              ]} />
          );
        }
        if (has("timesheet")) {
          widgets.push(
            <ModuleWidget key="clock" title="Ponto" subtitle="Registros do dia" icon={Clock} gradient="gradient-success" navigateTo="/ponto" delay={0.15}
              stats={[
                { label: "Registros hoje", value: moduleStats.clock.todayEntries },
                { label: "Profissionais", value: moduleStats.clock.activeUsers },
              ]} />
          );
        }
        if (has("fleet")) {
          widgets.push(
            <ModuleWidget key="fleet" title="Frota" subtitle="Veículos e manutenções" icon={Truck} gradient="gradient-accent" navigateTo="/frotas" delay={0.2}
              badge={moduleStats.fleet.remindersDue30 > 0 ? { label: `${moduleStats.fleet.remindersDue30} venc.`, tone: "warning" } : undefined}
              stats={[
                { label: "Veículos ativos", value: moduleStats.fleet.vehicles },
                { label: "Manut. mês", value: fmt(moduleStats.fleet.maintenanceMonth) },
              ]} />
          );
        }
        if (has("documents")) {
          widgets.push(
            <ModuleWidget key="documents" title="Documentos" subtitle="Funcionários e arquivos" icon={FolderOpen} gradient="gradient-primary" navigateTo="/documentos" delay={0.25}
              stats={[
                { label: "Funcionários", value: moduleStats.documents.activeEmployees },
                { label: "Docs no mês", value: moduleStats.documents.pendingMonth },
              ]} />
          );
        }
        if (has("events")) {
          widgets.push(
            <ModuleWidget key="events" title="Eventos" subtitle="Agenda e compromissos" icon={CalendarDays} gradient="gradient-destructive" navigateTo="/eventos" delay={0.3}
              badge={moduleStats.events.today > 0 ? { label: `${moduleStats.events.today} hoje`, tone: "default" } : undefined}
              stats={[
                { label: "Hoje", value: moduleStats.events.today },
                { label: "Próx. 7 dias", value: moduleStats.events.upcoming7 },
              ]} />
          );
        }
        if (widgets.length === 0) return null;
        return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">{widgets}</div>;
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Chart */}
        <motion.div className="lg:col-span-2" initial="hidden" animate="visible" custom={6} variants={fadeUp}>
          <Card className="border-0 shadow-lg h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Receitas vs Despesas — competência por vencimento</CardTitle>
              <p className="text-xs text-muted-foreground">
                Competência por vencimento (não é fluxo de caixa) ·{" "}
                {isCustomMonth
                  ? `6 meses até ${monthOptions.find((o) => o.value === selectedMonth)?.label || ""}`
                  : effectivePeriod === "month" ? "Últimos 6 meses" : effectivePeriod === "quarter" ? "Últimos 4 trimestres" : "Últimos 3 anos"}
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-48 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barGap={4}>
                    <defs>
                      <linearGradient id="gradReceitas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(152, 60%, 38%)" stopOpacity={1} />
                        <stop offset="100%" stopColor="hsl(160, 55%, 48%)" stopOpacity={0.8} />
                      </linearGradient>
                      <linearGradient id="gradDespesas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(0, 72%, 51%)" stopOpacity={1} />
                        <stop offset="100%" stopColor="hsl(15, 80%, 55%)" stopOpacity={0.8} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", fontSize: "12px", background: "hsl(var(--card))" }}
                    />
                    <Bar dataKey="Receitas" fill="url(#gradReceitas)" radius={[6, 6, 0, 0]} barSize={28} />
                    <Bar dataKey="Despesas" fill="url(#gradDespesas)" radius={[6, 6, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-6 mt-3 px-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="h-3 w-3 rounded-full gradient-success" />
                  Receitas
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="h-3 w-3 rounded-full gradient-destructive" />
                  Despesas
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Transactions */}
        <motion.div initial="hidden" animate="visible" custom={7} variants={fadeUp}>
          <Card className="border-0 shadow-lg h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Últimas Transações</CardTitle>
            </CardHeader>
            <CardContent>
              {recentTransactions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma transação encontrada.</p>
              ) : (
                <div className="space-y-1">
                  {recentTransactions.map((tx, i) => (
                    <motion.div
                      key={tx.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.7 + i * 0.08, duration: 0.35 }}
                      className="flex items-center justify-between py-3 border-b border-border/50 last:border-0 group/tx hover:bg-muted/30 rounded-lg px-2 -mx-2 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                          tx.type === "receita" ? "gradient-success" : "gradient-destructive"
                        } shadow-sm`}>
                          {tx.type === "receita" ? (
                            <ArrowUpRight className="h-4 w-4 text-white" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4 text-white" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{tx.description}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(tx.due_date + "T00:00:00").toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 ml-3">
                        <span className={`text-sm font-semibold tabular-nums ${tx.type === "receita" ? "text-success" : "text-destructive"}`}>
                          {tx.type === "receita" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
                        </span>
                        <Badge variant="outline" className={`text-[10px] py-0 h-4 ${statusColors[tx.status] || ""}`}>
                          {tx.status}
                        </Badge>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}