// Client-side parser for onboarding tracker imports (CSV / XLSX).
//
// Built against the coaches' real "New Client Plan Creation Tracker" sheet:
//   row 1 = group labels (Client Activation | Nutrition | Workout | Welcome Video)
//   row 2 = real headers, with "Adjustments Made (if Needed)" appearing TWICE
//   client-name cells carry a hyperlink to the client's Kahunas profile
// Also accepts plain CSVs / generic sheets: headers are matched loosely and
// missing columns just default (false / null).
//
// xlsx (SheetJS) is imported dynamically so it never lands in the main bundle.

export type ImportedRow = {
  clientName: string;
  coachName?: string | null;
  kahunasUrl?: string | null;
  startDate?: string | null;
  qnaReceived?: boolean;
  nutritionPlanMade?: boolean;
  nutritionFeedback?: string | null;
  nutritionAdjusted?: boolean;
  workoutPlanMade?: boolean;
  workoutFeedback?: string | null;
  workoutAdjusted?: boolean;
  loomUrl?: string | null;
  approved?: boolean;
  sent?: boolean;
  notes?: string | null;
};

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const truthy = (v: unknown): boolean =>
  v === true || /^(true|yes|y|1|done|tick|✓)$/i.test(String(v ?? "").trim());

// LOCAL calendar date -> ISO, without a UTC round-trip: toISOString() on a
// local-midnight Date shifts the day for anyone east of UTC (2026-07-11 fix,
// found via the check-in importer tests; the AU coaches are UTC+10).
const pad2 = (n: number) => String(n).padStart(2, "0");
const localIso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function toIsoDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return localIso(v);
  const s = String(v ?? "").trim();
  if (!s || s === "???") return null;
  // dd/mm/yyyy (the sheets are Australian); built from parts, no Date.
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    const m = Number(dmy[2]);
    const day = Number(dmy[1]);
    if (m < 1 || m > 12 || day < 1 || day > 31) return null;
    return `${y}-${pad2(m)}-${pad2(day)}`;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : localIso(new Date(t));
}

const looksUrl = (s: string) => /^https?:\/\//i.test(s.trim());

/** Column kind by (normalized) header. Duplicate "adjustments" headers are
 *  disambiguated by ORDER: first hit = nutrition, second = workout. */
function classify(header: string, taken: Set<string>): string | null {
  const h = norm(header);
  if (!h) return null;
  if (h.includes("clientname") || h === "client" || h === "name") return "clientName";
  if (h.includes("coach")) return "coachName";
  if (h.includes("kahunas")) return "kahunasUrl";
  if (h.includes("startdate") || h === "start") return "startDate";
  if (h.includes("qna") || h.includes("qa")) return "qnaReceived";
  if (h.includes("nutrition") && (h.includes("made") || h.includes("plan"))) return "nutritionPlanMade";
  if (h.includes("nutrition")) return "nutritionFeedback";
  if (h.includes("workout") && (h.includes("made") || h.includes("plan"))) return "workoutPlanMade";
  if (h.includes("workout")) return "workoutFeedback";
  if (h.includes("adjustment")) return taken.has("nutritionAdjusted") ? "workoutAdjusted" : "nutritionAdjusted";
  if (h.includes("loom") || h.includes("video")) return "loomUrl";
  if (h.includes("approv")) return "approved";
  if (h.includes("sent")) return "sent";
  if (h.includes("note")) return "notes";
  return null;
}

export async function parseOnboardingSheet(file: File): Promise<{ rows: ImportedRow[]; error?: string }> {
  const XLSX = await import("xlsx");
  let wb: import("xlsx").WorkBook;
  try {
    wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  } catch {
    return { rows: [], error: "Could not read that file. Export it as .xlsx or .csv and try again." };
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { rows: [], error: "The file has no sheets." };

  const grid: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (grid.length === 0) return { rows: [], error: "The sheet is empty." };

  // Find the real header row: first row with a "client name"-ish cell.
  let headerIdx = grid.findIndex((r) => r.some((c) => norm(c).includes("clientname") || norm(c) === "client"));
  if (headerIdx === -1) headerIdx = 0; // fall back to the first row

  const taken = new Set<string>();
  const colKind: (string | null)[] = grid[headerIdx].map((h) => {
    const kind = classify(String(h), taken);
    if (kind) taken.add(kind);
    return kind;
  });
  const nameCol = colKind.indexOf("clientName");
  if (nameCol === -1) return { rows: [], error: 'No "Client Name" column found in the sheet.' };

  const rows: ImportedRow[] = [];
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const raw = grid[r];
    const clientName = String(raw[nameCol] ?? "").trim();
    if (!clientName || clientName.toUpperCase() === "EOW FORM") continue;

    const row: ImportedRow = { clientName };

    // Kahunas link hidden on the client-name cell (the coaches' copy-paste trick).
    const nameCell = ws[XLSX.utils.encode_cell({ r, c: nameCol })] as { l?: { Target?: string } } | undefined;
    if (nameCell?.l?.Target) row.kahunasUrl = nameCell.l.Target;

    for (let c = 0; c < colKind.length; c++) {
      const kind = colKind[c];
      if (!kind || kind === "clientName") continue;
      const v = raw[c];
      const s = String(v ?? "").trim();
      switch (kind) {
        case "coachName":
          row.coachName = s || null;
          break;
        case "kahunasUrl":
          if (looksUrl(s)) row.kahunasUrl = s;
          break;
        case "startDate":
          row.startDate = toIsoDate(v);
          break;
        case "qnaReceived":
          row.qnaReceived = truthy(v);
          break;
        case "nutritionPlanMade":
          row.nutritionPlanMade = truthy(v);
          break;
        case "nutritionFeedback":
          row.nutritionFeedback = s && norm(s) !== "na" ? s : null;
          break;
        case "nutritionAdjusted":
          row.nutritionAdjusted = truthy(v);
          break;
        case "workoutPlanMade":
          row.workoutPlanMade = truthy(v);
          break;
        case "workoutFeedback":
          row.workoutFeedback = s && norm(s) !== "na" ? s : null;
          break;
        case "workoutAdjusted":
          row.workoutAdjusted = truthy(v);
          break;
        case "loomUrl": {
          // Prefer a real link (cell hyperlink beats display text like "link"/"seen").
          const cell = ws[XLSX.utils.encode_cell({ r, c })] as { l?: { Target?: string } } | undefined;
          if (cell?.l?.Target) row.loomUrl = cell.l.Target;
          else if (looksUrl(s)) row.loomUrl = s;
          break;
        }
        case "approved":
          row.approved = truthy(v);
          break;
        case "sent":
          row.sent = truthy(v);
          break;
        case "notes":
          row.notes = s || null;
          break;
      }
    }
    rows.push(row);
  }
  return rows.length ? { rows } : { rows: [], error: "No client rows found under the header row." };
}
