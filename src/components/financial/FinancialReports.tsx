import { useState, useEffect, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Download, Printer, TrendingUp, FileText, BarChart3, MapPin } from "lucide-react";
import { format, startOfMonth, endOfMonth, addDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { getCompanyLocations } from "@/lib/companyLocations";
import { FinancialFiltersState } from "./FinancialFilters";
import FinancialReconciliationSummary from "./FinancialReconciliationSummary";
import {
  isProfessionalPaymentsCategory,
  DRE_LABEL_MIRRORED,
  DRE_LABEL_UNLINKED,
} from "@/lib/professionalReconciliation";
import {
  TX_STATUS_OPTIONS,
  countsForResult,
  isPago,
  isPendente,
  refDateForBase,
  operationalRefDate,
  inDateRange,
  countMissingPaymentDate,
  dateBaseLabel,
  countPaidWithoutPaymentDate,
  NO_BANK_BALANCE_NOTICE,
  
  type FinancialDateBaseValue,
} from "@/lib/financialStatus";
import { fetchAllPaged, FINANCIAL_TX_COLUMNS } from "@/lib/financialData";
import { AlertCircle } from "lucide-react";




interface Props {
  companyId: string;
  filters?: FinancialFiltersState;
}

interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: string;
  status: string;
  due_date: string;
  payment_date: string | null;
  created_at: string | null;
  category_id: string | null;
  city: string | null;
  source_payment_id: string | null;
}

