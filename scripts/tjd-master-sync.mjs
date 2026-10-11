// TJD: sync coach, cadence, type, custom prices and September weeks paid from
// Toby's updated September master (owner, 2026-10-08: the sheet is now the
// source of truth for coach, cadence, type and price on TJD).
//   node scripts/tjd-master-sync.mjs                 (dry run, writes nothing)
//   node scripts/tjd-master-sync.mjs --write         (writes)
//   node scripts/tjd-master-sync.mjs --csv <path>    (also dump every change)
//
// Rules, all owner decisions in the 2026-10-08 brief:
// - Match on the normalised name only (same rule as tjd-import.mjs). A near
//   match is FLAGGED and never applied: no guessing.
// - Coach = the tab the row sits on. TJD coach assignment lives in the portal
//   (BRAND.roster.ownFieldsInHq), so the nightly GHL sync does not undo it.
// - Cadence "Weekly Check-In" / "Fortnightly Check-In" -> plan. A blank cadence
//   leaves the portal value alone (Toby's tab has no cadence column filled).
// - Type blank = Brand. Custom $ blank = standard, i.e. null. Toby's tab has no
//   Custom Coach $ column, so his clients' custom_coach_monthly is left alone.
// - W1..W5 are the weeks ENDING (Sunday) in September, same rule as
//   weeksOfMonth in src/lib/pay/tjd-pay.ts. Ticks are inserted, never removed.
// - Nothing is created for sheet rows with no portal client, and nothing is
//   deactivated for portal clients on no tab. Both are listed.
//
// Idempotent: values already equal are skipped and existing paid weeks are not
// re-inserted, so a second run writes nothing and adds no audit rows. Every
// row is planned before the first write.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { tjdClient, fetchAll, normName, DECISIONS_FILE, loadDecisions } from "./tjd-lib.mjs";

const WRITE = process.argv.includes("--write");
const csvAt = process.argv.indexOf("--csv");
const CSV = csvAt > -1 ? process.argv[csvAt + 1] : null;
const SHEET = "data-imports/sheets/tjd/master-2026-10-08.xlsx";
const YEAR = 2026, MONTH0 = 8; // September
const TABS = { Toby: "Toby", Caleb: "Caleb", Emery: "Emery", Callum: "Callum Adams" };
// Owner decisions that name clients (confirmed near-match aliases, and
// corrections to the sheet itself such as a swapped price) and the business
// figures (the owner's payroll totals, SOP rate flags) live in a LOCAL,
// gitignored file next to the sheet, so no client name or pay figure is
// committed. Shape:
//   { "aliases": { "<sheet name>": "<portal name>" },
//     "overrides": { "<sheet name>": { "<column>": value } },
//     "expectedPayroll": { "<tab>": { "weeks": n, "payroll": n } },
//     "sopRateFlags": { "<tab>": { "<rate column>": <SOP figure> } } }
const DECISIONS = loadDecisions();
if (!fs.existsSync(DECISIONS_FILE)) console.warn(`WARNING: ${DECISIONS_FILE} not found; running with no aliases, overrides or expected totals.`);
// The owner's own row totals for the reconciliation (brief, 2026-10-08).
const EXPECTED = DECISIONS.expectedPayroll ?? {};
const ALIASES = DECISIONS.aliases ?? {};
// Owner decision 2026-10-08: sheet rows with no portal client are created via
// the bootstrap path (csv- ids; the nightly GHL sync re-points one at its real
// contact when a client-tagged contact of the same name appears).
const OVERRIDES = DECISIONS.overrides ?? {};
const BOOTSTRAP = process.argv.includes("--no-bootstrap") ? false : true;
// The tab's RATES block -> coach_pay_rates. Owner 2026-10-08: the newer sheet
// wins where it differs from the SOP; each such figure is flagged (the SOP
// values to compare against are in the decisions file, sopRateFlags).
const RATE_LABELS = { "Brand weekly": "brand_weekly", "Brand fortnightly": "brand_fortnightly",
  "Referral weekly": "referral_weekly", "Referral fortnightly": "referral_fortnightly",
  "Client weekly": "client_weekly", "Client fortnightly": "client_fortnightly" };
