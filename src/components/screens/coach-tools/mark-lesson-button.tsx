"use client";

// Lesson completion gate (2026-07-11, owner spec). Sits at the BOTTOM of each
// lesson. Completing requires BOTH:
//   1. a minimum time on the page (MIN_READ_SECONDS, counts from mount), and
//   2. ticking the "I've read this thoroughly" agreement.
// Only then does "Complete lesson" enable. The server action still re-checks
// the stage gate; when the last lesson of a module completes, the next module
// unlocks and the tracker on Coach Performance updates.
//
// The timer is a client-side speed bump (a determined skimmer can wait it
// out); the agreement is the accountability record.

import { useEffect, useState, useTransition } from "react";
import { useToast } from "@/components/ui";
import { setLessonCompleteAction } from "@/lib/academy-actions";

const MIN_READ_SECONDS = 120; // 2 minutes on the page before completing

export function MarkLessonButton({
  lessonId,
  initialDone,
  isLastInModule = false,
}: {
  lessonId: string;
  initialDone: boolean;
  isLastInModule?: boolean;
}) {
  const toast = useToast();
  const [done, setDone] = useState(initialDone);
  const [agreed, setAgreed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, startTransition] = useTransition();

  // Reset the gate whenever the lesson changes (same component instance is
  // reused across ?l= navigations).
  useEffect(() => {
    setDone(initialDone);
    setAgreed(false);
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [lessonId, initialDone]);

  const remaining = Math.max(0, MIN_READ_SECONDS - elapsed);
  const timeMet = remaining === 0;
  const canComplete = timeMet && agreed && !done;

  const complete = () => {
    setDone(true); // optimistic
    startTransition(async () => {
      const res = await setLessonCompleteAction(lessonId, true);
      if (!res.ok) {
        setDone(false);
        toast.push(res.error ?? "Could not save progress.", "error");
      } else {
        toast.push(
          isLastInModule ? "Module complete, next stage unlocked" : "Lesson complete",
        );
      }
    });
  };

  const reopen = () =>
    startTransition(async () => {
      setDone(false);
      const res = await setLessonCompleteAction(lessonId, false);
      if (!res.ok) {
        setDone(true);
        toast.push(res.error ?? "Could not update progress.", "error");
      }
    });

  if (done) {
    return (
      <div className="mt-8 flex items-center justify-between rounded-card border border-positive/40 bg-positive-soft px-4 py-3">
        <span className="text-sm font-medium text-positive">✓ Lesson completed</span>
        <button type="button" onClick={reopen} disabled={busy} className="text-xs text-fg-muted hover:text-fg">
          Mark as unread
        </button>
      </div>
    );
  }

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div className="mt-8 rounded-card border border-border bg-surface-2 p-4">
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#16a34a]"
        />
        <span className="text-sm text-fg">
          By marking this off I confirm I have read this entire lesson thoroughly and understand how to apply it
          with clients.
        </span>
      </label>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs tabular-nums text-fg-muted">
          {timeMet ? "Reading time met" : `Keep reading, unlocks in ${mins}:${String(secs).padStart(2, "0")}`}
        </span>
        <button
          type="button"
          onClick={complete}
          disabled={!canComplete || busy}
          className={`rounded-control px-4 py-2 text-sm font-medium transition-colors ${
            canComplete
              ? "bg-accent text-white hover:opacity-90"
              : "cursor-not-allowed border border-border text-fg-muted"
          }`}
        >
          {busy ? "Saving…" : "Complete lesson"}
        </button>
      </div>
    </div>
  );
}
