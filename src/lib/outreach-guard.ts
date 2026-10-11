// HARD SAFETY RULE (owner, 2026-06-16): NO ONE GETS CONTACTED.
//
// While the two-way GHL integration is in development, no real client or lead
// may be contacted by the HQ: no messages sent, no automation-triggered
// outreach, nothing that reaches a person.
//
// This is the single gate every outbound-contact path MUST check before it
// sends: the Inbox composer / send-message write-back, and any automation
// action that messages someone. It defaults OFF, so contact is impossible
// unless OUTREACH_ENABLED is explicitly set to "true" in the environment.
//
// TEST LANE (owner-approved 2026-07-03): while the global switch stays OFF,
// sends are permitted to EXACTLY ONE GHL contact id, set in
// OUTREACH_TEST_CONTACT_ID (the owner's own throwaway contact). This lets the
// send path be built and verified end to end without any real client being
// reachable. Unset = no test lane. The global switch flip remains a
// deliberate owner decision (documented in CLAUDE.md when it happens).
//
// IMPORTANT: writing OTHER fields back to GHL (coach, start date, status) can
// still trigger GHL-side workflows that contact people. So write-back testing
// must use a throwaway test contact regardless of this flag, and the team
// should know which GHL workflows are live. See docs/ghl-twoway-integration-brief.md.

export function outreachAllowed(): boolean {
  return process.env.OUTREACH_ENABLED === "true";
}

/** True only for the single allowlisted test contact (and only when the env
 *  var is set). Never true for a missing/empty id. */
export function isOutreachTestContact(ghlContactId: string | null | undefined): boolean {
  const allowed = (process.env.OUTREACH_TEST_CONTACT_ID ?? "").trim();
  return allowed.length > 0 && !!ghlContactId && ghlContactId === allowed;
}

/** Call at the top of any send path. Throws unless outreach is explicitly
 *  enabled (or the target is the single allowlisted test contact), so a
 *  missing or failed check fails CLOSED (no accidental contact). */
export function assertOutreachAllowed(target?: { ghlContactId?: string | null }): void {
  if (outreachAllowed()) return;
  if (target && isOutreachTestContact(target.ghlContactId)) return;
  throw new Error(
    "Outreach is disabled (OUTREACH_ENABLED is not 'true'). No contact was sent. " +
      "This enforces the owner's no-contact safety rule; enable deliberately only when ready.",
  );
}