const SOP = DECISIONS.sopRateFlags ?? {};

// ---------- read the sheet (openpyxl shim, like tjd-sheets.mjs) ----------
function readMaster() {
  const py = `
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
out = {}
for tab in ${JSON.stringify(Object.keys(TABS))}:
    ws = wb[tab]
    head = [str(h).replace("\\n", " ").strip() if h is not None else "" for h in next(ws.iter_rows(min_row=6, max_row=6, values_only=True))]
    rows = []
    rates = {}
    for r in ws.iter_rows(min_row=5, max_row=14, min_col=17, max_col=18, values_only=True):
        if r[0] and r[1] is not None: rates[str(r[0]).strip()] = float(r[1])
    out["_rates_" + tab] = rates
    for i, r in enumerate(ws.iter_rows(min_row=7, values_only=True), 7):
        name = str(r[0]).strip() if r[0] is not None else ""
        if not name: continue
        if name.lower() in ("totals", "total"): break
        rows.append({"row": i, **{h: (r[j] if j < len(r) else None) for j, h in enumerate(head) if h}})
    out[tab] = rows
print(json.dumps(out, default=str))
`;
  return JSON.parse(execFileSync("python3", ["-c", py, SHEET], { encoding: "utf8", maxBuffer: 8e6 }));
}

// Weeks ending (Sunday) in the month, Monday as the key. Mirrors weeksOfMonth.
function weeksOfMonth(year, m0) {
  const out = [];
  const last = new Date(Date.UTC(year, m0 + 1, 0));
  for (let d = new Date(Date.UTC(year, m0, 1)); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== 0) continue;
    const s = new Date(d.getTime()); s.setUTCDate(s.getUTCDate() - 6);
    out.push({ label: `W${out.length + 1}`, start: s.toISOString().slice(0, 10) });
  }
  return out;
}
const WEEKS = weeksOfMonth(YEAR, MONTH0);

const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const firstOf = (s) => normName(String(s).trim().split(/\s+/)[0]);
const lastOf = (s) => normName(String(s).replace(/\(.*?\)/g, "").trim().split(/\s+/).pop());
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const ticked = (v) => v !== null && v !== undefined && v !== "" && Number(v) !== 0;
const cadenceOf = (v) => {
  const s = String(v ?? "").toLowerCase();
  return s.startsWith("week") ? "Weekly" : s.startsWith("fort") ? "Fortnightly" : null;
};
const round2 = (n) => Math.round(n * 100) / 100;

// ---------- load ----------
const db = tjdClient();
const raw = readMaster();
const sheet = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith("_rates_")));
const sheetRates = Object.fromEntries(Object.keys(TABS).map((t) => [t, raw[`_rates_${t}`] ?? {}]));
// Toby's tab has no cadence filled; his August roster is the fallback source
// for a NEW Toby client's cadence (read the same way tjd-import.mjs did).
const { readSheets } = await import("./tjd-sheets.mjs");
// "Monthly" is a real plan value; the engine reports it as "no cadence set"
// rather than rating it, which is the honest outcome (owner, 2026-09-30).
const tobyRosterPlan = new Map(readSheets().roster.filter((r) => r.coach === "Toby")
  .map((r) => [normName(r.name), r.plan ?? (/monthly/i.test(r.rawTier) ? "Monthly" : null)]));
const coaches = await fetchAll(db, "coaches", "id,name,is_active");
const coachByName = new Map(coaches.map((c) => [c.name, c]));
const coachName = new Map(coaches.map((c) => [c.id, c.name]));
for (const n of Object.values(TABS)) if (!coachByName.get(n)?.is_active) throw new Error(`coach "${n}" missing or inactive`);
const clients = await fetchAll(db, "clients",
  "id,name,status,coach_id,plan,client_type,payer,custom_client_monthly,custom_coach_monthly,is_challenge,ghl_contact_id");
