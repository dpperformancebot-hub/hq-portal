import { InboxView } from "@/components/screens/inbox/inbox-view";
import { getInboxData } from "@/lib/data";
import { getServerIdentity } from "@/lib/role-server";
import { canViewLeadData, moneyHiddenFromViewer } from "@/lib/access-policy";
import { forMoneyViewer, stripConversationMoneyAll } from "@/lib/pay-visibility";
import { getDefaultRoute } from "@/lib/navigation";
import { redirect } from "next/navigation";

export default async function InboxPage() {
  // R11 guard: server-side allowlist. The client RouteGuard cannot stop
  // the RSC payload from streaming, so the block must happen here.
  const _id = await getServerIdentity();
  if (!canViewLeadData({ role: _id.role, realRole: _id.realRole, isHeadCoach: _id.isHeadCoach, linkedCoachId: _id.linkedCoachId })) {
    redirect(getDefaultRoute(_id.role));
  }
  const { conversations: all, live } = await getInboxData();
  // TJD: a head coach can reach this by URL; a contact's LTV is money.
  const conversations = forMoneyViewer(_id, all, stripConversationMoneyAll);
  return <InboxView conversations={conversations} live={live} showMoney={!moneyHiddenFromViewer(_id)} />;
}
