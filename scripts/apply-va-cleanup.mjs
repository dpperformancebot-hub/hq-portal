// ONE-OFF WRITE SCRIPT (owner-approved 2026-07-03): apply the completed VA
// cleanup sheet (data-imports/va-cleanup-checklist.xlsx, sheet "Client
// Cleanup") to GHL contact custom fields.
//
//   node scripts/apply-va-cleanup.mjs             # dry-run: print the plan
//   node scripts/apply-va-cleanup.mjs --commit    # canary write + confirm + batch
//
// For each row marked Done=Y: match the GHL contact by email (fallback exact
// full-name match; ambiguous matches are skipped), then PUT ONLY the custom
// fields that are non-empty in the sheet: Status, Assigned Coach, Weekly
// Rate, Billing Frequency, Term End Date, Start Date. Fields already equal in
// GHL are not re-written (no no-op PUTs, no pointless workflow triggers).
//
// SAFETY MODEL
// - Dry-run by default. The full plan (match, old -> new per field) prints in
//   both modes; nothing leaves this machine without --commit.
// - --commit first checks GHL workflows: contact-field writes can fire
//   published workflows. Expected published set today: only "GHL WBHK"
//   (webhook -> HQ /api/webhooks/ghl; it firing is fine and expected, it is
//   how the HQ picks these edits up). Anything else published = hard pause.
// - --commit then updates ONE canary contact, re-fetches it to verify the
//   values landed, and pauses for typed confirmation before the batch.
// - Never touches tags, never sends anything, contact PUT body contains
//   customFields only. NO-CONTACT rule: this writes data fields, no outbound.
//
// Env: .env.local GHL_API_TOKEN + GHL_LOCATION_ID (API version 2021-07-28).
// No dependencies: the xlsx is unzipped with node:zlib.

import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

// ---------------------------------------------------------------------------
// Env + args
// ---------------------------------------------------------------------------

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      return [l.slice(0, i).trim(), v];
    }),
);

const TOKEN = env.GHL_API_TOKEN;
const LOC = env.GHL_LOCATION_ID || "R99JktDA6ajZeTWo4YPu";
const BASE = "https://services.leadconnectorhq.com";
const H = { Authorization: `Bearer ${TOKEN}`, Version: "2021-07-28", Accept: "application/json" };

if (!TOKEN) {
  console.error("GHL_API_TOKEN missing from .env.local");
  process.exit(1);
}

const COMMIT = process.argv.includes("--commit");
const fileArgIdx = process.argv.indexOf("--file");
const XLSX_PATH = new URL(
  fileArgIdx > -1 ? process.argv[fileArgIdx + 1] : "../data-imports/va-cleanup-checklist.xlsx",
  import.meta.url,
);

// ---------------------------------------------------------------------------
// Minimal xlsx reader (zip central directory + inflateRaw, shared strings)
// ---------------------------------------------------------------------------

function readZipEntries(buf) {
  // Find end-of-central-directory (scan back past any zip comment).
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip/xlsx file");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error("bad central directory");
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28);
    const xlen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nlen);
    entries.set(name, { method, csize, lho });
    off += 46 + nlen + xlen + clen;
  }
  return {
    read(name) {
      const e = entries.get(name);
      if (!e) throw new Error(`xlsx entry missing: ${name}`);
      const nlen = buf.readUInt16LE(e.lho + 26);
      const xlen = buf.readUInt16LE(e.lho + 28);
      const start = e.lho + 30 + nlen + xlen;
      const data = buf.subarray(start, start + e.csize);
      if (e.method === 0) return data.toString("utf8");
      if (e.method === 8) return inflateRawSync(data).toString("utf8");
      throw new Error(`unsupported zip method ${e.method}`);
    },
    has: (name) => entries.has(name),
  };
}

const unescapeXml = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

// Excel serial date -> ISO (defensive: this sheet stores dates as text today,
// but a re-save could turn them numeric).
const serialToIso = (n) => new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10);