const rates = await fetchAll(db, "coach_pay_rates", "*");
const rateBy = new Map(rates.map((r) => [r.coach_id, r]));
const paid = await fetchAll(db, "client_paid_weeks", "id,client_id,week_start");
const paidSet = new Set(paid.map((p) => `${p.client_id}|${p.week_start}`));

const byKey = new Map();
for (const c of clients) (byKey.get(normName(c.name)) ?? byKey.set(normName(c.name), []).get(normName(c.name))).push(c);

// ---------- plan ----------
const rowsAll = Object.entries(sheet).flatMap(([tab, rows]) => rows.map((r) => ({ tab, coach: TABS[tab], ...r, ...(OVERRIDES[String(r.Client).trim()] ?? {}) })));
const seen = new Map();
const dupes = [];
for (const r of rowsAll) {
  const k = normName(r.Client);
  if (seen.has(k)) dupes.push([seen.get(k), r]); else seen.set(k, r);
}
const dupeKeys = new Set(dupes.map(([a]) => normName(a.Client)));

const updates = [], weekInserts = [], unmatched = [], held = [], w5 = [], stats = {};
const matchedIds = new Set();
const st = (tab) => (stats[tab] ??= { rows: 0, matched: 0, changed: 0, unchanged: 0, new: 0, near: 0, held: 0, portalOnly: 0, weekTicks: 0, weeksToInsert: 0 });

for (const r of rowsAll) {
  const s = st(r.tab); s.rows++;
  const k = normName(r.Client);
  if (dupeKeys.has(k)) { held.push({ r, why: "name appears on more than one row/tab" }); s.held++; continue; }
  const hits = byKey.get(ALIASES[String(r.Client).trim()] ? normName(ALIASES[String(r.Client).trim()]) : k) ?? [];
  if (hits.length > 1) { held.push({ r, why: `${hits.length} portal clients share this name` }); s.held++; continue; }
  const c = hits[0];
  const ticks = WEEKS.map((w) => ticked(r[w.label]) ? w : null).filter(Boolean);
  if (ticked(r.W5) && WEEKS.length < 5) w5.push(r);
  s.weekTicks += ticks.length;
  if (!c) { unmatched.push(r); continue; }
  s.matched++; matchedIds.add(c.id);

  const next = {};
  const coach = coachByName.get(r.coach);
  if (c.coach_id !== coach.id) next.coach_id = coach.id;
  const cad = cadenceOf(r.Cadence);
  if (cad && c.plan !== cad) next.plan = cad;
  if (r.tab !== "Toby" || r.Type) {
    const type = String(r.Type ?? "").toLowerCase().startsWith("ref") ? "referral" : "brand";
    if (c.client_type !== type) next.client_type = type;
  } else if (c.client_type !== "brand") next.client_type = "brand"; // blank = Brand
  const cc = num(r["Custom Client $"]);
  if ((c.custom_client_monthly === null ? null : Number(c.custom_client_monthly)) !== cc) next.custom_client_monthly = cc;
  if ("Custom Coach $" in r) {
    const ko = num(r["Custom Coach $"]);
    if ((c.custom_coach_monthly === null ? null : Number(c.custom_coach_monthly)) !== ko) next.custom_coach_monthly = ko;
  }
  if (Object.keys(next).length) {
    s.changed++;
    const before = Object.fromEntries(Object.keys(next).map((f) => [f, c[f] ?? null]));
    updates.push({ id: c.id, name: c.name, tab: r.tab, status: c.status, before, next });
  } else s.unchanged++;

  for (const w of ticks) {
    if (paidSet.has(`${c.id}|${w.start}`)) continue;
    s.weeksToInsert++;
    weekInserts.push({ client_id: c.id, coach_id: coach.id, week_start: w.start, marked_by: "import:master-2026-10-08", _name: c.name, _label: w.label });
  }
}

