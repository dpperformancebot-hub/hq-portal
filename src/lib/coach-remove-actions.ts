"use server";

// R19-2c: removing a coach. A DEACTIVATION, never a delete.
//
// Everything the coach touched has to survive: check-ins, pay history, audits,
// the Academy tracker, and the name shown against past clients in reports. So
// nothing is deleted anywhere. coaches.is_active goes false, their login is
// banned in Clerk (banned, not deleted, so the audit trail keeps its subject
// and Reactivate is possible), and an audit row records the before and after.
//
// ORDER MATTERS, AND IT IS THE OPPOSITE OF CREATION. Creating a coach writes
// the record first and emails last, because a record without an email can be
// retried. Removing a coach revokes the login FIRST and flips is_active only
// once that succeeded, because a coach marked removed who can still sign in is
// the dangerous half of the job to leave undone.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { fetchAllRows } from "@/lib/db/fetch-all";
import { getServerIdentity } from "@/lib/role-server";
import { revokeClerkAccess, restoreClerkAccess, type ClerkAccessResult } from "@/lib/clerk-invites";

const NO_DB = "Removing a coach needs the HQ datastore. Set HQ_PERSISTENCE=true with Supabase configured.";

/** Owner and admin only, per the approved R19-2 matrix. Deliberately NOT the
 *  head coach and NOT ops_manager: they can invite and assign, but switching
 *  off a working coach is a people decision. */
async function canRemoveCoach() {
  const id = await getServerIdentity();
  return { ok: id.realRole === "owner" || id.role === "admin", identity: id };
}

export type RemovalPrecheck = {
  coach: { id: string; name: string; isActive: boolean; isHeadCoach: boolean };
  activeClients: number;
  pausedClients: number;
  openTasks: number;
  pendingCheckIns: number;
  /** Weeks in the current pay period the coach has earned but not been paid. */
  unpaidPayPeriod: number;
  /** Everything that must be cleared before Remove is allowed. */
  blockers: string[];
  /** Active + paused clients, for the move-them-first step. */
  clients: { id: string; name: string; status: string }[];
  /** Coaches they can be moved to, with room left. */
  targets: { id: string; name: string; clients: number; capacity: number; full: boolean }[];
};

