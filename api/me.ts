import { requireUserId } from "./_lib/auth";
import { handleError, json } from "./_lib/http";
import { isMaster, listCompanies } from "./_lib/tenant";

export const config = { runtime: "nodejs" };

export default async function handler(request: Request) {
  try {
    const userId = await requireUserId(request);
    const [companies, master] = await Promise.all([listCompanies(userId), isMaster(userId)]);
    return json({ userId, companies, isMaster: master });
  } catch (e) {
    return handleError(e);
  }
}
