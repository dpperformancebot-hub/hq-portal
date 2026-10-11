import { notFound, redirect } from "next/navigation";
import { ClientDetail } from "@/components/screens/client-database/client-detail";
import { getClientDetailData, getCoachNamesData } from "@/lib/data";
import { listClientSummaries } from "@/lib/check-in-summaries";
import { canViewAllClientData, moneyHiddenFromViewer } from "@/lib/access-policy";
import { getDefaultRoute } from "@/lib/navigation";
import { forMoneyViewer, stripPaymentSignals, stripWrappedClientMoney } from "@/lib/pay-visibility";
import { getServerIdentity } from "@/lib/role-server";

// SEC-AUDIT P0-1 (2026-09-06): this page had NO role guard, so any signed-in
// coach could open /client-database/<id> for ANY client. Same server-side
// allowlist as the list page (nav hiding and the client RouteGuard do not
// stop the RSC payload streaming). Coaches use /my-clients/[id], which is
// roster-scoped in the data layer.
export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const identity = await getServerIdentity();
  const access = {
    role: identity.role,
    realRole: identity.realRole,
    isHeadCoach: identity.isHeadCoach,
    linkedCoachId: identity.linkedCoachId,
  };
  if (!canViewAllClientData(access)) redirect(getDefaultRoute(identity.role));

  const [rawData, coachNames] = await Promise.all([getClientDetailData(id), getCoachNamesData()]);
  if (!rawData) notFound();
  // B2 rule: PIF/WBW payment structure is owner/admin/VA-only. The head
  // coach and the money-blind ops_manager reach this page via the allowlist
  // above, so strip the signals for them exactly as the coach path does.
  const seesPaymentStructure =
    identity.realRole === "owner" || identity.role === "owner" || identity.role === "admin" || identity.role === "va";
  const signalsData = seesPaymentStructure ? rawData : { ...rawData, client: stripPaymentSignals(rawData.client) };
  // TJD: a head coach gets the profile with price, monthly equivalent, LTV
  // and billed-to-date stripped (data AND the rows that render them).
  const data = forMoneyViewer(identity, signalsData, stripWrappedClientMoney);
  const showMoney = !moneyHiddenFromViewer(identity);
  // R2-4: Loom summaries attach to their check-in rows in the history tab.
  const summaries = await listClientSummaries(id, identity);
  return (
    <ClientDetail
      client={data.client}
      checkIns={data.checkIns}
      transformations={data.transformations}
      notes={data.notes}
      coachNames={coachNames}
      canEditRate={identity.realRole === "owner"}
      showMoney={showMoney}
      summaries={summaries}
      canEditCheckIns={
        identity.realRole === "owner" || identity.role === "va" || identity.isHeadCoach ||
        (identity.role === "coach" && process.env.CHECKIN_EDITS_ADMIN_ONLY !== "true")
      }
    />
  );
}
