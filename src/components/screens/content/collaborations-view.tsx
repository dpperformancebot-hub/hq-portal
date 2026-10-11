import { getCollaborations, liveMode } from "@/lib/data";
import { persistenceEnabled } from "@/lib/db/client";
import { CollaborationsView } from "./collaborations-view-client";

// Server wrapper: reads the collaborations store through the data facade (live
// Supabase when persistence is on, seed otherwise) and hands it to the client
// board. Kept as CollaborationsScreen so the route page import stays unchanged.
// Create/edit/delete/status-change persist via src/lib/content-actions.ts and
// revalidate /content-collaborations. Writes are gated on the same condition
// the read path uses so the board only enables editing on the live store.
export async function CollaborationsScreen() {
  return (
    <CollaborationsView
      collaborations={await getCollaborations()}
      live={liveMode() && persistenceEnabled()}
    />
  );
}
