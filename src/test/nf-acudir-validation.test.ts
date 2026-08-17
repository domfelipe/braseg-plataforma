import { describe, it, expect } from "vitest";
import { applyDeterministicFallbacks } from "../../supabase/functions/_shared/nf-acudir-extraction.ts";
import { buildInvoiceValidation } from "../../supabase/functions/_shared/nf-acudir-validation.ts";
import { SCENARIOS } from "../../supabase/functions/_shared/nf-acudir-test-mocks.ts";

function run(scenario: any) {
  const ext = applyDeterministicFallbacks(scenario);
  return buildInvoiceValidation(ext);
}

describe("buildInvoiceValidation - cenários válidos", () => {
  it("PSA Botucatu com razão social como fallback", () => {
    const r = run(SCENARIOS.psa());
    expect(r.validation_status).toBe("valida");
    expect(r.validation_issues).toEqual([]);
    expect(r.validation_data.descricao.local_identificado).toBe("Botucatu PSA");
    expect(r.validation_warnings.some((w) => /razão social/i.test(w))).toBe(true);
  });

  it("UBS -> Botucatu PSF", () => {
    const r = run(SCENARIOS.ubs());
    expect(r.validation_status).toBe("valida");
    expect(r.validation_data.descricao.local_identificado).toBe("Botucatu PSF");
  });

  it("USF -> Botucatu PSF", () => {
    const r = run(SCENARIOS.usf());
    expect(r.validation_data.descricao.local_identificado).toBe("Botucatu PSF");
  });

  it("ESF -> Botucatu PSF", () => {
    const r = run(SCENARIOS.esf());
    expect(r.validation_data.descricao.local_identificado).toBe("Botucatu PSF");
  });

  it("Mineiros do Tiete -> Mineiros do Tietê", () => {
    const r = run(SCENARIOS.mineiros());
    expect(r.validation_data.descricao.local_identificado).toBe("Mineiros do Tietê");
  });

  it("Igaracu do Tiete -> Igaraçu do Tietê", () => {
    const r = run(SCENARIOS.igaracu());
    expect(r.validation_data.descricao.local_identificado).toBe("Igaraçu do Tietê");
  });

  it("Apenas 'Botucatu' -> local null + warning, mas válida", () => {
    const r = run(SCENARIOS.botucatuOnly());
    expect(r.validation_status).toBe("valida");
    expect(r.validation_issues).toEqual([]);
    expect(r.validation_data.descricao.local_identificado).toBeNull();
    expect(r.validation_warnings.some((w) => /Local de execução não identificado|Botucatu/i.test(w))).toBe(true);
  });

  it("Sem CRM e sem PIX -> válida com warnings", () => {
    const r = run(SCENARIOS.semCrmSemPix());
    expect(r.validation_status).toBe("valida");
    expect(r.validation_issues).toEqual([]);
    expect(r.validation_warnings.some((w) => /CRM/i.test(w))).toBe(true);
    expect(r.validation_warnings.some((w) => /PIX/i.test(w))).toBe(true);
  });

  it("Razão social como nome do médico", () => {
    const r = run(SCENARIOS.razaoSocialFallback());
    expect(r.validation_status).toBe("valida");
    expect(r.validation_issues).toEqual([]);
    expect(r.validation_data.validacao.usou_razao_social_como_nome_medico).toBe(true);
  });
});

describe("buildInvoiceValidation - cenários bloqueantes", () => {
  it("Tomador errado", () => {
    const r = run(SCENARIOS.tomadorErrado());
    expect(r.validation_status).toBe("invalida");
    expect(r.validation_issues.some((i) => /tomador/i.test(i))).toBe(true);
  });

  it("Tomador ausente", () => {
    const r = run(SCENARIOS.tomadorAusente());
    expect(r.validation_status).toBe("invalida");
    expect(r.validation_issues.some((i) => /tomador/i.test(i))).toBe(true);
  });

  it("Amount ausente", () => {
    const r = run(SCENARIOS.amountAusente());
    expect(r.validation_status).toBe("invalida");
    expect(r.validation_issues.some((i) => /amount/i.test(i))).toBe(true);
  });

  it("doctor_cnpj ausente", () => {
    const r = run(SCENARIOS.doctorCnpjAusente());
    expect(r.validation_status).toBe("invalida");
    expect(r.validation_issues.some((i) => /doctor_cnpj/i.test(i))).toBe(true);
  });

  it("nf_number ausente", () => {
    const r = run(SCENARIOS.nfNumberAusente());
    expect(r.validation_status).toBe("invalida");
    expect(r.validation_issues.some((i) => /nf_number/i.test(i))).toBe(true);
  });

  it("nf_issue_date ausente", () => {
    const r = run(SCENARIOS.nfIssueDateAusente());
    expect(r.validation_status).toBe("invalida");
    expect(r.validation_issues.some((i) => /nf_issue_date/i.test(i))).toBe(true);
  });
});

describe("buildInvoiceValidation - dedup de warnings", () => {
  it("não duplica alerta repetido entre AI e validação", () => {
    const ext = SCENARIOS.botucatuOnly();
    ext.validacao = { alertas: ["CRM do médico não encontrado.", "CRM do médico não encontrado."] };
    const r = buildInvoiceValidation(applyDeterministicFallbacks(ext));
    const occurrences = r.validation_data.validacao.alertas.filter(
      (a: string) => a === "CRM do médico não encontrado.",
    ).length;
    expect(occurrences).toBe(1);
  });
});

describe("shape final esperado pelas Edge Functions", () => {
  it("expõe os campos consumidos por receive-invoice / upload-nota-fiscal / analyze-nf", () => {
    const r = run(SCENARIOS.psa());
    expect(r).toHaveProperty("validation_status");
    expect(r).toHaveProperty("validation_issues");
    expect(r).toHaveProperty("validation_warnings");
    expect(r).toHaveProperty("validation_data");
    expect(["valida", "invalida"]).toContain(r.validation_status);
    expect(Array.isArray(r.validation_issues)).toBe(true);
    expect(Array.isArray(r.validation_warnings)).toBe(true);
    expect(r.validation_data.validacao).toBeDefined();
    expect(Array.isArray(r.validation_data.validacao.alertas)).toBe(true);
  });
});