// Near matches: unmatched sheet rows vs portal clients no sheet row claimed.
const leftovers = clients.filter((c) => !matchedIds.has(c.id));
const near = [];
for (const r of unmatched) {
  const a = normName(r.Client);
  for (const c of leftovers) {
    const b = normName(c.name), d = lev(a, b);
    const why = d <= 2 ? `spelling (edit distance ${d})`
      : firstOf(r.Client) === firstOf(c.name) && (a.startsWith(b) || b.startsWith(a)) ? "same name plus an extra word"
      : lastOf(r.Client).length > 3 && lastOf(r.Client) === lastOf(c.name) ? "same surname" : null;
    if (why) near.push({ r, c, why });
  }
}
// A surname-only resemblance is a different person (owner, 2026-10-08), so it
// does not block creating the row; a spelling-level one does.
const nearRows = new Set(near.filter((n) => n.why !== "same surname").map((n) => n.r));

// ---------- bootstrap plan: sheet rows with no portal client ----------
const creates = [], cantPlace = [];
if (BOOTSTRAP) for (const r of unmatched) {
  if (nearRows.has(r)) { cantPlace.push({ r, why: "near match to an existing client, not guessed" }); continue; }
  const name = String(r.Client).trim();
  const coach = coachByName.get(r.coach);
  let plan = cadenceOf(r.Cadence), planNote = null;
  if (!plan && r.tab === "Toby") { plan = tobyRosterPlan.get(normName(name)) ?? null; planNote = plan ? "cadence from Toby's August roster" : null; }
  if (!plan && r.tab !== "Toby") { cantPlace.push({ r, why: "no cadence on the sheet, and a coach's pay depends on it" }); continue; }
  if (!plan) { plan = "Weekly"; planNote = "no cadence on any sheet, DB default Weekly (Toby: no split, so it only affects revenue)"; }
  const status = String(r.Status ?? "").trim().toLowerCase() === "paused" ? "paused" : "active";
  const row = {
    ghl_contact_id: `csv-tjd-${normName(name)}`,
    name, status, coach_id: coach.id, plan,
    client_type: String(r.Type ?? "").toLowerCase().startsWith("ref") ? "referral" : "brand",
    payer: "weekly", // owner default since the 2026-09-30 import
    custom_client_monthly: num(r["Custom Client $"]),
    ...("Custom Coach $" in r ? { custom_coach_monthly: num(r["Custom Coach $"]) } : {}),
    source: null,
  };
  const ticks = WEEKS.filter((w) => ticked(r[w.label]));
  creates.push({ r, row, planNote, ticks });
}

// ---------- rate cards: the tab's RATES block -> coach_pay_rates ----------
const rateChanges = [];
for (const [tab, labels] of Object.entries(sheetRates)) {
  const coach = coachByName.get(TABS[tab]);
  const cur = rateBy.get(coach.id);
  if (!cur) continue;
  const next = {};
  for (const [label, v] of Object.entries(labels)) {
    const f = RATE_LABELS[label];
    if (f && Number(cur[f]) !== v) next[f] = v;
  }
  if (Object.keys(next).length) rateChanges.push({ tab, coachId: coach.id, rowId: cur.id,
    before: Object.fromEntries(Object.keys(next).map((f) => [f, Number(cur[f])])), next });
}
for (const r of unmatched) { if (nearRows.has(r)) st(r.tab).near++; else st(r.tab).new++; }
const nearPortal = new Set(near.map((n) => n.c.id));
const portalOnly = leftovers.filter((c) => c.status === "active");
for (const c of portalOnly) st(Object.keys(TABS).find((t) => TABS[t] === coachName.get(c.coach_id)) ?? "(no coach)").portalOnly++;

