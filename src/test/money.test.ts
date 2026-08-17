import { describe, it, expect } from "vitest";
import { parseBRLAmount, formatBRL } from "@/lib/money";

describe("parseBRLAmount", () => {
  it("aceita formato brasileiro com símbolo e milhar", () => {
    expect(parseBRLAmount("R$ 1.234,56")).toEqual({ ok: true, value: 1234.56 });
    expect(parseBRLAmount("1.234,56")).toEqual({ ok: true, value: 1234.56 });
    expect(parseBRLAmount("1234,56")).toEqual({ ok: true, value: 1234.56 });
    expect(parseBRLAmount("1234.56")).toEqual({ ok: true, value: 1234.56 });
  });

  it("interpreta ponto como milhar quando não há decimais", () => {
    expect(parseBRLAmount("1.234")).toEqual({ ok: true, value: 1234 });
    expect(parseBRLAmount("1.234.567")).toEqual({ ok: true, value: 1234567 });
  });

  it("aceita inteiros simples e números", () => {
    expect(parseBRLAmount("1234")).toEqual({ ok: true, value: 1234 });
    expect(parseBRLAmount(230)).toEqual({ ok: true, value: 230 });
  });

  it("normaliza espaços não separáveis", () => {
    expect(parseBRLAmount("R$\u00a01.000,00")).toEqual({ ok: true, value: 1000 });
  });

  it("rejeita vazio", () => {
    expect(parseBRLAmount("").ok).toBe(false);
    expect(parseBRLAmount("   ").reason).toBe("empty");
    expect(parseBRLAmount(undefined).ok).toBe(false);
  });

  it("rejeita texto inválido sem converter silenciosamente", () => {
    expect(parseBRLAmount("abc").reason).toBe("invalid");
    expect(parseBRLAmount("12,3,4,5x").reason).toBe("invalid");
    expect(parseBRLAmount(NaN).reason).toBe("invalid");
  });

  it("rejeita zero e negativo", () => {
    expect(parseBRLAmount("0").reason).toBe("zero");
    expect(parseBRLAmount("0,00").reason).toBe("zero");
    expect(parseBRLAmount("-10,00").reason).toBe("negative");
    expect(parseBRLAmount("(10,00)").reason).toBe("negative");
    expect(parseBRLAmount(-5).reason).toBe("negative");
  });

  it("sempre devolve mensagem de erro legível", () => {
    const r = parseBRLAmount("xyz");
    expect(r.ok).toBe(false);
    expect(typeof r.message).toBe("string");
    expect((r.message as string).length).toBeGreaterThan(0);
  });

  it("formatBRL formata em pt-BR", () => {
    expect(formatBRL(1234.56).replace(/\u00a0/g, " ")).toContain("1.234,56");
  });
});
