import { db } from "../../../_lib/db.js";

/** Montagem do modelo de dados do documento PGR/PGRTR a partir do banco (fonte única). */

export interface ModelGes {
  code: string;
  name: string;
  sector: string | null;
  activities: string;
  agents: Array<{ code: string; agent: string }>;
}

export interface ModelRisk {
  ges_code: string;
  ges_name: string;
  agent_code: string;
  agent: string;
  group: string;
  frequency: string;
  severity: number;
  classification: string;
  effects: string;
  existing: string;
  proposed: string;
  record: string;
  nrs: string[];
}

export interface ModelPlanItem {
  description: string;
  responsible: string | null;
  deadline: string | null;
  status: string;
  origin: string | null;
}

export interface DocumentModel {
  tipo: "pgr" | "pgrtr";
  razao_social: string;
  cnpj: string;
  cnae: string | null;
  grau_risco: number | null;
  endereco_texto: string;
  atividade_principal: string | null;
  responsavel: string | null;
  consultor: string;
  n_funcionarios: number | null;
  valid_from: string;
  valid_until: string;
  catalog_version: string;
  ges: ModelGes[];
  risks: ModelRisk[];
  plan: ModelPlanItem[];
  nr_titles: Array<{ code: string; title: string }>;
  revision_note: string;
}

export function formatCnpj(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length !== 14) return digits;
  return d.slice(0, 2) + "." + d.slice(2, 5) + "." + d.slice(5, 8) + "/" + d.slice(8, 12) + "-" + d.slice(12);
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d + "/" + m + "/" + y;
}

export function addYears(iso: string, years: number): string {
  const date = new Date(iso + "T12:00:00Z");
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

export async function assembleModel(args: {
  clientId: string;
  docType: "pgr" | "pgrtr";
  validFrom: string;
  consultantName: string;
  revisionNote: string;
}): Promise<DocumentModel> {
  const { clientId, docType, validFrom, consultantName, revisionNote } = args;

  const clientRes = await db().query("SELECT * FROM seg_clients WHERE id = $1", [clientId]);
  if ((clientRes.rowCount ?? 0) === 0) throw new Error("Empresa cliente não encontrada");
  const client = clientRes.rows[0];

  const catalogRes = await db().query(
    "SELECT layout_version FROM seg_esocial_tables WHERE code = '24'"
  );

  const gesRes = await db().query(
    `SELECT g.code, g.name, g.activities, s.name AS sector,
            COALESCE(array_agg(a.code || '|' || a.agent ORDER BY a.code) FILTER (WHERE a.code IS NOT NULL), '{}') AS agents
     FROM seg_ges g
     LEFT JOIN seg_sectors s ON s.id = g.sector_id
     LEFT JOIN seg_ges_agents ga ON ga.ges_id = g.id
     LEFT JOIN seg_esocial_agents a ON a.code = ga.agent_code
     WHERE g.client_id = $1
     GROUP BY g.id, s.name
     ORDER BY g.code`,
    [clientId]
  );

  const risksRes = await db().query(
    `SELECT r.*, g.code AS ges_code, g.name AS ges_name, a.agent, a.grp AS "group"
     FROM seg_inventory_risks r
     JOIN seg_ges g ON g.id = r.ges_id
     LEFT JOIN seg_esocial_agents a ON a.code = r.agent_code
     WHERE r.client_id = $1
     ORDER BY g.code, a.grp, a.code`,
    [clientId]
  );

  const planRes = await db().query(
    `SELECT ap.description, ap.responsible, ap.deadline, ap.status,
            g.name AS ges_name, a.agent
     FROM seg_action_plan ap
     LEFT JOIN seg_inventory_risks r ON r.id = ap.risk_id
     LEFT JOIN seg_ges g ON g.id = r.ges_id
     LEFT JOIN seg_esocial_agents a ON a.code = r.agent_code
     WHERE ap.client_id = $1
     ORDER BY ap.status, ap.deadline NULLS LAST`,
    [clientId]
  );

  const nrCodes = [...new Set((risksRes.rows as Array<{ nr_codes: string[] }>).flatMap((r) => r.nr_codes ?? []))].sort();
  const nrTitles = nrCodes.length > 0
    ? (await db().query("SELECT code, title FROM seg_nrs WHERE code = ANY($1) ORDER BY code", [nrCodes])).rows as Array<{ code: string; title: string }>
    : [];

  const endereco = (client.endereco ?? {}) as Record<string, string>;
  const enderecoTexto = [
    endereco.logradouro,
    endereco.numero,
    endereco.bairro,
    endereco.cidade,
    endereco.uf,
    endereco.cep,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    tipo: docType,
    razao_social: client.razao_social,
    cnpj: formatCnpj(client.cnpj),
    cnae: client.cnae,
    grau_risco: client.grau_risco,
    endereco_texto: enderecoTexto || "Não informado",
    atividade_principal: client.atividade_principal,
    responsavel: client.responsavel,
    consultor: consultantName,
    n_funcionarios: client.n_funcionarios,
    valid_from: validFrom,
    valid_until: addYears(validFrom, 2),
    catalog_version: catalogRes.rows[0]?.layout_version ?? "S-1.3",
    ges: (gesRes.rows as Array<{ code: string; name: string; activities: string; sector: string | null; agents: string[] }>).map((g) => ({
      code: g.code,
      name: g.name,
      sector: g.sector,
      activities: g.activities,
      agents: g.agents.map((pair) => {
        const [code, ...rest] = pair.split("|");
        return { code, agent: rest.join("|") };
      }),
    })),
    risks: (risksRes.rows as Array<Record<string, unknown>>).map((r) => ({
      ges_code: String(r.ges_code),
      ges_name: String(r.ges_name),
      agent_code: String(r.agent_code),
      agent: String(r.agent ?? r.agent_code),
      group: String(r.group ?? ""),
      frequency: String(r.frequency),
      severity: Number(r.severity),
      classification: String(r.classification),
      effects: String(r.effects ?? ""),
      existing: String(r.existing_measures ?? ""),
      proposed: String(r.proposed_measures ?? ""),
      record: String(r.record_control ?? ""),
      nrs: (r.nr_codes ?? []) as string[],
    })),
    plan: (planRes.rows as Array<Record<string, unknown>>).map((p) => ({
      description: String(p.description),
      responsible: p.responsible ? String(p.responsible) : null,
      deadline: p.deadline ? formatDate(String(p.deadline)) : null,
      status: String(p.status),
      origin: p.ges_name ? String(p.ges_name) + " — " + String(p.agent ?? "") : null,
    })),
    nr_titles: nrTitles,
    revision_note: revisionNote,
  };
}
