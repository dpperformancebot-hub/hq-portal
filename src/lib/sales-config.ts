// Sales rep roles (owner). Maps a rep's name (as it appears as the GHL lead
// owner) to whether they set calls or close them. Drives the setter vs closer
// split on the Sales screens once pipeline/opportunity data flows from GHL.

import { IS_DP } from "@/lib/brand";

export type SalesRole = "setter" | "closer";

// DP's real reps (Lucas sets, Lilli closes). DP-only: a rebranded deploy starts
// with no mapping and lights up once its own reps are added here.
export const SALES_ROLES: Record<string, SalesRole> = IS_DP
  ? {
      lucas: "setter", // only sets to book them in
      lilli: "closer", // only closes on calls
    }
  : {};

/** Configured sales role for a rep name, or null if unmapped. */
export function salesRole(name: string): SalesRole | null {
  return SALES_ROLES[name.trim().toLowerCase()] ?? null;
}
