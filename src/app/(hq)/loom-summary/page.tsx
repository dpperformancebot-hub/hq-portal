import { LoomSummaryView } from "@/components/screens/coach-tools/loom-summary-view";
import { listVisibleSummaries } from "@/lib/check-in-summaries";
import { getCoachRosterData } from "@/lib/data";
import { getServerIdentity } from "@/lib/role-server";

// Loom Summary Assistant (2026-07-10): paste a Loom/Trellis transcript, get a
// client-facing summary + action items + coach notes in the DP tone, saved
// per client + week so the head coach reads instead of watching. Gated on
// ANTHROPIC_API_KEY exactly like the Coach Assistant. The client picker is
// the coach's OWN roster (summaries attach to clients the coach coaches);
// history shows every summary the identity may see (head coach/owner: all).
export default async function LoomSummaryPage() {
  const identity = await getServerIdentity();
  const [{ clients }, history] = await Promise.all([
    getCoachRosterData(identity.linkedCoachId, { viewer: identity }),
    listVisibleSummaries(identity),
  ]);
  return (
    <LoomSummaryView
      configured={Boolean(process.env.ANTHROPIC_API_KEY)}
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      history={history}
    />
  );
}
