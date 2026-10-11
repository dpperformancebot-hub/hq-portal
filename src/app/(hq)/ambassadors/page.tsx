import { AmbassadorsScreen } from "@/components/screens/growth/ambassadors-view";
import { getServerIdentity } from "@/lib/role-server";
import { canViewAmbassadors } from "@/lib/access-policy";
import { getDefaultRoute } from "@/lib/navigation";
import { redirect } from "next/navigation";

export default async function AmbassadorsPage() {
  // R11 guard: server-side allowlist. The client RouteGuard cannot stop
  // the RSC payload from streaming, so the block must happen here.
  const _id = await getServerIdentity();
  if (!canViewAmbassadors({ role: _id.role, realRole: _id.realRole, isHeadCoach: _id.isHeadCoach, linkedCoachId: _id.linkedCoachId })) {
    redirect(getDefaultRoute(_id.role));
  }
  return <AmbassadorsScreen />;
}
