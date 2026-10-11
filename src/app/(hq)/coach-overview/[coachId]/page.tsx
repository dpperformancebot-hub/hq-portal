import { notFound, redirect } from "next/navigation";
import { CoachDetailOverview } from "@/components/screens/coach/coach-detail-overview";
import { getCoachDashboardData, getCoachNamesData } from "@/lib/data";
import { stripCoachDashboardPay } from "@/lib/pay-visibility";
import { getServerIdentity } from "@/lib/role-server";
import { canViewCoachOverview } from "@/lib/access-policy";

// Read-only per-coach overview for the OWNER and the HEAD COACH (2026-07-11):
// how the head coach reviews a coach without entering their portal. Pay is
// deliberately absent (CoachDetailOverview renders performance only).
export default async function CoachDetailPage({
  params,
}: {
  params: Promise<{ coachId: string }>;
}) {
  const identity = await getServerIdentity();
  if (!canViewCoachOverview(identity)) redirect("/dashboard");
  const { coachId } = await params;
  // Unknown ids 404: the coach-context resolver falls back to the head coach
  // (dev-preview crutch), which would silently render the wrong coach here.
  const coachNames = await getCoachNamesData();
  if (!coachNames[coachId]) notFound();
  // ownOnly: this page reviews ONE coach, so the head coach's own page shows
  // HIS roster, not the all-coach widening his dashboard gets.
  const full = await getCoachDashboardData(coachId, { ownOnly: true, viewer: identity });
  // Strip pay BEFORE the data crosses to the client component: RSC props ship
  // in the page payload even when never rendered, and this page is pay-free
  // by contract (the head coach must not see pay anywhere). V2-01: the coach
  // card's pay RATES are money too, strip them with the totals.
  const data = stripCoachDashboardPay(full);
  // Dropdown switcher: jump straight between coach overviews (owner request).
  const coaches = Object.entries(coachNames)
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return <CoachDetailOverview data={data} coaches={coaches} />;
}
