// Process-level coach id -> name map. Populated whenever the live data layer
// loads coaches, so the synchronous name helpers (coachNameLoose) can resolve
// real Supabase coach UUIDs that aren't in the seed list. Per request the live
// load runs before any render that needs a name, so the map is warm in time.

const names = new Map<string, string>();

export function registerCoaches(coaches: { id: string; name: string }[]): void {
  for (const c of coaches) if (c?.id && c?.name) names.set(c.id, c.name);
}

export function lookupCoachName(id: string): string | null {
  return names.get(id) ?? null;
}
