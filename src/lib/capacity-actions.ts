"use server";

// E1 (FEEDBACK-V2): a coach answers the weekly capacity prompt. Coach-only,
// coach id derived from the SESSION (never posted), one row per coach per
// applicable week (upsert on coach_id + week_start). Internal data, no
// outbound path.

import { revalidatePath } from "next/cache";
import { CAPACITY_OPTIONS, capacityWeekStart, openWeekStart, weekMonday, type CapacityValue } from "@/lib/capacity";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getServerIdentity } from "@/lib/role-server";

export type CapacityResult =
  | { ok: true; week: string; slack?: boolean }
  | { ok: false; error: string };

const NO_DB =
  "Saving capacity needs the HQ datastore. Set HQ_PERSISTENCE=true with Supabase configured.";
const NEEDS_MIGRATION =
  "Saving capacity needs a one-time database migration the owner must apply (20260805000001).";
const NEEDS_V2_MIGRATION =
  "The five-band scale and notes need migration 20260808000004 (proposed, awaiting owner approval).";

export async function submitCapacityAction(
  capacity: CapacityValue,
  /** R3-1: which week the answer targets. "this"/"next" resolve to Mondays
   *  SERVER-SIDE (never a client-posted date). Default keeps the legacy
   *  attribution rule for any old callers. */
  target?: "this" | "next",
  /** R7-1: optional context note, often the most useful part. */
  note?: string,
): Promise<CapacityResult> {
  if (!(CAPACITY_OPTIONS as readonly string[]).includes(capacity)) {
    return { ok: false, error: "Pick one of the capacity options." };
  }
  const trimmedNote = (note ?? "").trim().slice(0, 500);
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const identity = await getServerIdentity();
  if (identity.role !== "coach" || !identity.linkedCoachId) {
    return { ok: false, error: "Only a coach login can answer the capacity prompt." };
  }

  const week = target ? weekMonday(target === "next" ? 1 : 0) : capacityWeekStart();
  const row: Record<string, unknown> = { coach_id: identity.linkedCoachId, week_start: week, capacity };
  if (trimmedNote) row.note = trimmedNote;
  else row.note = null;
  let { error } = await dbAdmin()
    .from("coach_capacity")
    .upsert(row, { onConflict: "coach_id,week_start" });
  if (error && (error.code === "42703" || /note/i.test(error.message)) && !trimmedNote) {
    // note column pre-migration and no note given: store the answer alone.
    ({ error } = await dbAdmin()
      .from("coach_capacity")
      .upsert({ coach_id: identity.linkedCoachId, week_start: week, capacity }, { onConflict: "coach_id,week_start" }));
  }
  if (error) {
    // NO silent fallback (owner rule): a five-band value or a note the
    // schema cannot hold is an honest error, never a quietly degraded write.
    if (error.code === "23514" || /capacity_check/i.test(error.message)) {
      return { ok: false, error: NEEDS_V2_MIGRATION };
    }
    if (error.code === "42703" || /note/i.test(error.message)) {
      return { ok: false, error: NEEDS_V2_MIGRATION };
    }
    const missing = error.code === "42P01" || /coach_capacity/i.test(error.message);
    return { ok: false, error: missing ? NEEDS_MIGRATION : error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/capacity");
  revalidatePath("/client-journey");
  revalidatePath("/coach-overview");
  revalidatePath("/daily-digest");
  return { ok: true, week };
}

/** R7-1: manager Nudge — a portal-owned notification (Slack delivery rides
 *  it) per outstanding coach. No submit-on-behalf, ever. */
export async function nudgeCapacityAction(coachIds: string[]): Promise<CapacityResult> {
  if (!Array.isArray(coachIds) || coachIds.length === 0) return { ok: false, error: "Nobody to nudge." };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const identity = await getServerIdentity();
  const manager =
    identity.realRole === "owner" ||
    identity.role === "admin" ||
    identity.role === "ops_manager" ||
    (identity.role === "coach" && identity.isHeadCoach);
  if (!manager) return { ok: false, error: "Only managers can send capacity reminders." };

  const week = openWeekStart();
  const { data: coaches } = await dbAdmin().from("coaches").select("id, name").in("id", coachIds.slice(0, 30));
  const { insertNotification } = await import("@/lib/notify");
  // R8-2: report Slack delivery honestly. slack=true only when every nudge
  // actually posted; a missing SLACK_WEBHOOK_URL is surfaced, never silent.
  let slack = true;
  for (const c of ((coaches ?? []) as { id: string; name: string }[])) {
    const res = await insertNotification({
      recipientName: c.name,
      type: "capacity_nudge",
      payload: { week },
    });
    if (!res.slack) slack = false;
  }
  revalidatePath("/capacity");
  return { ok: true, week, slack };
}