interface Category {
  id: string;
  name: string;
  type: string;
}

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export default function FinancialReports({ companyId, filters }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // City filter
  const [selectedCity, setSelectedCity] = useState("todas");

  // DRE state
  const now = new Date();
  const [dreMonth, setDreMonth] = useState(String(now.getMonth()));
  const [dreYear, setDreYear] = useState(String(now.getFullYear()));

  // Extrato state
  const [extStartDate, setExtStartDate] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [extEndDate, setExtEndDate] = useState(format(endOfMonth(now), "yyyy-MM-dd"));
  const [extType, setExtType] = useState("todos");
  const [extStatus, setExtStatus] = useState("todos");

  const [reloadKey, setReloadKey] = useState(0);

  // Revalidar DRE/Extrato quando lançamentos, pagamentos ou categorias mudarem.
  useEffect(() => {
    const bump = () => setReloadKey((k) => k + 1);
    const channel = supabase
      .channel(`financial-reports-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_transactions" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "professional_payments" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_categories" }, bump)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        setLoadError(null);
        // Paginação determinística: `.limit()` não contorna o cap do PostgREST.
        const [tx, cats] = await Promise.all([
          fetchAllPaged<Transaction>(() =>
            supabase
              .from("financial_transactions")
              .select(FINANCIAL_TX_COLUMNS)
              .eq("company_id", companyId)
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
          ),
          fetchAllPaged<{ id: string; name: string; type: string }>(() =>
            supabase
              .from("financial_categories")
              .select("id,name,type")
              .eq("company_id", companyId)
              .order("id", { ascending: true })
          ),
        ]);
        setTransactions(tx);
        setCategories(cats);
      } catch (e) {
        console.error("Erro ao carregar dados financeiros:", e);
        setTransactions([]);
        setCategories([]);
        setLoadError(e instanceof Error ? e.message : "Falha ao carregar lançamentos");
      }
      setLoading(false);
    }
    fetchData();
  }, [companyId, reloadKey]);


  // Unique cities from data
  const availableCities = useMemo(() => {
    const predefined = getCompanyLocations(companyId);
    const s = new Set<string>(predefined);
    transactions.forEach((t) => { if (t.city) s.add(t.city); });
    return Array.from(s).sort();
  }, [transactions, companyId]);

  // Base de data ativa (vencimento / pagamento / importação)
  const dateBase: FinancialDateBaseValue = (filters?.dateBase ?? "payment") as FinancialDateBaseValue;
  const baseLabel = dateBaseLabel(dateBase);
  // Rótulo de natureza da base ativa (não altera datas nem valores).
  const baseMeaning =
    dateBase === "payment"
      ? "realizado/caixa"
      : dateBase === "due"
        ? "provisionado/competência"
        : "importação";




  /**
   * Escopo OPERACIONAL: mesmos filtros de empresa/cidade/categoria, mas o
   * recorte de período usa a data operacional (pago+payment_date -> pagamento;
   * pendente ou pago sem data -> vencimento). Assim, na base Pagamento, os
   * pendentes sem payment_date continuam visíveis no Fluxo de Caixa.
   * Não altera nenhum valor nem status; é apenas visibilidade.
   */
  const operationalScope = useMemo(() => {
    let result = transactions;
    if (filters) {
      result = result.filter((t) => {
        if (filters.dateFrom || filters.dateTo) {
          if (!inDateRange(operationalRefDate(t, dateBase), filters.dateFrom, filters.dateTo))
            return false;
        }
        if (filters.city !== "all" && t.city !== filters.city) return false;
        if (filters.categoryId !== "all" && t.category_id !== filters.categoryId) return false;
        return true;
      });
    }
    if (selectedCity !== "todas") result = result.filter((t) => t.city === selectedCity);
    return result;
  }, [transactions, selectedCity, filters, dateBase]);

  // Linhas sem data de pagamento — só relevante quando a base é "pagamento".
  const missingPaymentDateCount = useMemo(() => {
    if (dateBase !== "payment") return 0;
    let scope = transactions;
    if (filters) {
      scope = scope.filter((t) => {
        if (filters.city !== "all" && t.city !== filters.city) return false;
        if (filters.categoryId !== "all" && t.category_id !== filters.categoryId) return false;
        return true;
      });
    }
    if (selectedCity !== "todas") scope = scope.filter((t) => t.city === selectedCity);
    return countMissingPaymentDate(scope);
  }, [transactions, filters, selectedCity, dateBase]);

  /**
   * Escopo de RELATÓRIOS: independente do intervalo global (filters.dateFrom/dateTo).
   * Respeita empresa (já na query), cidade global/local e categoria global.
   * Usado por DRE e conciliação, que possuem seu próprio recorte de mês/ano.
   */
  const reportScope = useMemo(() => {
    let result = transactions;
    if (filters) {
      result = result.filter((t) => {
        if (filters.city !== "all" && t.city !== filters.city) return false;
        if (filters.categoryId !== "all" && t.category_id !== filters.categoryId) return false;
        return true;
      });
    }
    if (selectedCity !== "todas") result = result.filter((t) => t.city === selectedCity);
    return result;
  }, [transactions, selectedCity, filters?.city, filters?.categoryId]);




  const catMap = useMemo(() => {
    const m: Record<string, string> = {};
    categories.forEach((c) => (m[c.id] = c.name));
    return m;
  }, [categories]);

  // Data de referência de cada linha sob a base ativa (sem fallback silencioso)
  const refOf = (t: Transaction) => refDateForBase(t, dateBase);

  // ===== DRE =====
  const dreData = useMemo(() => {
    const month = parseInt(dreMonth);
    const year = parseInt(dreYear);
    const start = format(startOfMonth(new Date(year, month)), "yyyy-MM-dd");
    const end = format(endOfMonth(new Date(year, month)), "yyyy-MM-dd");

    // Escopo independente do intervalo global: o mês/ano do DRE manda.
    const inWindow = reportScope.filter((t) => inDateRange(refOf(t), start, end));
    const windowStart = start;
    const windowEnd = end;
    const excludedNoRefDate = reportScope.length
      ? reportScope.filter((t) => !refOf(t)).length
      : 0;
    const filtered = inWindow.filter((t) => countsForResult(t.status));

    const receitas: Record<string, number> = {};
    const despesas: Record<string, number> = {};
    let totalReceitas = 0;
    let totalDespesas = 0;

    filtered.forEach((t) => {
      const rawName = t.category_id ? (catMap[t.category_id] || "Sem categoria") : "Sem categoria";
      // Apresentação apenas: a categoria de profissionais é exibida em duas linhas
      // (espelhados / sem vínculo). Nenhum campo do registro é alterado.
      const catName =
        t.type !== "receita" && isProfessionalPaymentsCategory(rawName)
          ? (t.source_payment_id ? DRE_LABEL_MIRRORED : DRE_LABEL_UNLINKED)
          : rawName;
      if (t.type === "receita") {
        receitas[catName] = (receitas[catName] || 0) + t.amount;
        totalReceitas += t.amount;
      } else {
        despesas[catName] = (despesas[catName] || 0) + t.amount;
        totalDespesas += t.amount;
      }
    });

    return {
      receitas: Object.entries(receitas).sort((a, b) => b[1] - a[1]),
      despesas: Object.entries(despesas).sort((a, b) => b[1] - a[1]),
      totalReceitas,
      totalDespesas,
      resultado: totalReceitas - totalDespesas,
      canceladas: inWindow.length - filtered.length,
      excludedNoRefDate,
      windowStart,
      windowEnd,
    };
  }, [reportScope, dreMonth, dreYear, catMap, dateBase]);

  // ===== FLUXO DE CAIXA =====
  // Usa o escopo operacional: pendentes sem payment_date continuam aparecendo
  // mesmo quando a base ativa é Pagamento.
  const cashFlowData = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    // Projeção: pendentes futuros pela data de vencimento.
    const pending = operationalScope
      .filter((t) => isPendente(t.status) && !!t.due_date && t.due_date > today)
      .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));

    // Realizado (caixa): apenas status "pago" COM data de pagamento.
    // Nunca usa due_date como substituto da data de pagamento.
    const paid = operationalScope.filter((t) => isPago(t.status) && !!t.payment_date);
    const realizado = paid.reduce(
      (acc, t) => acc + (t.type === "receita" ? t.amount : -t.amount),
      0
    );

    // Duas séries independentes: caixa realizado (pagos por data de pagamento)
    // e projeção de pendentes (por vencimento, começando SEMPRE em zero).
    const realizadoMap: Record<string, number> = {};
    paid.forEach((t) => {
      const key = t.payment_date as string;
      realizadoMap[key] = (realizadoMap[key] || 0) + (t.type === "receita" ? t.amount : -t.amount);
    });
    const pendingMap: Record<string, number> = {};
    pending.forEach((t) => {
      const key = t.due_date;
      pendingMap[key] = (pendingMap[key] || 0) + (t.type === "receita" ? t.amount : -t.amount);
    });

    const dates = Array.from(
      new Set([...Object.keys(realizadoMap), ...Object.keys(pendingMap)])
    ).sort();
    let accRealizado = 0;
    let accProjecao = 0;
    const chartData = dates.map((d) => {
      accRealizado += realizadoMap[d] || 0;
      accProjecao += pendingMap[d] || 0;
      return {
        date: format(parseISO(d), "dd/MM", { locale: ptBR }),
        realizado: accRealizado,
        projecao: accProjecao,
        raw: d,
      };
    });

    const paidWithoutPaymentDate = countPaidWithoutPaymentDate(operationalScope);

    return { chartData, pending, realizado, paidWithoutPaymentDate };
  }, [operationalScope]);


  // ===== EXTRATO =====
  // Canceladas nunca entram no extrato. Usa o escopo/data operacional para que,
  // na base Pagamento, pendentes sem payment_date continuem visíveis por due_date.
  const extRefOf = (t: Transaction) => operationalRefDate(t, dateBase);
  const extratoData = useMemo(() => {
    return operationalScope
      .filter((t) => {
        if (!countsForResult(t.status)) return false;
        if (!inDateRange(operationalRefDate(t, dateBase), extStartDate, extEndDate)) return false;
        if (extType !== "todos" && t.type !== extType) return false;
        if (extStatus !== "todos" && t.status !== extStatus) return false;
        return true;
      })
      .sort((a, b) =>
        (operationalRefDate(a, dateBase) || "").localeCompare(operationalRefDate(b, dateBase) || "")
      );
  }, [operationalScope, extStartDate, extEndDate, extType, extStatus, dateBase]);


  // Totais separados: realizado (pago + payment_date) x pendentes (por vencimento).
  // Nunca exibimos um saldo único misturando as duas naturezas.
  const extratoTotals = useMemo(() => {
    let recReal = 0, despReal = 0, recPend = 0, despPend = 0;
    extratoData.forEach((t) => {
      if (isPago(t.status) && t.payment_date) {
        if (t.type === "receita") recReal += t.amount;
        else despReal += t.amount;
      } else if (isPendente(t.status)) {
        if (t.type === "receita") recPend += t.amount;
        else despPend += t.amount;
      }
    });
    return {
      recReal, despReal, resultadoReal: recReal - despReal,
      recPend, despPend, projecaoPend: recPend - despPend,
    };
  }, [extratoData]);


  // ===== EXPORT =====
  const exportCSV = (rows: { description: string; amount: number; type: string; due_date: string; status: string }[], filename: string) => {
    const header = "Descrição;Valor;Tipo;Vencimento;Status\n";
    const body = rows.map((r) => `${r.description};${r.amount};${r.type};${r.due_date};${r.status}`).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado com sucesso!");
  };

  const exportPDF = () => {
    window.print();
  };

  const yearOptions = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - 2 + i));

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 print:space-y-2">
      {loadError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex items-start gap-3 print:hidden">
          <AlertCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-destructive">
              Falha ao carregar os lançamentos — DRE, extrato e fluxo abaixo não são confiáveis.
            </p>
            <p className="text-xs text-muted-foreground break-words">{loadError}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
            Tentar novamente
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-lg font-semibold">Relatórios Financeiros</h2>
          <span className="text-xs text-muted-foreground">
            Base de data: {baseLabel} ({baseMeaning})
            {dateBase === "payment" && missingPaymentDateCount > 0 && (
              <> · {missingPaymentDateCount} lançamento(s) sem data de pagamento fora do período</>
            )}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">

          {availableCities.length > 0 && (
            <Select value={selectedCity} onValueChange={setSelectedCity}>
              <SelectTrigger className="w-[180px]">
                <MapPin className="h-4 w-4 mr-1 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as cidades</SelectItem>
                {availableCities.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={exportPDF}>
            <Printer className="h-4 w-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      <Tabs defaultValue="dre" className="space-y-4">
        <TabsList className="print:hidden">
          <TabsTrigger value="dre"><BarChart3 className="h-4 w-4 mr-1" /> DRE</TabsTrigger>
          <TabsTrigger value="fluxo"><TrendingUp className="h-4 w-4 mr-1" /> Fluxo de Caixa</TabsTrigger>
          <TabsTrigger value="extrato"><FileText className="h-4 w-4 mr-1" /> Extrato</TabsTrigger>
        </TabsList>

        {/* DRE */}
        <TabsContent value="dre">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>DRE Simplificado</CardTitle>
                <div className="flex gap-2 print:hidden">
                  <Select value={dreMonth} onValueChange={setDreMonth}>
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={dreYear} onValueChange={setDreYear}>
                    <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((y) => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {MONTHS[parseInt(dreMonth)]} de {dreYear} ·{" "}
                {dateBase === "payment"
                  ? "caixa por data de pagamento"
                  : dateBase === "due"
                    ? "competência por vencimento"
                    : `base: ${baseLabel}`}{" "}
                · canceladas excluídas
                {dreData.canceladas > 0 && <> ({dreData.canceladas})</>}
                {dateBase === "payment" && dreData.excludedNoRefDate > 0 && (
                  <> · {dreData.excludedNoRefDate} sem data de pagamento</>
                )}
              </p>

            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conta</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-accent/30 font-semibold">
                    <TableCell>RECEITAS</TableCell>
                    <TableCell className="text-right text-emerald-600">{formatCurrency(dreData.totalReceitas)}</TableCell>
                  </TableRow>
                  {dreData.receitas.map(([cat, val]) => (
                    <TableRow key={cat}>
                      <TableCell className="pl-8">{cat}</TableCell>
                      <TableCell className="text-right">{formatCurrency(val)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-accent/30 font-semibold">
                    <TableCell>DESPESAS</TableCell>
                    <TableCell className="text-right text-destructive">{formatCurrency(dreData.totalDespesas)}</TableCell>
                  </TableRow>
                  {dreData.despesas.map(([cat, val]) => (
                    <TableRow key={cat}>
                      <TableCell className="pl-8">{cat}</TableCell>
                      <TableCell className="text-right">{formatCurrency(val)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-bold text-base">
                    <TableCell>
                      RESULTADO DO PERÍODO{" "}
                      {dateBase === "payment" ? "(caixa)" : "(por vencimento)"}
                    </TableCell>
                    <TableCell className={`text-right ${dreData.resultado >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {formatCurrency(dreData.resultado)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          <div className="mt-4">
            <FinancialReconciliationSummary
              rows={reportScope}
              categoryNames={catMap}
              base={dateBase}
              from={dreData.windowStart}
              to={dreData.windowEnd}
              periodLabel={`${MONTHS[parseInt(dreMonth)]} de ${dreYear}`}
            />
          </div>
        </TabsContent>

        {/* FLUXO DE CAIXA */}
        <TabsContent value="fluxo">
          <Card>
            <CardHeader>
              <CardTitle>Fluxo de Caixa — resultado do período (caixa) e projeção</CardTitle>
              <p className="text-sm text-muted-foreground">
                Resultado do período (caixa: status pago, por data de pagamento):{" "}
                {formatCurrency(cashFlowData.realizado)} · projeção sobre pendentes futuros{" "}
                <strong>por vencimento</strong> · cancelados excluídos · pendentes sem data de
                pagamento permanecem visíveis mesmo na base {baseLabel}
              </p>
              <p className="text-xs font-medium text-amber-600">
                {NO_BANK_BALANCE_NOTICE}
                {cashFlowData.paidWithoutPaymentDate > 0 && (
                  <> · {cashFlowData.paidWithoutPaymentDate} pago(s) sem data de pagamento — revisão, fora do caixa.</>
                )}
              </p>

            </CardHeader>
            <CardContent className="space-y-6">
              {cashFlowData.chartData.length > 0 ? (
                <ChartContainer
                  config={{
                    realizado: { label: "Resultado realizado (caixa)", color: "hsl(var(--primary))" },
                    projecao: { label: "Projeção de pendentes (vencimento)", color: "hsl(var(--muted-foreground))" },
                  }}
                  className="h-[300px] w-full"
                >
                  <LineChart data={cashFlowData.chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <ChartTooltip
                      content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />}
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Line type="monotone" dataKey="realizado" stroke="var(--color-realizado)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="projecao" stroke="var(--color-projecao)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                  </LineChart>
                </ChartContainer>
              ) : (
                <p className="text-center text-muted-foreground py-8">Nenhum movimento realizado ou pendente futuro encontrado.</p>
              )}


              <div>
                <h3 className="font-semibold mb-2">Pendentes/projeção por vencimento</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashFlowData.pending.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          Nenhuma transação pendente
                        </TableCell>
                      </TableRow>
                    ) : (
                      cashFlowData.pending.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell>{format(parseISO(t.due_date), "dd/MM/yyyy")}</TableCell>


                          <TableCell>{t.description}</TableCell>
                          <TableCell>{t.type === "receita" ? "Receita" : "Despesa"}</TableCell>
                          <TableCell className={`text-right ${t.type === "receita" ? "text-emerald-600" : "text-destructive"}`}>
                            {formatCurrency(t.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* EXTRATO */}
        <TabsContent value="extrato">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Extrato por Período</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Base de data: {baseLabel} ({baseMeaning}) · canceladas excluídas · sem saldo
                    único: realizado e pendentes são apresentados separadamente
                    {dateBase === "payment" && <> · pagas pela data de pagamento</>}
                    {dateBase === "payment" && missingPaymentDateCount > 0 && (
                      <> · {missingPaymentDateCount} sem data de pagamento (excluídos)</>
                    )}
                  </p>
                  <p className="text-xs font-medium text-amber-600 mt-1">
                    {NO_BANK_BALANCE_NOTICE}
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="print:hidden"
                  onClick={() => exportCSV(extratoData, `extrato-${extStartDate}-${extEndDate}`)}
                >
                  <Download className="h-4 w-4 mr-1" /> CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4 print:hidden">
                <div>
                  <Label className="text-xs">Data Início</Label>
                  <Input type="date" value={extStartDate} onChange={(e) => setExtStartDate(e.target.value)} className="w-[160px]" />
                </div>
                <div>
                  <Label className="text-xs">Data Fim</Label>
                  <Input type="date" value={extEndDate} onChange={(e) => setExtEndDate(e.target.value)} className="w-[160px]" />
                </div>
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select value={extType} onValueChange={setExtType}>
                    <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="receita">Receita</SelectItem>
                      <SelectItem value="despesa">Despesa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={extStatus} onValueChange={setExtStatus}>
                    <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {TX_STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}

                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {extratoData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Nenhuma transação encontrada no período
                      </TableCell>
                    </TableRow>
                  ) : (
                    extratoData.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{format(parseISO(extRefOf(t) as string), "dd/MM/yyyy")}</TableCell>
                        <TableCell>{t.description}</TableCell>
                        <TableCell>{t.category_id ? (catMap[t.category_id] || "—") : "—"}</TableCell>
                        <TableCell>{t.type === "receita" ? "Receita" : "Despesa"}</TableCell>
                        <TableCell className="capitalize">{t.status}</TableCell>
                        <TableCell className={`text-right ${t.type === "receita" ? "text-emerald-600" : "text-destructive"}`}>
                          {formatCurrency(t.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {extratoData.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={5} className="font-semibold">Receitas recebidas (pagas, por data de pagamento)</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">{formatCurrency(extratoTotals.recReal)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={5} className="font-semibold">Despesas pagas (por data de pagamento)</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">{formatCurrency(extratoTotals.despReal)}</TableCell>
                    </TableRow>
                    <TableRow className="font-bold">
                      <TableCell colSpan={5}>Resultado realizado (caixa)</TableCell>
                      <TableCell className={`text-right ${extratoTotals.resultadoReal >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {formatCurrency(extratoTotals.resultadoReal)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={5} className="font-semibold">Receitas pendentes (por vencimento)</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(extratoTotals.recPend)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={5} className="font-semibold">Despesas pendentes (por vencimento)</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(extratoTotals.despPend)}</TableCell>
                    </TableRow>
                    <TableRow className="font-bold">
                      <TableCell colSpan={5}>Projeção de pendentes (por vencimento)</TableCell>
                      <TableCell className="text-right">{formatCurrency(extratoTotals.projecaoPend)}</TableCell>
                    </TableRow>
                  </TableFooter>

                )}
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
