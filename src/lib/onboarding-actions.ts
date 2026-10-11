"use server";

// Client onboarding tracker (2026-07-09, head-coach request). Replaces the
// per-coach "New Client Plan Creation Tracker" spreadsheet. One row per new
// client; the coach ticks their steps, the head coach reviews feedback and
// flips approval. Table: client_onboarding (migration 20260709000001).
//
// Access model:
//   - coach: sees + edits ONLY their own rows, and never the approval fields
//   - head coach (coaches.role = 'head_coach') and owner: everything
//   - va: read-only list (screen hides editing)
// Internal records only, NO outbound path.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getServerIdentity } from "@/lib/role-server";
import { notifySlack, slackPingEnabled } from "@/lib/slack";

export type OnboardingRow = {
  id: string;
  clientId: string | null;
  clientName: string;
  coachId: string | null;
  coachName: string;
  kahunasUrl: string | null;
  startDate: string | null;
  qnaReceived: boolean;
  nutritionPlanMade: boolean;
  nutritionFeedback: string | null;
  nutritionAdjusted: boolean;
  workoutPlanMade: boolean;
  workoutFeedback: string | null;
  workoutAdjusted: boolean;
  loomUrl: string | null;
  approved: boolean;
  sent: boolean;
  notes: string | null;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const NO_DB = "Onboarding needs a one-time database migration (20260709000001). It is written, not yet applied.";

// Coach-editable step fields; approval/sent are reviewer-only.
const COACH_FIELDS = [
  "qna_received",
  "nutrition_plan_made",
  "nutrition_adjusted",
  "workout_plan_made",
  "workout_adjusted",
  "loom_url",
  "kahunas_url",
  "start_date",
  "notes",
] as const;
const REVIEWER_FIELDS = [...COACH_FIELDS, "nutrition_feedback", "workout_feedback", "approved", "sent"] as const;
type Field = (typeof REVIEWER_FIELDS)[number];

type Access =
  | { level: "reviewer" } // owner or head coach: all rows, all fields
  | { level: "coach"; coachId: string } // own rows, step fields only
  | { level: "viewer" } // va: read-only
  | { level: "none" };

async function resolveAccess(): Promise<Access> {
  // RESTRICTED (owner rule 2026-07-24): owner + head coach only. Regular
  // coaches and VAs get NO access; the route also redirects them server-side
  // (onboarding/page.tsx), this is the data-layer backstop. The coach/viewer
  // levels stay in the Access type in case the owner reopens per-coach steps.
  const { role, realRole, isHeadCoach } = await getServerIdentity();
  if (realRole === "owner") return { level: "reviewer" };
  if (role === "coach" && isHeadCoach) return { level: "reviewer" };
  return { level: "none" };
}

type Row = {
  id: string;
  client_id: string | null;
  client_name: string;
  coach_id: string | null;
  kahunas_url: string | null;
  start_date: string | null;
  qna_received: boolean;
  nutrition_plan_made: boolean;
  nutrition_feedback: string | null;
  nutrition_adjusted: boolean;
  workout_plan_made: boolean;
  workout_feedback: string | null;
  workout_adjusted: boolean;
  loom_url: string | null;
  approved: boolean;
  sent: boolean;
  notes: string | null;
};

const SELECT =
  "id,client_id,client_name,coach_id,kahunas_url,start_date,qna_received,nutrition_plan_made,nutrition_feedback,nutrition_adjusted,workout_plan_made,workout_feedback,workout_adjusted,loom_url,approved,sent,notes";

function toRow(r: Row, coachNames: Map<string, string>): OnboardingRow {
  return {
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    coachId: r.coach_id,
    coachName: r.coach_id ? coachNames.get(r.coach_id) ?? "Unassigned" : "Unassigned",
    kahunasUrl: r.kahunas_url,
    startDate: r.start_date,
    qnaReceived: r.qna_received,
    nutritionPlanMade: r.nutrition_plan_made,
    nutritionFeedback: r.nutrition_feedback,
    nutritionAdjusted: r.nutrition_adjusted,
    workoutPlanMade: r.workout_plan_made,
    workoutFeedback: r.workout_feedback,
    workoutAdjusted: r.workout_adjusted,
    loomUrl: r.loom_url,
    approved: r.approved,
    sent: r.sent,
    notes: r.notes,
  };
}

/** Rows for the current identity: coaches get their own, reviewers get all.
 *  Empty pre-migration so the screen degrades to its empty state. */
export async function listOnboarding(): Promise<{ rows: OnboardingRow[]; canReview: boolean; canEdit: boolean }> {
  if (!persistenceEnabled()) return { rows: [], canReview: false, canEdit: false };
  const access = await resolveAccess();
  if (access.level === "none") return { rows: [], canReview: false, canEdit: false };
  try {
    let q = dbAdmin().from("client_onboarding").select(SELECT).order("created_at", { ascending: false });
    if (access.level === "coach") q = q.eq("coach_id", access.coachId);
    const [{ data, error }, { data: coaches }] = await Promise.all([
      q,
      dbAdmin().from("coaches").select("id,name"),
    ]);
    if (error || !data) return { rows: [], canReview: false, canEdit: false };
    const names = new Map((coaches ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
    return {
      rows: (data as Row[]).map((r) => toRow(r, names)),
      canReview: access.level === "reviewer",
      canEdit: access.level !== "viewer",
    };
  } catch {
    return { rows: [], canReview: false, canEdit: false };
  }
}

/** Add a client to onboarding. Coaches add to their own roster only. */
export async function createOnboardingAction(input: {
  clientName: string;
  clientId?: string | null;
  coachId?: string | null;
  kahunasUrl?: string | null;
  startDate?: string | null;
}): Promise<Result<null>> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const access = await resolveAccess();
  if (access.level !== "reviewer" && access.level !== "coach") {
    return { ok: false, error: "You do not have access to add onboarding rows." };
  }
  const name = input.clientName.trim();
  if (!name) return { ok: false, error: "Client name required" };
  const coachId = access.level === "coach" ? access.coachId : input.coachId ?? null;

  const { error } = await dbAdmin().from("client_onboarding").insert({
    client_name: name,
    client_id: input.clientId ?? null,
    coach_id: coachId,
    kahunas_url: input.kahunasUrl?.trim() || null,
    start_date: input.startDate || null,
  });
  if (error) {
    return { ok: false, error: /relation .* does not exist/i.test(error.message) ? NO_DB : error.message };
  }
  revalidatePath("/onboarding");
  return { ok: true, data: null };
}

/** Update one field on a row, gated by role (coaches: own rows, step fields). */
export async function updateOnboardingAction(
  id: string,
  field: Field,
  value: boolean | string | null,
): Promise<Result<null>> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  if (!id) return { ok: false, error: "id required" };
  const access = await resolveAccess();
  if (access.level === "viewer" || access.level === "none") {
    return { ok: false, error: "You do not have access to edit onboarding." };
  }
  const allowed: readonly string[] = access.level === "reviewer" ? REVIEWER_FIELDS : COACH_FIELDS;
  if (!allowed.includes(field)) {
    return { ok: false, error: "Only the head coach or owner can change that field." };
  }
  let q = dbAdmin()
    .from("client_onboarding")
    .update({ [field]: typeof value === "string" ? value.trim() || null : value })
    .eq("id", id);
  if (access.level === "coach") q = q.eq("coach_id", access.coachId); // never someone else's row
  const { error } = await q;
  if (error) return { ok: false, error: error.message };
  revalidatePath("/onboarding");

  // Two-way Slack pings (team-internal, fail-silent, no client contact):
  //   coach submits a step  -> head coach knows to review
  //   head coach approves   -> coach knows they are clear to send
  await notifyOnboardingEvent(id, field, value);
  return { ok: true, data: null };
}

/** Compose + send the Slack ping for a tracker event. Best-effort only. */
async function notifyOnboardingEvent(id: string, field: Field, value: boolean | string | null): Promise<void> {
  const submitted =
    (field === "nutrition_plan_made" && value === true && "submitted a NUTRITION plan") ||
    (field === "workout_plan_made" && value === true && "submitted a WORKOUT plan") ||
    (field === "loom_url" && typeof value === "string" && value.trim() && "added the WELCOME VIDEO loom");
  const approved = field === "approved" && value === true;
  const sent = field === "sent" && value === true;
  if (!submitted && !approved && !sent) return;
  try {
    const { data: row } = await dbAdmin()
      .from("client_onboarding")
      .select("client_name,coach_id,start_date")
      .eq("id", id)
      .maybeSingle();
    if (!row) return;
    // R2-6: the onboarding ping family is toggleable via SLACK_PING_ONBOARDING.
    if (!slackPingEnabled("onboarding")) return;
    let coachName = "Unassigned";
    if (row.coach_id) {
      const { data: c } = await dbAdmin().from("coaches").select("name").eq("id", row.coach_id).maybeSingle();
      if (c?.name) coachName = c.name;
    }
    if (submitted) {
      await notifySlack(`:inbox_tray: ${coachName} ${submitted} for *${row.client_name}* — ready for review in the portal (/onboarding).`);
    } else if (approved) {
      // R2-6b: approval confirmation carries client, coach, start date.
      const starts = row.start_date ? `, starts ${row.start_date}` : "";
      await notifySlack(`:white_check_mark: *${row.client_name}* approved by the head coach — ${coachName}, you're clear to send${starts}.`);
    } else if (sent) {
      await notifySlack(`:outbox_tray: *${row.client_name}* plans marked SENT (coach ${coachName}).`);
    }
  } catch {
    /* notifications never break the action */
  }
}

/** Bulk SYNC from an uploaded CSV/XLSX sheet (parsed client-side).
 *  Upload the latest master sheet any time: existing rows (matched on client
 *  name + coach) are UPDATED to the sheet's values, new clients are inserted.
 *  Coaches import onto their own name; reviewers may carry a Coach column.
 *  No Slack pings on import (historical data, not new submissions). */
export async function bulkImportOnboardingAction(
  rows: Array<{
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
  }>,
  opts?: {
    /** Approval step: report what WOULD happen (inserted/updated) without
     *  writing; the view confirms, then calls again for real. */
    dryRun?: boolean;
  },
): Promise<Result<{ inserted: number; updated: number }>> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const access = await resolveAccess();
  if (access.level !== "reviewer" && access.level !== "coach") {
    return { ok: false, error: "You do not have access to import onboarding rows." };
  }
  const clean = rows.filter((r) => r.clientName?.trim());
  if (clean.length === 0) return { ok: false, error: "No rows with a client name found in the sheet." };
  if (clean.length > 500) return { ok: false, error: "That sheet is too large (500 row max per import)." };

  // Resolve coach names -> ids once (reviewer sheets may carry a Coach column).
  const { data: coaches } = await dbAdmin().from("coaches").select("id,name");
  const coachIdByName = new Map((coaches ?? []).map((c: { id: string; name: string }) => [c.name.toLowerCase(), c.id]));
  const resolveCoach = (name?: string | null): string | null => {
    if (access.level === "coach") return access.coachId; // always their own
    if (!name) return null;
    const key = name.trim().toLowerCase();
    if (coachIdByName.has(key)) return coachIdByName.get(key)!;
    for (const [n, cid] of coachIdByName) if (n.startsWith(key) || key.startsWith(n)) return cid;
    return null;
  };

  const inserts = clean.map((r) => ({
    client_name: r.clientName.trim(),
    coach_id: resolveCoach(r.coachName),
    kahunas_url: r.kahunasUrl?.trim() || null,
    start_date: r.startDate || null,
    qna_received: r.qnaReceived ?? false,
    nutrition_plan_made: r.nutritionPlanMade ?? false,
    nutrition_feedback: r.nutritionFeedback?.trim() || null,
    nutrition_adjusted: r.nutritionAdjusted ?? false,
    workout_plan_made: r.workoutPlanMade ?? false,
    workout_feedback: r.workoutFeedback?.trim() || null,
    workout_adjusted: r.workoutAdjusted ?? false,
    loom_url: r.loomUrl?.trim() || null,
    approved: r.approved ?? false,
    sent: r.sent ?? false,
    notes: r.notes?.trim() || null,
  }));

  // SYNC semantics: rows already on the board (same client name + coach) get
  // UPDATED to the sheet's values (the master sheet wins); new clients insert.
  const { data: existing } = await dbAdmin().from("client_onboarding").select("id,client_name,coach_id");
  const idByKey = new Map(
    ((existing ?? []) as { id: string; client_name: string; coach_id: string | null }[]).map((e) => [
      `${e.client_name.toLowerCase()}:${e.coach_id ?? ""}`,
      e.id,
    ]),
  );

  const fresh: typeof inserts = [];
  const updates: { id: string; row: (typeof inserts)[number] }[] = [];
  for (const row of inserts) {
    const id = idByKey.get(`${row.client_name.toLowerCase()}:${row.coach_id ?? ""}`);
    if (id) updates.push({ id, row });
    else fresh.push(row);
  }

  // Approval step (owner's sync rule, 2026-07-11): report only, write nothing.
  if (opts?.dryRun) return { ok: true, data: { inserted: fresh.length, updated: updates.length } };

  for (const { id, row } of updates) {
    const { error } = await dbAdmin().from("client_onboarding").update(row).eq("id", id);
    if (error) {
      return { ok: false, error: /relation .* does not exist/i.test(error.message) ? NO_DB : error.message };
    }
  }
  for (let i = 0; i < fresh.length; i += 200) {
    const { error } = await dbAdmin().from("client_onboarding").insert(fresh.slice(i, i + 200));
    if (error) {
      return { ok: false, error: /relation .* does not exist/i.test(error.message) ? NO_DB : error.message };
    }
  }
  revalidatePath("/onboarding");
  return { ok: true, data: { inserted: fresh.length, updated: updates.length } };
}

/** Remove a row (reviewer only; mis-adds happen). */
export async function deleteOnboardingAction(id: string): Promise<Result<null>> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const access = await resolveAccess();
  if (access.level !== "reviewer") return { ok: false, error: "Only the head coach or owner can remove rows." };
  const { error } = await dbAdmin().from("client_onboarding").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/onboarding");
  return { ok: true, data: null };
}
