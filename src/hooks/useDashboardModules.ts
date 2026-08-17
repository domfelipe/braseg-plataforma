import { useEffect, useState } from "react";
import { api } from "@/integrations/api/client";

export interface ModuleStats {
  fleet: { vehicles: number; remindersDue30: number; maintenanceMonth: number; inspectionsToday: number };
  loading: boolean;
}

/** KPIs do dashboard (via /api/dashboard). */
export function useDashboardModules(companyId: string | null) {
  const [stats, setStats] = useState<ModuleStats>({
    fleet: { vehicles: 0, remindersDue30: 0, maintenanceMonth: 0, inspectionsToday: 0 },
    loading: true,
  });

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    api
      .get<{ fleet: ModuleStats["fleet"] }>("/dashboard", { companyId })
      .then((data) => {
        if (!cancelled) setStats({ fleet: data.fleet, loading: false });
      })
      .catch(() => {
        if (!cancelled) setStats((s) => ({ ...s, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return stats;
}
