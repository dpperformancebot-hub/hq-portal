import { redirect } from "next/navigation";
import { SalesPerformanceScreen } from "@/components/screens/sales/sales-performance-view";
import { getDefaultRoute } from "@/lib/navigation";
import { getServerIdentity } from "@/lib/role-server";
import { canViewSalesPerformance } from "@/lib/access-policy";

// R6-4: ops_manager is excluded from the sales screens.
export default async function SalesPerformancePage() {
  const identity = await getServerIdentity();
  // R11 guard: policy allowlist (replaces the old role denylist, which
  // let unnamed roles through and streamed the payload).
  if (!canViewSalesPerformance({ role: identity.role, realRole: identity.realRole, isHeadCoach: identity.isHeadCoach, linkedCoachId: identity.linkedCoachId })) {
    redirect(getDefaultRoute(identity.role));
  }
  return <SalesPerformanceScreen />;
}
