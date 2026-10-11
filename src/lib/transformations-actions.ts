"use server";

// HQ-OWNED transformation approval flow. The Results Tracker moves a
// transformation through draft -> coach_approved -> admin_approved ->
// scheduled -> posted. That status lives in the HQ's own Supabase row
// (transformations.status), so it is written directly here, never gated behind
// OUTREACH_ENABLED: nothing leaves the HQ, no GHL field is touched, and no one
// is contacted. (Contrast the GHL write-backs in src/lib/writeback.ts.)

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getServerIdentity } from "@/lib/role-server";
import { isOpsRole } from "@/lib/navigation";
import type { TransformationStatus } from "@/lib/seed/types";

export type AdvanceResult =
  | { ok: true; status: TransformationStatus }
  | { ok: false; error: string };

const NO_DB =
  "The approval flow needs the HQ datastore. Set HQ_PERSISTENCE=true with Supabase configured.";

const STALE =
  "This transformation moved on already. Refresh to see its current stage.";

// The single source of truth for the forward order of the approval flow.
// Each stage maps to the one that follows it; "posted" is terminal (absent).
const NEXT: Partial<Record<TransformationStatus, TransformationStatus>> = {
  draft: "coach_approved",
  coach_approved: "admin_approved",
  admin_approved: "scheduled",
  scheduled: "posted",
};

// A9: the reverse map for send-back / un-approve. "posted" is deliberately
// absent: once published there is nothing to send back to.
const PREV: Partial<Record<TransformationStatus, TransformationStatus>> = {
  coach_approved: "draft",
  admin_approved: "coach_approved",
  scheduled: "admin_approved",
};

/** Routes that render transformation status: the owner Results Tracker and the
 *  coach's own Results view. */
function revalidateTransformationPaths(): void {
  revalidatePath("/results-tracker");
  revalidatePath("/results");
}

/** Advance one transformation to the next stage in the approval flow.
 *
 *  `from` is the stage the caller currently sees; the next stage is derived
 *  from it (never trusted from the client). The update is conditioned on the
 *  row still being at `from`, so two people advancing the same card at once
 *  cannot double-advance it: the second call no-ops and reports STALE. Moving
 *  to "posted" stamps posted_at. */
export async function advanceTransformationAction(
  id: string,
  from: TransformationStatus,
): Promise<AdvanceResult> {
  if (!id) return { ok: false, error: "id required" };
  const next = NEXT[from];
  if (!next) return { ok: false, error: "Already at the final stage" };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };

  // SEC-AUDIT P1-6 (2026-09-06): this had no identity check at all, so any
  // signed-in session could push any card through to "posted". Same rule as
  // send-back below: owner / VA / head coach move any card; a plain coach may
  // only give the COACH approval (draft -> coach_approved) on their own
  // client's card. Admin/scheduled/posted stages are the team's.
  const identity = await getServerIdentity();
  const isReviewer = identity.realRole === "owner" || isOpsRole(identity.role) || identity.isHeadCoach;
  if (!isReviewer) {
    if (identity.role !== "coach" || from !== "draft") {
      return { ok: false, error: "You do not have access to move this card." };
    }
    const { data: row } = await dbAdmin().from("transformations").select("coach_id").eq("id", id).maybeSingle();
    if (!row || row.coach_id !== identity.linkedCoachId) {
      return { ok: false, error: "That transformation is not on your roster." };
    }
  }

  const update: {
    status: TransformationStatus;
    posted_at?: string;
    sent_back_reason?: null;
    sent_back_at?: null;
  } = { status: next };
  if (next === "posted") update.posted_at = new Date().toISOString();
  // Moving forward clears any send-back reason (A9): it described a state the
  // card has now left.
  update.sent_back_reason = null;
  update.sent_back_at = null;

  let { data, error } = await dbAdmin()
    .from("transformations")
    .update(update)
    .eq("id", id)
    .eq("status", from) // guard: only advance if still where the caller saw it
    .select("id");
  if (error && isMissingColumn(error)) {
    // Send-back columns not migrated yet: advance without clearing them.
    delete update.sent_back_reason;
    delete update.sent_back_at;
    ({ data, error } = await dbAdmin()
      .from("transformations")
      .update(update)
      .eq("id", id)
      .eq("status", from)
      .select("id"));
  }
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: STALE };

  revalidateTransformationPaths();
  return { ok: true, status: next };
}

export type SendBackResult =
  | { ok: true; status: TransformationStatus; warning?: string }
  | { ok: false; error: string };

const REASON_NOT_STORED =
  "Sent back, but the reason could not be stored until the owner applies migration 20260804000001.";

