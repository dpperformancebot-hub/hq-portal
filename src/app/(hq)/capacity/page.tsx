import { redirect } from "next/navigation";
import { CapacityManageView } from "@/components/screens/capacity/capacity-manage-view";
import { CapacityPollView } from "@/components/screens/capacity/capacity-poll-view";
import { ErrorState } from "@/components/ui";
import { listCapacitySubmissions, openWeekStart, weekMonday } from "@/lib/capacity";
import { getCoachScorecardsData } from "@/lib/data";
import { persistenceEnabled } from "@/lib/db/client";
import { getDefaultRoute } from "@/lib/navigation";
import { getServerIdentity } from "@/lib/role-server";

// R7-1 (Dan's capacity mockup): one route, role-routed. A plain coach gets
// the weekly poll; owner/admin/ops_manager get the manager views (Results +
// Capacity log); the head coach gets both, the poll living in a My
// submission tab (dual-role pattern, same as the taskboard). Sales and VA
// have no capacity surface and bounce home.
export default async function CapacityPage() {
  const identity = await getServerIdentity();
  const manager =
    identity.realRole === "owner" ||
    identity.role === "owner" ||
    identity.role === "admin" ||
    identity.role === "ops_manager";
  const headCoach = identity.role === "coach" && identity.isHeadCoach;
  const plainCoach = identity.role === "coach" && !identity.isHeadCoach;
  if (!manager && !headCoach && !plainCoach) redirect(getDefaultRoute(identity.role));

  // NO silent fallback (owner rule, same as the taskboard): capacity is a
  // live datastore feature. Without persistence, say so instead of rendering
  // an empty poll that quietly loses answers.
  if (!persistenceEnabled()) {
    return (
      <ErrorState
        title="Weekly Capacity needs the HQ datastore"
        message="Set HQ_PERSISTENCE=true with Supabase configured. Capacity answers are live data; there is no demo fallback."
      />
    );
  }

  // Mockup week model: the open week is the COMING Monday's week, due the
  // Friday before; it closes the moment it begins.
  const openWeek = openWeekStart();
  const weekLabel = `Week starting ${new Date(openWeek).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
  })}`;
  const { rows, notesAvailable } = await listCapacitySubmissions(8);

  const ownData = (coachId: string) => {
    const mine = rows
      .filter((r) => r.coachId === coachId)
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    const cur = mine.find((r) => r.weekStart === openWeek) ?? null;
    return {
      weekLabel,
      current: cur ? { band: cur.band, note: cur.note, submittedAt: cur.submittedAt } : null,
      history: mine
        .filter((r) => r.weekStart !== openWeek)
        .map((r) => ({ weekStart: r.weekStart, band: r.band, note: r.note })),
    };
  };

  if (plainCoach) {
    if (!identity.linkedCoachId) redirect(getDefaultRoute(identity.role));
    const mine = ownData(identity.linkedCoachId);
    return (
      <div className="space-y-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Coach tools</div>
          <h1 className="font-display text-2xl tracking-display text-fg">Weekly Capacity</h1>
        </div>
        <CapacityPollView weekLabel={mine.weekLabel} current={mine.current} history={mine.history} />
      </div>
    );
  }

  const scorecards = await getCoachScorecardsData();
  const weeks = Array.from({ length: 8 }, (_, i) => weekMonday(1, Date.now() - i * 7 * 86_400_000));
  return (
    <CapacityManageView
      coaches={scorecards.map((c) => ({ id: c.id, name: c.name, clients: c.activeClients }))}
      weeks={weeks}
      openWeek={openWeek}
      submissions={rows}
      notesAvailable={notesAvailable}
      mySubmission={headCoach && identity.linkedCoachId ? ownData(identity.linkedCoachId) : null}
    />
  );
}
