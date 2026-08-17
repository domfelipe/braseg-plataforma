import { describe, it, expect } from "vitest";
import { computeRealizedKpis, computeForecastKpis, applyKpiScope } from "@/lib/financialKpis";

const row = (o: Partial<Parameters<typeof computeRealizedKpis>[0][number]>) => ({
  type: "despesa",
  amount: 100,
  status: "pago",
  due_date: "2026-08-10",
  payment_date: "2026-08-10",
  city: "Botucatu",
  category_id: "cat-1",
  ...o,
});

const AUG = { from: "2026-08-01", to: "2026-08-31" };

describe("computeRealizedKpis (fórmula única Dashboard + Financeiro)", () => {
  it("soma somente status pago pela data de pagamento", () => {
    const rows = [
      row({ amount: 1000 }),
      row({ amount: 500, status: "pendente" }),
      row({ amount: 200, status: "cancelado" }),
      row({ amount: 300, payment_date: "2026-07-31" }),
      row({ amount: 400, payment_date: null, due_date: "2026-08-05" }),
    ];
    const k = computeRealizedKpis(rows, AUG);
    expect(k.despesas).toBe(1000);
    expect(k.countDespesas).toBe(1);
    expect(k.receitas).toBe(0);
  });

  it("separa receitas e despesas e calcula o resultado", () => {
    const rows = [row({ type: "receita", amount: 900 }), row({ amount: 400 })];
    const k = computeRealizedKpis(rows, AUG);
    expect(k.receitas).toBe(900);
    expect(k.despesas).toBe(400);
    expect(k.saldo).toBe(500);
  });

  it("base due usa vencimento (competência) e nunca payment_date", () => {
    const rows = [row({ amount: 100, due_date: "2026-08-02", payment_date: "2026-09-03" })];
    expect(computeRealizedKpis(rows, { ...AUG, base: "payment" }).despesas).toBe(0);
    expect(computeRealizedKpis(rows, { ...AUG, base: "due" }).despesas).toBe(100);
  });

  it("não restringe quando cidade/categoria são 'all' e restringe quando explícitas", () => {
    const rows = [row({ amount: 100 }), row({ amount: 70, city: "Marília", category_id: "cat-2" })];
    expect(computeRealizedKpis(rows, { ...AUG, filters: { city: "all", categoryId: "all" } }).despesas).toBe(170);
    expect(computeRealizedKpis(rows, { ...AUG, filters: {} }).despesas).toBe(170);
    expect(computeRealizedKpis(rows, { ...AUG, filters: { city: "Marília" } }).despesas).toBe(70);
    expect(computeRealizedKpis(rows, { ...AUG, filters: { categoryId: "cat-1" } }).despesas).toBe(100);
  });

  it("soma sem arredondamento intermediário", () => {
    const rows = [row({ amount: "0.1" as any }), row({ amount: "0.2" as any })];
    expect(computeRealizedKpis(rows, AUG).despesas).toBeCloseTo(0.3, 10);
  });

  it("Dashboard e FinancialOverview produzem o mesmo total no mesmo conjunto", () => {
    const rows = [
      row({ amount: 926000.05 }),
      row({ amount: 901 }),
      row({ amount: 5000, status: "pendente" }),
    ];
    // Dashboard: sem filtros de cidade/categoria, base padrão payment.
    const dashboard = computeRealizedKpis(rows, { from: AUG.from, to: AUG.to });
    // FinancialOverview: escopo já filtrado por cidade/categoria "all" + base payment.
    const scope = applyKpiScope(rows, { city: "all", categoryId: "all" });
    const overview = computeRealizedKpis(scope, { from: AUG.from, to: AUG.to, base: "payment" });
    expect(overview.despesas).toBe(dashboard.despesas);
    expect(overview.receitas).toBe(dashboard.receitas);
    expect(overview.saldo).toBe(dashboard.saldo);
    expect(dashboard.despesas).toBe(926901.05);
  });
});

describe("computeForecastKpis", () => {
  it("soma somente pendentes por vencimento", () => {
    const rows = [
      row({ amount: 100, status: "pendente", due_date: "2026-08-09" }),
      row({ amount: 999 }),
      row({ amount: 50, status: "pendente", due_date: "2026-09-09" }),
    ];
    expect(computeForecastKpis(rows, AUG).despesas).toBe(100);
  });
});
