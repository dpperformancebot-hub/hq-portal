import { redirect } from "next/navigation";
import { CoachPerformanceView } from "@/components/screens/coach/coach-performance-view";
import { getClientsData, getCoachNamesData, getCoachScorecardsData, getTransformationsData } from "@/lib/data";
import { getAcademyTracker } from "@/lib/academy-actions";
import { ACADEMY_MODULES } from "@/lib/coach-content/academy";
import { getDefaultRoute } from "@/lib/navigation";
import { forMoneyViewer, stripClientMoneyAll, stripPayRatesAll } from "@/lib/pay-visibility";
import { getServerIdentity } from "@/lib/role-server";

// Data: live GHL roster when live mode is on, seed otherwise. Clients feed the
// retention leaderboard (tenure brackets from start/end dates); the Academy
// tracker reads per-coach progress (owner + head coach only, enforced in the
// action, others get an empty list).
//
// PAY HARDENING (V2-01): plain coaches are redirected server-side (the
// client-side RouteGuard alone still streams the payload), and coach cards
// cross to the client with pay rates stripped: this screen renders
// performance only, never pay.
export default async function CoachPerformancePage() {
  const identity = await getServerIdentity();
  if (identity.role === "coach" && !identity.isHeadCoach) redirect(getDefaultRoute(identity.role));
  const [coaches, clients, coachNames, academyRows, transformations] = await Promise.all([
    getCoachScorecardsData(),
    getClientsData(),
    getCoachNamesData(),
    getAcademyTracker(),
    getTransformationsData().catch(() => []),
  ]);
  // D3: transformation counts per coach.
  const transformationsByCoach: Record<string, number> = {};
  for (const t of transformations) {
    if (t.coachId) transformationsByCoach[t.coachId] = (transformationsByCoach[t.coachId] ?? 0) + 1;
  }
  return (
    <CoachPerformanceView
      coaches={stripPayRatesAll(coaches)}
      // TJD: the retention leaderboard needs dates, not prices.
      clients={forMoneyViewer(identity, clients, stripClientMoneyAll)}
      coachNames={coachNames}
      academyRows={academyRows}
      academyModuleSizes={ACADEMY_MODULES.map((m) => m.lessons.length)}
      transformationsByCoach={transformationsByCoach}
    />
  );
}
