// Pure retention-by-tenure-bracket maths, shared by the retention table,
// the bracket board, and the ranked coach board. Extracted from
// retention-board.tsx (2026-07-11) so the Node-only unit suite can test it
// without dragging the UI chain in (retention-math.test.ts).
//
// Everything derives from client start/end dates already in the roster feed,
// no check-in dependency.

import type { Client } from "@/lib/seed/types";
import { effectiveStartDate } from "@/lib/client-start-date";

export const BRACKETS = [
  { label: "0-8 wk", min: 0, max: 8 },
  { label: "8-16 wk", min: 8, max: 16 },
  { label: "16-32 wk", min: 16, max: 32 },
  { label: "32+ wk", min: 32, max: Infinity },
] as const;

const WEEK_MS = 7 * 86_400_000;

/** Weeks on the books. NaN-safe; R17-1a: a client with no known start date
 *  returns null and is EXCLUDED from retention maths rather than counted as a
 *  0-week client, which would drag every bracket down. */
export function tenureWeeks(c: Client): number | null {
  const iso = effectiveStartDate(c);
  if (iso === null) return null;
  const start = Date.parse(iso);
  if (Number.isNaN(start)) return null;
  const churned = c.status === "cancelled" || c.status === "past";
  const end = churned && c.endDate ? Date.parse(c.endDate) : Date.now();
  return Math.max(0, (end - start) / WEEK_MS);
}

export const bracketIndex = (weeks: number) => BRACKETS.findIndex((b) => weeks >= b.min && weeks < b.max);

export type CoachRow = {
  coachId: string;
  name: string;
  activePerBracket: number[]; // roster distribution
  churnPerBracket: number[]; // where they fell off
  rosterCount: number;
  churnedCount: number;
  avgChurnWeeks: number | null;
  retention: number; // lifetime: kept / (kept + churned)
};

export function computeRetentionRows(clients: Client[], coachNames: Record<string, string>): CoachRow[] {
  const byCoach = new Map<string, Client[]>();
  for (const c of clients) {
    if (!c.coachId) continue;
    const list = byCoach.get(c.coachId) ?? [];
    list.push(c);
    byCoach.set(c.coachId, list);
  }
  const rows: CoachRow[] = [];
  for (const [coachId, list] of byCoach) {
    const active = list.filter((c) => c.status === "active" || c.status === "paused");
    const churned = list.filter((c) => c.status === "cancelled" || c.status === "past");
    if (active.length === 0 && churned.length === 0) continue;
    const activePerBracket = [0, 0, 0, 0];
    const churnPerBracket = [0, 0, 0, 0];
    // R17-1a: a client with no start date has no tenure, so they are counted
    // in neither bracket rather than landing in the 0-4 week one.
    for (const c of active) {
      const w = tenureWeeks(c);
      if (w !== null) activePerBracket[bracketIndex(w)]++;
    }
    let churnWeeksTotal = 0;
    for (const c of churned) {
      const w = tenureWeeks(c);
      if (w === null) continue;
      churnPerBracket[bracketIndex(w)]++;
      churnWeeksTotal += w;
    }
    rows.push({
      coachId,
      name: coachNames[coachId] ?? "Unknown",
      activePerBracket,
      churnPerBracket,
      rosterCount: active.length,
      churnedCount: churned.length,
      avgChurnWeeks: churned.length ? churnWeeksTotal / churned.length : null,
      retention: active.length + churned.length ? active.length / (active.length + churned.length) : 0,
    });
  }
  return rows.sort((a, b) => b.retention - a.retention || b.rosterCount - a.rosterCount);
}

export type BracketStats = {
  /** Clients who REACHED this bracket: active with tenure >= min plus churned
   *  whose churn tenure landed at >= min. */
  entered: number;
  /** Active clients currently sitting in this bracket. */
  activeIn: number;
  /** Churned clients who fell off inside this bracket. */
  churnedIn: number;
  /** 1 - churnedIn / entered, or null when no one entered the bracket (a
   *  coach with no entrants gets no card in that column). */
  retention: number | null;
};

/** Per-bracket survival for one coach. A client "entered" bracket i when
 *  their tenure carried them past its lower bound; the bracket's retention is
 *  the share of entrants who did NOT churn inside it. Both per-bracket arrays
 *  are cumulative-summed from bracket i upward, so this reads straight off a
 *  CoachRow. */
export function bracketStats(
  row: Pick<CoachRow, "activePerBracket" | "churnPerBracket">,
  bracket: number,
): BracketStats {
  let entered = 0;
  for (let j = bracket; j < BRACKETS.length; j++) {
    entered += (row.activePerBracket[j] ?? 0) + (row.churnPerBracket[j] ?? 0);
  }
  const activeIn = row.activePerBracket[bracket] ?? 0;
  const churnedIn = row.churnPerBracket[bracket] ?? 0;
  return {
    entered,
    activeIn,
    churnedIn,
    retention: entered === 0 ? null : 1 - churnedIn / entered,
  };
}
