// Shared TJD guard rail. Every TJD script loads its credentials through here,
// so the "TJD only" rule is enforced in ONE place rather than remembered three
// times. Refuses to hand back a client for any other project.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

export const TJD_REF = "evydffzomgrnhjcrfjxi";
const ENV_FILE = ".env.tjd.local";

export function tjdClient() {
  if (!fs.existsSync(ENV_FILE)) {
    throw new Error(`${ENV_FILE} not found. It holds the TJD service-role key and is gitignored.`);
  }
  const env = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(`${ENV_FILE} needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`);
  // The guard. A key that points anywhere but TJD stops here, before any
  // caller gets the chance to write with it.
  if (!url.includes(TJD_REF)) {
    throw new Error(`REFUSING: ${ENV_FILE} points at ${url}, not the TJD project (${TJD_REF}).`);
  }
  console.log(`project ref confirmed: ${TJD_REF} (TJD Fit)`);
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Read a whole table, paged and ordered. Same rule as the app: an unbounded
 *  select stops at 1000 rows, and heap order is not stable. */
export async function fetchAll(db, table, cols) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(cols).order("id").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

export const normName = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Owner decisions and business figures for the TJD scripts: client aliases
 *  and overrides, expected payroll totals, expected rate cards, the source
 *  spreadsheet names. LOCAL ONLY (data-imports/ is gitignored): client names
 *  and pay figures are never committed. Returns {} when the file is absent. */
export const DECISIONS_FILE = "data-imports/sheets/tjd/master-sync-decisions.json";
export function loadDecisions() {
  return fs.existsSync(DECISIONS_FILE) ? JSON.parse(fs.readFileSync(DECISIONS_FILE, "utf8")) : {};
}
