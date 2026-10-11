// Throwaway probe (NOT committed). Reads .env.local, hits the Stage-1 GHL read
// endpoints, prints status + a trimmed, PII-light sample of each shape.
import { readFileSync } from "node:fs";

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

// Redact obvious PII so the printed sample is safe to read.
const PII = new Set(["email", "phone", "body", "lastMessageBody", "fullName", "contactName", "name", "firstName", "lastName", "title", "address", "notes"]);
function redact(v, depth = 0) {
  if (v == null) return v;
  if (Array.isArray(v)) return v.slice(0, 2).map((x) => redact(x, depth + 1));
  if (typeof v === "object") {
    const o = {};
    for (const [k, val] of Object.entries(v)) {
      o[k] = PII.has(k) && typeof val === "string" ? `<${k}:${val.length}c>` : redact(val, depth + 1);
    }
    return o;
  }
  return v;
}

async function probe(label, path, params) {
  const url = new URL(BASE + path);
  for (const [k, val] of Object.entries(params ?? {})) url.searchParams.set(k, String(val));
  let res, text;
  try {
    res = await fetch(url.toString(), { headers: H });
    text = await res.text();
  } catch (e) {
    console.log(`\n### ${label}\nFETCH ERROR: ${e.message}`);
    return null;
  }
  console.log(`\n### ${label}  ->  HTTP ${res.status}`);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.log("NON-JSON BODY:", text.slice(0, 400));
    return null;
  }
  if (!res.ok) {
    console.log("ERROR BODY:", JSON.stringify(json).slice(0, 500));
    return json;
  }
  console.log("TOP-LEVEL KEYS:", Object.keys(json));
  console.log("SAMPLE:", JSON.stringify(redact(json), null, 2).slice(0, 2200));
  return json;
}

const now = Date.now();
const monthAgo = now - 30 * 86400000;
const monthAhead = now + 30 * 86400000;

console.log("LOCATION:", LOC, "TOKEN prefix:", (TOKEN || "").slice(0, 8));

await probe("conversations/search", "/conversations/search", { locationId: LOC, limit: 5 });
const cals = await probe("calendars/", "/calendars/", { locationId: LOC });
await probe("calendars/events (locationId only)", "/calendars/events", {
  locationId: LOC,
  startTime: monthAgo,
  endTime: monthAhead,
});

// If events needs a calendarId, retry with the first calendar.
const firstCal = cals?.calendars?.[0]?.id;
if (firstCal) {
  await probe("calendars/events (calendarId)", "/calendars/events", {
    locationId: LOC,
    calendarId: firstCal,
    startTime: monthAgo,
    endTime: monthAhead,
  });
}

await probe("users/", "/users/", { locationId: LOC });

// --- Scope characterization: what does this token actually have? ---
console.log("\n\n===== SCOPE CHARACTERIZATION (known-good read endpoints) =====");
await probe("contacts/", "/contacts/", { locationId: LOC, limit: 1 });
await probe("locations customFields", `/locations/${LOC}/customFields`, {});
await probe("opportunities/search", "/opportunities/search", { location_id: LOC, limit: 1 });
