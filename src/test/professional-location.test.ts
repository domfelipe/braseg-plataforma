import { describe, it, expect } from "vitest";
import {
  normalizeProfessionalLocation,
  summarizeMissingReceipts,
} from "@/lib/professionalLocation";

describe("normalizeProfessionalLocation", () => {
  it("normaliza aliases de PSA", () => {
    for (const v of [
      "Botucatu PSA",
      "Botucatu - PSA",
      "botucatu psa",
      "  BOTUCATU   -   psa ",
      "Botucatu-PSA",
      "Botucatú PSA",
    ]) {
      expect(normalizeProfessionalLocation(v)).toBe("Botucatu - PSA");
    }
  });

  it("normaliza aliases de PSF", () => {
    for (const v of ["Botucatu PSF", "Botucatu - PSF", "botucatu-psf", " BOTUCATU  PSF "]) {
      expect(normalizeProfessionalLocation(v)).toBe("Botucatu - PSF");
    }
  });

  it("preserva outros locais e null", () => {
    expect(normalizeProfessionalLocation("Igaraçu do Tietê")).toBe("Igaraçu do Tietê");
    expect(normalizeProfessionalLocation("  Valinhos ")).toBe("Valinhos");
    expect(normalizeProfessionalLocation("Botucatu Campos Futebol")).toBe("Botucatu Campos Futebol");
    expect(normalizeProfessionalLocation(null)).toBeNull();
    expect(normalizeProfessionalLocation(undefined)).toBeNull();
    expect(normalizeProfessionalLocation("   ")).toBeNull();
  });

  it("agrupa aliases sob o nome canônico", () => {
    const rows = [
      { location: "Botucatu PSA", amount: 100 },
      { location: "Botucatu - PSA", amount: 50 },
      { location: "botucatu psf", amount: 25 },
      { location: null as string | null, amount: 10 },
    ];
    const grouped: Record<string, number> = {};
    rows.forEach((r) => {
      const key = normalizeProfessionalLocation(r.location) || "Sem local";
      grouped[key] = (grouped[key] || 0) + r.amount;
    });
    expect(grouped).toEqual({
      "Botucatu - PSA": 150,
      "Botucatu - PSF": 25,
      "Sem local": 10,
    });
    expect(Object.keys(grouped).length).toBe(3);
  });
});

describe("summarizeMissingReceipts", () => {
  it("conta apenas pagos sem receipt_url", () => {
    const s = summarizeMissingReceipts([
      { status: "pago", receipt_url: null, amount: 100 },
      { status: "pago", receipt_url: "   ", amount: 40 },
      { status: "pago", receipt_url: "https://x/r.pdf", amount: 500 },
      { status: "aguardando_pagamento", receipt_url: null, amount: 999 },
    ]);
    expect(s).toEqual({ count: 2, amount: 140 });
  });

  it("retorna zero quando todos têm comprovante", () => {
    expect(
      summarizeMissingReceipts([{ status: "pago", receipt_url: "u", amount: 10 }])
    ).toEqual({ count: 0, amount: 0 });
  });
});
