import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Download, MapPin, FileText, DollarSign, Clock, CheckCircle } from "lucide-react";
import { startOfMonth, endOfMonth } from "date-fns";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  PP_STATUS_PAGO,
  PP_STATUS_AGUARDANDO,
  PP_STATUS_PROCESSANDO_NF,
  PP_STATUS_DUPLICADO,
} from "@/lib/financialStatus";
import {
  countMissingMirrors,
  isProfessionalPaymentsCategory,
} from "@/lib/professionalReconciliation";
import { normalizeProfessionalLocation, summarizeMissingReceipts } from "@/lib/professionalLocation";

interface Props {
  companyId: string;
}

interface Payment {
  id: string;
  doctor_name: string;
  doctor_company_name: string | null;
  doctor_cnpj: string | null;
  amount: number;
  nf_number: string | null;
  nf_issue_date: string | null;
  location: string | null;
  status: string;
  payment_date: string | null;
  created_at: string;
  receipt_url: string | null;
}

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const SELECT_COLS =
  "id,doctor_name,doctor_company_name,doctor_cnpj,amount,nf_number,nf_issue_date,location,status,payment_date,created_at,receipt_url";

export default function PaymentsReports({ companyId }: Props) {
  const [paid, setPaid] = useState<Payment[]>([]);
  const [pending, setPending] = useState<Payment[]>([]);
  const [others, setOthers] = useState<Payment[]>([]);
  const [mirrors, setMirrors] = useState<{ expected: number; present: number; missing: number } | null>(null);
  // Origem dos lançamentos financeiros da categoria de profissionais no período:
  // espelhados (source_payment_id preenchido) vs financeiros sem vínculo médico.
  const [origin, setOrigin] = useState<
    { mirroredAmount: number; unlinkedAmount: number; unlinkedCount: number } | null
  >(null);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth()));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [selectedLocation, setSelectedLocation] = useState("todos");

  const yearOptions = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - 2 + i));

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      const m = parseInt(month);
      const y = parseInt(year);
      const start = format(startOfMonth(new Date(y, m)), "yyyy-MM-dd");
      const end = format(endOfMonth(new Date(y, m)), "yyyy-MM-dd");

      // Pagos: status canônico "pago" no período por payment_date.
      const [paidRes, pendingRes, othersRes] = await Promise.all([
        supabase
          .from("professional_payments")
          .select(SELECT_COLS)
          .eq("company_id", companyId)
          .eq("status", PP_STATUS_PAGO)
          .gte("payment_date", start)
          .lte("payment_date", end)
          .order("payment_date", { ascending: true })
          .limit(20000),
        // Pendentes: aguardando pagamento (sem data de pagamento), fora do total pago.
        supabase
          .from("professional_payments")
          .select(SELECT_COLS)
          .eq("company_id", companyId)
          .eq("status", PP_STATUS_AGUARDANDO)
          .order("created_at", { ascending: false })
          .limit(20000),
        // Outros: processando_nf / duplicado — nunca somam no pago.
        supabase
          .from("professional_payments")
          .select(SELECT_COLS)
          .eq("company_id", companyId)
          .in("status", [PP_STATUS_PROCESSANDO_NF, PP_STATUS_DUPLICADO])
          .order("created_at", { ascending: false })
          .limit(20000),
      ]);

      if (cancelled) return;
      const canonical = (rows: unknown): Payment[] =>
        ((rows ?? []) as Payment[]).map((p) => ({
          ...p,
          location: normalizeProfessionalLocation(p.location),
        }));
      const paidRows = canonical(paidRes.data);
      setPaid(paidRows);
      setPending(canonical(pendingRes.data));
      setOthers(canonical(othersRes.data));

      // Conferência dos espelhos financeiros: agregação 1:1 por source_payment_id,
      // sem join e sem multiplicação de linhas.
      if (paidRows.length === 0) {
        setMirrors({ expected: 0, present: 0, missing: 0 });
      } else {
        const ids = paidRows.map((p) => p.id);
        // Consulta em lotes: evita URL longa e o limite implícito de 1000 linhas.
        const mirrorIds: (string | null)[] = [];
        for (let i = 0; i < ids.length; i += 300) {
          const chunk = ids.slice(i, i + 300);
          const { data: mirrorRows } = await supabase
            .from("financial_transactions")
            .select("source_payment_id")
            .eq("company_id", companyId)
            .in("source_payment_id", chunk)
            .limit(20000);
          (mirrorRows ?? []).forEach((r) => mirrorIds.push(r.source_payment_id));
        }
        const result = countMissingMirrors(ids, mirrorIds);
        if (!cancelled) {
          setMirrors({ expected: result.expected, present: result.present, missing: result.missing });
        }
      }
      // Origem financeira do período (somente leitura): categoria de profissionais,
      // pagos por payment_date, separando espelhados de lançamentos sem vínculo.
      const { data: catRows } = await supabase
        .from("financial_categories")
        .select("id,name")
        .eq("company_id", companyId);
      const profCatIds = (catRows ?? [])
        .filter((c) => isProfessionalPaymentsCategory(c.name))
        .map((c) => c.id);
      if (profCatIds.length === 0) {
        if (!cancelled) setOrigin({ mirroredAmount: 0, unlinkedAmount: 0, unlinkedCount: 0 });
      } else {
        const { data: txRows } = await supabase
          .from("financial_transactions")
          .select("amount,status,source_payment_id,payment_date,city")
          .eq("company_id", companyId)
          .eq("status", "pago")
          .in("category_id", profCatIds)
          .gte("payment_date", start)
          .lte("payment_date", end)
          .limit(20000);
        const rows = (txRows ?? []).filter(
          (t) =>
            selectedLocation === "todos" ||
            normalizeProfessionalLocation(t.city) === selectedLocation
        );
        let mirroredAmount = 0, unlinkedAmount = 0, unlinkedCount = 0;
        rows.forEach((t) => {
          const v = Number(t.amount) || 0;
          if (t.source_payment_id) mirroredAmount += v;
          else { unlinkedAmount += v; unlinkedCount++; }
        });
        if (!cancelled) setOrigin({ mirroredAmount, unlinkedAmount, unlinkedCount });
      }

      if (!cancelled) setLoading(false);
    }
    fetchData();
    return () => { cancelled = true; };
  }, [companyId, month, year, selectedLocation]);

  const availableLocations = useMemo(() => {
    const s = new Set<string>();
    [...paid, ...pending, ...others].forEach((p) => { if (p.location) s.add(p.location); });
    return Array.from(s).sort();
  }, [paid, pending, others]);

  const byLocation = (rows: Payment[]) =>
    selectedLocation === "todos" ? rows : rows.filter((p) => p.location === selectedLocation);

  const filteredPaid = useMemo(() => byLocation(paid), [paid, selectedLocation]);
  const filteredPending = useMemo(() => byLocation(pending), [pending, selectedLocation]);
  const filteredOthers = useMemo(() => byLocation(others), [others, selectedLocation]);

  const sum = (rows: Payment[]) => rows.reduce((acc, p) => acc + p.amount, 0);

  // Agrupamento por local — apenas dos pagos no período.
  const groupedData = useMemo(() => {
    const map: Record<string, { count: number; total: number; payments: Payment[] }> = {};
    filteredPaid.forEach((p) => {
      const loc = p.location || "Sem local";
      if (!map[loc]) map[loc] = { count: 0, total: 0, payments: [] };
      map[loc].count++;
      map[loc].total += p.amount;
      map[loc].payments.push(p);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredPaid]);

  const totals = useMemo(() => ({
    count: filteredPaid.length,
    paid: sum(filteredPaid),
    pendingCount: filteredPending.length,
    pending: sum(filteredPending),
    othersCount: filteredOthers.length,
    others: sum(filteredOthers),
  }), [filteredPaid, filteredPending, filteredOthers]);

  const missingReceipts = useMemo(
    () => summarizeMissingReceipts(filteredPaid),
    [filteredPaid]
  );

  const exportCSV = () => {
    const header = "Bloco;Local;Profissional;CNPJ;NF;Valor;Status;Data Pagamento\n";
    const rows = [
      ...filteredPaid.map((p) => ["pago", p] as const),
      ...filteredPending.map((p) => ["pendente", p] as const),
      ...filteredOthers.map((p) => ["outros", p] as const),
    ];
    const body = rows.map(([bloco, p]) =>
      `${bloco};${p.location || "Sem local"};${p.doctor_name};${p.doctor_cnpj || ""};${p.nf_number || ""};${p.amount};${p.status};${p.payment_date || ""}`
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-pagamentos-${MONTHS[parseInt(month)]}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado com sucesso!");
  };

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
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <span className="text-xs text-muted-foreground">Mês</span>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={String(i)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Ano</span>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {availableLocations.length > 0 && (
          <div>
            <span className="text-xs text-muted-foreground">Local</span>
            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
              <SelectTrigger className="w-[180px]">
                <MapPin className="h-4 w-4 mr-1 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os locais</SelectItem>
                {availableLocations.map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Pagos filtrados por status <strong>pago</strong> e <strong>data de pagamento</strong> no mês
        selecionado. Pendentes e outros status não somam no total pago.
        {mirrors !== null && (
          <>
            {" "}Espelhos em financeiro (agregados 1:1 por source_payment_id): {mirrors.present} de{" "}
            {mirrors.expected}
            {mirrors.missing > 0 ? (
              <strong className="text-amber-600"> — {mirrors.missing} espelho(s) faltante(s)</strong>
            ) : (
              <> — 0 espelhos faltantes</>
            )}
            .
          </>
        )}
      </p>

      <p className="text-xs text-muted-foreground">
        Unidade/local: <strong>{selectedLocation === "todos" ? "todos os locais" : selectedLocation}</strong>{" "}
        · Período: <strong>{MONTHS[parseInt(month)]} de {year}</strong> (por data de pagamento).
        Unidades distintas nunca são agrupadas: “Botucatu - PSA” e “Botucatu - PSF” são separadas.
      </p>

      {origin && (
        <p className="text-xs text-muted-foreground">
          Origem no financeiro (categoria Pagamentos de Profissionais, pagos no período):{" "}
          espelhados do módulo médico <strong>{formatCurrency(origin.mirroredAmount)}</strong> ·
          lançamentos financeiros sem source_payment_id{" "}
          <strong className="text-amber-600">{formatCurrency(origin.unlinkedAmount)}</strong>{" "}
          ({origin.unlinkedCount} registro(s) — origem financeira não médica, não duplicam o módulo).
        </p>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <FileText className="h-3.5 w-3.5" /> NFs pagas
            </div>
            <p className="text-xl font-bold">{totals.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <CheckCircle className="h-3.5 w-3.5" /> Pago no período
            </div>
            <p className="text-xl font-bold text-emerald-600">{formatCurrency(totals.paid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Clock className="h-3.5 w-3.5" /> Aguardando pagamento
            </div>
            <p className="text-xl font-bold text-amber-600">{formatCurrency(totals.pending)}</p>
            <p className="text-xs text-muted-foreground">{totals.pendingCount} registro(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <DollarSign className="h-3.5 w-3.5" /> Outros status
            </div>
            <p className="text-xl font-bold">{formatCurrency(totals.others)}</p>
            <p className="text-xs text-muted-foreground">
              {totals.othersCount} registro(s) — não somam
            </p>
          </CardContent>
        </Card>
      </div>

      {missingReceipts.count > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-3 px-4 flex items-start gap-2">
            <FileText className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
            <p className="text-xs text-muted-foreground">
              <strong className="text-amber-600">
                {missingReceipts.count} pagamento(s) pago(s) sem comprovante anexado
              </strong>{" "}
              ({formatCurrency(missingReceipts.amount)}) no recorte ativo. Indicador documental
              apenas: os valores seguem contabilizados como pagos e nenhum status foi alterado.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Pagos agrupados por local */}
      {groupedData.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum pagamento pago no período selecionado.
          </CardContent>
        </Card>
      ) : (
        groupedData.map(([location, data]) => (
          <Card key={location}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  {location}
                </CardTitle>
                <span className="text-sm text-muted-foreground">{data.count} NF(s) — {formatCurrency(data.total)}</span>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Profissional</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>NF</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.doctor_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.doctor_cnpj || "—"}</TableCell>
                      <TableCell>{p.nf_number || "—"}</TableCell>
                      <TableCell>
                        {p.payment_date
                          ? new Date(p.payment_date + "T12:00:00").toLocaleDateString("pt-BR")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium text-emerald-600">
                        {formatCurrency(p.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="font-semibold">Subtotal</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(data.total)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        ))
      )}

      {/* Pendentes — bloco separado */}
      {filteredPending.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Aguardando pagamento (fora do total pago)</CardTitle>
              <span className="text-sm text-muted-foreground">
                {filteredPending.length} registro(s) — {formatCurrency(totals.pending)}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>NF</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPending.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.doctor_name}</TableCell>
                    <TableCell>{p.location || "—"}</TableCell>
                    <TableCell>{p.nf_number || "—"}</TableCell>
                    <TableCell className="text-right font-medium text-amber-600">
                      {formatCurrency(p.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Outros status */}
      {filteredOthers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Outros status (processando NF / duplicado)</CardTitle>
              <span className="text-sm text-muted-foreground">
                {filteredOthers.length} registro(s) — não somam
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOthers.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.doctor_name}</TableCell>
                    <TableCell>{p.location || "—"}</TableCell>
                    <TableCell className="capitalize">{p.status.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
