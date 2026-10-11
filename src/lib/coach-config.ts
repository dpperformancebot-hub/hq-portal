// Per-coach active-client capacity.
//
// R17-4 (2026-09-25): capacity MOVED to coaches.max_capacity. It used to live
// in a COACH_CAPACITIES map here, keyed by the GHL coach name, because the
// stored column held a stale default of 30 for every coach while the working
// baseline was 70. All 17 rows were normalised to 70 and the read was switched
// to the column, so a coach's capacity is now set on their row (the Add coach
// form writes it) and there is nothing to edit in code.
//
// What is left is the default for a coach who has no row yet: the GHL-direct
// mapping path builds coaches from contacts before the sync has created them,
// and the Add coach form pre-fills this.
export const DEFAULT_COACH_CAPACITY = 70;

// Coach pay bonuses: per-brand (R9-1, Brand.pay). Re-exported here so pay
// call sites keep one import path. TJD carries Dan's values as an explicit
// interim until Toby supplies his own.
import { BRAND } from "@/lib/brand";
export const SETUP_BONUS = BRAND.pay.setupBonus;
export const RETENTION_BONUS_PER_10_WEEKS = BRAND.pay.retentionBonusPer10Weeks;

// Weekly check-in pay rules (Dan's model). The single source of truth for which
// status code earns the week's rate. CONFIRM exact codes with Dan, tweak here.
//   "full"    = the week's rate ($25 Weekly / $15 Fortnightly)
//   "ghosted" = 50% for the first 2 consecutive ghosted weeks, then $0
//   "none"    = $0
//
// R16-2c changed what the letters MEAN, so this map changed with them:
//   SM ("send message") and the old M ("messaged") both became MS ("message
//   sent"). MS carries the old messaged behaviour, full pay, unchanged.
//   M now means MISSED, which is a different question: does a missed check-in
//   earn the week? That is Dan's call, not a migration detail, so M is
//   deliberately ABSENT below until he decides (open question in
//   FEEDBACK-V2.md, R16-2c). An absent code never silently pays $0 as though
//   that were the decision: see payTreatment.
export type PayTreatment = "full" | "ghosted" | "none";
export const PAY_RULES: Record<string, PayTreatment> = {
  Y: "full", // standard completed check-in
  MS: "full", // message sent (was SM + the old M; behaviour unchanged)
  F: "full", // fortnightly check-in week
  G: "ghosted",
  P: "none", // paused
  C: "none", // cancelled
  N: "none", // no check-in
  // M (Missed) intentionally omitted, pending Dan. Do not add it to make an
  // error go away: adding it IS the pay decision.
};

/**
 * Pay treatment for a weekly check-in code.
 *
 * No code at all (null / empty) is "none": a week with no check-in row, or a
 * note-only row, genuinely has nothing to pay.
 *
 * A code that is not in PAY_RULES is a different thing: it means someone
 * introduced a status the pay model has never ruled on. That must not quietly
 * become $0 in a coach's pay, so it throws in development and test (the
 * forcing function to go and ask Dan) and, in production, pays nothing for
 * that week and logs a warning rather than taking the whole pay screen down.
 */
export function payTreatment(code: string | null | undefined): PayTreatment {
  const key = (code ?? "").trim().toUpperCase();
  if (!key) return "none";
  const rule = PAY_RULES[key];
  if (rule) return rule;
  const message =
    `No pay rule for check-in code "${key}". Decide it with the owner, then add it to ` +
    `PAY_RULES in src/lib/coach-config.ts. ("M" = Missed is open: FEEDBACK-V2.md R16-2c.)`;
  if (process.env.NODE_ENV !== "production") throw new Error(`payTreatment: ${message}`);
  console.warn(`[pay] ${message} Paying nothing for that week until it is set.`);
  return "none";
}
