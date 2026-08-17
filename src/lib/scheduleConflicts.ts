/**
 * Schedule conflict detection utilities.
 * Detects time overlaps and weekly hour limit violations.
 */

interface TimeRange {
  start_time: string; // "HH:mm"
  end_time: string;   // "HH:mm"
}

interface AssignmentInfo {
  id?: string;
  date: string;
  user_id: string | null;
  grade_id: string;
  slot_index: number;
  custom_start_time?: string | null;
  custom_end_time?: string | null;
  status?: string;
}

interface GradeInfo {
  id: string;
  start_time: string;
  end_time: string;
  name: string;
}

export interface ConflictResult {
  type: "overlap" | "overtime";
  message: string;
  severity: "warning" | "error";
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function getShiftDurationMinutes(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (end > start) return end - start;
  if (end === start) return 1440; // 24h
  return (1440 - start) + end; // crosses midnight
}

function rangesOverlap(
  aStart: string, aEnd: string,
  bStart: string, bEnd: string
): boolean {
  const as = timeToMinutes(aStart);
  const ae = timeToMinutes(aEnd);
  const bs = timeToMinutes(bStart);
  const be = timeToMinutes(bEnd);

  // Normalize to handle overnight shifts
  const aCrossesMidnight = ae <= as;
  const bCrossesMidnight = be <= bs;

  // If both are same-day, simple check
  if (!aCrossesMidnight && !bCrossesMidnight) {
    return as < be && bs < ae;
  }

  // For overnight shifts, they always overlap with something on the same day
  // unless one ends before the other starts AND doesn't wrap
  // Simplified: if either crosses midnight, likely overlap on same date
  return true;
}

/**
 * Detect conflicts for a user being assigned to a new shift.
 */
export function detectConflicts(
  userId: string,
  targetDate: string,
  targetGrade: GradeInfo,
  targetSlotIndex: number,
  allAssignments: AssignmentInfo[],
  allGrades: GradeInfo[],
  maxWeeklyHours: number = 44,
  weekDates?: string[]
): ConflictResult[] {
  const conflicts: ConflictResult[] = [];

  // Get effective time for the target slot
  const targetStart = targetGrade.start_time?.slice(0, 5) || "07:00";
  const targetEnd = targetGrade.end_time?.slice(0, 5) || "19:00";

  // 1) Check time overlap on the same date
  const sameDayAssignments = allAssignments.filter(
    (a) => a.user_id === userId && a.date === targetDate && a.status !== "inativo"
  );

  for (const existing of sameDayAssignments) {
    const existingGrade = allGrades.find((g) => g.id === existing.grade_id);
    if (!existingGrade) continue;

    const exStart = (existing.custom_start_time || existingGrade.start_time)?.slice(0, 5) || "07:00";
    const exEnd = (existing.custom_end_time || existingGrade.end_time)?.slice(0, 5) || "19:00";

    if (rangesOverlap(targetStart, targetEnd, exStart, exEnd)) {
      conflicts.push({
        type: "overlap",
        message: `Conflito de horário: já escalado na grade "${existingGrade.name}" (${exStart}-${exEnd}) no mesmo dia.`,
        severity: "error",
      });
    }
  }

  // 2) Check weekly hours limit
  if (weekDates && weekDates.length > 0) {
    const weekAssignments = allAssignments.filter(
      (a) => a.user_id === userId && weekDates.includes(a.date) && a.status !== "inativo"
    );

    let totalMinutes = 0;
    for (const a of weekAssignments) {
      const grade = allGrades.find((g) => g.id === a.grade_id);
      if (!grade) continue;
      const start = (a.custom_start_time || grade.start_time)?.slice(0, 5) || "07:00";
      const end = (a.custom_end_time || grade.end_time)?.slice(0, 5) || "19:00";
      totalMinutes += getShiftDurationMinutes(start, end);
    }

    // Add the new shift duration
    const newDuration = getShiftDurationMinutes(targetStart, targetEnd);
    const totalHours = (totalMinutes + newDuration) / 60;

    if (totalHours > maxWeeklyHours) {
      conflicts.push({
        type: "overtime",
        message: `Carga horária semanal excedida: ${totalHours.toFixed(0)}h de ${maxWeeklyHours}h permitidas.`,
        severity: "warning",
      });
    }
  }

  return conflicts;
}
