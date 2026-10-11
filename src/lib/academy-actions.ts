"use server";

// Academy stage progression (2026-07-10, owner request). Coaches mark lessons
// complete; a module (stage) is complete when all its lessons are, and the
// NEXT module unlocks only then. Progress persists per coach
// (academy_progress, migration 20260710000002) and feeds the live tracker on
// Coach Performance for the owner + head coach.
//
// R16-8: a coach on BRAND.academy.fullAccessCoachIds (DP: Angus) opens every
// module regardless of stage, but still tracks lessons, so the tracker keeps
// reporting their real stage. The rule lives in src/lib/academy-gating.ts and
// is used by BOTH the read below and the lesson-tick guard.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getServerIdentity } from "@/lib/role-server";
import { ACADEMY_MODULES } from "@/lib/coach-content/academy";
import { unlockedModulesFor } from "@/lib/academy-gating";

const NO_DB = "Academy progress needs a one-time database migration (20260710000002). It is written, not yet applied.";

export type AcademyProgress = {
  /** Lesson ids completed by the current coach. */
  completedLessons: string[];
  /** Module ids the current coach may open: first module + every earned one,
   *  or the whole course for a coach on BRAND.academy.fullAccessCoachIds. */
  unlockedModules: string[];
  /** Whether the viewer can tick lessons (linked coach; owners preview only). */
  canTrack: boolean;
};

export type CoachAcademyRow = {
  coachId: string;
  coachName: string;
  lessonsDone: number;
  lessonsTotal: number;
  /** Per module: done lesson count (index-aligned with ACADEMY_MODULES). */
  perModule: number[];
  /** 1-based module number currently in progress; modules.length+1 = finished. */
  currentStage: number;
  lastActivity: string | null;
};

const LESSON_IDS = new Set(ACADEMY_MODULES.flatMap((m) => m.lessons.map((l) => l.id)));
const TOTAL_LESSONS = LESSON_IDS.size;

/** Progress for the signed-in coach (or an owner previewing: read-only, all unlocked). */
export async function getAcademyProgress(): Promise<AcademyProgress> {
  const { role, realRole, linkedCoachId } = await getServerIdentity();
  // Owner browsing the course directly: full access, no tracking.
  if (realRole === "owner" && !linkedCoachId) {
    return { completedLessons: [], unlockedModules: ACADEMY_MODULES.map((m) => m.id), canTrack: false };
  }
  if (role !== "coach" || !linkedCoachId || !persistenceEnabled()) {
    return { completedLessons: [], unlockedModules: ACADEMY_MODULES.slice(0, 1).map((m) => m.id), canTrack: false };
  }
  try {
    const { data } = await dbAdmin()
      .from("academy_progress")
      .select("lesson_id")
      .eq("coach_id", linkedCoachId);
    const completed = new Set(((data ?? []) as { lesson_id: string }[]).map((r) => r.lesson_id));
    return {
      completedLessons: [...completed],
      unlockedModules: unlockedModulesFor(linkedCoachId, completed),
      canTrack: true,
    };
  } catch {
    return { completedLessons: [], unlockedModules: ACADEMY_MODULES.slice(0, 1).map((m) => m.id), canTrack: false };
  }
}

/** Tick / untick a lesson for the signed-in coach. Enforces the stage gate
 *  server-side: lessons in locked modules cannot be marked. */
export async function setLessonCompleteAction(
  lessonId: string,
  done: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const { role, linkedCoachId } = await getServerIdentity();
  if (role !== "coach" || !linkedCoachId) {
    return { ok: false, error: "Progress tracking needs a coach login (owners preview only)." };
  }
  const mod = ACADEMY_MODULES.find((m) => m.lessons.some((l) => l.id === lessonId));
  if (!mod || !LESSON_IDS.has(lessonId)) return { ok: false, error: "Unknown lesson." };

  const { data } = await dbAdmin().from("academy_progress").select("lesson_id").eq("coach_id", linkedCoachId);
  const completed = new Set(((data ?? []) as { lesson_id: string }[]).map((r) => r.lesson_id));
  if (done && !unlockedModulesFor(linkedCoachId, completed).includes(mod.id)) {
    return { ok: false, error: "That module is still locked. Finish the previous module first." };
  }

  const db = dbAdmin();
  const { error } = done
    ? await db
        .from("academy_progress")
        .upsert(
          { coach_id: linkedCoachId, module_id: mod.id, lesson_id: lessonId },
          { onConflict: "coach_id,lesson_id" },
        )
    : await db.from("academy_progress").delete().eq("coach_id", linkedCoachId).eq("lesson_id", lessonId);
  if (error) {
    return { ok: false, error: /relation .* does not exist/i.test(error.message) ? NO_DB : error.message };
  }
  revalidatePath("/academy");
  revalidatePath("/coach-performance");
  return { ok: true };
}

/** Live tracker rows for the owner + head coach: every coach's stage. */
export async function getAcademyTracker(): Promise<CoachAcademyRow[]> {
  if (!persistenceEnabled()) return [];
  const { realRole, isHeadCoach } = await getServerIdentity();
  if (realRole !== "owner" && !isHeadCoach) return [];
  try {
    const [{ data: coaches }, { data: progress }] = await Promise.all([
      dbAdmin().from("coaches").select("id,name"),
      dbAdmin().from("academy_progress").select("coach_id,lesson_id,completed_at"),
    ]);
    const byCoach = new Map<string, { lessons: Set<string>; last: string | null }>();
    for (const p of (progress ?? []) as { coach_id: string; lesson_id: string; completed_at: string }[]) {
      const e = byCoach.get(p.coach_id) ?? { lessons: new Set<string>(), last: null };
      e.lessons.add(p.lesson_id);
      if (!e.last || p.completed_at > e.last) e.last = p.completed_at;
      byCoach.set(p.coach_id, e);
    }
    return ((coaches ?? []) as { id: string; name: string }[])
      .map((c) => {
        const e = byCoach.get(c.id) ?? { lessons: new Set<string>(), last: null };
        const perModule = ACADEMY_MODULES.map((m) => m.lessons.filter((l) => e.lessons.has(l.id)).length);
        // Current stage = first module not yet fully complete (1-based).
        let stage = ACADEMY_MODULES.length + 1;
        for (let i = 0; i < ACADEMY_MODULES.length; i++) {
          if (perModule[i] < ACADEMY_MODULES[i].lessons.length) {
            stage = i + 1;
            break;
          }
        }
        return {
          coachId: c.id,
          coachName: c.name,
          lessonsDone: e.lessons.size,
          lessonsTotal: TOTAL_LESSONS,
          perModule,
          currentStage: stage,
          lastActivity: e.last,
        };
      })
      .sort((a, b) => b.lessonsDone - a.lessonsDone || a.coachName.localeCompare(b.coachName));
  } catch {
    return [];
  }
}
