// R19-2c: server-guarded on the same rule as the action, so the screen cannot
// be reached by URL by someone who could not complete it.

import { redirect } from "next/navigation";
import { getServerIdentity } from "@/lib/role-server";
import { RemoveCoachView } from "@/components/screens/team/remove-coach-view";

export default async function RemoveCoachPage({ params }: { params: Promise<{ coachId: string }> }) {
  const { coachId } = await params;
  const identity = await getServerIdentity();
  if (!(identity.realRole === "owner" || identity.role === "admin")) redirect("/team");
  return <RemoveCoachView coachId={coachId} />;
}
