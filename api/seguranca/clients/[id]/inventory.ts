import { requireUserId } from "../../../_lib/auth.js";
import { db } from "../../../_lib/db.js";
import { handleError, json, query, readJson } from "../../../_lib/http.js";
import { assertClientAccess, classifyRisk, str } from "../../../_lib/seguranca.js";
import type { IncomingMessage, ServerResponse } from "http";
import { assertCompanyAccess } from "../../../_lib/tenant.js";

export const config = { runtime: "nodejs" };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const userId = await requireUserId(req);
    const url = query(req);
    const id = new URL(req.url || "/", "http://localhost").pathname.split("/inventory")[0].split("/").pop() || "";
    const companyId = url.get("companyId");
    if (!id || !companyId) return json(res, { error: "Parâmetros obrigatórios ausentes" }, 400);
    await assertCompanyAccess(userId, companyId);
    await assertClientAccess(id, companyId);

    if (req.method === "GET") {
      const rows = await db().query(
        `SELECT r.id, r.ges_id, r.agent_code, r.frequency, r.severity, r.classification,
                r.effects, r.existing_measures, r.proposed_measures, r.record_control, r.nr_codes,
                a.agent, a.grp, a.subgroup,
                g.code AS ges_code, g.name AS ges_name
         FROM seg_inventory_risks r
         JOIN seg_ges g ON g.id = r.ges_id
         LEFT JOIN seg_esocial_agents a ON a.code = r.agent_code
         WHERE r.client_id = $1
         ORDER BY g.code, a.grp, a.code`,
        [id]
      );
      return json(res, { risks: rows.rows });
    }

    if (req.method === "PUT") {
      const body = await readJson<Record<string, unknown>>(req);
      const gesId = str(body.ges_id, "GES obrigatório");
      const agentCode = str(body.agent_code, "Agente obrigatório");

      const ges = await db().query("SELECT 1 FROM seg_ges WHERE id = $1 AND client_id = $2", [gesId, id]);
      if ((ges.rowCount ?? 0) === 0) return json(res, { error: "GES não encontrado" }, 404);

      const inGes = await db().query("SELECT 1 FROM seg_ges_agents WHERE ges_id = $1 AND agent_code = $2", [gesId, agentCode]);
      if ((inGes.rowCount ?? 0) === 0) return json(res, { error: "O agente não está vinculado a este GES" }, 400);

      const frequency = str(body.frequency, "Frequência obrigatória").toUpperCase();
      const severity = Number(body.severity);
      const classification = classifyRisk(frequency, severity);

      const nrCodes = Array.isArray(body.nr_codes)
        ? body.nr_codes.filter((c: unknown) => typeof c === "string")
        : [];

      const upserted = await db().query(
        `INSERT INTO seg_inventory_risks
           (client_id, ges_id, agent_code, frequency, severity, classification, effects,
            existing_measures, proposed_measures, record_control, nr_codes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (client_id, ges_id, agent_code) DO UPDATE SET
           frequency = EXCLUDED.frequency,
           severity = EXCLUDED.severity,
           classification = EXCLUDED.classification,
           effects = EXCLUDED.effects,
           existing_measures = EXCLUDED.existing_measures,
           proposed_measures = EXCLUDED.proposed_measures,
           record_control = EXCLUDED.record_control,
           nr_codes = EXCLUDED.nr_codes
         RETURNING *`,
        [
          id, gesId, agentCode, frequency, severity, classification,
          String(body.effects ?? ""), String(body.existing_measures ?? ""),
          String(body.proposed_measures ?? ""), String(body.record_control ?? ""),
          nrCodes,
        ]
      );
      return json(res, { risk: upserted.rows[0] });
    }

    if (req.method === "DELETE") {
      const riskId = url.get("riskId");
      if (!riskId) return json(res, { error: "riskId obrigatório" }, 400);
      await db().query("DELETE FROM seg_inventory_risks WHERE id = $1 AND client_id = $2", [riskId, id]);
      return json(res, { ok: true });
    }

    return json(res, { error: "Método não suportado" }, 405);
  } catch (e) {
    return handleError(res, e);
  }
}
