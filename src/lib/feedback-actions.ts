"use server";

// R3-3 (FEEDBACK-V2): coach feedback submissions. Coach identity is derived
// from the SESSION (never posted). Each submission is stored in
// coach_feedback AND filed as a C3-routed ticket (coach → head coach, head
// coach → owner) so it lands on the right task board. Internal data only,
// no outbound path.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getServerIdentity } from "@/lib/role-server";
import { isOpsRole } from "@/lib/navigation";
import { createTicketAction } from "@/lib/tasks-actions";
import { FEEDBACK_CATEGORIES, type FeedbackCategory, type FeedbackRow } from "@/lib/feedback-shared";

type Result = { ok: true; routedTo: string | null } | { ok: false; error: string };

const NO_DB = "Submitting feedback needs the HQ datastore. Set HQ_PERSISTENCE=true with Supabase configured.";
const NEEDS_MIGRATION =
  "Submitting feedback needs a one-time database migration the owner must apply (20260807000001).";

const missingTable = (error: { code?: string; message?: string } | null) =>
  error?.code === "42P01" || /coach_feedback/i.test(error?.message ?? "");

export async function submitFeedbackAction(input: {
  category: FeedbackCategory;
  subject: string;
  details: string;
}): Promise<Result> {
  const subject = input.subject.trim();
  const details = input.details.trim();
  if (!(FEEDBACK_CATEGORIES as readonly string[]).includes(input.category)) {
    return { ok: false, error: "Pick a category." };
  }
  if (!subject) return { ok: false, error: "A subject is required." };
  if (subject.length > 200 || details.length > 4000) {
    return { ok: false, error: "Keep the subject under 200 and details under 4000 characters." };
  }
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };

  const identity = await getServerIdentity();
  if (identity.role !== "coach") {
    return { ok: false, error: "Feedback submissions are for coach logins." };
  }
  const coachName = identity.displayName ?? "A coach";

  const { error } = await dbAdmin().from("coach_feedback").insert({
    coach_id: identity.linkedCoachId,
    coach_name: coachName,
    category: input.category,
    subject,
    details,
  });
  if (error) return { ok: false, error: missingTable(error) ? NEEDS_MIGRATION : error.message };

  // Feed the ticket board (C3 routing). Best-effort: the stored submission is
  // the record; a ticket failure never fails the submit.
  let routedTo: string | null = null;
  try {
    const res = await createTicketAction({ title: `${input.category}: ${subject}` });
    if (res.ok && res.data) routedTo = res.data.routedTo;
  } catch {
    /* best-effort */
  }

  revalidatePath("/feedback");
  return { ok: true, routedTo };
}

/** Submissions visible to the identity: plain coach = own, head coach and
 *  owner/VA = all. Empty pre-migration / persistence off. */
export async function listFeedback(): Promise<FeedbackRow[]> {
  if (!persistenceEnabled()) return [];
  const identity = await getServerIdentity();
  let q = dbAdmin()
    .from("coach_feedback")
    .select("id, coach_name, category, subject, details, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (identity.role === "coach" && !identity.isHeadCoach) {
    if (!identity.linkedCoachId) return [];
    q = q.eq("coach_id", identity.linkedCoachId);
  } else if (identity.role !== "coach" && identity.realRole !== "owner" && !isOpsRole(identity.role)) {
    // SEC-AUDIT (2026-09-06): sales / ambassador_mgr have no feedback surface.
    return [];
  }
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as {
    id: string;
    coach_name: string;
    category: FeedbackCategory;
    subject: string;
    details: string;
    created_at: string;
  }[]).map((r) => ({
    id: r.id,
    coachName: r.coach_name,
    category: r.category,
    subject: r.subject,
    details: r.details,
    createdAt: r.created_at,
  }));
}
