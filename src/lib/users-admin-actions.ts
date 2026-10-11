"use server";

// Login administration (2026-07-02, owner request: real admin settings).
// The users table maps Clerk logins to HQ roles and coach links; this is the
// owner-gated write path for changing them in-app instead of via SQL.
//
// Security: every action re-resolves the caller server-side and requires the
// REAL role to be owner (impersonation-safe). Role values are validated
// against the ROLES list. There is no delete here: removing access means
// setting role to 'va' (least privilege) and/or removing the user in Clerk.
//
// R7-4 guards on every role change (including head-coach tier toggles):
// last-owner protection, an audit row (who changed whom, from -> to, when)
// as a HARD precondition (no audit table = no change, honest error), and a
// notification to the owner. Changes take effect on the target's next
// request because getServerIdentity re-reads the users table per request.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getServerIdentity } from "@/lib/role-server";
import { ROLES, type Role } from "@/lib/navigation";
import { BRAND } from "@/lib/brand";
import { insertNotification } from "@/lib/notify";

export type LoginRow = {
  clerkId: string;
  name: string | null;
  role: Role;
  linkedCoachId: string | null;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const NO_DB = "Login management needs the HQ datastore (HQ_PERSISTENCE).";
const NOT_OWNER = "Only the owner can manage logins.";
const NEEDS_AUDIT_MIGRATION =
  "Role changes need the audit table from migration 20260809000001 (proposed, awaiting owner approval). No change was made.";

async function assertOwner(): Promise<string | null> {
  const { realRole } = await getServerIdentity();
  return realRole === "owner" ? null : NOT_OWNER;
}

/** The caller's identity for the audit trail. Clerk id when auth is live;
 *  the dev preview (password wall, no Clerk) is labelled as such. */
async function callerForAudit(): Promise<{ clerkId: string; name: string | null }> {
  const identity = await getServerIdentity();
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (userId) return { clerkId: userId, name: identity.displayName };
  } catch {
    // dev preview
  }
  return { clerkId: "dev-preview", name: identity.displayName ?? "Owner (dev preview)" };
}

/** R7-4: verify the audit table exists BEFORE changing anything, so a
 *  missing table refuses the change instead of leaving it unaudited. */
async function auditPreflight(): Promise<string | null> {
  const { error } = await dbAdmin().from("role_change_audit").select("id").limit(1);
  if (error && (error.code === "42P01" || /role_change_audit/i.test(error.message))) {
    return NEEDS_AUDIT_MIGRATION;
  }
  return error ? `Audit table check failed, so the change was not made: ${error.message}` : null;
}

/** R7-4: one audit row per change, written right after the update. */
async function auditRoleChange(entry: {
  targetClerkId: string;
  targetName: string | null;
  fromRole: string;
  toRole: string;
  fromCoachId?: string | null;
  toCoachId?: string | null;
}): Promise<string | null> {
  const caller = await callerForAudit();
  const { error } = await dbAdmin().from("role_change_audit").insert({
    changed_by_clerk_id: caller.clerkId,
    changed_by_name: caller.name,
    target_clerk_id: entry.targetClerkId,
    target_name: entry.targetName,
    from_role: entry.fromRole,
    to_role: entry.toRole,
    from_coach_id: entry.fromCoachId ?? null,
    to_coach_id: entry.toCoachId ?? null,
  });
  if (error) {
    // Preflight passed, so this is a genuine write failure AFTER the role
    // update: report it honestly rather than pretending the change is clean.
    return `The role was changed but the audit write failed: ${error.message}. Tell Kai.`;
  }
  return null;
}

/** Owner notification for a role change (rides the R6-5 pipeline). Best
 *  effort AFTER the audited change; a delivery hiccup never blocks it. */
async function notifyOwnerRoleChange(payload: Record<string, string>): Promise<void> {
  try {
    await insertNotification({ recipientName: BRAND.ownerName, type: "role_change", payload });
  } catch {
    // The audit row is the record; notification delivery is best effort.
  }
}

const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as string[]).includes(v);

