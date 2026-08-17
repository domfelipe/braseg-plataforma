import { requireUserId } from "../../../_lib/auth.js";
import { db } from "../../../_lib/db.js";
import { handleError, json, query, readJson } from "../../../_lib/http.js";
import { assertClientAccess, str } from "../../../_lib/seguranca.js";
import type { IncomingMessage, ServerResponse } from "http";
import { assertCompanyAccess } from "../../../_lib/tenant.js";

export const config = { runtime: "nodejs" };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const userId = await requireUserId(req);
    const url = query(req);
    const id = new URL(req.url || "/", "http://localhost").pathname.split("/action-plan")[0].split("/").pop() || "";
    const companyId = url.get("companyId");
    if (!id || !companyId) return json(res, { error: "Parâmetros obrigatórios ausentes" }, 400);
    await assertCompanyAccess(userId, companyId);
    await assertClientAccess(id, companyId);

    if (req.method === "GET") {
      const rows = await db().query(
        `SELECT ap.id, ap.description, ap.responsible, ap.deadline, ap.status, ap.risk_id,
                r.agent_code, g.name AS ges_name, a.agent
         FROM seg_action_plan ap
         LEFT JOIN seg_inventory_risks r ON r.id = ap.risk_id
         LEFT JOIN seg_ges g ON g.id = r.ges_id
         LEFT JOIN seg_esocial_agents a ON a.code = r.agent_code
         WHERE ap.client_id = $1
         ORDER BY ap.status, ap.deadline NULLS LAST, ap.id`,
        [id]
      );
      return json(res, { items: rows.rows });
    }

    if (req.method === "POST") {
      const body = await readJson<Record<string, unknown>>(req);
      const description = str(body.description, "Descrição é obrigatória");
      const inserted = await db().query(
        `INSERT INTO seg_action_plan (client_id, description, responsible, deadline, status, risk_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          id,
          description,
          typeof body.responsible === "string" && body.responsible !== "" ? body.responsible : null,
          typeof body.deadline === "string" && body.deadline !== "" ? body.deadline : null,
          typeof body.status === "string" && ["pendente", "em_andamento", "concluido"].includes(body.status) ? body.status : "pendente",
          typeof body.risk_id === "string" && body.risk_id !== "" ? body.risk_id : null,
        ]
      );
      return json(res, { item: inserted.rows[0] }, 201);
    }

    if (req.method === "PATCH") {
      const itemId = url.get("itemId");
      if (!itemId) return json(res, { error: "itemId obrigatório" }, 400);
      const exists = await db().query("SELECT * FROM seg_action_plan WHERE id = $1 AND client_id = $2", [itemId, id]);
      if ((exists.rowCount ?? 0) === 0) return json(res, { error: "Item não encontrado" }, 404);
      const body = await readJson<Record<string, unknown>>(req);
      const cur = exists.rows[0];

      const status = body.status !== undefined ? str(body.status, "Status inválido") : cur.status;
      if (!["pendente", "em_andamento", "concluido"].includes(status)) return json(res, { error: "Status inválido" }, 400);

      const updated = await db().query(
        `UPDATE seg_action_plan SET
           description = $2, responsible = $3, deadline = $4, status = $5
         WHERE id = $1 RETURNING *`,
        [
          itemId,
          body.description !== undefined ? str(body.description, "Descrição é obrigatória") : cur.description,
          body.responsible !== undefined ? (typeof body.responsible === "string" && body.responsible !== "" ? body.responsible : null) : cur.responsible,
          body.deadline !== undefined ? (typeof body.deadline === "string" && body.deadline !== "" ? body.deadline : null) : cur.deadline,
          status,
        ]
      );
      return json(res, { item: updated.rows[0] });
    }

    if (req.method === "DELETE") {
      const itemId = url.get("itemId");
      if (!itemId) return json(res, { error: "itemId obrigatório" }, 400);
      await db().query("DELETE FROM seg_action_plan WHERE id = $1 AND client_id = $2", [itemId, id]);
      return json(res, { ok: true });
    }

    return json(res, { error: "Método não suportado" }, 405);
  } catch (e) {
    return handleError(res, e);
  }
}
