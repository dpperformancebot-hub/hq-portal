import { getReportsData, liveMode } from "@/lib/data";
import { persistenceEnabled } from "@/lib/db/client";
import { ReportsView } from "./reports-view-client";

// Server wrapper: reads the reports store through the data facade (live
// Supabase when persistence is on, seed otherwise) and hands it to the client
// view. Kept as ReportsScreen so the route page import stays unchanged.
// Create persists via src/lib/reports-actions.ts and revalidates /reports.
// Writes are gated on the same condition the read path uses, so the view only
// enables "New report" when it is showing the live store.
export async function ReportsScreen() {
  const reports = await getReportsData();
  return <ReportsView reports={reports} live={liveMode() && persistenceEnabled()} />;
}
