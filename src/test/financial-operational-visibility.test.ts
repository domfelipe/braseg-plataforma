import { describe, it, expect } from "vitest";
import {
  operationalRefDate,
  inDateRange,
  sumRealizedCash,
  sumForecastByDue,
  type CashRow,
} from "@/lib/financialStatus";

const AUG_FROM = "2026-08-01";
const AUG_TO = "2026-08-31";

const pendenteSemPagamento: CashRow = {
  type: "despesa",
  amount: 1500,
  status: "pendente",
  due_date: "2026-08-20",
  payment_date: null,
};

const pagoEmAgosto: CashRow = {
  type: "receita",
  amount: 2000,
  status: "pago",
  due_date: "2026-07-28",
  payment_date: "2026-08-12",
};

const pagoSemDataPagamento: CashRow = {
  type: "despesa",
  amount: 700,
  status: "pago",
  due_date: "2026-08-09",
  payment_date: null,
};

const canceladoAgosto: CashRow = {
  type: "receita",
  amount: 9999,
  status: "cancelado",
  due_date: "2026-08-15",
  payment_date: "2026-08-15",
};

const visivel = (r: CashRow) =>
  inDateRange(operationalRefDate(r, "payment"), AUG_FROM, AUG_TO);

describe("visibilidade operacional na base pagamento", () => {
  it("pendente sem payment_date permanece visível pelo due_date", () => {
    expect(operationalRefDate(pendenteSemPagamento, "payment")).toBe("2026-08-20");
    expect(visivel(pendenteSemPagamento)).toBe(true);
  });

  it("pendente sem payment_date fica zero no realizado e entra só na previsão", () => {
    expect(sumRealizedCash([pendenteSemPagamento], AUG_FROM, AUG_TO).despesas).toBe(0);
    expect(sumForecastByDue([pendenteSemPagamento], AUG_FROM, AUG_TO).despesas).toBe(1500);
  });

  it("pago com payment_date usa a data de pagamento como referência operacional", () => {
    expect(operationalRefDate(pagoEmAgosto, "payment")).toBe("2026-08-12");
    expect(visivel(pagoEmAgosto)).toBe(true);
    expect(sumRealizedCash([pagoEmAgosto], AUG_FROM, AUG_TO).receitas).toBe(2000);
  });

  it("pago em julho com vencimento em agosto não aparece no recorte de caixa de agosto", () => {
    const pagoJulho: CashRow = {
      type: "receita",
      amount: 5000,
      status: "pago",
      due_date: "2026-08-05",
      payment_date: "2026-07-20",
    };
    expect(operationalRefDate(pagoJulho, "payment")).toBe("2026-07-20");
    expect(visivel(pagoJulho)).toBe(false);
    expect(sumRealizedCash([pagoJulho], AUG_FROM, AUG_TO).receitas).toBe(0);
  });

  it("pago sem payment_date continua visível pelo vencimento para correção, sem entrar no caixa", () => {
    expect(operationalRefDate(pagoSemDataPagamento, "payment")).toBe("2026-08-09");
    expect(visivel(pagoSemDataPagamento)).toBe(true);
    expect(sumRealizedCash([pagoSemDataPagamento], AUG_FROM, AUG_TO).despesas).toBe(0);
  });

  it("cancelado visível no recorte não soma em realizado nem previsão", () => {
    expect(visivel(canceladoAgosto)).toBe(true);
    expect(sumRealizedCash([canceladoAgosto], AUG_FROM, AUG_TO).receitas).toBe(0);
    expect(sumForecastByDue([canceladoAgosto], AUG_FROM, AUG_TO).receitas).toBe(0);
  });

  it("na base vencimento a referência operacional é sempre o due_date", () => {
    expect(operationalRefDate(pagoEmAgosto, "due")).toBe("2026-07-28");
    expect(operationalRefDate(pendenteSemPagamento, "due")).toBe("2026-08-20");
  });
});
