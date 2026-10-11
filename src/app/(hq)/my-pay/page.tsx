import { redirect } from "next/navigation";
import { MyPayView } from "@/components/screens/coach-tools/my-pay-view";
import { TjdMyPayView } from "@/components/screens/pay/tjd-my-pay-view";
import { getMyPayData } from "@/lib/data";
import { BRAND } from "@/lib/brand";
import { getServerIdentity } from "@/lib/role-server";
import { canViewOwnPayScreen } from "@/lib/access-policy";
import { getDefaultRoute } from "@/lib/navigation";

// Coach-only route: own pay run-rate (labelled estimate; full payroll rules
// pending). Pre-scoped to the logged-in coach.
// FAIRNESS RULE (owner, 2026-07-11): a head coach reviewing another coach's
// portal never sees that coach's pay; My Pay is blocked while they impersonate.
// Brand rule (Brand.pay.coachCanSeePay): on TJD coaches and head coaches do
// not see pay at all, so canViewOwnPayScreen refuses them and they land on
// their dashboard (redirect, never an error page). So does the owner while
// viewing as a coach on TJD (exactly the coach's view); the owner not viewing
// as anyone keeps it. DP: the owner keeps it while impersonating.
export default async function MyPayPage() {
  const id = await getServerIdentity();
  // R11 guard: policy allowlist (replaces the old role denylist, which let
  // unnamed roles through and streamed the payload).
  if (!canViewOwnPayScreen({ role: id.role, realRole: id.realRole, isHeadCoach: id.isHeadCoach, linkedCoachId: id.linkedCoachId })) {
    redirect(getDefaultRoute(id.role));
  }
  const { linkedCoachId, impersonating, realIsHeadCoach, realRole, isHeadCoach } = id;
  if (impersonating && realIsHeadCoach) redirect("/dashboard");

  // R19-5: a weeks-paid brand gets the weeks-paid screen. TJD was falling
  // through to DP's check-in-code model, which showed one client because TJD
  // has one check-in row. DP is untouched by this branch.
  if (BRAND.pay.model === "weeks-paid") {
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    return <TjdMyPayView initialMonth={month} />;
  }
  // R12-14: plain coaches get KPIs + grid; the bonus ledger is owner detail.
  return (
    <MyPayView
      data={await getMyPayData(linkedCoachId)}
      payConfigured={BRAND.pay.confirmed}
      showBonusTracker={realRole === "owner" || isHeadCoach}
    />
  );
}
