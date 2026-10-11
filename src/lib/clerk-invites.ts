import "server-only";

// Clerk invitations (R19-2a). The FIRST place this app talks to Clerk's
// backend API: until now an invite row was only a pre-authorisation and the
// coach had to find the sign-up page and register themselves, which is exactly
// the gap the owner reported.
//
// NO CONTACT note: this sends an email to a STAFF member the owner is hiring,
// at an address the owner typed. It is not client or lead outreach, so
// assertOutreachAllowed does not apply (see CLAUDE.md: the rule is about
// clients and leads). It is still a real email, so it only ever fires from an
// owner/admin action and never from a sync or a background job.
//
// Nothing in here throws. A coach record must never be left half-made because
// Clerk was down, so every failure comes back as a value the caller can show
// and retry.

import { createClerkClient } from "@clerk/nextjs/server";

export type ClerkInviteStatus =
  | { status: "sent"; invitationId: string }
  | { status: "already_invited"; invitationId: string }
  | { status: "already_a_user" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

/** What the portal stamps on the Clerk invitation so role survives sign-up.
 *  The portal `invites` row remains the source of truth; this is a mirror so
 *  Clerk's own session claims agree with it from the first request. */
export type InviteMetadata = {
  role: string;
  linkedCoachId?: string | null;
  /** The portal invites row id. Travels on the Clerk invitation so an accepted
   *  sign-up can be matched back to the row that authorised it, even if the
   *  person accepts from a different address than the one invited. */
  inviteId?: string | null;
};

function client() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  return createClerkClient({ secretKey });
}

const signUpUrl = () => {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return base ? `${base}/sign-up` : undefined;
};

const msg = (e: unknown) => {
  if (e && typeof e === "object" && "errors" in e) {
    const errs = (e as { errors?: { message?: string; longMessage?: string }[] }).errors;
    const first = errs?.[0];
    if (first) return first.longMessage ?? first.message ?? "Clerk rejected the invitation.";
  }
  return e instanceof Error ? e.message : String(e);
};

/** Find a pending invitation for this email, if Clerk already holds one. */
async function pendingFor(email: string): Promise<{ id: string } | null> {
  const c = client();
  if (!c) return null;
  try {
    const list = await c.invitations.getInvitationList({ status: "pending" });
    const rows = (Array.isArray(list) ? list : (list?.data ?? [])) as {
      id: string;
      emailAddress?: string;
    }[];
    const hit = rows.find((r) => r.emailAddress?.toLowerCase() === email.toLowerCase());
    return hit ? { id: hit.id } : null;
  } catch {
    return null; // a failed lookup must not block the create attempt
  }
}

/** Invite a staff member to create their login. Idempotent: an email Clerk is
 *  already holding an invitation for comes back as already_invited rather than
 *  erroring or sending a second email. */
export async function sendClerkInvitation(
  email: string,
  metadata: InviteMetadata,
): Promise<ClerkInviteStatus> {
  const c = client();
  if (!c) return { status: "skipped", reason: "CLERK_SECRET_KEY is not set on this deployment." };

  const existing = await pendingFor(email);
  if (existing) return { status: "already_invited", invitationId: existing.id };

  try {
    const inv = await c.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: {
        role: metadata.role,
        linkedCoachId: metadata.linkedCoachId ?? null,
        inviteId: metadata.inviteId ?? null,
      },
      redirectUrl: signUpUrl(),
      // notify is what actually makes Clerk send the email. Without it an
      // invitation exists but nobody is told, which is indistinguishable from
      // the old behaviour of writing a row and sending nothing.
      notify: true,
      ignoreExisting: true,
    });
    return { status: "sent", invitationId: inv.id };
  } catch (e) {
    // Clerk returns a duplicate error when the address is already a USER, which
    // is a different situation from a pending invitation: they can simply sign
    // in, so it is not a failure the owner needs to fix.
    const text = msg(e);
    if (/already.*(exists|a member|signed up)|duplicate/i.test(text)) return { status: "already_a_user" };
    return { status: "failed", error: text };
  }
}

/** Resend: revoke whatever is pending and issue a fresh invitation, so the
 *  coach gets a working link rather than a second copy of an expired one. */