// ---------- payroll reconciliation (portal engine maths, sheet ticks) ----------
// The card AFTER this run: stored rates with the sheet's RATES block applied.
const card = (coachId) => {
  const r = { ...(rateBy.get(coachId) ?? {}), ...(rateChanges.find((c) => c.coachId === coachId)?.next ?? {}) };
  return { bw: +r.brand_weekly, bf: +r.brand_fortnightly, rw: +r.referral_weekly, rf: +r.referral_fortnightly, noSplit: r.owner_no_split === true };
};
const recon = {};
// Rows that will still have no portal client after this run (held, or not placed).
const notInPortalAfter = new Set([...held.map((h) => h.r), ...cantPlace.map((c) => c.r), ...(BOOTSTRAP ? [] : unmatched)]);
for (const [tab, rows] of Object.entries(sheet)) {
  if (tab === "Toby") continue;
  const k = card(coachByName.get(TABS[tab]).id);
  let sheetWeeks = 0, sheetInv = 0, engWeeks = 0, engPay = 0, portalWeeks = 0, portalPay = 0;
  const lineDiffs = [];
  for (const r of rows) {
    sheetWeeks += num(r.Weeks) ?? 0; sheetInv += num(r.Invoiceable) ?? 0;
    const cad = cadenceOf(r.Cadence) ?? "Weekly";
    const ref = String(r.Type ?? "").toLowerCase().startsWith("ref");
    const ko = num(r["Custom Coach $"]);
    const rate = ko && ko > 0 ? ko / 4 : ref ? (cad === "Weekly" ? k.rw : k.rf) : (cad === "Weekly" ? k.bw : k.bf);
    const wk = WEEKS.filter((w) => ticked(r[w.label])).length;
    const inv = round2(rate * wk);
    engWeeks += wk; engPay += inv;
    if (Math.abs(inv - (num(r.Invoiceable) ?? 0)) > 0.01 || wk !== (num(r.Weeks) ?? 0))
      lineDiffs.push(`${r.Client}: sheet ${num(r.Weeks) ?? 0} wk / $${num(r.Invoiceable) ?? 0}, portal maths ${wk} wk / $${inv}`);
    if (!notInPortalAfter.has(r)) { portalWeeks += wk; portalPay += inv; }
  }
  recon[tab] = { expected: EXPECTED[tab], sheetRowTotals: { weeks: sheetWeeks, payroll: round2(sheetInv) },
    portalMathsAllRows: { weeks: engWeeks, payroll: round2(engPay) },
    portalAfterApply: { weeks: portalWeeks, payroll: round2(portalPay) }, lineDiffs };
}

// ---------- report ----------
const money = (v) => (v === null || v === undefined ? "blank" : v);
const fmt = (f, v) => f === "coach_id" ? (coachName.get(v) ?? "none") : money(v);
console.log(`\nsheet: ${SHEET}`);
console.log(`September weeks (Sunday rule): ${WEEKS.map((w) => `${w.label}=${w.start}`).join(" ")}`);
console.log("\nPER TAB");
console.table(stats);
console.log(`\nCHANGES (${updates.length} clients)`);
for (const u of updates) console.log(`  [${u.tab}] ${u.name}${u.status !== "active" ? ` (status ${u.status})` : ""}: ` +
  Object.keys(u.next).map((f) => `${f} ${fmt(f, u.before[f])} -> ${fmt(f, u.next[f])}`).join("; "));
