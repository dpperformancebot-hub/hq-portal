import { redirect } from "next/navigation";
import { JourneyView } from "@/components/screens/journey/journey-view";
import { listWeekCapacity } from "@/lib/capacity";
import { listFeedbackFormSent, listMilestones } from "@/lib/engagement-actions";
import { getClientsData, getCoachNamesData, getCoachScorecardsData } from "@/lib/data";
import { getDefaultRoute } from "@/lib/navigation";
import { getServerIdentity } from "@/lib/role-server";
import { isOpsRole } from "@/lib/navigation";
import { canAssignClients, canEditStartDate } from "@/lib/access-policy";

// Data: live GHL roster when live mode is on, seed otherwise.
//
// Phase B: this is an ops screen (owner nav only). Coaches and sales are
// redirected server-side; PIF/WBW on Unassigned cards is owner/VA-only (B2),
// and the Assign write stays owner-only inside assignCoachAction.
export default async function ClientJourneyPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const identity = await getServerIdentity();
  // R16-5c: /assign-clients (sidebar) lands here with the Unassigned filter on.
  const { filter } = await searchParams;
  if (identity.role === "coach" || identity.role === "sales") {
    redirect(getDefaultRoute(identity.role));
  }
  const [clients, coachNames, weekCapacity, feedbackSent, milestones, scorecards] = await Promise.all([
    getClientsData(),
    getCoachNamesData(),
    listWeekCapacity(),
    listFeedbackFormSent(),
    listMilestones(),
    getCoachScorecardsData(),
  ]);
  // R16-5b: roster load per coach for the assign picker (n/max, full = disabled).
  const coachLoad: Record<string, { active: number; max: number }> = {};
  for (const sc of scorecards) coachLoad[sc.id] = { active: sc.activeClients, max: sc.maxCapacity };
  // E2: this week's capacity answers, shown beside coaches in the assign picker.
  const capacityByCoach: Record<string, string> = {};
  for (const c of weekCapacity) capacityByCoach[c.coachId] = c.capacity;
  // R5-1: W12 review-call state per client for the card ticks.
  const w12ByClient: Record<string, "booked" | "done"> = {};
  for (const m of milestones) if (m.week === 12) w12ByClient[m.clientId] = m.state;
  return (
    <JourneyView
      clients={clients}
      coachNames={coachNames}
      canAssign={canAssignClients(identity)}
      canEditStartDate={canEditStartDate(identity)}
      showPayment={identity.realRole === "owner" || isOpsRole(identity.role)}
      capacityByCoach={capacityByCoach}
      coachLoad={coachLoad}
      initialFilter={filter === "unassigned" ? "unassigned" : "all"}
      feedbackSentIds={[...feedbackSent]}
      w12ByClient={w12ByClient}
    />
  );
}
