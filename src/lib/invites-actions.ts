"use server";

// Server actions for the Team invite screen. Owner-only; thin wrappers over
// src/lib/invites.ts that re-check the caller's role and revalidate the page.

import { revalidatePath } from "next/cache";
import { addInviteEmail, createInvite, recordClerkInviteResult, revokeInvite, type CreateInviteInput } from "@/lib/invites";
import { getServerIdentity } from "@/lib/role-server";
import { dbAdmin } from "@/lib/db/client";
import {
  readClerkInviteStatus,
  resendClerkInvitation,
  revokeClerkInvitationFor,
  sendClerkInvitation,
  type ClerkInviteStatus,
} from "@/lib/clerk-invites";

// R19-2a: owner AND admin, per the approved R19-2 matrix. This used to be
// owner only, and on the effective role rather than the real one, so an owner
// viewing as someone else lost the power and Jameela never had it.
async function canInvite(): Promise<boolean> {
  const id = await getServerIdentity();
  return id.realRole === "owner" || id.role === "admin";
}

// The invites table needs the HQ datastore. createInvite/revokeInvite reach
// Supabase via dbAdmin(), which throws if the env is missing and surfaces a
// Postgres error if the migration (20260615000001_invites.sql) has not been
// applied. Wrap both so the Team screen always gets a friendly message instead
// of a crashed server action.
const DB_HINT =
  "Could not reach the invites store. Confirm Supabase is configured and the invites migration is applied.";

export type CreateInviteResult =
  | { ok: true; invite: ClerkInviteStatus }
  | { ok: false; error: string };

export async function createInviteAction(input: CreateInviteInput): Promise<CreateInviteResult> {
  if (!(await canInvite())) return { ok: false, error: "Not allowed." };
  try {
    const res = await createInvite(input);
    if (!res.ok) return { ok: false, error: res.error ?? "Could not save the invite." };

    // R19-2a: THE FIX. This path wrote a portal row and stopped, so nobody was
    // ever emailed and, with the Clerk instance set to Restricted, the person
    // could not sign themselves up either. The invite existed and was
    // unusable. Now Clerk is told to send.
    const invite = await sendClerkInvitation(input.email.trim().toLowerCase(), {
      role: input.role,
      linkedCoachId: input.role === "coach" ? input.linkedCoachId ?? null : null,
      inviteId: res.id ?? null,
    });
    await recordClerkInviteResult(input.email, {
      status: invite.status,
      invitationId: "invitationId" in invite ? invite.invitationId : undefined,
      error: invite.status === "failed" ? invite.error : undefined,
    });

    revalidatePath("/team");
    // The portal row is real either way; the email is reported honestly rather
    // than assumed, so a failure shows as Failed with a Resend instead of
    // looking like success.
    return { ok: true, invite };
  } catch (e) {
    console.error("createInviteAction failed:", e instanceof Error ? e.message : e);
    return { ok: false, error: DB_HINT };
  }
}

/** R19-2a: record what Clerk already holds for this invite, sending nothing
 *  and revoking nothing. This is how an invite created before the status
 *  columns existed gets a real status without disturbing a live sign-up link. */
export async function checkInviteStatusAction(
  email: string,
): Promise<{ ok: true; invite: ClerkInviteStatus } | { ok: false; error: string }> {
  if (!(await canInvite())) return { ok: false, error: "Not allowed." };
  const clean = String(email ?? "").trim().toLowerCase();
  if (!clean.includes("@")) return { ok: false, error: "That is not a valid email." };
  const invite = await readClerkInviteStatus(clean);
  await recordClerkInviteResult(clean, {
    status: invite.status,
    invitationId: "invitationId" in invite ? invite.invitationId : undefined,
    error: invite.status === "failed" ? invite.error : undefined,
  });
  revalidatePath("/team");
  return { ok: true, invite };
}

/** R19-2a: resend the email for an existing portal invite. */
export async function resendInviteAction(
  email: string,
): Promise<{ ok: true; invite: ClerkInviteStatus } | { ok: false; error: string }> {
  if (!(await canInvite())) return { ok: false, error: "Not allowed." };
  const clean = String(email ?? "").trim().toLowerCase();
  if (!clean.includes("@")) return { ok: false, error: "That is not a valid email." };
  const { data } = await dbAdmin().from("invites").select("id,role,linked_coach_id").eq("email", clean).maybeSingle();
  const row = data as { id?: string; role?: string; linked_coach_id?: string | null } | null;
  if (!row) return { ok: false, error: "No portal invite for that address." };
  const invite = await resendClerkInvitation(clean, {
    role: row.role ?? "coach",
    linkedCoachId: row.linked_coach_id ?? null,
    inviteId: row.id ?? null,
  });
  await recordClerkInviteResult(clean, {
    status: invite.status,
    invitationId: "invitationId" in invite ? invite.invitationId : undefined,
    error: invite.status === "failed" ? invite.error : undefined,
  });
  revalidatePath("/team");
  return { ok: true, invite };
}

export async function revokeInviteAction(id: string) {
  if (!(await canInvite())) return { ok: false, error: "Not allowed." };
  if (!id) return { ok: false, error: "Missing invite id." };
  try {
    // Revoke in Clerk FIRST. Deleting the portal row while a live Clerk
    // invitation is still outstanding would leave a working sign-up link for
    // an invite the portal no longer knows about.
    const { data } = await dbAdmin().from("invites").select("email").eq("id", id).maybeSingle();
    const email = (data as { email?: string } | null)?.email;
    if (email) await revokeClerkInvitationFor(email);
    await revokeInvite(id);
    revalidatePath("/team");
    return { ok: true };
  } catch (e) {
    console.error("revokeInviteAction failed:", e instanceof Error ? e.message : e);
    return { ok: false, error: DB_HINT };
  }
}

/** R13-3: attach another sign-in address to an invite. Owner-only. */
export async function addInviteEmailAction(id: string, email: string) {
  if (!(await canInvite())) return { ok: false, error: "Not allowed." };
  if (!id) return { ok: false, error: "Missing invite id." };
  try {
    const res = await addInviteEmail(id, email);
    if (res.ok) revalidatePath("/team");
    return res;
  } catch (e) {
    console.error("addInviteEmailAction failed:", e instanceof Error ? e.message : e);
    return { ok: false, error: DB_HINT };
  }
}
