// R19-2b: the New coach screen. Server-guarded on the same rule as the action,
// so the page cannot be reached by URL by someone who could not submit it. Nav
// hiding is cosmetic; this is the enforcement.

import { redirect } from "next/navigation";
import { moneyHiddenFromViewer } from "@/lib/access-policy";
import { getServerIdentity } from "@/lib/role-server";
import { NewCoachView } from "@/components/screens/team/new-coach-view";
import { DEFAULT_RATE_CARD } from "@/lib/pay/default-rate-card";

export default async function NewCoachPage() {
  const identity = await getServerIdentity();
  // TJD: the default rate card is money, so not while the owner views as a coach.
  const allowed = (identity.realRole === "owner" || identity.role === "admin") && !moneyHiddenFromViewer(identity);
  if (!allowed) redirect("/team");
  return <NewCoachView defaultCard={DEFAULT_RATE_CARD ?? null} />;
}
