#!/usr/bin/env node
/*
 * remap-checkin-codes — R16-2c data step. DRY RUN by default; --apply writes.
 *
 * Dan collapsed "SM Send message" and "M Messaged" into one code, MS "Message
 * sent", and gave the letter M a NEW meaning, "Missed". Every stored SM and M
 * row today means "messaged", so both must become MS BEFORE the new UI ships,
 * or historic "messaged" cells render as "Missed" the moment we deploy.
 *
 * Order: apply migration 20260921000001 (adds MS to the check constraint) ->
 * this script --apply -> migration 20260921000002 (drops SM) -> deploy UI.
 *
 * Safety: counts by code+source first; --apply backs up (id, code, source,
 * client_id, submitted_at) of every row it will change, updates in chunks of
 * ids, then re-counts and refuses to report success unless SM+M = 0.
 *
 * Usage:
 *   node scripts/remap-checkin-codes.mjs                      # dry run (DP via .env.local)
 *   node scripts/remap-checkin-codes.mjs --env tjd.env --allow-ref evydffzomgrnhjcrfjxi   # TJD
 *   node scripts/remap-checkin-codes.mjs --apply              # WRITE (owner go only)
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const APPLY = flag("--apply");
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ENV_FILE = opt("--env", path.join(REPO_ROOT, ".env.local"));
const DP_REF = "vutdqjfixvijldlyvbaw";
const ALLOW_REF = opt("--allow-ref", null);
const FROM = ["SM", "M"], TO = "MS";

const env = {};
for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error(`Supabase env missing in ${ENV_FILE}`); process.exit(1); }
const ref = new URL(url).host.split(".")[0];
if (ref !== DP_REF && ref !== ALLOW_REF) { console.error(`Refusing: env points at ${ref}; pass --allow-ref ${ref} to run against it.`); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

async function fetchAll(select, modify) {
  const rows = [];
  for (let from = 0; ; from += 1000) { let q = db.from("check_ins").select(select).range(from, from + 999); if (modify) q = modify(q); const { data, error } = await q; if (error) throw new Error(error.message); rows.push(...data); if (data.length < 1000) break; }
  return rows;
}
const tally = (rows) => { const m = new Map(); for (const r of rows) { const k = `${r.code ?? "(null)"}|${r.source}`; m.set(k, (m.get(k) ?? 0) + 1); } return [...m.entries()].sort(); };

console.log(`Mode: ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"} · project ${ref}`);
const all = await fetchAll("id,code,source,client_id,submitted_at");
console.log(`check_ins: ${all.length} rows`);
for (const [k, n] of tally(all)) console.log(`  ${k.padEnd(20)} ${String(n).padStart(6)}`);
const targets = all.filter((r) => FROM.includes(r.code));
console.log(`\nRows to remap ${FROM.join("/")} -> ${TO}: ${targets.length} (${FROM.map((c) => `${c} ${targets.filter((r) => r.code === c).length}`).join(", ")})`);
if (!targets.length) { console.log("Nothing to do."); process.exit(0); }
if (!APPLY) { console.log("\nDry run only. Apply migration 20260921000001 first, then re-run with --apply."); process.exit(0); }

const OUT = path.join(REPO_ROOT, "data-imports", `checkin-remap-${new Date().toISOString().slice(0, 10)}`);
fs.mkdirSync(OUT, { recursive: true });
const backup = path.join(OUT, `backup-check_ins-${ref}-${Date.now()}.json`);
fs.writeFileSync(backup, JSON.stringify(targets, null, 2));
console.log(`Backup: ${backup}`);
let done = 0;
for (let i = 0; i < targets.length; i += 200) {
  const ids = targets.slice(i, i + 200).map((r) => r.id);
  const { data, error } = await db.from("check_ins").update({ code: TO }).in("id", ids).in("code", FROM).select("id");
  if (error) { console.error(`Chunk ${i / 200 + 1} failed: ${error.message}${/check_ins_code_check/.test(error.message) ? " (migration 20260921000001 not applied?)" : ""}`); process.exit(1); }
  done += data.length;
}
const after = await fetchAll("id,code,source");
const left = after.filter((r) => FROM.includes(r.code)).length;
console.log(`\nUpdated ${done} rows. Remaining ${FROM.join("/")}: ${left}. MS now: ${after.filter((r) => r.code === TO).length}.`);
if (left) { console.error("Not clean: some rows were not remapped."); process.exit(1); }
console.log("Clean. Next: apply migration 20260921000002 (drops SM), then deploy the UI.");
