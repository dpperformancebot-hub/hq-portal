import { EngagementView, type EngagementClientRow } from "@/components/screens/engagement/engagement-view";
import { listFeedbackFormSent, listMilestones } from "@/lib/engagement-actions";
import { getActiveClientsData, getCoachNamesData, termEnded } from "@/lib/data";
import { WEEKS } from "@/lib/ghl/map";
import { paymentStructure } from "@/lib/journey-buckets";
import { redirect } from "next/navigation";
import { getDefaultRoute } from "@/lib/navigation";
import { getServerIdentity } from "@/lib/role-server";
import { isOpsRole } from "@/lib/navigation";
import { BRAND } from "@/lib/brand";

// R4-3: engagement milestone tracker. Owner/VA/head coach see everyone; a
// plain coach sees their own roster (writes re-checked server-side).
export default async function EngagementPage() {
  const identity = await getServerIdentity();
  // R17-3: per-brand visibility. DP can drop va/ops_manager in one config line
  // once Dan decides; today every role in the default list still sees it.
  if (!BRAND.engagement.visibleTo.includes(identity.role)) redirect(getDefaultRoute(identity.role));
  // R17-3: active-only comes from the data layer now, not a filter here.
  const [clients, coachNames, milestones, feedbackSent] = await Promise.all([
    getActiveClientsData(),
    getCoachNamesData(),
    listMilestones(),
    listFeedbackFormSent(),
  ]);

  const storedByClient = new Map<string, Record<number, "booked" | "done">>();
  for (const m of milestones) {
    const rec = storedByClient.get(m.clientId) ?? {};
    rec[m.week] = m.state;
    storedByClient.set(m.clientId, rec);
  }

  const scoped =
    identity.role === "coach" && !identity.isHeadCoach
      ? clients.filter((c) => c.coachId === identity.linkedCoachId)
      : clients;

  const rows: EngagementClientRow[] = scoped
    .map((c) => ({
      clientId: c.id,
      clientName: c.name,
      coachName: c.coachId ? coachNames[c.coachId] ?? "Unassigned" : "Unassigned",
      currentWeek: WEEKS(c.startDate),
      isPif: paymentStructure(c) === "PIF",
      feedbackFormSent: feedbackSent.has(c.id),
      stored: storedByClient.get(c.id) ?? {},
      // R17-3: still active, but their term end has passed. Shown, not hidden:
      // deciding they churned is the owner's call, not the portal's.
      termEnded: termEnded(c),
    }))
    .sort((a, b) => b.currentWeek - a.currentWeek);

  const canEdit = identity.role === "coach" || isOpsRole(identity.role) || identity.realRole === "owner";
  // R16-7a: when coaches own the FB form (DP), the ops roles see the column
  // read-only. Coaches and the real owner keep ticking it.
  const fbFormEditable =
    canEdit && !(BRAND.engagement.fbFormOwner === "coach" && isOpsRole(identity.role) && identity.realRole !== "owner");
  return <EngagementView rows={rows} canEdit={canEdit} fbFormEditable={fbFormEditable} />;
}
