"use server";

// In-portal check-in logging (manual rows in the check_ins table). Lets a coach
// or owner log/correct a weekly check-in from the client profile or the
// Check-ins screen, alongside the Kahunas webhook and coach-log importer.
// Internal data only, NO outbound path. Service-role dbAdmin(), gated by
// persistenceEnabled(). Manual rows use source 'manual' and upsert on
// (client_id, submitted_at, source) so re-logging the same day edits in place.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getServerIdentity } from "@/lib/role-server";
import { notifySlack, slackPingEnabled } from "@/lib/slack";

// R16-2c: MS = message sent (replaces SM + old M), M = missed.
const CODES = ["Y", "MS", "M", "F", "G", "P", "C", "N"] as const;
type Code = (typeof CODES)[number];

type Result<T = never> = { ok: boolean; error?: string; data?: T };

const OFF: Result = {
  ok: false,
  error: "Persistence is off. Logging check-ins goes live with the database.",
};
// The 'manual' source value needs migration 20260630000001 (owner-gated). Until
// applied, the check_ins source constraint rejects it (23514).
const NO_MIGRATION =
  "Logging check-ins needs a one-time database migration the owner must apply (20260630000001). It is written, not yet applied.";

const isConstraint = (error: { code?: string; message?: string } | null) =>
  error?.code === "23514" || /check_ins_source_check/i.test(error?.message ?? "");

export async function logCheckInAction(input: {
  clientId: string;
  coachId: string;
  code: Code;
  /** ISO date (the check-in week/day). Defaults handled by the caller. */
  submittedAt: string;
  weekNumber?: number | null;
  adherence?: number | null;
  /** R12-7: optional Loom link stored on the check-in row. */
  loomUrl?: string | null;
}): Promise<Result> {
  if (!input.clientId || !input.coachId) return { ok: false, error: "Client and coach are required." };
  if (!CODES.includes(input.code)) return { ok: false, error: "Pick a valid status code." };
  const loomUrl = (input.loomUrl ?? "").trim();
  if (loomUrl && !/^https:\/\//i.test(loomUrl)) {
    return { ok: false, error: "The Loom link needs to be a full https URL." };
  }
  if (!input.submittedAt) return { ok: false, error: "A check-in date is required." };
  if (!persistenceEnabled()) return OFF;

  // Scope + attribution (2026-07-11 audit): server actions are directly
  // invokable, so never trust the posted ids. The coach on the row is the
  // CLIENT'S coach from the datastore; a plain coach may only log for their
  // own roster. Owner, VA, and the head coach may log for anyone.
  const identity = await getServerIdentity();
  if (identity.role !== "coach" && identity.role !== "va" && identity.realRole !== "owner") {
    return { ok: false, error: "You do not have access to log check-ins." };
  }
  const { data: client } = await dbAdmin()
    .from("clients")
    .select("coach_id,name")
    .eq("id", input.clientId)
    .maybeSingle();
  const clientCoachId = (client?.coach_id as string | null) ?? null;
  if (!client) return { ok: false, error: "Client not found." };
  if (identity.role === "coach" && !identity.isHeadCoach && clientCoachId !== identity.linkedCoachId) {
    return { ok: false, error: "That client is not on your roster." };
  }
  // I2 config toggle (2026-08-07): flip CHECKIN_EDITS_ADMIN_ONLY="true" to
  // restrict pay-affecting check-in writes to owner/VA/head coach (FEEDBACK-V2
  // open question 7). Default off = the sheets behaviour: coaches mark their
  // own roster. The UI mirrors this via canEdit, but the action is the gate.
  if (
    process.env.CHECKIN_EDITS_ADMIN_ONLY === "true" &&
    identity.role === "coach" &&
    !identity.isHeadCoach &&
    identity.realRole !== "owner"
  ) {
    return { ok: false, error: "Check-in edits are restricted to the admin team." };
  }

  const { error } = await dbAdmin()
    .from("check_ins")
    .upsert(
      {
        client_id: input.clientId,
        coach_id: clientCoachId ?? input.coachId,
        submitted_at: new Date(input.submittedAt).toISOString(),
        code: input.code,
        week_number: input.weekNumber ?? null,
        adherence: input.adherence ?? null,
        source: "manual",
        ...(loomUrl ? { loom_url: loomUrl } : {}),
      },
      { onConflict: "client_id,submitted_at,source" },
    );
  if (error) return { ok: false, error: isConstraint(error) ? NO_MIGRATION : error.message };

  // R2-6a: team ping on a logged check-in (client, coach, code, week).
  // Best-effort and toggleable via SLACK_PING_CHECKIN=false; a Slack outage
  // never fails the log. Fires only for in-portal logs (this action), never
  // for the bulk importer or the Kahunas webhook.
  try {
    if (slackPingEnabled("checkin")) {
      let coachName = "their coach";
      const cid = clientCoachId ?? input.coachId;
      if (cid) {
        const { data: co } = await dbAdmin().from("coaches").select("name").eq("id", cid).maybeSingle();
        if (co?.name) coachName = co.name;
      }
      const clientName = (client.name as string | null) ?? "A client";
      await notifySlack(
        `:memo: Check-in logged: *${clientName}* — ${input.code} (wk of ${input.submittedAt}) by ${coachName}.`,
      );
    }
  } catch {
    /* best-effort */
  }

  revalidatePath("/check-ins");
  revalidatePath("/dashboard");
  revalidatePath(`/my-clients/${input.clientId}`);
  revalidatePath(`/client-database/${input.clientId}`);
  return { ok: true };
}

