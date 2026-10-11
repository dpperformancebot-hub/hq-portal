"use server";

// Server writes for state migrated off localStorage (check_in_reviews,
// notification_prefs). Service-role dbAdmin(), gated by persistenceEnabled().
// Best-effort by design: the UIs keep writing localStorage too, so until the
// owner applies migration 20260630000003 these no-op gracefully (a missing
// table returns an error that the caller ignores). Internal state only, NO
// outbound path.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getServerIdentity } from "@/lib/role-server";
import { canAccessCoachData } from "@/lib/access-policy";

type Result = { ok: boolean; error?: string };

export async function setCheckInReviewedAction(
  coachId: string,
  clientId: string,
  reviewed: boolean,
): Promise<Result> {
  if (!coachId || !clientId) return { ok: false, error: "coachId and clientId required" };
  if (!persistenceEnabled()) return { ok: false, error: "off" };
  // R11: never trust the posted coachId. A plain coach may only tick their own
  // roster's reviews; head coach / owner / va may tick anyone.
  const identity = await getServerIdentity();
  if (!canAccessCoachData({ role: identity.role, realRole: identity.realRole, isHeadCoach: identity.isHeadCoach, linkedCoachId: identity.linkedCoachId }, coachId)) {
    return { ok: false, error: "That review is outside your roster." };
  }
  try {
    if (reviewed) {
      const { error } = await dbAdmin()
        .from("check_in_reviews")
        .upsert({ coach_id: coachId, client_id: clientId, reviewed: true }, { onConflict: "coach_id,client_id" });
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await dbAdmin()
        .from("check_in_reviews")
        .delete()
        .eq("coach_id", coachId)
        .eq("client_id", clientId);
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" };
  }
}

export async function setNotificationPrefAction(
  prefKey: string,
  enabled: boolean,
  scope = "owner",
): Promise<Result> {
  if (!prefKey) return { ok: false, error: "prefKey required" };
  if (!persistenceEnabled()) return { ok: false, error: "off" };
  // SEC-AUDIT (2026-09-06): `scope` was trusted from the client, so any role
  // could flip the owner's notification switches. Settings are owner/admin.
  const identity = await getServerIdentity();
  if (identity.realRole !== "owner" && identity.role !== "admin") {
    return { ok: false, error: "Only the owner or admin can change notification settings." };
  }
  try {
    const { error } = await dbAdmin()
      .from("notification_prefs")
      .upsert({ scope, pref_key: prefKey, enabled }, { onConflict: "scope,pref_key" });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" };
  }
}
