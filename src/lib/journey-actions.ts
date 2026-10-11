"use server";

// Journey Tracker actions (B2-B4, FEEDBACK-V2).
//
// - assignJourneyClientAction: the Unassigned-card Assign button. Reuses the
//   owner-only assignCoachAction write, then pings the TEAM Slack channel
//   (B4) with client name, start date and plan. Slack here is team-internal:
//   the NO-CONTACT rule is about clients/leads, and this path sends nothing
//   to either (see src/lib/slack.ts; assertOutreachAllowed still guards every
//   client-facing send elsewhere).
// - setClientStartDateAction: the editable start date on Unassigned cards
//   (clients start Mondays; the UI nudges but does not enforce). HQ-owned
//   write like the rate editor. CAVEAT: the nightly GHL sync re-projects
//   start_date, so on synced brands an edit here should be mirrored in GHL
//   until start-date ownership is decided (flagged to the owner).

import { revalidatePath } from "next/cache";
import { assignCoachAction, type AssignResult } from "@/lib/coach-assign-actions";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getClientsData, getCoachNamesData } from "@/lib/data";
import { createTemplateTaskAction } from "@/lib/tasks-actions";
import { getServerIdentity } from "@/lib/role-server";
import { NEEDS_START_DATE, effectiveStartDate } from "@/lib/client-start-date";
import { canEditStartDate } from "@/lib/access-policy";
import { notifySlack, slackPingEnabled } from "@/lib/slack";
import { insertNotification } from "@/lib/notify";

export async function assignJourneyClientAction(
  clientId: string,
  coachId: string,
): Promise<AssignResult> {
  if (!coachId) return { ok: false, error: "Pick a coach first." };

  // R19-2d: read who holds them BEFORE the write, because that is what decides
  // whether this is a new client landing or an existing one changing hands.
  // Doing it after would make every assignment look like a transfer.
  const before = await dbAdmin().from("clients").select("coach_id").eq("id", clientId).maybeSingle();
  const fromCoachId = (before.data as { coach_id?: string | null } | null)?.coach_id ?? null;
  const isTransfer = !!fromCoachId && fromCoachId !== coachId;

  const res = await assignCoachAction(clientId, coachId);
  if (!res.ok) return res;

  // B4/R6-2 + R6-1: best-effort side effects; neither ever fails the
  // assignment. Slack ping (Dan's NEW CLIENT ALERT format) + the mockup's
  // auto-created Onboarding handover task on the coach's board.
  try {
    const [clients, coachNames] = await Promise.all([getClientsData(), getCoachNamesData()]);
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      const coachName = coachNames[coachId] ?? "a coach";
      const fromCoachName = fromCoachId ? (coachNames[fromCoachId] ?? "their previous coach") : null;
      // R2-6 toggle; R6-2 format. Package is not a projected GHL field yet,
      // so the line renders only when the data exists (never guessed).
      //
      // R19-2d: a TRANSFER gets its own message. Announcing an existing client
      // as a NEW CLIENT ALERT tells the team someone just signed up when they
      // have been coaching for months, and it hides the fact that a roster
      // changed hands, which is the thing worth knowing.
      if (slackPingEnabled("assign")) {
        await notifySlack(
          isTransfer
            ? [
                "*CLIENT TRANSFER*",
                `Name: ${client.name}`,
                `From: ${fromCoachName}`,
                `To: ${coachName}`,
                `Start Date: ${effectiveStartDate(client) ?? NEEDS_START_DATE}`,
                `Check Ins: ${client.plan.toLowerCase()}`,
              ].join("\n")
            : [
                "*NEW CLIENT ALERT*",
                `Name: ${client.name}`,
                `Start Date: ${client.startDate}`,
                `Coach: ${coachName}`,
                `Check Ins: ${client.plan.toLowerCase()}`,
              ].join("\n"),
        );
      }
      // R6-5: dashboard-owned notification for the coach.
      await insertNotification({
        recipientName: coachName,
        type: isTransfer ? "client_transferred" : "client_assigned",
        payload: {
          client: client.name,
          startDate: effectiveStartDate(client) ?? NEEDS_START_DATE,
          ...(isTransfer && fromCoachName ? { fromCoach: fromCoachName } : {}),
        },
      });
      // R6-1 §5: assigning auto-creates a task for the coach. R19-2d: a
      // transfer creates a HANDOVER, not an onboarding. The client's intake
      // happened long ago; what the new coach needs is where they are up to.
      await createTemplateTaskAction(
        isTransfer
          ? {
              template: "handover",
              fields: {
                client: client.name,
                fromCoach: fromCoachName ?? "",
                startDate: effectiveStartDate(client) ?? NEEDS_START_DATE,
                plan: client.plan === "Fortnightly" ? "Fortnightly" : "Weekly",
                notes: `Auto-created when ${client.name} moved from ${fromCoachName} to ${coachName}.`,
              },
              assigneeName: coachName,
            }
          : {
              template: "onboard",
              fields: {
                client: client.name,
                startDate: effectiveStartDate(client) ?? NEEDS_START_DATE,
                plan: client.plan === "Fortnightly" ? "Fortnightly" : "Weekly",
                notes: "Auto-created on assignment from the Journey Tracker.",
              },
              assigneeName: coachName,
            },
      );
    }
  } catch {
    /* best-effort */
  }

  revalidatePath("/client-journey");
  return res;
}

