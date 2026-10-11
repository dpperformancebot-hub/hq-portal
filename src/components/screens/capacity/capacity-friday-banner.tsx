"use client";

// R7-1 (Dan's capacity mockup): the coach's Friday reminder. Day check runs
// CLIENT-SIDE so "Friday" means Friday in the coach's own timezone, not the
// server's. Suppressed once submitted (server prop); dismiss persists for
// that day only via localStorage, never permanently. Shows Friday through
// Sunday while the open week's answer is still outstanding.

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "capacity-banner-dismissed";

export function CapacityFridayBanner({
  submitted,
  weekLabel,
}: {
  /** Has this coach already answered for the open week? */
  submitted: boolean;
  /** "Week starting 10 Aug" for the open week. */
  weekLabel: string;
}) {
  // Render nothing on the server and first client paint, then decide from the
  // browser clock: avoids a hydration mismatch across timezones.
  const [state, setState] = useState<{ show: boolean; friday: boolean }>({ show: false, friday: false });

  useEffect(() => {
    if (submitted) return;
    const now = new Date();
    const day = now.getDay(); // local (coach) timezone
    const inWindow = day === 5 || day === 6 || day === 0;
    if (!inWindow) return;
    const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    try {
      if (localStorage.getItem(KEY) === today) return;
    } catch {
      // storage unavailable: still show the banner.
    }
    setState({ show: true, friday: day === 5 });
  }, [submitted]);

  if (!state.show) return null;

  const dismiss = () => {
    const now = new Date();
    try {
      localStorage.setItem(KEY, `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`);
    } catch {
      // storage unavailable: dismiss for this render only.
    }
    setState({ show: false, friday: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-warn/40 bg-warn-soft px-4 py-3">
      <span className="min-w-0 flex-1 text-sm text-fg">
        {state.friday ? (
          <>
            <span className="font-medium">It&apos;s Friday:</span> submit your capacity for {weekLabel} before end of day.
          </>
        ) : (
          <>
            <span className="font-medium">Capacity still due:</span> submit your answer for {weekLabel}.
          </>
        )}
      </span>
      <Link href="/capacity" className="shrink-0 text-xs font-semibold text-accent hover:underline">
        Submit now
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss for today"
        className="shrink-0 text-xs text-fg-muted transition-colors hover:text-fg"
      >
        Dismiss
      </button>
    </div>
  );
}