/** All login mappings, for the Team screen. Owner-only. */
export async function listLoginsAction(): Promise<Result<LoginRow[]>> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const denied = await assertOwner();
  if (denied) return { ok: false, error: denied };
  const { data, error } = await dbAdmin()
    .from("users")
    .select("clerk_id,name,role,linked_coach_id")
    .order("name", { ascending: true });
  if (error || !data) return { ok: false, error: error?.message ?? "Could not load logins." };
  return {
    ok: true,
    data: data.map((r) => ({
      clerkId: r.clerk_id as string,
      name: (r.name as string | null) ?? null,
      role: isRole(r.role) ? r.role : "va",
      linkedCoachId: (r.linked_coach_id as string | null) ?? null,
    })),
  };
}

/** Change one login's role and/or coach link. Owner-only (real role, so an
 *  admin or an impersonating session can never grant roles). R7-4 guards:
 *  self-demotion refusal, last-owner protection, audited (hard precondition)
 *  and notified to the owner. The change takes effect on the target's next
 *  request; their current page stays until they navigate. */
export async function updateLoginAction(input: {
  clerkId: string;
  role: Role;
  linkedCoachId: string | null;
}): Promise<Result<LoginRow>> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const denied = await assertOwner();
  if (denied) return { ok: false, error: denied };
  if (!input.clerkId) return { ok: false, error: "clerkId required" };
  if (!isRole(input.role)) return { ok: false, error: "invalid role" };

  // The target's current row: audit needs from -> to, the guards need to
  // know whether an owner is being demoted.
  const { data: target, error: targetErr } = await dbAdmin()
    .from("users")
    .select("clerk_id,name,role,linked_coach_id")
    .eq("clerk_id", input.clerkId)
    .maybeSingle();
  if (targetErr) return { ok: false, error: targetErr.message };
  if (!target) return { ok: false, error: "That login no longer exists." };
  const fromRole: Role = isRole(target.role) ? target.role : "va";
  const fromCoachId = (target.linked_coach_id as string | null) ?? null;
  const targetName = (target.name as string | null) ?? null;
  const linkedCoachId = input.role === "coach" ? input.linkedCoachId : null;

  if (fromRole === input.role && fromCoachId === linkedCoachId) {
    return { ok: true, data: { clerkId: input.clerkId, name: targetName, role: input.role, linkedCoachId } };
  }

  if (fromRole === "owner" && input.role !== "owner") {
    // Self-demotion guard: the caller cannot change their own row away from
    // owner (locking yourself out of admin).
    try {
      const { auth } = await import("@clerk/nextjs/server");
      const { userId } = await auth();
      if (userId && userId === input.clerkId) {
        return { ok: false, error: "You cannot demote your own owner login." };
      }
    } catch {
      // Dev preview (no Clerk): the last-owner count below still protects.
    }
    // Last-owner protection: never demote the only owner login, whoever asks.
    const { count, error: countErr } = await dbAdmin()
      .from("users")
      .select("clerk_id", { count: "exact", head: true })
      .eq("role", "owner");
    if (countErr) return { ok: false, error: countErr.message };
    if ((count ?? 0) <= 1) {
      return { ok: false, error: "That is the last owner login. Promote another owner first." };
    }
  }

  // Audit is a precondition for a ROLE change: no audit table, no change.
  // A coach-link-only edit (same role, different roster link) predates R7-4
  // and keeps working pre-migration; it is audited once the table exists.
  const roleChanged = fromRole !== input.role;
  if (roleChanged) {
    const preflight = await auditPreflight();
    if (preflight) return { ok: false, error: preflight };
  }

  const { error } = await dbAdmin()
    .from("users")
    .update({ role: input.role, linked_coach_id: linkedCoachId })
    .eq("clerk_id", input.clerkId);
  if (error) return { ok: false, error: error.message };

  let auditErr = await auditRoleChange({
    targetClerkId: input.clerkId,
    targetName,
    fromRole,
    toRole: input.role,
    fromCoachId,
    toCoachId: linkedCoachId,
  });
  if (auditErr && !roleChanged) auditErr = null; // link-only edit pre-migration
  if (roleChanged) {
    await notifyOwnerRoleChange({
      target: targetName ?? input.clerkId,
      from: fromRole,
      to: input.role,
    });
  }

  revalidatePath("/team");
  if (auditErr) return { ok: false, error: auditErr };
  return { ok: true, data: { clerkId: input.clerkId, name: targetName, role: input.role, linkedCoachId } };
}

export type RoleChangeRow = {
  id: string;
  changedByName: string | null;
  targetName: string | null;
  fromRole: string;
  toRole: string;
  changedAt: string;
};

/** R7-4: the audit trail, newest first, for the Team screen. Owner-only.
 *  Empty (not an error) pre-migration: the trail simply has nothing yet. */
