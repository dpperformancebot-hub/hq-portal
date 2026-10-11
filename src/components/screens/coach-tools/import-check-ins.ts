// Client-side parser for Kahunas check-in imports. Two inputs:
//   1. A CSV/XLSX export (columns like Client Name, Email, Date/Time,
//      Submitted On, Check-in Day)
//   2. The Kahunas check-ins TABLE copied straight off the page and pasted
//      (tab-separated lines, header row optional)
// Both reduce to { name, email?, dateIso } per submitted check-in; matching
// to clients happens server-side (by name: clients store no emails, PII
// decision), where the preview + confirm step lives.
//
// xlsx (SheetJS) is imported dynamically so it never lands in the main bundle.

export type ParsedCheckIn = {
  name: string;
  email: string | null;
  /** ISO date (day precision) the check-in was submitted. */
  dateIso: string;
};

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

// LOCAL calendar date -> ISO string, without a UTC round-trip: the person
// pasting is in the client's timezone, and toISOString() on a local-midnight
// Date shifts the day for anyone east of UTC.
const pad = (n: number) => String(n).padStart(2, "0");
const localIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Day names ("Monday") and pure times are NOT dates for our purposes. */
function toIsoDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return localIso(v);
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^(mon|tues|wednes|thurs|fri|satur|sun)day$/i.test(s)) return null;
  if (/^\d{1,2}:\d{2}/.test(s)) return null; // bare time
  // dd/mm/yyyy first (the sheets are Australian); built from parts, no Date.
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    const m = Number(dmy[2]);
    const day = Number(dmy[1]);
    if (m < 1 || m > 12 || day < 1 || day > 31) return null;
    return `${y}-${pad(m)}-${pad(day)}`;
  }
  // ISO-ish strings are already calendar dates.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  // Reject numeric-only cells that parse as weird epoch values.
  if (d.getFullYear() < 2015 || d.getFullYear() > 2100) return null;
  return localIso(d);
}

type ColKind = "name" | "email" | "date" | "submitted" | null;

function classify(header: string): ColKind {
  const h = norm(header);
  if (!h) return null;
  if (h.includes("email")) return "email";
  if (h.includes("submitted")) return "submitted";
  if (h.includes("clientname") || h === "client" || h === "name" || h.includes("fullname")) return "name";
  if (h.includes("date") || h.includes("time")) return "date";
  return null;
}

/** Turn a grid of cells into check-in rows. Uses the header row when one is
 *  present; otherwise classifies each cell (email = has @, date = parses,
 *  name = first remaining text). "Submitted On" beats "Date/Time" when both
 *  exist. */
function gridToRows(grid: unknown[][]): ParsedCheckIn[] {
  if (grid.length === 0) return [];

  // Header row: a row with a name-ish or submitted-ish label and NO parseable date.
  const headerIdx = grid.findIndex(
    (r) => r.some((c) => classify(String(c)) === "name" || classify(String(c)) === "submitted") && !r.some((c) => toIsoDate(c)),
  );
  const colKind: ColKind[] = headerIdx >= 0 ? grid[headerIdx].map((h) => classify(String(h))) : [];
  const nameCol = colKind.indexOf("name");
  const emailCol = colKind.indexOf("email");
  const submittedCol = colKind.indexOf("submitted");
  const dateCol = colKind.indexOf("date");

  const rows: ParsedCheckIn[] = [];
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const raw = grid[r];
    let name = "";
    let email: string | null = null;
    let dateIso: string | null = null;

    if (headerIdx >= 0 && nameCol !== -1) {
      name = String(raw[nameCol] ?? "").trim();
      // A date or email landing in the name column means the row is
      // misaligned (or nameless): skip rather than invent a client.
      if (toIsoDate(name) || isEmail(name)) name = "";
      if (emailCol !== -1) {
        const e = String(raw[emailCol] ?? "").trim();
        email = isEmail(e) ? e : null;
      }
      // Prefer the "Submitted On" column; fall back to any date-ish column,
      // then any cell that parses.
      dateIso =
        (submittedCol !== -1 ? toIsoDate(raw[submittedCol]) : null) ??
        (dateCol !== -1 ? toIsoDate(raw[dateCol]) : null) ??
        raw.map(toIsoDate).find(Boolean) ??
        null;
    } else {
      // No header: classify cell by cell.
      for (const cell of raw) {
        const s = String(cell ?? "").trim();
        if (!s) continue;
        if (!email && isEmail(s)) {
          email = s;
          continue;
        }
        const d = toIsoDate(cell);
        if (d) {
          if (!dateIso) dateIso = d;
          continue;
        }
        if (!name && !/^(mon|tues|wednes|thurs|fri|satur|sun)day$/i.test(s)) name = s;
      }
    }

    if (!name || !dateIso) continue; // no client or no date, no check-in
    rows.push({ name, email, dateIso });
  }
  return rows;
}

export async function parseCheckInFile(file: File): Promise<{ rows: ParsedCheckIn[]; error?: string }> {
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
  const rows = gridToRows(grid);
  return rows.length ? { rows } : { rows: [], error: "No check-in rows (name + date) found in the file." };
}

/** The Kahunas table copied off the page: one row per line, cells separated
 *  by tabs (browser table copy) or 2+ spaces. */
export function parseCheckInPaste(text: string): { rows: ParsedCheckIn[]; error?: string } {
  // Do NOT trim lines before splitting: a leading tab is an empty first cell
  // and trimming it would shift every cell one column left.
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { rows: [], error: "Nothing to parse. Copy the Kahunas check-ins table and paste it here." };
  const grid = lines.map((l) => (l.includes("\t") ? l.split("\t") : l.trim().split(/\s{2,}/)));
  const rows = gridToRows(grid);
  return rows.length
    ? { rows }
    : { rows: [], error: "Could not find name + date pairs in the pasted text. Copy the whole table including its header row." };
}
