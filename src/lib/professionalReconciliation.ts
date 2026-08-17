/**
 * Conciliação somente leitura entre a categoria financeira "Pagamentos de
 * Profissionais" (financial_transactions) e o módulo de pagamentos médicos
 * (professional_payments, espelhado por source_payment_id).
 *
 * Regras:
 *  - nada aqui altera dados: são funções puras de apresentação/auditoria;
 *  - a soma é conservada: espelhados + sem vínculo === total da categoria;
 *  - status "cancelado" nunca entra nos totais;
 *  - a data de referência vem da base ativa, sem fallback silencioso.
 */

import {
  countsForResult,
  inDateRange,
  refDateForBase,
  type DateBasedRow,
  type FinancialDateBaseValue,
} from "./financialStatus";

/** Nome canônico da categoria de pagamentos a profissionais. */
export const PROFESSIONAL_CATEGORY_NAME = "Pagamentos de Profissionais";

export const DRE_LABEL_MIRRORED = "Profissionais — espelhados";
export const DRE_LABEL_UNLINKED = "Pagamentos a pessoas — sem vínculo";

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/** Reconhece a categoria de pagamentos a profissionais por nome normalizado. */
export function isProfessionalPaymentsCategory(name: string | null | undefined) {
  return norm(name) === norm(PROFESSIONAL_CATEGORY_NAME);
}

export interface ReconciliationRow extends DateBasedRow {
  amount: number;
  status: string;
  source_payment_id?: string | null;
  category_id?: string | null;
}

export interface ReconciliationPart {
  count: number;
  amount: number;
}

export interface ReconciliationSummary {
  total: ReconciliationPart;
  mirrored: ReconciliationPart;
  unlinked: ReconciliationPart;
  /** Deve ser sempre 0 — conservação monetária. */
  conservationDiff: number;
  /** Linhas canceladas descartadas do total. */
  excludedCanceled: number;
  /** Linhas sem data de referência sob a base ativa (fora do período). */
  excludedNoRefDate: number;
}

const EPSILON = 0.005;

/**
 * Resume as linhas da categoria de profissionais dentro do período, separando o
 * que já está espelhado em professional_payments do que ainda não tem vínculo.
 */
export function summarizeProfessionalCategory(
  rows: ReconciliationRow[],
  options: {
    base?: FinancialDateBaseValue;
    from?: string | null;
    to?: string | null;
  } = {}
): ReconciliationSummary {
  const { base, from, to } = options;

  let excludedNoRefDate = 0;
  const inPeriod = rows.filter((r) => {
    const ref = refDateForBase(r, base);
    if (!ref) {
      excludedNoRefDate++;
      return false;
    }
    return inDateRange(ref, from, to);
  });

  const counted = inPeriod.filter((r) => countsForResult(r.status));
  const excludedCanceled = inPeriod.length - counted.length;

  const mirrored: ReconciliationPart = { count: 0, amount: 0 };
  const unlinked: ReconciliationPart = { count: 0, amount: 0 };

  counted.forEach((r) => {
    const target = r.source_payment_id ? mirrored : unlinked;
    target.count++;
    target.amount += r.amount;
  });

  const total: ReconciliationPart = {
    count: mirrored.count + unlinked.count,
    amount: mirrored.amount + unlinked.amount,
  };

  const diff = total.amount - (mirrored.amount + unlinked.amount);

  return {
    total,
    mirrored,
    unlinked,
    conservationDiff: Math.abs(diff) < EPSILON ? 0 : diff,
    excludedCanceled,
    excludedNoRefDate,
  };
}

/**
 * Espelhos faltantes: pagamentos pagos do módulo sem linha correspondente em
 * financial_transactions. Agregação 1:1 por source_payment_id (set), nunca join
 * 1:N.
 */
export function countMissingMirrors(
  paidPaymentIds: string[],
  mirrorSourcePaymentIds: (string | null | undefined)[]
): { expected: number; present: number; missing: number; missingIds: string[] } {
  const expected = new Set(paidPaymentIds);
  const present = new Set(
    mirrorSourcePaymentIds.filter((id): id is string => !!id && expected.has(id))
  );
  const missingIds = Array.from(expected).filter((id) => !present.has(id));
  return {
    expected: expected.size,
    present: present.size,
    missing: missingIds.length,
    missingIds,
  };
}
