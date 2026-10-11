// Client Journey Tracker buckets (B1, FEEDBACK-V2). The tracker's columns are
// Unassigned -> Onboarding -> Active W1-8 -> W9-16 -> W17-24 -> 24+ ("Settling
// in" is gone). Pure derivation from the client row so it is unit-testable.
//
// Definitions (label-accurate on purpose):
// - Unassigned: no coach yet (new signup awaiting assignment).
// - Onboarding: coach assigned, start date still in the future (clients start
//   Mondays, so an assigned client sits here until their Monday).
// - Week brackets: weekNumber (1-based, same maths as seed weekNumber) once
//   the start date has passed. A client assigned after their start date lands
//   straight in their true week bracket rather than faking an Onboarding stop.

export const JOURNEY_BUCKETS = [
  "Unassigned",
  "Onboarding",
  "Active W1-8",
  "W9-16",
  "W17-24",
  "24+",
] as const;

export type JourneyBucketId = (typeof JOURNEY_BUCKETS)[number];

const WEEK_MS = 7 * 86_400_000;

export function journeyBucket(
  c: { coachId: string | null; startDate: string | null; startDateOverride?: string | null },
  now: number = Date.now(),
): JourneyBucketId {
  if (!c.coachId) return "Unassigned";
  // R17-1a: no start date yet = still onboarding, never "Active W1-8".
  const iso = c.startDateOverride ?? c.startDate;
  if (!iso) return "Onboarding";
  const start = Date.parse(iso);
  if (!Number.isNaN(start) && start > now) return "Onboarding";
  const week = Number.isNaN(start) ? 1 : Math.max(1, Math.floor((now - start) / WEEK_MS) + 1);
  if (week <= 8) return "Active W1-8";
  if (week <= 16) return "W9-16";
  if (week <= 24) return "W17-24";
  return "24+";
}

// --------------------------------------------------------------------------
// R5-1 column model (supersedes the fixed brackets above for the tracker UI;
// journeyBucket stays for older consumers/tests). Unassigned and Onboarding
// stay permanent first columns; weeks 1..singleWeekMax are one column each;
// later weeks collapse into per-brand buckets (BRAND.journey).

export type JourneyColumn =
  | { key: "unassigned"; label: "Unassigned" }
  | { key: "onboarding"; label: "Onboarding" }
  | { key: string; label: string; week: number }
  | { key: string; label: string; from: number; to: number | null };

export type JourneyShape = {
  /** Inclusive week ranges in display order; from === to = single-week
   *  column, to null = open-ended final bucket (R6-3). */
  ranges: { from: number; to: number | null }[];
};

export function journeyColumns(shape: JourneyShape): JourneyColumn[] {
  const cols: JourneyColumn[] = [
    { key: "unassigned", label: "Unassigned" },
    { key: "onboarding", label: "Onboarding" },
  ];
  for (const r of shape.ranges) {
    if (r.to != null && r.from === r.to) cols.push({ key: `w${r.from}`, label: `W${r.from}`, week: r.from });
    else if (r.to == null) cols.push({ key: `b${r.from}`, label: `W${r.from}+`, from: r.from, to: null });
    else cols.push({ key: `b${r.from}`, label: `W${r.from}-${r.to}`, from: r.from, to: r.to });
  }
  return cols;
}

/** Column key for one client under a shape: unassigned/onboarding rules are
 *  identical to journeyBucket; weeks map onto the range list. */
export function journeyColumnKey(
  c: { coachId: string | null; startDate: string | null; startDateOverride?: string | null },
  shape: JourneyShape,
  now: number = Date.now(),
): string {
  if (!c.coachId) return "unassigned";
  const iso = c.startDateOverride ?? c.startDate;
  if (!iso) return "onboarding";
  const start = Date.parse(iso);
  if (!Number.isNaN(start) && start > now) return "onboarding";
  const week = Number.isNaN(start) ? 1 : Math.max(1, Math.floor((now - start) / WEEK_MS) + 1);
  for (const r of shape.ranges) {
    if (week >= r.from && (r.to == null || week <= r.to)) {
      return r.to != null && r.from === r.to ? `w${r.from}` : `b${r.from}`;
    }
  }
  const last = shape.ranges[shape.ranges.length - 1];
  return last ? (last.to != null && last.from === last.to ? `w${last.from}` : `b${last.from}`) : "onboarding";
}

/** PIF (paid in full for a term) vs WBW (week by week), derived from the
 *  billing data we already project: the free-text billing frequency wins,
 *  then a set term length reads as PIF. Null = no signal, shown honestly as
 *  unknown rather than guessed. */
export function paymentStructure(c: {
  billingFrequency?: string | null;
  termLength?: number | null;
}): "PIF" | "WBW" | null {
  const bf = (c.billingFrequency ?? "").toLowerCase();
  if (/pif|paid.?in.?full|upfront|up.?front/.test(bf)) return "PIF";
  if (/week|wbw|fortnight/.test(bf)) return "WBW";
  if (c.termLength && c.termLength > 0) return "PIF";
  return null;
}
