// Shared parser for a DP coach "Check In Log" export (the "Check Ins" tab).
//
// Extracted from scripts/import-checkin-logs.mjs (R16-0, 2026-09-20) so the
// importer, sheets-diff and roster-diff all read a sheet the same way. Pure:
// no database, no writes, no brand knowledge. Accepts .xlsx (reads the
// "Check Ins" tab; the Pay tab is never opened) or .csv (single sheet).

import path from "node:path";
import XLSX from "xlsx";

export const CHECK_INS_TAB = "Check Ins";

export function pad(n) { return String(n).padStart(2, "0"); }

/** Normalise a person name for matching: NFKD, strip accents, drop bracketed
 *  notes, drop apostrophes/dots/hyphens, lowercase, collapse spaces. */
export function normName(s) {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[’'`.\-]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Dice coefficient on character bigrams: cheap similarity for the skip list. */
export function similarity(a, b) {
  const grams = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; };
  const A = grams(a), B = grams(b);
  let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0);
  const total = (a.length - 1) + (b.length - 1);
  return total <= 0 ? 0 : (2 * inter) / total;
}

/** The fuzzy threshold the importer's skip list uses. Reused, never re-tuned. */
export const FUZZY_THRESHOLD = 0.6;

export function cellStr(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/** Header cell -> ISO week date, or null. Accepts Date cells and d/m/y strings. */
export function headerDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  const m = String(v ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
}

/** Sheet "Start Date" -> ISO date or null. */
export function startDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  return headerDate(v);
}

/** Open a workbook and return the sheet the check-in grid lives on:
 *  the "Check Ins" tab of an .xlsx, or the only sheet of a .csv. */
export function openCheckInSheet(file) {
  const base = path.basename(file);
  if (/\.csv$/i.test(file)) {
    const wb = XLSX.readFile(file, { cellDates: true, raw: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error(`${base}: empty csv`);
    return ws;
  }
  const wb = XLSX.readFile(file, { cellDates: true, sheets: [CHECK_INS_TAB] }); // Pay tab is never read
  const ws = wb.Sheets[CHECK_INS_TAB];
  if (!ws) throw new Error(`${base}: no "${CHECK_INS_TAB}" tab`);
  return ws;
}

/**
 * Parse one coach's check-in log.
 * Returns { headerRow, meta, weekCols: [{ i, date }], clients: [...] } where each
 * client is { sheetRow, name, start, day, cadence, review, transformation, post,
 * cells: [{ date, raw }] }. Throws with a "<file>: reason" message on a
 * malformed sheet (callers decide whether that is fatal).
 */
export function parseCheckInLog(file) {
  const base = path.basename(file);
  const ws = openCheckInSheet(file);
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const hi = grid.findIndex((r) => r && normName(r[0]) === "client");
  if (hi < 0) throw new Error(`${base}: header row (first cell "Client") not found`);
  const header = grid[hi];

  // Meta columns by header keyword (sheets vary: Angus has "C/in D", Paul has no Start Date / Progress Review).
  const meta = {};
  header.slice(0, 12).forEach((h, i) => {
    const k = String(h ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!k) return;
    if (k === "client") meta.name = i;
    else if (k.startsWith("start date")) meta.start = i;
    else if (k.startsWith("check in day") || k.startsWith("c/in d")) meta.day = i;
    else if (k.startsWith("weekly")) meta.cadence = i;
    else if (k.startsWith("progress")) meta.review = i;
    else if (k.startsWith("transformation")) meta.transformation = i;
    else if (k.startsWith("post?")) meta.post = i;
  });
  const weekCols = [];
  header.forEach((h, i) => { if (i >= 9) { const d = headerDate(h); if (d) weekCols.push({ i, date: d }); } });

  const clients = [];
  for (let r = hi + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    const name = cellStr(row[meta.name]);
    if (!name || name.toUpperCase() === "EOW FORM") continue;
    const cells = [];
    for (const wc of weekCols) {
      const raw = cellStr(row[wc.i]);
      if (raw) cells.push({ date: wc.date, raw });
    }
    clients.push({
      sheetRow: r + 1,
      name,
      start: meta.start !== undefined ? startDate(row[meta.start]) : null,
      day: meta.day !== undefined ? cellStr(row[meta.day]) : "",
      cadence: meta.cadence !== undefined ? cellStr(row[meta.cadence]) : "",
      review: meta.review !== undefined ? cellStr(row[meta.review]) : "",
      transformation: meta.transformation !== undefined ? cellStr(row[meta.transformation]) : "",
      post: meta.post !== undefined ? cellStr(row[meta.post]) : "",
      cells,
    });
  }
  return { headerRow: hi + 1, meta, weekCols, clients };
}

/** "amy-roberts" -> "Amy Roberts" (dated-set filename slug -> display name). */
export function slugToName(slug) {
  return slug.split("-").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

/**
 * List the dated sets in a sync folder: `<slug>-YYYY-MM-DD[-HHMM].xlsx`.
 * `-latest.xlsx` symlinks are skipped. Returns Map slug -> [{ file, slug, date,
 * time, stamp }] sorted oldest -> newest by (date, time).
 */
export function listDatedSets(dir, fs) {
  const re = /^(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*?)-(?<date>\d{4}-\d{2}-\d{2})(?:-(?<time>\d{4}))?\.(?:xlsx|csv)$/i;
  const sets = new Map();
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith("~$") || /-latest\.(xlsx|csv)$/i.test(f)) continue;
    const m = f.match(re);
    if (!m) continue;
    const { slug, date, time } = m.groups;
    const e = { file: path.join(dir, f), name: f, slug, date, time: time ?? "0000", stamp: `${date} ${(time ?? "0000").slice(0, 2)}:${(time ?? "0000").slice(2)}` };
    if (!sets.has(slug)) sets.set(slug, []);
    sets.get(slug).push(e);
  }
  for (const arr of sets.values()) arr.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return sets;
}