export async function coachRemovalPrecheckAction(
  coachId: string,
): Promise<{ ok: true; data: RemovalPrecheck } | { ok: false; error: string }> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const gate = await canRemoveCoach();
  if (!gate.ok) return { ok: false, error: "Only the owner or an admin can remove a coach." };

  const db = dbAdmin();
  const { data: coach } = await db.from("coaches").select("id,name,role,is_active,max_capacity").eq("id", coachId).maybeSingle();
  if (!coach) return { ok: false, error: "That coach no longer exists." };
  const c = coach as { id: string; name: string; role: string; is_active: boolean; max_capacity: number };

  const clients = await fetchAllRows<{ id: string; name: string; status: string; coach_id: string | null }>(
    (from, to) => db.from("clients").select("id,name,status,coach_id").order("id").range(from, to),
    { label: "removal: clients" },
  );
  const mine = clients.filter((x) => x.coach_id === coachId);
  const activeClients = mine.filter((x) => x.status === "active").length;
  const pausedClients = mine.filter((x) => x.status === "paused").length;

  const coaches = await fetchAllRows<{ id: string; name: string; is_active: boolean; max_capacity: number }>(
    (from, to) => db.from("coaches").select("id,name,is_active,max_capacity").order("id").range(from, to),
    { label: "removal: coaches" },
  );
  const load = new Map<string, number>();
  for (const x of clients) {
    if (x.coach_id && x.status !== "cancelled") load.set(x.coach_id, (load.get(x.coach_id) ?? 0) + 1);
  }

  let openTasks = 0;
  try {
    const { count } = await db
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("assignee_name", c.name)
      .neq("status", "done");
    openTasks = count ?? 0;
  } catch {
    /* the taskboard is optional on a brand; a missing table must not block */
  }

  let pendingCheckIns = 0;
  try {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { count } = await db
      .from("check_ins")
      .select("*", { count: "exact", head: true })
      .eq("coach_id", coachId)
      .gte("submitted_at", since);
    pendingCheckIns = count ?? 0;
  } catch {
    /* best-effort */
  }

  // Unpaid pay period: weeks logged since the last payday. Reported, never a
  // blocker. Their final pay still calculates after removal, because nothing
  // is deleted; the owner just needs to know it is owed.
  let unpaidPayPeriod = 0;
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    const { count } = await db
      .from("check_ins")
      .select("*", { count: "exact", head: true })
      .eq("coach_id", coachId)
      .gte("submitted_at", monthStart.toISOString());
    unpaidPayPeriod = count ?? 0;
  } catch {
    /* best-effort */
  }

  const headCoaches = coaches.filter((x) => x.is_active !== false && (x as { role?: string }).role === "head_coach");
  const blockers: string[] = [];
  if (activeClients > 0) blockers.push(`${activeClients} active client${activeClients === 1 ? "" : "s"} still assigned`);
  if (pausedClients > 0) blockers.push(`${pausedClients} paused client${pausedClients === 1 ? "" : "s"} still assigned`);
  if (gate.identity.linkedCoachId === coachId) blockers.push("You cannot remove your own coach record.");
  if (c.role === "head_coach" && headCoaches.length <= 1) {
    blockers.push("This is the only head coach. Promote someone else first.");
  }

  return {
    ok: true,
    data: {
      coach: { id: c.id, name: c.name, isActive: c.is_active, isHeadCoach: c.role === "head_coach" },
      activeClients,
      pausedClients,
      openTasks,
      pendingCheckIns,
      unpaidPayPeriod,
      blockers,
      clients: mine
        .filter((x) => x.status === "active" || x.status === "paused")
        .map((x) => ({ id: x.id, name: x.name, status: x.status }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      targets: coaches
        .filter((x) => x.id !== coachId && x.is_active !== false)
        .map((x) => {
          const n = load.get(x.id) ?? 0;
          return { id: x.id, name: x.name, clients: n, capacity: x.max_capacity, full: n >= x.max_capacity };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
  };
}

export type RemoveResult =
  | { ok: true; coachId: string; name: string; clerk: ClerkAccessResult; ghlContactsStillNaming: number | null }
  | { ok: false; error: string };

export async function deactivateCoachAction(coachId: string): Promise<RemoveResult> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const gate = await canRemoveCoach();
  if (!gate.ok) return { ok: false, error: "Only the owner or an admin can remove a coach." };

  // Re-run every check server-side. The screen's copy is a courtesy; THIS is
  // the rule, and it must not be bypassable by posting the action directly.
  const pre = await coachRemovalPrecheckAction(coachId);
  if (!pre.ok) return { ok: false, error: pre.error };
  if (pre.data.blockers.length > 0) {
    return { ok: false, error: `Cannot remove ${pre.data.coach.name} yet: ${pre.data.blockers.join("; ")}.` };
  }
  if (!pre.data.coach.isActive) return { ok: false, error: `${pre.data.coach.name} is already removed.` };

  const db = dbAdmin();
  const { data: inv } = await db.from("invites").select("email").eq("linked_coach_id", coachId).maybeSingle();
  const email = (inv as { email?: string } | null)?.email ?? null;

  // Login FIRST. A coach marked removed who can still sign in is the half of
  // this job it is dangerous to leave undone, so a Clerk failure aborts and
  // leaves them fully active rather than half-removed.
  let clerk: ClerkAccessResult = { status: "nothing_to_do" };
  if (email) {
    clerk = await revokeClerkAccess(email);
    if (clerk.status === "failed") {
      return {
        ok: false,
        error: `Could not revoke their login: ${clerk.error}. ${pre.data.coach.name} is still fully active, nothing was changed. Try again when Clerk is reachable.`,
      };
    }
  }

  const { error } = await db.from("coaches").update({ is_active: false }).eq("id", coachId);
  if (error) return { ok: false, error: error.message };

  try {
    await db.from("users").update({ is_active: false }).eq("email", email ?? "");
  } catch {
    /* the users row is optional; role-server rebuilds it on sign-in */
  }

  try {
    await db.from("sync_events").insert({
      source: "manual",
      entity: "coach",
      ghl_id: null,
      action: "coach_deactivated",
      payload: {
        coach_id: coachId,
        name: pre.data.coach.name,
        from: { is_active: true },
        to: { is_active: false },
        clerk: clerk.status,
        email,
        clients_at_removal: { active: pre.data.activeClients, paused: pre.data.pausedClients },
        unpaid_pay_period_weeks: pre.data.unpaidPayPeriod,
        by: gate.identity.role,
      },
    });
  } catch {
    /* best-effort */
  }

  for (const p of ["/team", "/coach-overview", "/assign-clients", "/check-ins", "/weekly-capacity", "/coach-performance", "/my-pay"]) {
    revalidatePath(p);
  }
  return { ok: true, coachId, name: pre.data.coach.name, clerk, ghlContactsStillNaming: null };
}

export async function reactivateCoachAction(coachId: string): Promise<RemoveResult> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const gate = await canRemoveCoach();
  if (!gate.ok) return { ok: false, error: "Only the owner or an admin can bring a coach back." };

  const db = dbAdmin();
  const { data: coach } = await db.from("coaches").select("id,name,is_active").eq("id", coachId).maybeSingle();
  if (!coach) return { ok: false, error: "That coach no longer exists." };
  const c = coach as { id: string; name: string; is_active: boolean };
  if (c.is_active) return { ok: false, error: `${c.name} is already active.` };

  const { data: inv } = await db.from("invites").select("email").eq("linked_coach_id", coachId).maybeSingle();
  const email = (inv as { email?: string } | null)?.email ?? null;
  const clerk = email ? await restoreClerkAccess(email) : ({ status: "nothing_to_do" } as ClerkAccessResult);

  const { error } = await db.from("coaches").update({ is_active: true }).eq("id", coachId);
  if (error) return { ok: false, error: error.message };
  try {
    await db.from("users").update({ is_active: true }).eq("email", email ?? "");
  } catch {
    /* optional */
  }
  try {
    await db.from("sync_events").insert({
      source: "manual",
      entity: "coach",
      ghl_id: null,
      action: "coach_reactivated",
      payload: { coach_id: coachId, name: c.name, from: { is_active: false }, to: { is_active: true }, clerk: clerk.status, by: gate.identity.role },
    });
  } catch {
    /* best-effort */
  }
  for (const p of ["/team", "/coach-overview", "/assign-clients", "/check-ins"]) revalidatePath(p);
  // Their clients stay exactly where they were moved to. Coming back does not
  // claw a roster back off whoever took it on.
  return { ok: true, coachId, name: c.name, clerk, ghlContactsStillNaming: null };
}

/** R19-2c: how many GHL contacts still name this coach in "Assigned Coach".
 *
 *  The dropdown option is deliberately NOT removed, because old contacts
 *  reference it and deleting the option would orphan them. So the honest thing
 *  is to say how many contacts still carry the name, and let the VA fix them at
 *  the source. Read only: nothing in GHL is touched.
 *
 *  Called from the success screen rather than inside the removal, so a slow CRM
 *  read can never hold up, or fail, the removal itself. */
export async function countGhlContactsNamingCoachAction(
  coachName: string,
): Promise<{ ok: true; count: number; total: number } | { ok: false; error: string }> {
  const gate = await canRemoveCoach();
  if (!gate.ok) return { ok: false, error: "Only the owner or an admin can run this check." };
  const wanted = coachName.trim().toLowerCase();
  if (!wanted) return { ok: false, error: "No coach name given." };
  try {
    const [{ fetchAllContacts, fetchCustomFieldDefs }, { fieldNameById }] = await Promise.all([
      import("@/lib/ghl/client"),
      import("@/lib/ghl/map"),
    ]);
    const [defs, contacts] = await Promise.all([fetchCustomFieldDefs(), fetchAllContacts()]);
    const byId = fieldNameById(defs);
    let count = 0;
    for (const c of contacts) {
      for (const f of c.customFields ?? []) {
        if (byId.get(f.id) !== "assignedcoach") continue;
        const v = f.value == null ? "" : Array.isArray(f.value) ? f.value.join(",") : String(f.value);
        if (v.trim().toLowerCase() === wanted) count++;
        break;
      }
    }
    return { ok: true, count, total: contacts.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type InactiveCoach = { id: string; name: string; clients: number; removedAt: string | null };

/** R19-2c: the removed coaches, so they can be found and brought back. Without
 *  this a deactivated coach is invisible everywhere and Reactivate would have
 *  nothing to act on. */
export async function listInactiveCoachesAction(): Promise<InactiveCoach[]> {
  if (!persistenceEnabled()) return [];
  const gate = await canRemoveCoach();
  if (!gate.ok) return [];
  const db = dbAdmin();
  const rows = await fetchAllRows<{ id: string; name: string; is_active: boolean }>(
    (from, to) => db.from("coaches").select("id,name,is_active").order("id").range(from, to),
    { label: "inactive coaches" },
  );
  const inactive = rows.filter((r) => r.is_active === false);
  if (inactive.length === 0) return [];

  // Historic client count: they keep showing against the clients they used to
  // hold, which is the point of a deactivation.
  const clients = await fetchAllRows<{ coach_id: string | null }>(
    (from, to) => db.from("clients").select("coach_id").order("id").range(from, to),
    { label: "inactive coaches: clients" },
  );
  const load = new Map<string, number>();
  for (const c of clients) if (c.coach_id) load.set(c.coach_id, (load.get(c.coach_id) ?? 0) + 1);

  const { data: events } = await db
    .from("sync_events")
    .select("payload,created_at")
    .eq("action", "coach_deactivated")
    .order("created_at", { ascending: false });
  const removedAt = new Map<string, string>();
  for (const e of (events ?? []) as { payload: { coach_id?: string }; created_at: string }[]) {
    const id = e.payload?.coach_id;
    if (id && !removedAt.has(id)) removedAt.set(id, e.created_at);
  }

  return inactive
    .map((r) => ({ id: r.id, name: r.name, clients: load.get(r.id) ?? 0, removedAt: removedAt.get(r.id) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
