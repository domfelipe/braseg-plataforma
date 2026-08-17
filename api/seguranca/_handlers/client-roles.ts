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
    const id = new URL(req.url || "/", "http://localhost").pathname.split("/roles")[0].split("/").pop() || "";
    if (!id) return json(res, { error: "Parâmetros obrigatórios ausentes" }, 400);

    if (req.method === "GET") {
      const companyId = url.get("companyId");
      if (!companyId) return json(res, { error: "companyId obrigatório" }, 400);
      await assertCompanyAccess(userId, companyId);
      await assertClientAccess(id, companyId);
      const rows = await db().query(
        `SELECT r.id, r.name, r.description, r.sector_id, s.name AS sector_name,
                COALESCE(array_agg(ra.agent_code) FILTER (WHERE ra.agent_code IS NOT NULL), '{}') AS agent_codes
         FROM seg_roles r
         LEFT JOIN seg_sectors s ON s.id = r.sector_id
         LEFT JOIN seg_role_agents ra ON ra.role_id = r.id
         WHERE r.client_id = $1
         GROUP BY r.id, s.name
         ORDER BY r.name`,
        [id]
      );
      return json(res, { roles: rows.rows });
    }

    if (req.method === "POST") {
      const body = await readJson<Record<string, unknown>>(req);
      const companyId = await resolveCompanyId(req, body);
      await assertCompanyAccess(userId, companyId);
      await assertClientAccess(id, companyId);
      const name = str(body.name, "Nome do cargo é obrigatório");
      const sectorId = typeof body.sector_id === "string" && body.sector_id !== "" ? body.sector_id : null;
      const inserted = await db().query(
        "INSERT INTO seg_roles (client_id, name, description, sector_id) VALUES ($1, $2, $3, $4) RETURNING *",
        [id, name, str(body.description ?? "", "Descrição inválida") === "" ? "" : String(body.description).trim(), sectorId]
      );
      return json(res, { role: inserted.rows[0] }, 201);
    }

    if (req.method === "PATCH") {
      const body = await readJson<Record<string, unknown>>(req);
      const companyId = await resolveCompanyId(req, body);
      await assertCompanyAccess(userId, companyId);
      await assertClientAccess(id, companyId);
      const roleId = url.get("roleId");
      if (!roleId) return json(res, { error: "roleId obrigatório" }, 400);
      const exists = await db().query("SELECT * FROM seg_roles WHERE id = $1 AND client_id = $2", [roleId, id]);
      if ((exists.rowCount ?? 0) === 0) return json(res, { error: "Cargo não encontrado" }, 404);

      const name = body.name !== undefined ? str(body.name, "Nome do cargo é obrigatório") : exists.rows[0].name;
      const description = body.description !== undefined ? String(body.description).trim() : exists.rows[0].description;
      const sectorId = body.sector_id !== undefined
        ? (typeof body.sector_id === "string" && body.sector_id !== "" ? body.sector_id : null)
        : exists.rows[0].sector_id;

      await db().query(
        "UPDATE seg_roles SET name = $2, description = $3, sector_id = $4 WHERE id = $1",
        [roleId, name, description, sectorId]
      );

      if (Array.isArray(body.agent_codes)) {
        const codes = body.agent_codes.filter((c: unknown) => typeof c === "string");
        await db().query("DELETE FROM seg_role_agents WHERE role_id = $1", [roleId]);
        for (const code of codes) {
          await db().query(
            "INSERT INTO seg_role_agents (role_id, agent_code) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [roleId, code]
          );
        }
      }

      const updated = await db().query(
        `SELECT r.id, r.name, r.description, r.sector_id, s.name AS sector_name,
                COALESCE(array_agg(ra.agent_code) FILTER (WHERE ra.agent_code IS NOT NULL), '{}') AS agent_codes
         FROM seg_roles r
         LEFT JOIN seg_sectors s ON s.id = r.sector_id
         LEFT JOIN seg_role_agents ra ON ra.role_id = r.id
         WHERE r.id = $1
         GROUP BY r.id, s.name`,
        [roleId]
      );
      return json(res, { role: updated.rows[0] });
    }

    if (req.method === "DELETE") {
      const companyId = url.get("companyId");
      if (!companyId) return json(res, { error: "companyId obrigatório" }, 400);
      await assertCompanyAccess(userId, companyId);
      await assertClientAccess(id, companyId);
      const roleId = url.get("roleId");
      if (!roleId) return json(res, { error: "roleId obrigatório" }, 400);
      await db().query("DELETE FROM seg_roles WHERE id = $1 AND client_id = $2", [roleId, id]);
      return json(res, { ok: true });
    }

    return json(res, { error: "Método não suportado" }, 405);
  } catch (e) {
    return handleError(res, e);
  }
}
