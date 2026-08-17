/**
 * Parser único de valores monetários em formato brasileiro (e ISO simples).
 *
 * Aceita: "R$ 1.234,56", "1.234,56", "1234,56", "1234.56", "1.234", "1234"
 * Rejeita (sem conversão silenciosa): vazio, texto inválido, zero e negativos.
 *
 * Nunca lança exceção: sempre devolve um resultado estruturado para o chamador
 * exibir a mensagem ao usuário.
 */

export type MoneyErrorReason = "empty" | "invalid" | "zero" | "negative";

export type ParseMoneyResult = {
  ok: boolean;
  value?: number;
  reason?: MoneyErrorReason;
  message?: string;
};


const MESSAGES: Record<MoneyErrorReason, string> = {
  empty: "Informe um valor.",
  invalid: "Valor inválido. Use o formato 1.234,56.",
  zero: "O valor deve ser maior que zero.",
  negative: "O valor não pode ser negativo.",
};

const fail = (reason: MoneyErrorReason): ParseMoneyResult => ({
  ok: false,
  reason,
  message: MESSAGES[reason],
});

export function parseBRLAmount(input: unknown): ParseMoneyResult {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return fail("invalid");
    if (input < 0) return fail("negative");
    if (input === 0) return fail("zero");
    return { ok: true, value: round2(input) };
  }

  if (typeof input !== "string") return fail("empty");

  // Normaliza espaços (inclui NBSP/narrow NBSP) e remove símbolo de moeda.
  let raw = input.replace(/\u00a0|\u202f/g, " ").trim();
  if (!raw) return fail("empty");

  const negative = /^-/.test(raw) || /^\(.*\)$/.test(raw);
  raw = raw.replace(/^\(|\)$/g, "");
  raw = raw.replace(/r\$/gi, "").replace(/\s+/g, "").replace(/^[-+]/, "");
  if (!raw) return fail("empty");

  // Somente dígitos e separadores são aceitos.
  if (!/^[0-9.,]+$/.test(raw)) return fail("invalid");

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized: string;

  if (hasComma && hasDot) {
    // O último separador presente é o decimal.
    const decimalSep = raw.lastIndexOf(",") > raw.lastIndexOf(".") ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    normalized = raw.split(thousandSep).join("").replace(decimalSep, ".");
  } else if (hasComma) {
    // Vírgula única = decimal brasileiro; várias vírgulas = agrupamento.
    normalized =
      raw.split(",").length - 1 > 1 ? raw.split(",").join("") : raw.replace(",", ".");
  } else if (hasDot) {
    // "1.234" / "1.234.567" => agrupamento de milhar. "1234.56" => decimal.
    normalized = /^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.split(".").join("") : raw;
    if (normalized.split(".").length - 1 > 1) normalized = normalized.split(".").join("");
  } else {
    normalized = raw;
  }

  if (!/^\d*(\.\d*)?$/.test(normalized) || normalized === "" || normalized === ".") {
    return fail("invalid");
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return fail("invalid");
  if (negative && value !== 0) return fail("negative");
  if (value === 0) return fail("zero");

  return { ok: true, value: round2(value) };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
