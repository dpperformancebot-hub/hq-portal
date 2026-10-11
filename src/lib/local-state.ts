// Read layer for state migrated off localStorage (check_in_reviews,
// notification_prefs). Server-only (service-role dbAdmin). Returns empty when
// persistence is off or the table is not yet created (migration 20260630000003
// is owner-gated), so the UI falls back to its localStorage behaviour.

import { dbAdmin, persistenceEnabled } from "@/lib/db/client";

/** Client ids a coach has ticked "reviewed" on the Check-ins screen. */
export async function listReviewedClientIds(coachId: string): Promise<string[]> {
  if (!coachId || !persistenceEnabled()) return [];
  try {
    const { data, error } = await dbAdmin()
      .from("check_in_reviews")
      .select("client_id")
      .eq("coach_id", coachId)
      .eq("reviewed", true);
    if (error || !data) return [];
    return data.map((r) => r.client_id as string);
  } catch {
    return [];
  }
}

/** The owner's saved notification toggles, keyed by pref id. */
export async function getNotificationPrefs(scope = "owner"): Promise<Record<string, boolean>> {
  if (!persistenceEnabled()) return {};
  try {
    const { data, error } = await dbAdmin()
      .from("notification_prefs")
      .select("pref_key,enabled")
      .eq("scope", scope);
    if (error || !data) return {};
    return Object.fromEntries(data.map((r) => [r.pref_key as string, r.enabled as boolean]));
  } catch {
    return {};
  }
}
