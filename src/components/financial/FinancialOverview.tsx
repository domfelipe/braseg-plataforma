import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, Download } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from "recharts";
import { toast } from "sonner";
import { FinancialFiltersState } from "./FinancialFilters";
import FinancialOpsAlerts from "./FinancialOpsAlerts";
import {
  isPago,
  countsForResult,
  isPendente,
  inDateRange,
  sumRealizedCash,
  NO_BANK_BALANCE_NOTICE,
  LABEL_PERIOD_RESULT_CASH,
  LABEL_PERIOD_RESULT_ACCRUAL,
  LABEL_PROJECTED_VARIATION,
  countPaidWithoutPaymentDate,
} from "@/lib/financialStatus";
import { fetchAllPaged } from "@/lib/financialData";
import { computeRealizedKpis, computeForecastKpis } from "@/lib/financialKpis";



interface Props {
  companyId: string;
  filters: FinancialFiltersState;
}

interface Tx {
  type: string;
  amount: number;
  status: string;
  due_date: string;
  payment_date: string | null;
  created_at: string | null;
  category_id: string | null;
  city: string | null;
}

interface Category {
  id: string;
  name: string;
}

const COLORS = [
  "hsl(212, 60%, 45%)", "hsl(142, 71%, 35%)", "hsl(0, 72%, 51%)",
  "hsl(48, 96%, 53%)", "hsl(280, 60%, 50%)", "hsl(180, 60%, 40%)",
  "hsl(30, 80%, 50%)", "hsl(320, 60%, 50%)", "hsl(160, 50%, 40%)",
  "hsl(60, 70%, 45%)",
];

type CategoryPeriod = "all" | "current_month" | "last_3_months" | "ytd";