export async function listRoleChangesAction(limit = 20): Promise<Result<RoleChangeRow[]>> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const denied = await assertOwner();
  if (denied) return { ok: false, error: denied };
  const { data, error } = await dbAdmin()
    .from("role_change_audit")
    .select("id, changed_by_name, target_name, from_role, to_role, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (error.code === "42P01" || /role_change_audit/i.test(error.message)) return { ok: true, data: [] };
    return { ok: false, error: error.message };
  }
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id as string,
      changedByName: (r.changed_by_name as string | null) ?? null,
      targetName: (r.target_name as string | null) ?? null,
      fromRole: r.from_role as string,
      toRole: r.to_role as string,
      changedAt: r.created_at as string,
    })),
  };
}

/** Which coach (if any) currently holds the head-coach tier. Owner-only. */
export async function getHeadCoachAction(): Promise<Result<string | null>> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const denied = await assertOwner();
  if (denied) return { ok: false, error: denied };
  const { data, error } = await dbAdmin().from("coaches").select("id").eq("role", "head_coach").maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data?.id ?? null };
}

/** Promote a coach to head coach (oversight tier) or demote back to coach.
 *  Owner-only. Single-head invariant: promoting one demotes any other, so
 *  there is always at most one head coach. The elevated access itself is
 *  resolved from coaches.role at request time (role-server isHeadCoach).
 *  R7-4: audited like any other role change (the tier changes what the
 *  person can see), same hard audit precondition + owner notification. */
export async function setHeadCoachAction(coachId: string, makeHead: boolean): Promise<Result<null>> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const denied = await assertOwner();
  if (denied) return { ok: false, error: denied };
  if (!coachId) return { ok: false, error: "coachId required" };

  const preflight = await auditPreflight();
  if (preflight) return { ok: false, error: preflight };

  const db = dbAdmin();
  const { data: coach } = await db.from("coaches").select("id, name").eq("id", coachId).maybeSingle();
  const coachName = (coach as { name?: string } | null)?.name ?? null;
  // The audit keys on the login when one is linked to this coach; a coach
  // with no login yet is recorded by their coach id.
  const { data: login } = await db
    .from("users")
    .select("clerk_id")
    .eq("linked_coach_id", coachId)
    .maybeSingle();
  const targetClerkId = (login as { clerk_id?: string } | null)?.clerk_id ?? `coach:${coachId}`;

  if (makeHead) {
    // Audit the outgoing head first so a two-coach swap leaves two rows.
    const { data: prevHead } = await db.from("coaches").select("id, name").eq("role", "head_coach").maybeSingle();
    const { error: demoteErr } = await db.from("coaches").update({ role: "coach" }).eq("role", "head_coach");
    if (demoteErr) return { ok: false, error: demoteErr.message };
    const { error } = await db.from("coaches").update({ role: "head_coach" }).eq("id", coachId);
    if (error) return { ok: false, error: error.message };
    const prev = prevHead as { id: string; name?: string } | null;
    if (prev && prev.id !== coachId) {
      await auditRoleChange({
        targetClerkId: `coach:${prev.id}`,
        targetName: prev.name ?? null,
        fromRole: "head_coach",
        toRole: "coach",
        fromCoachId: prev.id,
        toCoachId: prev.id,
      });
    }
    const auditErr = await auditRoleChange({
      targetClerkId,
      targetName: coachName,
      fromRole: "coach",
      toRole: "head_coach",
      fromCoachId: coachId,
      toCoachId: coachId,
    });
    await notifyOwnerRoleChange({ target: coachName ?? coachId, from: "coach", to: "head_coach" });
    if (auditErr) return { ok: false, error: auditErr };
  } else {
    const { error } = await db.from("coaches").update({ role: "coach" }).eq("id", coachId);
    if (error) return { ok: false, error: error.message };
    const auditErr = await auditRoleChange({
      targetClerkId,
      targetName: coachName,
      fromRole: "head_coach",
      toRole: "coach",
      fromCoachId: coachId,
      toCoachId: coachId,
    });
    await notifyOwnerRoleChange({ target: coachName ?? coachId, from: "head_coach", to: "coach" });
    if (auditErr) return { ok: false, error: auditErr };
  }
  revalidatePath("/team");
  revalidatePath("/dashboard");
  return { ok: true, data: null };
}
