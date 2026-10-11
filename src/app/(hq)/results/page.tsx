import { ResultsView } from "@/components/screens/coach-tools/results-view";
import { getCoachResultsData, liveMode } from "@/lib/data";
import { getServerIdentity } from "@/lib/role-server";

// Coach-only route. Read view of the coach's own transformations; state
// advancing stays in the owner Results Tracker until coach write flows land.
export default async function CoachResultsPage() {
  const { linkedCoachId } = await getServerIdentity();
  return <ResultsView data={await getCoachResultsData(linkedCoachId)} live={liveMode()} />;
}
