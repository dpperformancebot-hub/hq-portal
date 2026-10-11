"use server";

// R12-6/8: HQ-owned per-client fields from Dan's coach walkthrough.
//   - check_in_day: the agreed weekly check-in day (0=Sun..6=Sat)
//   - plan (Weekly/Fortnightly): cadence changes happen ~1/week
//   - the detail flags feeding Results: program_done, progress_review_rank,
//     transformation_had, transformation_post_approved
// Scope: same rule as check-in logging (own roster for a plain coach; head
// coach/owner/va/admin anyone; CHECKIN_EDITS_ADMIN_ONLY lock respected).
// The GHL sync never writes these columns, so they survive every sync. The
// one caveat: PLAN is GHL-projected on DP (checkinfrequency field), so a
// portal plan edit there can be overwritten by a future sync until the field
// is updated in GHL too - the UI says so instead of pretending.

import { revalidatePath } from "next/cache";
import { canLogCheckIn } from "@/lib/access-policy";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getServerIdentity } from "@/lib/role-server";

type Result = { ok: true } | { ok: false; error: string };

const OFF = "Persistence is off. Client edits go live with the database.";
const NEEDS_MIGRATION =
  "This needs migration 20260819000001 (check-in day + client flags), which the owner must apply.";

const missingColumn = (e: { code?: string; message?: string }) =>
  e.code === "42703" || /column .* does not exist/i.test(e.message ?? "");

async function scopedClient(clientId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const identity = await getServerIdentity();
  if (identity.role !== "coach" && identity.role !== "va" && identity.role !== "admin" && identity.realRole !== "owner") {
    return { ok: false, error: "You do not have access to edit clients." };
  }
  if (
    process.env.CHECKIN_EDITS_ADMIN_ONLY === "true" &&
    identity.role === "coach" &&
    !identity.isHeadCoach &&
    identity.realRole !== "owner"
  ) {
    return { ok: false, error: "Client edits are restricted to the admin team." };
  }
  const { data: client } = await dbAdmin().from("clients").select("coach_id").eq("id", clientId).maybeSingle();
  if (!client) return { ok: false, error: "Client not found." };
  const allowed = canLogCheckIn(
    { role: identity.role, realRole: identity.realRole, isHeadCoach: identity.isHeadCoach, linkedCoachId: identity.linkedCoachId },
    (client.coach_id as string | null) ?? null,
  );
  return allowed ? { ok: true } : { ok: false, error: "That client is not on your roster." };
}

const revalidate = () => {
  revalidatePath("/check-ins");
  revalidatePath("/my-clients", "layout");
  revalidatePath("/client-database", "layout");
  revalidatePath("/results");
};

/** Set (or clear) a client's weekly check-in day. */
export async function setCheckInDayAction(clientId: string, day: number | null): Promise<Result> {
  if (!persistenceEnabled()) return { ok: false, error: OFF };
  if (day !== null && (!Number.isInteger(day) || day < 0 || day > 6)) {
    return { ok: false, error: "Pick a weekday." };
  }
  const scope = await scopedClient(clientId);
  if (!scope.ok) return scope;
  const { error } = await dbAdmin().from("clients").update({ check_in_day: day }).eq("id", clientId);
  if (error) return { ok: false, error: missingColumn(error) ? NEEDS_MIGRATION : error.message };
  revalidate();
  return { ok: true };
}

/** Switch a client between Weekly and Fortnightly cadence. */
export async function setClientPlanAction(clientId: string, plan: "Weekly" | "Fortnightly"): Promise<Result> {
  if (!persistenceEnabled()) return { ok: false, error: OFF };
  if (plan !== "Weekly" && plan !== "Fortnightly") return { ok: false, error: "Pick a cadence." };
  const scope = await scopedClient(clientId);
  if (!scope.ok) return scope;
  const { error } = await dbAdmin().from("clients").update({ plan }).eq("id", clientId);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export type ClientFlagsPatch = {
  programDone?: boolean;
  progressReviewRank?: number | null;
  transformationHad?: boolean;
  transformationPostApproved?: boolean;
};

/** Update the R12-8 detail flags. Flipping transformation_had ON ensures a
 *  draft transformation exists so the tick genuinely "flows to Results". */
export async function setClientFlagsAction(clientId: string, patch: ClientFlagsPatch): Promise<Result> {
  if (!persistenceEnabled()) return { ok: false, error: OFF };
  if (
    patch.progressReviewRank !== undefined &&
    patch.progressReviewRank !== null &&
    (!Number.isInteger(patch.progressReviewRank) || patch.progressReviewRank < 1 || patch.progressReviewRank > 4)
  ) {
    return { ok: false, error: "Progress review rank is 1 to 4." };
  }
  const scope = await scopedClient(clientId);
  if (!scope.ok) return scope;
  const row: Record<string, unknown> = {};
  if (patch.programDone !== undefined) row.program_done = patch.programDone;
  if (patch.progressReviewRank !== undefined) row.progress_review_rank = patch.progressReviewRank;
  if (patch.transformationHad !== undefined) row.transformation_had = patch.transformationHad;
  if (patch.transformationPostApproved !== undefined) row.transformation_post_approved = patch.transformationPostApproved;
  if (Object.keys(row).length === 0) return { ok: false, error: "Nothing to update." };
  const db = dbAdmin();
  const { error } = await db.from("clients").update(row).eq("id", clientId);
  if (error) return { ok: false, error: missingColumn(error) ? NEEDS_MIGRATION : error.message };

  // R12-11 inflow: a fresh transformation tick creates the Results draft.
  if (patch.transformationHad === true) {
    try {
      const { data: existing } = await db
        .from("transformations")
        .select("id")
        .eq("client_id", clientId)
        .limit(1);
      if (!existing || existing.length === 0) {
        const { data: client } = await db.from("clients").select("coach_id").eq("id", clientId).maybeSingle();
        await db.from("transformations").insert({
          client_id: clientId,
          coach_id: (client?.coach_id as string | null) ?? null,
          milestone: "Flagged from check-in",
          status: "draft",
          has_before: false,
          has_after: false,
        });
      }
    } catch {
      // Draft creation is best-effort; the flag itself is saved.
    }
  }
  revalidate();
  return { ok: true };
}
