"use server";

// R9-2: inline add/edit on the check-in card. Two writes:
//   1. upsertCheckInSummaryAction — attach or correct the Loom summary /
//      action items / coach notes / Loom URL on a specific check-in, straight
//      from the client profile (no more round-trip through the Loom tool, no
//      insert-only dead end).
//   2. updateCheckInCodeAction — correct one historical check-in row's status
//      code in place, same permission gates as logCheckInAction.
// Internal data only, NO outbound path. Server re-derives scope; posted ids
// are never trusted.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getServerIdentity } from "@/lib/role-server";
import { canAccessClient } from "@/lib/check-in-summaries";

type Result = { ok: true } | { ok: false; error: string };

const OFF = "Persistence is off. Editing check-ins goes live with the database.";
const CODES = ["Y", "MS", "M", "F", "G", "P", "C", "N"] as const; // R16-2c

const revalidateClientPages = () => {
  revalidatePath("/my-clients", "layout");
  revalidatePath("/client-database", "layout");
  revalidatePath("/check-ins");
};

/** Add or edit the summary block riding one check-in. At least one field must
 *  carry content; a plain coach can only touch their own roster. */
export async function upsertCheckInSummaryAction(input: {
  /** Existing summary row to edit; omit to create. */
  id?: string | null;
  clientId: string;
  weekNumber: number | null;
  loomUrl: string;
  summary: string;
  actionItems: string;
  coachNotes: string;
}): Promise<Result> {
  if (!persistenceEnabled()) return { ok: false, error: OFF };
  const identity = await getServerIdentity();
  if (identity.role !== "coach" && identity.role !== "va" && identity.realRole !== "owner") {
    return { ok: false, error: "You do not have access to edit check-ins." };
  }
  if (!input.clientId) return { ok: false, error: "Client is required." };
  if (!(await canAccessClient(input.clientId, identity))) {
    return { ok: false, error: "That client is not on your roster." };
  }
  const loomUrl = input.loomUrl.trim();
  const summary = input.summary.trim();
  const actionItems = input.actionItems.trim();
  const coachNotes = input.coachNotes.trim();
  if (!loomUrl && !summary && !actionItems && !coachNotes) {
    return { ok: false, error: "Add something first: a summary, notes, action items, or a Loom link." };
  }
  if (loomUrl && !/^https?:\/\//i.test(loomUrl)) {
    return { ok: false, error: "The Loom link needs to be a full URL (https://...)." };
  }

  const db = dbAdmin();
  if (input.id) {
    // Edit in place. The row must belong to this client (no cross-client
    // writes via a guessed id).
    const { data: row, error: rowErr } = await db
      .from("check_in_summaries")
      .select("id, client_id")
      .eq("id", input.id)
      .maybeSingle();
    if (rowErr) return { ok: false, error: rowErr.message };
    if (!row || (row.client_id as string | null) !== input.clientId) {
      return { ok: false, error: "That summary no longer exists." };
    }
    const { error } = await db
      .from("check_in_summaries")
      .update({ loom_url: loomUrl || null, summary, action_items: actionItems, coach_notes: coachNotes })
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: client } = await db
      .from("clients")
      .select("coach_id")
      .eq("id", input.clientId)
      .maybeSingle();
    const { error } = await db.from("check_in_summaries").insert({
      client_id: input.clientId,
      coach_id: (client?.coach_id as string | null) ?? null,
      week_number: input.weekNumber,
      loom_url: loomUrl || null,
      // Manual attach: there is no transcript (that column is for the Loom
      // tool's AI path). Empty string keeps the NOT NULL constraint honest.
      transcript: "",
      summary,
      action_items: actionItems,
      coach_notes: coachNotes,
    });
    if (error) {
      const missing = error.code === "42P01" || /check_in_summaries/i.test(error.message);
      return {
        ok: false,
        error: missing
          ? "Saving needs a one-time database migration the owner must apply (20260710000001)."
          : error.message,
      };
    }
  }
  revalidateClientPages();
  return { ok: true };
}

/** Correct one existing check-in row's status code, in place. Mirrors
 *  logCheckInAction's gates: coach = own roster, owner/VA/head coach = anyone,
 *  CHECKIN_EDITS_ADMIN_ONLY restricts plain coaches when flipped. */
export async function updateCheckInCodeAction(input: { checkInId: string; code: string }): Promise<Result> {
  if (!persistenceEnabled()) return { ok: false, error: OFF };
  if (!(CODES as readonly string[]).includes(input.code)) {
    return { ok: false, error: "Pick a valid status code." };
  }
  const identity = await getServerIdentity();
  if (identity.role !== "coach" && identity.role !== "va" && identity.realRole !== "owner") {
    return { ok: false, error: "You do not have access to edit check-ins." };
  }
  if (
    process.env.CHECKIN_EDITS_ADMIN_ONLY === "true" &&
    identity.role === "coach" &&
    !identity.isHeadCoach &&
    identity.realRole !== "owner"
  ) {
    return { ok: false, error: "Check-in edits are restricted to the admin team." };
  }

  const db = dbAdmin();
  const { data: row, error: rowErr } = await db
    .from("check_ins")
    .select("id, client_id")
    .eq("id", input.checkInId)
    .maybeSingle();
  if (rowErr) return { ok: false, error: rowErr.message };
  if (!row) return { ok: false, error: "That check-in no longer exists." };
  const clientId = row.client_id as string | null;
  if (!clientId || !(await canAccessClient(clientId, identity))) {
    return { ok: false, error: "That client is not on your roster." };
  }

  const { error } = await db.from("check_ins").update({ code: input.code }).eq("id", input.checkInId);
  if (error) return { ok: false, error: error.message };
  revalidateClientPages();
  return { ok: true };
}