function readSheet(zipPath) {
  const zip = readZipEntries(readFileSync(zipPath));
  // Resolve the "Client Cleanup" sheet via workbook.xml + rels.
  const wb = zip.read("xl/workbook.xml");
  const sheetMeta = [...wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="(rId\d+)"/g)];
  const wanted = sheetMeta.find(([, name]) => name === "Client Cleanup") ?? sheetMeta[0];
  if (!wanted) throw new Error("no sheets in workbook");
  const rels = zip.read("xl/_rels/workbook.xml.rels");
  const rel = new RegExp(`<Relationship [^>]*Id="${wanted[2]}"[^>]*Target="([^"]*)"`).exec(rels);
  const target = rel ? rel[1].replace(/^\/?(xl\/)?/, "xl/") : "xl/worksheets/sheet1.xml";

  const sstXml = zip.has("xl/sharedStrings.xml") ? zip.read("xl/sharedStrings.xml") : "";
  const shared = [...sstXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, si]) =>
    [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(([, t]) => unescapeXml(t)).join(""),
  );

  const xml = zip.read(target);
  const rows = new Map();
  for (const [, rnum, body] of xml.matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    // Empty cells are self-closing (<c r="I6" s="6"/>); match both forms so a
    // self-closing cell never swallows its neighbour's value.
    for (const m of body.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, col, attrs, inner = ""] = m;
      const t = /t="(\w+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      const is = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1];
      let val = "";
      if (t === "s" && v != null) val = shared[Number(v)] ?? "";
      else if (t === "inlineStr" && is != null) val = unescapeXml(is);
      else if (v != null) val = unescapeXml(v);
      cells[col] = val.trim();
    }
    rows.set(Number(rnum), cells);
  }
  return { sheetName: wanted[1], rows };
}

// ---------------------------------------------------------------------------
// Sheet -> cleanup entries
// ---------------------------------------------------------------------------

const HEADER_ROW = 5;
const EXPECTED_HEADER = [
  ["A", "Priority"],
  ["B", "Client"],
  ["C", "Email"],
  ["D", "Action needed"],
  ["E", "Status"],
  ["F", "Start Date"],
  ["G", "Coach"],
  ["H", "Weekly Rate"],
  ["I", "Billing Frequency"],
  ["J", "Term End"],
  ["K", "Notes"],
  ["L", "Done?"],
];

// Sheet column -> GHL custom field (normalised name as in src/lib/ghl/map.ts).
const FIELD_MAP = [
  { col: "E", label: "Status", norm: "status", kind: "text" },
  { col: "G", label: "Assigned Coach", norm: "assignedcoach", kind: "text" },
  { col: "H", label: "Weekly Rate", norm: "weeklyrate", kind: "number" },
  { col: "I", label: "Billing Frequency", norm: "billingfrequency", kind: "text" },
  { col: "J", label: "Term End Date", norm: "termenddate", kind: "date" },
  { col: "F", label: "Start Date", norm: "startdate", kind: "date" },
];

const normName = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Accept ISO text, epoch-ms, or an Excel serial; emit "YYYY-MM-DD" or null. */
function toIsoDate(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4,5}(\.\d+)?$/.test(s)) return serialToIso(Number(s)); // Excel serial
  const t = /^\d{11,14}$/.test(s) ? Number(s) : Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function sheetValue(cells, f) {
  const raw = (cells[f.col] ?? "").trim();
  if (!raw) return null;
  if (f.kind === "date") return toIsoDate(raw);
  return raw;
}

const { sheetName, rows } = readSheet(XLSX_PATH);
const header = rows.get(HEADER_ROW) ?? {};
for (const [col, want] of EXPECTED_HEADER) {
  if ((header[col] ?? "") !== want) {
    console.error(`Header mismatch at ${col}${HEADER_ROW}: expected "${want}", found "${header[col] ?? ""}". Aborting.`);
    process.exit(1);
  }
}