// R13-4 (Dan's Loom 2026-09-05, 0:08): "when you pop someone in, there's no
// way to delete them". Clears every check-in row for the client inside the
// given ISO week (Monday-start), so the grid cell goes back to empty. Same
// gates as logging; the delete is announced on Slack like a log so the trail
// stays honest.
export async function clearCheckInWeekAction(input: {
  clientId: string;
  /** ISO date of the week's Monday (the grid's cell key). */
  weekStart: string;
}): Promise<Result<{ removed: number }>> {
  if (!input.clientId || !input.weekStart) return { ok: false, error: "Client and week are required." };
  const start = new Date(input.weekStart);
  if (Number.isNaN(start.getTime())) return { ok: false, error: "That week is not a valid date." };
  if (!persistenceEnabled()) return OFF;

  const identity = await getServerIdentity();
  if (identity.role !== "coach" && identity.role !== "va" && identity.realRole !== "owner") {
    return { ok: false, error: "You do not have access to edit check-ins." };
  }
  const { data: client } = await dbAdmin()
    .from("clients")
    .select("coach_id,name")
    .eq("id", input.clientId)
    .maybeSingle();
  if (!client) return { ok: false, error: "Client not found." };
  const clientCoachId = (client.coach_id as string | null) ?? null;
  if (identity.role === "coach" && !identity.isHeadCoach && clientCoachId !== identity.linkedCoachId) {
    return { ok: false, error: "That client is not on your roster." };
  }
  if (
    process.env.CHECKIN_EDITS_ADMIN_ONLY === "true" &&
    identity.role === "coach" &&
    !identity.isHeadCoach &&
    identity.realRole !== "owner"
  ) {
    return { ok: false, error: "Check-in edits are restricted to the admin team." };
  }

  const end = new Date(start.getTime() + 7 * 86_400_000);
  const { data: removed, error } = await dbAdmin()
    .from("check_ins")
    .delete()
    .eq("client_id", input.clientId)
    .gte("submitted_at", start.toISOString())
    .lt("submitted_at", end.toISOString())
    .select("id");
  if (error) return { ok: false, error: error.message };

  try {
    if (slackPingEnabled("checkin")) {
      const clientName = (client.name as string | null) ?? "A client";
      await notifySlack(
        `:wastebasket: Check-in cleared: *${clientName}* (wk of ${input.weekStart}, ${removed?.length ?? 0} row${(removed?.length ?? 0) === 1 ? "" : "s"}) by ${identity.role}.`,
      );
    }
  } catch {
    /* best-effort */
  }

  revalidatePath("/check-ins");
  revalidatePath("/dashboard");
  revalidatePath(`/my-clients/${input.clientId}`);
  revalidatePath(`/client-database/${input.clientId}`);
  return { ok: true, data: { removed: removed?.length ?? 0 } };
}

