// Academy (M6, coach toolset): the full DP coach education course, SERVER-
// rendered so the course content never ships in the client bundle. Navigation
// is plain links (?m=module&l=lesson).
//
// Stage progression (2026-07-10): modules unlock strictly in order, a module
// opens only when every lesson in the previous one is marked complete. Ticks
// persist per coach (academy_progress) and feed the live tracker on Coach
// Performance for the owner + head coach. Owners browsing directly see the
// whole course unlocked (preview) without tracking.

import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ACADEMY_MODULES, type AcademyLesson, type AcademyModule } from "@/lib/coach-content/academy";
import { MarkLessonButton } from "@/components/screens/coach-tools/mark-lesson-button";
import type { AcademyProgress } from "@/lib/academy-actions";

/** Markdown-lite for the lesson bodies: **Heading** blocks, paragraphs,
 *  "- " bullet lists, inline bold. The content uses nothing fancier. */
function renderBody(body: string): React.ReactNode[] {
  const blocks = body.split(/\n\s*\n/);
  return blocks.map((block, bi) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    const headingMatch = /^\*\*(.+)\*\*$/.exec(trimmed);
    if (headingMatch && !headingMatch[1].includes("**")) {
      return (
        <h3 key={bi} className="mt-6 text-sm font-semibold text-fg">
          {headingMatch[1]}
        </h3>
      );
    }
    const lines = trimmed.split("\n");
    if (lines.every((l) => l.trim().startsWith("- "))) {
      return (
        <ul key={bi} className="ml-4 list-disc space-y-1 text-sm leading-relaxed text-fg-dim">
          {lines.map((l, li) => (
            <li key={li}>{renderInline(l.trim().slice(2))}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={bi} className="text-sm leading-relaxed text-fg-dim">
        {renderInline(trimmed)}
      </p>
    );
  });
}

function renderInline(text: string): React.ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold text-fg">{part}</strong> : part,
  );
}

export function AcademyView({
  moduleId,
  lessonId,
  progress,
}: {
  moduleId?: string;
  lessonId?: string;
  progress: AcademyProgress;
}) {
  const completed = new Set(progress.completedLessons);
  const unlocked = new Set(progress.unlockedModules);

  // Empty course (a rebranded deploy with no curriculum loaded yet): clean
  // empty state instead of reaching into an empty module list below.
  if (ACADEMY_MODULES.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Coach tools" title="Academy" subtitle="The coach education course. No modules have been added yet." />
        <Card>
          <EmptyState title="No academy content yet." message="Course modules will appear here once they are added." />
        </Card>
      </div>
    );
  }

  // Never render a locked module's content, even via a hand-typed URL.
  const requested = ACADEMY_MODULES.find((m) => m.id === moduleId);
  const mod: AcademyModule =
    requested && unlocked.has(requested.id) ? requested : ACADEMY_MODULES.find((m) => unlocked.has(m.id)) ?? ACADEMY_MODULES[0];
  const lesson: AcademyLesson | null = mod.lessons.find((l) => l.id === lessonId) ?? null;

  const doneInModule = (m: AcademyModule) => m.lessons.filter((l) => completed.has(l.id)).length;
  const totalDone = progress.completedLessons.length;
  const totalLessons = ACADEMY_MODULES.reduce((s, m) => s + m.lessons.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Coach tools"
        title="Academy"
        subtitle={
          progress.canTrack
            ? `Work through the modules in order, each stage unlocks the next. ${totalDone}/${totalLessons} lessons complete.`
            : "The coach education course. Work through the modules in order."
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="w-full shrink-0 space-y-2 lg:w-72">
          {ACADEMY_MODULES.map((m) => {
            const isUnlocked = unlocked.has(m.id);
            const done = doneInModule(m);
            const complete = done === m.lessons.length;
            return (
              <div
                key={m.id}
                className={`rounded-card border bg-surface ${isUnlocked ? "border-border-soft" : "border-border-soft opacity-60"}`}
              >
                {isUnlocked ? (
                  <Link
                    href={`/academy?m=${m.id}`}
                    className={`flex items-center justify-between px-4 py-2.5 text-sm font-semibold ${m.id === mod.id ? "text-accent" : "text-fg"}`}
                  >
                    <span>
                      {m.number}. {m.title}
                    </span>
                    <span className={`text-[11px] tabular-nums ${complete ? "text-positive" : "text-fg-muted"}`}>
                      {complete ? "✓" : `${done}/${m.lessons.length}`}
                    </span>
                  </Link>
                ) : (
                  <div className="flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-fg-muted" title="Finish the previous module to unlock">
                    <span>
                      {m.number}. {m.title}
                    </span>
                    <span className="text-[11px]">🔒</span>
                  </div>
                )}
                {m.id === mod.id && isUnlocked ? (
                  <ul className="border-t border-border-soft px-2 py-2">
                    {m.lessons.map((l) => (
                      <li key={l.id}>
                        <Link
                          href={`/academy?m=${m.id}&l=${l.id}`}
                          className={`flex items-center justify-between rounded-control px-2 py-1.5 text-xs ${
                            lesson?.id === l.id ? "bg-surface-2 font-medium text-fg" : "text-fg-dim hover:text-fg"
                          }`}
                        >
                          <span>
                            {l.number} {l.title}
                          </span>
                          {completed.has(l.id) ? <span className="text-positive">✓</span> : null}
                        </Link>
                      </li>
                    ))}
                    <li className="mt-1 border-t border-border-soft px-2 pt-2 text-[11px] text-fg-muted">
                      Module quiz: {m.quiz.questions.length} questions, pass {m.quiz.passMark}%. Practice quizzes live
                      under Quizzes.
                    </li>
                  </ul>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1">
          {lesson ? (
            <Card>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">
                Lesson {lesson.number}
              </div>
              <h2 className="mt-1 font-display text-xl tracking-display text-fg">{lesson.title}</h2>
              <p className="mt-1 text-sm text-fg-dim">{lesson.summary}</p>
              {!lesson.loomUrl ? (
                <p className="mt-3 rounded-control bg-surface-2 px-3 py-2 text-xs text-fg-muted">
                  Loom walkthrough pending for this lesson. Text version below is complete.
                </p>
              ) : null}
              <div className="mt-2 space-y-3">{renderBody(lesson.body)}</div>
              {progress.canTrack ? (
                <MarkLessonButton
                  key={lesson.id}
                  lessonId={lesson.id}
                  initialDone={completed.has(lesson.id)}
                  isLastInModule={mod.lessons.filter((l) => l.id !== lesson.id).every((l) => completed.has(l.id))}
                />
              ) : (
                <p className="mt-8 rounded-control bg-surface-2 px-3 py-2 text-xs text-fg-muted">
                  Owner preview: progress isn&apos;t tracked on this login. Coaches see a completion gate here.
                </p>
              )}
            </Card>
          ) : (
            <Card>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">
                Module {mod.number}
              </div>
              <h2 className="mt-1 font-display text-xl tracking-display text-fg">{mod.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-fg-dim">{mod.summary}</p>
              <ul className="mt-4 space-y-2">
                {mod.lessons.map((l) => (
                  <li key={l.id} className="flex items-baseline gap-2">
                    <Link href={`/academy?m=${mod.id}&l=${l.id}`} className="text-sm text-accent hover:underline">
                      {l.number} {l.title}
                    </Link>
                    {completed.has(l.id) ? <span className="text-xs text-positive">✓ done</span> : null}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
