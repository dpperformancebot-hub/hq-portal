// Pre-authorised team invites (M6). Owner-only: every function here uses the
// service-role client and must be called from server actions / server
// components, never the browser. The matching sign-in claim lives in
// src/lib/role-server.ts.

import { dbAdmin } from "@/lib/db/client";
import { normaliseEmail } from "@/lib/email-normalise";
import { ROLES, type Role } from "@/lib/navigation";

export type Invite = {
  id: string;
  email: string;
  /** R13-3: extra addresses the same person may sign up with (needs
   *  migration 20260905000001; empty until applied). */
  altEmails: string[];
  name: string;
  role: Role;
  linkedCoachId: string | null;
  claimedAt: string | null;
  createdAt: string;
  /** R19-2a: what Clerk did with the email. Undefined until migration
   *  20261001000001 is applied; the UI reads that as "not recorded" rather
   *  than as a failure. */
  clerkStatus?: string | null;
  clerkError?: string | null;
};

type InviteRow = {
  id: string;
  email: string;
  alt_emails?: string[] | null;
  name: string;
  role: string;
  linked_coach_id: string | null;
  claimed_at: string | null;
  created_at: string;
};

const asRole = (v: string): Role => ((ROLES as string[]).includes(v) ? (v as Role) : "va");

function toInvite(r: InviteRow): Invite {
  return {
    id: r.id,
    email: r.email,
    altEmails: r.alt_emails ?? [],
    name: r.name,
    role: asRole(r.role),
    linkedCoachId: r.linked_coach_id,
    claimedAt: r.claimed_at,
    createdAt: r.created_at,
    clerkStatus: (r as { clerk_status?: string | null }).clerk_status ?? null,
  clerkError: (r as { clerk_error?: string | null }).clerk_error ?? null,
};
}

// select("*") so the optional alt_emails column (migration 20260905000001)
// is picked up when present and silently absent before it is applied.
export async function listInvites(): Promise<Invite[]> {
  const { data } = await dbAdmin()
    .from("invites")
    .select("*")
    .order("created_at", { ascending: false });
  return ((data ?? []) as InviteRow[]).map(toInvite);
}

/** R13-3: the unclaimed invite for any of a person's sign-in addresses,
 *  matched after normalisation (trim, lowercase, gmail dots, plus-aliases)
 *  against the invite's email AND its alt_emails. Null when nothing
 *  matches. Exactly-one semantics: two unclaimed invites matching the same
 *  mailbox is a data error, so the newest wins and the rest stay unclaimed
 *  for the owner to tidy. */
export async function findInviteForEmails(emails: string[]): Promise<Invite | null> {
  const keys = new Set(emails.map(normaliseEmail).filter(Boolean));
  if (keys.size === 0) return null;
  const { data } = await dbAdmin()
    .from("invites")
    .select("*")
    .is("claimed_at", null)
    .order("created_at", { ascending: false });
  for (const r of (data ?? []) as InviteRow[]) {
    const own = [r.email, ...(r.alt_emails ?? [])].map(normaliseEmail);
    if (own.some((k) => keys.has(k))) return toInvite(r);
  }
  return null;
}

/** R13-3: attach another address to an invite (owner action). Needs the
 *  alt_emails column; reports an honest error before the migration. */
export async function addInviteEmail(id: string, rawEmail: string): Promise<{ ok: boolean; error?: string }> {
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes("@")) return { ok: false, error: "Enter a valid email address." };
  const { data, error: readErr } = await dbAdmin().from("invites").select("id,email,alt_emails").eq("id", id).maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!data) return { ok: false, error: "That invite no longer exists." };
  const current: string[] = (data.alt_emails as string[] | null) ?? [];
  if (normaliseEmail(data.email as string) === normaliseEmail(email) || current.some((e) => normaliseEmail(e) === normaliseEmail(email))) {
    return { ok: true };
  }
  const { error } = await dbAdmin().from("invites").update({ alt_emails: [...current, email] }).eq("id", id);
  if (error) {
    if (error.code === "42703" || /alt_emails/i.test(error.message)) {
      return { ok: false, error: "Extra invite emails need migration 20260905000001 (proposed, not yet applied)." };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type CreateInviteInput = {
  name: string;
  email: string;
  role: Role;
  linkedCoachId: string | null;
};

export async function createInvite(
  input: CreateInviteInput,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  if (!email || !email.includes("@")) return { ok: false, error: "Enter a valid email address." };
  if (!(ROLES as string[]).includes(input.role)) return { ok: false, error: "Pick a role." };
  if (input.role === "coach" && !input.linkedCoachId) {
    return { ok: false, error: "Pick which coach this login is for." };
  }
  const { data, error } = await dbAdmin()
    .from("invites")
    .upsert(
      {
        email,
        name,
        role: input.role,
        linked_coach_id: input.role === "coach" ? input.linkedCoachId : null,
        claimed_at: null,
        claimed_by: null,
      },
      { onConflict: "email" },
    )
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id?: string } | null)?.id };
}

/** R19-2a: record what Clerk did with this invite, so the Team screen can show
 *  Sent / Failed / Accepted and Resend has an invitation id to work with.
 *
 *  Tolerates the columns being absent. Migration 20261001000001 adds them and
 *  is a HARD STOP, so until it is applied the email still sends and only the
 *  stored status is missing. Failing the invite over a missing status column
 *  would be the wrong trade.  */
export async function recordClerkInviteResult(
  email: string,
  result: { status: string; invitationId?: string; error?: string },
): Promise<{ stored: boolean }> {
  try {
    const { error } = await dbAdmin()
      .from("invites")
      .update({
        clerk_invitation_id: result.invitationId ?? null,
        clerk_status: result.status,
        clerk_error: result.error ?? null,
        clerk_synced_at: new Date().toISOString(),
      })
      .eq("email", email.trim().toLowerCase());
    if (error) return { stored: false };
    return { stored: true };
  } catch {
    return { stored: false };
  }
}

export async function revokeInvite(id: string): Promise<void> {
  await dbAdmin().from("invites").delete().eq("id", id);
}
