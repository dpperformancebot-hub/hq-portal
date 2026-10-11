import { getBrandBuildData, liveMode } from "@/lib/data";
import { persistenceEnabled } from "@/lib/db/client";
import { BuildingBrandView } from "./building-brand-view-client";

// Server wrapper: reads the brand_build_tasks store through the data facade
// (live Supabase when persistence is on, seed otherwise) and hands it to the
// client board. Kept as BuildingBrandScreen so the route page import stays
// unchanged. Create persists via src/lib/brand-build-actions.ts and
// revalidates /building-the-brand; "New task" only enables on the live store.
export async function BuildingBrandScreen() {
  const tasks = await getBrandBuildData();
  return <BuildingBrandView tasks={tasks} live={liveMode() && persistenceEnabled()} />;
}
