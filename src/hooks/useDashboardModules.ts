import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatLocalDate } from "@/lib/utils";

export interface ModuleStats {
  fleet: { vehicles: number; remindersDue30: number; maintenanceMonth: number };
  schedules: { todayShifts: number; weekShifts: number; openSlots: number };
  clock: { todayEntries: number; activeUsers: number; lateToday: number };
  documents: { total: number; pendingMonth: number; activeEmployees: number };
  events: { upcoming7: number; today: number };
  payments: { pending: number; pendingTotal: number; paidMonth: number; paidMonthTotal: number };
  loading: boolean;
}

export function useDashboardModules(companyId: string | null) {
  const [stats, setStats] = useState<ModuleStats>({
    fleet: { vehicles: 0, remindersDue30: 0, maintenanceMonth: 0 },
    schedules: { todayShifts: 0, weekShifts: 0, openSlots: 0 },
    clock: { todayEntries: 0, activeUsers: 0, lateToday: 0 },
    documents: { total: 0, pendingMonth: 0, activeEmployees: 0 },
    events: { upcoming7: 0, today: 0 },
    payments: { pending: 0, pendingTotal: 0, paidMonth: 0, paidMonthTotal: 0 },
    loading: true,
  });

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    const run = async () => {
      const today = formatLocalDate(new Date());
      const monthStart = today.slice(0, 7) + "-01";
      const next7 = formatLocalDate(new Date(Date.now() + 7 * 86400000));
      const next30 = formatLocalDate(new Date(Date.now() + 30 * 86400000));

      const [
        vehicles, reminders, maint,
        shiftsToday, shiftsWeek, openShifts,
        clockToday,
        docs, employees,
        eventsToday, eventsUpcoming,
        payPending, payPaid,
      ] = await Promise.all([
        supabase.from("fleet_vehicles").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "ativo"),
        supabase.from("fleet_reminders").select("id", { count: "exact", head: true }).eq("company_id", companyId).neq("status", "pago").lte("due_date", next30),
        supabase.from("fleet_maintenances").select("cost").eq("company_id", companyId).gte("date", monthStart),
        supabase.from("shift_assignments").select("id, user_id, schedule_grades!inner(schedules!inner(company_id))").eq("date", today).eq("schedule_grades.schedules.company_id", companyId),
        supabase.from("shift_assignments").select("id, schedule_grades!inner(schedules!inner(company_id))").gte("date", today).lte("date", next7).eq("schedule_grades.schedules.company_id", companyId),
        supabase.from("shift_assignments").select("id, schedule_grades!inner(schedules!inner(company_id))").gte("date", today).lte("date", next7).is("user_id", null).eq("schedule_grades.schedules.company_id", companyId),
        supabase.from("clock_entries").select("user_id").eq("company_id", companyId).gte("timestamp", today + "T00:00:00").lte("timestamp", today + "T23:59:59"),
        supabase.from("employee_documents").select("id, uploaded_at", { count: "exact" }).eq("company_id", companyId).gte("uploaded_at", monthStart),
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "active"),
        supabase.from("events").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("start_at", today + "T00:00:00").lte("start_at", today + "T23:59:59"),
        supabase.from("events").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("start_at", today + "T00:00:00").lte("start_at", next7 + "T23:59:59"),
        supabase.from("professional_payments").select("amount").eq("company_id", companyId).eq("status", "aguardando_pagamento"),
        supabase.from("professional_payments").select("amount, payment_date").eq("company_id", companyId).eq("status", "pago").gte("payment_date", monthStart),
      ]);

      if (cancelled) return;

      const maintTotal = (maint.data || []).reduce((s, m) => s + Number(m.cost || 0), 0);
      const clockUsers = new Set((clockToday.data || []).map(c => c.user_id));
      const payPendingTotal = (payPending.data || []).reduce((s, p) => s + Number(p.amount || 0), 0);
      const payPaidTotal = (payPaid.data || []).reduce((s, p) => s + Number(p.amount || 0), 0);

      setStats({
        fleet: {
          vehicles: vehicles.count || 0,
          remindersDue30: reminders.count || 0,
          maintenanceMonth: maintTotal,
        },
        schedules: {
          todayShifts: shiftsToday.data?.length || 0,
          weekShifts: shiftsWeek.data?.length || 0,
          openSlots: openShifts.data?.length || 0,
        },
        clock: {
          todayEntries: clockToday.data?.length || 0,
          activeUsers: clockUsers.size,
          lateToday: 0,
        },
        documents: {
          total: docs.count || 0,
          pendingMonth: docs.data?.length || 0,
          activeEmployees: employees.count || 0,
        },
        events: {
          today: eventsToday.count || 0,
          upcoming7: eventsUpcoming.count || 0,
        },
        payments: {
          pending: payPending.data?.length || 0,
          pendingTotal: payPendingTotal,
          paidMonth: payPaid.data?.length || 0,
          paidMonthTotal: payPaidTotal,
        },
        loading: false,
      });
    };

    run();
    return () => { cancelled = true; };
  }, [companyId]);

  return stats;
}
