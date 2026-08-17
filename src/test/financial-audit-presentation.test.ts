import { describe, it, expect } from "vitest";
import {
  sumRealizedCash,
  sumForecastByDue,
  countPaidWithoutPaymentDate,
  NO_BANK_BALANCE_NOTICE,
  LABEL_PERIOD_RESULT_CASH,
  LABEL_PROJECTED_VARIATION,
  type CashRow,
} from "@/lib/financialStatus";
import { normalizeProfessionalLocation, paymentRefDate } from "@/lib/professionalLocation";
import { countMissingMirrors } from "@/lib/professionalReconciliation";

const FROM = "2026-08-01";
const TO = "2026-08-31";

// Recorte ACUDIR agosto/2026 (valores confirmados no banco).
const acudirAgosto: CashRow[] = [
  { type: "receita", amount: 742859.46, status: "pago", due_date: "2026-08-05", payment_date: "2026-07-20" },
  { type: "receita", amount: 463347.22, status: "pago", due_date: "2026-07-28", payment_date: "2026-08-12" },
  { type: "despesa", amount: 454076.25, status: "pago", due_date: "2026-08-10", payment_date: "2026-08-10" },
  { type: "despesa", amount: 13000.0, status: "pago", due_date: "2026-07-15", payment_date: "2026-08-20" },
  { type: "despesa", amount: 5000, status: "pendente", due_date: "2026-08-25", payment_date: null },
  { type: "receita", amount: 900000, status: "cancelado", due_date: "2026-08-15", payment_date: "2026-08-15" },
];

describe("auditoria de apresentação — caixa vs competência", () => {
  it("a) ACUDIR agosto por pagamento = 463347.22 / 467076.25 / -3729.03", () => {
    const r = sumRealizedCash(acudirAgosto, FROM, TO);
    expect(r.receitas).toBeCloseTo(463347.22, 2);
    expect(r.despesas).toBeCloseTo(467076.25, 2);
    expect(r.saldo).toBeCloseTo(-3729.03, 2);
  });

  it("b) recebimento pago em julho com vencimento em agosto não entra no caixa de agosto", () => {
    expect(sumRealizedCash([acudirAgosto[0]], FROM, TO).receitas).toBe(0);
    // por vencimento ele aparece (competência), o que explica a divergência
    expect(sumForecastByDue([acudirAgosto[0]], FROM, TO).receitas).toBeCloseTo(742859.46, 2);
  });

  it("c) cancelado não entra em caixa nem em previsão", () => {
    expect(sumRealizedCash([acudirAgosto[5]], FROM, TO).receitas).toBe(0);
    expect(sumForecastByDue([acudirAgosto[5]], FROM, TO).receitas).toBe(0);
  });

  it("d) pendente sem payment_date não entra no realizado e entra na previsão", () => {
    expect(sumRealizedCash([acudirAgosto[4]], FROM, TO).despesas).toBe(0);
    expect(sumForecastByDue([acudirAgosto[4]], FROM, TO).despesas).toBe(5000);
  });

  it("pago sem data de pagamento fica em revisão, fora do caixa", () => {
    const row: CashRow = {
      type: "despesa", amount: 100, status: "pago", due_date: "2026-08-03", payment_date: null,
    };
    expect(countPaidWithoutPaymentDate([row])).toBe(1);
    expect(sumRealizedCash([row], FROM, TO).despesas).toBe(0);
  });

  it("rótulos nunca prometem saldo bancário", () => {
    expect(LABEL_PERIOD_RESULT_CASH).toBe("Resultado do período (caixa)");
    expect(LABEL_PROJECTED_VARIATION).toBe("Variação acumulada projetada");
    expect(NO_BANK_BALANCE_NOTICE).toContain("Não representa saldo bancário");
    expect(`${LABEL_PERIOD_RESULT_CASH} ${LABEL_PROJECTED_VARIATION}`.toLowerCase()).not.toContain("saldo");
  });
});

describe("e) PSA e PSF permanecem separados", () => {
  it("normaliza variações sem misturar unidades", () => {
    expect(normalizeProfessionalLocation("Botucatu PSA")).toBe("Botucatu - PSA");
    expect(normalizeProfessionalLocation("botucatu - psf")).toBe("Botucatu - PSF");
    expect(normalizeProfessionalLocation("Botucatu PSA")).not.toBe(
      normalizeProfessionalLocation("Botucatu PSF")
    );
  });

  it("soma por unidade preserva os totais de agosto", () => {
    const rows = [
      { location: "Botucatu PSA", amount: 192922.9 },
      { location: "Botucatu - PSF", amount: 105358.58 },
    ];
    const byUnit: Record<string, number> = {};
    rows.forEach((r) => {
      const key = normalizeProfessionalLocation(r.location) || "Sem local";
      byUnit[key] = (byUnit[key] || 0) + r.amount;
    });
    expect(byUnit["Botucatu - PSA"]).toBeCloseTo(192922.9, 2);
    expect(byUnit["Botucatu - PSF"]).toBeCloseTo(105358.58, 2);
    expect(Object.keys(byUnit)).toHaveLength(2);
  });
});

describe("f) linha financeira sem source_payment_id não é espelho médico", () => {
  // Composição real de julho/2026 — Botucatu - PSF.
  const txs = [
    { amount: 344355.01, source_payment_id: "pp-1" }, // espelho do módulo médico
    { amount: 562.15, source_payment_id: null }, // impostos retidos
    { amount: 6000.0, source_payment_id: null }, // impostos retidos
    { amount: 17425.0, source_payment_id: null }, // impostos retidos
    { amount: 17425.0, source_payment_id: null }, // impostos retidos
    { amount: 6000.0, source_payment_id: null }, // Dra. Ana Maria
    { amount: 752.74, source_payment_id: null }, // Escritório Ventura
  ];

  it("separa espelhados de origem financeira não médica sem duplicar", () => {
    let mirrored = 0, unlinked = 0;
    txs.forEach((t) => (t.source_payment_id ? (mirrored += t.amount) : (unlinked += t.amount)));
    expect(mirrored).toBeCloseTo(344355.01, 2);
    expect(unlinked).toBeCloseTo(48164.89, 2);
    expect(mirrored + unlinked).toBeCloseTo(392519.9, 2);
  });

  it("countMissingMirrors ignora linhas sem source_payment_id", () => {
    const r = countMissingMirrors(
      ["pp-1"],
      txs.map((t) => t.source_payment_id)
    );
    expect(r).toEqual({ expected: 1, present: 1, missing: 0, missingIds: [] });
  });
});


describe("base de data explícita em Pagamentos", () => {
  const row = {
    payment_date: "2026-08-12",
    nf_issue_date: "2026-07-30",
    created_at: "2026-08-01T10:00:00Z",
  };

  it("created_at nunca é usado como data de pagamento", () => {
    expect(paymentRefDate(row, "payment")).toBe("2026-08-12");
    expect(paymentRefDate(row, "issue")).toBe("2026-07-30");
    expect(paymentRefDate(row, "created")).toBe("2026-08-01");
    expect(paymentRefDate({ ...row, payment_date: null }, "payment")).toBeNull();
  });
});
