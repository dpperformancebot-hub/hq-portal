import { getAutomationsData } from "@/lib/data";
import { AutomationsView } from "./automations-view-client";

// Server wrapper: reads the automations config store through the data facade
// (persisted rows merged over the seed catalog when persistence is on, seed
// otherwise) and hands it to the client view. On/off toggles and rule edits
// persist via src/lib/automations-actions.ts and revalidate /automations. Kept
// as AutomationsScreen so the route page import stays unchanged.
export async function AutomationsScreen() {
  const { automations, live } = await getAutomationsData();
  return <AutomationsView automations={automations} live={live} />;
}
