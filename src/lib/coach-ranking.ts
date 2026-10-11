// Pure ordering logic for the ranked coach performance board
// (performance-ranking.tsx). Kept out of the component so the Node-only unit
// suite can import it without dragging the UI chain in
// (coach-ranking.test.ts).

import type { CoachScorecard } from "@/lib/seed";

/** Composite rank score in 0..1: retention weighted 3, capacity utilisation
 *  weighted 1, churn inverted weighted 2. Inputs are clamped to 0..1 so an
 *  over-capacity coach or a bad feed value cannot distort the board. */
export function rankScore(m: { retention: number; churn: number; capacityPct: number }): number {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return (clamp(m.retention) * 3 + clamp(m.capacityPct) * 1 + (1 - clamp(m.churn)) * 2) / 6;
}

/** Coaches with active clients, best composite score first. Ties break by
 *  retention, then name, so the order is stable across renders. The capacity
 *  denominator is injectable for tests; the default is the owner-configured
 *  source of truth (coach-config.ts). */
export function rankCoaches(
  coaches: CoachScorecard[],
  maxCapacityOf: (c: CoachScorecard) => number = (c) => c.maxCapacity,
): CoachScorecard[] {
  const score = (c: CoachScorecard) => {
    const max = maxCapacityOf(c);
    return rankScore({
      retention: c.retention,
      churn: c.churn,
      capacityPct: max === 0 ? 0 : c.activeClients / max,
    });
  };
  return coaches
    .filter((c) => c.activeClients > 0)
    .sort((a, b) => score(b) - score(a) || b.retention - a.retention || a.name.localeCompare(b.name));
}
