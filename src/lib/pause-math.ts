// R4-1: pure derivations for the pause board, mirroring the master sheet
// "Pause List" formulas. Stored data is only the dates + Kahunas checkboxes;
// weeks, days-until-reactivation, and the reactivating-soon flag are derived.

const DAY_MS = 86_400_000;

const parse = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** Pause length in whole weeks (1 decimal), null when either date is absent. */
export function pauseWeeks(start: string | null, end: string | null): number | null {
  const s = parse(start);
  const e = parse(end);
  if (s == null || e == null || e < s) return null;
  return Math.round(((e - s) / (7 * DAY_MS)) * 10) / 10;
}

/** Days until the pause ends (sheet: MAX(0, end - today)); null without an
 *  end date or once the end has passed more than a day ago. */
export function daysUntilReactivation(end: string | null, now: number = Date.now()): number | null {
  const e = parse(end);
  if (e == null) return null;
  return Math.max(0, Math.ceil((e - now) / DAY_MS));
}

/** Sheet "Reactivates Next 4 Days" flag: an end date within the next 4 days
 *  (and not already passed). */
export function reactivatesSoon(end: string | null, now: number = Date.now()): boolean {
  const days = daysUntilReactivation(end, now);
  if (days == null) return false;
  const e = parse(end);
  return e != null && e >= now - DAY_MS && days <= 4;
}
