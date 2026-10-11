import { FeedbackView } from "@/components/screens/coach-tools/feedback-view";
import { listFeedback } from "@/lib/feedback-actions";
import { getServerIdentity } from "@/lib/role-server";

// R3-3: coach feedback into the portal. Plain coaches see their own
// submissions; the head coach and owner see the team's.
export default async function FeedbackPage() {
  const identity = await getServerIdentity();
  const rows = await listFeedback();
  const teamWide = identity.realRole === "owner" || identity.isHeadCoach;
  return <FeedbackView rows={rows} teamWide={teamWide} />;
}
