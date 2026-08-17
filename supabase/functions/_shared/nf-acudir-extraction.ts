// Shared NF Acudir extraction utilities (V2)
// Used by: receive-invoice, upload-nota-fiscal, analyze-nf

export const EXPECTED_TOMADOR = {
  cnpj: "30.636.545/0001-50",
  cnpj_digits: "30636545000150",
  name: "ACUDIR SAUDE LTDA",
};

export function normalizeText(s: any): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function onlyDigits(s: any): string {
  return String(s || "").replace(/\D/g, "");
}

/**
 * Normalize a monetary value into a JS number.
 * Accepts:
 *  - number          → returned as-is (if finite)
 *  - string in BR    → "R$ 1.234,56", "1.234,56", "1234,56"
 *  - string in US    → "1,234.56", "1234.56"
 *  - "1.234"         → 1234 (assume BR thousand separator when no decimal sep)
 *  - null/undefined/empty/non-numeric → null
 */
export function normalizeMoneyValue(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  let s = value.trim();
  if (!s) return null;

  // strip currency symbol and spaces
  s = s.replace(/R\$/gi, "").replace(/\s+/g, "").trim();
  // keep digits, separators and sign
  s = s.replace(/[^0-9.,\-]/g, "");
  if (!s) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  let normalized: string;
  if (hasComma && hasDot) {
    // Last separator is the decimal one
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // BR: "1.234,56"
      normalized = s.replace(/\./g, "").replace(",", ".");
    } else {
      // US: "1,234.56"
      normalized = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Only comma → BR decimal: "1234,56"
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (hasDot) {
    // Only dot → could be thousand sep ("1.234") or decimal ("1234.56")
    const parts = s.split(".");
    const lastLen = parts[parts.length - 1].length;
    if (parts.length > 1 && lastLen === 3 && parts.slice(1).every((p) => p.length === 3)) {
      // thousand separator
      normalized = parts.join("");
    } else {
      normalized = s;
    }
  } else {
    normalized = s;
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const MONEY_FIELDS_TOP = [
  "amount",
  "valor_bruto_servicos",
  "valor_liquido_nf",
] as const;

const TAX_FIELDS = ["iss", "irrf", "inss", "csll", "cofins", "pis"] as const;

const DESC_NUMERIC_FIELDS = [
  "valor_hora",
  "valor_total_calculado",
  "horas_trabalhadas",
] as const;

/**
 * Mutates `extracted` normalizing monetary/numeric fields to JS numbers.
 * Safe to call multiple times.
 */
export function normalizeExtractedMoneyFields(extracted: any): any {
  if (!extracted || typeof extracted !== "object") return extracted;

  for (const k of MONEY_FIELDS_TOP) {
    if (k in extracted) {
      const n = normalizeMoneyValue(extracted[k]);
      if (n !== null) extracted[k] = n;
    }
  }

  if (extracted.impostos_retidos && typeof extracted.impostos_retidos === "object") {
    for (const k of TAX_FIELDS) {
      if (k in extracted.impostos_retidos) {
        const n = normalizeMoneyValue(extracted.impostos_retidos[k]);
        extracted.impostos_retidos[k] = n === null ? 0 : n;
      }
    }
  }

  if (extracted.descricao && typeof extracted.descricao === "object") {
    for (const k of DESC_NUMERIC_FIELDS) {
      if (k in extracted.descricao) {
        const n = normalizeMoneyValue(extracted.descricao[k]);
        if (n !== null) extracted.descricao[k] = n;
      }
    }
    if (Array.isArray(extracted.descricao.plantoes)) {
      for (const p of extracted.descricao.plantoes) {
        if (p && typeof p === "object") {
          if ("valor" in p) {
            const n = normalizeMoneyValue(p.valor);
            if (n !== null) p.valor = n;
          }
          if ("horas" in p) {
            const n = normalizeMoneyValue(p.horas);
            if (n !== null) p.horas = n;
          }
        }
      }
    }
  }

  return extracted;
}

/**
 * Build a deterministic audit object comparing `amount` against
 * `valor_bruto_servicos - sum(impostos_retidos)`.
 * Pure and side-effect free over the returned object; does NOT mutate amount.
 */
export interface AmountAudit {
  amount: number | null;
  valor_bruto_servicos: number | null;
  total_impostos_retidos: number;
  expected_amount: number | null;
  difference: number | null;
  consistent: boolean | null;
}

export function buildAmountAudit(extracted: any): AmountAudit {
  const ext = extracted && typeof extracted === "object" ? extracted : {};
  const amount = typeof ext.amount === "number" && Number.isFinite(ext.amount) ? ext.amount : null;
  const bruto =
    typeof ext.valor_bruto_servicos === "number" && Number.isFinite(ext.valor_bruto_servicos)
      ? ext.valor_bruto_servicos
      : null;

  const taxes = ext.impostos_retidos && typeof ext.impostos_retidos === "object" ? ext.impostos_retidos : {};
  let total = 0;
  for (const k of TAX_FIELDS) {
    const v = taxes[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) total += v;
  }

  let expected_amount: number | null = null;
  let difference: number | null = null;
  let consistent: boolean | null = null;

  if (bruto !== null) {
    expected_amount = Math.round((bruto - total) * 100) / 100;
    if (amount !== null) {
      difference = Math.round((amount - expected_amount) * 100) / 100;
      consistent = Math.abs(difference) <= 0.05;
    }
  }

  return {
    amount,
    valor_bruto_servicos: bruto,
    total_impostos_retidos: Math.round(total * 100) / 100,
    expected_amount,
    difference,
    consistent,
  };
}

/**
 * Tries to extract the first valid JSON object from a raw AI response,
 * stripping markdown fences and surrounding text.
 */
export function safeParseJson(raw: string): { ok: true; data: any } | { ok: false; error: string; raw: string } {
  if (!raw || typeof raw !== "string") {
    return { ok: false, error: "Empty AI response", raw: String(raw || "") };
  }
  let txt = raw.trim();
  // strip ```json ... ``` or ``` ... ```
  txt = txt.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  // try direct
  try {
    return { ok: true, data: JSON.parse(txt) };
  } catch (_) { /* fall through */ }
  // find first {...} balanced-ish
  const first = txt.indexOf("{");
  const last = txt.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const candidate = txt.slice(first, last + 1);
    try {
      return { ok: true, data: JSON.parse(candidate) };
    } catch (e) {
      return { ok: false, error: `JSON parse failed: ${(e as Error).message}`, raw };
    }
  }
  return { ok: false, error: "No JSON object found in AI response", raw };
}

/**
 * Tries to infer the local de execução from the description / extracted text
 * using deterministic keyword matching. Returns one of the canonical labels
 * or null.
 */
export function inferLocalFromExtractedData(ext: any): {
  local: string | null;
  confidence: "alta" | "media" | "baixa" | "nenhuma";
  evidencia: string | null;
} {
  const parts: string[] = [];
  if (ext?.nf_description) parts.push(String(ext.nf_description));
  if (ext?.descricao?.local_bruto) parts.push(String(ext.descricao.local_bruto));
  if (ext?.descricao?.local_evidencia) parts.push(String(ext.descricao.local_evidencia));
  if (ext?.descricao?.descricao_completa) parts.push(String(ext.descricao.descricao_completa));
  const haystack = normalizeText(parts.join(" | "));

  if (!haystack) return { local: null, confidence: "nenhuma", evidencia: null };

  const has = (re: RegExp) => re.test(haystack);

  // Mineiros do Tietê
  if (has(/\bMINEIROS\s+(DO\s+)?TIETE\b/) || has(/MUNICIPIO\s+DE\s+MINEIROS/) || has(/PREFEITURA\s+DE\s+MINEIROS/)) {
    return { local: "Mineiros do Tietê", confidence: "alta", evidencia: "Match: Mineiros do Tietê" };
  }
  // Igaraçu do Tietê
  if (has(/\bIGARACU\b/) || has(/IGARACU\s+(DO\s+)?TIETE/) || has(/MUNICIPIO\s+DE\s+IGARACU/) || has(/PREFEITURA\s+DE\s+IGARACU/)) {
    return { local: "Igaraçu do Tietê", confidence: "alta", evidencia: "Match: Igaraçu" };
  }
  // PSA Botucatu
  if (
    has(/\bP\.?\s*S\.?\s*A\.?\b/) ||
    has(/PRONTO\s+SOCORRO\s+ADULTO/) ||
    has(/\bPS\s+ADULTO\b/) ||
    has(/\bPA\s+ADULTO\b/) ||
    has(/PRONTO\s+ATENDIMENTO\s+ADULTO/) ||
    (has(/BOTUCATU/) && has(/PRONTO\s+SOCORRO/))
  ) {
    return { local: "Botucatu PSA", confidence: "alta", evidencia: "Match: PSA / Pronto Socorro Adulto" };
  }
  // PSF Botucatu (UBS / PSF / USF / Unidade de Saúde / Posto / ESF)
  if (
    has(/\bU\.?\s*B\.?\s*S\.?\b/) ||
    has(/\bPSF\b/) ||
    has(/\bUSF\b/) ||
    has(/\bESF\b/) ||
    has(/UNIDADE\s+BASICA\s+DE\s+SAUDE/) ||
    has(/UNIDADE\s+DE\s+SAUDE/) ||
    has(/POSTO\s+DE\s+SAUDE/) ||
    has(/ESTRATEGIA\s+SAUDE\s+DA\s+FAMILIA/)
  ) {
    return { local: "Botucatu PSF", confidence: "alta", evidencia: "Match: UBS/PSF/USF/Unidade de Saúde" };
  }

  // Apenas Botucatu sem qualificação
  if (has(/\bBOTUCATU\b/)) {
    return { local: null, confidence: "baixa", evidencia: "Apenas 'Botucatu' encontrado, sem PSA/UBS/PSF/USF/Unidade" };
  }

  return { local: null, confidence: "nenhuma", evidencia: null };
}

/**
 * Applies deterministic post-processing fallbacks AFTER the AI response.
 * Mutates and returns the same object for convenience.
 */
export function applyDeterministicFallbacks(ext: any): any {
  if (!ext || typeof ext !== "object") ext = {};
  ext.descricao = ext.descricao || {};
  ext.medico = ext.medico || {};
  ext.tomador = ext.tomador || {};
  ext.prestador = ext.prestador || {};
  ext.validacao = ext.validacao || {};

  const validacao = ext.validacao;
  validacao.alertas = Array.isArray(validacao.alertas) ? validacao.alertas : [];
  validacao.campos_criticos_ausentes = Array.isArray(validacao.campos_criticos_ausentes)
    ? validacao.campos_criticos_ausentes
    : [];

  // ---- Local: tentar inferir se vier null ----
  if (!ext.descricao.local_identificado) {
    const inferred = inferLocalFromExtractedData(ext);
    if (inferred.local) {
      ext.descricao.local_identificado = inferred.local;
      ext.descricao.local_confidence = ext.descricao.local_confidence || inferred.confidence;
      ext.descricao.local_evidencia = ext.descricao.local_evidencia || inferred.evidencia;
    } else {
      ext.descricao.local_confidence = inferred.confidence;
      ext.descricao.local_evidencia = ext.descricao.local_evidencia || inferred.evidencia;
      validacao.alertas.push(
        inferred.evidencia
          ? `Local não identificado com clareza: ${inferred.evidencia}`
          : "Local de execução não identificado na descrição.",
      );
    }
  } else {
    ext.descricao.local_confidence = ext.descricao.local_confidence || "alta";
  }

  // ---- doctor_name fallback para razão social ----
  let usouRazaoComoNome = false;
  if (!ext.doctor_name && ext.doctor_company_name) {
    ext.doctor_name = ext.doctor_company_name;
    usouRazaoComoNome = true;
  } else if (!ext.doctor_name && ext.prestador?.name) {
    ext.doctor_name = ext.prestador.name;
    usouRazaoComoNome = true;
  }

  // ---- medico.nome_completo fallback ----
  let fonteNome = ext.medico.fonte_nome || (ext.medico.nome_completo ? "nf_medico" : null);
  if (!ext.medico.nome_completo && ext.doctor_name) {
    ext.medico.nome_completo = ext.doctor_name;
    fonteNome = usouRazaoComoNome ? "razao_social_prestador" : "doctor_name";
  }
  ext.medico.fonte_nome = fonteNome;

  if (usouRazaoComoNome) {
    validacao.usou_razao_social_como_nome_medico = true;
    validacao.alertas.push("Nome do médico não localizado — usada razão social do prestador como fallback.");
  } else {
    validacao.usou_razao_social_como_nome_medico = !!validacao.usou_razao_social_como_nome_medico;
  }

  // ---- Tomador checks ----
  const tomadorCnpjDigits = onlyDigits(ext.tomador?.cnpj);
  validacao.cnpj_tomador_confere = tomadorCnpjDigits === EXPECTED_TOMADOR.cnpj_digits;
  validacao.tomador_eh_acudir = !!(ext.tomador?.name && normalizeText(ext.tomador.name).includes("ACUDIR"));
  if (!validacao.cnpj_tomador_confere) {
    validacao.alertas.push(
      `CNPJ do tomador não confere com ACUDIR (esperado ${EXPECTED_TOMADOR.cnpj}, encontrado ${ext.tomador?.cnpj || "ausente"}).`,
    );
  }
  if (ext.tomador?.name && !validacao.tomador_eh_acudir) {
    validacao.alertas.push(`Nome do tomador divergente da ACUDIR: "${ext.tomador.name}".`);
  }

  // ---- Campos críticos ausentes ----
  const ausentes: string[] = [];
  const checks: Array<[string, any]> = [
    ["nf_number", ext.nf_number],
    ["nf_issue_date", ext.nf_issue_date],
    ["doctor_cnpj", ext.doctor_cnpj],
    ["doctor_name", ext.doctor_name],
    ["amount", ext.amount],
    ["local_identificado", ext.descricao?.local_identificado],
    ["tomador.cnpj", ext.tomador?.cnpj],
  ];
  for (const [k, v] of checks) {
    if (v === null || v === undefined || v === "" || (k === "amount" && Number(v) <= 0)) {
      ausentes.push(k);
    }
  }
  validacao.campos_criticos_ausentes = ausentes;

  // ---- Outros alertas ----
  if (!ext.medico?.crm) validacao.alertas.push("CRM do médico não encontrado.");
  if (!ext.chave_pix) validacao.alertas.push("Chave PIX não encontrada.");

  return ext;
}

export const SYSTEM_PROMPT_NF_ACUDIR_V2 = `Você é um assistente especializado em conferência de Notas Fiscais de Serviço brasileiras (NFS-e) emitidas para a empresa ACUDIR SAUDE LTDA (CNPJ 30.636.545/0001-50).

Cada médico envia a nota em um layout diferente (prefeituras distintas, modelos NFS-e, NFA-e, recibos). Sua missão é extrair os dados com a MAIOR ASSERTIVIDADE possível e SEMPRE retornar um JSON válido.

REGRAS DE SAÍDA:
- Retorne APENAS um JSON válido, sem markdown, sem cercas \`\`\`, sem texto antes ou depois.
- Se um campo não estiver presente, use null (não invente).
- Datas no formato YYYY-MM-DD. Valores em decimal com ponto (ex.: 1234.56), nunca string com R$ ou vírgula.
- Não use endereço do prestador nem da Acudir como local de execução. O local de execução vem SEMPRE da descrição dos serviços.

ESTRUTURA OBRIGATÓRIA DO JSON:
{
  "doctor_name": "nome do médico (pessoa física). Se não houver, use a RAZÃO SOCIAL do prestador como fallback.",
  "doctor_company_name": "razão social do prestador",
  "doctor_cnpj": "CNPJ do prestador (XX.XXX.XXX/XXXX-XX)",
  "amount": número do VALOR A PAGAR ao prestador,
  "valor_bruto_servicos": número (valor bruto antes de qualquer dedução),
  "valor_liquido_nf": número (valor líquido impresso, se houver),
  "impostos_retidos": {
    "iss": número (apenas se Retido na Fonte = SIM, senão 0),
    "irrf": número (apenas se retido, senão 0),
    "inss": número (apenas se retido, senão 0),
    "csll": número (apenas se retido, senão 0),
    "cofins": número (apenas se retido, senão 0),
    "pis": número (apenas se retido, senão 0)
  },
  "nf_number": "número da nota",
  "nf_issue_date": "YYYY-MM-DD",
  "nf_description": "descrição completa dos serviços (texto integral, não resuma)",
  "iss_retained": true/false,

  "tomador": {
    "cnpj": "CNPJ do tomador",
    "name": "nome/razão do tomador",
    "address": "endereço completo",
    "city": "município",
    "state": "UF",
    "cep": "CEP"
  },

  "prestador": {
    "cnpj": "CNPJ do prestador",
    "name": "razão social",
    "address": "endereço",
    "city": "município",
    "state": "UF",
    "cep": "CEP"
  },

  "descricao": {
    "local_bruto": "trecho EXATO da descrição que indica o local",
    "local_identificado": "Botucatu PSA" | "Botucatu PSF" | "Mineiros do Tietê" | "Igaraçu do Tietê" | null,
    "local_confidence": "alta" | "media" | "baixa" | "nenhuma",
    "local_evidencia": "explicação curta do porquê desse local foi escolhido (ex.: 'descrição contém PSA')",
    "plantoes": [
      { "data": "YYYY-MM-DD", "horas": número, "horario": "18:00-00:00", "valor": número }
    ],
    "horas_trabalhadas": número total (use quando for UBS por mês),
    "mes_referencia": "YYYY-MM",
    "valor_hora": número,
    "valor_total_calculado": soma de todos os valores listados na descrição
  },

  "medico": {
    "nome_completo": "nome completo do médico (pessoa física). Se a nota não trouxer nome de médico, use a RAZÃO SOCIAL do prestador.",
    "fonte_nome": "nf_medico" | "razao_social_prestador" | null,
    "crm": "CRM do médico (ex.: 'CRM/SP 123456' ou apenas '123456')"
  },

  "chave_pix": "chave PIX informada (geralmente CNPJ do prestador)",

  "validacao": {
    "tomador_eh_acudir": true/false,
    "cnpj_tomador_confere": true/false,
    "usou_razao_social_como_nome_medico": true/false,
    "campos_criticos_ausentes": ["nf_number", "nf_issue_date", ...],
    "alertas": ["mensagem 1", "mensagem 2"]
  }
}

REGRAS DE FALLBACK PARA NOME DO MÉDICO:
- Se não houver nome de médico identificável, preencha "doctor_name" e "medico.nome_completo" com a razão social do prestador.
- Quando isso acontecer, marque "validacao.usou_razao_social_como_nome_medico" = true e "medico.fonte_nome" = "razao_social_prestador".
- Caso contrário, "medico.fonte_nome" = "nf_medico".

REGRAS DE MAPEAMENTO DO LOCAL (analise SOMENTE a descrição dos serviços):
- "Botucatu PSA" — variações aceitas: PSA, P.S.A., Pronto Socorro Adulto, PS Adulto, PA Adulto, Pronto Atendimento Adulto, Botucatu + pronto socorro.
- "Botucatu PSF" — variações aceitas: UBS, U.B.S., PSF, USF, Unidade Básica de Saúde, Unidade de Saúde, Posto de Saúde, ESF, Estratégia Saúde da Família.
- "Mineiros do Tietê" — variações: Mineiros do Tietê, Mineiros do Tiete, Mineiros Tietê, Mineiros Tiete, Município de Mineiros, Prefeitura de Mineiros.
- "Igaraçu do Tietê" — variações: Igaraçu do Tietê, Igaracu do Tiete, Igaraçu Tietê, Igaracu Tiete, Igaracu, Igaraçu, Município de Igaraçu, Prefeitura de Igaraçu.
- Se aparecer SOMENTE "Botucatu" sem PSA/UBS/PSF/USF/Unidade, retorne local_identificado = null, local_confidence = "baixa" e adicione um alerta.
- NUNCA use o endereço do prestador ou o endereço da Acudir como local de execução.
- Sempre preencha "local_bruto" com o trecho da descrição que justifica o mapeamento e "local_evidencia" com uma justificativa curta.

REGRAS DE VALOR (CRÍTICO):
- "amount" é o VALOR QUE A ACUDIR DEVE PAGAR ao prestador.
- NUNCA desconte impostos NÃO retidos na fonte. Se aparecer "Retido na Fonte: NÃO", "Não Retido", "Retenção: Não" ou valor 0/em branco, esse imposto NÃO entra no cálculo.
- Cálculo do "amount":
  1. Use SEMPRE o Valor Total dos Serviços / Valor Bruto como base.
  2. Subtraia APENAS impostos com retenção EFETIVA (Retido na Fonte = SIM E valor > 0).
  3. IGNORE o "Valor Líquido NFS-e" se ele for menor que o bruto sem haver retenção efetiva (algumas prefeituras imprimem ISS calculado mesmo sem retenção — isso NÃO reduz o que a Acudir paga).
  4. Só use "Valor Líquido NFS-e" diretamente se for IGUAL ao bruto, ou se a diferença for 100% explicada por retenções > 0.
- Em "impostos_retidos", coloque 0 para todo imposto NÃO retido na fonte, mesmo que apareça calculado na nota.
- iss_retained = true APENAS quando ISS estiver Retido na Fonte = SIM e valor > 0.

REGRAS DE PLANTÕES:
- Para PSA: extraia cada plantão como item da lista (data, horas, horário, valor).
- Para UBS/PSF: extraia mês de referência, total de horas e valor/hora.
- valor_total_calculado = SOMA dos valores listados na descrição (deve bater com amount).

AUDITORIA:
- Preencha "validacao.campos_criticos_ausentes" com a lista de campos faltantes entre: nf_number, nf_issue_date, doctor_cnpj, doctor_name, amount, local_identificado, tomador.cnpj.
- Em "validacao.alertas", adicione mensagens curtas para qualquer divergência relevante (tomador divergente, CRM ausente, chave PIX ausente, local apenas como "Botucatu", razão social usada como nome do médico, valor que não bate com a descrição etc.).`;

export const USER_PROMPT_NF_ACUDIR_V2 =
  "Extraia e estruture os dados desta NFS-e conforme o schema. Retorne APENAS o JSON, sem markdown.";
