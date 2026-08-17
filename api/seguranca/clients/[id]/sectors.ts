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
    const id = new URL(req.url || "/", "http://localhost").pathname.split("/sectors")[0].split("/").pop() || "";
    const companyId = url.get("companyId");
    if (!id || !companyId) return json(res, { error: "Parâmetros obrigatórios ausentes" }, 400);
    await assertCompanyAccess(userId, companyId);
    await assertClientAccess(id, companyId);

    if (req.method === "GET") {
      const rows = await db().query(
        "SELECT id, name, sort_order FROM seg_sectors WHERE client_id = $1 ORDER BY sort_order, name",
        [id]
      );
      return json(res, { sectors: rows.rows });
    }

    if (req.method === "POST") {
      const body = await readJson<Record<string, unknown>>(req);
      const name = str(body.name, "Nome do setor é obrigatório");
      const inserted = await db().query(
        "INSERT INTO seg_sectors (client_id, name) VALUES ($1, $2) RETURNING *",
        [id, name]
      );
      return json(res, { sector: inserted.rows[0] }, 201);
    }

    if (req.method === "DELETE") {
      const sectorId = url.get("sectorId");
      if (!sectorId) return json(res, { error: "sectorId obrigatório" }, 400);
      await db().query("DELETE FROM seg_sectors WHERE id = $1 AND client_id = $2", [sectorId, id]);
      return json(res, { ok: true });
    }

    return json(res, { error: "Método não suportado" }, 405);
  } catch (e) {
    return handleError(res, e);
  }
}