console.log(`\nPAID WEEKS to insert: ${weekInserts.length} (already present: ${paid.length} rows in table)`);
if (w5.length) console.log(`  W5 HELD (${w5.length}): the week of 28 Sep ends Sun 4 Oct, so the portal files it under OCTOBER; ticking it would make October pay it again. Not written: ${w5.map((r) => r.Client).join(", ")}`);
console.log(`\nRATE CARDS from the tabs' RATES block (${rateChanges.length})`);
for (const c of rateChanges) console.log(`  ${TABS[c.tab]}: ` + Object.keys(c.next).map((f) => `${f} ${c.before[f]} -> ${c.next[f]}${SOP[c.tab]?.[f] !== undefined ? ` (SOP says ${SOP[c.tab][f]}, FLAG for Toby)` : ""}`).join("; "));
console.log(`\nBOOTSTRAP: ${creates.length} new clients (csv- ids), ${creates.reduce((n, c) => n + c.ticks.length, 0)} September weeks for them`);
for (const t of Object.keys(TABS)) {
  const l = creates.filter((c) => c.r.tab === t);
  if (l.length) console.log(`  ${t} (${l.length}): ${l.map((c) => c.row.name + (c.row.status === "paused" ? " [paused]" : "") + (c.row.client_type === "referral" ? " [referral]" : "")).join(", ")}`);
}
for (const c of creates.filter((c) => c.planNote)) console.log(`   note ${c.row.name}: ${c.planNote}`);
console.log(`CAN'T PLACE (${cantPlace.length}): ${cantPlace.map((c) => `${c.r.Client} [${c.r.tab}] ${c.why}`).join("; ") || "none"}`);
console.log(`\nNEAR MATCHES (flagged, NOT applied): ${near.length}`);
for (const n of near) console.log(`  [${n.r.tab}] sheet "${n.r.Client}" ~ portal "${n.c.name}" (${coachName.get(n.c.coach_id) ?? "no coach"}, ${n.c.status}): ${n.why}`);
console.log(`\nHELD (ambiguous): ${held.length}`);
for (const h of held) console.log(`  [${h.r.tab}] ${h.r.Client}: ${h.why}`);
const newRows = BOOTSTRAP ? [] : unmatched.filter((r) => !nearRows.has(r));
console.log(`\nON SHEET, NO PORTAL CLIENT (${newRows.length}):`);
for (const [tab] of Object.entries(TABS)) {
  const l = newRows.filter((r) => r.tab === tab);
  if (l.length) console.log(`  ${tab} (${l.length}): ${l.map((r) => r.Client).join(", ")}`);
}
console.log(`\nACTIVE IN PORTAL, ON NO TAB (${portalOnly.length}), list only:`);
for (const c of portalOnly) console.log(`  ${c.name} (${coachName.get(c.coach_id) ?? "no coach"})${nearPortal.has(c.id) ? " [near match above]" : ""}`);
console.log("\nPAYROLL RECONCILIATION");
for (const [tab, x] of Object.entries(recon)) {
  console.log(`  ${tab}: brief ${x.expected ? `${x.expected.weeks} wk / $${x.expected.payroll}` : "n/a (no expectedPayroll)"} | sheet rows ${x.sheetRowTotals.weeks} wk / $${x.sheetRowTotals.payroll} | portal maths on all rows ${x.portalMathsAllRows.weeks} wk / $${x.portalMathsAllRows.payroll} | portal after apply (matched only) ${x.portalAfterApply.weeks} wk / $${x.portalAfterApply.payroll}`);
  for (const d of x.lineDiffs) console.log(`     line differs: ${d}`);
}

if (CSV) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = ["kind,tab,client,field,from,to,note"];
  for (const u of updates) for (const f of Object.keys(u.next)) lines.push(["change", u.tab, u.name, f, fmt(f, u.before[f]), fmt(f, u.next[f]), u.status].map(esc).join(","));
  for (const w of weekInserts) lines.push(["paid_week", "", w._name, w._label, "", w.week_start, ""].map(esc).join(","));
  for (const n of near) lines.push(["near_match", n.r.tab, n.r.Client, "", n.c.name, "", n.why].map(esc).join(","));
  for (const r of newRows) lines.push(["sheet_only", r.tab, r.Client, "", "", "", `row ${r.row}`].map(esc).join(","));
  for (const c of portalOnly) lines.push(["portal_only", "", c.name, "", coachName.get(c.coach_id) ?? "", "", ""].map(esc).join(","));
  for (const c of rateChanges) for (const f of Object.keys(c.next)) lines.push(["rate_card", c.tab, TABS[c.tab], f, c.before[f], c.next[f], SOP[c.tab]?.[f] !== undefined ? `differs from SOP ${SOP[c.tab][f]}, confirm with Toby` : ""].map(esc).join(","));
  for (const c of creates) lines.push(["bootstrap", c.r.tab, c.row.name, "", "", `${c.row.status} ${c.row.plan} ${c.row.client_type}`, [c.planNote, c.ticks.length ? `${c.ticks.length} weeks` : ""].filter(Boolean).join("; ")].map(esc).join(","));
  for (const c of cantPlace) lines.push(["cant_place", c.r.tab, c.r.Client, "", "", "", c.why].map(esc).join(","));
  for (const r of w5) lines.push(["w5_held", r.tab, r.Client, "W5", "", "2026-09-28", "week ends 4 Oct = October in the portal; held"].map(esc).join(","));
  for (const h of held) lines.push(["held", h.r.tab, h.r.Client, "", "", "", h.why].map(esc).join(","));
  fs.writeFileSync(CSV, lines.join("\n") + "\n");
  console.log(`\ncsv: ${CSV}`);
}

