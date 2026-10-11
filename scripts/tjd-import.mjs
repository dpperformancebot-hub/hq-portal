// TJD item 4: write cadence, client type, payer and Toby's custom prices onto
// the matched TJD clients, one audit row each.
//   node scripts/tjd-import.mjs            (dry run, writes nothing)
//   node scripts/tjd-import.mjs --write    (writes)
//
// Owner decisions 2026-09-30: default type brand, default payer weekly,
// Toby's 0.00 prices are COMPED so 0 is written, and one client's "Monthly"
// cadence stays blank rather than being guessed into Weekly or Fortnightly.
//
// Idempotent: a client already holding exactly these values is skipped, so a
// second run writes nothing and adds no audit rows. Every precondition is
// checked for EVERY row before the first write, so a bad row aborts the run
// instead of leaving the roster half imported.
import { tjdClient, fetchAll, normName } from "./tjd-lib.mjs";
import { readSheets } from "./tjd-sheets.mjs";

const WRITE = process.argv.includes("--write");
// A client whose sheet and whose TJD record name different coaches aborts the
// run by default: their cadence came off a roster they may have left, so the
// value's provenance is in doubt. --skip-mismatched leaves those rows alone and
// imports the rest, which is a decision, so it has to be asked for.
const SKIP_MISMATCHED = process.argv.includes("--skip-mismatched");
const db = tjdClient();
const { roster, priceOnly } = readSheets();

const coaches = await fetchAll(db, "coaches", "id,name");
const byId = new Map(coaches.map((c) => [c.id, c.name]));
const clients = await fetchAll(db, "clients", "id,name,coach_id,status,plan,client_type,payer,custom_client_monthly");
const byKey = new Map();
for (const c of clients) if (c.status === "active") byKey.set(normName(c.name), c);

const todo = [], skip = [], bad = [], missing = [];
const plan = (r) => {
  const c = byKey.get(normName(r.name));
  if (!c) { missing.push(`${r.coach}: ${r.name}`); return; }
  const coachName = byId.get(c.coach_id) ?? "(unassigned)";
  if (coachName !== r.coach) {
    bad.push(`${r.name}: sheet says ${r.coach}, TJD says ${coachName}`);
    if (SKIP_MISMATCHED) return;
  }
  const next = {};
  if (r.plan) next.plan = r.plan;                       // null = leave alone
  if (r.clientType) next.client_type = r.clientType;
  if (r.payer) next.payer = r.payer;
  if (r.customClientMonthly !== null && r.customClientMonthly !== undefined) {
    next.custom_client_monthly = r.customClientMonthly; // 0 is a real value here
  }
  const changed = Object.entries(next).filter(([k, v]) => {
    const cur = c[k];
    return k === "custom_client_monthly" ? Number(cur ?? NaN) !== Number(v) : cur !== v;
  });
  if (changed.length === 0) { skip.push(r.name); return; }
  todo.push({ id: c.id, name: c.name, coach: coachName, before: Object.fromEntries(changed.map(([k]) => [k, c[k] ?? null])), next });
};
roster.forEach(plan);
priceOnly.forEach(plan);   // the seven comped clients live here

console.log(`\nsheet rows read      : ${roster.length} roster + ${priceOnly.length} price-only`);
console.log(`matched in TJD       : ${todo.length + skip.length}`);
console.log(`  to write           : ${todo.length}`);
console.log(`  already correct    : ${skip.length}`);
console.log(`not in TJD           : ${missing.length}`);
console.log(`coach disagreements  : ${bad.length}`);
for (const b of bad) console.log(`   MISMATCH ${b}`);
console.log(`blank cadence, left alone: ${roster.filter((r) => !r.plan).map((r) => r.name).join(", ") || "none"}`);
console.log(`comped at $0             : ${[...roster, ...priceOnly].filter((r) => r.comped).map((r) => r.name).join(", ") || "none"}`);

if (bad.length && !SKIP_MISMATCHED) {
  console.error("\nABORT: a sheet and TJD disagree on the coach. Nothing written.");
  console.error("Re-run with --skip-mismatched to import everyone else and leave these alone.");
  process.exit(1);
}
if (bad.length) console.log(`\nSKIPPING the ${bad.length} row(s) above; everyone else proceeds.`);
if (!WRITE) { console.log("\nDRY RUN. Nothing written. Re-run with --write to apply."); process.exit(0); }

let ok = 0; const failed = [];
for (const t of todo) {
  const { error } = await db.from("clients").update(t.next).eq("id", t.id);
  if (error) { failed.push(`${t.name}: ${error.message}`); continue; }
  const { error: aErr } = await db.from("sync_events").insert({
    source: "manual", entity: "client", ghl_id: null, action: "tjd_pay_fields_set",
    payload: { client_id: t.id, coach: t.coach, from: t.before, to: t.next, by: "owner",
      reason: "TJD import 2026-09-30: cadence from the coach rosters, custom price from the September master, defaults brand/weekly, owner authorised" },
  });
  if (aErr) failed.push(`${t.name}: WROTE FIELDS BUT AUDIT FAILED: ${aErr.message}`);
  ok++;
}
console.log(`\nwrote ${ok} of ${todo.length}. problems: ${failed.length}`);
for (const f of failed) console.log(`  ${f}`);
