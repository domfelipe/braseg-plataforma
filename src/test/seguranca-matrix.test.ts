import { describe, expect, it } from "vitest";
import {
  FREQUENCIES,
  SEVERITIES,
  actionPriority,
  classifyRisk,
  formatCnpj,
  isFrequency,
  isSeverity,
  isValidCnpj,
  riskLevel,
} from "@/lib/seguranca/matrix";

/** Matriz canônica (aba "Base" do Matriz de Risco - Dinami.xlsm, normalizada A→E). */
const EXPECTED: Record<string, Record<number, string>> = {
  A: { 1: "1 - TRIVIAL", 2: "1 - TRIVIAL", 3: "2 - TOLERÁVEL", 4: "3 - MODERADO", 5: "3 - MODERADO" },
  B: { 1: "1 - TRIVIAL", 2: "2 - TOLERÁVEL", 3: "3 - MODERADO", 4: "3 - MODERADO", 5: "4 - SUBSTANCIAL" },
  C: { 1: "1 - TRIVIAL", 2: "2 - TOLERÁVEL", 3: "3 - MODERADO", 4: "4 - SUBSTANCIAL", 5: "5 - INTOLERÁVEL" },
  D: { 1: "2 - TOLERÁVEL", 2: "2 - TOLERÁVEL", 3: "3 - MODERADO", 4: "4 - SUBSTANCIAL", 5: "5 - INTOLERÁVEL" },
  E: { 1: "2 - TOLERÁVEL", 2: "3 - MODERADO", 3: "4 - SUBSTANCIAL", 4: "5 - INTOLERÁVEL", 5: "5 - INTOLERÁVEL" },
};

describe("classifyRisk — 25 células da matriz canônica", () => {
  for (const freq of FREQUENCIES) {
    for (const sev of SEVERITIES) {
      it(freq + "×" + sev, () => {
        expect(classifyRisk(freq, sev)).toBe(EXPECTED[freq][sev]);
      });
    }
  }
});

describe("Linhas reais do PGR Dinami (artefato)", () => {
  it("Ruído D×2 → 2 - TOLERÁVEL", () => expect(classifyRisk("D", 2)).toBe("2 - TOLERÁVEL"));
  it("Umidade/Vibração/Ergonômico/Sílica/Estireno/Projeção (D×3 ou C×3) → 3 - MODERADO", () => {
    expect(classifyRisk("D", 3)).toBe("3 - MODERADO");
    expect(classifyRisk("C", 3)).toBe("3 - MODERADO");
  });
  it("Ergonômico-psicossocial B×1 → 1 - TRIVIAL", () => expect(classifyRisk("B", 1)).toBe("1 - TRIVIAL"));
});

describe("riskLevel e actionPriority", () => {
  it("extrai o nível numérico", () => {
    expect(riskLevel("1 - TRIVIAL")).toBe(1);
    expect(riskLevel("5 - INTOLERÁVEL")).toBe(5);
  });
  it("mapeia a prioridade de ação (seção 6 do documento)", () => {
    expect(actionPriority("1 - TRIVIAL")).toBe("manter");
    expect(actionPriority("2 - TOLERÁVEL")).toBe("monitorar");
    expect(actionPriority("3 - MODERADO")).toBe("medidas");
    expect(actionPriority("4 - SUBSTANCIAL")).toBe("prioritaria");
    expect(actionPriority("5 - INTOLERÁVEL")).toBe("imediata");
  });
});

describe("isFrequency / isSeverity", () => {
  it("aceita apenas A–E", () => {
    expect(isFrequency("A")).toBe(true);
    expect(isFrequency("F")).toBe(false);
    expect(isFrequency("a")).toBe(false);
  });
  it("aceita apenas 1–5 inteiros", () => {
    expect(isSeverity(1)).toBe(true);
    expect(isSeverity(5)).toBe(true);
    expect(isSeverity(0)).toBe(false);
    expect(isSeverity(6)).toBe(false);
    expect(isSeverity(2.5)).toBe(false);
  });
});

describe("isValidCnpj / formatCnpj", () => {
  it("aceita CNPJ válido com ou sem máscara", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
  });
  it("rejeita dígitos errados, tamanho errado e repetição", () => {
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("11.222.333/0001-8")).toBe(false);
    expect(isValidCnpj("11.111.111/1111-11")).toBe(false);
    expect(isValidCnpj("")).toBe(false);
  });
  it("formata CNPJ válido", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
});
