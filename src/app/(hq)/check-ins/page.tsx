import { CheckInsView } from "@/components/screens/coach-tools/check-ins-view";
import { getCoachRosterData, liveMode } from "@/lib/data";
import { getServerIdentity } from "@/lib/role-server";
import { listReviewedClientIds } from "@/lib/local-state";
import { canViewCheckInScreens } from "@/lib/access-policy";
import { getDefaultRoute } from "@/lib/navigation";
import { redirect } from "next/navigation";

// Coach-only route. Live mode shows the awaiting-feed banner (Kahunas has
// no API); demo mode renders seed check-in codes.
export default async function CheckInsPage() {
  const identity = await getServerIdentity();
  // R11 guard: policy allowlist (replaces the old role denylist, which
  // let unnamed roles through and streamed the payload).
  if (!canViewCheckInScreens({ role: identity.role, realRole: identity.realRole, isHeadCoach: identity.isHeadCoach, linkedCoachId: identity.linkedCoachId })) {
    redirect(getDefaultRoute(identity.role));
  }
  const data = await getCoachRosterData(identity.linkedCoachId, { viewer: identity });
  const reviewedIds = data.coach ? await listReviewedClientIds(data.coach.id) : [];
  // I2 config toggle: CHECKIN_EDITS_ADMIN_ONLY="true" makes the grid
  // read-only for plain coaches (owner/head coach keep editing). Default off
  // = the sheets behaviour, coaches mark their own roster.
  const adminOnly = process.env.CHECKIN_EDITS_ADMIN_ONLY === "true";
  const canEdit = !adminOnly || identity.isHeadCoach || identity.realRole === "owner";
  return <CheckInsView data={data} live={liveMode()} reviewedIds={reviewedIds} canEdit={canEdit} />;
}
