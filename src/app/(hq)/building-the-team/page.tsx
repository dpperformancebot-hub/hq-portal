import { BuildingTeamScreen } from "@/components/screens/brand/building-team-view";
import { getServerIdentity } from "@/lib/role-server";
import { canManageBrandContent } from "@/lib/access-policy";
import { getDefaultRoute } from "@/lib/navigation";
import { redirect } from "next/navigation";

export default async function BuildingTeamPage() {
  // R11 guard: server-side allowlist. The client RouteGuard cannot stop
  // the RSC payload from streaming, so the block must happen here.
  const _id = await getServerIdentity();
  if (!canManageBrandContent({ role: _id.role, realRole: _id.realRole, isHeadCoach: _id.isHeadCoach, linkedCoachId: _id.linkedCoachId })) {
    redirect(getDefaultRoute(_id.role));
  }
  return <BuildingTeamScreen />;
}