export default function FinancialOverview({ companyId, filters }: Props) {
  const [allTx, setAllTx] = useState<Tx[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryPeriod, setCategoryPeriod] = useState<CategoryPeriod>("current_month");
  const [reloadKey, setReloadKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Revalidar KPIs/gráficos quando qualquer lançamento, pagamento ou categoria mudar.
  useEffect(() => {
    const bump = () => setReloadKey((k) => k + 1);
    const channel = supabase
      .channel(`financial-overview-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_transactions" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "professional_payments" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_categories" }, bump)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);



  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  useEffect(() => {
    const fetch = async () => {
      // Compute a safe fetch window on the server so we never hit the 1000-row
      // PostgREST cap and lose recent transactions from the KPI totals.
      // We fetch at least the last 12 months, or the user's chosen range if it's wider,
      // and expand to cover the flow/bar charts (last 6 months).
      const now = new Date();
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const defaultFrom = fmt(new Date(now.getFullYear() - 1, now.getMonth(), 1));
      const defaultTo = fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      const fetchFrom = filters.dateFrom && filters.dateFrom < defaultFrom ? filters.dateFrom : defaultFrom;
      const fetchTo = filters.dateTo && filters.dateTo > defaultTo ? filters.dateTo : defaultTo;

      const dateBase = filters.dateBase ?? "payment";

      // Paginação determinística: `.limit()` não contorna o cap do PostgREST e
      // truncava silenciosamente o conjunto (totais parciais).
      const buildTx = () => {
        let q = supabase
          .from("financial_transactions")
          .select("id, type, amount, status, due_date, payment_date, created_at, category_id, city")
          .eq("company_id", companyId);

        if (dateBase === "payment") {
          // Cover both rows paid in the window and rows due in the window (charts still need due_date).
          q = q.or(
            `and(payment_date.gte.${fetchFrom},payment_date.lte.${fetchTo}),and(due_date.gte.${fetchFrom},due_date.lte.${fetchTo})`
          );
        } else if (dateBase === "created") {
          q = q.or(
            `and(created_at.gte.${fetchFrom},created_at.lte.${fetchTo}T23:59:59),and(due_date.gte.${fetchFrom},due_date.lte.${fetchTo})`
          );
        } else {
          q = q.gte("due_date", fetchFrom).lte("due_date", fetchTo);
        }

        return q.order("created_at", { ascending: true }).order("id", { ascending: true });
      };

      try {
        setLoadError(null);
        const [tx, cats] = await Promise.all([
          fetchAllPaged<Tx>(buildTx),
          fetchAllPaged<Category>(() =>
            supabase
              .from("financial_categories")
              .select("id, name")
              .eq("company_id", companyId)
              .order("id", { ascending: true })
          ),
        ]);
        setAllTx(tx);
        setCategories(cats);
      } catch (e) {
        console.error("Erro ao carregar dados financeiros:", e);
        setAllTx([]);
        setCategories([]);
        setLoadError(e instanceof Error ? e.message : "Falha ao carregar lançamentos");
      }
    };
    fetch();
  }, [companyId, filters.dateFrom, filters.dateTo, filters.dateBase, reloadKey]);

  const catMap = useMemo(() => {
    const m: Record<string, string> = {};
    categories.forEach((c) => (m[c.id] = c.name));
    return m;
  }, [categories]);

  // Reference date under current date base ("due" -> due_date, "payment" -> payment_date, "created" -> created_at)
  const refOf = (t: Tx): string | null => {
    const base = filters.dateBase ?? "payment";
    if (base === "payment") return t.payment_date || null;
    if (base === "created") return t.created_at ? t.created_at.slice(0, 10) : null;
    return t.due_date;
  };

  // Apply global filters (mantém todos os status — usado só na distribuição por status)
  const filteredAllStatus = useMemo(() => {
    return allTx.filter((t) => {
      const ref = refOf(t);
      if (filters.dateFrom || filters.dateTo) {
        if (!ref) return false;
        if (filters.dateFrom && ref < filters.dateFrom) return false;
        if (filters.dateTo && ref > filters.dateTo) return false;
      }
      if (filters.city !== "all" && t.city !== filters.city) return false;
      if (filters.categoryId !== "all" && t.category_id !== filters.categoryId) return false;
      return true;
    });
  }, [allTx, filters]);

  // Escopo financeiro: canceladas e status não financeiros nunca entram em
  // KPIs, totais ou gráficos de valor.
  const filtered = useMemo(
    () => filteredAllStatus.filter((t) => countsForResult(t.status)),
    [filteredAllStatus]
  );

  const today = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  }, []);

  // Escopo sem recorte de data: só cidade/categoria. Serve para calcular
  // realizado (por pagamento) e previsão (por vencimento) sem que um recorte
  // por uma única base esconda linhas da outra. Canceladas excluídas.
  const scope = useMemo(() => {
    return allTx.filter((t) => {
      if (!countsForResult(t.status)) return false;
      if (filters.city !== "all" && t.city !== filters.city) return false;
      if (filters.categoryId !== "all" && t.category_id !== filters.categoryId) return false;
      return true;
    });
  }, [allTx, filters.city, filters.categoryId]);


  const isPaymentBase = (filters.dateBase ?? "payment") === "payment";

  // KPIs — MESMA fórmula do Dashboard (src/lib/financialKpis.ts).
  // - base "Pagamento" (padrão): realizado = status pago + payment_date no período (caixa).
  // - base "Vencimento": realizado = status pago + due_date no período (competência).
  // Previsão sempre por vencimento, excluindo cancelados, para que pendentes
  // sem data de pagamento nunca desapareçam da visão operacional.
  const kpis = useMemo(() => {
    const from = filters.dateFrom;
    const to = filters.dateTo;
    // `scope` já aplicou cidade/categoria explícitas e excluiu cancelados.
    const realized = computeRealizedKpis(scope, {
      from,
      to,
      base: isPaymentBase ? "payment" : "due",
    });
    // Projeção: SOMENTE pendentes com vencimento no período. Nunca soma ao caixa.
    const forecast = computeForecastKpis(scope, { from, to });

    const vencidas = scope.filter(
      (t) => isPendente(t.status) && inDateRange(t.due_date || null, from, to) && t.due_date < today
    ).length;

    return {
      receitas: realized.receitas,
      despesas: realized.despesas,
      saldo: realized.saldo,
      vencidas,
      receitasPrev: forecast.receitas,
      despesasPrev: forecast.despesas,
      saldoPrev: forecast.saldo,
    };
  }, [scope, today, filters.dateFrom, filters.dateTo, isPaymentBase]);

  // Alerta de revisão: pagos sem data de pagamento nunca entram no caixa.
  const paidWithoutPaymentDate = useMemo(
    () => countPaidWithoutPaymentDate(scope),
    [scope]
  );


  // Flow chart - últimos 6 meses.
  // Séries separadas: realizado = pagos COM payment_date, pela data de pagamento;
  // projeção = pendentes, pela data de vencimento. Nunca somadas entre si.
  const flowData = useMemo(() => {
    const now = new Date();
    const months: any[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const end = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
      const name = d.toLocaleDateString("pt-BR", { month: "short" });

      const realized = sumRealizedCash(scope, start, end);
      let pendReceitas = 0, pendDespesas = 0;
      scope.forEach((t) => {
        if (!isPendente(t.status)) return;
        if (!inDateRange(t.due_date || null, start, end)) return;
        if (t.type === "receita") pendReceitas += Number(t.amount) || 0;
        else pendDespesas += Number(t.amount) || 0;
      });

      months.push({
        name,
        Receitas: realized.receitas,
        Despesas: realized.despesas,
        "Resultado (caixa)": realized.saldo,
        "Projeção (pendentes)": pendReceitas - pendDespesas,
      });
    }
    return months;
  }, [scope]);



  // Despesas por Categoria — with local period filter
  const categoryPeriodRange = useMemo(() => {
    const n = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (categoryPeriod === "current_month") {
      const start = new Date(n.getFullYear(), n.getMonth(), 1);
      const end = new Date(n.getFullYear(), n.getMonth() + 1, 0);
      return { from: fmt(start), to: fmt(end) };
    }
    if (categoryPeriod === "last_3_months") {
      const start = new Date(n.getFullYear(), n.getMonth() - 2, 1);
      const end = new Date(n.getFullYear(), n.getMonth() + 1, 0);
      return { from: fmt(start), to: fmt(end) };
    }
    if (categoryPeriod === "ytd") {
      const start = new Date(n.getFullYear(), 0, 1);
      return { from: fmt(start), to: fmt(n) };
    }
    return null;
  }, [categoryPeriod]);

  const { categoryChartData, categoryFullList, categoryTotal } = useMemo(() => {
    const totals: Record<string, number> = {};
    filtered
      .filter((t) => {
        if (t.type !== "despesa") return false;
        if (categoryPeriodRange) {
          const r = refOf(t);
          if (!r) return false;
          if (r < categoryPeriodRange.from) return false;
          if (r > categoryPeriodRange.to) return false;
        }
        return true;
      })
      .forEach((t) => {
        const name = t.category_id ? (catMap[t.category_id] || "Sem categoria") : "Sem categoria";
        totals[name] = (totals[name] || 0) + Number(t.amount);
      });
    const sorted = Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const total = sorted.reduce((s, e) => s + e.value, 0);
    let chart = sorted;
    if (sorted.length > 5) {
      const top5 = sorted.slice(0, 5);
      const othersTotal = sorted.slice(5).reduce((s, e) => s + e.value, 0);
      if (othersTotal > 0) top5.push({ name: "Outros", value: othersTotal });
      chart = top5;
    }
    return { categoryChartData: chart, categoryFullList: sorted, categoryTotal: total };
  }, [filtered, catMap, categoryPeriodRange]);

  const categoryPeriodLabel = useMemo(() => {
    switch (categoryPeriod) {
      case "current_month": return "mês atual";
      case "last_3_months": return "últimos 3 meses";
      case "ytd": return "ano atual";
      default: return "todo o período";
    }
  }, [categoryPeriod]);

  const exportCategoriesCSV = () => {
    if (categoryFullList.length === 0) {
      toast.error("Sem dados para exportar");
      return;
    }
    const header = "Categoria;Valor;Percentual\n";
    const body = categoryFullList
      .map((r) => {
        const pct = categoryTotal > 0 ? ((r.value / categoryTotal) * 100).toFixed(2) : "0";
        return `${r.name};${r.value.toFixed(2).replace(".", ",")};${pct}%`;
      })
      .join("\n");
    const totalLine = `\nTOTAL;${categoryTotal.toFixed(2).replace(".", ",")};100%`;
    const blob = new Blob([header + body + totalLine], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `despesas-por-categoria-${categoryPeriod}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado com sucesso!");
  };

  // Receitas vs Despesas por mês (bar chart)
  // Base Pagamento: somente pagos COM payment_date (caixa).
  // Bases Vencimento/Criação: visão provisionada/importada (nunca caixa).
  const barData = useMemo(() => {
    const now = new Date();
    const months: any[] = [];
    // Escopo sem o intervalo global: os meses anteriores não podem zerar só
    // porque o filtro global está no mês atual.
    const source = isPaymentBase
      ? scope.filter((t) => isPago(t.status) && !!t.payment_date)
      : scope;
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const end = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
      const name = d.toLocaleDateString("pt-BR", { month: "short" });
      const monthTx = source.filter((t) => { const r = refOf(t); return !!r && r >= start && r <= end; });
      const r = monthTx.filter((t) => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0);
      const dp = monthTx.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0);
      months.push({ name, Receitas: r, Despesas: dp });
    }
    return months;
  }, [scope, isPaymentBase]);

  // Status breakdown (pie chart) — contagem, inclui canceladas por transparência
  const statusData = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredAllStatus.forEach((t) => {
      const s = t.status || "outro";
      totals[s] = (totals[s] || 0) + 1;
    });
    return Object.entries(totals).map(([name, value]) => ({ name, value }));
  }, [filteredAllStatus]);

  const statusColors: Record<string, string> = {
    pendente: "hsl(48, 96%, 53%)",
    pago: "hsl(142, 71%, 35%)",
    vencido: "hsl(0, 72%, 51%)",
    cancelado: "hsl(220, 10%, 60%)",
    processando: "hsl(212, 60%, 45%)",
  };

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex items-start gap-3">
          <AlertCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-destructive">
              Falha ao carregar os lançamentos — os totais abaixo não são confiáveis.
            </p>
            <p className="text-xs text-muted-foreground break-words">{loadError}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
            Tentar novamente
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        <strong>Realizado = pagos por data de pagamento; projeção = pendentes por vencimento.</strong>{" "}
        Canceladas e status não financeiros ficam fora de KPIs e gráficos de valor.{" "}
        {isPaymentBase ? (
          <>
            Base ativa: <strong>Pagamento</strong> (realizado/caixa).
          </>
        ) : (
          <>
            Base ativa: <strong>Vencimento</strong> (provisionado/competência) — não representa caixa
            bancário. Para caixa realizado, troque a base para “Pagamento”.
          </>
        )}
      </p>
      <p className="text-xs font-medium text-amber-600">
        {NO_BANK_BALANCE_NOTICE}
        {paidWithoutPaymentDate > 0 && (
          <> · {paidWithoutPaymentDate} lançamento(s) pago(s) sem data de pagamento — em revisão, fora do caixa.</>
        )}
      </p>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {isPaymentBase ? "Receitas Recebidas (caixa)" : "Receitas (competência)"}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <p className="text-xl sm:text-2xl font-bold tabular-nums">{formatCurrency(kpis.receitas)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Projeção (pendentes por vencimento): <span className="font-medium tabular-nums text-foreground/80">{formatCurrency(kpis.receitasPrev)}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {isPaymentBase ? "Despesas Pagas (caixa)" : "Despesas (competência)"}
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <p className="text-xl sm:text-2xl font-bold tabular-nums">{formatCurrency(kpis.despesas)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Projeção (pendentes por vencimento): <span className="font-medium tabular-nums text-foreground/80">{formatCurrency(kpis.despesasPrev)}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {isPaymentBase ? LABEL_PERIOD_RESULT_CASH : LABEL_PERIOD_RESULT_ACCRUAL}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <p className={`text-xl sm:text-2xl font-bold tabular-nums ${kpis.saldo >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(kpis.saldo)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {LABEL_PROJECTED_VARIATION} (só pendentes, por vencimento):{" "}
              <span className={`font-medium tabular-nums ${kpis.saldoPrev >= 0 ? "text-success/80" : "text-destructive/80"}`}>{formatCurrency(kpis.saldoPrev)}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Contas Vencidas</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><p className="text-xl sm:text-2xl font-bold text-destructive">{kpis.vencidas}</p></CardContent>
        </Card>
      </div>


      {/* Alertas operacionais (Bloco B) */}
      <FinancialOpsAlerts companyId={companyId} />

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fluxo de Caixa (6 meses)</CardTitle>
            <p className="text-xs text-muted-foreground">
              Realizado = pagos por data de pagamento; projeção = pendentes por vencimento (séries
              separadas, nunca somadas)
            </p>
          </CardHeader>

          <CardContent>
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={flowData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="Receitas" stroke="hsl(142, 71%, 35%)" strokeWidth={2} />
                  <Line type="monotone" dataKey="Despesas" stroke="hsl(0, 72%, 51%)" strokeWidth={2} />
                  <Line type="monotone" dataKey="Resultado (caixa)" stroke="hsl(212, 60%, 45%)" strokeWidth={2} />
                  <Line type="monotone" dataKey="Projeção (pendentes)" stroke="hsl(48, 96%, 43%)" strokeWidth={2} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 space-y-0 pb-2">
            <div>
              <CardTitle className="text-base">Despesas por Categoria</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Top 5 categorias{categoryFullList.length > 5 ? ` de ${categoryFullList.length}` : ""} · {categoryPeriodLabel}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/30">
                {([
                  { v: "current_month", l: "Mês" },
                  { v: "last_3_months", l: "3 meses" },
                  { v: "ytd", l: "YTD" },
                  { v: "all", l: "Tudo" },
                ] as { v: CategoryPeriod; l: string }[]).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setCategoryPeriod(opt.v)}
                    className={`px-2.5 h-7 text-xs rounded transition-colors ${
                      categoryPeriod === opt.v
                        ? "bg-background shadow-sm font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
              {categoryFullList.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={exportCategoriesCSV}
                  title={`Exportar todas as categorias do período (${categoryPeriodLabel}) em CSV`}
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Exportar
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {categoryChartData.length === 0 ? (
              <div className="flex items-center justify-center h-48 sm:h-64 text-sm text-muted-foreground">
                Sem dados de despesas
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-center">
                <div className="sm:col-span-2 h-48 sm:h-64 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius="60%"
                        outerRadius="90%"
                        paddingAngle={2}
                        stroke="hsl(var(--background))"
                        strokeWidth={2}
                      >
                        {categoryChartData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{
                          backgroundColor: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</span>
                    <span className="text-sm sm:text-base font-bold tabular-nums">
                      {formatCurrency(categoryTotal)}
                    </span>
                  </div>
                </div>
                <div className="sm:col-span-3 space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {categoryChartData.map((entry, i) => {
                    const pct = categoryTotal > 0 ? (entry.value / categoryTotal) * 100 : 0;
                    return (
                      <div
                        key={entry.name}
                        className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: COLORS[i % COLORS.length] }}
                          />
                          <span className="truncate font-medium" title={entry.name}>
                            {entry.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="tabular-nums text-muted-foreground">
                            {pct.toFixed(1)}%
                          </span>
                          <span className="tabular-nums font-semibold min-w-[80px] text-right">
                            {formatCurrency(entry.value)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isPaymentBase
                ? "Recebidas vs Pagas (mensal, caixa por data de pagamento)"
                : (filters.dateBase ?? "payment") === "created"
                  ? "Receitas vs Despesas (mensal, importação — não é caixa)"
                  : "Receitas vs Despesas (mensal, provisionado por vencimento — não é caixa)"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="Receitas" fill="hsl(142, 71%, 35%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Despesas" fill="hsl(0, 72%, 51%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Distribuição por Status</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48 sm:h-64">
              {statusData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Sem dados
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={75}
                      label={({ name, value }) => `${name} (${value})`}
                      labelLine={false}
                    >
                      {statusData.map((entry, i) => (
                        <Cell key={i} fill={statusColors[entry.name] || COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
