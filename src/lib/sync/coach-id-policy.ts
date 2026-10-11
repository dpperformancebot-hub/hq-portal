// Which coach_id the nightly GHL sync may write onto an existing client row.
//
// R19-2c (2026-10-01): a DEACTIVATED coach is treated exactly like an
// unresolvable one. Removing a coach moves their clients to someone else, but
// GHL contacts still carry the old name in "Assigned Coach", so without this
// the next night's sync resolves that name and hands every client straight
// back to the coach who was removed. The name is deliberately kept in the GHL
// dropdown (old contacts reference it), which makes this the ONLY thing
// standing between a removal and it silently undoing itself.
//
// R16-1 (2026-09-21): the sync used to project the GHL "Coach" custom field
// verbatim, so a blank field in GHL NULLED a coach assigned in the portal the
// next morning. That is how 110 active DP clients ended up unassigned. Rule
// now: a blank or unresolvable GHL coach never clears an existing coach_id;
// the row keeps what it has and the run logs a drift event instead. A GHL
// coach that resolves to a coaches row still wins (GHL is source of truth on
// DP when it actually says something). Brand-new rows behave as before.

export type CoachIdDecision = {
  coachId: string | null;
  /** True when GHL was blank/unresolvable and the existing assignment was kept. */
  drift: boolean;
  reason:
    | "ghl"
    | "kept_existing_blank"
    | "kept_existing_unresolved"
    | "kept_existing_inactive_coach"
    | "none";
  /** The GHL coach name that could not be used, so the VA gets a fix list
   *  rather than a count. Only set when the name names a real but INACTIVE
   *  coach, which is a different job from a typo. */
  inactiveCoachName?: string;
};

export function decideCoachId(input: {
  /** Mapped coach id from GHL (`ghl-co-<name>`), or null when the field is blank. */
  ghlCoachId: string | null;
  /** coach_id currently on the clients row, or null/undefined for a new row. */
  existingCoachId: string | null | undefined;
  coachNameByGhlId: Map<string, string>;
  /** ACTIVE coaches only. An inactive coach must never be resolvable here. */
  coachUuidByName: Map<string, string>;
  /** Names of coaches that exist but are deactivated. */
  inactiveCoachNames?: Set<string>;
}): CoachIdDecision {
  const { ghlCoachId, existingCoachId, coachNameByGhlId, coachUuidByName } = input;
  const inactiveCoachNames = input.inactiveCoachNames ?? new Set<string>();
  const existing = existingCoachId ?? null;
  if (!ghlCoachId) {
    return existing ? { coachId: existing, drift: true, reason: "kept_existing_blank" } : { coachId: null, drift: false, reason: "none" };
  }
  const ghlName = coachNameByGhlId.get(ghlCoachId) ?? "";
  const uuid = coachUuidByName.get(ghlName) ?? null;
  if (!uuid) {
    // A name that belongs to a DEACTIVATED coach is reported separately: the
    // VA's job there is to pick the client's new coach in GHL, not to correct
    // a spelling. A new row never attaches to an inactive coach either.
    if (inactiveCoachNames.has(ghlName)) {
      return existing
        ? { coachId: existing, drift: true, reason: "kept_existing_inactive_coach", inactiveCoachName: ghlName }
        : { coachId: null, drift: true, reason: "kept_existing_inactive_coach", inactiveCoachName: ghlName };
    }
    return existing ? { coachId: existing, drift: true, reason: "kept_existing_unresolved" } : { coachId: null, drift: false, reason: "none" };
  }
  return { coachId: uuid, drift: false, reason: "ghl" };
}
