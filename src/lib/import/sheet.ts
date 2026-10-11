// Spreadsheet reading for the client importer.
//
// Same engine and the same cell semantics as scripts/lib/checkin-sheet.mjs,
// which reads coach check-in logs off disk. That script takes a FILE PATH;
// an upload arrives as bytes, so the entry point differs, but every rule about
// how a cell becomes a value lives here and sheet.parity.test.ts asserts the
// two agree on the same inputs, so they cannot drift apart.

import * as XLSX from "xlsx";

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 2000;

const pad = (n: number) => String(n).padStart(2, "0");

export type Grid = (string | number | boolean | Date | null)[][];

/**
 * A cell as text. A Date cell becomes an ISO date, never a locale string.
 *
 * LOCAL components, not toISOString. A spreadsheet date is a calendar day with
 * no timezone, and SheetJS materialises it at local midnight: in Sydney that
 * is 14:00Z the PREVIOUS day, so toISOString().slice(0,10) moved every start
 * date back one. The xlsx path no longer produces Date objects at all (see
 * gridFromBuffer), so this is the belt to that braces.
 */
export function cellStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  return String(v).trim();
}

const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Is this a real calendar date? Rejects 31/02 rather than rolling it over. */
function realDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export type DateResult = { ok: true; iso: string } | { ok: false; reason: string };

/**
 * A cell to an ISO date, AUSTRALIAN day-first.
 *
 * Never guesses. 03/04/2026 is 3 April because the convention is stated, but
 * 04/13/2026 is an ERROR rather than being silently re-read as 13 April: a
 * date the portal invents is worse than a row the owner has to look at, since
 * start date drives week numbers, renewals and pay.
 */
export function parseAuDate(v: unknown): DateResult {
  if (v === null || v === undefined || String(v).trim() === "") return { ok: false, reason: "empty" };

  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { ok: false, reason: "not a date" };
    return { ok: true, iso: iso(v.getFullYear(), v.getMonth() + 1, v.getDate()) };
  }

  // Excel serial: days since 1899-12-30. Accepted as a number OR as the digits
  // of one, because cells travel through the pipeline as text. The plausible
  // range (roughly 1954 to 2119) is what stops a $250 rate being read as a
  // date; anything outside it is an error rather than a guess.
  const s = String(v).trim();
  const serial = typeof v === "number" ? v : /^\d{4,5}$/.test(s) ? Number(s) : NaN;
  if (Number.isFinite(serial)) {
    if (serial < 20000 || serial > 80000) return { ok: false, reason: `"${s}" is not a date` };
    const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return { ok: true, iso: iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) };
  }

  const isoM = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoM) {
    const [y, m, d] = [Number(isoM[1]), Number(isoM[2]), Number(isoM[3])];
    return realDate(y, m, d) ? { ok: true, iso: iso(y, m, d) } : { ok: false, reason: `"${s}" is not a real date` };
  }

  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    if (realDate(y, m, d)) return { ok: true, iso: iso(y, m, d) };
    // Day-first failed. If swapping would work, the file is probably US-format,
    // and that is exactly when guessing is most dangerous: say so instead.
    if (realDate(y, d, m)) {
      return { ok: false, reason: `"${s}" is not a valid day/month date. It looks month-first; re-save it as dd/mm/yyyy.` };
    }
    return { ok: false, reason: `"${s}" is not a real date` };
  }

  return { ok: false, reason: `"${s}" is not a date the importer accepts (use dd/mm/yyyy)` };
}

/**
 * Read an uploaded workbook into a raw grid of the first sheet.
 *
 * CSV IS READ AS TEXT, DELIBERATELY. SheetJS parses dates out of CSV text
 * MONTH-FIRST: "05/01/2026" comes back as 1 May, not 5 January, and the same
 * bytes saved as .xlsx stay a string and read correctly. So a coach exporting
 * the same sheet as CSV instead of Excel would have silently shifted every
 * Australian start date by months. Keeping CSV as text hands every date to
 * parseAuDate, which is day-first and refuses what it cannot read.
 *
 * XLSX keeps cellDates, because a genuine Excel date cell is a serial number
 * with no ambiguity to get wrong.
 */
export function gridFromBuffer(
  buf: ArrayBuffer | Uint8Array,
  opts: { csv?: boolean; sheet?: string } = {},
): { grid: Grid; sheetNames: string[]; sheet: string } {
  // cellDates is OFF for both. A date cell comes back as its Excel serial,
  // which parseAuDate converts with pure UTC arithmetic, so the result does
  // not depend on the server's timezone. With cellDates on, SheetJS builds a
  // Date at LOCAL midnight; the same file then parsed to different days on a
  // Sydney laptop and a UTC server, which is exactly the kind of bug that only
  // shows up in production.
  const wb = XLSX.read(buf, { type: "array", raw: true, cellDates: false, cellText: false });
  // A real coach workbook has twenty-odd tabs and the client data is not on
  // the first one, so defaulting to sheet 0 silently reads a macros
  // calculator. The caller picks; this only falls back when there is nothing
  // to pick from.
  const name = (opts.sheet && wb.SheetNames.includes(opts.sheet) ? opts.sheet : null) ?? wb.SheetNames[0];
  if (!name) throw new Error("That file has no sheets in it.");
  const ws = wb.Sheets[name];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as Grid;
  return { grid, sheetNames: wb.SheetNames, sheet: name };
}

/**
 * Is this one of the coach check-in logs? Those have their own importer, and
 * running them through here would match client names and then find no client
 * columns to write, which reads as "nothing happened" instead of "wrong file".
 */
export function looksLikeCheckInLog(grid: Grid, sheetNames: string[]): boolean {
  if (sheetNames.some((n) => n.trim().toLowerCase() === "check ins")) return true;
  for (const row of grid.slice(0, 15)) {
    if (!row) continue;
    const first = cellStr(row[0]).toLowerCase();
    if (first !== "client") continue;
    // A check-in grid's header carries a run of week dates across it.
    const dates = row.filter((c) => parseAuDate(c).ok).length;
    if (dates >= 4) return true;
  }
  return false;
}