// R16-2f: per-cell coach note (right-click on the grid). Stored on the
// client's check_ins row(s) for that ISO week; if the week has no row yet a
// code-less 'manual' row carries the note so it survives until a code is
// picked (logCheckInAction upserts without touching `note`). An empty note
// clears it, and a note-only row is deleted rather than left as a ghost.
// Same roster scoping as logging. NOT behind CHECKIN_EDITS_ADMIN_ONLY: notes
// do not touch pay. Needs migration 20260921000003 (check_ins.note).
const NOTE_MAX = 280;
const NO_NOTE_COLUMN =
  "Cell notes need a one-time database migration the owner must apply (20260921000003). It is written, not yet applied.";
const isMissingColumn = (error: { code?: string; message?: string } | null) =>
  error?.code === "42703" || /column .*note/i.test(error?.message ?? "");

export async function setCheckInNoteAction(input: {
  clientId: string;
  coachId: string | null;
  /** ISO date of the week's Monday (the grid's cell key). */
  weekStart: string;
  note: string;
}): Promise<Result> {
  if (!input.clientId || !input.weekStart) return { ok: false, error: "Client and week are required." };
  const start = new Date(input.weekStart);
  if (Number.isNaN(start.getTime())) return { ok: false, error: "That week is not a valid date." };
  const note = (input.note ?? "").trim();
  if (note.length > NOTE_MAX) return { ok: false, error: `Notes are capped at ${NOTE_MAX} characters.` };
  if (!persistenceEnabled()) return OFF;

  const identity = await getServerIdentity();
  if (identity.role !== "coach" && identity.role !== "va" && identity.realRole !== "owner") {
    return { ok: false, error: "You do not have access to edit check-ins." };
  }
  const { data: client } = await dbAdmin().from("clients").select("coach_id").eq("id", input.clientId).maybeSingle();
  if (!client) return { ok: false, error: "Client not found." };
  const clientCoachId = (client.coach_id as string | null) ?? null;
  if (identity.role === "coach" && !identity.isHeadCoach && clientCoachId !== identity.linkedCoachId) {
    return { ok: false, error: "That client is not on your roster." };
  }

  const end = new Date(start.getTime() + 7 * 86_400_000);
  const week = dbAdmin()
    .from("check_ins")
    .select("id,code")
    .eq("client_id", input.clientId)
    .gte("submitted_at", start.toISOString())
    .lt("submitted_at", end.toISOString());
  const { data: rows, error: readErr } = await week;
  if (readErr) return { ok: false, error: readErr.message };

  if (!rows || rows.length === 0) {
    if (!note) return { ok: true };
    const coachId = clientCoachId ?? input.coachId;
    if (!coachId) return { ok: false, error: "This client has no coach assigned, so a note can't be attributed." };
    const { error } = await dbAdmin().from("check_ins").insert({
      client_id: input.clientId,
      coach_id: coachId,
      submitted_at: start.toISOString(),
      code: null,
      source: "manual",
      note,
    });
    if (error) return { ok: false, error: isMissingColumn(error) ? NO_NOTE_COLUMN : isConstraint(error) ? NO_MIGRATION : error.message };
  } else {
    const ids = rows.map((r) => r.id as string);
    const { error } = await dbAdmin().from("check_ins").update({ note: note || null }).in("id", ids);
    if (error) return { ok: false, error: isMissingColumn(error) ? NO_NOTE_COLUMN : error.message };
    if (!note) {
      // A row that only ever carried the note has no reason to stay.
      const ghosts = rows.filter((r) => r.code === null).map((r) => r.id as string);
      if (ghosts.length) await dbAdmin().from("check_ins").delete().in("id", ghosts).is("code", null);
    }
  }

  revalidatePath("/check-ins");
  revalidatePath(`/my-clients/${input.clientId}`);
  revalidatePath(`/client-database/${input.clientId}`);
  return { ok: true };
}
