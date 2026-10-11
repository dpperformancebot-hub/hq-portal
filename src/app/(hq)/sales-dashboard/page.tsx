import { SalesDashboardView } from "@/components/screens/role-dashboards/sales-dashboard-view";
import { getSalesDashboardData } from "@/lib/data";
import { getServerIdentity } from "@/lib/role-server";
import { canViewSalesPerformance } from "@/lib/access-policy";
import { getDefaultRoute } from "@/lib/navigation";
import { redirect } from "next/navigation";

// Owner's read-only preview of the sales role dashboard (M6, BUILD-SPEC
// "Owner's role-preview dashboards"). Same component, preview banner.
export default async function SalesDashboardPreviewPage() {
  // R11 guard: server-side allowlist. The client RouteGuard cannot stop
  // the RSC payload from streaming, so the block must happen here.
  const _id = await getServerIdentity();
  if (!canViewSalesPerformance({ role: _id.role, realRole: _id.realRole, isHeadCoach: _id.isHeadCoach, linkedCoachId: _id.linkedCoachId })) {
    redirect(getDefaultRoute(_id.role));
  }
  return <SalesDashboardView data={await getSalesDashboardData()} preview />;
}
