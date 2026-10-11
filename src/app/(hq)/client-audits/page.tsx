import { AuditsView } from "@/components/screens/audits/audits-view";
import { getAudits, getCoachAuditsData } from "@/lib/data";
import { getServerIdentity } from "@/lib/role-server";
import { canOwnerReviewAudits, canViewAllClientData } from "@/lib/access-policy";
import { getDefaultRoute } from "@/lib/navigation";
import { redirect } from "next/navigation";

// Live read from the HQ client_audits table (seed in demo). A coach sees ONLY
// their own clients' audits (scoped in getCoachAuditsData); owner/VA and the
// head coach see the full cadence. The client view edits status/resolved
// through the audit-actions server actions, which are keyed by client_id and
// stay within the scoped set.
export default async function ClientAuditsPage() {
  const { role, linkedCoachId, isHeadCoach, realRole, impersonating } = await getServerIdentity();
  // SEC-AUDIT (2026-09-06): the "else" branch handed the full audit cadence
  // to any non-coach role (sales, ambassador_mgr). Plain coach = own roster;
  // everyone else must be an all-client role.
  const allClient = canViewAllClientData({ role, realRole, isHeadCoach, linkedCoachId });
  if (role !== "coach" && !allClient) redirect(getDefaultRoute(role));
  const audits = role === "coach" && !isHeadCoach ? await getCoachAuditsData(linkedCoachId) : await getAudits();
  // C5: coaches (incl. the head coach, whose request routes to the owner) can
  // file an audit-request ticket; routing is decided server-side.
  // R4-5: the owner review loop is owner/admin-only (canOwnerReviewAudits).
  // Coaches and head coaches never see it; on TJD neither does an owner
  // viewing as a coach (view-as is exactly the coach view). setOwnerReview
  // refuses with the same rule server-side.
  const canOwnerReview = canOwnerReviewAudits({ role, realRole, impersonating });
  // The owner's private rating + notes never cross to a viewer who may not
  // review (hiding the control alone would still ship them in the payload).
  const visible = canOwnerReview ? audits : audits.map((a) => ({ ...a, ownerRating: null, ownerNotes: null }));
  return <AuditsView audits={visible} canRequestAudit={role === "coach"} canOwnerReview={canOwnerReview} />;
}
