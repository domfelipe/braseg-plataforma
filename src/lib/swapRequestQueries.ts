import { supabase } from "@/integrations/supabase/client";

export interface EnrichedSwapRequest {
  id: string;
  type: "troca" | "passagem";
  status: string;
  from_user_id: string;
  to_user_id: string | null;
  approved_by: string | null;
  notes: string | null;
  counterparty_assignment_id: string | null;
  counterparty_notes: string | null;
  counterparty_responded_at: string | null;
  admin_notes: string | null;
  admin_responded_at: string | null;
  executed_at: string | null;
  created_at: string;
  assignment_id: string;
  // enriched
  from_user_name: string | null;
  to_user_name: string | null;
  approved_by_name: string | null;
  assignment_date: string | null;
  grade_name: string | null;
  grade_time: string | null;
  schedule_name: string | null;
  schedule_color: string | null;
  counter_assignment_date: string | null;
  counter_grade_name: string | null;
  counter_grade_time: string | null;
}

/**
 * Fetch swap requests for a company, fully enriched (assignment, grade, schedule, profile names).
 * Used by both admin (Escalas page) and professional (PontoProfissional) views.
 */
export async function fetchEnrichedSwapRequests(
  companyId: string,
): Promise<EnrichedSwapRequest[]> {
  // schedules
  const { data: schedules } = await supabase
    .from("schedules")
    .select("id, name, color")
    .eq("company_id", companyId);
  if (!schedules?.length) return [];

  const scheduleMap = Object.fromEntries(schedules.map((s) => [s.id, s]));
  const scheduleIds = schedules.map((s) => s.id);

  const { data: grades } = await supabase
    .from("schedule_grades")
    .select("id, name, schedule_id, start_time, end_time")
    .in("schedule_id", scheduleIds);
  if (!grades?.length) return [];

  const gradeMap = Object.fromEntries(grades.map((g) => [g.id, g]));
  const gradeIds = grades.map((g) => g.id);

  const { data: assignments } = await supabase
    .from("shift_assignments")
    .select("id, grade_id, date, user_id")
    .in("grade_id", gradeIds);
  if (!assignments?.length) return [];

  const assignmentMap = Object.fromEntries(assignments.map((a) => [a.id, a]));
  const assignmentIds = assignments.map((a) => a.id);

  const { data: swaps, error } = await supabase
    .from("shift_swap_requests")
    .select("*")
    .in("assignment_id", assignmentIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!swaps?.length) return [];

  const userIds = new Set<string>();
  swaps.forEach((r: any) => {
    userIds.add(r.from_user_id);
    if (r.to_user_id) userIds.add(r.to_user_id);
    if (r.approved_by) userIds.add(r.approved_by);
  });
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, full_name")
    .in("id", Array.from(userIds));
  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));

  return swaps.map((r: any) => {
    const main = assignmentMap[r.assignment_id];
    const mainGrade = main ? gradeMap[main.grade_id] : null;
    const mainSchedule = mainGrade ? scheduleMap[mainGrade.schedule_id] : null;
    const counter = r.counterparty_assignment_id
      ? assignmentMap[r.counterparty_assignment_id]
      : null;
    const counterGrade = counter ? gradeMap[counter.grade_id] : null;

    return {
      ...r,
      from_user_name: profileMap[r.from_user_id]?.full_name ?? null,
      to_user_name: r.to_user_id ? profileMap[r.to_user_id]?.full_name ?? null : null,
      approved_by_name: r.approved_by
        ? profileMap[r.approved_by]?.full_name ?? null
        : null,
      assignment_date: main?.date ?? null,
      grade_name: mainGrade?.name ?? null,
      grade_time: mainGrade
        ? `${mainGrade.start_time?.slice(0, 5)} - ${mainGrade.end_time?.slice(0, 5)}`
        : null,
      schedule_name: mainSchedule?.name ?? null,
      schedule_color: mainSchedule?.color ?? null,
      counter_assignment_date: counter?.date ?? null,
      counter_grade_name: counterGrade?.name ?? null,
      counter_grade_time: counterGrade
        ? `${counterGrade.start_time?.slice(0, 5)} - ${counterGrade.end_time?.slice(0, 5)}`
        : null,
    } as EnrichedSwapRequest;
  });
}

/** Fetch confirmed future shift assignments for a given user in a company. */
export async function fetchUserFutureAssignments(
  companyId: string,
  userId: string,
) {
  const { data: schedules } = await supabase
    .from("schedules")
    .select("id")
    .eq("company_id", companyId);
  if (!schedules?.length) return [];
  const scheduleIds = schedules.map((s) => s.id);
  const { data: grades } = await supabase
    .from("schedule_grades")
    .select("id, name, start_time, end_time, schedule_id")
    .in("schedule_id", scheduleIds);
  if (!grades?.length) return [];
  const gradeMap = Object.fromEntries(grades.map((g) => [g.id, g]));
  const gradeIds = grades.map((g) => g.id);

  const today = new Date().toISOString().slice(0, 10);
  const { data: shifts } = await supabase
    .from("shift_assignments")
    .select("id, date, grade_id, status, user_id")
    .in("grade_id", gradeIds)
    .eq("user_id", userId)
    .eq("status", "confirmado")
    .gte("date", today)
    .order("date", { ascending: true });

  return (shifts ?? []).map((s: any) => ({
    ...s,
    grade_name: gradeMap[s.grade_id]?.name ?? "—",
    grade_time: gradeMap[s.grade_id]
      ? `${gradeMap[s.grade_id].start_time?.slice(0, 5)} - ${gradeMap[
          s.grade_id
        ].end_time?.slice(0, 5)}`
      : "",
  }));
}
