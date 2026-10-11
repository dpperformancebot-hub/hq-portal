// READ-ONLY inventory of the DP GHL sub-account. NOT committed.
// Hits GET endpoints only, redacts contact PII, builds a clean report,
// writes it to scripts/ghl-inventory.txt and prints it. No writes to GHL.
import { readFileSync, writeFileSync } from "node:fs";

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

const out = [];
const log = (s = "") => out.push(s);

// GET helper. Returns { ok, status, json } and never throws.
async function get(path, params, versionOverride) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));
  try {
    const headers = versionOverride ? { ...H, Version: versionOverride } : H;
    const res = await fetch(url.toString(), { headers });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 300) }; }
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    return { ok: false, status: 0, json: { _error: e.message } };
  }
}

function errLine(r) {
  const msg = r.json?.message || r.json?.error || r.json?._error || r.json?._raw || "";
  return `NOT AVAILABLE (HTTP ${r.status})${msg ? ": " + String(Array.isArray(msg) ? msg.join("; ") : msg).slice(0, 200) : ""}`;
}

const pad = (s, n) => String(s ?? "").padEnd(n);

log("==================================================================");
log("  DP PERFORMANCE — GoHighLevel sub-account READ-ONLY inventory");
log("==================================================================");
log(`Location ID : ${LOC}`);
log(`API base    : ${BASE}  (Version 2021-07-28)`);
log(`Token       : ${(TOKEN || "").slice(0, 6)}… (redacted)`);
log(`Generated   : ${new Date().toISOString()}`);
log("Note: contact PII (names, emails, phones) is intentionally omitted.");
log("");

