"use client";

// Freshness (2026-07-02): server components refetch on navigation, but a tab
// left open goes stale. This refreshes the current route's server data when
// the window regains focus or becomes visible, throttled so tabbing around
// does not hammer the server. Mounted once in the HQ shell.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const MIN_INTERVAL_MS = 30_000;

export function RefreshOnFocus() {
  const router = useRouter();
  const last = useRef(0);

  useEffect(() => {
    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last.current < MIN_INTERVAL_MS) return;
      last.current = now;
      router.refresh();
    };
    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", maybeRefresh);
    return () => {
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", maybeRefresh);
    };
  }, [router]);

  return null;
}
