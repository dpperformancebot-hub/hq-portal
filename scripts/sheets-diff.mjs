#!/usr/bin/env node
/*
 * sheets:diff — what changed between the two most recent dated sheet sets.
 *
 * Kai syncs by dropping a dated export set into data-imports/sheets/<brand>/
 * (`<slug>-YYYY-MM-DD[-HHMM].xlsx`) and repointing the `<slug>-latest.xlsx`
 * symlinks. This script compares, per coach, the newest set against the one
 * before it and reports rows added / removed and cells changed (client name,
 * column, old -> new). The master sheet's "Client List" tab is diffed too and
 * its Coach / Status / Plan changes are folded into each coach's section, so a
 * status or cadence change shows up under the coach it belongs to.
 *
 * Output: console summary + data-imports/sheets/last-sync.md (gitignored, PII).
 * NEVER connects to Supabase. Read-only on disk except for last-sync.md.
 *
 * Usage:
 *   npm run sheets:diff                       # data-imports/sheets/dp
 *   node scripts/sheets-diff.mjs --dir <folder> --out <file.md>
 *   node scripts/sheets-diff.mjs --full       # list every changed week cell, not just the count
 */

import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { normName, cellStr, startDate, parseCheckInLog, slugToName, listDatedSets } from "./lib/checkin-sheet.mjs";

const argv = process.argv.slice(2);
const opt = (name, dflt = null) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt; };
const FULL = argv.includes("--full");
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIR = path.resolve(opt("--dir", path.join(REPO_ROOT, "data-imports", "sheets", "dp")));
const OUT = path.resolve(opt("--out", path.join(path.dirname(DIR), "last-sync.md")));
const MASTER_SLUG = "master-sheet";
const MASTER_TAB = "Client List";
const MASTER_COLS = ["Coach", "Status", "Plan", "Start Date", "End Date", "Pause Start", "Pasue End", "PIF", "Resign until", "Starting Price/week"];

const sets = listDatedSets(DIR, fs);
if (!sets.size) { console.error(`No dated sets (<slug>-YYYY-MM-DD[-HHMM].xlsx) in ${DIR}`); process.exit(1); }

const fmtDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const md = [];
const say = (s = "") => { md.push(s); };

// ------------------------------------------------------------ coach logs
const META_LABELS = { start: "Start Date", day: "Check in day", cadence: "Weekly/Fortnightly", review: "Progress review", transformation: "Transformation", post: "Post?" };

/** Index a parsed log by normalised name; duplicates get a #n suffix so both show. */
function indexLog(parsed) {
  const idx = new Map();
  for (const c of parsed.clients) {
    let k = normName(c.name), n = 1;
    while (idx.has(k)) k = `${normName(c.name)} #${++n}`;
    idx.set(k, c);
  }
  return idx;
}

function diffLog(oldP, newP) {
  const A = indexLog(oldP), B = indexLog(newP);
  const added = [...B.keys()].filter((k) => !A.has(k)).map((k) => B.get(k));
  const removed = [...A.keys()].filter((k) => !B.has(k)).map((k) => A.get(k));
  const changes = []; // { client, column, from, to, kind: "meta"|"week" }
  for (const [k, b] of B) {
    const a = A.get(k);
    if (!a) continue;
    for (const f of Object.keys(META_LABELS)) {
      const av = f === "start" ? fmtDate(a[f]) : (a[f] ?? ""), bv = f === "start" ? fmtDate(b[f]) : (b[f] ?? "");
      if (av !== bv) changes.push({ client: b.name, column: META_LABELS[f], from: av || "(blank)", to: bv || "(blank)", kind: f === "cadence" ? "cadence" : "meta" });
    }
    const ac = new Map(a.cells.map((c) => [c.date, c.raw])), bc = new Map(b.cells.map((c) => [c.date, c.raw]));
    for (const d of new Set([...ac.keys(), ...bc.keys()])) {
      const av = ac.get(d) ?? "", bv = bc.get(d) ?? "";
      if (av !== bv) changes.push({ client: b.name, column: `wk ${fmtDate(d)}`, from: av || "(blank)", to: bv || "(blank)", kind: "week" });
    }
  }
  return { added, removed, changes };
}

