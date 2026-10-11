import { PipelineView } from "@/components/screens/pipeline/pipeline-view";
import { getLeadsData } from "@/lib/data";
import { getServerIdentity } from "@/lib/role-server";
import { canViewLeadData, moneyHiddenFromViewer } from "@/lib/access-policy";
import { forMoneyViewer, stripLeadMoneyAll } from "@/lib/pay-visibility";
import { getDefaultRoute } from "@/lib/navigation";
import { redirect } from "next/navigation";

// Data: live GHL opportunities when live mode is on, seed otherwise.
export default async function PipelinePage() {
  // R11 guard: server-side allowlist. The client RouteGuard cannot stop
  // the RSC payload from streaming, so the block must happen here.
  const _id = await getServerIdentity();
  if (!canViewLeadData({ role: _id.role, realRole: _id.realRole, isHeadCoach: _id.isHeadCoach, linkedCoachId: _id.linkedCoachId })) {
    redirect(getDefaultRoute(_id.role));
  }
  // TJD: a head coach can reach this by URL; lead deal values are money.
  const leads = forMoneyViewer(_id, await getLeadsData(), stripLeadMoneyAll);
  return <PipelineView leads={leads} showMoney={!moneyHiddenFromViewer(_id)} />;
}
