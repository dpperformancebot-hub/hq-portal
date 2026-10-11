// Server-side role resolution (M6). Two modes:
//
//   AUTH_MODE=clerk (flag, default OFF): the Clerk session's user id is
//   looked up in the Supabase users table (clerk_id -> role,
//   linked_coach_id). Requires real Clerk keys + clerkMiddleware wiring +
//   HQ_PERSISTENCE (activation steps, owner-driven).
//
//   default (dev preview): the hq-dev-role cookie written by the dev role
//   switcher. NOT auth, grants no real access; the cookie-gated password
//   wall (middleware) is still the only real lock until Clerk is live.
//
// R13-2 (owner-approved 2026-09-05, replaces the old "va" default): in
// clerk mode an authenticated user with NO users-table row and NO matching
// pre-authorised invite does NOT get a role. They are redirected to the
// /no-access holding screen (which shows the address they signed up with
// and files a pending access request for an approver). "va" was never the
// least privilege: its nav spans every coach's clients. A matching invite
// (R13-3: any of the user's Clerk addresses, normalised) is claimed on first
// sign-in: it creates the users row and is then marked used.

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLES, type Role } from "@/lib/navigation";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { findInviteForEmails } from "@/lib/invites";

/** Where an authenticated-but-unmatched user is parked (R13-2). Lives
 *  outside the (hq) shell so nothing there ever renders for them. */
export const NO_ACCESS_PATH = "/no-access";

export type ServerIdentity = {
  role: Role;
  /** Display name of the REAL signed-in user (users.name, Clerk name
   *  fallback). Null in dev preview / when unknown; the shell then falls back
   *  to brand initials. Not overridden by impersonation, the layout swaps in
   *  the coach's name for the profile when an owner is inside a coach portal. */
  displayName: string | null;
  /** coaches.id (uuid) when the user is a linked coach; null otherwise. */
  linkedCoachId: string | null;
  /** True when a REAL owner or head coach is viewing a coach's portal. */
  impersonating: boolean;
  /** The actual signed-in role, before any impersonation override. */
  realRole: Role;
  /** Head-coach elevation (coaches.role = 'head_coach') for the EFFECTIVE
   *  coach identity: oversight nav + all-coach visibility, never pay. */
  isHeadCoach: boolean;
  /** Head-coach status of the REAL signed-in coach; survives impersonation
   *  so the head coach can exit another coach's portal. */
  realIsHeadCoach: boolean;
  /** users.id of the signed-in person (clerk mode, once their users row
   *  exists). Null in dev preview, on the first request of an invite claim,
   *  and while an owner views as someone else (the viewed person is not this
   *  login). Used to match tasks assigned by id (tasks.assigned_to). */
  userId?: string | null;
};

/** Cookie set by the startImpersonation action (owner or head coach,
 *  src/lib/impersonation-actions.ts); holds the coaches.id being viewed. */
const IMPERSONATE_COOKIE = "hq-impersonate-coach";

export function clerkAuthEnabled(): boolean {
  return process.env.AUTH_MODE === "clerk";
}

const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as string[]).includes(v);

type RealIdentity = {
  role: Role;
  userId?: string | null;
  linkedCoachId: string | null;
  name: string | null;
  /** R13-2: signed in, but no users row and no invite. The caller MUST NOT
   *  treat `role` as real; getServerIdentity redirects to /no-access. */
  noAccess?: boolean;
};

async function resolveRealIdentity(): Promise<RealIdentity> {
  if (clerkAuthEnabled()) {
    let signedIn = false;
    try {
      // Dynamic import: keeps the Clerk server runtime out of the bundle
      // path entirely while the flag is off.
      const { auth, currentUser } = await import("@clerk/nextjs/server");
      const { userId } = await auth();
      signedIn = Boolean(userId);
      if (userId && persistenceEnabled()) {
        const { data } = await dbAdmin()
          .from("users")
          .select("id,role,linked_coach_id,name")
          .eq("clerk_id", userId)
          .maybeSingle();
        if (data && isRole(data.role)) {
          // Prefer the name we stored on the users row; fall back to the
          // Clerk profile name so a freshly-linked user is never nameless.
          let name = (data.name as string | null) ?? null;
          if (!name) {
            try {
              const u = await currentUser();
              name = u?.fullName || u?.firstName || null;
            } catch {
              /* keep null */
            }
          }
          return {
            role: data.role,
            linkedCoachId: data.linked_coach_id ?? null,
            name,
            userId: (data as { id?: string | null }).id ?? null,
          };
        }
        // No users row yet: claim a pre-authorised invite on first sign-in
        // (R13-3: matched on EVERY address on the Clerk account, after
        // normalisation), create the users row, then mark the invite claimed.
        const user = await currentUser();
        const emails = (user?.emailAddresses ?? []).map((e) => e.emailAddress).filter(Boolean);
        const primary = user?.primaryEmailAddress?.emailAddress;
        if (primary && !emails.includes(primary)) emails.unshift(primary);
        if (emails.length > 0) {
          const inv = await findInviteForEmails(emails);
          if (inv) {
            await dbAdmin()
              .from("users")
              .upsert(
                {
                  clerk_id: userId,
                  role: inv.role,
                  name: inv.name,
                  linked_coach_id: inv.linkedCoachId ?? null,
                },
                { onConflict: "clerk_id" },
              );
            await dbAdmin()
              .from("invites")
              .update({ claimed_at: new Date().toISOString(), claimed_by: userId })
              .eq("id", inv.id);
            return { role: inv.role, linkedCoachId: inv.linkedCoachId ?? null, name: inv.name ?? null };
          }
        }
      }
    } catch {
      // fall through: a signed-in user we could not resolve gets NO access,
      // never a role by accident.
    }
    if (signedIn) return { role: "va", linkedCoachId: null, name: null, noAccess: true };
    // No Clerk session at all (the GHL iframe path stays on the password
    // gate, decision 24): unchanged least-privilege behaviour.
    return { role: "va", linkedCoachId: null, name: null };
  }

  const jar = await cookies();
  const cookie = jar.get("hq-dev-role")?.value;
  // Dev preview: an optional coach id (set by the coach picker) scopes the coach
  // views to that coach, so the owner can preview each coach on their own data
  // before real logins. Null -> the facade falls back to the head coach.
  const previewCoach = jar.get("hq-dev-coach")?.value || null;
  return { role: isRole(cookie) ? cookie : "owner", linkedCoachId: previewCoach, name: null };
}