// ------------------------------------------------------------ master sheet
function readMaster(file) {
  const wb = XLSX.readFile(file, { cellDates: true, sheets: [MASTER_TAB] });
  const ws = wb.Sheets[MASTER_TAB];
  if (!ws) throw new Error(`${path.basename(file)}: no "${MASTER_TAB}" tab`);
  const g = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const h = g[0].map((x) => String(x ?? "").trim());
  const ci = h.indexOf("Client");
  if (ci < 0) throw new Error(`${path.basename(file)}: no "Client" column on ${MASTER_TAB}`);
  const cols = MASTER_COLS.filter((c) => h.includes(c)).map((c) => ({ c, i: h.indexOf(c) }));
  const rows = new Map();
  for (let r = 1; r < g.length; r++) {
    const row = g[r]; if (!row) continue;
    const name = cellStr(row[ci]); if (!name) continue;
    let k = normName(name), n = 1;
    while (rows.has(k)) k = `${normName(name)} #${++n}`;
    const rec = { name, sheetRow: r + 1 };
    for (const { c, i } of cols) rec[c] = /date|start|end|until/i.test(c) ? (startDate(row[i]) ? fmtDate(startDate(row[i])) : cellStr(row[i])) : cellStr(row[i]);
    rows.set(k, rec);
  }
  return { rows, cols: cols.map((x) => x.c) };
}

function diffMaster(oldM, newM) {
  const added = [...newM.rows.keys()].filter((k) => !oldM.rows.has(k)).map((k) => newM.rows.get(k));
  const removed = [...oldM.rows.keys()].filter((k) => !newM.rows.has(k)).map((k) => oldM.rows.get(k));
  const changes = [];
  for (const [k, b] of newM.rows) {
    const a = oldM.rows.get(k); if (!a) continue;
    for (const c of newM.cols) if ((a[c] ?? "") !== (b[c] ?? "")) changes.push({ client: b.name, coach: b.Coach || a.Coach || "", column: c, from: a[c] || "(blank)", to: b[c] || "(blank)" });
  }
  return { added, removed, changes };
}

// ------------------------------------------------------------ run
const slugs = [...sets.keys()].sort((a, b) => (a === MASTER_SLUG) - (b === MASTER_SLUG) || a.localeCompare(b));
const stampOf = (e) => e.stamp;

let master = null;
if (sets.has(MASTER_SLUG)) {
  const arr = sets.get(MASTER_SLUG);
  if (arr.length >= 2) {
    const [o, n] = arr.slice(-2);
    try { master = { o, n, ...diffMaster(readMaster(o.file), readMaster(n.file)) }; }
    catch (e) { master = { o, n, error: e.message }; }
  } else master = { n: arr.at(-1), single: true };
}
const masterByCoach = (first) => {
  if (!master || master.error || master.single) return { added: [], removed: [], changes: [] };
  const own = (r) => normName(r.Coach ?? "").split(" ")[0] === first;
  return { added: master.added.filter(own), removed: master.removed.filter(own), changes: master.changes.filter((c) => normName(c.coach).split(" ")[0] === first) };
};

say(`# Sheet sync diff — ${DIR.replace(REPO_ROOT + "/", "")}`);
say();
say(`Generated ${new Date().toISOString()} by \`npm run sheets:diff\`. Compares the two most recent dated sets per slug. No database involved.`);
say();

