import { DashboardView } from "@/components/screens/dashboard/dashboard-view";
import { getCoachCapacityPair, openWeekStart } from "@/lib/capacity";
import { listPauses } from "@/lib/pause-actions";
import { listCoachFeedbackResponses } from "@/lib/feedback-responses";
import { daysUntilReactivation, reactivatesSoon } from "@/lib/pause-math";
import { CoachDashboardView, type OversightCounts } from "@/components/screens/role-dashboards/coach-dashboard-view";
import { SalesDashboardView } from "@/components/screens/role-dashboards/sales-dashboard-view";
import { VaDashboardView } from "@/components/screens/role-dashboards/va-dashboard-view";
import {
  getCoachDashboardData,
  getDashboardData,
  getSalesDashboardData,
  getVaDashboardData,
  liveMode,
} from "@/lib/data";
import { persistenceEnabled } from "@/lib/db/client";
import { listOnboarding } from "@/lib/onboarding-actions";
import { getServerIdentity } from "@/lib/role-server";
import { payVisibleToViewer } from "@/lib/access-policy";
import { stripCoachDashboardPay } from "@/lib/pay-visibility";
import { getTasks as getSeedTasks } from "@/lib/seed";
import { listTasks } from "@/lib/tasks";
import { isTaskAssignedTo, isTaskOpenedBy, type ViewerKeys } from "@/lib/task-assignees";

// /dashboard is every role's default screen; the role decides WHICH dashboard
// renders (M6). Role comes from getServerIdentity: Clerk + users table when
// AUTH_MODE=clerk, else the dev preview cookie (owner by default).
// ?state=empty still renders the owner all-zero empty-state variant.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const identity = await getServerIdentity();
  const { role, linkedCoachId, isHeadCoach, impersonating, realIsHeadCoach, realRole } = identity;

  // C4: every role's dashboard carries a "Today I will" card, so the task
  // list loads once up front (items are ordinary tasks rows, type "Today").
  const tasksLive = liveMode() && persistenceEnabled();
  const allTasks = persistenceEnabled() ? await listTasks().catch(() => []) : getSeedTasks();

  if (role === "coach") {
    const full = await getCoachDashboardData(linkedCoachId, { viewer: identity });
    // R7-1: the Friday reminder's DAY check moved client-side so "Friday"
    // means Friday in the coach's own timezone; the server only says whether
    // the open week (the coming Monday's, per the mockup week model) is
    // answered. Impersonating owners are spared; the answer must come from
    // the coach.
    const capacity = !impersonating
      ? {
          submitted: (await getCoachCapacityPair(linkedCoachId)).nextWeek !== null,
          weekLabel: `Week starting ${new Date(openWeekStart()).toLocaleDateString(undefined, {
            day: "numeric",
            month: "long",
          })}`,
        }
      : null;
    // FAIRNESS RULE (owner, 2026-07-11): a head coach reviewing another
    // coach's portal sees performance only, never that coach's pay. The
    // owner impersonating still sees everything.
    // Brand rule (Brand.pay.coachCanSeePay): on TJD a coach or head coach
    // never sees pay, and neither does the owner viewing as a coach (the
    // coach view is exactly what the coach sees). DP: owner keeps it.
    const hidePay = (impersonating && realIsHeadCoach) || !payVisibleToViewer({ realRole, role });
    // Strip, do not just hide: RSC props ship in the payload unrendered.
    const data = hidePay ? stripCoachDashboardPay(full) : full;
    // Head coach: a small oversight strip on top of their own coach dashboard.
    // auditsToReview is already all-coach for a head coach (getCoachAuditsData);
    // onboarding "needs review" mirrors the tracker's derivation (work
    // submitted, not yet approved).
    let oversight: OversightCounts | null = null;
    if (isHeadCoach) {
      const { rows } = await listOnboarding();
      oversight = {
        auditsOpen: data.auditsToReview,
        onboardingToReview: rows.filter(
          (r) => !r.approved && (r.nutritionPlanMade || r.workoutPlanMade || !!r.loomUrl),
        ).length,
      };
    }
    // Same scope AND matcher as the coach taskboard (C2/C3): own + opened
    // tasks only, matched on users.id or any of the viewer's names
    // (normalised), so a task assigned by invite name before first sign-in
    // shows here once they log in. An owner viewing as a coach matches on the
    // coach's name only (their own login is not the coach's).
    const coachToday = (coachName: string) => {
      const keys: ViewerKeys = impersonating
        ? { userId: null, names: [coachName] }
        : { userId: identity.userId ?? null, names: [coachName, identity.displayName ?? ""].filter(Boolean) };
      return {
        tasks: allTasks.filter((t) => isTaskAssignedTo(t, keys) || isTaskOpenedBy(t, keys)),
        viewer: coachName,
        viewerNames: keys.names.slice(1),
        viewerUserId: keys.userId ?? null,
        live: tasksLive,
      };
    };
    return (
      <>
        <CoachDashboardView
          capacity={capacity}
          data={data}
          oversight={oversight}
          hidePay={hidePay}
          formResponses={await listCoachFeedbackResponses(linkedCoachId)}
          today={data.coach ? coachToday(data.coach.name) : null}
        />
      </>
    );
  }
  if (role === "sales") {
    return <SalesDashboardView data={await getSalesDashboardData()} />;
  }
  if (role === "va") {
    return <VaDashboardView data={await getVaDashboardData()} viewerName={identity.displayName} />;
  }

  const { state } = await searchParams;
  const empty = state === "empty";
  // R4-1: pauses ending within 4 days feed the dashboard callout.
  const reactivatingSoon = (await listPauses())
    .filter((p) => reactivatesSoon(p.pauseEnd))
    .map((p) => ({ name: p.clientName, days: daysUntilReactivation(p.pauseEnd) ?? 0 }))
    .sort((a, b) => a.days - b.days);
  const { metrics, coachLeaderboard, salesLeaderboard, clientIndex, coachNames, expensesSummary, capacityWeek } =
    await getDashboardData();
  return (
    <DashboardView
      metrics={metrics}
      empty={empty}
      coachLeaderboard={coachLeaderboard}
      salesLeaderboard={salesLeaderboard}
      clientIndex={clientIndex}
      coachNames={coachNames}
      expenses={expensesSummary}
      tasks={allTasks}
      tasksLive={tasksLive}
      reactivatingSoon={reactivatingSoon}
      capacityWeek={capacityWeek}
    />
  );
}
