import { redirect } from "next/navigation";
import { FinancialsView } from "@/components/screens/financials/financials-view";
import { getFinancialsData } from "@/lib/data";
import { listExpenses } from "@/lib/expenses-actions";
import { getDefaultRoute } from "@/lib/navigation";
import { getServerIdentity } from "@/lib/role-server";
import { canViewFinancials } from "@/lib/access-policy";

// Data: live GHL projection when live mode is on, seed otherwise.
// Cash facts (transactions, refunds, past due) stay empty until the Stripe
// feed (retainer phase); MRR/plan/payout figures are live. Expenses
// (2026-07-02): owner-entered recurring costs from the expenses table.
//
// HARD EXCLUSION (2026-07-10): money is owner-only. Coaches (INCLUDING the
// head coach) get redirected server-side before any financial data renders;
// the client-side RouteGuard alone would still stream the payload.
export default async function FinancialsPage() {
  const identity = await getServerIdentity();
  // R11 guard: policy allowlist (replaces the old role denylist, which
  // let unnamed roles through and streamed the payload).
  if (!canViewFinancials({ role: identity.role, realRole: identity.realRole, isHeadCoach: identity.isHeadCoach, linkedCoachId: identity.linkedCoachId })) {
    redirect(getDefaultRoute(identity.role));
  }
  // R6-4: Mykael (ops_manager) sees everything EXCEPT financials.
  const [financials, expenses] = await Promise.all([getFinancialsData(), listExpenses()]);
  return <FinancialsView financials={financials} expenses={expenses} isOwner={identity.realRole === "owner"} />;
}
