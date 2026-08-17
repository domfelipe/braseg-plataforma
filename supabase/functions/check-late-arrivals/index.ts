import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    // Get all today's assignments with grade info
    const { data: assignments, error: assignErr } = await supabase
      .from("shift_assignments")
      .select(`
        id, user_id, date, grade_id, status,
        schedule_grades!shift_assignments_grade_id_fkey(
          start_time, name, schedule_id,
          schedules!schedule_grades_schedule_id_fkey(company_id, name)
        )
      `)
      .eq("date", today)
      .eq("status", "confirmado")
      .not("user_id", "is", null);

    if (assignErr) {
      console.error("Error fetching assignments:", assignErr);
      return new Response(JSON.stringify({ error: assignErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!assignments || assignments.length === 0) {
      return new Response(JSON.stringify({ checked: 0, alerts: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter assignments where start_time was 15+ min ago
    const lateThresholdMinutes = 15;
    const candidateAssignments = assignments.filter((a: any) => {
      const grade = a.schedule_grades;
      if (!grade?.start_time) return false;
      const [h, m] = grade.start_time.split(":").map(Number);
      const shiftStartMinutes = h * 60 + m;
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const diff = currentMinutes - shiftStartMinutes;
      // Only check if shift started 15-60 min ago (avoid re-alerting old shifts)
      return diff >= lateThresholdMinutes && diff <= 60;
    });

    if (candidateAssignments.length === 0) {
      return new Response(JSON.stringify({ checked: assignments.length, alerts: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get clock entries for today for these users
    const userIds = [...new Set(candidateAssignments.map((a: any) => a.user_id))];
    const { data: clockEntries } = await supabase
      .from("clock_entries")
      .select("user_id, type, timestamp")
      .in("user_id", userIds)
      .eq("type", "entrada")
      .gte("timestamp", `${today}T00:00:00`)
      .lte("timestamp", `${today}T23:59:59`);

    const usersWithEntry = new Set((clockEntries || []).map((c: any) => c.user_id));

    // Find late professionals (no clock entry)
    const lateAssignments = candidateAssignments.filter(
      (a: any) => !usersWithEntry.has(a.user_id)
    );

    if (lateAssignments.length === 0) {
      return new Response(JSON.stringify({ checked: candidateAssignments.length, alerts: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user names
    const lateUserIds = [...new Set(lateAssignments.map((a: any) => a.user_id))];
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, full_name")
      .in("id", lateUserIds);

    const nameMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name]));

    // Get master user IDs for each company to notify
    const companyIds = [...new Set(lateAssignments.map((a: any) => a.schedule_grades?.schedules?.company_id).filter(Boolean))];
    
    const { data: masterRoles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["master", "super-admin"]);

    const masterUserIds = (masterRoles || []).map((r: any) => r.user_id);

    // Also get users with company access to schedules module
    const { data: companyAccess } = await supabase
      .from("user_company_access")
      .select("user_id, company_id, modules")
      .in("company_id", companyIds);

    // Check existing notifications to avoid duplicates (same user, same day, same type)
    const { data: existingNotifs } = await supabase
      .from("notifications")
      .select("message")
      .eq("type", "atraso_plantao")
      .gte("created_at", `${today}T00:00:00`);

    const existingMessages = new Set((existingNotifs || []).map((n: any) => n.message));

    let alertCount = 0;

    for (const assignment of lateAssignments) {
      const grade = assignment.schedule_grades;
      const schedule = grade?.schedules;
      if (!schedule?.company_id) continue;

      const userName = nameMap.get(assignment.user_id) || "Profissional";
      const gradeName = grade.name || "Grade";
      const startTime = grade.start_time?.slice(0, 5) || "??:??";
      const scheduleName = schedule.name || "Escala";

      const message = `${userName} não registrou entrada no plantão "${gradeName}" (${startTime}) da escala "${scheduleName}"`;

      // Skip if already notified
      if (existingMessages.has(message)) continue;

      // Determine who to notify
      const notifyUserIds = new Set<string>();
      for (const mid of masterUserIds) notifyUserIds.add(mid);
      for (const access of (companyAccess || [])) {
        if (access.company_id === schedule.company_id && access.modules?.includes("schedules")) {
          notifyUserIds.add(access.user_id);
        }
      }

      // Don't notify the late user themselves through this channel
      notifyUserIds.delete(assignment.user_id);

      if (notifyUserIds.size === 0) continue;

      const notifications = [...notifyUserIds].map((uid) => ({
        user_id: uid,
        type: "atraso_plantao",
        title: "Atraso em Plantão",
        message,
        link: "/escalas",
      }));

      const { error: insertErr } = await supabase.from("notifications").insert(notifications);
      if (!insertErr) alertCount += notifications.length;
    }

    return new Response(
      JSON.stringify({ checked: candidateAssignments.length, late: lateAssignments.length, alerts: alertCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-late-arrivals error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
