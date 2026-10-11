import { redirect } from "next/navigation";
import { OnboardingView } from "@/components/screens/onboarding/onboarding-view";
import { listOnboarding } from "@/lib/onboarding-actions";
import { getDefaultRoute } from "@/lib/navigation";
import { getServerIdentity } from "@/lib/role-server";

// Client onboarding tracker. RESTRICTED (owner rule 2026-07-24): owner and
// head coach only. Enforced HERE server-side (the sidebar link is also gone
// for regular coaches, but hiding a link is not a lock) and again in the
// data layer (resolveAccess in onboarding-actions).
export default async function OnboardingPage() {
  const { role, realRole, isHeadCoach } = await getServerIdentity();
  const allowed = realRole === "owner" || (role === "coach" && isHeadCoach);
  if (!allowed) redirect(getDefaultRoute(role));
  const { rows, canReview, canEdit } = await listOnboarding();
  return <OnboardingView rows={rows} canReview={canReview} canEdit={canEdit} />;
}
