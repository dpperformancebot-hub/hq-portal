"use server";

// HQ-OWNED client-audit status. The QA audit status (submitted/sent/messaged/
// ghosted) and its resolved flag live in the HQ's own Supabase row
// (client_audits), so they are written directly here, never gated behind
// OUTREACH_ENABLED: nothing leaves the HQ, no GHL field is touched, and no one
// is contacted. (Contrast the GHL write-backs in src/lib/writeback.ts.)

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getServerIdentity } from "@/lib/role-server";
import { isOpsRole } from "@/lib/navigation";
import { canOwnerReviewAudits } from "@/lib/access-policy";
import type { AuditCadence, AuditStatus } from "@/lib/seed/types";

export type AuditStatusResult = { ok: true; status: AuditStatus } | { ok: false; error: string };
export type AuditResolvedResult = { ok: true; resolved: boolean } | { ok: false; error: string };

const NO_DB =
  "Client Audits needs the HQ datastore. Set HQ_PERSISTENCE=true with Supabase configured.";
const NO_COACH = "Assign a coach to this client before auditing them.";

const STATUSES: AuditStatus[] = ["submitted", "sent", "messaged", "ghosted"];
const CADENCES: AuditCadence[] = ["W4", "W8", "W12", "W16"];

/** The only route that renders audit status. */
function revalidate(): void {
  revalidatePath("/client-audits");
}

type UpsertResult = { ok: true } | { ok: false; error: string };

const NOT_ALLOWED = "You do not have access to edit this client's audits.";
const OWNER_REVIEW_DENIED = "Owner reviews are for the owner or admin only.";

/** Write gate (audit 2026-07-02). Audits are worked by the owner and the VA;
 *  a coach may only touch audits for clients on their own roster. Sales has
 *  no audit write access. Owner is checked on the REAL role so impersonation
 *  keeps working. */
async function assertAuditWriteAllowed(clientId: string): Promise<UpsertResult> {
  const identity = await getServerIdentity();
  if (identity.realRole === "owner" || isOpsRole(identity.role)) return { ok: true };
  if (identity.role === "coach" && identity.linkedCoachId) {
    const { data } = await dbAdmin()
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("coach_id", identity.linkedCoachId)
      .maybeSingle();
    if (data) return { ok: true };
  }
  return { ok: false, error: NOT_ALLOWED };
}

/** Race-tolerant upsert on the (client_id, cadence_week) natural key.
 *
 *  Audits are derived from the roster, so most clients have NO stored row until
 *  a coach first touches them. There is no unique constraint on that pair (by
 *  design, to avoid a schema change), so we SELECT then UPDATE-or-INSERT. If a
 *  concurrent request inserts the row between our SELECT and INSERT, the INSERT
 *  fails and we fall back to updating the now-existing row, so no edit is lost.
 *  coachId is only needed to create a fresh row (the coach_id column is NOT
 *  NULL); updates leave it untouched. */
