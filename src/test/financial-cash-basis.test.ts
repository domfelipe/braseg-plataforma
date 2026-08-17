import { describe, it, expect } from "vitest";
import { sumRealizedCash, sumForecastByDue, type CashRow } from "@/lib/financialStatus";

const AUG_FROM = "2026-08-01";
const AUG_TO = "2026-08-31";

const rows: CashRow[] = [
  // Recebida em julho, vencimento em agosto — NÃO é caixa de agosto.
  { type: "receita", amount: 742859.46, status: "pago", due_date: "2026-08-05", payment_date: "2026-07-20" },
  // Recebida em agosto — entra no caixa de agosto.
  { type: "receita", amount: 463347.22, status: "pago", due_date: "2026-07-28", payment_date: "2026-08-12" },
  // Despesa paga em agosto.
  { type: "despesa", amount: 467076.25, status: "pago", due_date: "2026-08-10", payment_date: "2026-08-10" },
  // Pendente sem data de pagamento, vence em agosto.
  { type: "despesa", amount: 1000, status: "pendente", due_date: "2026-08-20", payment_date: null },
  // Cancelada — nunca soma.
  { type: "receita", amount: 999999, status: "cancelado", due_date: "2026-08-15", payment_date: "2026-08-15" },
];

describe("caixa realizado por data de pagamento", () => {
  it("pagamento em julho com vencimento em agosto não entra no caixa de agosto", () => {
    const r = sumRealizedCash([rows[0]], AUG_FROM, AUG_TO);
    expect(r.receitas).toBe(0);
    expect(r.saldo).toBe(0);
  });

  it("pagamento em agosto entra no caixa de agosto", () => {
    const r = sumRealizedCash([rows[1]], AUG_FROM, AUG_TO);
    expect(r.receitas).toBeCloseTo(463347.22, 2);
  });

  it("pendente sem payment_date não entra no realizado, mas entra na previsão por vencimento", () => {
    expect(sumRealizedCash([rows[3]], AUG_FROM, AUG_TO).despesas).toBe(0);
    expect(sumForecastByDue([rows[3]], AUG_FROM, AUG_TO).despesas).toBe(1000);
  });

  it("cancelado não entra em nenhum total", () => {
    expect(sumRealizedCash([rows[4]], AUG_FROM, AUG_TO).receitas).toBe(0);
    expect(sumForecastByDue([rows[4]], AUG_FROM, AUG_TO).receitas).toBe(0);
  });

  it("reproduz o recorte ACUDIR de agosto/2026 em base de pagamento", () => {
    const r = sumRealizedCash(rows, AUG_FROM, AUG_TO);
    expect(r.receitas).toBeCloseTo(463347.22, 2);
    expect(r.despesas).toBeCloseTo(467076.25, 2);
    expect(r.saldo).toBeCloseTo(-3729.03, 2);
  });

  it("não faz fallback de due_date para payment_date", () => {
    const semPagamento: CashRow = {
      type: "receita", amount: 500, status: "pago", due_date: "2026-08-05", payment_date: null,
    };
    expect(sumRealizedCash([semPagamento], AUG_FROM, AUG_TO).receitas).toBe(0);
  });
});
