import { requireUserId } from "../_lib/auth.js";
import { db } from "../_lib/db.js";
import { handleError, json, query, readJson } from "../_lib/http.js";
import type { IncomingMessage, ServerResponse } from "http";
import { assertCompanyAccess } from "../_lib/tenant.js";

export const config = { runtime: "nodejs" };

interface Payload {
  id?: string;
  vehicle_id?: string;
  type?: string;
  title?: string;
  due_date?: string;
  status?: string;
  cost?: number | null;
  paid_date?: string | null;
  notes?: string | null;
  attachment_url?: string | null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const userId = await requireUserId(req);
    const url = query(req);
    let companyId = url.get("companyId") || "";

    if (req.method === "GET") {
      const q = await db().query(
        "SELECT * FROM fleet_reminders WHERE company_id = $1 ORDER BY due_date",
        [companyId]
      );
      return json(res, q.rows);
    }

    let body = {} as Payload;
    if (req.method === "POST" || req.method === "PATCH") {
      body = await readJson<Payload>(req);
      const fromBody = (body as unknown as { companyId?: string }).companyId;
      if (fromBody) companyId = fromBody;
    }
    if (!companyId) return json(res, { error: "companyId obrigatório" }, 400);
    await assertCompanyAccess(userId, companyId);

    if (req.method === "POST") {
      if (!body.vehicle_id || !body.title || !body.due_date) return json(res, { error: "Veículo, título e vencimento são obrigatórios" }, 400);
      const q = await db().query(
        `INSERT INTO fleet_reminders (vehicle_id, company_id, type, title, due_date, status, cost, paid_date, notes, attachment_url, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [body.vehicle_id, companyId, body.type ?? "outro", body.title, body.due_date, body.status ?? "pendente", body.cost ?? null, body.paid_date ?? null, body.notes ?? null, body.attachment_url ?? null, userId]
      );
      return json(res, q.rows[0], 201);
    }

    if (req.method === "PATCH") {
      if (!body.id) return json(res, { error: "id obrigatório" }, 400);
      const sets: string[] = [];
      const vals: unknown[] = [];
      let i = 1;
      const fields: [string, unknown][] = [
        ["type", body.type], ["title", body.title], ["due_date", body.due_date],
        ["status", body.status], ["cost", body.cost], ["paid_date", body.paid_date],
        ["notes", body.notes], ["attachment_url", body.attachment_url],
      ];
      for (const [k, v] of fields) {
        if (v !== undefined) {
          sets.push(k + " = $" + i++);
          vals.push(v === "" ? null : v);
        }
      }
      vals.push(companyId, body.id);
      const q = await db().query(
        "UPDATE fleet_reminders SET " + sets.join(", ") + " WHERE company_id = $" + i++ + " AND id = $" + i + " RETURNING *",
        vals
      );
      if (q.rowCount === 0) return json(res, { error: "Lembrete não encontrado" }, 404);
      return json(res, q.rows[0]);
    }

    if (req.method === "DELETE") {
      const id = url.get("id");
      if (!id) return json(res, { error: "id obrigatório" }, 400);
      await db().query("DELETE FROM fleet_reminders WHERE company_id = $1 AND id = $2", [companyId, id]);
      return json(res, { ok: true });
    }

    return json(res, { error: "Método não suportado" }, 405);
  } catch (e) {
    return handleError(res, e);
  }
}
