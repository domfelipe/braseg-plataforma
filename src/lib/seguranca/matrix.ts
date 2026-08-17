/**
 * Motor da Matriz de Risco 5×5 (NR-01/GRO) do módulo Segurança do Trabalho.
 * Classificação canônica idêntica à aba "Base" do artefato real
 * "Matriz de Risco - Dinami.xlsm" (verificada célula a célula contra o bloco
 * CONCATENAR E1..E5/D1..D5/C1..C5 e contra todas as linhas do PGR Dinami).
 * Função pura: roda no cliente (offline) e no servidor (geração do documento).
 */

export type RiskFrequency = "A" | "B" | "C" | "D" | "E";
export type RiskSeverity = 1 | 2 | 3 | 4 | 5;
export type RiskClassification =
  | "1 - TRIVIAL"
  | "2 - TOLERÁVEL"
  | "3 - MODERADO"
  | "4 - SUBSTANCIAL"
  | "5 - INTOLERÁVEL";
export type ActionPriority = "manter" | "monitorar" | "medidas" | "prioritaria" | "imediata";

export const FREQUENCIES: readonly RiskFrequency[] = ["A", "B", "C", "D", "E"];
export const SEVERITIES: readonly RiskSeverity[] = [1, 2, 3, 4, 5];

export const FREQUENCY_LABELS: Record<RiskFrequency, string> = {
  A: "Rara",
  B: "Pouco Provável",
  C: "Possível",
  D: "Provável",
  E: "Muito Provável",
};

export const SEVERITY_LABELS: Record<RiskSeverity, string> = {
  1: "Leve",
  2: "Menor",
  3: "Moderada",
  4: "Maior",
  5: "Extrema",
};

export const ACTION_PRIORITY_LABELS: Record<ActionPriority, string> = {
  manter: "Manter",
  monitorar: "Monitorar",
  medidas: "Medidas programadas",
  prioritaria: "Ação prioritária",
  imediata: "Ação imediata",
};

/**
 * Matriz canônica: probabilidade (A–E) × severidade (1–5) → classificação.
 * Linhas ordenadas de E (Muito Provável) para A (Rara) na aba Base do xlsm;
 * aqui normalizadas de A → E.
 */
const MATRIX: Record<RiskFrequency, Record<RiskSeverity, RiskClassification>> = {
  A: { 1: "1 - TRIVIAL", 2: "1 - TRIVIAL", 3: "2 - TOLERÁVEL", 4: "3 - MODERADO", 5: "3 - MODERADO" },
  B: { 1: "1 - TRIVIAL", 2: "2 - TOLERÁVEL", 3: "3 - MODERADO", 4: "3 - MODERADO", 5: "4 - SUBSTANCIAL" },
  C: { 1: "1 - TRIVIAL", 2: "2 - TOLERÁVEL", 3: "3 - MODERADO", 4: "4 - SUBSTANCIAL", 5: "5 - INTOLERÁVEL" },
  D: { 1: "2 - TOLERÁVEL", 2: "2 - TOLERÁVEL", 3: "3 - MODERADO", 4: "4 - SUBSTANCIAL", 5: "5 - INTOLERÁVEL" },
  E: { 1: "2 - TOLERÁVEL", 2: "3 - MODERADO", 3: "4 - SUBSTANCIAL", 4: "5 - INTOLERÁVEL", 5: "5 - INTOLERÁVEL" },
};

export function isFrequency(value: string): value is RiskFrequency {
  return (FREQUENCIES as readonly string[]).includes(value);
}

export function isSeverity(value: number): value is RiskSeverity {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

/** Classificação SEMPRE calculada — nunca digitada (regra da spec §7.4). */
export function classifyRisk(frequency: RiskFrequency, severity: RiskSeverity): RiskClassification {
  return MATRIX[frequency][severity];
}

/** Nível numérico da classificação (1..5) para ordenação/priorização. */
export function riskLevel(classification: RiskClassification): RiskSeverity {
  const level = Number.parseInt(classification.slice(0, 1), 10);
  if (!isSeverity(level)) {
    throw new Error("Classificação inválida: " + classification);
  }
  return level;
}

/** Prioridade da ação de controle (entra na seção 6 do documento gerado). */
export function actionPriority(classification: RiskClassification): ActionPriority {
  switch (riskLevel(classification)) {
    case 1: return "manter";
    case 2: return "monitorar";
    case 3: return "medidas";
    case 4: return "prioritaria";
    case 5: return "imediata";
  }
}

/** Valida CNPJ (aceita com ou sem máscara) — dígitos verificadores padrão Receita. */
export function isValidCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false; // todos os dígitos iguais
  const calc = (base: string): number => {
    const weights = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base.split("").reduce((acc, d, i) => acc + Number.parseInt(d, 10) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const base12 = digits.slice(0, 12);
  const d1 = calc(base12);
  const d2 = calc(base12 + String(d1));
  return digits === base12 + String(d1) + String(d2);
}

/** Formata CNPJ válido como 00.000.000/0000-00 (retorna o input se inválido). */
export function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return value;
  return digits.slice(0, 2) + "." + digits.slice(2, 5) + "." + digits.slice(5, 8) + "/" + digits.slice(8, 12) + "-" + digits.slice(12);
}
