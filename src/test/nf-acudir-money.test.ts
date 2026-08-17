import { describe, it, expect } from "vitest";
import {
  normalizeMoneyValue,
  normalizeExtractedMoneyFields,
  buildAmountAudit,
} from "../../supabase/functions/_shared/nf-acudir-extraction.ts";

describe("normalizeMoneyValue", () => {
  const cases: Array<[any, number | null]> = [
    [1234.56, 1234.56],
    ["1234.56", 1234.56],
    ["1234,56", 1234.56],
    ["1.234,56", 1234.56],
    ["R$ 1.234,56", 1234.56],
    ["R$1.234,56", 1234.56],
    ["1.234", 1234],
    ["1,234.56", 1234.56],
    ["", null],
    ["abc", null],
    [null, null],
    [undefined, null],
    [0, 0],
    ["0", 0],
    ["R$ 0,00", 0],
  ];
  for (const [input, expected] of cases) {
    it(`normaliza ${JSON.stringify(input)} -> ${expected}`, () => {
      expect(normalizeMoneyValue(input)).toBe(expected);
    });
  }
});

describe("normalizeExtractedMoneyFields", () => {
  it("converte amount string para number", () => {
    const obj: any = { amount: "R$ 1.234,56" };
    normalizeExtractedMoneyFields(obj);
    expect(obj.amount).toBe(1234.56);
  });

  it("converte impostos_retidos em string para number, default 0", () => {
    const obj: any = { impostos_retidos: { iss: "50,00", irrf: "abc", inss: 10 } };
    normalizeExtractedMoneyFields(obj);
    expect(obj.impostos_retidos.iss).toBe(50);
    expect(obj.impostos_retidos.irrf).toBe(0);
    expect(obj.impostos_retidos.inss).toBe(10);
  });

  it("converte plantoes[].valor e .horas string para number", () => {
    const obj: any = {
      descricao: { plantoes: [{ valor: "R$ 800,00", horas: "12" }, { valor: 400, horas: 6 }] },
    };
    normalizeExtractedMoneyFields(obj);
    expect(obj.descricao.plantoes[0].valor).toBe(800);
    expect(obj.descricao.plantoes[0].horas).toBe(12);
    expect(obj.descricao.plantoes[1].valor).toBe(400);
  });
});

describe("buildAmountAudit", () => {
  it("bruto 1000 / impostos 0 / amount 1000 → consistent true", () => {
    const a = buildAmountAudit({ amount: 1000, valor_bruto_servicos: 1000, impostos_retidos: {} });
    expect(a.consistent).toBe(true);
    expect(a.expected_amount).toBe(1000);
    expect(a.difference).toBe(0);
  });

  it("bruto 1000 / iss 50 retido / amount 950 → consistent true", () => {
    const a = buildAmountAudit({
      amount: 950,
      valor_bruto_servicos: 1000,
      impostos_retidos: { iss: 50 },
    });
    expect(a.consistent).toBe(true);
    expect(a.expected_amount).toBe(950);
    expect(a.total_impostos_retidos).toBe(50);
  });

  it("bruto 1000 / impostos 0 / amount 950 → consistent false", () => {
    const a = buildAmountAudit({ amount: 950, valor_bruto_servicos: 1000, impostos_retidos: {} });
    expect(a.consistent).toBe(false);
    expect(a.difference).toBe(-50);
  });

  it("dados insuficientes → consistent null", () => {
    const a = buildAmountAudit({ amount: 950 });
    expect(a.consistent).toBe(null);
    expect(a.expected_amount).toBe(null);
  });
});