if (!WRITE) { console.log("\nDRY RUN. Nothing written. Re-run with --write to apply."); process.exit(0); }

// ---------- write ----------
const REASON = "TJD master sync 2026-10-08: Toby's updated September master is the source of truth for coach, cadence, type and price; owner authorised";
let ok = 0, wk = 0; const failed = [];
for (const u of updates) {
  const { error } = await db.from("clients").update(u.next).eq("id", u.id);
  if (error) { failed.push(`${u.name}: ${error.message}`); continue; }
  const { error: aErr } = await db.from("sync_events").insert({
    source: "manual", entity: "client", ghl_id: null, action: "tjd_master_fields_set",
    payload: { client_id: u.id, tab: u.tab, from: u.before, to: u.next, by: "owner", reason: REASON },
  });
  if (aErr) failed.push(`${u.name}: WROTE FIELDS BUT AUDIT FAILED: ${aErr.message}`);
  ok++;
}
for (const c of rateChanges) {
  const { error } = await db.from("coach_pay_rates").update({ ...c.next, updated_by: "import:master-2026-10-08" }).eq("id", c.rowId);
  if (error) { failed.push(`${TABS[c.tab]} rates: ${error.message}`); continue; }
  const { error: aErr } = await db.from("sync_events").insert({
    source: "manual", entity: "coach", ghl_id: null, action: "tjd_rate_card_set",
    payload: { coach_id: c.coachId, from: c.before, to: c.next, by: "owner", reason: `${REASON}; rates from the tab's RATES block` },
  });
  if (aErr) failed.push(`${TABS[c.tab]}: WROTE RATES BUT AUDIT FAILED: ${aErr.message}`);
}
let made = 0;
for (const c of creates) {
  const { data, error } = await db.from("clients").insert(c.row).select("id").single();
  if (error) { failed.push(`create ${c.row.name}: ${error.message}`); continue; }
  const { error: aErr } = await db.from("sync_events").insert({
    source: "manual", entity: "client", ghl_id: null, action: "tjd_client_bootstrapped",
    payload: { client_id: data.id, tab: c.r.tab, row: c.row, note: c.planNote, by: "owner", reason: `${REASON}; on the sheet with no portal client` },
  });
  if (aErr) failed.push(`${c.row.name}: CREATED BUT AUDIT FAILED: ${aErr.message}`);
  made++;
  for (const w of c.ticks) weekInserts.push({ client_id: data.id, coach_id: c.row.coach_id, week_start: w.start, marked_by: "import:master-2026-10-08", _name: c.row.name, _label: w.label });
}
const byClient = new Map();
for (const w of weekInserts) (byClient.get(w.client_id) ?? byClient.set(w.client_id, []).get(w.client_id)).push(w);
for (const [clientId, ws] of byClient) {
  const rows = ws.map(({ _name, _label, ...r }) => r);
  const { error } = await db.from("client_paid_weeks").upsert(rows, { onConflict: "client_id,week_start", ignoreDuplicates: true });
  if (error) { failed.push(`${ws[0]._name} weeks: ${error.message}`); continue; }
  const { error: aErr } = await db.from("sync_events").insert({
    source: "manual", entity: "client", ghl_id: null, action: "tjd_paid_weeks_loaded",
    payload: { client_id: clientId, weeks: rows.map((r) => r.week_start), by: "owner", reason: `${REASON}; September W1-W${WEEKS.length} ticks` },
  });
  if (aErr) failed.push(`${ws[0]._name}: WROTE WEEKS BUT AUDIT FAILED: ${aErr.message}`);
  wk += rows.length;
}
console.log(`\nwrote ${ok} of ${updates.length} client updates, ${rateChanges.length} rate cards, created ${made} of ${creates.length} clients, ${wk} of ${weekInserts.length} paid weeks. problems: ${failed.length}`);
for (const f of failed) console.log(`  ${f}`);
if (failed.length) process.exit(1);
