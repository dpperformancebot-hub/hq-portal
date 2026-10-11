// R18/TJD item 1: prove every migration actually landed on TJD. READ ONLY.
//   node scripts/tjd-verify-migrations.mjs
import { tjdClient, loadDecisions } from "./tjd-lib.mjs";

const db = tjdClient();
let fail = 0;
const ok = (label, good, detail = "") => {
  console.log(`  ${good ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!good) fail++;
};

// A missing column comes back as PostgREST 42703, so selecting the column IS
// the existence test. limit(0) keeps it free.
async function hasColumns(table, cols) {
  const { error } = await db.from(table).select(cols).limit(1);
  if (!error) return { good: true };
  return { good: false, detail: error.message };
}

console.log("\n20260921000003 check_ins.note");
let r = await hasColumns("check_ins", "id,note"); ok("check_ins.note", r.good, r.detail ?? "");

console.log("\n20260921000004 clients.term_end_override");
r = await hasColumns("clients", "id,term_end_override"); ok("clients.term_end_override", r.good, r.detail ?? "");

console.log("\n20260925000001 clients.start_date nullable + start_date_override");
r = await hasColumns("clients", "id,start_date_override"); ok("clients.start_date_override", r.good, r.detail ?? "");

console.log("\n20260926000001 TJD payroll");
for (const [t, cols] of [["coach_pay_rates", "id,coach_id,brand_weekly,brand_fortnightly,referral_weekly,referral_fortnightly,client_weekly,client_fortnightly,owner_no_split"], ["client_paid_weeks", "id,client_id,coach_id,week_start,paid_at"]]) {
  r = await hasColumns(t, cols); ok(`table ${t}`, r.good, r.detail ?? "");
}
r = await hasColumns("clients", "id,client_type,payer,custom_coach_monthly,custom_client_monthly,is_challenge");
ok("clients: client_type, payer, custom_coach_monthly, custom_client_monthly, is_challenge", r.good, r.detail ?? "");

console.log("\nSeeded rate cards");
const { data: cards, error: cErr } = await db
  .from("coach_pay_rates")
  .select("coach_id,brand_weekly,brand_fortnightly,referral_weekly,referral_fortnightly,client_weekly,client_fortnightly,owner_no_split");
if (cErr) { ok("read coach_pay_rates", false, cErr.message); }
else {
  const { data: coaches } = await db.from("coaches").select("id,name");
  const byId = new Map((coaches ?? []).map((c) => [c.id, c.name]));
  ok(`rate cards present`, cards.length > 0, `${cards.length} rows`);
  // From the Coach Rates SOP: monthly / 4 = weekly dollars, as
  // [brand weekly, brand fortnightly, referral weekly, referral fortnightly]
  // per coach name. Business figures, so they live in the local decisions
  // file (expectedRateCards), not in the repo.
  const WANT = loadDecisions().expectedRateCards ?? {};
  if (!Object.keys(WANT).length) console.log("  note  no expectedRateCards in the local decisions file: rate figures not checked");
  for (const c of cards) {
    const name = byId.get(c.coach_id) ?? c.coach_id;
    const w = WANT[name];
    const got = [Number(c.brand_weekly), Number(c.brand_fortnightly), Number(c.referral_weekly), Number(c.referral_fortnightly)];
    if (w) ok(`  ${name} brand/referral rates`, JSON.stringify(got) === JSON.stringify(w), `got ${got.join("/")} want ${w.join("/")}`);
    else console.log(`  note  ${name}: no SOP rate expected  (client ${c.client_weekly}/${c.client_fortnightly}, owner_no_split=${c.owner_no_split})`);
  }
  const toby = cards.find((c) => byId.get(c.coach_id) === "Toby");
  if (toby) ok("  Toby marked owner_no_split", toby.owner_no_split === true);
}

console.log("\nCHECK CONSTRAINT on check_ins.code");
console.log("  Cannot be read through PostgREST: pg_catalog is not exposed.");
console.log("  Run this one line in the TJD SQL editor to confirm it:");
console.log("    select pg_get_constraintdef(oid) from pg_constraint where conname='check_ins_code_check';");
console.log("  Expect: CHECK (code = ANY (ARRAY['Y','MS','M','F','G','P','C','N']))  with NO 'SM'.");

console.log(`\n${fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
