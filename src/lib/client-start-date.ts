// The ONE place a client's program start date is resolved (R17-1).
//
// Two bugs made this necessary:
//   a. GHL's "Start Date" custom field is blank on new Newie signups and the
//      mapper fell back to the contact's dateAdded, which is the PAYMENT
//      date. 122 of 533 active DP clients were carrying a payment date as
//      their program start (audit 2026-09-25). The fallback is gone: an
//      unknown start is now genuinely unknown (null) and says so on screen.
//   b. The nightly sync owns clients.start_date, so a correction made in the
//      portal was overwritten overnight. The portal writes
//      clients.start_date_override instead, and this module is what makes the
//      override win everywhere.
//
// Pure: no IO, no imports beyond types, safe in client components.

/** Where the resolved start date came from. */
export type StartDateSource = "portal" | "ghl" | "none";

/** The minimum shape this module needs. Client satisfies it. */
export type HasStart = {
  startDate: string | null;
  /** Set in the portal (R17-1b). Wins over startDate. */
  startDateOverride?: string | null;
};

export const NEEDS_START_DATE = "Start date needed";

const valid = (d: string | null | undefined): d is string =>
  !!d && !Number.isNaN(Date.parse(d));

/** The start date to use everywhere: the portal override, else GHL, else null. */
export function effectiveStartDate(c: HasStart): string | null {
  if (valid(c.startDateOverride)) return c.startDateOverride;
  if (valid(c.startDate)) return c.startDate;
  return null;
}

export function startDateSource(c: HasStart): StartDateSource {
  if (valid(c.startDateOverride)) return "portal";
  if (valid(c.startDate)) return "ghl";
  return "none";
}

/** True when nobody knows when this client actually started. */
export function needsStartDate(c: HasStart): boolean {
  return effectiveStartDate(c) === null;
}

const DAY = 86_400_000;

/**
 * Whole weeks since the start date, or NULL when the start is unknown.
 *
 * Deliberately different from ghl/map.ts WEEKS(), which returns 0 for an
 * unknown date. Week 0 and "we have no idea" are not the same thing, and
 * showing 0 is what let a payment date pass for a program start unnoticed.
 * Callers must decide what to render for null (usually NEEDS_START_DATE).
 */
export function clientWeek(c: HasStart, now: number = Date.now()): number | null {
  const iso = effectiveStartDate(c);
  if (iso === null) return null;
  return Math.max(0, Math.floor((now - Date.parse(iso)) / (7 * DAY)));
}

/** 1-based week for the screens that count a client's first week as week 1. */
export function clientWeekNumber(c: HasStart, now: number = Date.now()): number | null {
  const w = clientWeek(c, now);
  return w === null ? null : w + 1;
}

/** True when the client has a known start date that is still in the future. */
export function startsInFuture(c: HasStart, now: number = Date.now()): boolean {
  const iso = effectiveStartDate(c);
  if (iso === null) return false;
  return Date.parse(iso) > now;
}
