import { getSops } from "@/lib/data";
import { SopsView } from "./sops-view-client";

// Server wrapper: reads the SOPs store through the data facade (live Supabase
// when persistence is on, seed otherwise) and hands it to the client view.
// Kept as SopsScreen so the route page import stays unchanged; create/edit/
// delete persist via src/lib/sops-brief-actions.ts and revalidate /sops.
export async function SopsScreen() {
  return <SopsView sops={await getSops()} />;
}
