// Throwaway READ-ONLY probe (NOT committed). Reads .env.local, GETs pipelines
// and opportunities for the DP location, prints names/ids + count + PII-light
// samples. Creates/modifies NOTHING in GHL.
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

const PII = new Set(["email", "phone", "contactName", "name", "firstName", "lastName", "title", "address", "notes", "fullName"]);
function redact(v) {
  if (v == null) return v;
  if (Array.isArray(v)) return v.slice(0, 3).map(redact);
  if (typeof v === "object") {
    const o = {};
    for (const [k, val] of Object.entries(v)) {
      o[k] = PII.has(k) && typeof val === "string" ? `<${k}:${val.length}c>` : redact(val);
    }
    return o;
  }
  return v;
}

async function get(path, params) {
  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(params ?? {})) u.searchParams.set(k, String(v));
  const r = await fetch(u.toString(), { headers: H });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-json */ }
  return { status: r.status, json, text };
}

console.log("LOCATION:", LOC, "TOKEN prefix:", (TOKEN || "").slice(0, 8));

// 1. Pipelines
const p = await get("/opportunities/pipelines", { locationId: LOC });
console.log(`\n### /opportunities/pipelines -> HTTP ${p.status}`);
if (!p.json) { console.log("BODY:", p.text.slice(0, 500)); }
const pipelines = p.json?.pipelines ?? [];
console.log("PIPELINE COUNT:", pipelines.length);
const stageIdToPipeline = {};
for (const pl of pipelines) {
  console.log(`\nPIPELINE "${pl.name}"  id=${pl.id}`);
  for (const s of pl.stages ?? []) {
    console.log(`   stage "${s.name}"  id=${s.id}  pos=${s.position ?? "?"}`);
    stageIdToPipeline[s.id] = { pipeline: pl.name, stage: s.name };
  }
}

// 2. Opportunities (paginate)
console.log("\n\n### /opportunities/search");
let allOpps = [];
let page = 1;
let metaTotal = null;
let startAfter = null;
let startAfterId = null;
for (let i = 0; i < 20; i++) {
  const params = { location_id: LOC, limit: 100, page };
  if (startAfter) params.startAfter = startAfter;
  if (startAfterId) params.startAfterId = startAfterId;
  const r = await get("/opportunities/search", params);
  if (r.status !== 200) { console.log(`page ${page} -> HTTP ${r.status}`, r.text.slice(0, 300)); break; }
  const opps = r.json?.opportunities ?? [];
  metaTotal = r.json?.meta?.total ?? r.json?.total ?? metaTotal;
  allOpps = allOpps.concat(opps);
  const nextStartAfter = r.json?.meta?.startAfter;
  const nextStartAfterId = r.json?.meta?.startAfterId;
  if (opps.length === 0) break;
  if (nextStartAfter && nextStartAfterId) { startAfter = nextStartAfter; startAfterId = nextStartAfterId; }
  else { page += 1; }
  if (allOpps.length >= (metaTotal ?? Infinity)) break;
}
console.log("META total:", metaTotal);
console.log("FETCHED opportunities:", allOpps.length);

// Distribution by stage + status
const byStage = {};
const byStatus = {};
for (const o of allOpps) {
  const info = stageIdToPipeline[o.pipelineStageId];
  const key = info ? `${info.pipeline} / ${info.stage}` : `(unknown stage ${o.pipelineStageId})`;
  byStage[key] = (byStage[key] ?? 0) + 1;
  byStatus[o.status ?? "?"] = (byStatus[o.status ?? "?"] ?? 0) + 1;
}
console.log("\nBY STAGE:");
for (const [k, n] of Object.entries(byStage)) console.log(`   ${n}\t${k}`);
console.log("\nBY STATUS:", JSON.stringify(byStatus));

console.log("\nSAMPLE OPPS (redacted):");
for (const o of allOpps.slice(0, 3)) {
  const info = stageIdToPipeline[o.pipelineStageId];
  console.log(JSON.stringify({
    id: o.id,
    name: o.name ? `<name:${String(o.name).length}c>` : null,
    pipelineStageId: o.pipelineStageId,
    stageName: info?.stage,
    pipelineName: info?.pipeline,
    status: o.status,
    monetaryValue: o.monetaryValue,
    assignedTo: o.assignedTo,
  }));
}
