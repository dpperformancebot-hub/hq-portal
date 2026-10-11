// Reads the three TJD coach rosters and Toby's prices out of the spreadsheets,
// so the export and the import agree on ONE reading of the source data.
// Owner decisions 2026-09-30: a Custom Client $ of 0.00 means COMPED, write 0.
// One client's "Monthly" cadence stays blank rather than being guessed.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { normName, DECISIONS_FILE, loadDecisions } from "./tjd-lib.mjs";

const DL = path.join(process.env.HOME, "Downloads");
// The spreadsheet file names (in ~/Downloads) live in the local decisions file
// under sheetFiles: { "rosters": { "<coach>": "<file>.xlsx" }, "master": "<file>.xlsx" }.
const SHEET_FILES = loadDecisions().sheetFiles;
export const ROSTERS = SHEET_FILES?.rosters ?? {};
const MASTER = SHEET_FILES?.master ?? null;
const TIER = { "weekly check in's": "Weekly", "fortnightly check in's": "Fortnightly" };

/** openpyxl via a short python shim: no xlsx dependency added to the app. */
function sheetJson() {
  const py = `
import openpyxl, json, os
DL = os.path.join(os.environ["HOME"], "Downloads")
files = ${JSON.stringify(ROSTERS)}
rows = []
for coach, f in files.items():
    ws = openpyxl.load_workbook(os.path.join(DL, f), data_only=True).worksheets[0]
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r[0] or not str(r[0]).strip(): continue
        rows.append({"coach": coach, "name": str(r[0]).strip(),
                     "rawTier": str(r[1]).strip() if r[1] else ""})
ws = openpyxl.load_workbook(os.path.join(DL, ${JSON.stringify(MASTER)}), data_only=True)["Toby"]
price = {}
SKIP = {"totals", "total"}
for r in ws.iter_rows(min_row=7, values_only=True):
    if not r[0] or not str(r[0]).strip(): continue
    nm = str(r[0]).strip()
    if nm.lower() in SKIP: continue          # the tab's own sum row, not a client
    if r[13] in (None, ""): continue
    price[nm] = float(r[13])
print(json.dumps({"rows": rows, "price": price}))
`;
  if (!Object.keys(ROSTERS).length || !MASTER) {
    throw new Error(`no sheetFiles in ${DECISIONS_FILE}: add { "sheetFiles": { "rosters": { "<coach>": "<file>.xlsx" }, "master": "<file>.xlsx" } }`);
  }
  for (const f of [...Object.values(ROSTERS), MASTER]) {
    if (!fs.existsSync(path.join(DL, f))) throw new Error(`missing spreadsheet: ${f}`);
  }
  return JSON.parse(execFileSync("python3", ["-c", py], { encoding: "utf8", maxBuffer: 8e6 }));
}

/** The roster rows, plus the price-only rows that exist on Toby's master tab
 *  but on no roster. The seven comped clients live in that second group: the
 *  owner's decision is to write $0 for them, so they need to travel separately
 *  rather than being silently dropped for having no roster line. */
export function readSheets() {
  const { rows, price } = sheetJson();
  // Match prices on the normalised name, not the literal one. Exact matching
  // silently dropped a client whose two spellings differed only by punctuation.
  const priceByKey = new Map(Object.entries(price).map(([n, v]) => [normName(n), { name: n, v }]));
  const onRoster = new Set(rows.map((r) => normName(r.name)));
  const priceOnly = [...priceByKey.values()]
    .filter((p) => !onRoster.has(normName(p.name)))
    .map((p) => ({ coach: "Toby", name: p.name, customClientMonthly: p.v, comped: p.v === 0 }));
  const roster = rows.map((r) => ({
    coach: r.coach,
    name: r.name,
    rawTier: r.rawTier,
    plan: TIER[r.rawTier.toLowerCase()] ?? null, // null = do not guess
    clientType: "brand",
    payer: "weekly",
    customClientMonthly: priceByKey.get(normName(r.name))?.v ?? null,
    comped: priceByKey.get(normName(r.name))?.v === 0,
  }));
  return { roster, priceOnly };
}
