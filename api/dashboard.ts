import { requireUserId } from "./_lib/auth";
import { db } from "./_lib/db";
import { handleError, json, query } from "./_lib/http";
import type { IncomingMessage, ServerResponse } from "http";
import { assertCompanyAccess } from "./_lib/tenant";

export const config = { runtime: "nodejs" };

function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const userId = await requireUserId(req);
    const url = query(req);
    const companyId = url.get("companyId");
    if (!companyId) return json(res, { error: "companyId obrigatório" }, 400);
    await assertCompanyAccess(userId, companyId);

    const today = localDate(new Date());
    const monthStart = today.slice(0, 7) + "-01";
    const next30 = localDate(new Date(Date.now() + 30 * 86400000));

    const [vehicles, reminders, maint, inspections] = await Promise.all([
      db().query("SELECT count(*)::int AS n FROM fleet_vehicles WHERE company_id = $1 AND status = 'ativo'", [companyId]),
      db().query("SELECT count(*)::int AS n FROM fleet_reminders WHERE company_id = $1 AND status <> 'pago' AND due_date <= $2", [companyId, next30]),
      db().query("SELECT COALESCE(sum(cost), 0)::float8 AS total FROM fleet_maintenances WHERE company_id = $1 AND date >= $2", [companyId, monthStart]),
      db().query("SELECT count(*)::int AS n FROM fleet_checklists WHERE company_id = $1 AND created_at >= $2 AND created_at <= $3", [companyId, today + "T00:00:00", today + "T23:59:59"]),
    ]);

    return json(res, {
      fleet: {
        vehicles: vehicles.rows[0]?.n ?? 0,
        remindersDue30: reminders.rows[0]?.n ?? 0,
        maintenanceMonth: maint.rows[0]?.total ?? 0,
        inspectionsToday: inspections.rows[0]?.n ?? 0,
      },
    });
  } catch (e) {
    return handleError(res, e);
  }
}
