// Academy stage gating (pure). Extracted from academy-actions.ts (R16-8) so
// the SAME rule serves both the progress read and the lesson-tick guard: if
// those two ever disagreed, a coach could see a lesson and not be able to
// tick it (or the reverse). Kept out of the "use server" module because every
// export there must be an async server action, and so this is unit-testable.

import { BRAND } from "@/lib/brand";
import { ACADEMY_MODULES } from "@/lib/coach-content/academy";

/** Sequential rule: m1 plus each module whose predecessor is fully complete. */
export function unlockedFrom(completed: Set<string>): string[] {
  const unlocked: string[] = [];
  for (let i = 0; i < ACADEMY_MODULES.length; i++) {
    if (i === 0) {
      unlocked.push(ACADEMY_MODULES[i].id);
      continue;
    }
    const prev = ACADEMY_MODULES[i - 1];
    if (prev.lessons.every((l) => completed.has(l.id))) unlocked.push(ACADEMY_MODULES[i].id);
    else break; // strictly sequential: a gap locks everything after it
  }
  return unlocked;
}

/** R16-8: true when this coach is on the brand's full-access allowlist. */
export function hasFullAcademyAccess(coachId: string | null | undefined): boolean {
  return !!coachId && BRAND.academy.fullAccessCoachIds.includes(coachId);
}

/**
 * The module ids this coach may open. An allowlisted coach (owner decision,
 * per brand: DP = Angus) gets the whole course at once; everyone else keeps
 * the sequential unlock. Progress tracking is unaffected either way, so the
 * Coach Performance tracker still shows the coach's real stage.
 */
export function unlockedModulesFor(coachId: string | null | undefined, completed: Set<string>): string[] {
  if (hasFullAcademyAccess(coachId)) return ACADEMY_MODULES.map((m) => m.id);
  return unlockedFrom(completed);
}
