import { getDigestData } from "@/lib/data";
import { DigestView } from "@/components/screens/digest/digest-view";
import { getServerIdentity } from "@/lib/role-server";
import { canViewFinancials } from "@/lib/access-policy";
import { getDefaultRoute } from "@/lib/navigation";
import { redirect } from "next/navigation";

// Owner morning view. Live from the GHL projection when live mode is on:
// gained/lost, paused, MRR, renewal calls due (getRenewals window), payouts.
export default async function DailyDigestPage() {
  // R11 guard: server-side allowlist. The client RouteGuard cannot stop
  // the RSC payload from streaming, so the block must happen here.
  const _id = await getServerIdentity();
  if (!canViewFinancials({ role: _id.role, realRole: _id.realRole, isHeadCoach: _id.isHeadCoach, linkedCoachId: _id.linkedCoachId })) {
    redirect(getDefaultRoute(_id.role));
  }
  return <DigestView data={await getDigestData()} />;
}
