// R13-2: pending access requests. An authenticated user with no users row
// and no matching invite is parked on /no-access; this module records that
// (one row per Clerk id), suggests a coach for the approver from a name
// match (a HINT only, never a grant), and turns an approval into the users
// row + a role_change_audit entry. Service-role only, server-side only.
//
// Needs migration 20260905000001 (proposed). Before it is applied every
// function degrades honestly: the holding screen still renders, listing
// returns { migrationPending: true }, approvals refuse.

import { dbAdmin } from "@/lib/db/client";
import { nameKey, normaliseEmail } from "@/lib/email-normalise";
import { ROLES, type Role } from "@/lib/navigation";

export type AccessRequest = {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  suggestedCoachId: string | null;
  suggestedCoachName: string | null;
  status: "pending" | "approved" | "rejected";
  grantedRole: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  clerk_id: string;
  email: string;
  name: string | null;
  suggested_coach_id: string | null;
  status: string;
  granted_role: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  created_at: string;
};

export const ACCESS_REQUESTS_MIGRATION =
  "Access requests need migration 20260905000001 (proposed, awaiting owner approval).";

const isMissingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || /access_requests/i.test(e.message ?? ""));

/** Coach record whose normalised name equals the sign-up name and that has
 *  no linked login yet. Exactly one hit -> suggestion; otherwise null. */
export async function suggestCoachByName(name: string | null | undefined): Promise<{ id: string; name: string } | null> {
  const key = nameKey(name);
  if (!key) return null;
  const [{ data: coaches }, { data: linked }] = await Promise.all([
    dbAdmin().from("coaches").select("id,name").eq("is_active", true),
    dbAdmin().from("users").select("linked_coach_id").not("linked_coach_id", "is", null),
  ]);
  const taken = new Set((linked ?? []).map((u) => u.linked_coach_id as string));
  const hits = (coaches ?? []).filter((c) => !taken.has(c.id as string) && nameKey(c.name as string) === key);
  return hits.length === 1 ? { id: hits[0].id as string, name: hits[0].name as string } : null;
}

/** Record (or refresh) the pending request for a Clerk user. Returns
 *  whether this call CREATED it (so the caller notifies approvers once). */
export async function recordAccessRequest(input: {
  clerkId: string;
  email: string;
  name: string | null;
}): Promise<{ created: boolean; stored: boolean; suggestedCoach: { id: string; name: string } | null }> {
  const suggestedCoach = await suggestCoachByName(input.name).catch(() => null);
  const { data: existing, error: readErr } = await dbAdmin()
    .from("access_requests")
    .select("id,status")
    .eq("clerk_id", input.clerkId)
    .maybeSingle();
  if (readErr) return { created: false, stored: false, suggestedCoach };
  if (existing) return { created: false, stored: true, suggestedCoach };
  const { error } = await dbAdmin().from("access_requests").insert({
    clerk_id: input.clerkId,
    email: input.email,
    email_normalised: normaliseEmail(input.email),
    name: input.name,
    suggested_coach_id: suggestedCoach?.id ?? null,
  });
  return { created: !error, stored: !error, suggestedCoach };
}

