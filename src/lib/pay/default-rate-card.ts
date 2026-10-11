import "server-only";

// TJD's default coach rate card (moved out of src/lib/brand.ts, 2026-10-08).
//
// Why it lives here and not in the brand config: brand.ts is imported by
// client components (sidebar, dashboards), so every literal in it ships in the
// shared JS bundle to every login, coaches included. On TJD coaches must never
// receive a pay figure (Brand.pay.coachCanSeePay = false), and a rate card in
// the bundle is a pay figure anyone can read in devtools. Server-only keeps it
// on the server: the payroll actions read it directly and the owner/admin New
// coach page hands it to its form as a prop.
//
// The figures are business data, so they are NOT in the repo. They come from
// the server-only env var TJD_DEFAULT_RATE_CARD (set on the TJD Vercel project;
// the owner's local decisions file under data-imports/ holds the same values),
// as JSON with the six TjdRateCard fields, all WEEKLY dollars. Missing or
// invalid means no default: a coach with no stored row shows zeros until the
// owner sets their card.
//
// Stored rates (coach_pay_rates) always win; this is only the fallback for a
// coach with no row yet.

import { BRAND_KEY } from "@/lib/brand";
import type { TjdRateCard } from "@/lib/pay/tjd-pay";

const FIELDS = [
  "brandWeekly",
  "brandFortnightly",
  "referralWeekly",
  "referralFortnightly",
  "clientWeekly",
  "clientFortnightly",
] as const satisfies readonly (keyof TjdRateCard)[];

/** Parse a rate card from JSON. All six fields, finite and >= 0, or undefined. */
export function parseRateCard(raw: string | undefined): TjdRateCard | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const src = parsed as Record<string, unknown>;
  const out = {} as TjdRateCard;
  for (const f of FIELDS) {
    const v = src[f];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return undefined;
    out[f] = v;
  }
  return out;
}

/** This deploy's default card, or undefined on a brand without one (DP). */
export const DEFAULT_RATE_CARD: TjdRateCard | undefined =
  BRAND_KEY === "tjd" ? parseRateCard(process.env.TJD_DEFAULT_RATE_CARD) : undefined;
