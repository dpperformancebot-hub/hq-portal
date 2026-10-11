"use server";

// Kahunas check-in importer (2026-07-11, master-audit build): owner/VA import
// the whole book, coaches import their own clients. Two-step by design
// (owner's approval rule): previewCheckInImportAction matches and reports,
// commitCheckInImportAction re-runs the SAME matching server-side and writes,
// so nothing is trusted from the preview payload and nothing lands without an
// explicit Confirm click.
//
// Matching is by client NAME, case-insensitive (clients store no emails, PII
// decision); unmatched names are reported back as a fix list, mirroring the
// Kahunas webhook's skip reporting. Rows write to check_ins with source
// 'kahunas', code 'Y' (a Kahunas export row IS a submitted check-in), deduped
// on (client_id, submitted_at, source) like every other ingest path.
// Internal data only, NO outbound path.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { fetchAllRows } from "@/lib/db/fetch-all";
import { getServerIdentity } from "@/lib/role-server";

export type CheckInImportRow = { name: string; dateIso: string };

export type CheckInImportPreview = {
  /** Distinct client+date pairs that matched a client. */
  matched: number;
  /** Names that matched no client (or, for a coach, someone else's client). */
  unmatchedNames: string[];
  /** Matched pairs not yet in check_ins (would insert). */
  newCount: number;
  /** Matched pairs already recorded (would update in place). */
  existingCount: number;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const OFF = "Importing check-ins needs the HQ datastore. Set HQ_PERSISTENCE=true with Supabase configured.";
const MAX_ROWS = 2000;

const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

type Matched = { clientId: string; coachId: string | null; dateIso: string };

/** Shared core: resolve the caller's scope, match rows to clients by name,
 *  and split matched pairs into new vs already-recorded. */
async function matchRows(rows: CheckInImportRow[]): Promise<
  Result<{
    matched: Matched[];
    unmatchedNames: string[];
    newPairs: Matched[];
    existingPairs: Matched[];
  }>
> {
  if (!persistenceEnabled()) return { ok: false, error: OFF };
  const identity = await getServerIdentity();
  if (identity.role !== "coach" && identity.role !== "va" && identity.realRole !== "owner") {
    return { ok: false, error: "You do not have access to import check-ins." };
  }

  const clean = rows
    .map((r) => ({ name: String(r.name ?? "").trim(), dateIso: String(r.dateIso ?? "").slice(0, 10) }))
    .filter((r) => r.name && /^\d{4}-\d{2}-\d{2}$/.test(r.dateIso));
  if (clean.length === 0) return { ok: false, error: "No usable rows (name + date) to import." };
  if (clean.length > MAX_ROWS) {
    return { ok: false, error: `That import has ${clean.length} rows; the cap is ${MAX_ROWS} per run.` };
  }

  // A plain coach only ever writes their own roster; the head coach can log
  // for anyone (they oversee all coaches), as can the owner and VA.
  const ownOnly = identity.role === "coach" && !identity.isHeadCoach ? identity.linkedCoachId : null;

  // R19-1: paged; this map matches sheet names to clients, so a truncated
  // read would silently fail to match everyone past row 1000.
  const clients = await fetchAllRows<{ id: string; name: string; coach_id: string | null }>(
    (from, to) => dbAdmin().from("clients").select("id,name,coach_id").order("id").range(from, to),
    { label: "import: clients" },
  );
  // fetchAllRows throws on a read error rather than returning a short list,
  // so there is no silent-truncation branch left to handle here.
  const byName = new Map<string, { id: string; coach_id: string | null }>();
  for (const c of clients) {
    byName.set(normName(c.name), { id: c.id, coach_id: c.coach_id });
  }

  const matched: Matched[] = [];
  const unmatched = new Set<string>();
  const seenPair = new Set<string>();
  for (const r of clean) {
    const client = byName.get(normName(r.name));
    if (!client || (ownOnly && client.coach_id !== ownOnly)) {
      unmatched.add(r.name);
      continue;
    }
    const key = `${client.id}:${r.dateIso}`;
    if (seenPair.has(key)) continue; // same client+day twice in one import
    seenPair.add(key);
    matched.push({ clientId: client.id, coachId: client.coach_id, dateIso: r.dateIso });
  }

  // Already-recorded check: existing kahunas-source rows for these clients in
  // the import's date window, compared as day-precision pairs.
  const existing = new Set<string>();
  if (matched.length > 0) {
    const dates = matched.map((m) => m.dateIso).sort();
    const { data: prior } = await dbAdmin()
      .from("check_ins")
      .select("client_id,submitted_at")
      .eq("source", "kahunas")
      .in("client_id", [...new Set(matched.map((m) => m.clientId))])
      .gte("submitted_at", dates[0])
      .lte("submitted_at", `${dates[dates.length - 1]}T23:59:59Z`);
    for (const p of (prior ?? []) as { client_id: string; submitted_at: string }[]) {
      existing.add(`${p.client_id}:${String(p.submitted_at).slice(0, 10)}`);
    }
  }
  const newPairs = matched.filter((m) => !existing.has(`${m.clientId}:${m.dateIso}`));
  const existingPairs = matched.filter((m) => existing.has(`${m.clientId}:${m.dateIso}`));

  return { ok: true, data: { matched, unmatchedNames: [...unmatched].sort(), newPairs, existingPairs } };
}

/** Step 1: parse result -> what WOULD happen. Writes nothing. */
export async function previewCheckInImportAction(
  rows: CheckInImportRow[],
): Promise<Result<CheckInImportPreview>> {
  const res = await matchRows(rows);
  if (!res.ok) return res;
  const { matched, unmatchedNames, newPairs, existingPairs } = res.data;
  return {
    ok: true,
    data: {
      matched: matched.length,
      unmatchedNames,
      newCount: newPairs.length,
      existingCount: existingPairs.length,
    },
  };
}

/** Step 2 (after the user's explicit Confirm): re-match the SAME rows and
 *  write. Upserts on (client_id, submitted_at, source) so re-imports are
 *  idempotent. */
export async function commitCheckInImportAction(
  rows: CheckInImportRow[],
): Promise<Result<{ inserted: number; updated: number; unmatchedNames: string[] }>> {
  const res = await matchRows(rows);
  if (!res.ok) return res;
  const { matched, unmatchedNames, newPairs } = res.data;
  if (matched.length === 0) {
    return { ok: false, error: "Nothing matched a client, so nothing was written." };
  }

  // check_ins.coach_id is NOT NULL: rows for unassigned clients cannot land.
  const writable = matched.filter((m) => m.coachId);
  const skippedNoCoach = matched.length - writable.length;

  const payload = writable.map((m) => ({
    client_id: m.clientId,
    coach_id: m.coachId,
    submitted_at: new Date(m.dateIso).toISOString(),
    code: "Y",
    source: "kahunas",
  }));
  const { error } = await dbAdmin()
    .from("check_ins")
    .upsert(payload, { onConflict: "client_id,submitted_at,source" });
  if (error) return { ok: false, error: error.message };

  for (const p of ["/check-ins", "/dashboard", "/coach-performance", "/my-clients", "/client-database"]) {
    revalidatePath(p);
  }
  const inserted = newPairs.filter((m) => m.coachId).length;
  return {
    ok: true,
    data: {
      inserted,
      updated: writable.length - inserted,
      unmatchedNames: skippedNoCoach
        ? [...unmatchedNames, `(${skippedNoCoach} matched clients skipped: no coach assigned)`]
        : unmatchedNames,
    },
  };
}
