import { getCoachNamesData, getRenewalsData } from "@/lib/data";
import { RenewalsView, type RenewalsTab } from "@/components/screens/renewals/renewals-view";
import { getServerIdentity } from "@/lib/role-server";
import { getDefaultRoute, isOpsRole } from "@/lib/navigation";
import { canViewAllClientData } from "@/lib/access-policy";
import { forMoneyViewer, stripWrappedClientMoneyAll } from "@/lib/pay-visibility";
import { redirect } from "next/navigation";

// Re-sign call list: active clients whose term ends inside the call window
// (7 days overdue to 45 days out). Live from GHL term end dates.
// D4: ?tab=next30 deep-links the Next 30 days tab (dashboard Expiring card).
// D5: renewal notes are owner/VA-editable (re-checked server-side).
export default async function RenewalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // SEC-AUDIT (2026-09-06): this page streamed every coach's expiring
  // clients to any signed-in role (nav hiding is not a lock). Same
  // server-side allowlist as the client database.
  const identity = await getServerIdentity();
  if (!canViewAllClientData({ role: identity.role, realRole: identity.realRole, isHeadCoach: identity.isHeadCoach, linkedCoachId: identity.linkedCoachId })) {
    redirect(getDefaultRoute(identity.role));
  }
  const [{ tab }, allRows, coachNames] = await Promise.all([searchParams, getRenewalsData(), getCoachNamesData()]);
  // TJD: each row wraps a full client record; a head coach gets it with every
  // price stripped (the view renders none, but RSC props ship unrendered).
  const rows = forMoneyViewer(identity, allRows, stripWrappedClientMoneyAll);
  const initialTab: RenewalsTab = tab === "next30" || tab === "overdue" ? tab : "all";
  return (
    <RenewalsView
      rows={rows}
      coachNames={coachNames}
      initialTab={initialTab}
      canEditNotes={identity.realRole === "owner" || isOpsRole(identity.role)}
    />
  );
}