const isMissingColumn = (error: { code?: string; message?: string } | null) =>
  error?.code === "42703" || /sent_back_reason/i.test(error?.message ?? "");

/** Send a transformation BACK one stage with a reason (A9: approvals are no
 *  longer one-way). Same optimistic-concurrency guard as advancing.
 *
 *  Access: owner, VA, and the head coach may send back any card; a plain
 *  coach may only un-approve their OWN approval (coach_approved back to
 *  draft) on their own client. Posted stays terminal. */
export async function sendBackTransformationAction(
  id: string,
  from: TransformationStatus,
  reason: string,
): Promise<SendBackResult> {
  if (!id) return { ok: false, error: "id required" };
  const prev = PREV[from];
  if (!prev) return { ok: false, error: "This stage cannot be sent back" };
  const trimmed = reason.trim().slice(0, 500);
  if (!trimmed) return { ok: false, error: "A reason is required to send back" };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };

  // Server actions are directly invokable: derive access from the session,
  // never the caller's claims.
  const identity = await getServerIdentity();
  const isReviewer = identity.realRole === "owner" || isOpsRole(identity.role) || identity.isHeadCoach;
  if (!isReviewer) {
    if (identity.role !== "coach" || from !== "coach_approved") {
      return { ok: false, error: "You do not have access to send this back." };
    }
    const { data: row } = await dbAdmin()
      .from("transformations")
      .select("coach_id")
      .eq("id", id)
      .maybeSingle();
    if (!row || row.coach_id !== identity.linkedCoachId) {
      return { ok: false, error: "That transformation is not on your roster." };
    }
  }

  const stamp = { sent_back_reason: trimmed, sent_back_at: new Date().toISOString() };
  const { data, error } = await dbAdmin()
    .from("transformations")
    .update({ status: prev, ...stamp })
    .eq("id", id)
    .eq("status", from)
    .select("id");
  if (error) {
    // Column not there yet (owner-gated migration): still perform the
    // send-back, report the reason honestly as unstored.
    if (isMissingColumn(error)) {
      const retry = await dbAdmin()
        .from("transformations")
        .update({ status: prev })
        .eq("id", id)
        .eq("status", from)
        .select("id");
      if (retry.error) return { ok: false, error: retry.error.message };
      if (!retry.data || retry.data.length === 0) return { ok: false, error: STALE };
      revalidateTransformationPaths();
      return { ok: true, status: prev, warning: REASON_NOT_STORED };
    }
    return { ok: false, error: error.message };
  }
  if (!data || data.length === 0) return { ok: false, error: STALE };

  revalidateTransformationPaths();
  return { ok: true, status: prev };
}

// R4-4: content post-log (master sheet "Ready To Post" / "Post Log").
// Editable once the card is approved (admin_approved onward). Owner / VA /
// head coach only: posting is a team job, not a coach one. Columns absent
// until migration 20260807000005 (honest error).
export async function setPostLogAction(input: {
  id: string;
  postedIg?: boolean;
  postedTt?: boolean;
  canvaUrl?: string | null;
  caption?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!input.id) return { ok: false, error: "id required" };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const canva = (input.canvaUrl ?? "").trim();
  if (canva && !/^https:\/\//.test(canva)) return { ok: false, error: "Canva link must be an https URL." };
  if ((input.caption ?? "").length > 2000) return { ok: false, error: "Keep the caption under 2000 characters." };

  const identity = await getServerIdentity();
  const allowed =
    identity.realRole === "owner" || isOpsRole(identity.role) || (identity.role === "coach" && identity.isHeadCoach);
  if (!allowed) return { ok: false, error: "Only owner, VA, or the head coach edit the post log." };

  const patch: Record<string, unknown> = {};
  if (input.postedIg !== undefined) patch.posted_ig = input.postedIg;
  if (input.postedTt !== undefined) patch.posted_tt = input.postedTt;
  if (input.canvaUrl !== undefined) patch.canva_url = canva || null;
  if (input.caption !== undefined) patch.caption = (input.caption ?? "").trim() || null;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await dbAdmin()
    .from("transformations")
    .update(patch)
    .eq("id", input.id)
    .in("status", ["admin_approved", "scheduled", "posted"]);
  if (error) {
    const missing = error.code === "42703" || /posted_ig|canva_url/i.test(error.message);
    return {
      ok: false,
      error: missing
        ? "The post log needs a one-time database migration the owner must apply (20260807000005)."
        : error.message,
    };
  }
  revalidateTransformationPaths();
  return { ok: true };
}