// ---------------------------------------------------------------------------
// 1. PIPELINES + STAGES
// ---------------------------------------------------------------------------
log("------------------------------------------------------------------");
log("1. PIPELINES + STAGES (in order)");
log("------------------------------------------------------------------");
const pipeRes = await get("/opportunities/pipelines", { locationId: LOC });
let pipelines = [];
if (pipeRes.ok) {
  pipelines = pipeRes.json.pipelines ?? [];
  log(`Total pipelines: ${pipelines.length}`);
  for (const p of pipelines) {
    log("");
    log(`  ▸ ${p.name}   [id ${p.id}]`);
    const stages = [...(p.stages ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    stages.forEach((s, i) => log(`      ${pad(i + 1 + ".", 4)}${s.name}   [id ${s.id}]`));
    if (!stages.length) log("      (no stages)");
  }
} else {
  log(errLine(pipeRes));
}
log("");

// ---------------------------------------------------------------------------
// 2. CALENDARS + CALENDAR GROUPS
// ---------------------------------------------------------------------------
log("------------------------------------------------------------------");
log("2. CALENDARS + CALENDAR GROUPS");
log("------------------------------------------------------------------");
const calRes = await get("/calendars/", { locationId: LOC });
let calendars = [];
if (calRes.ok) {
  calendars = calRes.json.calendars ?? [];
  log(`Calendars: ${calendars.length}`);
  for (const c of calendars) {
    const status = c.isActive === false ? "inactive" : "active";
    log(`  • ${pad(c.name, 40)} ${pad(status, 10)} type=${c.calendarType ?? c.widgetType ?? "?"}  [id ${c.id}]`);
  }
  if (!calendars.length) log("  (none)");
} else {
  log("Calendars: " + errLine(calRes));
}
log("");
const grpRes = await get("/calendars/groups", { locationId: LOC });
if (grpRes.ok) {
  const groups = grpRes.json.groups ?? [];
  log(`Calendar groups: ${groups.length}`);
  for (const g of groups) {
    const status = g.isActive === false ? "inactive" : "active";
    log(`  • ${pad(g.name, 40)} ${status}  [id ${g.id}]`);
  }
  if (!groups.length) log("  (none)");
} else {
  log("Calendar groups: " + errLine(grpRes));
}
log("");

// ---------------------------------------------------------------------------
// 3. CUSTOM FIELDS + CUSTOM VALUES
// ---------------------------------------------------------------------------
log("------------------------------------------------------------------");
log("3. CUSTOM FIELDS (name + type) and CUSTOM VALUES");
log("------------------------------------------------------------------");
const cfRes = await get(`/locations/${LOC}/customFields`, {});
if (cfRes.ok) {
  const fields = cfRes.json.customFields ?? [];
  log(`Custom fields: ${fields.length}`);
  for (const f of fields) {
    log(`  • ${pad(f.name, 40)} ${pad(f.dataType ?? f.fieldType ?? "?", 14)} model=${f.model ?? "contact"}`);
  }
  if (!fields.length) log("  (none)");
} else {
  log("Custom fields: " + errLine(cfRes));
}
log("");
const cvRes = await get(`/locations/${LOC}/customValues`, {});
if (cvRes.ok) {
  const values = cvRes.json.customValues ?? [];
  log(`Custom values: ${values.length}`);
  log("(API returns the merge-field definition + key, not the stored value.)");
  for (const v of values) {
    log(`  • ${pad(v.name, 42)} ${v.fieldKey ?? ""}`);
  }
  if (!values.length) log("  (none)");
} else {
  log("Custom values: " + errLine(cvRes));
}
log("");

// ---------------------------------------------------------------------------
// 4. TAGS
// ---------------------------------------------------------------------------
log("------------------------------------------------------------------");
log("4. TAGS");
log("------------------------------------------------------------------");
const tagRes = await get(`/locations/${LOC}/tags`, {});
if (tagRes.ok) {
  const tags = tagRes.json.tags ?? [];
  log(`Tags: ${tags.length}`);
  const names = tags.map((t) => t.name).sort((a, b) => String(a).localeCompare(String(b)));
  for (const n of names) log(`  • ${n}`);
  if (!tags.length) log("  (none)");
} else {
  log("Tags: " + errLine(tagRes));
}
log("");

// ---------------------------------------------------------------------------
// 5. USERS / STAFF
// ---------------------------------------------------------------------------
log("------------------------------------------------------------------");
log("5. USERS / STAFF (name + role)");
log("------------------------------------------------------------------");
const userRes = await get("/users/", { locationId: LOC });
if (userRes.ok) {
  const users = Array.isArray(userRes.json) ? userRes.json : userRes.json.users ?? [];
  log(`Users: ${users.length}`);
  for (const u of users) {
    const role = u.roles?.role ?? u.role ?? "?";
    const type = u.roles?.type ? ` (${u.roles.type})` : "";
    // Name is staff, not client PII, but mask email.
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.name || "(no name)";
    log(`  • ${pad(name, 30)} role=${role}${type}`);
  }
  if (!users.length) log("  none");
} else {
  log("Users: " + errLine(userRes));
}
log("");

// ---------------------------------------------------------------------------
// 6. WORKFLOWS
// ---------------------------------------------------------------------------
log("------------------------------------------------------------------");
log("6. WORKFLOWS (name + status)");
log("------------------------------------------------------------------");
const wfRes = await get("/workflows/", { locationId: LOC });
if (wfRes.ok) {
  const wfs = wfRes.json.workflows ?? [];
  log(`Workflows: ${wfs.length}`);
  for (const w of wfs) log(`  • ${pad(w.name, 50)} ${w.status ?? "?"}`);
  if (!wfs.length) log("  (none)");
} else {
  log("Workflows: " + errLine(wfRes));
}
log("");

// ---------------------------------------------------------------------------
// 7. FORMS / SURVEYS
// ---------------------------------------------------------------------------
log("------------------------------------------------------------------");
log("7. FORMS / SURVEYS");
log("------------------------------------------------------------------");
const formRes = await get("/forms/", { locationId: LOC, limit: 100 });
if (formRes.ok) {
  const forms = formRes.json.forms ?? [];
  log(`Forms: ${forms.length}`);
  for (const f of forms) log(`  • ${f.name}  [id ${f.id}]`);
  if (!forms.length) log("  (none)");
} else {
  log("Forms: " + errLine(formRes));
}
log("");
const surveyRes = await get("/surveys/", { locationId: LOC, limit: 50 });
if (surveyRes.ok) {
  const surveys = surveyRes.json.surveys ?? [];
  log(`Surveys: ${surveys.length}`);
  for (const s of surveys) log(`  • ${s.name}  [id ${s.id}]`);
  if (!surveys.length) log("  (none)");
} else {
  log("Surveys: " + errLine(surveyRes));
}
log("");

// ---------------------------------------------------------------------------
// 8. COUNTS: contacts, opportunities per pipeline
// ---------------------------------------------------------------------------
log("------------------------------------------------------------------");
log("8. COUNTS");
log("------------------------------------------------------------------");
// Total contacts: POST /contacts/search returns total. Try GET meta first (read-only),
// then fall back to POST search (still a read).
let contactTotal = null;
const cGet = await get("/contacts/", { locationId: LOC, limit: 1 });
if (cGet.ok) contactTotal = cGet.json.meta?.total ?? cGet.json.total ?? null;
if (contactTotal == null) {
  try {
    const res = await fetch(`${BASE}/contacts/search`, {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ locationId: LOC, pageLimit: 1 }),
    });
    const j = await res.json();
    if (res.ok) contactTotal = j.total ?? j.meta?.total ?? null;
  } catch { /* ignore */ }
}
log(`Total contacts: ${contactTotal ?? "unavailable"}`);
log("");
log("Opportunities per pipeline (meta.total from /opportunities/search):");
let oppGrand = 0;
let oppOk = true;
for (const p of pipelines) {
  const r = await get("/opportunities/search", { location_id: LOC, pipeline_id: p.id, limit: 1 });
  if (r.ok) {
    const total = r.json.meta?.total ?? r.json.total ?? 0;
    oppGrand += total;
    log(`  • ${pad(p.name, 35)} ${total}`);
  } else {
    oppOk = false;
    log(`  • ${pad(p.name, 35)} ${errLine(r)}`);
  }
}
// Grand total across the location (independent read).
const oppAll = await get("/opportunities/search", { location_id: LOC, limit: 1 });
if (oppAll.ok) {
  log(`  ${pad("TOTAL (all pipelines)", 37)} ${oppAll.json.meta?.total ?? oppAll.json.total ?? (oppOk ? oppGrand : "?")}`);
}
if (!pipelines.length) log("  (no pipelines to count)");
log("");

