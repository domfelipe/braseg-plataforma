import { requireUserId } from "../../_lib/auth";
import { db } from "../../_lib/db";
import { handleError, json, query } from "../../_lib/http";
import type { IncomingMessage, ServerResponse } from "http";
import { assertCompanyAccess } from "../../_lib/tenant";

export const config = { runtime: "nodejs" };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const userId = await requireUserId(req);
    const url = query(req);
    const id = new URL(req.url || "/", "http://localhost").pathname.split("/").pop() || "";
    const companyId = url.get("companyId") || "";
    if (!id || !companyId) return json(res, { error: "Parâmetros obrigatórios ausentes" }, 400);
    await assertCompanyAccess(userId, companyId);

    const chk = await db().query(
      `SELECT c.*, v.plate, v.brand, v.model, t.name AS template_name
       FROM fleet_checklists c
       JOIN fleet_vehicles v ON v.id = c.vehicle_id
       JOIN fleet_checklist_templates t ON t.id = c.template_id
       WHERE c.id = $1 AND c.company_id = $2`,
      [id, companyId]
    );
    if (chk.rowCount === 0) return json(res, { error: "Inspeção não encontrada" }, 404);

    const [answers, photos] = await Promise.all([
      db().query(
        `SELECT a.*, i.description, i.required
         FROM fleet_checklist_answers a
         JOIN fleet_checklist_items i ON i.id = a.item_id
         WHERE a.checklist_id = $1 ORDER BY i.sort_order`,
        [id]
      ),
      db().query("SELECT id, data_url, created_at FROM fleet_checklist_photos WHERE checklist_id = $1 ORDER BY created_at", [id]),
    ]);

    return json(res, { checklist: chk.rows[0], answers: answers.rows, photos: photos.rows });
  } catch (e) {
    return handleError(res, e);
  }
}