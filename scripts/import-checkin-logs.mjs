#!/usr/bin/env node
/*
 * Coach Check In Log importer, v2 (DP Performance ONLY).
 *
 * Reads the "Check Ins" tab of each coach's "<Coach> - Check In Log*.xlsx"
 * export and projects it into the portal. Replaces import-coach-log.mjs for
 * this job (that one is CSV-only, has no date cutoff, reassigns coaches and
 * creates coach rows; none of that happens here).
 *
 * Owner decisions baked in (Kai, 2026-09-08):
 *   1. Weekly codes from the week of 2026-08-17 onwards (--from), capped at
 *      the current week (--to defaults to this week's Monday, Melbourne time).
 *      Anything dated after the cap is dropped, never written.
 *   2. Rows are dated on the sheet's Monday header, stored as
 *      YYYY-MM-DDT00:00:00Z (the same convention the in-portal manual entry
 *      uses). Existing rows in range that sit on a different timestamp inside
 *      the same local (Australia/Melbourne) week are RE-DATED to that
 *      canonical Monday first, so the unique index (client_id, submitted_at,
 *      source) dedups and the sheet code overwrites: SHEET WINS on conflicts.
 *      Re-dating is SCOPED: only rows belonging to a client matched in this
 *      run, and only weeks inside [--from, --to]. Rows for other coaches'
 *      clients and rows dated past the cap are never touched.
 *      A conflicting 'manual' row in the same week has its code updated to the
 *      sheet's code instead (no second row for that week).
 *   3. Cadence (Weekly/Fortnightly) is NOT written. GHL is source of truth on
 *      DP; active disagreements are written to a CSV for the GHL fix.
 *   4. Name matching: bracketed suffixes are stripped on both sides
 *      ("Molly Hayes (challenge)" == "Molly Hayes"). A fuzzy match is
 *      auto-accepted ONLY when the portal row is a first-name-only row, under
 *      the same coach as the sheet, and unique. Everything else is skipped
 *      and listed (ambiguous, other fuzzy, no-match).
 *   5. Metadata written per matched client (only when the sheet has a usable
 *      value; nothing is cleared): check_in_day, progress_review_rank,
 *      transformation_had (True -> true), transformation_post_approved
 *      (Post? = Approved -> true). clients.coach_id is NEVER touched.
 *   6. The Pay tab is never opened.
 *
 * SAFE BY DEFAULT: dry run prints the plan and writes report files only.
 * --apply performs the database writes (after backing up every row it will
 * change to the report directory).
 *
 * Usage:
 *   node scripts/import-checkin-logs.mjs                       # dry run, ~/Downloads/* - Check In Log*.xlsx
 *   node scripts/import-checkin-logs.mjs --dir <folder>        # other folder
 *   node scripts/import-checkin-logs.mjs file1.xlsx file2.xlsx # explicit files
 *   node scripts/import-checkin-logs.mjs --parse-only          # sheets only, no database connection
 *   node scripts/import-checkin-logs.mjs --apply               # WRITE (owner go only)
 *
 * Options:
 *   --env FILE        env file (default .env.local next to the repo root)
 *   --from YYYY-MM-DD first week header to include (default 2026-08-17)
 *   --to   YYYY-MM-DD last week header to include (default: current Monday, Melbourne)
 *   --out  DIR        report directory (default data-imports/checkin-import-<date>)
 *   --expect N        abort unless default discovery resolves exactly N files (default 13, 0 disables)
 *   --allow-ref REF   run against a project other than DP (refused otherwise)
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pad, normName, similarity, cellStr, headerDate, startDate, parseCheckInLog } from "./lib/checkin-sheet.mjs";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------- constants
const DP_REF = "vutdqjfixvijldlyvbaw";
const TZ = "Australia/Melbourne";
// R16-2c: the sheets still write SM ("send message") and M ("messaged"); the
// portal stores both as MS ("message sent") and uses M for "missed". Sheet
// codes are translated here; a sheet that already writes MS passes through.
const SHEET_CODE_MAP = { SM: "MS", M: "MS" };
const VALID_CODES = new Set(["Y", "MS", "M", "F", "G", "P", "C", "N"]);
const DAY_MAP = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2, tuedsday: 2,
  wednesday: 3, wed: 3, wednesady: 3, wednesay: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, dflt = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};
const APPLY = flag("--apply");
const PARSE_ONLY = flag("--parse-only");
const positional = argv.filter((a, i) => !a.startsWith("--") && !["--env", "--from", "--to", "--out", "--dir", "--allow-ref", "--expect"].includes(argv[i - 1]));

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ENV_FILE = opt("--env", path.join(REPO_ROOT, ".env.local"));
const FROM = opt("--from", "2026-08-17");
const TODAY_LOCAL = localDateParts(new Date());
const TO = opt("--to", mondayOf(TODAY_LOCAL.iso));
const OUT_DIR = opt("--out", path.join(REPO_ROOT, "data-imports", `checkin-import-${TODAY_LOCAL.iso}`));
const DIR = opt("--dir", path.join(os.homedir(), "Downloads"));
const ALLOW_REF = opt("--allow-ref", null);

if (!/^\d{4}-\d{2}-\d{2}$/.test(FROM) || !/^\d{4}-\d{2}-\d{2}$/.test(TO)) {
  console.error("--from / --to must be YYYY-MM-DD");
  process.exit(1);
}

// ---------------------------------------------------------------- helpers
/** Local "YYYY-MM-DD HH:MM" for a file mtime, for the discovery listing. */
function fmtMtime(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Calendar date parts of `d` in Australia/Melbourne. */
function localDateParts(d) {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
    .formatToParts(d)
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});
  const iso = `${parts.year}-${parts.month}-${parts.day}`;
  return { iso, weekday: parts.weekday };
}

