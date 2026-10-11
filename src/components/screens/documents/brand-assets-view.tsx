import { getBrandAssets, liveMode } from "@/lib/data";
import { persistenceEnabled } from "@/lib/db/client";
import { BrandAssetsView } from "./brand-assets-view-client";

// Server wrapper: reads the brand_assets store through the data facade (live
// Supabase when persistence is on, seed otherwise) and hands it to the client
// view. Kept as BrandAssetsScreen so the route page import stays unchanged.
// Create/edit/delete persist via src/lib/brand-assets-actions.ts and revalidate
// /brand-assets. Writes are gated on the same condition the read path uses so
// the view only enables editing on the live store. Actual file upload (Supabase
// Storage) stays Phase 2.
export async function BrandAssetsScreen() {
  return <BrandAssetsView assets={await getBrandAssets()} live={liveMode() && persistenceEnabled()} />;
}
