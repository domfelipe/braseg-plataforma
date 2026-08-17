/**
 * Status canônicos e base de data canônica dos módulos financeiros.
 *
 * Valores observados no banco:
 *  - financial_transactions.status: "pago" | "pendente" | "cancelado"
 *  - professional_payments.status: "pago" | "aguardando_pagamento" | "processando_nf" | "duplicado"
 *
 * Estes helpers são puros (sem React / sem Supabase) para permitir teste unitário.
 */

export const TX_STATUS_PAGO = "pago";
export const TX_STATUS_PENDENTE = "pendente";
export const TX_STATUS_CANCELADO = "cancelado";

export const PP_STATUS_PAGO = "pago";
export const PP_STATUS_AGUARDANDO = "aguardando_pagamento";
export const PP_STATUS_PROCESSANDO_NF = "processando_nf";
export const PP_STATUS_DUPLICADO = "duplicado";

export const TX_STATUS_OPTIONS = [
  { value: TX_STATUS_PENDENTE, label: "Pendente" },
  { value: TX_STATUS_PAGO, label: "Pago" },
  { value: TX_STATUS_CANCELADO, label: "Cancelado" },
] as const;

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export const isPago = (s: string | null | undefined) => norm(s) === TX_STATUS_PAGO;
export const isPendente = (s: string | null | undefined) => norm(s) === TX_STATUS_PENDENTE;
export const isCancelado = (s: string | null | undefined) => norm(s) === TX_STATUS_CANCELADO;

/** Linhas canceladas não entram em DRE, caixa ou totais. */
export const countsForResult = (s: string | null | undefined) => !isCancelado(s);

export type FinancialDateBaseValue = "due" | "payment" | "created";

export interface DateBasedRow {
  due_date: string;
  payment_date?: string | null;
  created_at?: string | null;
}

/**
 * Data de referência (YYYY-MM-DD) sob a base ativa.
 * Na base "payment", linhas sem payment_date devolvem null — nunca há fallback
 * silencioso para due_date.
 */
export function refDateForBase(
  row: DateBasedRow,
  base?: FinancialDateBaseValue
): string | null {
  const b = base ?? "payment";
  if (b === "payment") return row.payment_date || null;
  if (b === "created") return row.created_at ? row.created_at.slice(0, 10) : null;
  return row.due_date || null;
}

/** Comparação inclusiva de datas ISO (YYYY-MM-DD). */
export function inDateRange(
  ref: string | null,
  from?: string | null,
  to?: string | null
): boolean {
  if (!ref) return false;
  if (from && ref < from) return false;
  if (to && ref > to) return false;
  return true;
}

export function countMissingPaymentDate(rows: DateBasedRow[]): number {
  return rows.filter((r) => !r.payment_date).length;
}

/** Linha mínima para totais de caixa/previsão. */
export interface CashRow extends DateBasedRow {
  type: string;
  amount: number | string;
  status: string;
}

const amountOf = (r: CashRow) => Number(r.amount) || 0;

/**
 * Caixa realizado: SOMENTE status "pago" com payment_date dentro do período.
 * Nunca usa due_date como fallback — um recebimento pago em julho jamais entra
 * no caixa realizado de agosto.
 */
export function sumRealizedCash(
  rows: CashRow[],
  from?: string | null,
  to?: string | null
): { receitas: number; despesas: number; saldo: number } {
  let receitas = 0;
  let despesas = 0;
  rows.forEach((r) => {
    if (!isPago(r.status)) return;
    if (!inDateRange(r.payment_date ?? null, from, to)) return;
    if (r.type === "receita") receitas += amountOf(r);
    else despesas += amountOf(r);
  });
  return { receitas, despesas, saldo: receitas - despesas };
}

/**
 * Previsão por competência: due_date dentro do período, excluindo cancelados.
 * Inclui pendentes sem payment_date, que não podem desaparecer da visão operacional.
 */
export function sumForecastByDue(
  rows: CashRow[],
  from?: string | null,
  to?: string | null
): { receitas: number; despesas: number; saldo: number } {
  let receitas = 0;
  let despesas = 0;
  rows.forEach((r) => {
    if (!countsForResult(r.status)) return;
    if (!inDateRange(r.due_date || null, from, to)) return;
    if (r.type === "receita") receitas += amountOf(r);
    else despesas += amountOf(r);
  });
  return { receitas, despesas, saldo: receitas - despesas };
}

/** Linha mínima para a regra de visibilidade operacional. */
export interface OperationalRow extends DateBasedRow {
  status: string;
}

/**
 * Data de referência OPERACIONAL (apenas visibilidade em listas/gráficos).
 *
 * NÃO é data de caixa: serve só para decidir se um registro aparece no recorte
 * do período. Na base "pagamento":
 *   - pago COM payment_date -> payment_date (caixa real);
 *   - pendente/vencido, ou pago SEM payment_date -> due_date, para que o
 *     registro continue visível e possa ser corrigido.
 * Nas demais bases, é idêntica a refDateForBase.
 */
export function operationalRefDate(
  row: OperationalRow,
  base?: FinancialDateBaseValue
): string | null {
  const b = base ?? "payment";
  if (b !== "payment") return refDateForBase(row, b);
  if (isPago(row.status) && row.payment_date) return row.payment_date;
  return row.due_date || null;
}



export const DATE_BASE_LABEL: Record<FinancialDateBaseValue, string> = {
  due: "vencimento",
  payment: "pagamento",
  created: "importação",
};

export function dateBaseLabel(base?: FinancialDateBaseValue): string {
  return DATE_BASE_LABEL[base ?? "payment"];
}

/**
 * Aviso obrigatório de apresentação: nenhum resultado exibido pelo sistema é
 * saldo bancário — não existe saldo inicial, conta bancária nem conciliação de
 * extrato. Usado em Dashboard, Visão Geral e Relatórios.
 */
export const NO_BANK_BALANCE_NOTICE =
  "Não representa saldo bancário; para saldo disponível é necessário saldo inicial e conciliação do extrato.";

/** Rótulos canônicos de resultado (nunca "saldo"). */
export const LABEL_PERIOD_RESULT_CASH = "Resultado do período (caixa)";
export const LABEL_PERIOD_RESULT_ACCRUAL = "Resultado do período (por vencimento)";
export const LABEL_PROJECTED_VARIATION = "Variação acumulada projetada";

/**
 * Linhas com status "pago" mas SEM data de pagamento: não entram no caixa e
 * devem aparecer como alerta de revisão.
 */
export function countPaidWithoutPaymentDate(
  rows: { status: string; payment_date?: string | null }[]
): number {
  return rows.filter((r) => isPago(r.status) && !r.payment_date).length;
}
