import { redirect } from "next/navigation";
import { getTeam } from "@/lib/seed";
import { getCoachScorecardsData } from "@/lib/data";
import { listInvites } from "@/lib/invites";
import { pendingAccessRequestCount } from "@/lib/access-requests";
import { getDefaultRoute } from "@/lib/navigation";
import { clerkAuthEnabled, getServerIdentity } from "@/lib/role-server";
import {
  getHeadCoachAction,
  listLoginsAction,
  listRoleChangesAction,
  type LoginRow,
  type RoleChangeRow,
} from "@/lib/users-admin-actions";
import { TeamView } from "@/components/screens/team/team-view";
import { canManageBrandContent } from "@/lib/access-policy";

// Owner-facing Team screen. Pre-authorise team logins (email -> role/coach);
// invites resolve to real access on first Clerk sign-in once AUTH_MODE=clerk.
// Logins section (2026-07-02): live users-table management, owner-only.
// HARD EXCLUSION (2026-07-10): coaches (including the head coach) are
// redirected server-side; team pay treatments and invites never render.
export default async function TeamPage() {
  const authReady = clerkAuthEnabled();
  const identity = await getServerIdentity();
  // R11 guard: policy allowlist (replaces the old role denylist, which
  // let unnamed roles through and streamed the payload).
  if (!canManageBrandContent({ role: identity.role, realRole: identity.realRole, isHeadCoach: identity.isHeadCoach, linkedCoachId: identity.linkedCoachId })) {
    redirect(getDefaultRoute(identity.role));
  }
  const coaches = (await getCoachScorecardsData()).map((c) => ({ id: c.id, name: c.name }));
  const invites = authReady ? await listInvites().catch(() => []) : [];
  // R13-2: pending unmatched sign-ins (0 pre-migration, never an error).
  const pendingAccessRequests = authReady ? await pendingAccessRequestCount().catch(() => 0) : 0;
  let logins: LoginRow[] = [];
  let headCoachId: string | null = null;
  let roleChanges: RoleChangeRow[] = [];
  if (authReady && identity.realRole === "owner") {
    const res = await listLoginsAction();
    if (res.ok) logins = res.data;
    const head = await getHeadCoachAction();
    if (head.ok) headCoachId = head.data;
    // R7-4: the audit trail, owner-only (empty pre-migration).
    const audit = await listRoleChangesAction();
    if (audit.ok) roleChanges = audit.data;
  }
  return (
    <TeamView
      members={getTeam()}
      authReady={authReady}
      invites={invites}
      coaches={coaches}
      logins={logins}
      isOwner={identity.realRole === "owner"}
      headCoachId={headCoachId}
      roleChanges={roleChanges}
      pendingAccessRequests={pendingAccessRequests}
      canAddCoach={identity.realRole === "owner" || identity.role === "admin"}
    />
  );
}
