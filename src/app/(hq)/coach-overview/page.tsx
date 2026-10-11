import { redirect } from "next/navigation";
import { CoachOverviewView } from "@/components/screens/coach/coach-overview-view";
import { listWeekCapacity } from "@/lib/capacity";
import { getCoachScorecardsData, getTransformationsData } from "@/lib/data";
import { getDefaultRoute } from "@/lib/navigation";
import { stripPayRatesAll } from "@/lib/pay-visibility";
import { getServerIdentity } from "@/lib/role-server";

// Data: live GHL roster when live mode is on, seed otherwise. "Open portal"
// (impersonation) is owner-only; the head coach reviews via each coach's
// read-only overview page instead.
//
// PAY HARDENING (V2-01): plain coaches are redirected server-side, and the
// coach cards ship with pay rates stripped: this screen renders roster and
// performance figures only, never pay.
export default async function CoachOverviewPage() {
  const identity = await getServerIdentity();
  if (identity.role === "coach" && !identity.isHeadCoach) redirect(getDefaultRoute(identity.role));
  const [coaches, transformations, weekCapacity] = await Promise.all([
    getCoachScorecardsData(),
    getTransformationsData().catch(() => []),
    listWeekCapacity(),
  ]);
  // D3: transformation counts per coach.
  const transformationsByCoach: Record<string, number> = {};
  for (const t of transformations) {
    if (t.coachId) transformationsByCoach[t.coachId] = (transformationsByCoach[t.coachId] ?? 0) + 1;
  }
  // E2: this week's self-reported capacities.
  const capacityByCoach: Record<string, string> = {};
  for (const c of weekCapacity) capacityByCoach[c.coachId] = c.capacity;
  return (
    <CoachOverviewView
      coaches={stripPayRatesAll(coaches)}
      canAddCoach={identity.realRole === "owner" || identity.role === "admin"}
      canOpenPortal={identity.realRole === "owner"}
      transformationsByCoach={transformationsByCoach}
      capacityByCoach={capacityByCoach}
    />
  );
}
