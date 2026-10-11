import { VaDashboardView } from "@/components/screens/role-dashboards/va-dashboard-view";
import { getVaDashboardData } from "@/lib/data";
import { getServerIdentity } from "@/lib/role-server";
import { canViewAllClientData } from "@/lib/access-policy";
import { forMoneyViewer, stripWrappedClientMoneyAll } from "@/lib/pay-visibility";
import { getDefaultRoute } from "@/lib/navigation";
import { redirect } from "next/navigation";

// Owner's read-only preview of the VA role dashboard (M6, BUILD-SPEC
// "Owner's role-preview dashboards"). Same component, preview banner.
export default async function VaDashboardPreviewPage() {
  // R11 guard: server-side allowlist. The client RouteGuard cannot stop
  // the RSC payload from streaming, so the block must happen here.
  const _id = await getServerIdentity();
  if (!canViewAllClientData({ role: _id.role, realRole: _id.realRole, isHeadCoach: _id.isHeadCoach, linkedCoachId: _id.linkedCoachId })) {
    redirect(getDefaultRoute(_id.role));
  }
  const data = await getVaDashboardData();
  // TJD: the renewal rows wrap full client records; strip prices for a coach.
  const safe = forMoneyViewer(_id, data, (d) => ({ ...d, renewals: stripWrappedClientMoneyAll(d.renewals) }));
  return <VaDashboardView data={safe} preview />;
}
