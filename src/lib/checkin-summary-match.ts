// R2-4 (2026-08-07): pair each Loom check-in summary with the check-in row it
// belongs to, so client detail pages can show the summary WITH its check-in
// rather than only in a separate block. Pure and client-safe (no server
// imports); summaries have no check_in foreign key, so matching is heuristic:
//   1. exact week_number match (both sides carry one), else
//   2. same Monday-start week (summary created the week the check-in landed).
// Each summary attaches to at most one check-in; unmatched summaries are left
// for the standalone Loom summaries block.

import type { CheckIn } from "@/lib/seed/types";
import type { CheckInSummary } from "@/lib/check-in-summaries";

const DAY = 86_400_000;

/** Monday 00:00 (local) of the week containing the date; ms epoch. NaN in,
 *  NaN out. */
function weekStart(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NaN;
  const day = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime();
}

/** checkIn.id -> its matched summary. Check-ins are tried in the order given
 *  (callers pass newest-first), so a summary pairs with the most recent
 *  check-in it plausibly belongs to. */
export function matchSummariesToCheckIns(
  checkIns: CheckIn[],
  summaries: CheckInSummary[],
): Map<string, CheckInSummary> {
  const matched = new Map<string, CheckInSummary>();
  const taken = new Set<string>();

  // Pass 1: exact week-number pairing.
  for (const ci of checkIns) {
    if (ci.weekNumber == null) continue;
    const s = summaries.find((x) => !taken.has(x.id) && x.weekNumber != null && x.weekNumber === ci.weekNumber);
    if (s) {
      matched.set(ci.id, s);
      taken.add(s.id);
    }
  }

  // Pass 2: same Monday-week of the dates, for rows/summaries without week
  // numbers (or where the numbers never lined up).
  for (const ci of checkIns) {
    if (matched.has(ci.id)) continue;
    const w = weekStart(ci.submittedAt);
    if (Number.isNaN(w)) continue;
    const s = summaries.find((x) => {
      if (taken.has(x.id)) return false;
      const sw = weekStart(x.createdAt);
      return !Number.isNaN(sw) && Math.abs(sw - w) < DAY; // same Monday
    });
    if (s) {
      matched.set(ci.id, s);
      taken.add(s.id);
    }
  }

  return matched;
}
