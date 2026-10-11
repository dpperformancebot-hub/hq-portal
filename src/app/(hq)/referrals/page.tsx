import { ReferralTrackerView } from "@/components/screens/referrals/referral-tracker-view";
import { listReferrals } from "@/lib/referral-actions";
import { listFeedbackReferralAnswers } from "@/lib/feedback-responses";
import { getClientsData } from "@/lib/data";
import { getServerIdentity } from "@/lib/role-server";
import { getDefaultRoute, isOpsRole } from "@/lib/navigation";
import { canViewAllClientData } from "@/lib/access-policy";
import { redirect } from "next/navigation";

// R4-2: the REAL referral tracker (replaces the fake demo screen, S1).
// R7-2: owner/ops also see the referral answers from the week-4 feedback
// forms here, the ones stripped from every coach view. Fetched server-side
// only for those roles, so the data never ships to anyone else.
export default async function ReferralsPage() {
  const identity = await getServerIdentity();
  // SEC-AUDIT (2026-09-06): the full client name list was streamed to any
  // role as picker options. All-client roles only.
  if (!canViewAllClientData({ role: identity.role, realRole: identity.realRole, isHeadCoach: identity.isHeadCoach, linkedCoachId: identity.linkedCoachId })) {
    redirect(getDefaultRoute(identity.role));
  }
  const ownerOrOps = identity.realRole === "owner" || isOpsRole(identity.role);
  const [rows, clients, fromForms] = await Promise.all([
    listReferrals(),
    getClientsData(),
    ownerOrOps ? listFeedbackReferralAnswers() : Promise.resolve(null),
  ]);
  const pickable = clients.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name));
  return <ReferralTrackerView rows={rows} clients={pickable} canEdit={ownerOrOps} fromForms={fromForms} />;
}
