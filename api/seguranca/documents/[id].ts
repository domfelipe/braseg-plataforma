import { requireUserId } from "../../_lib/auth.js";
import { db } from "../../_lib/db.js";
import { handleError, json, query } from "../../_lib/http.js";
import type { IncomingMessage, ServerResponse } from "http";
import { assertCompanyAccess } from "../../_lib/tenant.js";

export const config = { runtime: "nodejs" };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const userId = await requireUserId(req);
    const url = query(req);
    const id = new URL(req.url || "/", "http://localhost").pathname.split("/").pop() || "";
    const companyId = url.get("companyId");
    if (!id || !companyId) return json(res, { error: "Parâmetros obrigatórios ausentes" }, 400);
    await assertCompanyAccess(userId, companyId);

    const row = await db().query(
      `SELECT d.*, c.company_id
       FROM seg_documents d
       JOIN seg_clients c ON c.id = d.client_id
       WHERE d.id = $1`,
      [id]
    );
    if ((row.rowCount ?? 0) === 0) return json(res, { error: "Documento não encontrado" }, 404);
    if (row.rows[0].company_id !== companyId) return json(res, { error: "Sem acesso a este documento" }, 403);

    const revisions = await db().query(
      "SELECT version, note, changed_at FROM seg_document_revisions WHERE document_id = $1 ORDER BY changed_at",
      [id]
    );

    return json(res, { document: row.rows[0], revisions: revisions.rows });
  } catch (e) {
    return handleError(res, e);
  }
}
