// Monthly-rate provenance (V2-03). Clients bill weekly or fortnightly; the
// "monthly rate" everywhere in the app is DERIVED: weekly rate x 52 / 12
// (about 4.33 weeks per month), computed in ghl/map.ts and db/rows.ts. It is
// never a billed amount, so every surface that shows it labels it as the
// monthly equivalent with this shared tooltip.

export const MONTHLY_EQUIV_HEADER = "Monthly equiv.";

export const MONTHLY_EQUIV_TOOLTIP =
  "Derived, not billed: weekly rate x 52 / 12 (about 4.33 weeks per month). Clients bill weekly or fortnightly.";
