#!/usr/bin/env node
/*
 * Coach check-in log importer.
 *
 * Parses a coach's weekly check-in tracker CSV (e.g. "Damon Astuti - Check In
 * Log - Check Ins.csv") and projects it into the HQ:
 *   - links each matched client to the coach (clients.coach_id)
 *   - writes the client's full weekly status history into check_ins
 *     (source 'coach_log'); each week's cell is a code (SM/Y/F/G/M/P/C/N)
 *   - records a transformation row for clients flagged TRUE
 *
 * The CSV is wide: meta columns then one column per ISO week.
 *
 * SAFE BY DEFAULT: dry-run prints the plan and writes nothing. Pass --commit to
 * write. Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 *
 * Usage:
 *   node scripts/import-coach-log.mjs "<file.csv>" [--coach "Full Name"] [--commit]
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// Load .env.local (repo root) so `node scripts/...` finds the Supabase keys
// without extra flags. Only fills vars that aren't already set in the shell.
try {
  const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* no .env.local; rely on the real environment */
}

const VALID_CODES = new Set(["SM", "Y", "F", "G", "M", "P", "C", "N"]);

// ---- args --------------------------------------------------------------
const args = process.argv.slice(2);
const commit = args.includes("--commit");
const file = args.find((a) => !a.startsWith("--"));
const coachArg = (() => {
  const i = args.indexOf("--coach");
  return i >= 0 ? args[i + 1] : null;
})();
if (!file) {
  console.error('Usage: node scripts/import-coach-log.mjs "<file.csv>" [--coach "Full Name"] [--commit]');
  process.exit(1);
}
const coachName = (coachArg ?? path.basename(file).split(" - ")[0]).trim();

// ---- tiny CSV parser (handles quoted fields) ---------------------------
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Parse a date like "1/12/25" or "01/12/2025" (day/month/year).
function parseDMY(s) {
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, d, mo, y] = m;
  y = y.length === 2 ? `20${y}` : y;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

async function chunkedUpsert(db, table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
  }
}

// Look up a client by name, retrying transient query errors. Without this a
// flaky connection's error was silently treated as "no match", dropping the
// client and their check-ins. Returns {client} on success (client may be null
// for a genuine no-match) or {error} once retries are exhausted.
async function findClientByName(db, name) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const { data, error } = await db
      .from("clients").select("id,name").ilike("name", name).limit(1).maybeSingle();
    if (!error) return { client: data ?? null };
    if (attempt < 4) await new Promise((r) => setTimeout(r, 400 * attempt));
    else return { client: null, error };
  }
  return { client: null };
}

// ---- main --------------------------------------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const rows = parseCsv(fs.readFileSync(file, "utf8"));
const header = rows[0] ?? [];
const weekCols = [];
for (let i = 9; i < header.length; i++) {
  const dt = parseDMY(header[i]);
  if (dt) weekCols.push({ i, date: dt });
}

const { data: coaches } = await db.from("coaches").select("id,name");
let coach =
  (coaches ?? []).find((c) => c.name.toLowerCase() === coachName.toLowerCase()) ??
  (coaches ?? []).find((c) => c.name.toLowerCase() === coachName.split(" ")[0].toLowerCase());
if (!coach) {
  // Coaches table may be empty / this coach not created yet. Create from the
  // log so importing each coach's sheet also builds the roster. Capacity 70
  // per owner default; other fields take table defaults.
  if (commit) {
    const { data: created, error } = await db
      .from("coaches")
      .insert({ name: coachName, max_capacity: 70 })
      .select("id,name")
      .single();
    if (error) {
      console.error(`Failed to create coach "${coachName}": ${error.message}`);
      process.exit(1);
    }
    coach = created;
    console.log(`Created new coach: ${coach.name}`);
  } else {
    console.log(`Coach "${coachName}" not in DB yet — it will be CREATED on --commit.`);
    coach = { id: "(to-be-created)", name: coachName };
  }
}

console.log(`Coach: ${coach.name} (${coach.id})`);
console.log(`Week columns: ${weekCols.length}  |  Mode: ${commit ? "COMMIT" : "DRY-RUN"}\n`);

let matched = 0, unmatched = 0, failed = 0;
const plan = [];
const checkInRows = [];
const transformations = []; // { client_id, milestone, status, permission }

for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  const name = (row[0] ?? "").trim();
  if (!name || name.toUpperCase() === "EOW FORM") continue;

  // All coded weeks for this client, plus the most recent for the log line.
  const coded = [];
  for (const wc of weekCols) {
    const v = (row[wc.i] ?? "").trim().toUpperCase();
    if (VALID_CODES.has(v)) coded.push({ code: v, date: wc.date });
  }
  const latest = coded.length ? coded[coded.length - 1] : null;
  const transf = (row[6] ?? "").trim().toUpperCase() === "TRUE";
  const post = (row[7] ?? "").trim();
  const start = parseDMY(row[1]);

  const { client, error: lookupErr } = await findClientByName(db, name);
  if (lookupErr) {
    failed++;
    plan.push(`  FAIL  ${name} (lookup error after retries: ${lookupErr.message})`);
    continue;
  }
  if (!client) { unmatched++; plan.push(`  SKIP  ${name} (no client match)`); continue; }
  matched++;

  const wkNum = (d) => (start ? Math.max(1, Math.floor((d - start) / 6.048e8) + 1) : null);
  for (const c of coded) {
    checkInRows.push({
      client_id: client.id,
      coach_id: coach.id,
      submitted_at: c.date.toISOString(),
      code: c.code,
      week_number: wkNum(c.date),
      source: "coach_log",
    });
  }
  if (transf) {
    transformations.push({
      client_id: client.id,
      coach_id: coach.id,
      milestone: latest ? `W${wkNum(latest.date)}` : "Log",
      status: post.toLowerCase() === "approved" ? "admin_approved" : "draft",
      permission: post.toLowerCase() === "approved" ? "Y" : "?",
      before_after_assets: [],
    });
  }

  plan.push(
    `  LINK  ${client.name} -> ${coach.name}  | ${coded.length} weeks` +
      (latest ? `, latest ${latest.code} (${latest.date.toISOString().slice(0, 10)})` : ", no code yet") +
      (transf ? "  | TRANSFORM" : "")
  );

  if (commit) {
    await db.from("clients").update({ coach_id: coach.id }).eq("id", client.id);
  }
}

if (commit) {
  await chunkedUpsert(db, "check_ins", checkInRows, "client_id,submitted_at,source");
  // Transformations have no natural unique key here; insert only those missing.
  for (const t of transformations) {
    const { data: existing } = await db
      .from("transformations").select("id").eq("client_id", t.client_id).eq("milestone", t.milestone).limit(1).maybeSingle();
    if (existing) await db.from("transformations").update(t).eq("id", existing.id);
    else await db.from("transformations").insert(t);
  }
}

console.log(plan.join("\n"));
console.log(
  `\nMatched ${matched} clients (${unmatched} unmatched, ${failed} lookup failures). ` +
    `${checkInRows.length} check-in rows, ${transformations.length} transformations.`
);
console.log(commit ? "\nWrote changes to the database." : "\nDry run: nothing written. Re-run with --commit to apply.");
