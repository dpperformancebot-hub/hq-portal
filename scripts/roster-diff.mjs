#!/usr/bin/env node
/*
 * roster-diff — R16-1 diagnostic (DP Performance). READ-ONLY. No --apply exists.
 *
 * For each active coach, three views of "who are my clients":
 *   a. portal  = clients where coach_id = coach AND status = 'active'
 *   b. sheet   = rows on the coach's latest check-in log (data-imports/sheets/dp/
 *                <slug>-latest.xlsx, parsed by scripts/lib/checkin-sheet.mjs)
 *   c. GHL     = the last nightly sync's projection. DP stores no raw GHL contact
 *                snapshot: src/lib/sync/ghl-sync.ts maps the GHL "Coach" custom
 *                field to coaches.id by name and writes clients.coach_id/status
 *                directly, so the clients table IS the GHL view. A separate
 *                column shows the master sheet's "Client List" (Coach + Status)
 *                instead, which is what Dan treats as truth for cadence.
 *
 * Every sheet row is classified into exactly one bucket:
 *   A  exists in portal, coach_id null              -> assignment fix
 *   B  exists in portal, different coach_id         -> reassignment fix
 *   C  exists in portal under this coach, status != active but the sheet
 *      says active                                  -> status fix
 *   D  not in portal at all                         -> missing from GHL / sync
 *   E  in portal (active, this coach), not on sheet -> stale sheet or churn
 *   OK matched, same coach, active on both          (not a discrepancy)
 *   ?  name-match ambiguity (importer's rules: exact normalised, else unique
 *      first-name-only row under the same coach; anything else with Dice >= 0.6
 *      is listed for a human)
 *
 * "Sheet says active" = the row's most recent week code is not C, and the row
 * has a code inside the last --recent weeks (default 8) or a start date in
 * that window / the future. Rows whose latest code is C or that went silent are
 * "sheet-inactive" and are reported separately, never bucketed as A-D.
 *
 * Usage:
 *   node scripts/roster-diff.mjs                    # all active coaches
 *   node scripts/roster-diff.mjs --coach perry,angus
 *   node scripts/roster-diff.mjs --dir data-imports/sheets/dp --env .env.local
 *   node scripts/roster-diff.mjs --names            # print the name lists (default prints counts + names)
 *   node scripts/roster-diff.mjs --md <file>        # also write the report as markdown
 *   node scripts/roster-diff.mjs --out <dir>        # plan.json (A, B, D-as-A) + C/D/E/ambiguous CSVs for the humans
 */

import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { normName, similarity, FUZZY_THRESHOLD, cellStr, startDate, parseCheckInLog, slugToName } from "./lib/checkin-sheet.mjs";

const argv = process.argv.slice(2);
if (argv.includes("--apply")) { console.error("roster-diff is read-only by design; there is no --apply."); process.exit(2); }
const opt = (name, dflt = null) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt; };
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIR = path.resolve(opt("--dir", path.join(REPO_ROOT, "data-imports", "sheets", "dp")));
const ENV_FILE = opt("--env", path.join(REPO_ROOT, ".env.local"));
const ONLY = (opt("--coach", "") || "").split(",").map((s) => normName(s)).filter(Boolean);
const RECENT_WEEKS = Number(opt("--recent", "8"));
const MD_OUT = opt("--md", null);
const OUT_DIR = opt("--out", null); // writes plan.json + bucket CSVs (A/B plan for scripts/apply-roster-fixes.mjs)
const DP_REF = "vutdqjfixvijldlyvbaw";
const ALLOW_REF = opt("--allow-ref", null);
const TODAY = new Date().toISOString().slice(0, 10);
const recentSince = new Date(Date.now() - RECENT_WEEKS * 7 * 86_400_000).toISOString().slice(0, 10);

