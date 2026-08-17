export interface DocumentType {
  slug: string;
  label: string;
}

export interface DocumentCategory {
  key: string;
  label: string;
  icon: string;
  types: DocumentType[];
}

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  {
    key: "admissao",
    label: "Admissão",
    icon: "FileCheck",
    types: [
      { slug: "ficha-registro", label: "Ficha de registro de empregado" },
      { slug: "contrato-trabalho", label: "Contrato de trabalho" },
      { slug: "ctps", label: "CTPS (cópia)" },
      { slug: "rg-cpf", label: "RG e CPF (cópia)" },
      { slug: "comprovante-endereco", label: "Comprovante de endereço" },
      { slug: "certidao-nascimento-casamento", label: "Certidão de nascimento/casamento" },
      { slug: "titulo-eleitor", label: "Título de eleitor" },
      { slug: "certificado-reservista", label: "Certificado de reservista" },
      { slug: "pis-pasep", label: "PIS/PASEP" },
      { slug: "foto-3x4", label: "Foto 3x4" },
      { slug: "exame-admissional", label: "Exame admissional (ASO)" },
      { slug: "declaracao-dependentes-ir", label: "Declaração de dependentes para IR" },
      { slug: "outros-admissao", label: "Outros documentos de admissão" },
    ],
  },
  {
    key: "periodico",
    label: "Periódicos",
    icon: "CalendarClock",
    types: [
      { slug: "exame-periodico", label: "Exame periódico (ASO)" },
      { slug: "treinamento-certificacao", label: "Treinamentos e certificações" },
      { slug: "epi-ficha-entrega", label: "EPI (fichas de entrega)" },
      { slug: "outros-periodicos", label: "Outros documentos periódicos" },
    ],
  },
  {
    key: "atestado",
    label: "Atestados e Faltas",
    icon: "HeartPulse",
    types: [
      { slug: "atestado-medico", label: "Atestado médico" },
      { slug: "declaracao-comparecimento", label: "Declaração de comparecimento" },
      { slug: "falta-sem-justificativa", label: "Falta sem justificativa" },
      { slug: "outros-atestados", label: "Outros atestados" },
    ],
  },
  {
    key: "desligamento",
    label: "Desligamento",
    icon: "UserX",
    types: [
      { slug: "trct", label: "Termo de rescisão (TRCT)" },
      { slug: "exame-demissional", label: "Exame demissional (ASO)" },
      { slug: "aviso-previo", label: "Aviso prévio" },
      { slug: "homologacao", label: "Homologação" },
      { slug: "guias-seguro-desemprego", label: "Guias de seguro-desemprego" },
      { slug: "fgts-chave-conectividade", label: "FGTS (chave de conectividade)" },
      { slug: "outros-desligamento", label: "Outros documentos de desligamento" },
    ],
  },
  {
    key: "comprovante",
    label: "Comprovantes",
    icon: "Receipt",
    types: [
      { slug: "comprovante-pagamento", label: "Comprovante de pagamento" },
      { slug: "recibo-ferias", label: "Recibo de férias" },
      { slug: "recibo-13-salario", label: "Recibo de 13º salário" },
      { slug: "outros-comprovantes", label: "Outros comprovantes" },
    ],
  },
];

export const EMPLOYEE_STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  dismissed: "Desligado",
};

export function getCategoryByKey(key: string) {
  return DOCUMENT_CATEGORIES.find((c) => c.key === key);
}

export function getDocumentTypeLabel(categoryKey: string, typeSlug: string) {
  const cat = getCategoryByKey(categoryKey);
  return cat?.types.find((t) => t.slug === typeSlug)?.label || typeSlug;
}
