// Read/insert layer for Loom check-in summaries (check_in_summaries table,
// migration 20260710000001). Server-only: uses the service-role dbAdmin
// client. Reads return [] when persistence is off or the table is not yet
// created (the migration is owner-gated), so screens degrade to their empty
// state.
//
// Scoping: a coach sees ONLY summaries for clients on their own roster; the
// head coach and owner/va see all. Resolved here (not in the views) via the
// same identity + roster context the screens use.

import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getCoachRosterData } from "@/lib/data";
import type { ServerIdentity } from "@/lib/role-server";

export type CheckInSummary = {
  id: string;
  clientId: string | null;
  coachId: string | null;
  weekNumber: number | null;
  loomUrl: string | null;
  summary: string;
  actionItems: string;
  coachNotes: string;
  createdAt: string;
};

// List projection deliberately EXCLUDES transcript: it is large and only
// needed server-side (audit / re-generation), never in the browser.
const LIST_SELECT = "id,client_id,coach_id,week_number,loom_url,summary,action_items,coach_notes,created_at";

type Row = {
  id: string;
  client_id: string | null;
  coach_id: string | null;
  week_number: number | null;
  loom_url: string | null;
  summary: string;
  action_items: string;
  coach_notes: string;
  created_at: string;
};

const toSummary = (r: Row): CheckInSummary => ({
  id: r.id,
  clientId: r.client_id,
  coachId: r.coach_id,
  weekNumber: r.week_number,
  loomUrl: r.loom_url,
  summary: r.summary,
  actionItems: r.action_items,
  coachNotes: r.coach_notes,
  createdAt: r.created_at,
});

/** Client ids the identity may read summaries for: null = unrestricted
 *  (owner/va/head coach), a Set = plain coach's own roster. */
async function visibleClientIds(identity: ServerIdentity): Promise<Set<string> | null> {
  if (identity.role !== "coach" || identity.isHeadCoach) return null;
  const { clients } = await getCoachRosterData(identity.linkedCoachId);
  return new Set(clients.map((c) => c.id));
}

/** True when the identity may attach a summary to this client (own roster
 *  for a plain coach; anyone visible for head coach/owner/va). */
export async function canAccessClient(clientId: string, identity: ServerIdentity): Promise<boolean> {
  const visible = await visibleClientIds(identity);
  return visible === null || visible.has(clientId);
}

/** Newest-first summaries for one client, scoped to the identity. */
export async function listClientSummaries(
  clientId: string,
  identity: ServerIdentity,
): Promise<CheckInSummary[]> {
  if (!clientId || !persistenceEnabled()) return [];
  const visible = await visibleClientIds(identity);
  if (visible && !visible.has(clientId)) return [];
  try {
    const { data, error } = await dbAdmin()
      .from("check_in_summaries")
      .select(LIST_SELECT)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return (data as Row[]).map(toSummary);
  } catch {
    // Table not present yet (migration not applied): treat as no summaries.
    return [];
  }
}

/** Every summary the identity may see (feeds the Loom Summaries history),
 *  newest first, capped so the screen stays light. */
export async function listVisibleSummaries(identity: ServerIdentity): Promise<CheckInSummary[]> {
  if (!persistenceEnabled()) return [];
  try {
    const visible = await visibleClientIds(identity);
    let q = dbAdmin()
      .from("check_in_summaries")
      .select(LIST_SELECT)
      .order("created_at", { ascending: false })
      .limit(200);
    if (visible) q = q.in("client_id", [...visible]);
    const { data, error } = await q;
    if (error || !data) return [];
    return (data as Row[]).map(toSummary);
  } catch {
    return [];
  }
}

/** Persist a generated summary. Returns the stored row, or null when
 *  persistence is off / the table is missing / the write fails (the caller
 *  still shows the generated text, it just is not saved). */
export async function saveCheckInSummary(input: {
  clientId: string;
  coachId: string | null;
  weekNumber: number | null;
  loomUrl: string | null;
  transcript: string;
  summary: string;
  actionItems: string;
  coachNotes: string;
}): Promise<CheckInSummary | null> {
  if (!persistenceEnabled()) return null;
  try {
    const { data, error } = await dbAdmin()
      .from("check_in_summaries")
      .insert({
        client_id: input.clientId,
        coach_id: input.coachId,
        week_number: input.weekNumber,
        loom_url: input.loomUrl,
        transcript: input.transcript,
        summary: input.summary,
        action_items: input.actionItems,
        coach_notes: input.coachNotes,
      })
      .select(LIST_SELECT)
      .single();
    if (error || !data) return null;
    // Submitting a Loom summary IS the check-in (owner spec, 2026-07-11):
    // log a 'Y' (submitted) row for this client so the check-in grid, coach
    // counts, and dashboards light up without a second manual step. Same
    // upsert key as in-portal manual logging, so re-submitting the same day
    // edits in place instead of duplicating. Best-effort: a failed check-in
    // log never blocks the saved summary.
    try {
      let coachId = input.coachId;
      if (!coachId) {
        const { data: client } = await dbAdmin().from("clients").select("coach_id").eq("id", input.clientId).maybeSingle();
        coachId = (client?.coach_id as string | null) ?? null;
      }
      if (coachId) {
        await dbAdmin()
          .from("check_ins")
          .upsert(
            {
              client_id: input.clientId,
              coach_id: coachId,
              // DAY precision (not the current instant): the dedupe key is
              // (client, submitted_at, source), and the manual logging path
              // writes date-only values, so a same-day re-submit must land on
              // the same timestamp to edit in place instead of duplicating.
              submitted_at: new Date(new Date().toISOString().slice(0, 10)).toISOString(),
              code: "Y",
              week_number: input.weekNumber,
              source: "manual",
            },
            { onConflict: "client_id,submitted_at,source" },
          );
      }
    } catch {
      /* summary saved; check-in log is best-effort */
    }
    return toSummary(data as Row);
  } catch {
    return null;
  }
}
