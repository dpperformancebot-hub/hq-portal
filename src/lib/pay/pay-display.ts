// What the pay screens are allowed to SHOW for a brand (R19, owner 2026-09-30).
//
// TJD pays rate x weeks paid and nothing else, per Toby's Coach Rates SOP.
// Rendering a $0 "Bonuses" tile or an empty bonus tracker on that brand is not
// harmless: it tells a coach a bonus exists and happens to be zero this month.
// So the rule is absence, not zero.
//
// Pure and brand-agnostic (it takes the pay block rather than reading BRAND) so
// both brands can be asserted in the Node-only unit suite without rendering.

import type { Brand } from "@/lib/brand";

export type PayDisplay = {
  /** Show onboarding and retention bonus UI at all. */
  hasBonuses: boolean;
  /** Dollars per full 10 weeks retained. Never hardcode this in copy. */
  retentionPer10Weeks: number;
  /** One-off dollars per client onboarded. */
  setupBonus: number;
};

export function payDisplayFor(pay: Brand["pay"]): PayDisplay {
  // Two independent reasons to hide it: the brand pays no bonuses, or the
  // brand is on the weeks-paid model, which has no concept of one.
  const hasBonuses =
    pay.model !== "weeks-paid" && (pay.setupBonus > 0 || pay.retentionBonusPer10Weeks > 0);
  return {
    hasBonuses,
    retentionPer10Weeks: pay.retentionBonusPer10Weeks,
    setupBonus: pay.setupBonus,
  };
}
