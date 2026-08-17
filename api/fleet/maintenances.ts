import { requireUserId } from "../_lib/auth";
import { db } from "../_lib/db";
import { handleError, json, readJson } from "../_lib/http";
import { assertCompanyAccess } from "../_lib/tenant";

export const config = { runtime: "nodejs" };

interface Payload {
  id?: string;
  vehicle_id?: string;
  type?: string;
  description?: string;
  date?: string;
  mileage_at_service?: number | null;
  cost?: number;
  vendor?: string | null;
  items_replaced?: string[];
  attachment_url?: string | null;
  notes?: string | null;
}

export default async function handler(request: Request) {
  try {
    const userId = await requireUserId(request);
    const url = new URL(request.url);
    const companyId = url.searchParams.get("companyId") || "";
    if (!companyId) return json({ error: "companyId obrigatório" }, 400);
    await assertCompanyAccess(userId, companyId);

    if (request.method === "GET") {
      const vehicleId = url.searchParams.get("vehicleId");
      const res = vehicleId
        ? await db().query("SELECT * FROM fleet_maintenances WHERE company_id = $1 AND vehicle_id = $2 ORDER BY date DESC", [companyId, vehicleId])
        : await db().query("SELECT * FROM fleet_maintenances WHERE company_id = $1 ORDER BY date DESC", [companyId]);
      return json(res.rows);
    }

    const body = await readJson<Payload>(request);

    if (request.method === "POST") {
      if (!body.vehicle_id || !body.description || !body.date) return json({ error: "Veículo, descrição e data são obrigatórios" }, 400);
      const res = await db().query(
        `INSERT INTO fleet_maintenances (vehicle_id, company_id, type, description, date, mileage_at_service, cost, vendor, items_replaced, attachment_url, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [body.vehicle_id, companyId, body.type ?? "corretiva", body.description, body.date, body.mileage_at_service ?? null, body.cost ?? 0, body.vendor ?? null, body.items_replaced ?? [], body.attachment_url ?? null, body.notes ?? null, userId]
      );
      return json(res.rows[0], 201);
    }

    if (request.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "id obrigatório" }, 400);
      await db().query("DELETE FROM fleet_maintenances WHERE company_id = $1 AND id = $2", [companyId, id]);
      return json({ ok: true });
    }

    return json({ error: "Método não suportado" }, 405);
  } catch (e) {
    return handleError(e);
  }
}
