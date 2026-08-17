/**
 * KPI realizado ÚNICO e compartilhado entre Dashboard e módulo Financeiro.
 *
 * Regra canônica (uma só fórmula em todo o sistema):
 *  - somente status exatamente "pago";
 *  - base "payment" (padrão): payment_date dentro de [from, to], SEM fallback para due_date;
 *  - base "due": due_date dentro de [from, to] (competência, NÃO é caixa);
 *  - cancelados e status não financeiros ficam fora;
 *  - soma numérica direta, sem arredondamento intermediário;
 *  - cidade/categoria só restringem quando explicitamente selecionadas
 *    ("all"/null/undefined não restringem);
 *  - company_id é responsabilidade da consulta (nunca soma empresas diferentes).
 *
 * Puro: sem React, sem Supabase, testável unitariamente.
 */

import { isPago, isPendente, inDateRange, countsForResult } from "./financialStatus";

export interface KpiRow {
  type: string;
  amount: number | string;
  status: string;
  due_date: string;
  payment_date?: string | null;
  city?: string | null;
  category_id?: string | null;
}

export interface KpiScopeFilters {
  /** "all" | null | undefined => sem restrição */
  city?: string | null;
  /** "all" | null | undefined => sem restrição */
  categoryId?: string | null;
}

export interface RealizedKpis {
  receitas: number;
  despesas: number;
  saldo: number;
  count: number;
  countReceitas: number;
  countDespesas: number;
}

const amountOf = (r: KpiRow) => Number(r.amount) || 0;

const unrestricted = (v?: string | null) => !v || v === "all" || v === "todas" || v === "todos";

/** Aplica apenas cidade/categoria explícitas e remove cancelados. */
export function applyKpiScope<T extends KpiRow>(rows: T[], f: KpiScopeFilters = {}): T[] {
  return rows.filter((r) => {
    if (!countsForResult(r.status)) return false;
    if (!unrestricted(f.city) && r.city !== f.city) return false;
    if (!unrestricted(f.categoryId) && r.category_id !== f.categoryId) return false;
    return true;
  });
}

export type KpiDateBase = "payment" | "due";

/**
 * Total realizado (pagos) do período. Base padrão: "payment".
 * Mesma função usada no card do Dashboard e no card do módulo Financeiro.
 */
export function computeRealizedKpis(
  rows: KpiRow[],
  opts: {
    from?: string | null;
    to?: string | null;
    base?: KpiDateBase;
    filters?: KpiScopeFilters;
  } = {}
): RealizedKpis {
  const base: KpiDateBase = opts.base ?? "payment";
  const scoped = applyKpiScope(rows, opts.filters);

  let receitas = 0;
  let despesas = 0;
  let countReceitas = 0;
  let countDespesas = 0;

  for (const r of scoped) {
    if (!isPago(r.status)) continue;
    const ref = base === "payment" ? r.payment_date ?? null : r.due_date || null;
    if (!inDateRange(ref, opts.from, opts.to)) continue;
    if (r.type === "receita") {
      receitas += amountOf(r);
      countReceitas++;
    } else {
      despesas += amountOf(r);
      countDespesas++;
    }
  }

  return {
    receitas,
    despesas,
    saldo: receitas - despesas,
    count: countReceitas + countDespesas,
    countReceitas,
    countDespesas,
  };
}

/** Projeção: SOMENTE pendentes por vencimento no período. Nunca é caixa. */
export function computeForecastKpis(
  rows: KpiRow[],
  opts: { from?: string | null; to?: string | null; filters?: KpiScopeFilters } = {}
): { receitas: number; despesas: number; saldo: number } {
  const scoped = applyKpiScope(rows, opts.filters);
  let receitas = 0;
  let despesas = 0;
  for (const r of scoped) {
    if (!isPendente(r.status)) continue;
    if (!inDateRange(r.due_date || null, opts.from, opts.to)) continue;
    if (r.type === "receita") receitas += amountOf(r);
    else despesas += amountOf(r);
  }
  return { receitas, despesas, saldo: receitas - despesas };
}
