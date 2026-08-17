import { requireUserId } from "./_lib/auth";
import { handleError, json, query } from "./_lib/http";
import type { IncomingMessage, ServerResponse } from "http";
import { isMaster, listCompanies } from "./_lib/tenant";

export const config = { runtime: "nodejs" };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const userId = await requireUserId(req);
    const [companies, master] = await Promise.all([listCompanies(userId), isMaster(userId)]);
    return json(res, { userId, companies, isMaster: master });
  } catch (e) {
    return handleError(res, e);
  }
}