export async function listAccessRequests(): Promise<{ rows: AccessRequest[]; migrationPending: boolean }> {
  const { data, error } = await dbAdmin()
    .from("access_requests")
    .select("id,clerk_id,email,name,suggested_coach_id,status,granted_role,resolved_by_name,resolved_at,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { rows: [], migrationPending: isMissingTable(error) };
  const rows = (data ?? []) as Row[];
  const coachIds = [...new Set(rows.map((r) => r.suggested_coach_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (coachIds.length) {
    const { data: coaches } = await dbAdmin().from("coaches").select("id,name").in("id", coachIds);
    for (const c of coaches ?? []) names.set(c.id as string, c.name as string);
  }
  return {
    migrationPending: false,
    rows: rows.map((r) => ({
      id: r.id,
      clerkId: r.clerk_id,
      email: r.email,
      name: r.name,
      suggestedCoachId: r.suggested_coach_id,
      suggestedCoachName: r.suggested_coach_id ? names.get(r.suggested_coach_id) ?? null : null,
      status: (["pending", "approved", "rejected"].includes(r.status) ? r.status : "pending") as AccessRequest["status"],
      grantedRole: r.granted_role,
      resolvedByName: r.resolved_by_name,
      resolvedAt: r.resolved_at,
      createdAt: r.created_at,
    })),
  };
}

export async function pendingAccessRequestCount(): Promise<number> {
  const { count, error } = await dbAdmin()
    .from("access_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return error ? 0 : count ?? 0;
}

/** Approve: users row (upsert on clerk_id), audit row (from 'none'), request
 *  marked approved. The audit table is a HARD precondition (R7-4 rule): no
 *  audit, no grant. Caller has already checked policy + grantable roles. */
export async function approveAccessRequest(input: {
  requestId: string;
  role: Role;
  linkedCoachId: string | null;
  approver: { clerkId: string; name: string | null };
}): Promise<{ ok: true; email: string; name: string | null } | { ok: false; error: string }> {
  if (!(ROLES as string[]).includes(input.role)) return { ok: false, error: "Pick a valid role." };
  const { data: req, error: readErr } = await dbAdmin()
    .from("access_requests")
    .select("id,clerk_id,email,name,status")
    .eq("id", input.requestId)
    .maybeSingle();
  if (readErr) return { ok: false, error: isMissingTable(readErr) ? ACCESS_REQUESTS_MIGRATION : readErr.message };
  if (!req) return { ok: false, error: "That request no longer exists." };
  if (req.status !== "pending") return { ok: false, error: "That request was already resolved." };

  const { error: auditProbe } = await dbAdmin().from("role_change_audit").select("id").limit(1);
  if (auditProbe) {
    return { ok: false, error: "Approvals need the role_change_audit table (migration 20260809000001). No access was granted." };
  }

  const linkedCoachId = input.role === "coach" ? input.linkedCoachId : null;
  if (input.role === "coach" && !linkedCoachId) return { ok: false, error: "Pick which coach this login is for." };
  const targetName = (req.name as string | null) ?? (req.email as string);

  const { error: userErr } = await dbAdmin()
    .from("users")
    .upsert(
      { clerk_id: req.clerk_id, role: input.role, name: targetName, linked_coach_id: linkedCoachId },
      { onConflict: "clerk_id" },
    );
  if (userErr) return { ok: false, error: userErr.message };

  const { error: auditErr } = await dbAdmin().from("role_change_audit").insert({
    changed_by_clerk_id: input.approver.clerkId,
    changed_by_name: input.approver.name,
    target_clerk_id: req.clerk_id,
    target_name: targetName,
    from_role: "none",
    to_role: input.role,
    from_coach_id: null,
    to_coach_id: linkedCoachId,
  });

  await dbAdmin()
    .from("access_requests")
    .update({
      status: "approved",
      granted_role: input.role,
      granted_coach_id: linkedCoachId,
      resolved_by_clerk_id: input.approver.clerkId,
      resolved_by_name: input.approver.name,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", req.id);

  if (auditErr) {
    return { ok: false, error: `Access was granted but the audit write failed: ${auditErr.message}. Tell Kai.` };
  }
  return { ok: true, email: req.email as string, name: req.name as string | null };
}

export async function rejectAccessRequest(input: {
  requestId: string;
  approver: { clerkId: string; name: string | null };
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await dbAdmin()
    .from("access_requests")
    .update({
      status: "rejected",
      resolved_by_clerk_id: input.approver.clerkId,
      resolved_by_name: input.approver.name,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", input.requestId)
    .eq("status", "pending");
  if (error) return { ok: false, error: isMissingTable(error) ? ACCESS_REQUESTS_MIGRATION : error.message };
  return { ok: true };
}
