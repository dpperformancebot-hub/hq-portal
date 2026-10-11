import { getBrief } from "@/lib/data";
import { BriefView } from "./brief-view-client";

// Server wrapper: reads the brief store through the data facade (live Supabase
// when persistence is on, seed otherwise) and hands it to the client view.
// Kept as BriefScreen so the route page import stays unchanged; create/edit/
// delete persist via src/lib/sops-brief-actions.ts and revalidate /brief.
export async function BriefScreen() {
  return <BriefView items={await getBrief()} />;
}
