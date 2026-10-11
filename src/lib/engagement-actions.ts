"use server";

// R4-3: engagement milestone reads/writes (engagement_milestones +
// clients.feedback_form_sent, migration 20260807000004). Milestone writes
// follow the check-in permission model: plain coach = own roster,
// owner/VA/head coach = anyone. Internal data, no outbound path.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getServerIdentity } from "@/lib/role-server";
import { isOpsRole } from "@/lib/navigation";

export type MilestoneRow = { clientId: string; week: number; state: "booked" | "done" };

type Result = { ok: boolean; error?: string };

const NO_DB = "The engagement tracker needs the HQ datastore. Set HQ_PERSISTENCE=true with Supabase configured.";
const NEEDS_MIGRATION =
  "The engagement tracker needs a one-time database migration the owner must apply (20260807000004).";

const missingSchema = (error: { code?: string; message?: string } | null) =>
  error?.code === "42P01" ||
  error?.code === "42703" ||
  /engagement_milestones|feedback_form_sent/i.test(error?.message ?? "");

async function scopeCheck(clientId: string): Promise<{ ok: boolean; error?: string }> {
  const identity = await getServerIdentity();
  const privileged =
    identity.realRole === "owner" || isOpsRole(identity.role) || (identity.role === "coach" && identity.isHeadCoach);
  if (privileged) return { ok: true };
  if (identity.role !== "coach") return { ok: false, error: "No access to the engagement tracker." };
  const { data: client } = await dbAdmin().from("clients").select("coach_id").eq("id", clientId).maybeSingle();
  if (!client) return { ok: false, error: "Client not found." };
  if (client.coach_id !== identity.linkedCoachId) return { ok: false, error: "That client is not on your roster." };
  return { ok: true };
}

export async function setMilestoneAction(input: {
  clientId: string;
  week: number;
  state: "booked" | "done";
}): Promise<Result> {
  if (!input.clientId || !Number.isInteger(input.week) || input.week < 1 || input.week > 200) {
    return { ok: false, error: "Invalid milestone." };
  }
  if (input.state !== "booked" && input.state !== "done") return { ok: false, error: "Invalid state." };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const scope = await scopeCheck(input.clientId);
  if (!scope.ok) return scope;

  const { error } = await dbAdmin()
    .from("engagement_milestones")
    .upsert(
      { client_id: input.clientId, week: input.week, state: input.state },
      { onConflict: "client_id,week" },
    );
  if (error) return { ok: false, error: missingSchema(error) ? NEEDS_MIGRATION : error.message };
  revalidatePath("/engagement");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function setFeedbackFormSentAction(input: { clientId: string; sent: boolean }): Promise<Result> {
  if (!input.clientId) return { ok: false, error: "Missing client." };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const scope = await scopeCheck(input.clientId);
  if (!scope.ok) return scope;

  const { error } = await dbAdmin()
    .from("clients")
    .update({ feedback_form_sent: input.sent })
    .eq("id", input.clientId);
  if (error) return { ok: false, error: missingSchema(error) ? NEEDS_MIGRATION : error.message };
  revalidatePath("/engagement");
  return { ok: true };
}

/** SEC-AUDIT P1-7 (2026-09-06): the two list reads below returned
 *  business-wide rows from a "use server" file, so any coach could call them
 *  directly and enumerate every client's milestones. Scope: privileged roles
 *  see everything; a plain coach sees ONLY client ids on their own roster;
 *  everyone else sees nothing. `null` = unrestricted. */
async function visibleClientIds(): Promise<Set<string> | null> {
  const identity = await getServerIdentity();
  const privileged =
    identity.realRole === "owner" || isOpsRole(identity.role) || (identity.role === "coach" && identity.isHeadCoach);
  if (privileged) return null;
  if (identity.role !== "coach" || !identity.linkedCoachId) return new Set();
  const { data } = await dbAdmin().from("clients").select("id").eq("coach_id", identity.linkedCoachId).limit(5000);
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
}

/** Stored milestone states the caller may see (empty pre-migration /
 *  persistence off / no roster). */
export async function listMilestones(): Promise<MilestoneRow[]> {
  if (!persistenceEnabled()) return [];
  const visible = await visibleClientIds();
  if (visible && visible.size === 0) return [];
  let q = dbAdmin().from("engagement_milestones").select("client_id, week, state").limit(5000);
  if (visible) q = q.in("client_id", [...visible]);
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as { client_id: string; week: number; state: "booked" | "done" }[]).map((r) => ({
    clientId: r.client_id,
    week: r.week,
    state: r.state,
  }));
}

/** clients.feedback_form_sent per client id the caller may see (empty
 *  pre-migration / no roster). */
export async function listFeedbackFormSent(): Promise<Set<string>> {
  if (!persistenceEnabled()) return new Set();
  const visible = await visibleClientIds();
  if (visible && visible.size === 0) return new Set();
  let q = dbAdmin().from("clients").select("id").eq("feedback_form_sent", true).limit(5000);
  if (visible) q = q.in("id", [...visible]);
  const { data, error } = await q;
  if (error || !data) return new Set();
  return new Set((data as { id: string }[]).map((r) => r.id));
}

/** R5-1: untick a milestone (delete its row). Same scope rules as setting;
 *  the row is trivially re-creatable so this is not a destructive loss. */
export async function clearMilestoneAction(input: { clientId: string; week: number }): Promise<Result> {
  if (!input.clientId || !Number.isInteger(input.week)) return { ok: false, error: "Invalid milestone." };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const scope = await scopeCheck(input.clientId);
  if (!scope.ok) return scope;

  const { error } = await dbAdmin()
    .from("engagement_milestones")
    .delete()
    .eq("client_id", input.clientId)
    .eq("week", input.week);
  if (error) return { ok: false, error: missingSchema(error) ? NEEDS_MIGRATION : error.message };
  revalidatePath("/engagement");
  revalidatePath("/client-journey");
  return { ok: true };
}
