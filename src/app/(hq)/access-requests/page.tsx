import { redirect } from "next/navigation";
import { AccessRequestsView } from "@/components/screens/access/access-requests-view";
import { canApproveAccessRequests, grantableRoles } from "@/lib/access-policy";
import { listAccessRequests } from "@/lib/access-requests";
import { getCoachNamesData } from "@/lib/data";
import { persistenceEnabled } from "@/lib/db/client";
import { getDefaultRoute } from "@/lib/navigation";
import { getServerIdentity } from "@/lib/role-server";

// R13-2: approve sign-ins that matched no invite. Owner, head of ops
// (admin) and the head coach; enforced HERE server-side (nav hiding is
// cosmetic) and again in every action.
export default async function AccessRequestsPage() {
  const identity = await getServerIdentity();
  const access = {
    role: identity.role,
    realRole: identity.realRole,
    isHeadCoach: identity.realIsHeadCoach,
    linkedCoachId: identity.linkedCoachId,
  };
  if (!canApproveAccessRequests(access)) redirect(getDefaultRoute(identity.role));

  const { rows, migrationPending } = persistenceEnabled()
    ? await listAccessRequests()
    : { rows: [], migrationPending: false };
  const coachNames = await getCoachNamesData();
  const coaches = Object.entries(coachNames)
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <AccessRequestsView
      rows={rows}
      coaches={coaches}
      roles={grantableRoles(access)}
      migrationPending={migrationPending}
      persistence={persistenceEnabled()}
    />
  );
}
