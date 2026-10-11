// TJD item 2: one CSV for Toby of everything that did NOT line up, in both
// directions, each with its closest candidate on the other side. READ ONLY.
//   node scripts/tjd-unmatched-export.mjs
import fs from "node:fs";
import { tjdClient, fetchAll, normName } from "./tjd-lib.mjs";
import { readSheets } from "./tjd-sheets.mjs";

// Dice on bigrams, plus Levenshtein, the same pair the roster tooling uses:
// dice alone scored "Perri" against "Perry" at 0.75 and missed it.
const bigrams = (s) => { const o = []; for (let i = 0; i < s.length - 1; i++) o.push(s.slice(i, i + 2)); return o; };
function dice(a, b) {
  if (a === b) return 1;
  const A = bigrams(a), B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const pool = [...B];
  let hit = 0;
  for (const g of A) { const i = pool.indexOf(g); if (i >= 0) { pool.splice(i, 1); hit++; } }
  return (2 * hit) / (A.length + B.length);
}
function lev(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}
const best = (key, pool) => pool
  .map((p) => ({ ...p, score: dice(key, p.key), d: lev(key, p.key) }))
  .sort((x, y) => y.score - x.score || x.d - y.d)[0];

const db = tjdClient();
const { roster, priceOnly } = readSheets();
const coaches = await fetchAll(db, "coaches", "id,name");
const byId = new Map(coaches.map((c) => [c.id, c.name]));
const clients = (await fetchAll(db, "clients", "id,name,coach_id,status"))
  .filter((c) => c.status === "active")
  .map((c) => ({ ...c, coach: byId.get(c.coach_id) ?? "(unassigned)", key: normName(c.name) }));

const dbKeys = new Set(clients.map((c) => c.key));
// Tag the origin BEFORE spreading. The first version asked roster.includes(r)
// against a freshly spread object, which can never match by reference, so every
// sheet row was mislabelled as coming from Toby's master tab.
const sheetRows = [
  ...roster.map((r) => ({ ...r, origin: "roster", key: normName(r.name) })),
  ...priceOnly.map((r) => ({ ...r, origin: "master", key: normName(r.name) })),
];
const sheetKeys = new Set(sheetRows.map((r) => r.key));

const rows = [];
for (const r of sheetRows.filter((r) => !dbKeys.has(r.key))) {
  const b = best(r.key, clients);
  rows.push({
    name: r.name, coach: r.coach,
    source: r.origin === "roster" ? "on a coach roster, not in TJD" : "on Toby's master tab only, not in TJD",
    candidate: b ? b.name : "", candidate_coach: b ? b.coach : "",
    confidence: b ? (b.score >= 0.8 || b.d <= 1 ? "likely the same person" : b.score >= 0.6 ? "possible" : "no close match") : "",
    similarity: b ? b.score.toFixed(2) : "",
  });
}
for (const c of clients.filter((c) => !sheetKeys.has(c.key))) {
  const b = best(c.key, sheetRows);
  rows.push({
    name: c.name, coach: c.coach, source: "active in TJD, on no sheet",
    candidate: b ? b.name : "", candidate_coach: b ? b.coach : "",
    confidence: b ? (b.score >= 0.8 || b.d <= 1 ? "likely the same person" : b.score >= 0.6 ? "possible" : "no close match") : "",
    similarity: b ? b.score.toFixed(2) : "",
  });
}
rows.sort((a, b) => a.source.localeCompare(b.source) || a.coach.localeCompare(b.coach) || a.name.localeCompare(b.name));

const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const cols = ["name", "coach", "source", "candidate", "candidate_coach", "confidence", "similarity"];
const out = "/Users/kaifourie/tjd-fit-hq/TJD-UNMATCHED-FOR-TOBY.csv";
fs.writeFileSync(out, [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n");

const by = (k) => rows.filter((r) => r.source === k).length;
console.log(`sheet rows with no TJD client : ${by("on a coach roster, not in TJD") + by("on Toby's master tab only, not in TJD")}`);
console.log(`TJD clients on no sheet       : ${by("active in TJD, on no sheet")}`);
console.log(`likely the same person, just spelled differently: ${rows.filter((r) => r.confidence === "likely the same person").length}`);
console.log(`\n-> ${out}`);