async function upsertAudit(
  clientId: string,
  cadenceWeek: AuditCadence,
  coachId: string | null,
  patch: {
    status?: AuditStatus;
    resolved?: boolean;
    feedback?: string | null;
    loom_url?: string | null;
    /** R4-5 owner review columns (migration 20260807000005). */
    owner_rating?: number | null;
    owner_notes?: string | null;
  },
): Promise<UpsertResult> {
  const db = dbAdmin();
  const find = () =>
    db
      .from("client_audits")
      .select("id")
      .eq("client_id", clientId)
      .eq("cadence_week", cadenceWeek)
      .limit(1)
      .maybeSingle();

  const { data: existing, error: readErr } = await find();
  if (readErr) return { ok: false, error: readErr.message };

  if (existing) {
    const { error } = await db.from("client_audits").update(patch).eq("id", existing.id);
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  if (!coachId) return { ok: false, error: NO_COACH };
  const { error: insErr } = await db.from("client_audits").insert({
    client_id: clientId,
    coach_id: coachId,
    cadence_week: cadenceWeek,
    status: patch.status ?? "submitted",
    resolved: patch.resolved ?? false,
    ...(patch.feedback !== undefined ? { feedback: patch.feedback } : {}),
    ...(patch.loom_url !== undefined ? { loom_url: patch.loom_url } : {}),
    ...(patch.owner_rating !== undefined ? { owner_rating: patch.owner_rating } : {}),
    ...(patch.owner_notes !== undefined ? { owner_notes: patch.owner_notes } : {}),
  });
  if (!insErr) return { ok: true };

  // Lost an insert race: another request created the row first. Update it so
  // this write still lands, rather than surfacing a spurious conflict.
  const { data: row } = await find();
  if (row) {
    const { error } = await db.from("client_audits").update(patch).eq("id", row.id);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  return { ok: false, error: insErr.message };
}

/** Set one client's QA audit status for a cadence week, creating the row on
 *  first touch. Direct pick (not a sequential flow), so it is last-write-wins
 *  by design. */
export async function setAuditStatus(
  clientId: string,
  cadenceWeek: AuditCadence,
  coachId: string | null,
  status: AuditStatus,
): Promise<AuditStatusResult> {
  if (!clientId) return { ok: false, error: "clientId required" };
  if (!CADENCES.includes(cadenceWeek)) return { ok: false, error: "invalid cadence week" };
  if (!STATUSES.includes(status)) return { ok: false, error: "invalid status" };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const allowed = await assertAuditWriteAllowed(clientId);
  if (!allowed.ok) return allowed;

  const res = await upsertAudit(clientId, cadenceWeek, coachId, { status });
  if (!res.ok) return res;
  revalidate();
  return { ok: true, status };
}

export type AuditDetailsResult = { ok: true } | { ok: false; error: string };

const NEEDS_MIGRATION =
  "Saving audit feedback needs a one-time database migration the owner must apply (20260804000002).";

const isMissingAuditColumn = (msg: string) => /feedback|loom_url|42703/i.test(msg);

/** C5: save reviewer feedback and/or a Loom link on one audit, creating the
 *  row on first touch. Same write gate as status/resolved. */
export async function setAuditDetails(
  clientId: string,
  cadenceWeek: AuditCadence,
  coachId: string | null,
  details: { feedback?: string | null; loomUrl?: string | null },
): Promise<AuditDetailsResult> {
  if (!clientId) return { ok: false, error: "clientId required" };
  if (!CADENCES.includes(cadenceWeek)) return { ok: false, error: "invalid cadence week" };
  if (details.feedback === undefined && details.loomUrl === undefined) {
    return { ok: false, error: "Nothing to save." };
  }
  const loom = details.loomUrl?.trim();
  if (loom && !/^https:\/\//.test(loom)) {
    return { ok: false, error: "Loom link must be an https:// URL." };
  }
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const allowed = await assertAuditWriteAllowed(clientId);
  if (!allowed.ok) return allowed;

  const patch: { feedback?: string | null; loom_url?: string | null } = {};
  if (details.feedback !== undefined) patch.feedback = details.feedback?.trim().slice(0, 2000) || null;
  if (details.loomUrl !== undefined) patch.loom_url = loom || null;
  const res = await upsertAudit(clientId, cadenceWeek, coachId, patch);
  if (!res.ok) {
    return { ok: false, error: isMissingAuditColumn(res.error) ? NEEDS_MIGRATION : res.error };
  }
  revalidate();
  return { ok: true };
}

/** Set one client's resolved flag for a cadence week, creating the row on first
 *  touch. The caller passes the target value (derived from the current view
 *  state), so this is an idempotent set rather than a blind toggle: two
 *  concurrent writers converge on the same value instead of cancelling out. */
export async function setAuditResolved(
  clientId: string,
  cadenceWeek: AuditCadence,
  coachId: string | null,
  resolved: boolean,
): Promise<AuditResolvedResult> {
  if (!clientId) return { ok: false, error: "clientId required" };
  if (!CADENCES.includes(cadenceWeek)) return { ok: false, error: "invalid cadence week" };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const allowed = await assertAuditWriteAllowed(clientId);
  if (!allowed.ok) return allowed;

  const res = await upsertAudit(clientId, cadenceWeek, coachId, { resolved });
  if (!res.ok) return res;
  revalidate();
  return { ok: true, resolved };
}

// R4-5: owner spot-review (sheet "Daniel Reviews"): 1-3 rating + notes per
// audit. OWNER ONLY (not the shared audit write gate: this is Dan's review
// loop, not the coach QA flow). Columns absent until migration
// 20260807000005 (honest error).
export async function setOwnerReview(
  clientId: string,
  cadenceWeek: AuditCadence,
  coachId: string | null,
  review: { rating?: number | null; notes?: string | null },
): Promise<AuditDetailsResult> {
  if (!clientId) return { ok: false, error: "clientId required" };
  if (!CADENCES.includes(cadenceWeek)) return { ok: false, error: "invalid cadence week" };
  if (review.rating != null && (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 3)) {
    return { ok: false, error: "Rating is 1 to 3." };
  }
  // Authorise BEFORE anything else (incl. the persistence check) so a refused
  // caller learns nothing about the datastore. Same rule as the UI.
  const identity = await getServerIdentity();
  if (!canOwnerReviewAudits(identity)) return { ok: false, error: OWNER_REVIEW_DENIED };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };

  const patch: { owner_rating?: number | null; owner_notes?: string | null } = {};
  if (review.rating !== undefined) patch.owner_rating = review.rating;
  if (review.notes !== undefined) patch.owner_notes = review.notes?.trim().slice(0, 2000) || null;
  const res = await upsertAudit(clientId, cadenceWeek, coachId, patch);
  if (!res.ok) {
    const missing = /owner_rating|owner_notes|42703/i.test(res.error);
    return {
      ok: false,
      error: missing
        ? "Owner reviews need a one-time database migration the owner must apply (20260807000005)."
        : res.error,
    };
  }
  revalidate();
  return { ok: true };
}
