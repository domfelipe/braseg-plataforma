import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatLocalDate } from "@/lib/utils";

export interface ModuleStats {
  fleet: { vehicles: number; remindersDue30: number; maintenanceMonth: number; inspectionsToday: number };
  loading: boolean;
}

/**
 * KPIs do dashboard Braseg (Fase 1): frota.
 * "Inspeções hoje" entra na Fase 2, junto com as tabelas de checklist.
 */
export function useDashboardModules(companyId: string | null) {
  const [stats, setStats] = useState<ModuleStats>({
    fleet: { vehicles: 0, remindersDue30: 0, maintenanceMonth: 0, inspectionsToday: 0 },
    loading: true,
  });

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    const run = async () => {
      const monthStart = formatLocalDate(new Date()).slice(0, 7) + "-01";
      const next30 = formatLocalDate(new Date(Date.now() + 30 * 86400000));

      const today = formatLocalDate(new Date());

      let inspectionsToday = 0;
      try {
        const insp = await supabase
          .from("fleet_checklists")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .gte("created_at", today + "T00:00:00")
          .lte("created_at", today + "T23:59:59");
        inspectionsToday = insp.count || 0;
      } catch {
        // tabela ainda não existe no ambiente → 0
      }

      const [vehicles, reminders, maint] = await Promise.all([
        supabase
          .from("fleet_vehicles")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "ativo"),
        supabase
          .from("fleet_reminders")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .neq("status", "pago")
          .lte("due_date", next30),
        supabase
          .from("fleet_maintenances")
          .select("cost")
          .eq("company_id", companyId)
          .gte("date", monthStart),
      ]);

      if (cancelled) return;

      const maintenanceMonth = (maint.data || []).reduce((s, m) => s + Number(m.cost || 0), 0);

      setStats({
        fleet: {
          vehicles: vehicles.count || 0,
          remindersDue30: reminders.count || 0,
          maintenanceMonth,
          inspectionsToday,
        },
        loading: false,
      });
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return stats;
}