const entries = [];
let notDone = 0;
for (const [rnum, cells] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
  if (rnum <= HEADER_ROW) continue;
  const client = (cells.B ?? "").trim();
  if (!client) continue;
  const done = /^y(es)?$/i.test((cells.L ?? "").trim());
  if (!done) {
    notDone++;
    continue;
  }
  const fields = {};
  for (const f of FIELD_MAP) {
    const v = sheetValue(cells, f);
    if (v != null) fields[f.norm] = v;
  }
  entries.push({
    row: rnum,
    priority: (cells.A ?? "").trim(),
    client,
    email: (cells.C ?? "").trim().toLowerCase(),
    fields,
  });
}

console.log(`Sheet "${sheetName}": ${entries.length} row(s) marked Done, ${notDone} not done (skipped).`);
if (entries.length === 0) {
  console.log("Nothing marked Done=Y yet. Nothing to plan.");
  process.exit(0);
}

// Merge duplicate rows for the same person (the sheet lists some clients
// twice, once per issue). Same field with two DIFFERENT non-empty values =
// ambiguous -> skip that person entirely.
const merged = new Map();
const skipped = []; // { who, reason }
for (const e of entries) {
  const key = e.email || `name:${normName(e.client)}`;
  const prev = merged.get(key);
  if (!prev) {
    merged.set(key, { ...e, rowsMerged: [e.row] });
    continue;
  }
  let conflict = null;
  for (const [k, v] of Object.entries(e.fields)) {
    if (prev.fields[k] != null && prev.fields[k] !== v) conflict = `${k}: "${prev.fields[k]}" vs "${v}"`;
    else prev.fields[k] = v;
  }
  prev.rowsMerged.push(e.row);
  if (conflict) {
    skipped.push({ who: `${e.client} (rows ${prev.rowsMerged.join(",")})`, reason: `conflicting sheet values, ${conflict}` });
    merged.delete(key);
  }
}

// ---------------------------------------------------------------------------
// GHL fetch: field defs + all contacts
// ---------------------------------------------------------------------------

async function api(path, { method = "GET", params, body } = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), {
    method,
    headers: body ? { ...H, "Content-Type": "application/json" } : H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    const msg = json?.message ?? json?._raw ?? "";
    throw new Error(`GHL ${method} ${path} -> ${res.status} ${Array.isArray(msg) ? msg.join("; ") : msg}`);
  }
  return json;
}

console.log("Fetching GHL custom field definitions + contacts...");
const defs = (await api(`/locations/${LOC}/customFields`)).customFields ?? [];
const defByNorm = new Map(defs.map((d) => [normName(d.name), d]));
for (const f of FIELD_MAP) {
  if (!defByNorm.has(f.norm)) {
    console.error(`GHL custom field "${f.label}" not found in the location. Aborting (no writes happened).`);
    process.exit(1);
  }
}
const dateFieldNorms = new Set(FIELD_MAP.filter((f) => f.kind === "date").map((f) => f.norm));

const contacts = [];
{
  let startAfterId, startAfter;
  for (let page = 0; page < 50; page++) {
    const params = { locationId: LOC, limit: "100" };
    if (startAfterId) params.startAfterId = startAfterId;
    if (startAfter) params.startAfter = String(startAfter);
    const data = await api("/contacts/", { params });
    const batch = data.contacts ?? [];
    contacts.push(...batch);
    if (batch.length < 100) break;
    startAfterId = data.meta?.startAfterId;
    startAfter = data.meta?.startAfter;
    if (!startAfterId && !startAfter) break;
  }
}
console.log(`${contacts.length} contacts loaded.\n`);

const byEmail = new Map();
const byName = new Map();
for (const c of contacts) {
  const em = (c.email ?? "").trim().toLowerCase();
  if (em) (byEmail.get(em) ?? byEmail.set(em, []).get(em)).push(c);
  const nm = normName(c.contactName || `${c.firstName ?? ""} ${c.lastName ?? ""}`);
  if (nm) (byName.get(nm) ?? byName.set(nm, []).get(nm)).push(c);
}

