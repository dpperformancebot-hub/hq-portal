import { coachName } from "@/lib/seed";
import { lookupCoachName } from "@/lib/coach-registry";

/** Coach display name that works for live Supabase coach UUIDs (via the
 *  registry, populated when live data loads), seed ids (co1...), and live GHL
 *  ids (ghl-co-<name>), without needing the coach list passed down. */
export function coachNameLoose(coachId: string | null): string {
  if (!coachId) return "Unassigned";
  const live = lookupCoachName(coachId);
  if (live) return live;
  if (coachId.startsWith("ghl-co-")) {
    const raw = coachId.slice("ghl-co-".length);
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  return coachName(coachId);
}

/** Build a coach-name resolver from a server-resolved id->name map. Use this in
 *  client components: the coach-registry that backs coachNameLoose is a
 *  server-process map and is empty in the browser, so live Supabase coach UUIDs
 *  would otherwise hydrate as "Unassigned". The map is passed in as a prop and
 *  is therefore correct on both the server render and after hydration.
 *  Falls back to coachNameLoose for ids absent from the map (seed/ghl ids). */
export function makeCoachNamer(
  coachNames?: Record<string, string>,
): (coachId: string | null) => string {
  return (coachId) => (coachId && coachNames?.[coachId]) ?? coachNameLoose(coachId);
}
