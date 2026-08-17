import { requireUserId } from "../../_lib/auth.js";
import { db } from "../../_lib/db.js";
import { handleError, json, query, readJson, resolveCompanyId } from "../../_lib/http.js";
import { assertClientAccess, str } from "../../_lib/seguranca.js";
import type { IncomingMessage, ServerResponse } from "http";
import { assertCompanyAccess } from "../../_lib/tenant.js";

export const config = { runtime: "nodejs" };

async function listGes(clientId: string) {
  const res = await db().query(
    `SELECT g.id, g.code, g.name, g.sector_id, g.activities, s.name AS sector_name,
            COALESCE(array_agg(DISTINCT ga.agent_code) FILTER (WHERE ga.agent_code IS NOT NULL), '{}') AS agent_codes,
            (SELECT count(*)::int FROM seg_ges_photos p WHERE p.ges_id = g.id) AS photo_count,
            (SELECT count(*)::int FROM seg_inventory_risks r WHERE r.ges_id = g.id) AS risk_count
     FROM seg_ges g
     LEFT JOIN seg_sectors s ON s.id = g.sector_id
     LEFT JOIN seg_ges_agents ga ON ga.ges_id = g.id
     WHERE g.client_id = $1
     GROUP BY g.id, s.name
     ORDER BY g.code`,
    [clientId]
  );
  return res.rows;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const userId = await requireUserId(req);
    const url = query(req);
    const id = new URL(req.url || "/", "http://localhost").pathname.split("/ges")[0].split("/").pop() || "";
    if (!id) return json(res, { error: "Parâmetros obrigatórios ausentes" }, 400);

    if (req.method === "GET") {
      const companyId = url.get("companyId");
      if (!companyId) return json(res, { error: "companyId obrigatório" }, 400);
      await assertCompanyAccess(userId, companyId);
      await assertClientAccess(id, companyId);
      return json(res, { ges: await listGes(id) });
    }

    if (req.method === "POST") {
      const body = await readJson<Record<string, unknown>>(req);
      const companyId = await resolveCompanyId(req, body);
      await assertCompanyAccess(userId, companyId);
      await assertClientAccess(id, companyId);
      if (body.mode !== "auto") return json(res, { error: "Apenas o modo 'auto' é suportado" }, 400);

      // Cargos ainda não vinculados a nenhum GES
      const rolesRes = await db().query(
        `SELECT r.id, r.name, r.description, r.sector_id, s.name AS sector_name,
                COALESCE(array_agg(DISTINCT ra.agent_code) FILTER (WHERE ra.agent_code IS NOT NULL), '{}') AS agent_codes
         FROM seg_roles r
         LEFT JOIN seg_sectors s ON s.id = r.sector_id
         LEFT JOIN seg_role_agents ra ON ra.role_id = r.id
         LEFT JOIN seg_ges_roles gr ON gr.role_id = r.id
         WHERE r.client_id = $1 AND gr.role_id IS NULL
         GROUP BY r.id, s.name
         ORDER BY s.name, r.name`,
        [id]
      );
      const roles = rolesRes.rows as Array<{
        id: string; name: string; description: string; sector_id: string | null;
        sector_name: string | null; agent_codes: string[];
      }>;
      if (roles.length === 0) return json(res, { error: "Todos os cargos já estão vinculados a GES" }, 400);

      const seq = await db().query(
        "SELECT COALESCE(MAX(substring(code from '([0-9]+)$')::int), 0) AS n FROM seg_ges WHERE client_id = $1",
        [id]
      );
      let next = (seq.rows[0]?.n ?? 0) + 1;

      const created: unknown[] = [];
      const groups = new Map<string, typeof roles>();
      for (const role of roles) {
        const key = (role.sector_id ?? "") + "|" + role.name;
        const g = groups.get(key) ?? [];
        g.push(role);
        groups.set(key, g);
      }

      for (const group of groups.values()) {
        const first = group[0];
        const code = "GES " + String(next).padStart(2, "0");
        next += 1;
        const name = (first.sector_name ? first.sector_name + " — " : "") + first.name;
        const activities = [...new Set(group.map((r) => r.description).filter(Boolean))].join("; ");
        const agents = [...new Set(group.flatMap((r) => r.agent_codes))];

        const inserted = await db().query(
          "INSERT INTO seg_ges (client_id, code, name, sector_id, activities) VALUES ($1, $2, $3, $4, $5) RETURNING *",
          [id, code, name, first.sector_id, activities]
        );
        for (const agentCode of agents) {
          await db().query(
            "INSERT INTO seg_ges_agents (ges_id, agent_code) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [inserted.rows[0].id, agentCode]
          );
        }
        for (const role of group) {
          await db().query(
            "INSERT INTO seg_ges_roles (ges_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [inserted.rows[0].id, role.id]
          );
        }
        created.push(inserted.rows[0]);
      }

      return json(res, { created }, 201);
    }

    if (req.method === "PATCH") {
      const body = await readJson<Record<string, unknown>>(req);
      const companyId = await resolveCompanyId(req, body);
      await assertCompanyAccess(userId, companyId);
      await assertClientAccess(id, companyId);
      const gesId = url.get("gesId");
      if (!gesId) return json(res, { error: "gesId obrigatório" }, 400);
      const exists = await db().query("SELECT * FROM seg_ges WHERE id = $1 AND client_id = $2", [gesId, id]);
      if ((exists.rowCount ?? 0) === 0) return json(res, { error: "GES não encontrado" }, 404);

      const name = body.name !== undefined ? str(body.name, "Nome do GES é obrigatório") : exists.rows[0].name;
      const activities = body.activities !== undefined ? String(body.activities).trim() : exists.rows[0].activities;
      const sectorId = body.sector_id !== undefined
        ? (typeof body.sector_id === "string" && body.sector_id !== "" ? body.sector_id : null)
        : exists.rows[0].sector_id;

      await db().query(
        "UPDATE seg_ges SET name = $2, activities = $3, sector_id = $4 WHERE id = $1",
        [gesId, name, activities, sectorId]
      );
      if (Array.isArray(body.agent_codes)) {
        const codes = body.agent_codes.filter((c: unknown) => typeof c === "string");
        await db().query("DELETE FROM seg_ges_agents WHERE ges_id = $1", [gesId]);
        for (const code of codes) {
          await db().query("INSERT INTO seg_ges_agents (ges_id, agent_code) VALUES ($1, $2) ON CONFLICT DO NOTHING", [gesId, code]);
        }
      }
      return json(res, { ges: (await listGes(id)).find((g: { id: string }) => g.id === gesId) ?? null });
    }

    if (req.method === "DELETE") {
      const companyId = url.get("companyId");
      if (!companyId) return json(res, { error: "companyId obrigatório" }, 400);
      await assertCompanyAccess(userId, companyId);
      await assertClientAccess(id, companyId);
      const gesId = url.get("gesId");
      if (!gesId) return json(res, { error: "gesId obrigatório" }, 400);
      await db().query("DELETE FROM seg_ges WHERE id = $1 AND client_id = $2", [gesId, id]);
      return json(res, { ok: true });
    }

    return json(res, { error: "Método não suportado" }, 405);
  } catch (e) {
    return handleError(res, e);
  }
}
