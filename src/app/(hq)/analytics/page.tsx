import { AnalyticsView } from "@/components/screens/analytics/analytics-view";
import { getAnalyticsData } from "@/lib/data";
import { getServerIdentity } from "@/lib/role-server";
import { canViewAllClientData, moneyHiddenFromViewer } from "@/lib/access-policy";
import { forMoneyViewer, stripAnalyticsMoney } from "@/lib/pay-visibility";
import { getDefaultRoute } from "@/lib/navigation";
import { redirect } from "next/navigation";

// Funnel + lead-source table read live from GHL opportunities (seed otherwise);
// retention curve from the live client roster.
export default async function AnalyticsPage() {
  // R11 guard: server-side allowlist. The client RouteGuard cannot stop
  // the RSC payload from streaming, so the block must happen here.
  const _id = await getServerIdentity();
  if (!canViewAllClientData({ role: _id.role, realRole: _id.realRole, isHeadCoach: _id.isHeadCoach, linkedCoachId: _id.linkedCoachId })) {
    redirect(getDefaultRoute(_id.role));
  }
  // TJD: a head coach can reach this by URL; revenue per source is money.
  const analytics = forMoneyViewer(_id, await getAnalyticsData(), stripAnalyticsMoney);
  return <AnalyticsView analytics={analytics} showMoney={!moneyHiddenFromViewer(_id)} />;
}
