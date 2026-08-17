import { requireUserId } from "../../_lib/auth.js";
import { db } from "../../_lib/db.js";
import { handleError, json, query, readJson } from "../../_lib/http.js";
import { isValidCnpj, optInt, optStr, str } from "../../_lib/seguranca.js";
import type { IncomingMessage, ServerResponse } from "http";
import { assertCompanyAccess } from "../../_lib/tenant.js";

export const config = { runtime: "nodejs" };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const userId = await requireUserId(req);
    const companyId = query(req).get("companyId");
    if (!companyId) return json(res, { error: "companyId obrigatório" }, 400);
    await assertCompanyAccess(userId, companyId);

    if (req.method === "GET") {
      const rows = await db().query(
        `SELECT id, razao_social, cnpj, grau_risco, n_funcionarios, responsavel, atividade_principal, status, updated_at
         FROM seg_clients WHERE company_id = $1 AND status = 'ativo' ORDER BY razao_social`,
        [companyId]
      );
      return json(res, { clients: rows.rows });
    }

    if (req.method === "POST") {
      const body = await readJson<Record<string, unknown>>(req);
      const razaoSocial = str(body.razao_social, "Razão social é obrigatória");
      const cnpj = str(body.cnpj, "CNPJ é obrigatório").replace(/\D/g, "");
      if (!isValidCnpj(cnpj)) return json(res, { error: "CNPJ inválido" }, 400);

      const dup = await db().query("SELECT 1 FROM seg_clients WHERE company_id = $1 AND cnpj = $2", [companyId, cnpj]);
      if ((dup.rowCount ?? 0) > 0) return json(res, { error: "Já existe uma empresa com este CNPJ" }, 409);

      const grauRisco = optInt(body.grau_risco, "Grau de risco inválido");
      if (grauRisco !== null && (grauRisco < 1 || grauRisco > 4)) return json(res, { error: "Grau de risco deve ser 1–4" }, 400);

      const endereco = body.endereco && typeof body.endereco === "object" ? JSON.stringify(body.endereco) : null;
      const inserted = await db().query(
        `INSERT INTO seg_clients (company_id, razao_social, cnpj, cnae, grau_risco, endereco, n_funcionarios, responsavel, atividade_principal, created_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
         RETURNING *`,
        [
          companyId,
          razaoSocial,
          cnpj,
          optStr(body.cnae),
          grauRisco,
          endereco,
          optInt(body.n_funcionarios, "Número de funcionários inválido"),
          optStr(body.responsavel),
          optStr(body.atividade_principal),
          userId,
        ]
      );
      await db().query(
        "INSERT INTO seg_client_members (user_id, client_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING",
        [userId, inserted.rows[0].id]
      );
      return json(res, { client: inserted.rows[0] }, 201);
    }

    return json(res, { error: "Método não suportado" }, 405);
  } catch (e) {
    return handleError(res, e);
  }
}
