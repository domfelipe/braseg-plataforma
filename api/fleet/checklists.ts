import { requireUserId } from "../_lib/auth";
import { db } from "../_lib/db";
import { handleError, json, query, readJson } from "../_lib/http";
import type { IncomingMessage, ServerResponse } from "http";
import { assertCompanyAccess } from "../_lib/tenant";

export const config = { runtime: "nodejs" };

interface CreatePayload {
  companyId: string;
  vehicle_id: string;
  template_id: string;
  driver_name: string | null;
  odometer: number | null;
  status: "conforme" | "nao_conforme";
  notes: string | null;
  signature_data_url: string;
  answers: { item_id: string; ok: boolean; observation: string | null }[];
  photos: string[]; // data URLs
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const userId = await requireUserId(req);
    const url = query(req);
    const companyId = url.get("companyId") || "";
    if (!companyId) return json(res, { error: "companyId obrigatório" }, 400);
    await assertCompanyAccess(userId, companyId);

    if (req.method === "GET") {
      const q = await db().query(
        `SELECT c.*, v.plate, v.brand, v.model
         FROM fleet_checklists c
         JOIN fleet_vehicles v ON v.id = c.vehicle_id
         WHERE c.company_id = $1
         ORDER BY c.created_at DESC
         LIMIT 100`,
        [companyId]
      );
      const todayRes = await db().query(
        "SELECT DISTINCT vehicle_id FROM fleet_checklists WHERE company_id = $1 AND created_at::date = CURRENT_DATE",
        [companyId]
      );
      const todayIds = todayRes.rows.map((r) => r.vehicle_id);
      return json(res, { rows: q.rows, todayIds });
    }

    if (req.method === "POST") {
      const body = await readJson<CreatePayload>(req);
      if (!body.vehicle_id || !body.template_id || !body.signature_data_url) {
        return json(res, { error: "Veículo, modelo e assinatura são obrigatórios" }, 400);
      }
      if (!Array.isArray(body.answers) || body.answers.length === 0) {
        return json(res, { error: "Responda todos os itens" }, 400);
      }

      const client = await db().connect();
      try {
        await client.query("BEGIN");
        const chk = await client.query(
          `INSERT INTO fleet_checklists (company_id, vehicle_id, template_id, driver_name, odometer, status, notes, signature_data_url, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [companyId, body.vehicle_id, body.template_id, body.driver_name, body.odometer, body.status, body.notes, body.signature_data_url, userId]
        );
        const checklistId = chk.rows[0].id;
        for (const a of body.answers) {
          await client.query(
            "INSERT INTO fleet_checklist_answers (checklist_id, item_id, ok, observation) VALUES ($1,$2,$3,$4)",
            [checklistId, a.item_id, a.ok, a.observation]
          );
        }
        for (const p of body.photos || []) {
          await client.query(
            "INSERT INTO fleet_checklist_photos (checklist_id, data_url) VALUES ($1,$2)",
            [checklistId, p]
          );
        }
        await client.query("COMMIT");
        return json(res, chk.rows[0], 201);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }

    return json(res, { error: "Método não suportado" }, 405);
  } catch (e) {
    return handleError(res, e);
  }
}