const out = [];
const say = (s = "") => { console.log(s); out.push(s); };
const fmtDate = (iso) => (iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)}` : "");

// ------------------------------------------------------------ env + guard
const env = {};
for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error(`NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in ${ENV_FILE}`); process.exit(1); }
const ref = new URL(url).host.split(".")[0];
if (ref !== DP_REF && ref !== ALLOW_REF) { console.error(`Refusing: env points at ${ref}; this diagnostic is DP-only (${DP_REF}). Pass --allow-ref ${ref} to override.`); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });
async function fetchAll(table, select, modify) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(select).range(from, from + 999);
    if (modify) q = modify(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

// ------------------------------------------------------------ portal
const coaches = await fetchAll("coaches", "id,name,role,is_active");
const clients = await fetchAll("clients", "id,name,coach_id,status,plan,start_date,end_date,ghl_contact_id,synced_at");
const checkIns = await fetchAll("check_ins", "client_id,submitted_at,code", (q) => q.order("submitted_at", { ascending: false }));
const lastCheckIn = new Map();
for (const r of checkIns) if (!lastCheckIn.has(r.client_id)) lastCheckIn.set(r.client_id, r);
const coachById = new Map(coaches.map((c) => [c.id, c]));
const coachLabel = (id) => (id ? coachById.get(id)?.name ?? `(unknown coach ${id})` : "(unassigned)");
const clientsPerCoach = new Map();
for (const c of clients) clientsPerCoach.set(c.coach_id, (clientsPerCoach.get(c.coach_id) ?? 0) + 1);
const isEmptyDuplicate = (c) => c.is_active === false && (clientsPerCoach.get(c.id) ?? 0) === 0;

const byNorm = new Map();
for (const c of clients) { const k = normName(c.name); if (!byNorm.has(k)) byNorm.set(k, []); byNorm.get(k).push(c); }
const normKeys = [...byNorm.keys()];

// ------------------------------------------------------------ master sheet (Client List)
let master = null;
{
  const f = path.join(DIR, "master-sheet-latest.xlsx");
  if (fs.existsSync(f)) {
    const wb = XLSX.readFile(f, { cellDates: true, sheets: ["Client List"] });
    const ws = wb.Sheets["Client List"];
    if (ws) {
      const g = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
      const h = g[0].map((x) => String(x ?? "").trim());
      const ci = h.indexOf("Client"), co = h.indexOf("Coach"), st = h.indexOf("Status"), pl = h.indexOf("Plan"), sd = h.indexOf("Start Date"), ed = h.indexOf("End Date");
      master = { rows: [], byNorm: new Map() };
      for (let r = 1; r < g.length; r++) {
        const row = g[r]; if (!row) continue;
        const name = cellStr(row[ci]); if (!name) continue;
        const rec = { name, coach: cellStr(row[co]), status: cellStr(row[st]), plan: cellStr(row[pl]), start: startDate(row[sd]) ?? "", end: startDate(row[ed]) ?? "", sheetRow: r + 1 };
        master.rows.push(rec);
        const k = normName(name); if (!master.byNorm.has(k)) master.byNorm.set(k, []); master.byNorm.get(k).push(rec);
      }
    }
  }
}

/**
 * The master Client List row that describes a client's CURRENT engagement.
 * A re-sign appears TWICE: the old engagement under the old coach marked
 * Cancelled, and the new one under the new coach marked Active. Taking the
 * first match (2026-09-21) read the stale cancelled row and wrongly reported
 * the old coach as "what the master sheet says", which made four genuine
 * coach changes look like conflicts. Prefer Active, then the latest start.
 */
function masterRowFor(name) {
  const rows = master?.byNorm.get(normName(name)) ?? [];
  if (rows.length <= 1) return rows[0] ?? null;
  const rank = (r) => (/^active$/i.test(r.status) ? 0 : /^paused$/i.test(r.status) ? 1 : 2);
  return [...rows].sort((a, b) => rank(a) - rank(b) || (b.start ?? "").localeCompare(a.start ?? ""))[0];
}

// ------------------------------------------------------------ sheets -> coach resolution (importer's rule)
const sheetFiles = fs.readdirSync(DIR).filter((f) => /-latest\.(xlsx|csv)$/i.test(f) && !f.startsWith("master-sheet")).sort();
function resolveCoach(displayName) {
  const n = normName(displayName), first = n.split(" ")[0];
  const sameFirst = coaches.filter((x) => normName(x.name).split(" ")[0] === first);
  const exact = coaches.filter((x) => normName(x.name) === n);
  let c = exact.length === 1 ? exact[0] : null, via = c ? "exact name" : null;
  if (c && isEmptyDuplicate(c)) { const live = sameFirst.filter((x) => x.id !== c.id && !isEmptyDuplicate(x)); if (live.length === 1) { c = live[0]; via = "exact row is an empty duplicate -> active first-name row"; } }
  if (!c) { const live = sameFirst.filter((x) => !isEmptyDuplicate(x)); const pool = live.length ? live : sameFirst; if (pool.length === 1) { c = pool[0]; via = "unique first-name match"; } else if (pool.length > 1) return { error: `${pool.length} coaches share the first name: ${pool.map((x) => x.name).join(", ")}` }; }
  if (!c) return { error: "no coach row" };
  return { coach: c, via };
}
const logs = [];
for (const f of sheetFiles) {
  const slug = f.replace(/-latest\.(xlsx|csv)$/i, "");
  const display = slugToName(slug);
  const res = resolveCoach(display);
  const real = fs.realpathSync(path.join(DIR, f));
  if (res.error) { say(`! ${f}: cannot resolve coach "${display}": ${res.error}`); continue; }
  let parsed;
  try { parsed = parseCheckInLog(real); } catch (e) { say(`! ${e.message}`); continue; }
  logs.push({ file: path.basename(real), slug, display, coach: res.coach, via: res.via, parsed });
}
const logByCoachId = new Map(logs.map((L) => [L.coach.id, L]));
// Which coach sheets carry each (normalised) client name. A name on two live
// sheets means two coaches both claim the client; never move such a row.
const sheetsByName = new Map(); // normName -> Map(coachName -> sheet status)
for (const L of logs) for (const row of L.parsed.clients) { const k = normName(row.name); if (!sheetsByName.has(k)) sheetsByName.set(k, new Map()); sheetsByName.get(k).set(L.coach.name, null); }

// ------------------------------------------------------------ sheet-row status
// What the sheet says about a row, from its most recent week code (<= today):
//   active    Y / F / SM / N / G / "-" inside the window, or a starter with no codes yet
//   paused    latest code P inside the window (an old P is "silent")
//   cancelled latest code C (or "Transferred")
//   messaged  latest code M (chasing a lapsed client) or "-" (off-week marker).
//             Angus keeps M running for weeks on churned people and "-" trails
//             cancelled rows, so neither alone is active; the master sheet's
//             Status decides (Active -> active, else inactive)
//   silent    no code inside the window and no recent/future start
const ACTIVE_CODES = new Set(["Y", "F", "SM", "N", "G"]);
function sheetStatus(row) {
  const past = row.cells.filter((c) => c.date <= TODAY).sort((a, b) => a.date.localeCompare(b.date));
  const latest = past.at(-1) ?? null;
  const code = (latest?.raw ?? "").toUpperCase();
  const recentCode = !!latest && latest.date >= recentSince;
  const recentStart = !!row.start && row.start >= recentSince;
  const ms = masterRowFor(row.name);
  const masterStatus = (ms?.status ?? "").toLowerCase();
  let status, reason = "";
  if (code === "C" || code === "TRANSFERRED") { status = "cancelled"; reason = `latest code ${code}`; }
  else if (!latest) { status = recentStart || !!row.start ? "active" : "silent"; reason = status === "active" ? "starter, no codes yet" : "no codes, no start date"; }
  else if (!recentCode && !recentStart) { status = "silent"; reason = `no code since ${fmtDate(recentSince)} (last ${code} @ ${fmtDate(latest.date)})`; }
  else if (code === "P") { status = "paused"; reason = "latest code P"; }
  else if (code === "M" || code === "-") { status = masterStatus === "active" ? "active" : "messaged"; reason = masterStatus === "active" ? `latest code ${code} but master says Active` : `latest code ${code} (${code === "M" ? "messaged" : "off-week marker"}), master ${masterStatus || "not listed"}`; }
  else if (ACTIVE_CODES.has(code)) { status = "active"; }
  else { status = "active"; reason = `unrecognised code ${code}, treated as active`; }
  return { status, latest, code, reason, master: ms };
}

// ------------------------------------------------------------ matching (importer's rules)
function matchRow(row, coach) {
  const n = normName(row.name), first = n.split(" ")[0];
  const exact = byNorm.get(n) ?? [];
  if (exact.length === 1) return { client: exact[0], how: "exact" };
  if (exact.length > 1) return { ambiguous: exact, how: "same name on several portal rows" };
  const firstOnly = first && n.includes(" ") ? (byNorm.get(first) ?? []).filter((c) => c.coach_id === coach.id) : [];
  if (firstOnly.length === 1) return { client: firstOnly[0], how: "fuzzy-first-name (same coach)" };
  const cands = normKeys.map((k) => ({ k, s: similarity(n, k) })).filter((x) => x.s >= FUZZY_THRESHOLD || (first && x.k.split(" ")[0] === first)).sort((a, b) => b.s - a.s).slice(0, 3).flatMap((x) => byNorm.get(x.k));
  return { none: true, candidates: cands };
}

// ------------------------------------------------------------ per coach
const activeCoaches = coaches.filter((c) => c.is_active).sort((a, b) => a.name.localeCompare(b.name));
const order = ONLY.length ? activeCoaches.filter((c) => ONLY.some((o) => normName(c.name).split(" ")[0] === o.split(" ")[0])) : activeCoaches;
const totals = { A: 0, B: 0, C: 0, D: 0, E: 0, OK: 0, AMB: 0, INACTIVE: 0 };
const summary = [];
const bucketsAll = { A: [], B: [], C: [], D: [], E: [], AMB: [] };

say(`ROSTER DIFF (read-only) — portal ${ref}, sheets ${DIR.replace(REPO_ROOT + "/", "")}, today ${TODAY}, sheet-active window ${RECENT_WEEKS}w (since ${fmtDate(recentSince)})`);
say(`Portal: ${coaches.length} coaches (${activeCoaches.length} active), ${clients.length} clients (${clients.filter((c) => c.status === "active").length} active; ${clients.filter((c) => !c.coach_id).length} unassigned of which ${clients.filter((c) => !c.coach_id && c.status === "active").length} active), ${checkIns.length} check_ins. Master Client List: ${master ? master.rows.length + " named rows" : "not found"}.`);
say(`Sheets: ${logs.length} coach logs resolved${logs.length ? " (" + logs.map((L) => `${L.display} -> ${L.coach.name}`).join(", ") + ")" : ""}.`);
say();

for (const coach of order) {
  const L = logByCoachId.get(coach.id);
  const first = normName(coach.name).split(" ")[0];
  const portalActive = clients.filter((c) => c.coach_id === coach.id && c.status === "active");
  const portalAll = clients.filter((c) => c.coach_id === coach.id);
  const masterMine = master ? master.rows.filter((r) => normName(r.coach).split(" ")[0] === first) : [];
  const masterActive = masterMine.filter((r) => /^active$/i.test(r.status));
  const masterActiveNorm = new Set(masterActive.map((r) => normName(r.name)));

  say(`==== ${coach.name} (${coach.role}, ${coach.id}) ====`);
  if (!L) { say(`  no check-in log in ${DIR} for this coach; portal active = ${portalActive.length}, master sheet Active = ${masterActive.length}`); say(); summary.push({ coach: coach.name, portal: portalActive.length, sheet: "-", sheetActive: "-", master: masterActive.length, A: "-", B: "-", C: "-", D: "-", E: "-", AMB: "-" }); continue; }

  const rows = L.parsed.clients.map((row) => ({ row, st: sheetStatus(row) }));
  for (const r of rows) sheetsByName.get(normName(r.row.name))?.set(coach.name, r.st.status);
  const live = (r) => r.st.status === "active" || r.st.status === "paused";
  const sheetActive = rows.filter((r) => r.st.status === "active");
  const sheetPaused = rows.filter((r) => r.st.status === "paused");
  const b = { A: [], B: [], C: [], D: [], E: [], AMB: [], OK: [], INACTIVE: rows.filter((r) => !live(r)) };
  const matchedIds = new Set();
  for (const r of rows) {
    const m = matchRow(r.row, coach);
    if (m.client) matchedIds.add(m.client.id);
    if (!live(r)) continue; // cancelled / messaged / silent rows never drive A-D
    const ms = r.st.master;
    const superseded = (master?.byNorm.get(normName(r.row.name)) ?? []).filter((x) => x !== ms);
    const masterNote = ms
      ? `master: ${ms.coach || "no coach"}/${ms.status || "no status"}/${ms.plan || "-"}${ms.start ? ` from ${fmtDate(ms.start)}` : ""}${superseded.length ? ` (supersedes ${superseded.map((o) => `${o.coach || "no coach"}/${o.status}`).join(", ")})` : ""}`
      : "master: not listed";
    const sheetNote = `sheet: ${r.st.status}${r.st.latest ? ` (${r.st.code} @ ${fmtDate(r.st.latest.date)})` : " (no codes)"}${r.row.start ? `, start ${fmtDate(r.row.start)}` : ""}${r.row.cadence ? `, ${r.row.cadence}` : ""}`;
    if (m.ambiguous) { b.AMB.push({ name: r.row.name, note: `${m.how}: ${m.ambiguous.map((c) => `${c.name} [${c.status}, ${coachLabel(c.coach_id)}]`).join(" | ")}` }); continue; }
    if (m.none) {
      // First-name-only, unassigned, active portal row that IS this person (Kai 2026-09-21: treat as A, take the surname from the sheet).
      const first = normName(r.row.name).split(" ")[0];
      const stub = normName(r.row.name).includes(" ") ? (byNorm.get(first) ?? []).filter((c) => !c.coach_id && c.status === "active") : [];
      if (stub.length === 1) { b.A.push({ name: r.row.name, id: stub[0].id, portal_name: stub[0].name, rename_to: r.row.name, to_coach_id: coach.id, to_coach: coach.name, from_bucket: "D", evidence: { sheet: L.file, sheet_row: r.row.sheetRow, sheet_status: r.st.status, latest_code: r.st.code || null, latest_week: r.st.latest?.date ?? null, master_coach: ms?.coach ?? null, master_status: ms?.status ?? null, also_on_sheets: [] }, note: `portal row is first-name-only "${stub[0].name}" [active, (unassigned)] -> rename to "${r.row.name}"; ${sheetNote}; ${masterNote}` }); continue; }
      b.D.push({ name: r.row.name, note: `${sheetNote}; ${masterNote}${m.candidates.length ? `; nearest portal: ${m.candidates.map((c) => `${c.name} [${c.status}, ${coachLabel(c.coach_id)}]`).join(" | ")}` : "; no similar portal name"}` }); continue; }
    const c = m.client;
    const portalNote = `portal: ${c.status}, ${coachLabel(c.coach_id)}${c.start_date ? `, start ${fmtDate(c.start_date)}` : ""}, ${c.plan ?? "-"}${m.how !== "exact" ? ` (matched ${m.how})` : ""}`;
    const otherSheets = [...(sheetsByName.get(normName(r.row.name)) ?? new Map())].filter(([n]) => n !== coach.name).map(([n, st]) => `${n}:${st ?? sheetStatus(logByCoachId.get(coaches.find((x) => x.name === n)?.id)?.parsed.clients.find((row) => normName(row.name) === normName(r.row.name)) ?? { cells: [], start: null, name: r.row.name }).status}`);
    const others = otherSheets; // "Coach:status" strings
    const liveElsewhere = otherSheets.filter((o) => /:(active|paused)$/.test(o));
    const evidence = { sheet: L.file, sheet_row: r.row.sheetRow, sheet_status: r.st.status, latest_code: r.st.code || null, latest_week: r.st.latest?.date ?? null, master_coach: ms?.coach ?? null, master_status: ms?.status ?? null, also_on_sheets: others };
    if (!c.coach_id) b.A.push({ name: r.row.name, id: c.id, portal_name: c.name, to_coach_id: coach.id, to_coach: coach.name, evidence, note: `${portalNote}; ${sheetNote}; ${masterNote}${others.length ? `; also on ${others.join(", ")} sheet` : ""}` });
    else if (c.coach_id !== coach.id) b.B.push({ name: r.row.name, id: c.id, ghl: c.ghl_contact_id, portal_name: c.name, portal_start: c.start_date ?? "", master_start: ms?.start ?? "", from: coachLabel(c.coach_id), from_coach_id: c.coach_id, to_coach_id: coach.id, to_coach: coach.name, evidence, conflict: liveElsewhere.length ? `also LIVE on ${liveElsewhere.join(", ")} sheet` : null, master_disagrees: !!(ms && normName(ms.coach).split(" ")[0] !== first), warning: !liveElsewhere.length && ms && normName(ms.coach).split(" ")[0] !== first ? `master sheet says ${ms.coach}/${ms.status}` : (others.length ? `also on ${others.join(", ")} sheet (not live there)` : null), note: `${portalNote}; ${sheetNote}; ${masterNote}${others.length ? `; also on ${others.join(", ")} sheet` : ""}` });
    else if (r.st.status === "active" && c.status !== "active") b.C.push({ name: r.row.name, id: c.id, ghl: c.ghl_contact_id, from_status: c.status, to_status: "Active", fix: `${c.status} -> active`, note: `${portalNote}; ${sheetNote}; ${masterNote}` });
    else if (r.st.status === "paused" && c.status === "cancelled") b.C.push({ name: r.row.name, id: c.id, ghl: c.ghl_contact_id, from_status: c.status, to_status: "Paused", fix: "cancelled -> paused", note: `${portalNote}; ${sheetNote}; ${masterNote}` });
    else b.OK.push({ name: r.row.name, id: c.id });
  }
  for (const c of portalActive) {
    if (matchedIds.has(c.id)) continue;
    const lc = lastCheckIn.get(c.id);
    const inMaster = masterActiveNorm.has(normName(c.name));
    b.E.push({ name: c.name, id: c.id, note: `portal: active${c.start_date ? `, start ${fmtDate(c.start_date)}` : ""}, ${c.plan ?? "-"}, last check-in ${lc ? `${lc.code} @ ${fmtDate(lc.submitted_at)}` : "none"}; master Active under ${coach.name}: ${inMaster ? "yes" : "no"}` });
  }
  for (const k of Object.keys(totals)) totals[k] += (b[k] ?? []).length;
  for (const k of Object.keys(bucketsAll)) bucketsAll[k].push(...b[k].map((x) => ({ coach: coach.name, ...x })));
  summary.push({ coach: coach.name, portal: portalActive.length, sheet: rows.length, sheetActive: `${sheetActive.length}+${sheetPaused.length}p`, master: masterActive.length, A: b.A.length, B: b.B.length, C: b.C.length, D: b.D.length, E: b.E.length, AMB: b.AMB.length });

  say(`  sheet ${L.file} (coach resolved via ${L.via})`);
  const inact = new Map(); for (const r of b.INACTIVE) inact.set(r.st.status, (inact.get(r.st.status) ?? 0) + 1);
  say(`  a. portal active ${portalActive.length} (paused ${portalAll.filter((c) => c.status === "paused").length}, all statuses ${portalAll.length}) | b. sheet rows ${rows.length}: active ${sheetActive.length}, paused ${sheetPaused.length}, ${[...inact.entries()].map(([k, v]) => `${k} ${v}`).join(", ") || "none inactive"} | master Client List Active ${masterActive.length}`);
  say(`  buckets: A ${b.A.length}  B ${b.B.length}  C ${b.C.length}  D ${b.D.length}  E ${b.E.length}  ambiguous ${b.AMB.length}  OK ${b.OK.length}  sheet-inactive ${b.INACTIVE.length}`);
  const list = (label, items, fmt) => { if (!items.length) return; say(`  -- ${label} (${items.length})`); for (const it of items) say(`     ${fmt(it)}`); };
  list("A · in sheet, portal row UNASSIGNED", b.A, (x) => `${x.from_bucket === "D" ? "(D-as-A) " : ""}${x.name} [${x.id}] — ${x.note}`);
  list("B · in sheet, portal row under ANOTHER coach", b.B, (x) => `${x.conflict ? "(BLOCKED: " + x.conflict + ") " : x.warning ? "(warning: " + x.warning + ") " : ""}${x.name} [${x.id}] — ${x.note}`);
  list("C · sheet and portal disagree on status (this coach)", b.C, (x) => `${x.name} [${x.id}] — fix ${x.fix}; ${x.note}`);
  list("D · in sheet, NOT in portal at all", b.D, (x) => `${x.name} — ${x.note}`);
  list("E · in portal (active, this coach), NOT on sheet", b.E, (x) => `${x.name} [${x.id}] — ${x.note}`);
  list("? · name-match ambiguity", b.AMB, (x) => `${x.name} — ${x.note}`);
  say();
}

// ------------------------------------------------------------ summary
const hdr = ["Coach", "Portal active", "Sheet rows", "Sheet active+paused", "Master Active", "A", "B", "C", "D", "E", "?"];
const rows = summary.map((s) => [s.coach, s.portal, s.sheet, s.sheetActive, s.master, s.A, s.B, s.C, s.D, s.E, s.AMB].map(String));
rows.push(["TOTAL", String(summary.reduce((n, s) => n + (Number(s.portal) || 0), 0)), String(summary.reduce((n, s) => n + (Number(s.sheet) || 0), 0)), String(summary.reduce((n, s) => n + (parseInt(s.sheetActive) || 0), 0)), String(summary.reduce((n, s) => n + (Number(s.master) || 0), 0)), String(totals.A), String(totals.B), String(totals.C), String(totals.D), String(totals.E), String(totals.AMB)]);
const w = hdr.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
say("==== BUCKET COUNTS ====");
say(hdr.map((h, i) => h.padEnd(w[i])).join("  "));
say(w.map((n) => "-".repeat(n)).join("  "));
for (const r of rows) say(r.map((c, i) => c.padEnd(w[i])).join("  "));
say();
say(`A = assignment fix (coach_id null) · B = reassignment (wrong coach_id) · C = status fix · D = missing from portal · E = in portal, not on sheet · ? = needs a human`);
const bIn = bucketsAll.B.length;
say(`If A+B+C were applied as the sheets say: portal active would move from ${summary.reduce((n, s) => n + (Number(s.portal) || 0), 0)} to about ${summary.reduce((n, s) => n + (Number(s.portal) || 0), 0) + totals.A + totals.C} (+A, +C; B moves ${bIn} client(s) between coaches, net zero across the team).`);
say(`Nothing was written. Coach_id, status and check_ins are untouched.`);

if (OUT_DIR) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const csv = (file, header, rows) => fs.writeFileSync(path.join(OUT_DIR, file), [header, ...rows].map((r) => r.map((c) => { const v = c === null || c === undefined ? "" : String(c); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(",")).join("\n") + "\n");
  const plan = {
    generated_at: new Date().toISOString(), portal: ref, sheets_dir: DIR, today: TODAY,
    A: bucketsAll.A.map((x) => ({ client_id: x.id, portal_name: x.portal_name, sheet_name: x.name, rename_to: x.rename_to ?? null, from_coach_id: null, to_coach_id: x.to_coach_id, to_coach: x.to_coach, from_bucket: x.from_bucket ?? "A", evidence: x.evidence })),
    B: bucketsAll.B.map((x) => ({ client_id: x.id, portal_name: x.portal_name, sheet_name: x.name, from_coach: x.from, from_coach_id: x.from_coach_id, to_coach_id: x.to_coach_id, to_coach: x.to_coach, conflict: x.conflict ?? null, warning: x.warning ?? null, master_disagrees: !!x.master_disagrees, evidence: x.evidence })),
  };
  // A first-name-only stub claimed by two different sheet names is two people sharing one row: neither may take it.
  const claims = new Map();
  for (const a of plan.A) if (a.from_bucket === "D") claims.set(a.client_id, (claims.get(a.client_id) ?? 0) + 1);
  for (const a of plan.A) if (a.from_bucket === "D" && claims.get(a.client_id) > 1) a.conflict = `portal stub "${a.portal_name}" is also claimed by another sheet name`;
  fs.writeFileSync(path.join(OUT_DIR, "plan.json"), JSON.stringify(plan, null, 2));
  // R16-1 follow-up (2026-09-22): ONE pass for the VA. Every GHL contact field
  // the portal and the sheets disagree on, coach and status together, with the
  // evidence beside it. A row the coaches themselves disagree on is marked ASK
  // DAN and carries no target value, so nobody guesses.
  const vaRows = [];
  for (const x of bucketsAll.C) {
    vaRows.push(["Status", x.coach, x.name, x.id, x.ghl ?? "", "Status", x.from_status ?? "", x.to_status ?? "", x.note, "Set the Status field on the GHL contact."]);
  }
  for (const x of bucketsAll.B) {
    const blocked = x.conflict || (x.master_disagrees ? x.warning : null);
    if (blocked) {
      vaRows.push(["ASK DAN", x.coach, x.name, x.id, x.ghl ?? "", "Coach", x.from ?? "", "", `${blocked}; ${x.note}`, "Do NOT change yet: two coaches claim this client, or the master sheet disagrees. Dan decides, then set Coach."]);
      continue;
    }
    vaRows.push(["Coach", x.coach, x.name, x.id, x.ghl ?? "", "Coach", x.from ?? "", x.to_coach ?? "", x.note, "Set the Coach field on the GHL contact. The nightly sync overwrites the portal from GHL, so the portal will not hold until this is done."]);
    // A re-sign reuses the GHL contact, so Start Date is usually still the
    // OLD engagement's. That drives week number, journey stage and renewals.
    if (x.master_start && x.portal_start && x.master_start !== x.portal_start) {
      vaRows.push(["Start date", x.coach, x.name, x.id, x.ghl ?? "", "Start Date", fmtDate(x.portal_start), fmtDate(x.master_start), `master sheet Client List row for the current engagement starts ${fmtDate(x.master_start)}; GHL still has ${fmtDate(x.portal_start)}`, "Check with Dan, then set Start Date so week number and renewals are right."]);
    }
  }
  csv("ghl-fixes-for-va.csv", ["fix_type", "coach", "client", "client_id", "ghl_contact_id", "ghl_field", "current_in_ghl", "set_to", "evidence", "action"], vaRows);
  console.log(`VA GHL fix list: ${vaRows.length} row(s) -> ghl-fixes-for-va.csv (${vaRows.filter((r) => r[0] === "ASK DAN").length} need Dan first)`);

  csv("bucket-C-status-for-ghl.csv", ["coach", "client", "client_id", "portal_status", "sheet_says", "fix", "detail"], bucketsAll.C.map((x) => [x.coach, x.name, x.id, x.fix.split(" -> ")[0], x.fix.split(" -> ")[1], x.fix, x.note]));
  csv("bucket-D-not-in-portal.csv", ["coach", "sheet_client", "detail"], bucketsAll.D.map((x) => [x.coach, x.name, x.note]));
  csv("bucket-E-portal-not-on-sheet.csv", ["coach", "client", "client_id", "detail"], bucketsAll.E.map((x) => [x.coach, x.name, x.id, x.note]));
  csv("ambiguous.csv", ["coach", "sheet_client", "detail"], bucketsAll.AMB.map((x) => [x.coach, x.name, x.note]));
  console.log(`\nPlan + bucket CSVs written to ${OUT_DIR} (A ${plan.A.length} incl. ${plan.A.filter((x) => x.from_bucket === "D").length} D-as-A, B ${plan.B.length} incl. ${plan.B.filter((x) => x.conflict).length} flagged conflicts)`);
}
if (MD_OUT) { fs.writeFileSync(MD_OUT, "```\n" + out.join("\n") + "\n```\n"); console.log(`\nReport written to ${MD_OUT}`); }
