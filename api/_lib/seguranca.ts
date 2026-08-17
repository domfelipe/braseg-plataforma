import { db } from "./db.js";
import { HttpError } from "./http.js";

/** Helpers compartilhados das rotas do módulo Segurança do Trabalho. */

export const FREQUENCIES = ["A", "B", "C", "D", "E"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const SEVERITIES = [1, 2, 3, 4, 5] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Matriz canônica 5×5 (espelho de src/lib/seguranca/matrix.ts — verificada contra o artefato real). */
const MATRIX: Record<Frequency, Record<Severity, string>> = {
  A: { 1: "1 - TRIVIAL", 2: "1 - TRIVIAL", 3: "2 - TOLERÁVEL", 4: "3 - MODERADO", 5: "3 - MODERADO" },
  B: { 1: "1 - TRIVIAL", 2: "2 - TOLERÁVEL", 3: "3 - MODERADO", 4: "3 - MODERADO", 5: "4 - SUBSTANCIAL" },
  C: { 1: "1 - TRIVIAL", 2: "2 - TOLERÁVEL", 3: "3 - MODERADO", 4: "4 - SUBSTANCIAL", 5: "5 - INTOLERÁVEL" },
  D: { 1: "2 - TOLERÁVEL", 2: "2 - TOLERÁVEL", 3: "3 - MODERADO", 4: "4 - SUBSTANCIAL", 5: "5 - INTOLERÁVEL" },
  E: { 1: "2 - TOLERÁVEL", 2: "3 - MODERADO", 3: "4 - SUBSTANCIAL", 4: "5 - INTOLERÁVEL", 5: "5 - INTOLERÁVEL" },
};

export function classifyRisk(frequency: string, severity: number): string {
  if (!(FREQUENCIES as readonly string[]).includes(frequency)) {
    throw new HttpError(400, "Frequência inválida (use A–E)");
  }
  if (!Number.isInteger(severity) || severity < 1 || severity > 5) {
    throw new HttpError(400, "Severidade inválida (use 1–5)");
  }
  return MATRIX[frequency as Frequency][severity as Severity];
}

export function isValidCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
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

/** Garante que o cliente pertence à company autenticada (tenancy). */
export async function assertClientAccess(clientId: string, companyId: string): Promise<void> {
  const res = await db().query(
    "SELECT 1 FROM seg_clients WHERE id = $1 AND company_id = $2 AND status = 'ativo'",
    [clientId, companyId]
  );
  if ((res.rowCount ?? 0) === 0) throw new HttpError(404, "Empresa cliente não encontrada");
}

export function str(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new HttpError(400, message);
  return value.trim();
}

export function optStr(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return str(value, "Campo de texto inválido");
}

export function optInt(value: unknown, message: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n)) throw new HttpError(400, message);
  return n;
}
