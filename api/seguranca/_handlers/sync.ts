import { requireUserId } from "../../_lib/auth.js";
import { db } from "../../_lib/db.js";
import { handleError, json, readJson } from "../../_lib/http.js";
import { classifyRisk, str } from "../../_lib/seguranca.js";
import type { IncomingMessage, ServerResponse } from "http";
import { assertCompanyAccess } from "../../_lib/tenant.js";

export const config = { runtime: "nodejs" };

interface Mutation {
  client_mutation_id: string;
  client_id: string;
  entity: string;
  operation: string;
  payload: Record<string, unknown>;
}

/** Aplica uma mutação enfileirada offline (replay em ordem, idempotente). */
async function apply(clientId: string, m: Mutation): Promise<void> {
  const p = m.payload;
  switch (m.entity) {
    case "sectors": {
      if (m.operation === "insert") {
        await db().query("INSERT INTO seg_sectors (id, client_id, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [p.id, clientId, str(p.name, "Nome do setor obrigatório")]);
      } else if (m.operation === "delete") {
        await db().query("DELETE FROM seg_sectors WHERE id = $1 AND client_id = $2", [p.sector_id, clientId]);
      }
      break;
    }
    case "roles": {
      if (m.operation === "insert") {
        await db().query(
          "INSERT INTO seg_roles (id, client_id, name, description, sector_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
          [p.id, clientId, str(p.name, "Nome do cargo obrigatório"), String(p.description ?? ""), p.sector_id || null]
        );
        const codes = Array.isArray(p.agent_codes) ? p.agent_codes.filter((c: unknown) => typeof c === "string") : [];
        for (const code of codes) {
          await db().query("INSERT INTO seg_role_agents (role_id, agent_code) VALUES ($1, $2) ON CONFLICT DO NOTHING", [p.id, code]);
        }
      } else if (m.operation === "update") {
        await db().query(
          "UPDATE seg_roles SET name = $2, description = $3, sector_id = $4 WHERE id = $1 AND client_id = $5",
          [p.role_id, str(p.name, "Nome do cargo obrigatório"), String(p.description ?? ""), p.sector_id || null, clientId]
        );
        if (Array.isArray(p.agent_codes)) {
          await db().query("DELETE FROM seg_role_agents WHERE role_id = $1", [p.role_id]);
          for (const code of p.agent_codes.filter((c: unknown) => typeof c === "string")) {
            await db().query("INSERT INTO seg_role_agents (role_id, agent_code) VALUES ($1, $2) ON CONFLICT DO NOTHING", [p.role_id, code]);
          }
        }
      } else if (m.operation === "delete") {
        await db().query("DELETE FROM seg_roles WHERE id = $1 AND client_id = $2", [p.role_id, clientId]);
      }
      break;
    }
    case "employees": {
      if (m.operation === "insert") {
        await db().query(
          "INSERT INTO seg_employees (id, client_id, name, role_id, sector_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
          [p.id, clientId, str(p.name, "Nome do funcionário obrigatório"), p.role_id || null, p.sector_id || null]
        );
      } else if (m.operation === "update") {
        await db().query(
          "UPDATE seg_employees SET name = $2, role_id = $3, sector_id = $4, active = $5 WHERE id = $1 AND client_id = $6",
          [p.employee_id, str(p.name, "Nome do funcionário obrigatório"), p.role_id || null, p.sector_id || null, p.active !== false, clientId]
        );
      } else if (m.operation === "delete") {
        await db().query("DELETE FROM seg_employees WHERE id = $1 AND client_id = $2", [p.employee_id, clientId]);
      }
      break;
    }
    case "inventory_risks": {
      if (m.operation === "upsert") {
        const gesId = str(p.ges_id, "GES obrigatório");
        const agentCode = str(p.agent_code, "Agente obrigatório");
        const inGes = await db().query("SELECT 1 FROM seg_ges_agents WHERE ges_id = $1 AND agent_code = $2", [gesId, agentCode]);
        if ((inGes.rowCount ?? 0) === 0) break; // agente fora do GES — ignora
        const frequency = str(p.frequency, "Frequência obrigatória").toUpperCase();
        const classification = classifyRisk(frequency, Number(p.severity));
        const nrCodes = Array.isArray(p.nr_codes) ? p.nr_codes.filter((c: unknown) => typeof c === "string") : [];
        await db().query(
          `INSERT INTO seg_inventory_risks
             (client_id, ges_id, agent_code, frequency, severity, classification, effects,
              existing_measures, proposed_measures, record_control, nr_codes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (client_id, ges_id, agent_code) DO UPDATE SET
             frequency = EXCLUDED.frequency, severity = EXCLUDED.severity, classification = EXCLUDED.classification,
             effects = EXCLUDED.effects, existing_measures = EXCLUDED.existing_measures,
             proposed_measures = EXCLUDED.proposed_measures, record_control = EXCLUDED.record_control,
             nr_codes = EXCLUDED.nr_codes`,
          [
            clientId, gesId, agentCode, frequency, Number(p.severity), classification,
            String(p.effects ?? ""), String(p.existing_measures ?? ""), String(p.proposed_measures ?? ""),
            String(p.record_control ?? ""), nrCodes,
          ]
        );
      } else if (m.operation === "delete") {
        await db().query("DELETE FROM seg_inventory_risks WHERE id = $1 AND client_id = $2", [p.risk_id, clientId]);
      }
      break;
    }
    case "action_plan": {
      if (m.operation === "insert") {
        await db().query(
          "INSERT INTO seg_action_plan (id, client_id, description, responsible, deadline, status, risk_id) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING",
          [p.id, clientId, str(p.description, "Descrição obrigatória"), p.responsible || null, p.deadline || null,
            ["pendente", "em_andamento", "concluido"].includes(String(p.status)) ? p.status : "pendente", p.risk_id || null]
        );
      } else if (m.operation === "update") {
        await db().query(
          "UPDATE seg_action_plan SET status = $2 WHERE id = $1 AND client_id = $3",
          [p.item_id, ["pendente", "em_andamento", "concluido"].includes(String(p.status)) ? p.status : "pendente", clientId]
        );
      } else if (m.operation === "delete") {
        await db().query("DELETE FROM seg_action_plan WHERE id = $1 AND client_id = $2", [p.item_id, clientId]);
      }
      break;
    }
    default:
      throw new Error("Entidade desconhecida: " + m.entity);
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const userId = await requireUserId(req);
    if (req.method !== "POST") return json(res, { error: "Método não suportado" }, 405);
    const body = await readJson<{ companyId?: string; mutations?: Mutation[] }>(req);
    const companyId = body.companyId ?? "";
    if (!companyId) return json(res, { error: "companyId obrigatório" }, 400);
    await assertCompanyAccess(userId, companyId);
    const mutations = Array.isArray(body.mutations) ? body.mutations : [];
    if (mutations.length === 0) return json(res, { ok: true, applied: 0 });

    const results: Array<{ client_mutation_id: string; status: string }> = [];
    for (const m of mutations) {
      const exists = await db().query(
        "SELECT 1 FROM seg_sync_outbox WHERE client_mutation_id = $1",
        [m.client_mutation_id]
      );
      if ((exists.rowCount ?? 0) > 0) {
        results.push({ client_mutation_id: m.client_mutation_id, status: "duplicate" });
        continue;
      }
      const client = await db().query(
        "SELECT 1 FROM seg_clients WHERE id = $1 AND company_id = $2 AND status = 'ativo'",
        [m.client_id, companyId]
      );
      if ((client.rowCount ?? 0) === 0) {
        results.push({ client_mutation_id: m.client_mutation_id, status: "forbidden" });
        continue;
      }
      try {
        await apply(String(m.client_id), m);
        await db().query(
          "INSERT INTO seg_sync_outbox (company_id, client_id, entity, operation, payload, client_mutation_id, status, synced_at) VALUES ($1, $2, $3, $4, $5, $6, 'synced', now()) ON CONFLICT DO NOTHING",
          [companyId, m.client_id, m.entity, m.operation, JSON.stringify(m.payload), m.client_mutation_id]
        );
        results.push({ client_mutation_id: m.client_mutation_id, status: "applied" });
      } catch (e) {
        results.push({ client_mutation_id: m.client_mutation_id, status: "error" });
        console.error("[sync]", m.entity, m.operation, e);
      }
    }

    return json(res, { ok: true, results });
  } catch (e) {
    return handleError(res, e);
  }
}
