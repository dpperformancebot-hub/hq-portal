"use server";

// R4-1: pause board reads/writes (client_pauses, migration 20260807000002).
// Writes: owner / VA / head coach. Reads: those plus a plain coach scoped to
// their own roster. Kahunas checkboxes are manual tracking only — the portal
// never talks to Kahunas (double-entry awareness from the sheet).

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { fetchAllRows } from "@/lib/db/fetch-all";
import { getServerIdentity, type ServerIdentity } from "@/lib/role-server";
import { isOpsRole } from "@/lib/navigation";

export type PauseRow = {
  id: string;
  clientId: string;
  clientName: string;
  coachName: string;
  pauseStart: string;
  pauseEnd: string | null;
  cancelledInKahunas: boolean;
  reactivatedInKahunas: boolean;
  /** R12-9: true when this row was DERIVED from the client's Paused status
   *  with no client_pauses record behind it, so the board can ask for dates
   *  instead of hiding the client entirely. Such rows have no real id. */
  derived?: boolean;
};

type Result = { ok: boolean; error?: string };
/** R16-3: create hands back the real row id so the board can swap it in for
 *  the derived placeholder and keep editing the same record. */
export type CreateResult = Result & { id?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_SAVED_YET = "This pause has not been saved yet. Set the pause start date first.";

const NO_DB = "The pause board needs the HQ datastore. Set HQ_PERSISTENCE=true with Supabase configured.";
const NEEDS_MIGRATION =
  "The pause board needs a one-time database migration the owner must apply (20260807000002).";

const missingTable = (error: { code?: string; message?: string } | null) =>
  error?.code === "42P01" || /client_pauses/i.test(error?.message ?? "");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function canWrite(identity: ServerIdentity): Promise<boolean> {
  return identity.realRole === "owner" || isOpsRole(identity.role) || (identity.role === "coach" && identity.isHeadCoach);
}

export async function createPauseAction(input: {
  clientId: string;
  pauseStart: string;
  pauseEnd?: string | null;
}): Promise<CreateResult> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  if (!input.clientId) return { ok: false, error: "Pick a client." };
  if (!ISO_DATE.test(input.pauseStart)) return { ok: false, error: "Pause start must be a date." };
  if (input.pauseEnd && !ISO_DATE.test(input.pauseEnd)) return { ok: false, error: "Pause end must be a date." };
  const identity = await getServerIdentity();
  if (!(await canWrite(identity))) return { ok: false, error: "Only owner, VA, or the head coach edit pauses." };

  const { data, error } = await dbAdmin()
    .from("client_pauses")
    .insert({
      client_id: input.clientId,
      pause_start: input.pauseStart,
      pause_end: input.pauseEnd || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: missingTable(error) ? NEEDS_MIGRATION : error.message };
  revalidatePath("/pauses");
  revalidatePath("/dashboard");
  return { ok: true, id: (data as { id?: string } | null)?.id };
}

export async function updatePauseAction(input: {
  id: string;
  pauseStart?: string;
  pauseEnd?: string | null;
  cancelledInKahunas?: boolean;
  reactivatedInKahunas?: boolean;
}): Promise<Result> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  if (!input.id) return { ok: false, error: "Missing pause row." };
  // R16-3 (b): a derived-/local- placeholder is not a row. Refuse loudly
  // instead of letting .eq("id", ...) match nothing and report success.
  if (!UUID.test(input.id)) return { ok: false, error: NOT_SAVED_YET };
  if (input.pauseStart !== undefined && !ISO_DATE.test(input.pauseStart)) {
    return { ok: false, error: "Pause start must be a date." };
  }
  if (input.pauseEnd !== undefined && input.pauseEnd !== null && input.pauseEnd !== "" && !ISO_DATE.test(input.pauseEnd)) {
    return { ok: false, error: "Pause end must be a date." };
  }
  const identity = await getServerIdentity();
  if (!(await canWrite(identity))) return { ok: false, error: "Only owner, VA, or the head coach edit pauses." };

  const patch: Record<string, unknown> = {};
  if (input.pauseStart !== undefined) patch.pause_start = input.pauseStart;
  if (input.pauseEnd !== undefined) patch.pause_end = input.pauseEnd || null;
  if (input.cancelledInKahunas !== undefined) patch.cancelled_in_kahunas = input.cancelledInKahunas;
  if (input.reactivatedInKahunas !== undefined) patch.reactivated_in_kahunas = input.reactivatedInKahunas;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { data, error } = await dbAdmin().from("client_pauses").update(patch).eq("id", input.id).select("id");
  if (error) return { ok: false, error: missingTable(error) ? NEEDS_MIGRATION : error.message };
  // R16-3: an update that touched no row is a failure the user must see.
  if (Array.isArray(data) && data.length === 0) return { ok: false, error: "That pause row no longer exists. Refresh the page." };
  revalidatePath("/pauses");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Pause rows enriched with client + coach names, newest start first. Plain
 *  coach = own roster only. Empty pre-migration / persistence off. */
export async function listPauses(): Promise<PauseRow[]> {
  if (!persistenceEnabled()) return [];
  const identity = await getServerIdentity();
  // SEC-AUDIT (2026-09-06): non-coach roles outside the ops set (sales,
  // ambassador_mgr) previously received every pause row. Plain coach stays
  // roster-scoped below; everyone else must be owner / ops / head coach.
  if (identity.role !== "coach" && !(await canWrite(identity))) return [];
  const db = dbAdmin();
  const [{ data: rows, error }, { data: clients }, { data: coaches }] = await Promise.all([
    db
      .from("client_pauses")
      .select("id, client_id, pause_start, pause_end, cancelled_in_kahunas, reactivated_in_kahunas")
      .order("pause_start", { ascending: false })
      .limit(300),
    fetchAllRows<{ id: string; name: string; coach_id: string | null; status: string }>(
      (from, to) => db.from("clients").select("id, name, coach_id, status").order("id").range(from, to),
      { label: "pauses: clients" },
    ).then((data) => ({ data })),
    fetchAllRows<{ id: string; name: string }>(
      (from, to) => db.from("coaches").select("id, name").order("id").range(from, to),
      { label: "pauses: coaches" },
    ).then((data) => ({ data })),
  ]);
  if (error || !rows) return [];
  const clientById = new Map(
    ((clients ?? []) as { id: string; name: string; coach_id: string | null; status: string }[]).map((c) => [c.id, c]),
  );
  const coachName = new Map(((coaches ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  // R17-2a: an open pause belongs to a client who is actually paused RIGHT
  // NOW. Before this, a client_pauses row outlived the pause and the board
  // kept showing people who had come back or cancelled. Audited 2026-09-25:
  // zero stale rows existed at the time, so this is defensive, but it is the
  // difference between "cannot happen" and "did not happen yet".
  let list: PauseRow[] = (rows as {
    id: string;
    client_id: string;
    pause_start: string;
    pause_end: string | null;
    cancelled_in_kahunas: boolean;
    reactivated_in_kahunas: boolean;
  }[]).map((r) => {
    const client = clientById.get(r.client_id);
    return {
      id: r.id,
      clientId: r.client_id,
      clientName: client?.name ?? "Unknown",
      coachName: client?.coach_id ? coachName.get(client.coach_id) ?? "Unassigned" : "Unassigned",
      pauseStart: r.pause_start,
      pauseEnd: r.pause_end,
      cancelledInKahunas: r.cancelled_in_kahunas,
      reactivatedInKahunas: r.reactivated_in_kahunas,
    };
  });

  // R12-9 (Dan: "Pauses shows nothing"): the board read ONLY client_pauses,
  // so a client paused in GHL with no pause record was invisible. Union those
  // in as derived rows (no dates yet) so the screen reflects reality and the
  // team can fill the dates in.
  const haveRow = new Set(list.map((r) => r.clientId));
  for (const c of clientById.values()) {
    if (c.status !== "paused" || haveRow.has(c.id)) continue;
    list.push({
      id: `derived-${c.id}`,
      clientId: c.id,
      clientName: c.name,
      coachName: c.coach_id ? coachName.get(c.coach_id) ?? "Unassigned" : "Unassigned",
      pauseStart: "",
      pauseEnd: null,
      cancelledInKahunas: false,
      reactivatedInKahunas: false,
      derived: true,
    });
  }

  // Drop any record whose client is no longer paused: that pause is history.
  list = list.filter((r) => clientById.get(r.clientId)?.status === "paused");

  if (identity.role === "coach" && !identity.isHeadCoach) {
    if (!identity.linkedCoachId) return [];
    const ownIds = new Set(
      ((clients ?? []) as { id: string; coach_id: string | null }[])
        .filter((c) => c.coach_id === identity.linkedCoachId)
        .map((c) => c.id),
    );
    list = list.filter((r) => ownIds.has(r.clientId));
  }
  return list;
}

/** R17-2b: close an open pause without losing the history. Sets pause_end to
 *  today; the row stays, and the client drops off the board once GHL moves
 *  their Status off Paused (the board only lists currently-paused clients). */
export async function endPauseAction(id: string): Promise<Result> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  if (!UUID.test(id)) return { ok: false, error: NOT_SAVED_YET };
  const identity = await getServerIdentity();
  if (!(await canWrite(identity))) return { ok: false, error: "Only owner, VA, or the head coach edit pauses." };
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await dbAdmin().from("client_pauses").update({ pause_end: today }).eq("id", id).select("id");
  if (error) return { ok: false, error: missingTable(error) ? NEEDS_MIGRATION : error.message };
  if (Array.isArray(data) && data.length === 0) return { ok: false, error: "That pause row no longer exists. Refresh the page." };
  revalidatePath("/pauses");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** R17-2b: remove a pause entered by mistake. DESTRUCTIVE and deliberately
 *  narrow: one row, by id, only for a caller who may write pauses, and the
 *  row is copied into sync_events first so the deletion is recoverable from
 *  the audit trail. "End pause" is the right tool for a pause that really
 *  happened; this is only for a wrong entry. */
export async function deletePauseAction(id: string): Promise<Result> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  if (!UUID.test(id)) return { ok: false, error: NOT_SAVED_YET };
  const identity = await getServerIdentity();
  if (!(await canWrite(identity))) return { ok: false, error: "Only owner, VA, or the head coach edit pauses." };

  const { data: before } = await dbAdmin()
    .from("client_pauses")
    .select("id,client_id,pause_start,pause_end,cancelled_in_kahunas,reactivated_in_kahunas")
    .eq("id", id)
    .maybeSingle();
  if (!before) return { ok: false, error: "That pause row no longer exists. Refresh the page." };

  const { data, error } = await dbAdmin().from("client_pauses").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: missingTable(error) ? NEEDS_MIGRATION : error.message };
  if (Array.isArray(data) && data.length === 0) return { ok: false, error: "Nothing was deleted. Refresh the page." };

  try {
    await dbAdmin().from("sync_events").insert({
      source: "manual",
      entity: "client",
      ghl_id: null,
      action: "pause_record_deleted",
      payload: { deleted_row: before, by: identity.role },
    });
  } catch {
    /* best-effort: the audit row must never fail the delete it is recording */
  }
  revalidatePath("/pauses");
  revalidatePath("/dashboard");
  return { ok: true };
}
