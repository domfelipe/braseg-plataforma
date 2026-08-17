import { requireUserId } from "../_lib/auth";
import { db } from "../_lib/db";
import { handleError, json, query, readJson } from "../_lib/http";
import type { IncomingMessage, ServerResponse } from "http";
import { assertCompanyAccess } from "../_lib/tenant";

export const config = { runtime: "nodejs" };

interface VehiclePayload {
  id?: string;
  plate?: string;
  brand?: string;
  model?: string;
  year?: number | null;
  color?: string | null;
  fuel_type?: string | null;
  current_mileage?: number;
  renavam?: string | null;
  chassis?: string | null;
  status?: string;
  ipva_due_date?: string | null;
  licensing_due_date?: string | null;
  insurance_due_date?: string | null;
  insurance_company?: string | null;
  acquisition_date?: string | null;
  acquisition_cost?: number | null;
  notes?: string | null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const userId = await requireUserId(req);
    const url = query(req);
    let companyId = url.get("companyId") || "";

    if (req.method === "GET") {
      const q = await db().query(
        "SELECT * FROM fleet_vehicles WHERE company_id = $1 ORDER BY plate",
        [companyId]
      );
      return json(res, q.rows);
    }

    let body = {} as VehiclePayload;
    if (req.method === "POST" || req.method === "PATCH") {
      body = await readJson<VehiclePayload>(req);
      const fromBody = (body as unknown as { companyId?: string }).companyId;
      if (fromBody) companyId = fromBody;
    }
    if (!companyId) return json(res, { error: "companyId obrigatório" }, 400);
    await assertCompanyAccess(userId, companyId);

    if (req.method === "POST") {
      if (!body.plate || !body.brand || !body.model) return json(res, { error: "Placa, marca e modelo são obrigatórios" }, 400);
      const q = await db().query(
        `INSERT INTO fleet_vehicles (company_id, plate, brand, model, year, color, fuel_type, current_mileage, renavam, chassis, status, ipva_due_date, licensing_due_date, insurance_due_date, insurance_company, acquisition_date, acquisition_cost, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [companyId, body.plate.toUpperCase(), body.brand, body.model, body.year ?? null, body.color ?? null, body.fuel_type ?? null, body.current_mileage ?? 0, body.renavam ?? null, body.chassis ?? null, body.status ?? "ativo", body.ipva_due_date ?? null, body.licensing_due_date ?? null, body.insurance_due_date ?? null, body.insurance_company ?? null, body.acquisition_date ?? null, body.acquisition_cost ?? null, body.notes ?? null]
      );
      return json(res, q.rows[0], 201);
    }

    if (req.method === "PATCH") {
      if (!body.id) return json(res, { error: "id obrigatório" }, 400);
      const sets: string[] = [];
      const vals: unknown[] = [];
      let i = 1;
      const fields: [string, unknown][] = [
        ["plate", body.plate?.toUpperCase()], ["brand", body.brand], ["model", body.model],
        ["year", body.year], ["color", body.color], ["fuel_type", body.fuel_type],
        ["current_mileage", body.current_mileage], ["renavam", body.renavam], ["chassis", body.chassis],
        ["status", body.status], ["ipva_due_date", body.ipva_due_date], ["licensing_due_date", body.licensing_due_date],
        ["insurance_due_date", body.insurance_due_date], ["insurance_company", body.insurance_company],
        ["acquisition_date", body.acquisition_date], ["acquisition_cost", body.acquisition_cost], ["notes", body.notes],
      ];
      for (const [k, v] of fields) {
        if (v !== undefined) {
          sets.push(k + " = $" + i++);
          vals.push(v === "" ? null : v);
        }
      }
      sets.push("updated_at = now()");
      vals.push(companyId, body.id);
      const q = await db().query(
        "UPDATE fleet_vehicles SET " + sets.join(", ") + " WHERE company_id = $" + i++ + " AND id = $" + i + " RETURNING *",
        vals
      );
      if (q.rowCount === 0) return json(res, { error: "Veículo não encontrado" }, 404);
      return json(res, q.rows[0]);
    }

    if (req.method === "DELETE") {
      const id = url.get("id");
      if (!id) return json(res, { error: "id obrigatório" }, 400);
      await db().query("DELETE FROM fleet_vehicles WHERE company_id = $1 AND id = $2", [companyId, id]);
      return json(res, { ok: true });
    }

    return json(res, { error: "Método não suportado" }, 405);
  } catch (e) {
    return handleError(res, e);
  }
}
