import { getContentPosts, liveMode } from "@/lib/data";
import { getContentAccounts } from "@/lib/seed";
import { persistenceEnabled } from "@/lib/db/client";
import { ContentPlannerView } from "./content-planner-view-client";

// Server wrapper: reads the content_posts store through the data facade (live
// Supabase when persistence is on, seed otherwise) and hands it to the client
// board. Kept as ContentPlannerScreen so the route page import stays unchanged.
// Create/edit/delete persist via src/lib/content-actions.ts and revalidate
// /content-planner. Writes are gated on the same condition the read path uses
// so the board only enables editing when it is showing the live store.
export async function ContentPlannerScreen() {
  const posts = await getContentPosts();
  // Account rows: the brand's channel list, unioned with any account a live
  // post references so no saved post is ever orphaned off the grid.
  const accounts = Array.from(new Set([...getContentAccounts(), ...posts.map((p) => p.account)]));
  return <ContentPlannerView accounts={accounts} posts={posts} live={liveMode() && persistenceEnabled()} />;
}
