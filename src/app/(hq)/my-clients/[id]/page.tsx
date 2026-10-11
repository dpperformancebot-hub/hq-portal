import { notFound } from "next/navigation";
import { getCoachClientDetail } from "@/lib/data";
import { listClientSummaries } from "@/lib/check-in-summaries";
import { getServerIdentity } from "@/lib/role-server";
import { CoachClientDetailView } from "@/components/screens/coach-tools/coach-client-detail-view";

// Coach-facing client profile. Scoped: getCoachClientDetail returns null unless
// the client is in this coach's roster (head coach sees any), so a coach can't
// open another coach's client by URL. Lives under /my-clients so the RouteGuard
// (which checks the first path segment) allows it for the coach role.
export default async function CoachClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const identity = await getServerIdentity();
  const data = await getCoachClientDetail(id, identity.linkedCoachId, identity);
  if (!data) notFound();
  // Loom check-in summaries (2026-07-10), newest first; [] until the
  // check_in_summaries migration is applied.
  const summaries = await listClientSummaries(id, identity);
  // R9-2: inline editing mirrors the check-ins grid rule (CHECKIN_EDITS_ADMIN_ONLY).
  const adminOnly = process.env.CHECKIN_EDITS_ADMIN_ONLY === "true";
  const canEditCheckIns = !adminOnly || identity.isHeadCoach || identity.realRole === "owner";
  return <CoachClientDetailView data={data} summaries={summaries} canEditCheckIns={canEditCheckIns} />;
}