export type StartDateResult = { ok: true } | { ok: false; error: string };

const NEEDS_START_DATE_MIGRATION =
  "Editing a start date needs a one-time database migration the owner must apply (20260925000001). It is written, not yet applied.";

const NO_DB =
  "Editing a start date needs the HQ datastore. Set HQ_PERSISTENCE=true with Supabase configured.";

/** Owner-only start-date edit (B2). Same real-role rule as the rate editor:
 *  an owner impersonating a coach can edit, a real coach/sales/va session
 *  calling directly cannot. */
export async function setClientStartDateAction(
  clientId: string,
  /** ISO date, or null to clear the override and go back to the GHL value. */
  startDate: string | null,
): Promise<StartDateResult> {
  if (!clientId) return { ok: false, error: "clientId required" };
  if (startDate !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(Date.parse(startDate)))) {
    return { ok: false, error: "Enter a valid date (YYYY-MM-DD)." };
  }
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const identity = await getServerIdentity();
  if (!canEditStartDate(identity)) {
    return { ok: false, error: "You don't have access to edit start dates." };
  }

  // R17-1b: write the OVERRIDE, not start_date. The nightly sync owns
  // start_date and overwrote every correction made here; the override is the
  // portal's own column and effectiveStartDate() makes it win on every read.
  // Never mirrored to GHL: its workflows key off Start Date (NO CONTACT).
  const before = await dbAdmin()
    .from("clients")
    .select("name,start_date,start_date_override,ghl_contact_id")
    .eq("id", clientId)
    .maybeSingle();
  const { error } = await dbAdmin()
    .from("clients")
    .update({ start_date_override: startDate })
    .eq("id", clientId);
  if (error) {
    const missing = error.code === "42703" || /start_date_override/i.test(error.message);
    return { ok: false, error: missing ? NEEDS_START_DATE_MIGRATION : error.message };
  }

  // Audit row: who changed a date that drives pay-adjacent maths, and from what.
  try {
    const prev = before.data as { name?: string; start_date?: string | null; start_date_override?: string | null; ghl_contact_id?: string | null } | null;
    await dbAdmin().from("sync_events").insert({
      source: "manual",
      entity: "client",
      ghl_id: prev?.ghl_contact_id ?? null,
      action: "start_date_override_set",
      payload: {
        client_id: clientId,
        from: prev?.start_date_override ?? null,
        to: startDate,
        ghl_start_date: prev?.start_date ?? null,
        by: identity.role,
      },
    });
  } catch {
    /* best-effort: the audit row must never fail the edit */
  }

  // Start date feeds week brackets, tenure, renewals and revenue sampling.
  for (const p of ["/client-journey", "/client-database", `/client-database/${clientId}`, "/dashboard", "/renewals"]) {
    revalidatePath(p);
  }
  return { ok: true };
}
