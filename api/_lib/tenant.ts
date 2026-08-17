import { db } from "./db";
import { HttpError } from "./http";

export interface CompanyRow {
  id: string;
  name: string;
  trade_name: string | null;
  cnpj: string;
  modules: string[];
}

export async function listCompanies(userId: string): Promise<CompanyRow[]> {
  const res = await db().query(
    `SELECT c.id, c.name, c.trade_name, c.cnpj, uca.modules
     FROM user_company_access uca
     JOIN companies c ON c.id = uca.company_id
     WHERE uca.user_id = $1
     ORDER BY c.name`,
    [userId]
  );
  return res.rows as CompanyRow[];
}

export async function assertCompanyAccess(userId: string, companyId: string): Promise<void> {
  const res = await db().query(
    `SELECT 1 FROM user_company_access WHERE user_id = $1 AND company_id = $2`,
    [userId, companyId]
  );
  if ((res.rowCount ?? 0) === 0) {
    throw new HttpError(403, "Sem acesso a esta empresa");
  }
}

export async function isMaster(userId: string): Promise<boolean> {
  const res = await db().query(
    `SELECT 1 FROM user_roles WHERE user_id = $1 AND role IN ('master', 'super-admin')`,
    [userId]
  );
  return (res.rowCount ?? 0) > 0;
}