/** Monday (ISO date) of the week containing an ISO calendar date. Pure date maths, no tz. */
function mondayOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const back = (dt.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  dt.setUTCDate(dt.getUTCDate() - back);
  return dt.toISOString().slice(0, 10);
}

/** Canonical stored timestamp for a week: Monday 00:00:00Z. */
const canonicalTs = (mondayIso) => `${mondayIso}T00:00:00+00:00`;

function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function csvLine(cells) {
  return cells.map((c) => {
    const s = c === null || c === undefined ? "" : String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",");
}

function writeCsv(file, header, rows) {
  fs.writeFileSync(file, [csvLine(header), ...rows.map(csvLine)].join("\n") + "\n");
}

// ---------------------------------------------------------------- 1. parse sheets
// Default discovery: newest export per coach. The folder holds several vintages
// of the same sheet (the June batch, the 2026-09-08 batch as "<name> (1).xlsx",
// and later ones with no suffix at all), so a filename suffix cannot separate
// them — modification time can. Everything older for that coach is listed and
// ignored. Pass files explicitly to bypass this entirely.
const EXPECT = Number(opt("--expect", "13"));
const coachOf = (f) => path.basename(f).split(" - ")[0].trim();

let files, discovery = null;
if (positional.length) {
  files = positional;
} else {
  const allLogs = fs.readdirSync(DIR)
    .filter((f) => / - Check In Log.*\.xlsx$/i.test(f) && !f.startsWith("~$"))
    .map((f) => { const p = path.join(DIR, f); return { file: f, path: p, coach: coachOf(f), mtime: fs.statSync(p).mtime }; });
  const newest = new Map();
  for (const e of allLogs) {
    const cur = newest.get(e.coach);
    if (!cur || e.mtime > cur.mtime) newest.set(e.coach, e);
  }
  discovery = [...newest.values()].sort((a, b) => a.coach.localeCompare(b.coach));
  files = discovery.map((e) => e.path);
  const ignored = allLogs.filter((e) => newest.get(e.coach) !== e).sort((a, b) => a.coach.localeCompare(b.coach));

  console.log(`Discovery in ${DIR}: ${allLogs.length} Check In Log file(s) -> newest per coach = ${discovery.length}`);
  for (const e of discovery) console.log(`   USE     ${fmtMtime(e.mtime)}  ${e.file}`);
  for (const e of ignored) console.log(`   ignore  ${fmtMtime(e.mtime)}  ${e.file}  (older than the ${e.coach} file above)`);

  if (EXPECT > 0 && discovery.length !== EXPECT) {
    console.error(`\nRefusing: discovery resolved ${discovery.length} file(s), expected exactly ${EXPECT}. Fix the folder, or pass --expect ${discovery.length} / explicit files.`);
    process.exit(1);
  }
}

if (!files.length) {
  console.error(`No "<Coach> - Check In Log*.xlsx" files found in ${DIR}`);
  process.exit(1);
}

// One file per coach, whichever route produced the list.
{
  const seen = new Map();
  for (const f of files) {
    const c = coachOf(f);
    if (seen.has(c)) { console.error(`Refusing: coach "${c}" appears twice (${path.basename(seen.get(c))} and ${path.basename(f)}).`); process.exit(1); }
    seen.set(c, f);
  }
}

const logs = [];
for (const file of files) {
  const coachName = path.basename(file).split(" - ")[0].trim();
  let parsed;
  try { parsed = parseCheckInLog(file); } catch (e) { console.error(e.message); process.exit(1); }
  logs.push({ file: path.basename(file), coachName, ...parsed });
}

{
  const seen = new Map();
  for (const L of logs) {
    if (seen.has(L.coachName)) { console.error(`Two files for coach "${L.coachName}": ${seen.get(L.coachName)} and ${L.file}. Pass the right one explicitly.`); process.exit(1); }
    seen.set(L.coachName, L.file);
  }
}
console.log(`Mode: ${APPLY ? "APPLY (writes)" : PARSE_ONLY ? "PARSE-ONLY (no database)" : "DRY RUN (no writes)"}`);
console.log(`Weeks: header dates ${FROM} .. ${TO} inclusive (today ${TODAY_LOCAL.iso} ${TODAY_LOCAL.weekday}, ${TZ})`);
console.log(`Files: ${logs.length}`);
for (const L of logs) {
  const inRange = L.weekCols.filter((w) => w.date >= FROM && w.date <= TO).length;
  console.log(`  ${L.coachName.padEnd(16)} rows ${String(L.clients.length).padStart(3)} | week cols ${String(L.weekCols.length).padStart(3)} (${L.weekCols[0]?.date} .. ${L.weekCols.at(-1)?.date}) | in range ${inRange} | meta cols ${Object.keys(L.meta).join(",")}`);
}

// Sheet-level distributions (independent of the database).
const dist = { day: new Map(), cadence: new Map(), review: new Map(), transformation: new Map(), post: new Map(), codeRaw: new Map() };
const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
let cellsInRange = 0, cellsFuture = 0, cellsBefore = 0;
for (const L of logs) for (const c of L.clients) {
  for (const k of ["day", "cadence", "review", "transformation", "post"]) bump(dist[k], c[k] || "(blank)");
  for (const cell of c.cells) {
    if (cell.date < FROM) cellsBefore++;
    else if (cell.date > TO) cellsFuture++;
    else { cellsInRange++; bump(dist.codeRaw, cell.raw); }
  }
}
const fmtMap = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(", ");
console.log(`\nSheet rows: ${logs.reduce((n, L) => n + L.clients.length, 0)}`);
console.log(`Week cells: ${cellsInRange} in range | ${cellsBefore} before ${FROM} (ignored) | ${cellsFuture} after ${TO} (dropped)`);
console.log(`Raw codes in range: ${fmtMap(dist.codeRaw)}`);
for (const k of ["day", "cadence", "review", "transformation", "post"]) console.log(`${k.padEnd(15)} ${fmtMap(dist[k])}`);

if (PARSE_ONLY) {
  console.log("\nParse-only: stopping before any database connection.");
  process.exit(0);
}

// ---------------------------------------------------------------- 2. connect (DP guard)
const env = loadEnv(ENV_FILE);
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error(`NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in ${ENV_FILE}`); process.exit(1); }
const ref = new URL(url).host.split(".")[0];
if (ref !== DP_REF && ref !== ALLOW_REF) {
  console.error(`Refusing: env points at ${ref}, this importer is DP-only (${DP_REF}). Pass --allow-ref ${ref} to override.`);
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function fetchAll(table, select, modify) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(select).range(from, from + 999);
    if (modify) q = modify(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const coaches = await fetchAll("coaches", "id,name,is_active");
const clients = await fetchAll("clients", "id,name,coach_id,status,plan,start_date,ghl_contact_id,check_in_day,progress_review_rank,transformation_had,transformation_post_approved");
const existing = await fetchAll("check_ins", "id,client_id,coach_id,submitted_at,code,source,week_number", (q) => q.gte("submitted_at", `${addDays(FROM, -1)}T00:00:00+00:00`));
const coachById = new Map(coaches.map((c) => [c.id, c]));
const clientById = new Map(clients.map((c) => [c.id, c]));
console.log(`\nPortal (${ref}): ${coaches.length} coaches, ${clients.length} clients, ${existing.length} check_ins from ${addDays(FROM, -1)}`);

// Coach resolution: full name, else unique first-name match. DP carries stale
// single-name duplicates ("Cody" alongside "Cody Philip") that are inactive and
// hold no clients; a first-name-only filename would otherwise land on the dead
// row and write check_ins nobody can see. Never settle for such a row while an
// active same-first-name row exists.
const clientsPerCoach = new Map();
for (const c of clients) clientsPerCoach.set(c.coach_id, (clientsPerCoach.get(c.coach_id) ?? 0) + 1);
const coachClientCount = (c) => clientsPerCoach.get(c.id) ?? 0;
const isEmptyDuplicate = (c) => c.is_active === false && coachClientCount(c) === 0;

for (const L of logs) {
  const n = normName(L.coachName);
  const first = n.split(" ")[0];
  const sameFirst = coaches.filter((x) => normName(x.name).split(" ")[0] === first);
  const exact = coaches.filter((x) => normName(x.name) === n);

  let c = exact.length === 1 ? exact[0] : null;
  let via = c ? "exact name" : null;

  if (c && isEmptyDuplicate(c)) {
    const live = sameFirst.filter((x) => x.id !== c.id && !isEmptyDuplicate(x));
    if (live.length === 1) { via = `exact row "${c.name}" is an inactive 0-client duplicate -> active first-name row`; c = live[0]; }
    else if (live.length > 1) { console.error(`Coach "${L.coachName}": exact row is an empty duplicate and ${live.length} active rows share the first name (${live.map((x) => x.name).join(", ")}). Aborting.`); process.exit(1); }
  }

  if (!c) {
    const live = sameFirst.filter((x) => !isEmptyDuplicate(x));
    const pool = live.length ? live : sameFirst;
    if (pool.length === 1) { c = pool[0]; via = live.length ? "unique active first-name match" : "unique first-name match"; }
    else if (pool.length > 1) { console.error(`Coach "${L.coachName}": ${pool.length} candidates share the first name (${pool.map((x) => x.name).join(", ")}). Aborting.`); process.exit(1); }
  }

  if (!c) { console.error(`Coach "${L.coachName}" not found in portal coaches (no create here). Aborting.`); process.exit(1); }
  if (isEmptyDuplicate(c)) { console.error(`Coach "${L.coachName}" resolved to "${c.name}" (${c.id}), which is inactive with 0 clients. Refusing to write against a dead coach row.`); process.exit(1); }
  L.coach = c;
  L.coachVia = via;
}

console.log("\n==== COACH RESOLUTION ====");
console.log("sheet coach".padEnd(18) + "-> portal coach".padEnd(20) + "coach_id".padEnd(38) + "clients  active  how");
for (const L of logs) {
  console.log(
    `${L.coachName.padEnd(18)}-> ${L.coach.name.padEnd(17)}${L.coach.id.padEnd(38)}${String(coachClientCount(L.coach)).padStart(7)}  ${String(L.coach.is_active).padEnd(6)}  ${L.coachVia}`
  );
}

// ---------------------------------------------------------------- 3. name matching
const byNorm = new Map();
for (const c of clients) {
  const k = normName(c.name);
  if (!byNorm.has(k)) byNorm.set(k, []);
  byNorm.get(k).push(c);
}
const normKeys = [...byNorm.keys()];

const matched = [];   // { L, row, client, how }
const skipped = [];   // { L, row, reason, candidates }
for (const L of logs) for (const row of L.clients) {
  const n = normName(row.name);
  const exact = byNorm.get(n) ?? [];
  if (exact.length === 1) { matched.push({ L, row, client: exact[0], how: n === row.name.toLowerCase().trim() ? "exact" : "exact-normalised" }); continue; }
  if (exact.length > 1) {
    skipped.push({ L, row, reason: "ambiguous: same name on several portal rows", candidates: exact.map((c) => `${c.name} [${c.status}, ${coachById.get(c.coach_id)?.name ?? "no coach"}]`) });
    continue;
  }
  const first = n.split(" ")[0];
  const firstOnly = first && n.includes(" ")
    ? (byNorm.get(first) ?? []).filter((c) => c.coach_id === L.coach.id)
    : [];
  if (firstOnly.length === 1) { matched.push({ L, row, client: firstOnly[0], how: "fuzzy-first-name" }); continue; }
  // Skip list with the nearest names for the human pass.
  const cands = normKeys
    .map((k) => ({ k, s: similarity(n, k) }))
    .filter((x) => x.s >= 0.6 || (first && x.k.split(" ")[0] === first))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((x) => byNorm.get(x.k)[0])
    .map((c) => `${c.name} [${c.status}, ${coachById.get(c.coach_id)?.name ?? "no coach"}]`);
  skipped.push({ L, row, reason: cands.length ? (firstOnly.length > 1 ? "fuzzy: several first-name rows under this coach" : "fuzzy: needs a human") : "no match", candidates: cands });
}

// ---------------------------------------------------------------- 4. build the plan
// 4a. weekly codes
const unmappedCells = [];
const proposals = new Map(); // key client|monday -> { client_id, coach_id, week, code, sources:[..] }
const clashes = [];
for (const m of matched) {
  for (const cell of m.row.cells) {
    if (cell.date < FROM || cell.date > TO) continue;
    const rawCode = cell.raw.toUpperCase();
    const code = SHEET_CODE_MAP[rawCode] ?? rawCode;
    if (!VALID_CODES.has(code)) { unmappedCells.push({ coach: m.L.coachName, client: m.row.name, week: cell.date, raw: cell.raw }); continue; }
    const week = mondayOf(cell.date);
    const k = `${m.client.id}|${week}`;
    const p = proposals.get(k);
    if (!p) proposals.set(k, { client_id: m.client.id, coach_id: m.L.coach.id, week, code, start: m.row.start ?? m.client.start_date, sources: [`${m.L.coachName}:${m.row.sheetRow}`] });
    else if (p.code !== code) { p.clash = true; clashes.push({ client: m.client.name, week, a: `${p.sources.join("+")}=${p.code}`, b: `${m.L.coachName}:${m.row.sheetRow}=${code}` }); }
    else p.sources.push(`${m.L.coachName}:${m.row.sheetRow}`);
  }
}
for (const [k, p] of proposals) if (p.clash) proposals.delete(k);

// 4b. existing rows: canonical Monday, re-dates, conflicts
// Re-dating is scoped twice over: only clients this run actually matched, and
// only weeks inside [FROM, TO]. Other coaches' clients and rows dated past the
// cap are read for conflict detection but never rewritten.
const scopedClientIds = new Set(matched.map((m) => m.client.id));
const redates = [];          // { id, from, to }
const redateSkipped = { outOfScope: 0, afterCap: 0 };
const existingByKey = new Map(); // client|week|source -> row (after re-date)
for (const r of existing) {
  const localMon = mondayOf(localDateParts(new Date(r.submitted_at)).iso);
  if (localMon < FROM) continue; // the day-before fetch margin; not in scope
  const canon = canonicalTs(localMon);
  const same = new Date(r.submitted_at).getTime() === new Date(canon).getTime();
  const inScope = scopedClientIds.has(r.client_id) && localMon <= TO;
  if (!same) {
    if (inScope) redates.push({ id: r.id, client: clientById.get(r.client_id)?.name ?? r.client_id, coach: coachById.get(r.coach_id)?.name ?? "(none)", from: r.submitted_at, to: canon, code: r.code, source: r.source });
    else if (localMon > TO) redateSkipped.afterCap++;
    else redateSkipped.outOfScope++;
  }
  // Key on the canonical week either way so conflict lookups still line up; the
  // stored timestamp is only rewritten for rows that appear in `redates`.
  existingByKey.set(`${r.client_id}|${localMon}|${r.source}`, { ...r, submitted_at: inScope ? canon : r.submitted_at });
}

const upserts = [];       // coach_log rows to upsert
const overwrites = [];    // existing coach_log rows whose code changes
const manualUpdates = []; // existing manual rows whose code changes (sheet wins)
let unchanged = 0, inserts = 0;
for (const p of proposals.values()) {
  const manual = existingByKey.get(`${p.client_id}|${p.week}|manual`);
  if (manual) {
    if (manual.code !== p.code) manualUpdates.push({ id: manual.id, client: clientById.get(p.client_id)?.name, week: p.week, from: manual.code, to: p.code });
    else unchanged++;
    continue; // the manual row is that week's row; no coach_log duplicate
  }
  const cur = existingByKey.get(`${p.client_id}|${p.week}|coach_log`);
  const startIso = p.start;
  const week_number = startIso ? Math.max(1, Math.floor((Date.parse(p.week) - Date.parse(startIso)) / 6.048e8) + 1) : null;
  upserts.push({ client_id: p.client_id, coach_id: p.coach_id, submitted_at: canonicalTs(p.week), code: p.code, week_number, source: "coach_log" });
  if (!cur) inserts++;
  else if (cur.code !== p.code) overwrites.push({ client: clientById.get(p.client_id)?.name, week: p.week, from: cur.code, to: p.code });
  else unchanged++;
}

// 4c. client metadata
const metaByClient = new Map(); // client_id -> { fields, conflicts }
const unmappedMeta = { day: [], review: [], cadence: [] };
for (const m of matched) {
  const r = m.row;
  const f = {};
  const dayKey = r.day.toLowerCase().trim();
  if (dayKey) { if (dayKey in DAY_MAP) f.check_in_day = DAY_MAP[dayKey]; else unmappedMeta.day.push({ coach: m.L.coachName, client: r.name, value: r.day }); }
  if (r.review) {
    const n = Number(r.review);
    if (Number.isInteger(n) && n >= 1 && n <= 4) f.progress_review_rank = n;
    else if (!["-", "tbd"].includes(r.review.toLowerCase())) unmappedMeta.review.push({ coach: m.L.coachName, client: r.name, value: r.review });
  }
  if (r.transformation.toLowerCase() === "true") f.transformation_had = true;
  if (r.post.toLowerCase() === "approved") { f.transformation_had = true; f.transformation_post_approved = true; }
  const cadKey = r.cadence.toLowerCase();
  const cad = { w: "Weekly", weekly: "Weekly", f: "Fortnightly", fortnightly: "Fortnightly" }[cadKey] ?? null;
  if (r.cadence && !cad) unmappedMeta.cadence.push({ coach: m.L.coachName, client: r.name, value: r.cadence });
  const slot = metaByClient.get(m.client.id) ?? { client: m.client, fields: {}, cadence: null, sheetCoach: m.L.coachName, conflicts: [] };
  for (const [k, v] of Object.entries(f)) {
    if (slot.fields[k] !== undefined && slot.fields[k] !== v) slot.conflicts.push(`${k}: ${slot.fields[k]} vs ${v} (${m.L.coachName})`);
    slot.fields[k] = v;
  }
  if (cad) slot.cadence = cad;
  metaByClient.set(m.client.id, slot);
}
const metaUpdates = []; // { id, name, set:{}, was:{} }
const metaCounts = { check_in_day: 0, progress_review_rank: 0, transformation_had: 0, transformation_post_approved: 0 };
for (const slot of metaByClient.values()) {
  const set = {}, was = {};
  for (const [k, v] of Object.entries(slot.fields)) {
    if (slot.client[k] !== v) { set[k] = v; was[k] = slot.client[k]; }
    metaCounts[k]++;
  }
  if (Object.keys(set).length) metaUpdates.push({ id: slot.client.id, name: slot.client.name, set, was });
}
const cadenceComparable = [...metaByClient.values()].filter((s) => s.cadence && s.client.status === "active");
const cadenceDisagreements = cadenceComparable
  .filter((s) => s.client.plan !== s.cadence)
  .map((s) => ({ client: s.client.name, client_id: s.client.id, ghl_contact_id: s.client.ghl_contact_id, portal_plan: s.client.plan, sheet_cadence: s.cadence, portal_coach: coachById.get(s.client.coach_id)?.name ?? "", sheet_coach: s.sheetCoach }));
const coachMismatch = matched.filter((m) => m.client.coach_id !== m.L.coach.id).map((m) => ({ sheet_coach: m.L.coachName, client: m.client.name, portal_coach: coachById.get(m.client.coach_id)?.name ?? "(none)", status: m.client.status }));

// ---------------------------------------------------------------- 5. report
fs.mkdirSync(OUT_DIR, { recursive: true });
const list = (title, rows, fmt, max = 200) => {
  console.log(`\n-- ${title} (${rows.length}) --`);
  rows.slice(0, max).forEach((r) => console.log("   " + fmt(r)));
  if (rows.length > max) console.log(`   ... ${rows.length - max} more (see ${OUT_DIR})`);
};

console.log(`\n==== NAME MATCHING ====`);
const howCounts = matched.reduce((a, m) => ((a[m.how] = (a[m.how] ?? 0) + 1), a), {});
console.log(`matched ${matched.length} ${JSON.stringify(howCounts)} | skipped ${skipped.length}`);
list("Auto-accepted fuzzy (first-name row, same coach)", matched.filter((m) => m.how === "fuzzy-first-name"), (m) => `${m.L.coachName.padEnd(16)} ${m.row.name.padEnd(28)} -> ${m.client.name} [${m.client.status}]`);
list("SKIPPED", skipped, (s) => `${s.L.coachName.padEnd(16)} ${s.row.name.padEnd(28)} ${s.reason}${s.candidates.length ? "  -> " + s.candidates.join(" | ") : ""}`);
list("FYI: matched client sits under a different portal coach (coach_id NOT changed)", coachMismatch, (r) => `${r.sheet_coach.padEnd(16)} ${r.client.padEnd(28)} portal: ${r.portal_coach} [${r.status}]`, 60);

console.log(`\n==== WEEKLY CODES ${FROM}..${TO} ====`);
console.log(`proposed weeks ${proposals.size} -> upsert ${upserts.length} (insert ${inserts}, overwrite ${overwrites.length}, unchanged ${unchanged}) | manual rows updated ${manualUpdates.length} | in-sheet clashes dropped ${clashes.length} | unmapped cells ${unmappedCells.length}`);
const perWeek = upserts.reduce((a, u) => ((a[u.submitted_at.slice(0, 10)] = (a[u.submitted_at.slice(0, 10)] ?? 0) + 1), a), {});
console.log("per week: " + Object.entries(perWeek).sort().map(([k, v]) => `${k}=${v}`).join(", "));
list("Re-dates of existing rows to canonical Monday 00:00Z (matched clients, weeks <= cap)", redates, (r) => `${r.client.padEnd(24)} ${r.coach.padEnd(14)} ${r.from} -> ${r.to}  (${r.code}, ${r.source})`);
console.log(`   not re-dated: ${redateSkipped.outOfScope} row(s) for clients outside this file set, ${redateSkipped.afterCap} row(s) dated after ${TO}`);
list("Overwrites (sheet wins)", overwrites, (r) => `${r.client.padEnd(24)} week ${r.week}: ${r.from} -> ${r.to}`);
list("Manual rows updated (sheet wins)", manualUpdates, (r) => `${r.client.padEnd(24)} week ${r.week}: ${r.from} -> ${r.to}`);
list("In-sheet clashes (dropped, fix the sheets)", clashes, (r) => `${r.client.padEnd(24)} week ${r.week}: ${r.a} vs ${r.b}`);
list("Unmapped cells (not written)", unmappedCells, (r) => `${r.coach.padEnd(16)} ${r.client.padEnd(26)} ${r.week} ${JSON.stringify(r.raw)}`);

console.log(`\n==== CLIENT METADATA ====`);
console.log(`clients with a value: ${JSON.stringify(metaCounts)} | rows that actually change: ${metaUpdates.length}`);
list("Unmapped Check in Day", unmappedMeta.day, (r) => `${r.coach.padEnd(16)} ${r.client.padEnd(26)} ${JSON.stringify(r.value)}`);
list("Unmapped Progress Review", unmappedMeta.review, (r) => `${r.coach.padEnd(16)} ${r.client.padEnd(26)} ${JSON.stringify(r.value)}`);
list("Unmapped cadence (not written anyway)", unmappedMeta.cadence, (r) => `${r.coach.padEnd(16)} ${r.client.padEnd(26)} ${JSON.stringify(r.value)}`);
list("Metadata conflicts between duplicate rows (last wins)", [...metaByClient.values()].filter((s) => s.conflicts.length), (s) => `${s.client.name.padEnd(26)} ${s.conflicts.join("; ")}`);
console.log(`\nCadence: NOT written. Active disagreements for the GHL fix: ${cadenceDisagreements.length} of ${cadenceComparable.length} active matched clients carrying a sheet cadence`);
{
  const dir = cadenceDisagreements.reduce((a, r) => {
    const k = `${r.portal_plan ?? "(null)"} -> ${r.sheet_cadence}`;
    return ((a[k] = (a[k] ?? 0) + 1), a);
  }, {});
  const wf = dir["Weekly -> Fortnightly"] ?? 0;
  const fw = dir["Fortnightly -> Weekly"] ?? 0;
  console.log(`  portal Weekly -> sheet Fortnightly: ${wf}`);
  console.log(`  portal Fortnightly -> sheet Weekly: ${fw}`);
  const other = Object.entries(dir).filter(([k]) => k !== "Weekly -> Fortnightly" && k !== "Fortnightly -> Weekly");
  if (other.length) console.log(`  other directions: ${other.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  const oneWay = (wf > 0) !== (fw > 0) && !other.length;
  console.log(`  ONE-DIRECTIONAL ACROSS THIS RUN: ${oneWay ? "YES" : "NO"}`);
  const perCoach = cadenceDisagreements.reduce((a, r) => ((a[r.sheet_coach] = (a[r.sheet_coach] ?? 0) + 1), a), {});
  console.log(`  by sheet coach: ${Object.entries(perCoach).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(", ")}`);
}

// Report files (written in dry run too; these are the review artefacts).
writeCsv(path.join(OUT_DIR, "cadence-disagreements.csv"), ["client", "client_id", "ghl_contact_id", "portal_plan", "sheet_cadence", "portal_coach", "sheet_coach"], cadenceDisagreements.map((r) => [r.client, r.client_id, r.ghl_contact_id, r.portal_plan, r.sheet_cadence, r.portal_coach, r.sheet_coach]));
writeCsv(path.join(OUT_DIR, "skipped-names.csv"), ["sheet_coach", "sheet_row", "sheet_name", "reason", "candidates"], skipped.map((s) => [s.L.coachName, s.row.sheetRow, s.row.name, s.reason, s.candidates.join(" | ")]));
writeCsv(path.join(OUT_DIR, "unmapped-cells.csv"), ["coach", "client", "week", "raw"], unmappedCells.map((r) => [r.coach, r.client, r.week, r.raw]));
fs.writeFileSync(path.join(OUT_DIR, "plan.json"), JSON.stringify({ mode: APPLY ? "apply" : "dry-run", ref, from: FROM, to: TO, files: logs.map((L) => L.file), redates, overwrites, manualUpdates, clashes, upserts, metaUpdates, coachMismatch, cadenceDisagreements, generatedAt: new Date().toISOString() }, null, 1));
console.log(`\nReport files -> ${OUT_DIR}`);

if (!APPLY) {
  console.log("\nDRY RUN: nothing written to the database. Re-run with --apply to write.");
  process.exit(0);
}

// ---------------------------------------------------------------- 6. apply
console.log("\n==== APPLY ====");
// Backup everything this run touches.
const touchedClientIds = new Set(metaUpdates.map((u) => u.id));
fs.writeFileSync(path.join(OUT_DIR, "backup-check_ins.json"), JSON.stringify(existing, null, 1));
fs.writeFileSync(path.join(OUT_DIR, "backup-clients-metadata.json"), JSON.stringify(clients.filter((c) => touchedClientIds.has(c.id)).map(({ id, name, check_in_day, progress_review_rank, transformation_had, transformation_post_approved }) => ({ id, name, check_in_day, progress_review_rank, transformation_had, transformation_post_approved })), null, 1));
console.log(`backup written (${existing.length} check_ins, ${touchedClientIds.size} clients)`);

let n = 0;
for (const r of redates) {
  const { error } = await db.from("check_ins").update({ submitted_at: r.to }).eq("id", r.id);
  if (error) { console.error(`re-date ${r.id}: ${error.message}`); process.exit(1); }
  n++;
}
console.log(`re-dated ${n} rows`);

n = 0;
for (const r of manualUpdates) {
  const { error } = await db.from("check_ins").update({ code: r.to }).eq("id", r.id);
  if (error) { console.error(`manual update ${r.id}: ${error.message}`); process.exit(1); }
  n++;
}
console.log(`manual rows updated ${n}`);

for (let i = 0; i < upserts.length; i += 500) {
  const { error } = await db.from("check_ins").upsert(upserts.slice(i, i + 500), { onConflict: "client_id,submitted_at,source" });
  if (error) { console.error(`check_ins upsert (batch ${i / 500 + 1}): ${error.message}`); process.exit(1); }
}
console.log(`check_ins upserted ${upserts.length}`);

n = 0;
for (let i = 0; i < metaUpdates.length; i += 20) {
  const batch = metaUpdates.slice(i, i + 20);
  const results = await Promise.all(batch.map((u) => db.from("clients").update(u.set).eq("id", u.id)));
  const bad = results.find((r) => r.error);
  if (bad) { console.error(`clients metadata update: ${bad.error.message} (after ${n} ok)`); process.exit(1); }
  n += batch.length;
}
console.log(`clients metadata updated ${n}`);
console.log("\nDone. Wrote changes to the database.");
