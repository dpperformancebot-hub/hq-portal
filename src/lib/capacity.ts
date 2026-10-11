// Weekly coach capacity (Phase E, FEEDBACK-V2). Pure helpers + server reads.
// Answers key on the Monday of the week they apply to.

import { dbAdmin, persistenceEnabled } from "@/lib/db/client";

// R7-1 (Dan's mockup): five coarse bands with midpoints for team maths.
// Bands carry colour + soft pairs; chips, bars and grid cells derive from
// these, so re-banding is a one-place change. '5+' is the legacy pre-v2 band
// (reads map it to '5-6').
export type CapacityValue = "0" | "1-2" | "3-4" | "5-6" | "7+";

export type CapacityBand = {
  id: CapacityValue;
  label: string;
  sub: string;
  mid: number;
  colour: string;
  soft: string;
};

export const CAPACITY_BANDS: readonly CapacityBand[] = [
  { id: "0", label: "0", sub: "At capacity", mid: 0, colour: "#dc2626", soft: "#fdeaea" },
  { id: "1-2", label: "1-2", sub: "Nearly full", mid: 1.5, colour: "#d97706", soft: "#fdf3dd" },
  { id: "3-4", label: "3-4", sub: "Some room", mid: 3.5, colour: "#ca8a04", soft: "#fdf6dd" },
  { id: "5-6", label: "5-6", sub: "Good room", mid: 5.5, colour: "#16a34a", soft: "#eaf6ee" },
  { id: "7+", label: "7+", sub: "Plenty of room", mid: 8, colour: "#0891b2", soft: "#e4f4f9" },
];
export const CAPACITY_OPTIONS = CAPACITY_BANDS.map((b) => b.id) as unknown as readonly CapacityValue[];

export const bandOf = (id: string | null | undefined) =>
  CAPACITY_BANDS.find((b) => b.id === (id === "5+" ? "5-6" : id));

/** Midpoints for team-capacity maths (legacy '5+' reads as '5-6'). */
export const CAPACITY_SLOTS: Record<string, number> = Object.fromEntries([
  ...CAPACITY_BANDS.map((b) => [b.id, b.mid]),
  ["5+", 5.5],
]);

/** The Monday (YYYY-MM-DD, local) of the week a capacity answer given `now`
 *  applies to: on Sunday you answer for the COMING week (tomorrow's Monday);
 *  Monday through Saturday you answer, late, for the CURRENT week. */
export function capacityWeekStart(now: number = Date.now()): string {
  const d = new Date(now);
  const day = d.getDay(); // 0 = Sunday
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (day === 0 ? 1 : 1 - day));
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** R3-1: Monday (YYYY-MM-DD, local) of the current week (offset 0) or a
 *  following week (offset 1 = next week). Sunday counts as the END of the
 *  current week, unlike capacityWeekStart's answer-attribution rule. */
export function weekMonday(offset: 0 | 1, now: number = Date.now()): string {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + offset * 7);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** R7-1 week model (mockup): exactly one week is OPEN at a time, and it is
 *  the COMING Monday's week — submissions are due the Friday before, and the
 *  week closes the moment it begins (Monday rollover). */
export function openWeekStart(now: number = Date.now()): string {
  return weekMonday(1, now);
}

export type CoachCapacityRow = { coachId: string; capacity: CapacityValue };

/** R7-1: a full submission row for the manager views. */
export type CapacitySubmission = {
  coachId: string;
  weekStart: string;
  band: CapacityValue;
  note: string | null;
  submittedAt: string;
  updatedAt: string | null;
};

const normBand = (v: string): CapacityValue => (v === "5+" ? "5-6" : (v as CapacityValue));

/** All submissions for the open week plus the preceding weeks (`weeks`
 *  Mondays total), for Results + the Capacity log. notesAvailable=false when
 *  the note column is missing (pre-migration 20260808000004) so the UI can
 *  say so honestly. */
export async function listCapacitySubmissions(
  weeks = 8,
): Promise<{ rows: CapacitySubmission[]; notesAvailable: boolean }> {
  if (!persistenceEnabled()) return { rows: [], notesAvailable: false };
  const starts = Array.from({ length: weeks }, (_, i) => weekMonday(1, Date.now() - i * 7 * 86_400_000));
  const primary = await dbAdmin()
    .from("coach_capacity")
    .select("coach_id, week_start, capacity, note, created_at, updated_at")
    .in("week_start", starts);
  const notesAvailable = !primary.error;
  const res = primary.error
    ? await dbAdmin()
        .from("coach_capacity")
        .select("coach_id, week_start, capacity, created_at, updated_at")
        .in("week_start", starts)
    : primary;
  const { data, error } = res;
  if (error || !data) return { rows: [], notesAvailable };
  return { rows: (data as {
    coach_id: string;
    week_start: string;
    capacity: string;
    note?: string | null;
    created_at: string;
    updated_at: string | null;
  }[]).map((r) => ({
    coachId: r.coach_id,
    weekStart: r.week_start,
    band: normBand(r.capacity),
    note: r.note ?? null,
    submittedAt: r.created_at,
    updatedAt: r.updated_at,
  })), notesAvailable };
}

/** Every coach's answer for the applicable week. Empty pre-migration / when
 *  persistence is off (callers render "not answered"). */
export async function listWeekCapacity(): Promise<CoachCapacityRow[]> {
  if (!persistenceEnabled()) return [];
  const { data, error } = await dbAdmin()
    .from("coach_capacity")
    .select("coach_id, capacity")
    .eq("week_start", capacityWeekStart());
  if (error || !data) return [];
  return (data as { coach_id: string; capacity: string }[]).map((r) => ({
    coachId: r.coach_id,
    capacity: normBand(r.capacity),
  }));
}

/** Has this coach answered for the applicable week? Null = unknown (table
 *  absent / persistence off), so the prompt can still show. */
export async function getCoachWeekCapacity(coachId: string | null): Promise<CapacityValue | null> {
  if (!coachId || !persistenceEnabled()) return null;
  const { data, error } = await dbAdmin()
    .from("coach_capacity")
    .select("capacity")
    .eq("coach_id", coachId)
    .eq("week_start", capacityWeekStart())
    .maybeSingle();
  if (error || !data) return null;
  return normBand(data.capacity as string);
}

/** R3-1: one coach's answers for the current AND coming week, for the
 *  Capacity tab. Nulls where unanswered / table absent / persistence off. */
export async function getCoachCapacityPair(
  coachId: string | null,
): Promise<{ thisWeek: CapacityValue | null; nextWeek: CapacityValue | null }> {
  const none = { thisWeek: null, nextWeek: null };
  if (!coachId || !persistenceEnabled()) return none;
  const weeks = [weekMonday(0), weekMonday(1)];
  const { data, error } = await dbAdmin()
    .from("coach_capacity")
    .select("week_start, capacity")
    .eq("coach_id", coachId)
    .in("week_start", weeks);
  if (error || !data) return none;
  const byWeek = new Map((data as { week_start: string; capacity: string }[]).map((r) => [r.week_start, normBand(r.capacity)]));
  return { thisWeek: byWeek.get(weeks[0]) ?? null, nextWeek: byWeek.get(weeks[1]) ?? null };
}
