import { requireUserId } from "../../_lib/auth.js";
import { db } from "../../_lib/db.js";
import { handleError, json, query, readJson } from "../../_lib/http.js";
import { assertClientAccess, isValidCnpj, optInt, optStr, str } from "../../_lib/seguranca.js";
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

    if (req.method === "DELETE") {
      await assertClientAccess(id, companyId);
      await db().query("UPDATE seg_clients SET status = 'arquivado', updated_at = now() WHERE id = $1", [id]);
      return json(res, { ok: true });
    }

    if (req.method === "PATCH") {
      const body = await readJson<Record<string, unknown>>(req);
      const current = await db().query("SELECT * FROM seg_clients WHERE id = $1 AND company_id = $2", [id, companyId]);
      if ((current.rowCount ?? 0) === 0) return json(res, { error: "Empresa cliente não encontrada" }, 404);
      const cur = current.rows[0];

      const cnpj = body.cnpj !== undefined ? str(body.cnpj, "CNPJ inválido").replace(/\D/g, "") : cur.cnpj;
      if (body.cnpj !== undefined) {
        if (!isValidCnpj(cnpj)) return json(res, { error: "CNPJ inválido" }, 400);
        const dup = await db().query("SELECT 1 FROM seg_clients WHERE company_id = $1 AND cnpj = $2 AND id <> $3", [companyId, cnpj, id]);
        if ((dup.rowCount ?? 0) > 0) return json(res, { error: "Já existe uma empresa com este CNPJ" }, 409);
      }
      const grauRisco = optInt(body.grau_risco ?? cur.grau_risco, "Grau de risco inválido");
      if (grauRisco !== null && (grauRisco < 1 || grauRisco > 4)) return json(res, { error: "Grau de risco deve ser 1–4" }, 400);

      const updated = await db().query(
        `UPDATE seg_clients SET
           razao_social = $2, cnpj = $3, cnae = $4, grau_risco = $5,
           endereco = COALESCE($6::jsonb, endereco), n_funcionarios = $7,
           responsavel = $8, atividade_principal = $9, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [
          id,
          str(body.razao_social ?? cur.razao_social, "Razão social é obrigatória"),
          cnpj,
          optStr(body.cnae ?? cur.cnae),
          grauRisco,
          body.endereco && typeof body.endereco === "object" ? JSON.stringify(body.endereco) : null,
          optInt(body.n_funcionarios ?? cur.n_funcionarios, "Número de funcionários inválido"),
          optStr(body.responsavel ?? cur.responsavel),
          optStr(body.atividade_principal ?? cur.atividade_principal),
        ]
      );
      return json(res, { client: updated.rows[0] });
    }

    // GET: cliente + contadores do painel
    const clientRes = await db().query("SELECT * FROM seg_clients WHERE id = $1 AND company_id = $2", [id, companyId]);
    if ((clientRes.rowCount ?? 0) === 0) return json(res, { error: "Empresa cliente não encontrada" }, 404);

    const [sectors, roles, employees, ges, risks, plan, docs] = await Promise.all([
      db().query("SELECT count(*)::int AS n FROM seg_sectors WHERE client_id = $1", [id]),
      db().query("SELECT count(*)::int AS n FROM seg_roles WHERE client_id = $1", [id]),
      db().query("SELECT count(*)::int AS n FROM seg_employees WHERE client_id = $1 AND active = true", [id]),
      db().query("SELECT count(*)::int AS n FROM seg_ges WHERE client_id = $1", [id]),
      db().query("SELECT count(*)::int AS n FROM seg_inventory_risks WHERE client_id = $1", [id]),
      db().query("SELECT count(*)::int AS n FROM seg_action_plan WHERE client_id = $1", [id]),
      db().query("SELECT count(*)::int AS n FROM seg_documents WHERE client_id = $1", [id]),
    ]);

    return json(res, {
      client: clientRes.rows[0],
      counts: {
        sectors: sectors.rows[0].n,
        roles: roles.rows[0].n,
        employees: employees.rows[0].n,
        ges: ges.rows[0].n,
        risks: risks.rows[0].n,
        plan: plan.rows[0].n,
        documents: docs.rows[0].n,
      },
    });
  } catch (e) {
    return handleError(res, e);
  }
}