function currentFieldValue(contact, defId) {
  const f = (contact.customFields ?? []).find((x) => x.id === defId);
  if (!f || f.value == null) return null;
  return Array.isArray(f.value) ? f.value.join(",") : String(f.value);
}

const eq = (norm, oldV, newV) => {
  if (oldV == null) return false;
  if (dateFieldNorms.has(norm)) return toIsoDate(oldV) === newV;
  const a = String(oldV).trim();
  const b = String(newV).trim();
  const na = Number(a), nb = Number(b);
  if (a !== "" && b !== "" && !Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  return a.toLowerCase() === b.toLowerCase();
};

// ---------------------------------------------------------------------------
// Build the plan
// ---------------------------------------------------------------------------

const plan = []; // { who, rows, contact, changes: [{label, defId, old, next}] }
const noChange = [];
for (const e of merged.values()) {
  const who = `${e.client}${e.email ? ` <${e.email}>` : ""} (row${e.rowsMerged.length > 1 ? "s" : ""} ${e.rowsMerged.join(",")})`;
  if (Object.keys(e.fields).length === 0) {
    skipped.push({ who, reason: "no field values in the sheet, nothing to write" });
    continue;
  }
  let matches = e.email ? (byEmail.get(e.email) ?? []) : [];
  let how = "email";
  if (matches.length === 0) {
    matches = byName.get(normName(e.client)) ?? [];
    how = "exact name";
  }
  if (matches.length === 0) {
    skipped.push({ who, reason: "no GHL contact matched by email or exact name" });
    continue;
  }
  if (matches.length > 1) {
    skipped.push({ who, reason: `ambiguous: ${matches.length} contacts matched by ${how} (${matches.map((m) => m.id).join(", ")})` });
    continue;
  }
  const contact = matches[0];
  const changes = [];
  for (const f of FIELD_MAP) {
    const next = e.fields[f.norm];
    if (next == null) continue;
    const def = defByNorm.get(f.norm);
    const old = currentFieldValue(contact, def.id);
    if (eq(f.norm, old, next)) continue;
    const oldShown = old == null ? "(empty)" : dateFieldNorms.has(f.norm) ? (toIsoDate(old) ?? old) : old;
    changes.push({ label: f.label, defId: def.id, old: oldShown, next });
  }
  if (changes.length === 0) {
    noChange.push({ who, contact });
    continue;
  }
  plan.push({ who, contact, how, changes });
}

console.log("PLAN ------------------------------------------------------------");
for (const p of plan) {
  console.log(`\n${p.who}`);
  console.log(`  -> GHL contact ${p.contact.id} (${p.contact.contactName ?? ""}, matched by ${p.how})`);
  for (const ch of p.changes) console.log(`     ${ch.label}: ${JSON.stringify(ch.old)} -> ${JSON.stringify(ch.next)}`);
}
if (noChange.length) {
  console.log("\nAlready correct in GHL (no write needed):");
  for (const n of noChange) console.log(`  ${n.who}`);
}
if (skipped.length) {
  console.log("\nSkipped:");
  for (const s of skipped) console.log(`  ${s.who}: ${s.reason}`);
}
console.log(`\nSummary: ${plan.length} contact(s) to update, ${noChange.length} already correct, ${skipped.length} skipped, ${notDone} sheet row(s) not marked Done.`);

if (!COMMIT) {
  console.log('\nDRY-RUN ONLY. Nothing was written. Re-run with "--commit" to apply.');
  process.exit(0);
}
if (plan.length === 0) {
  console.log("\nNothing to write.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// --commit: workflow safety check, canary, confirm, batch
// ---------------------------------------------------------------------------

const rl = readline.createInterface({ input: stdin, output: stdout });

// Field writes can fire published GHL workflows. Expected published set:
// only "GHL WBHK" (contact -> HQ webhook sync; it firing is fine and
// expected). Anything else published = pause for an explicit decision.
console.log("\nChecking GHL workflows before writing...");
try {
  const wfs = (await api("/workflows/", { params: { locationId: LOC } })).workflows ?? [];
  const published = wfs.filter((w) => String(w.status ?? "").toLowerCase() === "published");
  const unexpected = published.filter((w) => !/ghl\s*wbhk/i.test(w.name ?? ""));
  console.log(`  ${wfs.length} workflows; published: ${published.length ? published.map((w) => `"${w.name}"`).join(", ") : "none"}`);
  if (unexpected.length > 0) {
    console.log(`  WARNING: published workflows beyond "GHL WBHK": ${unexpected.map((w) => `"${w.name}"`).join(", ")}`);
    console.log("  A field write could trigger them. Verify in GHL what they do before continuing.");
    const a = (await rl.question('  Type "continue" to proceed anyway, anything else aborts: ')).trim();
    if (a !== "continue") {
      console.log("Aborted. Nothing was written.");
      process.exit(1);
    }
  } else {
    console.log('  OK: only "GHL WBHK" is published (HQ sync; expected to fire).');
  }
} catch (err) {
  console.log(`  Could not list workflows (${err.message}).`);
  const a = (await rl.question('  Cannot verify published workflows. Type "continue" to proceed anyway: ')).trim();
  if (a !== "continue") {
    console.log("Aborted. Nothing was written.");
    process.exit(1);
  }
}

async function applyOne(p) {
  const body = { customFields: p.changes.map((ch) => ({ id: ch.defId, field_value: ch.next })) };
  await api(`/contacts/${p.contact.id}`, { method: "PUT", body });
}

// Canary: ONE contact, verify, pause.
const canary = plan[0];
console.log(`\nCANARY: updating ONE contact first: ${canary.who}`);
await applyOne(canary);
const refetched = (await api(`/contacts/${canary.contact.id}`)).contact;
let verified = true;
for (const ch of canary.changes) {
  const now = currentFieldValue(refetched, ch.defId);
  const ok = eq(FIELD_MAP.find((f) => defByNorm.get(f.norm).id === ch.defId).norm, now, ch.next);
  console.log(`  ${ch.label}: now ${JSON.stringify(now)} ${ok ? "(verified)" : `(EXPECTED ${JSON.stringify(ch.next)})`}`);
  if (!ok) verified = false;
}
if (!verified) console.log("  One or more canary fields did not read back as expected. Check the contact in GHL before continuing.");
console.log("  Check the contact in GHL now (and that no unexpected automation fired).");

const rest = plan.slice(1);
if (rest.length === 0) {
  console.log("\nCanary was the only contact. Done.");
} else {
  const a = (await rl.question(`\nContinue with the remaining ${rest.length} contact(s)? Type "yes" to proceed: `)).trim();
  if (!/^yes$/i.test(a)) {
    console.log(`Stopped after the canary. ${rest.length} contact(s) NOT written.`);
    rl.close();
    process.exit(1);
  }
  let ok = 0, fail = 0;
  for (const p of rest) {
    try {
      await applyOne(p);
      ok++;
      console.log(`  updated ${p.who} (${p.changes.length} field(s))`);
    } catch (err) {
      fail++;
      console.log(`  FAILED ${p.who}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 200)); // stay well under GHL burst limits
  }
  console.log(`\nBatch done: ${ok + 1} updated (incl. canary), ${fail} failed, ${noChange.length} already correct, ${skipped.length} skipped.`);
}

rl.close();
console.log("\nREMINDER: no HQ import needed. The 'GHL WBHK' webhook pushes these contact edits to the HQ in seconds (nightly cron is the backstop). Give the dashboard a minute, then spot-check the updated clients in the Client Database.");
