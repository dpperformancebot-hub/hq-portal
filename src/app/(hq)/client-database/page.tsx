import { ClientDatabaseView } from "@/components/screens/client-database/client-database-view";
import { getClientsData, getCoachNamesData } from "@/lib/data";
import { getServerIdentity } from "@/lib/role-server";
import { canViewAllClientData, moneyHiddenFromViewer } from "@/lib/access-policy";
import { forMoneyViewer, stripClientMoneyAll } from "@/lib/pay-visibility";
import { getDefaultRoute } from "@/lib/navigation";
import { redirect } from "next/navigation";

// Data: live GHL roster when live mode is on, seed otherwise (src/lib/data.ts).
export default async function ClientDatabasePage() {
  // R11 guard: server-side allowlist. The client RouteGuard cannot stop
  // the RSC payload from streaming, so the block must happen here.
  const _id = await getServerIdentity();
  if (!canViewAllClientData({ role: _id.role, realRole: _id.realRole, isHeadCoach: _id.isHeadCoach, linkedCoachId: _id.linkedCoachId })) {
    redirect(getDefaultRoute(_id.role));
  }
  const [allClients, coachNames] = await Promise.all([getClientsData(), getCoachNamesData()]);
  // TJD (Brand.pay.coachCanSeePay false): the head coach reaches this list,
  // so every client price is stripped before it streams and the $ column
  // (and its CSV export) is dropped. Owner/admin/VA/ops unchanged; DP unchanged.
  const clients = forMoneyViewer(_id, allClients, stripClientMoneyAll);
  return <ClientDatabaseView clients={clients} coachNames={coachNames} showMoney={!moneyHiddenFromViewer(_id)} />;
}
