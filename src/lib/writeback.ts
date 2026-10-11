// Two-way write-back integration points (M5, stubbed).
//
// HQ is a read-mostly projection of GHL (see OWNERSHIP BOUNDARY in
// BUILD-SPEC.md). A small number of fields are HQ-initiated and must flow back
// to the source of truth: coach assignment and a client's start date. The real
// write path is:
//
//   HQ action -> Supabase (HQ-owned row) -> GHL API write-back (PUT contact)
//
// That path is GATED (needs the Supabase project + a GHL write-scoped token).
// Until then these functions are deliberate NO-OPS that name the integration
// point, validate their inputs, and return a typed result so callers can wire
// real handlers now and the swap is a single-file change. They never mutate
// anything and never touch the network.
//
// When activating: replace each body with the Supabase upsert + GHL write,
// keep the signature, and flip STUBBED to false.

export const WRITEBACK_STUBBED = true;

export type WritebackResult =
  | { ok: true; stubbed: boolean }
  | { ok: false; error: string };

/** Dev-only trace. No client PII (ids only) per the security rules. */
function trace(point: string, payload: Record<string, string | null>): void {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.info(`[writeback:${point}] (stubbed)`, payload);
  }
}

/**
 * GHL mirror for a client's coach assignment.
 *
 * The HQ-owned half (writing clients.coach_id in Supabase) is LIVE and lives in
 * src/lib/coach-assign-actions.ts: that is internal HQ data, contacts nobody,
 * and is not gated. This function is only the optional GHL side, PUT the
 * contact's "Assigned Coach" custom field, which stays gated because a GHL
 * field write can trigger GHL-side workflows that contact people.
 */
export async function assignCoach(
  clientId: string,
  coachId: string | null,
): Promise<WritebackResult> {
  if (!clientId) return { ok: false, error: "clientId required" };
  trace("assignCoach", { clientId, coachId });
  // TODO(M5): PUT the GHL contact's Assigned Coach custom field. The Supabase
  // write already happened in coach-assign-actions; this only mirrors it to
  // GHL. Until the write token + project exist, no-op.
  return { ok: true, stubbed: WRITEBACK_STUBBED };
}

/**
 * Set or correct a client's coaching start date.
 * Drives week number / journey stage; mirrored back to the GHL "Start Date".
 */
export async function setStartDate(
  clientId: string,
  isoDate: string,
): Promise<WritebackResult> {
  if (!clientId) return { ok: false, error: "clientId required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return { ok: false, error: "isoDate must be YYYY-MM-DD" };
  }
  trace("setStartDate", { clientId, isoDate });
  // TODO(M5): upsert clients.start_date in Supabase, then PUT the GHL contact's
  // Start Date custom field (epoch ms). Until then, no-op.
  return { ok: true, stubbed: WRITEBACK_STUBBED };
}
