import { describe, it, expect } from "vitest";
import {
  safeParseJson,
  inferLocalFromExtractedData,
  applyDeterministicFallbacks,
} from "../../supabase/functions/_shared/nf-acudir-extraction.ts";
import { SCENARIOS } from "../../supabase/functions/_shared/nf-acudir-test-mocks.ts";

describe("safeParseJson", () => {
  it("parses raw JSON", () => {
    const r = safeParseJson('{"amount":1000,"nf_number":"123"}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.amount).toBe(1000);
  });

  it("parses fenced ```json blocks", () => {
    const r = safeParseJson('```json\n{"amount":1000,"nf_number":"123"}\n```');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.nf_number).toBe("123");
  });

  it("parses with surrounding text", () => {
    const r = safeParseJson('Aqui está o JSON: {"amount":1000,"nf_number":"123"} fim');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.amount).toBe(1000);
  });

  it("returns controlled error for invalid JSON", () => {
    const r = safeParseJson("não é json");
    expect(r.ok).toBe(false);
  });

  it("handles empty input without throwing", () => {
    const r = safeParseJson("");
    expect(r.ok).toBe(false);
  });
});

describe("inferLocalFromExtractedData", () => {
  const cases: Array<[string, string, string | null]> = [
    ["PSA", "Serviços médicos prestados no PSA Botucatu", "Botucatu PSA"],
    ["UBS", "Prestação de serviços na UBS em Botucatu", "Botucatu PSF"],
    ["USF", "Atendimento médico em USF Botucatu", "Botucatu PSF"],
    ["ESF", "Serviços médicos na Estratégia Saúde da Família em Botucatu", "Botucatu PSF"],
    ["Mineiros sem acento", "Plantões realizados em Mineiros do Tiete", "Mineiros do Tietê"],
    ["Igaracu sem acento", "Serviços prestados em Igaracu do Tiete", "Igaraçu do Tietê"],
    ["Botucatu sozinho", "Serviços prestados em Botucatu", null],
  ];
  for (const [label, desc, expected] of cases) {
    it(`infere ${label} -> ${expected}`, () => {
      const r = inferLocalFromExtractedData({ nf_description: desc });
      expect(r.local).toBe(expected);
    });
  }
});

describe("applyDeterministicFallbacks", () => {
  it("usa razão social do prestador como fallback de doctor_name", () => {
    const out = applyDeterministicFallbacks(SCENARIOS.razaoSocialFallback());
    expect(out.doctor_name).toBe("CLINICA MEDICA MOCK SILVA LTDA");
    expect(out.medico.nome_completo).toBe("CLINICA MEDICA MOCK SILVA LTDA");
    expect(out.validacao.usou_razao_social_como_nome_medico).toBe(true);
    expect(out.medico.fonte_nome).toBe("razao_social_prestador");
  });

  it("infere local PSA via descrição quando ausente", () => {
    const out = applyDeterministicFallbacks(SCENARIOS.psa());
    expect(out.descricao.local_identificado).toBe("Botucatu PSA");
  });

  it("marca tomador divergente nos alertas", () => {
    const out = applyDeterministicFallbacks(SCENARIOS.tomadorErrado());
    expect(out.validacao.cnpj_tomador_confere).toBe(false);
    expect(out.validacao.alertas.some((a: string) => /tomador/i.test(a))).toBe(true);
  });
});