export async function resendClerkInvitation(
  email: string,
  metadata: InviteMetadata,
): Promise<ClerkInviteStatus> {
  const c = client();
  if (!c) return { status: "skipped", reason: "CLERK_SECRET_KEY is not set on this deployment." };
  const existing = await pendingFor(email);
  if (existing) {
    try {
      await c.invitations.revokeInvitation(existing.id);
    } catch {
      /* if it cannot be revoked, still try to create: worst case Clerk refuses */
    }
  }
  return sendClerkInvitation(email, metadata);
}

// --- R19-2c: revoking and restoring a login -------------------------------
//
// Removing a coach is a DEACTIVATION, so their Clerk account is BANNED, never
// deleted: their sign-in history, and the link between their user id and their
// portal records, both have to survive for the audit trail to mean anything.
// Ban is reversible, which is what makes Reactivate possible.

export type ClerkAccessResult =
  | { status: "revoked"; userId?: string; invitationRevoked: boolean }
  | { status: "restored"; userId?: string }
  | { status: "nothing_to_do" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

async function userIdFor(email: string): Promise<string | null> {
  const c = client();
  if (!c) return null;
  const res = await c.users.getUserList({ emailAddress: [email] });
  const rows = (Array.isArray(res) ? res : (res?.data ?? [])) as { id: string }[];
  return rows[0]?.id ?? null;
}

/** Shut the door: ban the account if they have one, and revoke any invitation
 *  they never accepted. Both are attempted; a missing one is not a failure. */
export async function revokeClerkAccess(email: string): Promise<ClerkAccessResult> {
  const c = client();
  if (!c) return { status: "skipped", reason: "CLERK_SECRET_KEY is not set on this deployment." };
  try {
    const userId = await userIdFor(email);
    if (userId) await c.users.banUser(userId);

    let invitationRevoked = false;
    const pending = await pendingFor(email);
    if (pending) {
      await c.invitations.revokeInvitation(pending.id);
      invitationRevoked = true;
    }

    if (!userId && !invitationRevoked) return { status: "nothing_to_do" };
    return { status: "revoked", userId: userId ?? undefined, invitationRevoked };
  } catch (e) {
    return { status: "failed", error: msg(e) };
  }
}

/** Reactivate: lift the ban. A coach who never accepted their invitation has
 *  no account to unban, so they are invited again by the caller instead. */
export async function restoreClerkAccess(email: string): Promise<ClerkAccessResult> {
  const c = client();
  if (!c) return { status: "skipped", reason: "CLERK_SECRET_KEY is not set on this deployment." };
  try {
    const userId = await userIdFor(email);
    if (!userId) return { status: "nothing_to_do" };
    await c.users.unbanUser(userId);
    return { status: "restored", userId };
  } catch (e) {
    return { status: "failed", error: msg(e) };
  }
}

/** R19-2a: revoke whatever invitation Clerk is holding for this address, used
 *  when the portal invite itself is revoked. Silent when there is nothing to
 *  revoke: the goal is "no live link for this address", not a ceremony. */
export async function revokeClerkInvitationFor(email: string): Promise<ClerkInviteStatus> {
  const c = client();
  if (!c) return { status: "skipped", reason: "CLERK_SECRET_KEY is not set on this deployment." };
  try {
    const pending = await pendingFor(email);
    if (!pending) return { status: "already_a_user" };
    await c.invitations.revokeInvitation(pending.id);
    return { status: "sent", invitationId: pending.id };
  } catch (e) {
    return { status: "failed", error: msg(e) };
  }
}

/** R19-2a: what Clerk currently holds for this address, WITHOUT sending or
 *  revoking anything.
 *
 *  Needed because every invite created before migration 20261001000001 has a
 *  null status: the email went, there was just nowhere to record it. Resending
 *  would backfill the status, but it also revokes the live link and sends a
 *  second email, which is a bad trade for someone who may be mid sign-up. This
 *  reads instead. */
export async function readClerkInviteStatus(email: string): Promise<ClerkInviteStatus> {
  const c = client();
  if (!c) return { status: "skipped", reason: "CLERK_SECRET_KEY is not set on this deployment." };
  try {
    const pending = await pendingFor(email);
    if (pending) return { status: "already_invited", invitationId: pending.id };
    const res = await c.users.getUserList({ emailAddress: [email] });
    const rows = (Array.isArray(res) ? res : (res?.data ?? [])) as { id: string }[];
    if (rows.length > 0) return { status: "already_a_user" };
    return { status: "failed", error: "Clerk holds no pending invitation and no account for this address." };
  } catch (e) {
    return { status: "failed", error: msg(e) };
  }
}
