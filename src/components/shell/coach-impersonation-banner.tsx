"use client";

import { stopImpersonation } from "@/lib/impersonation-actions";

// Shown (by the HQ layout) only while a real owner is impersonating a coach.
// Names the coach and offers a one-click exit back to the admin view. The
// layout decides visibility from the server identity, so this component just
// renders the bar and fires the exit action.
export function CoachImpersonationBanner({ coachName }: { coachName: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-warn/30 bg-warn-soft px-6 py-2 text-sm text-warn">
      <span>
        <span className="font-semibold">Viewing {coachName}&apos;s portal.</span> Anything you change saves to their account.
      </span>
      <button
        type="button"
        onClick={() => stopImpersonation()}
        className="shrink-0 rounded-control border border-warn/40 px-3 py-1 text-xs font-medium transition-colors hover:bg-warn/10"
      >
        Exit to admin
      </button>
    </div>
  );
}