// ---------------------------------------------------------------------------
// 9. CONNECTED CHANNELS / CONVERSATION PROVIDERS
// ---------------------------------------------------------------------------
log("------------------------------------------------------------------");
log("9. CONNECTED CHANNELS / CONVERSATION PROVIDERS");
log("------------------------------------------------------------------");
// Try the documented provider/integration read endpoints.
const provRes = await get("/conversations/providers", { locationId: LOC });
if (provRes.ok) {
  const provs = provRes.json.providers ?? provRes.json ?? [];
  const arr = Array.isArray(provs) ? provs : [];
  log(`Conversation providers: ${arr.length}`);
  for (const p of arr) log(`  • ${pad(p.name ?? p.type ?? "?", 30)} ${p.status ?? p.deleted === false ? "active" : "?"}`);
  if (!arr.length) log("  (none reported)");
} else {
  log("Conversation providers: " + errLine(provRes));
}
const intRes = await get(`/locations/${LOC}/`, {});
if (intRes.ok) {
  const social = intRes.json.location?.social ?? intRes.json.social;
  if (social) log(`Location social block present: ${JSON.stringify(Object.keys(social))}`);
  const settings = intRes.json.location?.settings ?? intRes.json.settings;
  if (settings) log(`Location settings keys: ${JSON.stringify(Object.keys(settings)).slice(0, 200)}`);
} else {
  log("Location detail: " + errLine(intRes));
}
log("(GHL API v2 does not expose a definitive 'which channels are connected'");
log(" read for IG/WhatsApp/Email/SMS at the location level; see notes above.)");
log("");

log("==================================================================");
log("  END OF INVENTORY — read-only, no writes performed.");
log("==================================================================");

const report = out.join("\n");
writeFileSync(new URL("./ghl-inventory.txt", import.meta.url), report + "\n", "utf8");
console.log(report);
