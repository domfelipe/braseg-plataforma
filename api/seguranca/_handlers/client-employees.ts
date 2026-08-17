import { requireUserId } from "../../_lib/auth.js";
import { db } from "../../_lib/db.js";
import { handleError, json, query, readJson, resolveCompanyId } from "../../_lib/http.js";
import { assertClientAccess, str } from "../../_lib/seguranca.js";
import type { IncomingMessage, ServerResponse } from "http";
import { assertCompanyAccess } from "../../_lib/tenant.js";

export const config = { runtime: "nodejs" };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const userId = await requireUserId(req);
    const url = query(req);
    const id = new URL(req.url || "/", "http://localhost").pathname.split("/employees")[0].split("/").pop() || "";
    if (!id) return json(res, { error: "Parâmetros obrigatórios ausentes" }, 400);

    if (req.method === "GET") {
      const companyId = url.get("companyId");
      if (!companyId) return json(res, { error: "companyId obrigatório" }, 400);
      await assertCompanyAccess(userId, companyId);
      await assertClientAccess(id, companyId);
      const rows = await db().query(
        `SELECT e.id, e.name, e.role_id, e.sector_id, e.active, r.name AS role_name, s.name AS sector_name
         FROM seg_employees e
         LEFT JOIN seg_roles r ON r.id = e.role_id
         LEFT JOIN seg_sectors s ON s.id = e.sector_id
         WHERE e.client_id = $1
         ORDER BY e.active DESC, e.name`,
        [id]
      );
      return json(res, { employees: rows.rows });
    }

    if (req.method === "POST") {
      const body = await readJson<Record<string, unknown>>(req);
      const companyId = await resolveCompanyId(req, body);
      await assertCompanyAccess(userId, companyId);
      await assertClientAccess(id, companyId);
      const name = str(body.name, "Nome do funcionário é obrigatório");
      const roleId = typeof body.role_id === "string" && body.role_id !== "" ? body.role_id : null;
      const sectorId = typeof body.sector_id === "string" && body.sector_id !== "" ? body.sector_id : null;
      const inserted = await db().query(
        "INSERT INTO seg_employees (client_id, name, role_id, sector_id) VALUES ($1, $2, $3, $4) RETURNING *",
        [id, name, roleId, sectorId]
      );
      return json(res, { employee: inserted.rows[0] }, 201);
    }

    if (req.method === "PATCH") {
      const body = await readJson<Record<string, unknown>>(req);
      const companyId = await resolveCompanyId(req, body);
      await assertCompanyAccess(userId, companyId);
      await assertClientAccess(id, companyId);
      const employeeId = url.get("employeeId");
      if (!employeeId) return json(res, { error: "employeeId obrigatório" }, 400);
      const exists = await db().query("SELECT * FROM seg_employees WHERE id = $1 AND client_id = $2", [employeeId, id]);
      if ((exists.rowCount ?? 0) === 0) return json(res, { error: "Funcionário não encontrado" }, 404);

      const updated = await db().query(
        `UPDATE seg_employees SET
           name = $2,
           role_id = $3,
           sector_id = $4,
           active = $5
         WHERE id = $1 RETURNING *`,
        [
          employeeId,
          body.name !== undefined ? str(body.name, "Nome do funcionário é obrigatório") : exists.rows[0].name,
          body.role_id !== undefined ? (typeof body.role_id === "string" && body.role_id !== "" ? body.role_id : null) : exists.rows[0].role_id,
          body.sector_id !== undefined ? (typeof body.sector_id === "string" && body.sector_id !== "" ? body.sector_id : null) : exists.rows[0].sector_id,
          body.active !== undefined ? Boolean(body.active) : exists.rows[0].active,
        ]
      );
      return json(res, { employee: updated.rows[0] });
    }

    if (req.method === "DELETE") {
      const companyId = url.get("companyId");
      if (!companyId) return json(res, { error: "companyId obrigatório" }, 400);
      await assertCompanyAccess(userId, companyId);
      await assertClientAccess(id, companyId);
      const employeeId = url.get("employeeId");
      if (!employeeId) return json(res, { error: "employeeId obrigatório" }, 400);
      await db().query("DELETE FROM seg_employees WHERE id = $1 AND client_id = $2", [employeeId, id]);
      return json(res, { ok: true });
    }

    return json(res, { error: "Método não suportado" }, 405);
  } catch (e) {
    return handleError(res, e);
  }
}
