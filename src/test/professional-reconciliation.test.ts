import { describe, it, expect } from "vitest";
import {
  isProfessionalPaymentsCategory,
  summarizeProfessionalCategory,
  countMissingMirrors,
  type ReconciliationRow,
} from "@/lib/professionalReconciliation";

const row = (o: Partial<ReconciliationRow>): ReconciliationRow => ({
  amount: 100,
  status: "pago",
  due_date: "2026-08-10",
  payment_date: "2026-08-12",
  source_payment_id: null,
  category_id: "cat-prof",
  ...o,
});

describe("categoria de profissionais", () => {
  it("reconhece o nome com e sem acento/caixa", () => {
    expect(isProfessionalPaymentsCategory("Pagamentos de Profissionais")).toBe(true);
    expect(isProfessionalPaymentsCategory(" pagamentos de profissionais ")).toBe(true);
    expect(isProfessionalPaymentsCategory("Pagamentos de Profissionais ")).toBe(true);
    expect(isProfessionalPaymentsCategory("Diárias/Hospedagem")).toBe(false);
    expect(isProfessionalPaymentsCategory(null)).toBe(false);
  });
});

describe("conservação da soma", () => {
  const rows = [
    row({ amount: 1234.56, source_payment_id: "pp-1" }),
    row({ amount: 500.44, source_payment_id: "pp-2" }),
    row({ amount: 300.1 }),
    row({ amount: 99.9 }),
  ];

  it("espelhados + sem vínculo === total da categoria", () => {
    const s = summarizeProfessionalCategory(rows, {
      base: "due",
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(s.mirrored.count).toBe(2);
    expect(s.unlinked.count).toBe(2);
    expect(s.total.count).toBe(4);
    expect(s.mirrored.amount + s.unlinked.amount).toBeCloseTo(s.total.amount, 2);
    expect(s.total.amount).toBeCloseTo(2135, 2);
    expect(s.conservationDiff).toBe(0);
  });

  it("mantém a conservação com apenas uma das parcelas", () => {
    const s = summarizeProfessionalCategory([row({ amount: 10, source_payment_id: "pp-9" })], {
      base: "due",
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(s.unlinked).toEqual({ count: 0, amount: 0 });
    expect(s.total.amount).toBe(10);
    expect(s.conservationDiff).toBe(0);
  });
});

describe("status e base de data", () => {
  it("cancelado fica fora dos totais", () => {
    const s = summarizeProfessionalCategory(
      [
        row({ amount: 100, status: "pago", source_payment_id: "pp-1" }),
        row({ amount: 900, status: "cancelado" }),
        row({ amount: 50, status: "pendente" }),
      ],
      { base: "due", from: "2026-08-01", to: "2026-08-31" }
    );
    expect(s.excludedCanceled).toBe(1);
    expect(s.total.amount).toBeCloseTo(150, 2);
    expect(s.unlinked.amount).toBeCloseTo(50, 2);
  });

  it("base pagamento sem payment_date não entra no período", () => {
    const s = summarizeProfessionalCategory(
      [
        row({ amount: 100, payment_date: "2026-08-12", source_payment_id: "pp-1" }),
        row({ amount: 700, payment_date: null }),
      ],
      { base: "payment", from: "2026-08-01", to: "2026-08-31" }
    );
    expect(s.excludedNoRefDate).toBe(1);
    expect(s.total.count).toBe(1);
    expect(s.total.amount).toBeCloseTo(100, 2);
  });

  it("não faz fallback de payment_date para due_date", () => {
    const s = summarizeProfessionalCategory(
      [row({ amount: 100, due_date: "2026-08-10", payment_date: null })],
      { base: "payment", from: "2026-08-01", to: "2026-08-31" }
    );
    expect(s.total.amount).toBe(0);
  });
});

describe("espelhos faltantes", () => {
  it("0 faltantes quando a contagem está 1:1", () => {
    const r = countMissingMirrors(["a", "b", "c"], ["a", "b", "c"]);
    expect(r).toEqual({ expected: 3, present: 3, missing: 0, missingIds: [] });
  });

  it("detecta espelho ausente sem multiplicar por duplicatas de leitura", () => {
    const r = countMissingMirrors(["a", "b", "c"], ["a", "a", "b", null, "x"]);
    expect(r.expected).toBe(3);
    expect(r.present).toBe(2);
    expect(r.missing).toBe(1);
    expect(r.missingIds).toEqual(["c"]);
  });
});
