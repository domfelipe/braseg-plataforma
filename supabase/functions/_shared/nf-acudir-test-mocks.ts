// Mock fixtures for Acudir NF extraction/validation tests.
// NO real invoice data. NO real doctors. NO PII.

export const ACUDIR_CNPJ = "30.636.545/0001-50";

export interface MockExtracted {
  doctor_name?: string | null;
  doctor_company_name?: string | null;
  doctor_cnpj?: string | null;
  amount?: number | null;
  nf_number?: string | null;
  nf_issue_date?: string | null;
  nf_description?: string | null;
  tomador?: { cnpj?: string | null; name?: string | null } & Record<string, any>;
  prestador?: Record<string, any>;
  medico?: { nome_completo?: string | null; crm?: string | null; fonte_nome?: string | null };
  descricao?: Record<string, any>;
  chave_pix?: string | null;
  validacao?: Record<string, any>;
  [k: string]: any;
}

export function baseValid(over: Partial<MockExtracted> = {}): MockExtracted {
  return {
    doctor_name: "MOCK MEDICO TESTE",
    doctor_company_name: "MOCK MEDICO TESTE LTDA",
    doctor_cnpj: "12.345.678/0001-90",
    amount: 1000,
    nf_number: "123",
    nf_issue_date: "2026-05-01",
    nf_description: "Serviços médicos prestados no PSA Botucatu",
    tomador: { cnpj: ACUDIR_CNPJ, name: "ACUDIR SAUDE LTDA" },
    prestador: { cnpj: "12.345.678/0001-90", name: "MOCK MEDICO TESTE LTDA" },
    medico: { nome_completo: "MOCK MEDICO TESTE", crm: "CRM/SP 999999" },
    descricao: { local_identificado: "Botucatu PSA" },
    chave_pix: "12.345.678/0001-90",
    validacao: {},
    ...over,
  };
}

export const SCENARIOS = {
  psa: () =>
    baseValid({
      doctor_name: null,
      doctor_company_name: "A P P MOCK SERVICOS MEDICOS LTDA",
      prestador: { cnpj: "12.345.678/0001-90", name: "A P P MOCK SERVICOS MEDICOS LTDA" },
      medico: { nome_completo: null, crm: null },
      nf_description: "Serviços médicos prestados no PSA Botucatu",
      descricao: {},
    }),
  ubs: () => baseValid({ nf_description: "Prestação de serviços na UBS em Botucatu", descricao: {} }),
  usf: () => baseValid({ nf_description: "Atendimento médico em USF Botucatu", descricao: {} }),
  esf: () =>
    baseValid({ nf_description: "Serviços médicos na Estratégia Saúde da Família em Botucatu", descricao: {} }),
  mineiros: () => baseValid({ nf_description: "Plantões realizados em Mineiros do Tiete", descricao: {} }),
  igaracu: () => baseValid({ nf_description: "Serviços prestados em Igaracu do Tiete", descricao: {} }),
  botucatuOnly: () => baseValid({ nf_description: "Serviços prestados em Botucatu", descricao: {} }),
  semCrmSemPix: () =>
    baseValid({
      medico: { nome_completo: "MOCK MEDICO TESTE", crm: null },
      chave_pix: null,
    }),
  razaoSocialFallback: () =>
    baseValid({
      doctor_name: null,
      doctor_company_name: "CLINICA MEDICA MOCK SILVA LTDA",
      prestador: { cnpj: "12.345.678/0001-90", name: "CLINICA MEDICA MOCK SILVA LTDA" },
      medico: { nome_completo: null },
      descricao: {},
    }),
  tomadorErrado: () =>
    baseValid({
      tomador: { cnpj: "00.000.000/0001-00", name: "OUTRA EMPRESA LTDA" },
    }),
  tomadorAusente: () => baseValid({ tomador: { cnpj: null, name: null } }),
  amountAusente: () => baseValid({ amount: null }),
  doctorCnpjAusente: () => baseValid({ doctor_cnpj: null }),
  nfNumberAusente: () => baseValid({ nf_number: null }),
  nfIssueDateAusente: () => baseValid({ nf_issue_date: null }),
};
