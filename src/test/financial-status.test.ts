import { describe, it, expect } from "vitest";
import {
  isPago,
  isPendente,
  isCancelado,
  countsForResult,
  refDateForBase,
  inDateRange,
  countMissingPaymentDate,
  dateBaseLabel,
  TX_STATUS_OPTIONS,
} from "@/lib/financialStatus";

describe("status canônicos", () => {
  it("reconhece pago/pendente/cancelado do banco", () => {
    expect(isPago("pago")).toBe(true);
    expect(isPendente("pendente")).toBe(true);
    expect(isCancelado("cancelado")).toBe(true);
  });

  it("não reconhece os literais antigos incorretos", () => {
    expect(isPago("paga")).toBe(false);
    expect(isCancelado("cancelada")).toBe(false);
  });

  it("tolera espaços e caixa alta", () => {
    expect(isPago(" PAGO ")).toBe(true);
  });

  it("cancelado não entra em DRE/caixa", () => {
    expect(countsForResult("pago")).toBe(true);
    expect(countsForResult("pendente")).toBe(true);
    expect(countsForResult("cancelado")).toBe(false);
  });

  it("expõe apenas as opções existentes no banco", () => {
    expect(TX_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      "pendente",
      "pago",
      "cancelado",
    ]);
  });
});

describe("base de data", () => {
  const row = {
    due_date: "2026-08-10",
    payment_date: "2026-08-15",
    created_at: "2026-08-01T12:00:00Z",
  };

  it("resolve a data de referência por base", () => {
    expect(refDateForBase(row, "due")).toBe("2026-08-10");
    expect(refDateForBase(row, "payment")).toBe("2026-08-15");
    expect(refDateForBase(row, "created")).toBe("2026-08-01");
    expect(refDateForBase(row)).toBe("2026-08-15");
  });

  it("não faz fallback silencioso de payment para due", () => {
    expect(refDateForBase({ due_date: "2026-08-10", payment_date: null }, "payment")).toBeNull();
  });

  it("compara intervalo de forma inclusiva e exclui sem data", () => {
    expect(inDateRange("2026-08-10", "2026-08-01", "2026-08-31")).toBe(true);
    expect(inDateRange("2026-08-01", "2026-08-01", "2026-08-31")).toBe(true);
    expect(inDateRange("2026-09-01", "2026-08-01", "2026-08-31")).toBe(false);
    expect(inDateRange(null, "2026-08-01", "2026-08-31")).toBe(false);
  });

  it("conta linhas sem data de pagamento", () => {
    expect(
      countMissingPaymentDate([
        { due_date: "2026-08-01", payment_date: "2026-08-02" },
        { due_date: "2026-08-03", payment_date: null },
        { due_date: "2026-08-04" },
      ])
    ).toBe(2);
  });

  it("rotula a base ativa em português", () => {
    expect(dateBaseLabel("due")).toBe("vencimento");
    expect(dateBaseLabel("payment")).toBe("pagamento");
    expect(dateBaseLabel("created")).toBe("importação");
  });
});
