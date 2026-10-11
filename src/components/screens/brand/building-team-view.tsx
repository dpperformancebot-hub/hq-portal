import { getHiresData, liveMode } from "@/lib/data";
import { persistenceEnabled } from "@/lib/db/client";
import { BuildingTeamView } from "./building-team-view-client";

// Server wrapper: reads the hires store through the data facade (live Supabase
// when persistence is on, seed otherwise) and hands it to the client board.
// Kept as BuildingTeamScreen so the route page import stays unchanged. Create
// persists via src/lib/brand-build-actions.ts and revalidates
// /building-the-team; "New role" only enables on the live store.
export async function BuildingTeamScreen() {
  const hires = await getHiresData();
  return <BuildingTeamView hires={hires} live={liveMode() && persistenceEnabled()} />;
}
