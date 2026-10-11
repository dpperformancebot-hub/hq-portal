// Turning a parsed sheet into a PLAN: one outcome per row, nothing written.
// Pure, so every rule in the brief is unit-testable without a database.

import { isClear, type FieldDef, type FieldId } from "@/lib/import/fields";
import { parseAuDate } from "@/lib/import/sheet";
import { matchRow, normName, type Candidate } from "@/lib/import/match";
import { mayTouch, type ImportScope } from "@/lib/import/scope";

export type ClientSnapshot = Candidate & {
  values: Partial<Record<FieldId, string | number | null>>;
};

export type FieldChange = { field: FieldId; label: string; from: string | null; to: string | null };

export type RowOutcome =
  | { status: "update"; clientId: string; clientName: string; changes: FieldChange[] }
  | { status: "no_change"; clientId: string; clientName: string }
  | { status: "suggested"; clientId: string; clientName: string; score: number; changes: FieldChange[] }
  | { status: "not_found"; label: string }
  | { status: "ambiguous"; label: string; candidates: string[] }
  | { status: "not_yours"; label: string; clientName: string }
  | { status: "duplicate"; label: string; firstRow: number }
  | { status: "error"; label: string; errors: string[] };

export type PlannedRow = { row: number; outcome: RowOutcome };

export type PlanInput = {
  /** Data rows, each a map of field -> raw cell text. */
  rows: { row: number; cells: Partial<Record<FieldId, string>> }[];
  clients: ClientSnapshot[];
  scope: ImportScope;
  fields: FieldDef[];
  /** Fuzzy suggestions the user has ticked, by row number. */
  acceptedSuggestions?: Set<number>;
};

const show = (v: string | number | null | undefined): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);

/** Normalise a cell for comparison, so "Weekly" and "weekly check in's" do not
 *  read as a change every single import. */
function coerce(field: FieldDef, raw: string): { ok: true; value: string | number | null } | { ok: false; error: string } {
  const s = raw.trim();
  if (isClear(s)) return { ok: true, value: null };
  if (s === "") return { ok: true, value: undefined as unknown as null };

  if (field.type === "date") {
    const d = parseAuDate(s);
    return d.ok ? { ok: true, value: d.iso } : { ok: false, error: `${field.label}: ${d.reason}` };
  }
  if (field.type === "number") {
    const n = Number(s.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n)) return { ok: false, error: `${field.label}: "${s}" is not a number` };
    return { ok: true, value: n };
  }
  if (field.type === "enum") {
    const k = s.toLowerCase().replace(/[^a-z]/g, "");
    const hit = (field.options ?? []).find((o) => {
      const ok = o.toLowerCase();
      return k === ok || k.startsWith(ok);
    });
    if (!hit) return { ok: false, error: `${field.label}: "${s}" is not one of ${(field.options ?? []).join(", ")}` };
    return { ok: true, value: hit };
  }
  return { ok: true, value: s };
}

export function buildPlan(input: PlanInput): PlannedRow[] {
  const { rows, clients, scope, fields, acceptedSuggestions } = input;
  const byId = new Map(fields.map((f) => [f.id, f]));
  const writable = fields.filter((f) => f.kind === "portal_owned");
  const ghlOwned = fields.filter((f) => f.kind === "ghl_owned");

  // A coach may only MATCH their own clients, so a shared name can never
  // resolve to someone else's. The full list is still needed to tell
  // "not yours" apart from "not found".
  const pool: ClientSnapshot[] = scope.kind === "all" ? clients : clients.filter((c) => mayTouch(scope, c.coachId));

  const seen = new Map<string, number>();
  const out: PlannedRow[] = [];

  for (const r of rows) {
    const label = r.cells.name?.trim() || r.cells.email?.trim() || r.cells.ghlContactId?.trim() || `row ${r.row}`;

    const m = matchRow(
      { ghlContactId: r.cells.ghlContactId, email: r.cells.email, phone: r.cells.phone, name: r.cells.name },
      pool,
    );

    if (m.kind === "ambiguous") {
      out.push({ row: r.row, outcome: { status: "ambiguous", label, candidates: m.candidates.map((c) => c.name) } });
      continue;
    }

    if (m.kind === "not_found") {
      // Was it findable but outside their scope? Saying "not yours" instead of
      // "not found" is the difference between a fixable mistake and a mystery.
      const elsewhere = clients.find((c) => normName(c.name) === normName(r.cells.name));
      if (elsewhere && !mayTouch(scope, elsewhere.coachId)) {
        out.push({ row: r.row, outcome: { status: "not_yours", label, clientName: elsewhere.name } });
      } else {
        out.push({ row: r.row, outcome: { status: "not_found", label } });
      }
      continue;
    }

    // matchRow returns the Candidate it was given, so this is the same object.
    const client = m.client as ClientSnapshot;

    // Two rows for the same client in one file: the second is a duplicate, not
    // a second update, or the file would fight itself.
    const prior = seen.get(client.id);
    if (prior !== undefined) {
      out.push({ row: r.row, outcome: { status: "duplicate", label, firstRow: prior } });
      continue;
    }
    seen.set(client.id, r.row);

    const errors: string[] = [];
    const changes: FieldChange[] = [];

    for (const f of writable) {
      const raw = r.cells[f.id];
      if (raw === undefined) continue;
      const res = coerce(f, raw);
      if (!res.ok) { errors.push(res.error); continue; }
      if (res.value === undefined) continue; // empty cell: never a clear
      const before = client.values[f.id] ?? null;
      const after = res.value;
      const same = show(before) === show(after);
      if (!same) changes.push({ field: f.id, label: f.label, from: show(before), to: show(after) });
    }

    // GHL-owned columns are compared and reported, never written.
    for (const f of ghlOwned) {
      const raw = r.cells[f.id];
      if (raw === undefined || raw.trim() === "") continue;
      const before = client.values[f.id] ?? null;
      if (show(before) !== raw.trim()) {
        errors.push(`${f.label} differs from GHL ("${show(before) ?? "blank"}" vs "${raw.trim()}"). Fix it in GHL; the sync would overwrite it here overnight.`);
      }
    }

    const hardErrors = errors.filter((e) => !e.includes("differs from GHL"));
    if (hardErrors.length > 0) {
      out.push({ row: r.row, outcome: { status: "error", label, errors } });
      continue;
    }

    if (m.kind === "suggested" && !acceptedSuggestions?.has(r.row)) {
      out.push({ row: r.row, outcome: { status: "suggested", clientId: client.id, clientName: client.name, score: m.score, changes } });
      continue;
    }

    if (changes.length === 0) {
      out.push({ row: r.row, outcome: { status: "no_change", clientId: client.id, clientName: client.name } });
    } else {
      out.push({ row: r.row, outcome: { status: "update", clientId: client.id, clientName: client.name, changes } });
    }
    void byId;
  }

  return out;
}

export function summarise(plan: PlannedRow[]) {
  const c: Record<string, number> = {};
  for (const p of plan) c[p.outcome.status] = (c[p.outcome.status] ?? 0) + 1;
  return {
    total: plan.length,
    update: c.update ?? 0,
    noChange: c.no_change ?? 0,
    suggested: c.suggested ?? 0,
    notFound: c.not_found ?? 0,
    ambiguous: c.ambiguous ?? 0,
    notYours: c.not_yours ?? 0,
    duplicate: c.duplicate ?? 0,
    error: c.error ?? 0,
  };
}
