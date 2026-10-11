"use server";

// HQ-OWNED coach assignment. Unlike the GHL field write-backs in
// src/lib/writeback.ts (gated until M5), the client -> coach link lives in the
// HQ's own Supabase row (clients.coach_id). It is HQ source-of-truth data, so
// it is written directly here and never gated behind OUTREACH_ENABLED: nothing
// leaves the HQ and no one is contacted.
//
// The optional GHL mirror (PUT the contact's "Assigned Coach" custom field)
// stays in writeback.assignCoach and stays gated, because a GHL field write
// can trigger GHL-side workflows that contact people.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getClientsData } from "@/lib/data";
import { getServerIdentity } from "@/lib/role-server";
import { canAssignClients } from "@/lib/access-policy";
import type { Client } from "@/lib/seed/types";

export type AssignResult = { ok: true; count: number } | { ok: false; error: string };

const NO_DB =
  "Coach assignment needs the HQ datastore. Set HQ_PERSISTENCE=true with Supabase configured.";
const NOT_ALLOWED = "You don't have access to assign clients.";

/** Write gate (audit 2026-07-02). The rule itself lives in access-policy so
 *  this action, the Journey Tracker page and the Coach Overview modal cannot
 *  drift apart (R16-4b); it is keyed on the REAL role for the owner, so an
 *  owner impersonating a coach can still assign while an actual coach/sales/
 *  va session calling the action directly cannot. */
async function assertOwner(): Promise<AssignResult | null> {
  const identity = await getServerIdentity();
  return canAssignClients(identity) ? null : { ok: false, error: NOT_ALLOWED };
}

/** Routes whose render depends on the client -> coach link. Broad on purpose:
 *  assignment changes rosters, scorecards, capacity, pay and renewals. */
function revalidateAssignmentPaths(clientId?: string): void {
  for (const p of [
    "/client-database",
    "/coach-overview",
    "/coach-performance",
    "/dashboard",
    "/my-clients",
    "/my-pay",
    "/financials",
    "/renewals",
  ]) {
    revalidatePath(p);
  }
  if (clientId) revalidatePath(`/client-database/${clientId}`);
}

/** R19-1: audit every coach_id change.
 *
 *  This action used to write clients.coach_id with no audit trail at all,
 *  which is why recovering the 42 assignments the 1000-row read cap nulled on
 *  2026-09-28 meant reconstructing them from two accidental side effects (the
 *  coach notification and the auto-created onboarding task). A coach change
 *  moves rosters, capacity and pay, so it gets a row of its own from here on.
 *
 *  Best-effort by design: the audit insert must never fail or half-complete an
 *  assignment the caller was allowed to make. A missing audit row is a gap in
 *  the record; a failed assignment is a coach who never gets told. */
async function auditCoachChange(
  before: { id: string; coach_id: string | null }[],
  coachId: string | null,
  by: string,
): Promise<void> {
  const changed = before.filter((b) => (b.coach_id ?? null) !== coachId);
  if (changed.length === 0) return; // re-assigning to the same coach writes nothing
  try {
    await dbAdmin()
      .from("sync_events")
      .insert(
        changed.map((b) => ({
          source: "manual",
          entity: "client",
          ghl_id: null,
          action: coachId === null ? "coach_unassigned" : "coach_assigned",
          payload: { client_id: b.id, from: b.coach_id ?? null, to: coachId, by },
        })),
      );
  } catch {
    /* best-effort: never fail the assignment */
  }
}

/** Assign (or clear, with null) one client's coach. */
export async function assignCoachAction(
  clientId: string,
  coachId: string | null,
): Promise<AssignResult> {
  if (!clientId) return { ok: false, error: "clientId required" };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const denied = await assertOwner();
  if (denied) return denied;

  const { data: before } = await dbAdmin()
    .from("clients")
    .select("id,coach_id")
    .eq("id", clientId);

  const { error } = await dbAdmin()
    .from("clients")
    .update({ coach_id: coachId })
    .eq("id", clientId);
  if (error) return { ok: false, error: error.message };

  const identity = await getServerIdentity();
  await auditCoachChange((before ?? []) as { id: string; coach_id: string | null }[], coachId, identity.role);

  revalidateAssignmentPaths(clientId);
  return { ok: true, count: 1 };
}

/** Bulk-assign several clients to one coach (Coach Overview "Assign clients"). */
export async function assignClientsToCoachAction(
  clientIds: string[],
  coachId: string,
): Promise<AssignResult> {
  if (!coachId) return { ok: false, error: "coachId required" };
  const ids = clientIds.filter(Boolean);
  if (ids.length === 0) return { ok: false, error: "Select at least one client" };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const denied = await assertOwner();
  if (denied) return denied;

  const { data: before } = await dbAdmin()
    .from("clients")
    .select("id,coach_id")
    .in("id", ids);

  const { error } = await dbAdmin()
    .from("clients")
    .update({ coach_id: coachId })
    .in("id", ids);
  if (error) return { ok: false, error: error.message };

  const identity = await getServerIdentity();
  await auditCoachChange((before ?? []) as { id: string; coach_id: string | null }[], coachId, identity.role);

  revalidateAssignmentPaths();
  return { ok: true, count: ids.length };
}

export type AssignableClient = {
  id: string;
  name: string;
  coachId: string | null;
  status: Client["status"];
  /** R16-4c: shown in the picker so next week's starters can be handed out.
   *  R17-1a: null when GHL has no start date for them yet. */
  startDate: string | null;
  plan: Client["plan"];
};

export type AssignableClients = {
  /** False when the caller may not assign: the UI must say so instead of
   *  rendering an empty "no clients" state (R16-4d, honest-by-absence). */
  allowed: boolean;
  clients: AssignableClient[];
};

/** Lightweight client list for the assignment pickers. Active + paused only
 *  (the assignable roster; a client waiting for a coach is `active` with
 *  coach_id null, there is no separate onboarding status). Unassigned first,
 *  then by start date (newest starters at the top), then name. */
export async function listAssignableClientsAction(): Promise<AssignableClients> {
  // SEC-AUDIT P1-4 (2026-09-06): this read was unguarded while every write
  // in the file used assertOwner, so any coach could pull the whole business
  // roster (id, name, coach, status) by calling it directly. Same gate.
  if (await assertOwner()) return { allowed: false, clients: [] };
  const clients = await getClientsData();
  const t = (d: string | null) => (d && !Number.isNaN(Date.parse(d)) ? Date.parse(d) : 0);
  return {
    allowed: true,
    clients: clients
      .filter((c) => c.status === "active" || c.status === "paused")
      .map((c) => ({ id: c.id, name: c.name, coachId: c.coachId, status: c.status, startDate: c.startDate, plan: c.plan }))
      .sort((a, b) => Number(!!a.coachId) - Number(!!b.coachId) || t(b.startDate) - t(a.startDate) || a.name.localeCompare(b.name)),
  };
}
