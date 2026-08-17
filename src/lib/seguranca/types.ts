/** Tipos do módulo Segurança do Trabalho (PGR/PGRTR). */

export interface SegClient {
  id: string;
  company_id: string;
  razao_social: string;
  cnpj: string;
  cnae: string | null;
  grau_risco: number | null;
  endereco: SegEndereco | null;
  n_funcionarios: number | null;
  responsavel: string | null;
  atividade_principal: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SegEndereco {
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
}

export interface SegSector {
  id: string;
  name: string;
  sort_order: number;
}

export interface SegRole {
  id: string;
  name: string;
  description: string;
  sector_id: string | null;
  sector_name: string | null;
  agent_codes: string[];
}

export interface SegEmployee {
  id: string;
  name: string;
  role_id: string | null;
  sector_id: string | null;
  active: boolean;
  role_name: string | null;
  sector_name: string | null;
}

export interface SegAgent {
  code: string;
  grp: string;
  subgroup: string;
  agent: string;
}

export interface SegNr {
  code: string;
  title: string;
  url: string | null;
}

export interface SegCounts {
  sectors: number;
  roles: number;
  employees: number;
  ges: number;
  risks: number;
  plan: number;
  documents: number;
}

export const AGENT_GROUP_LABELS: Record<string, string> = {
  QUÍMICOS: "Químicos",
  FÍSICOS: "Físicos",
  BIOLÓGICOS: "Biológicos",
  OUTROS: "Outros",
  AUSÊNCIA: "Ausência",
};
