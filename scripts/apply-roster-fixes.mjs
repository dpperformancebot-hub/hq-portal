#!/usr/bin/env node
/*
 * apply-roster-fixes — R16-1 step 3: buckets A and B from a roster-diff plan.
 * DP Performance ONLY. DRY RUN by default; --apply writes (owner go only).
 *
 * Input: plan.json from `node scripts/roster-diff.mjs --out <dir>`.
 *   A rows: clients.coach_id null -> to_coach_id (D-as-A rows also rename the
 *           first-name-only portal row to the sheet's full name)
 *   B rows: clients.coach_id from_coach_id -> to_coach_id. Rows the diagnostic
 *           flagged as a conflict (name on two sheets, or the master sheet
 *           names a different coach) are SKIPPED unless --include-conflicts.
 *
 * Safety: every row is re-read live before writing and must still match the
 * plan (same coach_id, same name); anything that moved is skipped and listed.
 * Backups of every row about to change go to <out>/backup-clients.json.
 * One audit row per client in sync_events (source manual, entity client,
 * action coach_assigned_from_sheet, payload = ids + evidence, no email/phone).
 * Prints portal active counts per coach before and after.
 *
 * Usage:
 *   node scripts/apply-roster-fixes.mjs --plan <dir>/plan.json            # dry run
 *   node scripts/apply-roster-fixes.mjs --plan <dir>/plan.json --apply    # WRITE
 *   --env FILE, --allow-ref REF, --include-conflicts, --only A|B
 *   --promote "Name One,Name Two"   D-as-A rows to apply (exact sheet names); others are skipped
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const APPLY = flag("--apply");
const INCLUDE_CONFLICTS = flag("--include-conflicts");
const ONLY = opt("--only", null);
// D-as-A promotions (first-name-only portal stub renamed to the sheet's full name) are opt-in by exact sheet name.
const PROMOTE = new Set((opt("--promote", "") || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
const PLAN_FILE = opt("--plan", null);
if (!PLAN_FILE) { console.error("--plan <plan.json> is required (from roster-diff --out)"); process.exit(1); }
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ENV_FILE = opt("--env", path.join(REPO_ROOT, ".env.local"));
const DP_REF = "vutdqjfixvijldlyvbaw";
const ALLOW_REF = opt("--allow-ref", null);
const OUT_DIR = path.dirname(path.resolve(PLAN_FILE));
const RUN_ID = `roster-fix-${new Date().toISOString().replace(/[:.]/g, "-")}`;

const plan = JSON.parse(fs.readFileSync(PLAN_FILE, "utf8"));
const env = {};
for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error(`Supabase env missing in ${ENV_FILE}`); process.exit(1); }
const ref = new URL(url).host.split(".")[0];
if (ref !== DP_REF && ref !== ALLOW_REF) { console.error(`Refusing: env points at ${ref}; DP-only (${DP_REF}).`); process.exit(1); }
if (plan.portal !== ref) { console.error(`Refusing: plan was built against ${plan.portal}, env points at ${ref}.`); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

async function fetchAll(table, select) {
  const rows = [];
  for (let from = 0; ; from += 1000) { const { data, error } = await db.from(table).select(select).range(from, from + 999); if (error) throw new Error(`${table}: ${error.message}`); rows.push(...data); if (data.length < 1000) break; }
  return rows;
}
const coaches = await fetchAll("coaches", "id,name,is_active");
const coachName = (id) => (id ? coaches.find((c) => c.id === id)?.name ?? id : "(unassigned)");
async function activeCounts() {
  const rows = await fetchAll("clients", "id,coach_id,status");
  const m = new Map();
  for (const c of coaches) m.set(c.id, rows.filter((r) => r.coach_id === c.id && r.status === "active").length);
  m.set(null, rows.filter((r) => !r.coach_id && r.status === "active").length);
  return m;
}

console.log(`Mode: ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"} · portal ${ref} · plan ${path.relative(REPO_ROOT, PLAN_FILE)} (generated ${plan.generated_at})`);
const before = await activeCounts();

// ---------------------------------------------------------------- build the work list
const work = []; // { bucket, client_id, expect_coach_id, expect_name, to_coach_id, rename_to, evidence, label }
const skipped = [];
if (!ONLY || ONLY === "A") for (const a of plan.A) {
  if (a.from_bucket === "D") {
    if (a.conflict) { skipped.push({ bucket: "A(D)", client_id: a.client_id, name: `${a.sheet_name} -> ${a.to_coach}`, reason: a.conflict }); continue; }
    if (!PROMOTE.has(a.sheet_name.toLowerCase())) { skipped.push({ bucket: "A(D)", client_id: a.client_id, name: `${a.sheet_name} -> ${a.to_coach}`, reason: `not in --promote list (stub "${a.portal_name}")` }); continue; }
  }
  work.push({ bucket: a.from_bucket === "D" ? "A (from D)" : "A", client_id: a.client_id, expect_coach_id: null, expect_name: a.portal_name, to_coach_id: a.to_coach_id, rename_to: a.rename_to, evidence: a.evidence, label: `${a.sheet_name} -> ${a.to_coach}` });
}
if (!ONLY || ONLY === "B") for (const b of plan.B) {
  if (b.conflict && !INCLUDE_CONFLICTS) { skipped.push({ bucket: "B", client_id: b.client_id, name: b.sheet_name, reason: `conflict: ${b.conflict} (pass --include-conflicts to move anyway)` }); continue; }
  work.push({ bucket: "B", client_id: b.client_id, expect_coach_id: b.from_coach_id, expect_name: b.portal_name, to_coach_id: b.to_coach_id, rename_to: null, evidence: b.evidence, label: `${b.sheet_name}: ${b.from_coach} -> ${b.to_coach}` });
}
const ids = work.map((w) => w.client_id);
const { data: liveRows, error: liveErr } = await db.from("clients").select("id,name,coach_id,status,ghl_contact_id,start_date").in("id", ids);
if (liveErr) throw new Error(liveErr.message);
const live = new Map((liveRows ?? []).map((r) => [r.id, r]));
const todo = [];
for (const w of work) {
  const row = live.get(w.client_id);
  if (!row) { skipped.push({ bucket: w.bucket, client_id: w.client_id, name: w.label, reason: "row no longer exists" }); continue; }
  if ((row.coach_id ?? null) !== (w.expect_coach_id ?? null)) { skipped.push({ bucket: w.bucket, client_id: w.client_id, name: w.label, reason: `coach_id changed since the plan (now ${coachName(row.coach_id)})` }); continue; }
  if (row.name !== w.expect_name) { skipped.push({ bucket: w.bucket, client_id: w.client_id, name: w.label, reason: `name changed since the plan (now "${row.name}")` }); continue; }
  if (!coaches.some((c) => c.id === w.to_coach_id && c.is_active)) { skipped.push({ bucket: w.bucket, client_id: w.client_id, name: w.label, reason: "target coach not active" }); continue; }
  todo.push({ ...w, row });
}

console.log(`\nPlanned writes: ${todo.length} (A ${todo.filter((t) => t.bucket.startsWith("A")).length}, B ${todo.filter((t) => t.bucket === "B").length}) · skipped ${skipped.length}`);
for (const t of todo) console.log(`  ${t.bucket.padEnd(10)} ${t.row.name.padEnd(28)} ${coachName(t.row.coach_id).padEnd(14)} -> ${coachName(t.to_coach_id).padEnd(14)}${t.rename_to ? `  rename -> "${t.rename_to}"` : ""}  [${t.client_id}]  ${t.evidence.sheet} r${t.evidence.sheet_row}`);
if (skipped.length) { console.log(`\nSkipped:`); for (const s of skipped) console.log(`  ${s.bucket.padEnd(4)} ${s.name}  [${s.client_id}]  ${s.reason}`); }

if (!APPLY) { console.log(`\nDry run only. Re-run with --apply to write ${todo.length} row(s) + ${todo.length} audit row(s).`); process.exit(0); }

// ---------------------------------------------------------------- apply
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, `backup-clients-${RUN_ID}.json`), JSON.stringify(todo.map((t) => t.row), null, 2));
let written = 0, failed = 0;
for (const t of todo) {
  const patch = { coach_id: t.to_coach_id };
  if (t.rename_to) patch.name = t.rename_to;
  // Guard on the coach_id we expect so a concurrent change cannot be clobbered.
  let q = db.from("clients").update(patch).eq("id", t.client_id);
  q = t.expect_coach_id === null ? q.is("coach_id", null) : q.eq("coach_id", t.expect_coach_id);
  const { data, error } = await q.select("id");
  const ok = !error && Array.isArray(data) && data.length === 1;
  if (error) console.error(`  ! ${t.row.name}: ${error.message}`);
  else if (!ok) console.error(`  ! ${t.row.name}: guard did not match (row changed underneath), not written`);
  if (!ok) { failed++; continue; }
  const { error: auditErr } = await db.from("sync_events").insert({
    source: "manual", entity: "client", ghl_id: t.row.ghl_contact_id, action: "coach_assigned_from_sheet",
    payload: { run: RUN_ID, bucket: t.bucket, client_id: t.client_id, from_coach_id: t.row.coach_id, to_coach_id: t.to_coach_id, renamed_from: t.rename_to ? t.row.name : null, renamed_to: t.rename_to, evidence: t.evidence, decided_by: "owner 2026-09-21" },
  });
  if (auditErr) console.error(`  ! audit row for ${t.client_id}: ${auditErr.message}`);
  written++;
}
const after = await activeCounts();
console.log(`\nWritten ${written}, failed ${failed}. Backup: ${path.join(OUT_DIR, `backup-clients-${RUN_ID}.json`)}`);
console.log(`\nPortal active counts (before -> after):`);
for (const c of coaches.filter((c) => c.is_active).sort((a, b) => a.name.localeCompare(b.name))) { const b0 = before.get(c.id), a0 = after.get(c.id); if (b0 !== a0 || ["Perry", "Angus"].includes(c.name.split(" ")[0])) console.log(`  ${c.name.padEnd(14)} ${String(b0).padStart(4)} -> ${String(a0).padStart(4)}${a0 !== b0 ? ` (${a0 > b0 ? "+" : ""}${a0 - b0})` : ""}`); }
console.log(`  ${"(unassigned)".padEnd(14)} ${String(before.get(null)).padStart(4)} -> ${String(after.get(null)).padStart(4)}`);
