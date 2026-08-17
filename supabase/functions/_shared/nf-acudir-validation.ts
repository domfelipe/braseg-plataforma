// Shared validation for Acudir NF extraction.
// Splits blocking issues from non-blocking warnings while keeping the public
// validation_status surface limited to "valida" | "invalida".

import { EXPECTED_TOMADOR, normalizeText, onlyDigits, buildAmountAudit } from "./nf-acudir-extraction.ts";

export type ValidationStatus = "valida" | "invalida";

export interface InvoiceValidationResult {
  validation_status: ValidationStatus;
  validation_issues: string[]; // BLOCKING ONLY
  validation_warnings: string[]; // NON-BLOCKING
  validation_data: any; // enriched extracted payload
}

/**
 * Build the standardized validation envelope for an Acudir NFS-e.
 * - Blocking criteria are minimal and aligned across all 3 functions.
 * - Everything else becomes a warning, surfaced via:
 *     validation_data.validacao.alertas
 *     validation_data.validation_warnings
 */
export function buildInvoiceValidation(extracted: any): InvoiceValidationResult {
  const ext: any = extracted && typeof extracted === "object" ? extracted : {};
  ext.descricao = ext.descricao || {};
  ext.tomador = ext.tomador || {};
  ext.prestador = ext.prestador || {};
  ext.medico = ext.medico || {};
  ext.validacao = ext.validacao || {};
  if (!Array.isArray(ext.validacao.alertas)) ext.validacao.alertas = [];

  // Force explicit null when local could not be inferred (avoid undefined).
  if (ext.descricao.local_identificado === undefined) {
    ext.descricao.local_identificado = null;
  }

  const blocking: string[] = [];
  const warnings: string[] = [];

  // ---------------- BLOCKING ----------------
  // amount
  const amountNum = Number(ext.amount);
  if (!ext.amount || isNaN(amountNum) || amountNum <= 0) {
    blocking.push("Valor (amount) ausente ou inválido.");
  }
  // doctor_cnpj
  if (!ext.doctor_cnpj) blocking.push("CNPJ do prestador (doctor_cnpj) ausente.");
  // nf_number
  if (!ext.nf_number) blocking.push("Número da NF (nf_number) ausente.");
  // nf_issue_date
  if (!ext.nf_issue_date) blocking.push("Data de emissão (nf_issue_date) ausente.");

  // tomador.cnpj presence + matches Acudir
  const tomador = ext.tomador || {};
  const tomadorCnpjDigits = onlyDigits(tomador.cnpj);
  if (!tomador.cnpj) {
    blocking.push("CNPJ do tomador ausente.");
  } else if (tomadorCnpjDigits !== EXPECTED_TOMADOR.cnpj_digits) {
    blocking.push(
      `CNPJ do tomador não confere com ACUDIR (esperado ${EXPECTED_TOMADOR.cnpj}, encontrado ${tomador.cnpj}).`,
    );
  }
  if (tomador.name && !normalizeText(tomador.name).includes("ACUDIR")) {
    blocking.push(`Tomador divergente da ACUDIR: "${tomador.name}".`);
  }

  // ---------------- WARNINGS ----------------
  const prestador = ext.prestador || {};
  const prestadorWarn: Array<[string, string]> = [
    ["name", "Razão Social"],
    ["address", "Endereço"],
    ["city", "Município"],
    ["cep", "CEP"],
  ];
  for (const [key, label] of prestadorWarn) {
    if (!prestador[key]) warnings.push(`Prestador sem ${label}.`);
  }

  const descricao = ext.descricao || {};
  if (!descricao.local_identificado) {
    warnings.push("Local de execução não identificado (PSA, PSF, Mineiros do Tietê ou Igaraçu do Tietê).");
  }
  const plantoes = Array.isArray(descricao.plantoes) ? descricao.plantoes : [];
  if (plantoes.length === 0 && !descricao.horas_trabalhadas) {
    warnings.push("Plantões/horas trabalhadas não identificados na descrição.");
  }

  const valorNota = Number(ext.amount || 0);
  const valorDesc = Number(descricao.valor_total_calculado || 0);
  if (valorNota > 0 && valorDesc > 0 && Math.abs(valorNota - valorDesc) > 0.5) {
    warnings.push(
      `Valor da nota (R$ ${valorNota.toFixed(2)}) não confere com a soma da descrição (R$ ${valorDesc.toFixed(2)}).`,
    );
  }

  const medico = ext.medico || {};
  if (!medico.nome_completo) warnings.push("Nome completo do médico não localizado.");
  if (!medico.crm) warnings.push("CRM do médico não localizado.");
  if (!ext.chave_pix) warnings.push("Chave PIX não informada.");
  if (ext.validacao?.usou_razao_social_como_nome_medico) {
    warnings.push("Razão social usada como fallback para o nome do médico.");
  }

  // ---------------- AMOUNT AUDIT (deterministic, non-blocking) ----------------
  const audit = buildAmountAudit(ext);
  ext.amount_audit = audit;
  if (audit.consistent === false) {
    const a = typeof audit.amount === "number" ? audit.amount.toFixed(2) : "n/d";
    const e = typeof audit.expected_amount === "number" ? audit.expected_amount.toFixed(2) : "n/d";
    warnings.push(`Valor da nota (R$ ${a}) diverge do esperado (bruto - retidos = R$ ${e}).`);
  }


  // Merge AI-side alertas into warnings (deduped).
  const aiAlertas = Array.isArray(ext.validacao?.alertas) ? ext.validacao.alertas : [];
  for (const a of aiAlertas) {
    if (typeof a === "string" && !warnings.includes(a) && !blocking.includes(a)) {
      warnings.push(a);
    }
  }

  // Persist warnings inside extracted payload as well (compat surface).
  ext.validation_warnings = warnings;
  // Keep validacao.alertas as the union, deduped.
  const mergedAlertas: string[] = [];
  for (const a of [...aiAlertas, ...warnings]) {
    if (typeof a === "string" && !mergedAlertas.includes(a)) mergedAlertas.push(a);
  }
  ext.validacao.alertas = mergedAlertas;

  const validation_status: ValidationStatus = blocking.length === 0 ? "valida" : "invalida";

  return {
    validation_status,
    validation_issues: blocking,
    validation_warnings: warnings,
    validation_data: ext,
  };
}