// React cache dedupes per request inside the RSC runtime; in plain Node
// (the unit suite imports this module through the action files) it is not a
// function, so fall back to the bare function there.
const perRequest: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

// Head-coach flag, deduped per request (React cache) so every page reading
// the identity shares one lookup instead of re-querying the coaches table.
// Dynamic import: data.ts (via expenses-actions and friends) imports this
// module, so a static import here would close a require cycle.
const headCoachFlag = perRequest(async (coachId: string | null): Promise<boolean> => {
  try {
    const { getIsHeadCoach } = await import("@/lib/data");
    return await getIsHeadCoach(coachId);
  } catch {
    return false;
  }
});

// Effective identity = the real one, unless a REAL owner has an active
// impersonation cookie, in which case the whole app renders as that coach
// (the owner is "inside" the coach's portal). OWNER-ONLY (2026-07-11, owner
// decision): the head coach does NOT enter coach portals; they get the
// read-only, pay-free per-coach overview at /coach-overview/[coachId]. We
// re-check the real role here so a stale or forged cookie on a non-owner
// session is ignored.
export async function getServerIdentity(): Promise<ServerIdentity> {
  const real = await resolveRealIdentity();
  // R13-2: an unmatched sign-in never gets a shell. redirect() throws, so no
  // caller (layout, page, server action) ever sees a role for this user.
  if (real.noAccess) redirect(NO_ACCESS_PATH);
  const jar = await cookies();
  const impersonateCoach = jar.get(IMPERSONATE_COOKIE)?.value || null;
  // Only resolve the head-coach flag for coach identities: everyone else can
  // never be a head coach, and skipping the lookup keeps owner pages free of it.
  const realIsHeadCoach = real.role === "coach" ? await headCoachFlag(real.linkedCoachId) : false;
  const mayImpersonate = real.role === "owner";
  if (mayImpersonate && impersonateCoach && impersonateCoach !== real.linkedCoachId) {
    return {
      role: "coach",
      displayName: real.name,
      linkedCoachId: impersonateCoach,
      impersonating: true,
      realRole: real.role,
      // The portal renders as the TARGET coach: elevation only if they are one.
      isHeadCoach: await headCoachFlag(impersonateCoach),
      realIsHeadCoach,
      userId: null,
    };
  }
  return {
    role: real.role,
    displayName: real.name,
    linkedCoachId: real.linkedCoachId,
    impersonating: false,
    realRole: real.role,
    isHeadCoach: realIsHeadCoach,
    realIsHeadCoach,
    userId: real.userId ?? null,
  };
}

export async function getServerRole(): Promise<Role> {
  return (await getServerIdentity()).role;
}

// R11: server-side policy guards. Each re-resolves the caller's identity and
// returns a denial string, or null when allowed. Server actions call these
// FIRST so a directly-invoked action (bypassing nav) is refused, not just
// hidden. Kept here (not in access-policy.ts) because they touch cookies/db;
// the pure decisions they wrap live in access-policy.ts and are unit-tested.
import {
  canManageBrandContent,
  canViewFinancials,
  canGrantRoles as policyCanGrantRoles,
  DENY,
  type AccessIdentity,
} from "@/lib/access-policy";

const toAccess = (i: ServerIdentity): AccessIdentity => ({
  role: i.role,
  realRole: i.realRole,
  isHeadCoach: i.isHeadCoach,
  linkedCoachId: i.linkedCoachId,
});

/** Guard for the owner/admin/ops_manager brand + content management actions. */
export async function assertBrandManager(): Promise<string | null> {
  const id = await getServerIdentity();
  return canManageBrandContent(toAccess(id)) ? null : DENY.brand;
}

/** Guard for financial reads/writes (owner + admin). */
export async function assertFinancialsAccess(): Promise<string | null> {
  const id = await getServerIdentity();
  return canViewFinancials(toAccess(id)) ? null : DENY.financials;
}

/** Guard for owner-only writes (role grants, login management). */
export async function assertOwnerOnly(): Promise<string | null> {
  const id = await getServerIdentity();
  return policyCanGrantRoles(toAccess(id)) ? null : DENY.ownerOnly;
}
