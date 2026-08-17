// Helper: detect duplicate invoices by (company_id, normalized CNPJ, normalized NF number)
// Mirrors the DB-level unique index `professional_payments_unique_nf_per_cnpj`.

export function normalizeCnpj(v: string | null | undefined): string {
  return (v || "").replace(/\D/g, "");
}

export function normalizeNfNumber(v: string | null | undefined): string {
  return (v || "").trim().toUpperCase();
}

export type DuplicateMatch = {
  id: string;
  doctor_name: string | null;
  nf_number: string | null;
  doctor_cnpj: string | null;
  amount: number | null;
  status: string | null;
  payment_date: string | null;
  created_at: string;
};

/**
 * Returns the first existing payment that already has this CNPJ+NF for the company,
 * excluding the current payment row (when updating after AI extraction).
 * Returns null if none.
 */
export async function findDuplicateInvoice(
  supabase: any,
  companyId: string,
  rawCnpj: string | null | undefined,
  rawNfNumber: string | null | undefined,
  excludePaymentId?: string,
): Promise<DuplicateMatch | null> {
  const cnpj = normalizeCnpj(rawCnpj);
  const nf = normalizeNfNumber(rawNfNumber);
  if (!cnpj || !nf) return null;

  // Postgres lacks easy index-usage from PostgREST for the normalized expression,
  // so we fetch candidates by raw nf_number first and filter in JS.
  const { data, error } = await supabase
    .from("professional_payments")
    .select("id, doctor_name, nf_number, doctor_cnpj, amount, status, payment_date, created_at")
    .eq("company_id", companyId)
    .not("doctor_cnpj", "is", null)
    .not("nf_number", "is", null)
    .not("status", "in", "(cancelado,duplicado)")
    .limit(50);

  if (error) {
    console.error("findDuplicateInvoice query error:", error);
    return null;
  }

  for (const row of data || []) {
    if (excludePaymentId && row.id === excludePaymentId) continue;
    if (
      normalizeCnpj(row.doctor_cnpj) === cnpj &&
      normalizeNfNumber(row.nf_number) === nf
    ) {
      return row as DuplicateMatch;
    }
  }
  return null;
}
