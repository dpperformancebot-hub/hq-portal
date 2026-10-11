// R4-3: pure milestone maths for engagement calls, from the master sheet
// "Engagement tracker": every client gets a W14 call; PIF clients then every
// 16 weeks (W30/46/62/78/94/110, continuing while they stay). Only
// booked/done is stored; "due" is derived from the client's current week.

export type MilestoneState = "upcoming" | "due" | "booked" | "done";

/** Milestone weeks a client can accrue: W14 for everyone; PIF adds +16
 *  repeatedly. Generated through currentWeek + lookahead so the next
 *  milestone is always visible. R16-7b: `afterWeek` (BRAND.engagement
 *  .milestoneCallsAfterWeek) caps the ladder; milestones past it are not
 *  generated. null keeps today's rule. */
export function milestoneWeeks(isPif: boolean, currentWeek: number, lookahead = 16, afterWeek: number | null = null): number[] {
  const horizon = Math.max(14, currentWeek + lookahead);
  const weeks: number[] = [14];
  if (isPif) {
    for (let w = 30; w <= horizon; w += 16) weeks.push(w);
  }
  return afterWeek === null ? weeks : weeks.filter((w) => w <= afterWeek);
}

/** Due window: a milestone becomes "due" 2 weeks before its week and stays
 *  due until actioned (the sheet has no expiry; an unbooked W14 at week 20 is
 *  still a missed call to chase). */
export function milestoneState(
  week: number,
  currentWeek: number,
  stored: "booked" | "done" | undefined,
): MilestoneState {
  if (stored) return stored;
  return currentWeek >= week - 2 ? "due" : "upcoming";
}

/** Sheet feedback-form rule (R3-3 tie-in): send at start + 3 weeks. */
export function feedbackFormDue(currentWeek: number, sent: boolean): boolean {
  return !sent && currentWeek >= 3;
}