const summary = [];
for (const slug of slugs) {
  if (slug === MASTER_SLUG) continue;
  const arr = sets.get(slug);
  const coach = slugToName(slug);
  const first = normName(coach).split(" ")[0];
  const mc = masterByCoach(first);
  if (arr.length < 2) {
    say(`## ${coach}`); say(); say(`Only one dated set (${arr[0].name}); nothing to compare yet.`); say();
    summary.push({ coach, prev: "-", cur: arr[0].stamp, added: "-", removed: "-", cadence: "-", weeks: "-", meta: "-", mStatus: mc.changes.filter((c) => c.column === "Status").length, mPlan: mc.changes.filter((c) => c.column === "Plan").length });
    continue;
  }
  const [o, n] = arr.slice(-2);
  let d;
  try { d = diffLog(parseCheckInLog(o.file), parseCheckInLog(n.file)); }
  catch (e) { say(`## ${coach}`); say(); say(`ERROR: ${e.message}`); say(); summary.push({ coach, prev: o.stamp, cur: n.stamp, added: "err", removed: "err", cadence: "err", weeks: "err", meta: "err", mStatus: "-", mPlan: "-" }); continue; }
  const cad = d.changes.filter((c) => c.kind === "cadence");
  const wk = d.changes.filter((c) => c.kind === "week");
  const meta = d.changes.filter((c) => c.kind === "meta");
  const mStatus = mc.changes.filter((c) => c.column === "Status");
  const mPlan = mc.changes.filter((c) => c.column === "Plan");
  const mCoach = mc.changes.filter((c) => c.column === "Coach");
  summary.push({ coach, prev: o.stamp, cur: n.stamp, added: d.added.length, removed: d.removed.length, cadence: cad.length, weeks: wk.length, meta: meta.length, mStatus: mStatus.length, mPlan: mPlan.length });

  say(`## ${coach}`); say();
  say(`\`${o.name}\` (${o.stamp}) -> \`${n.name}\` (${n.stamp})`); say();
  const line = (label, items, fmt) => { say(`**${label}: ${items.length}**`); for (const it of items) say(`- ${fmt(it)}`); say(); };
  line("Check-in log: clients added", d.added, (c) => `${c.name} (row ${c.sheetRow}${c.start ? `, start ${fmtDate(c.start)}` : ""}${c.cadence ? `, ${c.cadence}` : ""})`);
  line("Check-in log: clients removed", d.removed, (c) => `${c.name} (was row ${c.sheetRow}${c.cadence ? `, ${c.cadence}` : ""})`);
  line("Check-in log: cadence changes", cad, (c) => `${c.client}: ${c.from} -> ${c.to}`);
  line("Check-in log: other detail changes", meta, (c) => `${c.client}: ${c.column} ${c.from} -> ${c.to}`);
  if (FULL) line("Check-in log: week cell changes", wk, (c) => `${c.client}: ${c.column} ${c.from} -> ${c.to}`);
  else {
    const per = new Map(); for (const c of wk) per.set(c.client, (per.get(c.client) ?? 0) + 1);
    say(`**Check-in log: week cell changes: ${wk.length}** across ${per.size} client(s)${per.size ? " — " + [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} (${v})`).join(", ") + (per.size > 12 ? ", …" : "") : ""}. Pass --full to list each cell.`); say();
  }
  line("Master Client List: status changes", mStatus, (c) => `${c.client}: ${c.from} -> ${c.to}`);
  line("Master Client List: plan (cadence) changes", mPlan, (c) => `${c.client}: ${c.from} -> ${c.to}`);
  line("Master Client List: coach changes", mCoach, (c) => `${c.client}: ${c.from} -> ${c.to}`);
  line("Master Client List: rows added under this coach", mc.added, (r) => `${r.name} (${r.Status || "no status"}, ${r.Plan || "no plan"}${r["Start Date"] ? `, start ${r["Start Date"]}` : ""})`);
  line("Master Client List: rows removed under this coach", mc.removed, (r) => `${r.name} (was ${r.Status || "no status"})`);
}

// Master-sheet section (whole tab, including rows with no/unknown coach).
say(`## Master sheet — ${MASTER_TAB}`); say();
if (!master) say("No master-sheet dated sets found.");
else if (master.single) say(`Only one dated set (${master.n.name}); nothing to compare yet.`);
else if (master.error) say(`ERROR: ${master.error}`);
else {
  say(`\`${master.o.name}\` (${master.o.stamp}) -> \`${master.n.name}\` (${master.n.stamp})`); say();
  say(`Rows added: ${master.added.length} · removed: ${master.removed.length} · cell changes: ${master.changes.length}`); say();
  const byCol = new Map(); for (const c of master.changes) byCol.set(c.column, (byCol.get(c.column) ?? 0) + 1);
  if (byCol.size) { say("Changes by column: " + [...byCol.entries()].map(([k, v]) => `${k} ${v}`).join(", ")); say(); }
  const orphan = (r) => !normName(r.Coach ?? "");
  const oa = master.added.filter(orphan), or = master.removed.filter(orphan), oc = master.changes.filter((c) => !normName(c.coach));
  if (oa.length || or.length || oc.length) {
    say(`**Rows with no Coach value** (not attributed above): added ${oa.length}, removed ${or.length}, changed ${oc.length}`);
    for (const r of oa) say(`- added: ${r.name} (${r.Status || "no status"})`);
    for (const r of or) say(`- removed: ${r.name}`);
    for (const c of oc) say(`- ${c.client}: ${c.column} ${c.from} -> ${c.to}`);
    say();
  }
}

// Summary table first in the file, and on the console.
const hdr = ["Coach", "Previous set", "Current set", "Added", "Removed", "Cadence Δ", "Week cells Δ", "Other Δ", "Master status Δ", "Master plan Δ"];
const rows = summary.map((s) => [s.coach, s.prev, s.cur, s.added, s.removed, s.cadence, s.weeks, s.meta, s.mStatus, s.mPlan].map(String));
const table = [`| ${hdr.join(" | ")} |`, `| ${hdr.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)];
md.splice(4, 0, "## Summary", "", ...table, "");

fs.writeFileSync(OUT, md.join("\n") + "\n");

const w = hdr.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const pr = (r) => r.map((c, i) => c.padEnd(w[i])).join("  ");
console.log(`Sheet sync diff: ${DIR}`);
console.log(pr(hdr)); console.log(pr(w.map((n) => "-".repeat(n))));
for (const r of rows) console.log(pr(r));
if (master && !master.single && !master.error) console.log(`\nMaster ${MASTER_TAB}: ${master.o.stamp} -> ${master.n.stamp}: +${master.added.length} rows, -${master.removed.length} rows, ${master.changes.length} cell changes`);
console.log(`\nDetail written to ${OUT}`);
