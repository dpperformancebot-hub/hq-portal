import { getCampaignsData, getLeadMagnetsData, liveMode } from "@/lib/data";
import { persistenceEnabled } from "@/lib/db/client";
import { MarketingView } from "./marketing-view-client";

// Server wrapper: reads the campaigns and lead_magnets stores through the data
// facade (live Supabase when persistence is on, seed otherwise) and hands them
// to the client view. Kept as MarketingScreen so the route page import stays
// unchanged. Create persists via src/lib/marketing-actions.ts and revalidates
// /marketing-campaigns. These lists track growth only; nothing is sent or
// launched. "New campaign" / "Add magnet" only enable on the live store.
export async function MarketingScreen() {
  const [campaigns, magnets] = await Promise.all([getCampaignsData(), getLeadMagnetsData()]);
  return <MarketingView campaigns={campaigns} magnets={magnets} live={liveMode() && persistenceEnabled()} />;
}
