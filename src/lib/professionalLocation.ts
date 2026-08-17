/**
 * Normalização canônica de locais de pagamentos de profissionais.
 *
 * Somente leitura/apresentação e entrada: não altera valores, status ou datas.
 * Regras restritas às unidades de Botucatu, que historicamente entraram com
 * variações ("Botucatu PSA" x "Botucatu - PSA").
 */

const CANONICAL_BOTUCATU = {
  psa: "Botucatu - PSA",
  psf: "Botucatu - PSF",
} as const;

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s\-–—_]+/g, " ")
    .trim();
}

/**
 * Retorna o nome canônico do local.
 * - variações de "Botucatu PSA"/"Botucatu - PSA" => "Botucatu - PSA"
 * - variações de "Botucatu PSF"/"Botucatu - PSF" => "Botucatu - PSF"
 * - outros locais: preservados (apenas trim)
 * - null/undefined/vazio => null
 */
export function normalizeProfessionalLocation(
  value: string | null | undefined
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const folded = fold(trimmed);
  if (folded === "botucatu psa") return CANONICAL_BOTUCATU.psa;
  if (folded === "botucatu psf") return CANONICAL_BOTUCATU.psf;
  return trimmed;
}

export interface MissingReceiptRow {
  status: string;
  receipt_url?: string | null;
  amount: number;
}

export interface MissingReceiptSummary {
  count: number;
  amount: number;
}

/**
 * Conta pagamentos com status "pago" sem comprovante (receipt_url).
 * Somente indicador: não remove nada dos totais nem altera status.
 */
export function summarizeMissingReceipts(
  rows: MissingReceiptRow[],
  paidStatus = "pago"
): MissingReceiptSummary {
  return rows.reduce<MissingReceiptSummary>(
    (acc, r) => {
      const hasReceipt = !!(r.receipt_url && r.receipt_url.trim() !== "");
      if (r.status === paidStatus && !hasReceipt) {
        acc.count++;
        acc.amount += r.amount;
      }
      return acc;
    },
    { count: 0, amount: 0 }
  );
}

/** Bases de data explícitas da tela de Pagamentos. */
export type PaymentDateBase = "payment" | "issue" | "created";

export const PAYMENT_DATE_BASE_OPTIONS: { value: PaymentDateBase; label: string }[] = [
  { value: "payment", label: "Data de pagamento" },
  { value: "issue", label: "Emissão da NF" },
  { value: "created", label: "Importação" },
];

export interface PaymentDateRow {
  payment_date?: string | null;
  nf_issue_date?: string | null;
  created_at?: string | null;
}

/**
 * Data de referência (YYYY-MM-DD) do pagamento sob a base escolhida.
 * Nunca usa created_at como se fosse data de pagamento.
 */
export function paymentRefDate(
  row: PaymentDateRow,
  base: PaymentDateBase = "payment"
): string | null {
  if (base === "payment") return row.payment_date || null;
  if (base === "issue") return row.nf_issue_date || null;
  return row.created_at ? row.created_at.slice(0, 10) : null;
}
