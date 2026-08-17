import { requireUserId } from "../../_lib/auth.js";
import { db } from "../../_lib/db.js";
import { handleError, json, query } from "../../_lib/http.js";
import type { IncomingMessage, ServerResponse } from "http";
import { assertCompanyAccess } from "../../_lib/tenant.js";

export const config = { runtime: "nodejs" };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const userId = await requireUserId(req);
    const companyId = query(req).get("companyId");
    if (!companyId) return json(res, { error: "companyId obrigatório" }, 400);
    await assertCompanyAccess(userId, companyId);

    const [agents, nrs] = await Promise.all([
      db().query(
        "SELECT code, grp, subgroup, agent FROM seg_esocial_agents WHERE active = true ORDER BY code"
      ),
      db().query(
        "SELECT code, title, url FROM seg_nrs WHERE active = true ORDER BY code"
      ),
    ]);

    return json(res, { agents: agents.rows, nrs: nrs.rows });
  } catch (e) {
    return handleError(res, e);
  }
}
