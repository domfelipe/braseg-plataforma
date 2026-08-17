import { describe, it, expect } from "vitest";
import {
  COMPANY_IDS,
  resolveCanonicalCity,
  normalizeCityKey,
  getContractCities,
} from "../../supabase/functions/_shared/company-city-contract";

const ok = (companyId: string, city: string) => {
  const r = resolveCanonicalCity(companyId, city);
  expect(r.ok).toBe(true);
  return r.ok ? r.city : "";
};

const fail = (companyId: unknown, city: unknown) => {
  const r = resolveCanonicalCity(companyId, city);
  expect(r).toEqual({ ok: false, reason: "invalid_company_or_city" });
};

describe("normalizeCityKey", () => {
  it("ignores accents, case, punctuation and duplicated spaces", () => {
    expect(normalizeCityKey("  Escritório   Lençóis. ")).toBe("ESCRITORIO LENCOIS");
    expect(normalizeCityKey("METRÔ")).toBe("METRO");
    expect(normalizeCityKey("")).toBe("");
  });
});

describe("accepted company + city pairs", () => {
  it("ACUDIR", () => {
    expect(ok(COMPANY_IDS.ACUDIR, "botucatu")).toBe("Botucatu");
    expect(ok(COMPANY_IDS.ACUDIR, "IGARASSU")).toBe("Igarassu");
    expect(ok(COMPANY_IDS.ACUDIR, "Igaraçu")).toBe("Igarassu");
    expect(ok(COMPANY_IDS.ACUDIR, "igaracu do tiete")).toBe("Igarassu");
    expect(ok(COMPANY_IDS.ACUDIR, "escritorio lencois")).toBe("Escritório Lençóis");
    expect(ok(COMPANY_IDS.ACUDIR, "Marilia")).toBe("Marília");
    expect(ok(COMPANY_IDS.ACUDIR, "mineiros do tietê")).toBe("Mineiros");
  });

  it("FORTE", () => {
    expect(ok(COMPANY_IDS.FORTE, "Botucatu")).toBe("Botucatu");
    expect(ok(COMPANY_IDS.FORTE, "campos")).toBe("Campos");
    expect(ok(COMPANY_IDS.FORTE, "ribeirao")).toBe("Ribeirão");
    expect(ok(COMPANY_IDS.FORTE, "ubs")).toBe("UBS");
    expect(ok(COMPANY_IDS.FORTE, "BS")).toBe("UBS");
    expect(ok(COMPANY_IDS.FORTE, "Supera")).toBe("Supera");
  });

  it("ROVERSI, SMG, VGAF", () => {
    expect(ok(COMPANY_IDS.ROVERSI, "itatinga")).toBe("Itatinga");
    expect(ok(COMPANY_IDS.SMG, "metro")).toBe("Metrô");
    expect(ok(COMPANY_IDS.SMG, "METRÔ")).toBe("Metrô");
    expect(ok(COMPANY_IDS.VGAF, "lencois paulista")).toBe("Lençóis Paulista");
  });
});

describe("rejected pairs", () => {
  it("missing company", () => {
    fail(null, "Botucatu");
    fail("", "Botucatu");
    fail("not-a-company", "Botucatu");
  });

  it("missing city", () => {
    fail(COMPANY_IDS.ACUDIR, null);
    fail(COMPANY_IDS.ACUDIR, "   ");
  });

  it("city belonging to another company", () => {
    fail(COMPANY_IDS.ACUDIR, "Metrô");
    fail(COMPANY_IDS.VGAF, "Botucatu");
    fail(COMPANY_IDS.ROVERSI, "UBS");
    fail(COMPANY_IDS.SMG, "Campos");
  });

  it("invented / ambiguous / conflicting input", () => {
    fail(COMPANY_IDS.ACUDIR, "Botucatu PSA");
    fail(COMPANY_IDS.ACUDIR, "Botuc");
    fail(COMPANY_IDS.FORTE, "Campos Botucatu");
    fail(COMPANY_IDS.ACUDIR, "Acudir Botucatu / Forte Campos");
  });
});

describe("contract shape", () => {
  it("VGAF has a single canonical city", () => {
    expect(getContractCities(COMPANY_IDS.VGAF)).toEqual(["Lençóis Paulista"]);
  });
});
