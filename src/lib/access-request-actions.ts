"use server";

// R13-2: server actions behind /access-requests. Every action re-resolves
// the caller (policy: owner, admin, head coach) and caps the role it may
// hand out via grantableRoles, so a directly-invoked action is refused,
// not just hidden.

import { revalidatePath } from "next/cache";
import { canApproveAccessRequests, grantableRoles } from "@/lib/access-policy";
import { approveAccessRequest, rejectAccessRequest } from "@/lib/access-requests";
import { persistenceEnabled } from "@/lib/db/client";
import { BRAND } from "@/lib/brand";
import { type Role } from "@/lib/navigation";
import { insertNotification } from "@/lib/notify";
import { getServerIdentity, type ServerIdentity } from "@/lib/role-server";

type Result = { ok: true } | { ok: false; error: string };

const toAccess = (i: ServerIdentity) => ({
  role: i.role,
  realRole: i.realRole,
  isHeadCoach: i.realIsHeadCoach,
  linkedCoachId: i.linkedCoachId,
});

async function approver(): Promise<{ ok: true; identity: ServerIdentity; clerkId: string } | { ok: false; error: string }> {
  if (!persistenceEnabled()) return { ok: false, error: "Access requests need the HQ datastore." };
  const identity = await getServerIdentity();
  if (!canApproveAccessRequests(toAccess(identity))) {
    return { ok: false, error: "Only the owner, head of ops or the head coach can approve access." };
  }
  let clerkId = "dev-preview";
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (userId) clerkId = userId;
  } catch {
    /* dev preview */
  }
  return { ok: true, identity, clerkId };
}

export async function approveAccessRequestAction(input: {
  requestId: string;
  role: Role;
  linkedCoachId: string | null;
}): Promise<Result> {
  const a = await approver();
  if (!a.ok) return a;
  if (!grantableRoles(toAccess(a.identity)).includes(input.role)) {
    return { ok: false, error: `You cannot grant the ${input.role} role.` };
  }
  const res = await approveAccessRequest({
    requestId: input.requestId,
    role: input.role,
    linkedCoachId: input.linkedCoachId,
    approver: { clerkId: a.clerkId, name: a.identity.displayName },
  });
  if (!res.ok) return res;
  try {
    await insertNotification({
      recipientName: BRAND.ownerName,
      type: "role_change",
      payload: { target: res.name ?? res.email, from: "none", to: input.role },
    });
  } catch {
    /* audit row is the record */
  }
  revalidatePath("/access-requests");
  revalidatePath("/team");
  return { ok: true };
}

export async function rejectAccessRequestAction(requestId: string): Promise<Result> {
  const a = await approver();
  if (!a.ok) return a;
  const res = await rejectAccessRequest({ requestId, approver: { clerkId: a.clerkId, name: a.identity.displayName } });
  if (!res.ok) return { ok: false, error: res.error ?? "Could not reject." };
  revalidatePath("/access-requests");
  return { ok: true };
}
