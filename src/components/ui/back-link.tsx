"use client";

// Back affordance (2026-07-02, smoothed 2026-07-03): always navigates
// straight to the target (default /dashboard). The earlier history.back()
// behaviour felt clunky: it could land on intermediate pages (filters,
// drill-ins, sign-in redirects) instead of home. Predictable beats clever.

import Link from "next/link";

export function BackLink({ href = "/dashboard", label = "Dashboard" }: { href?: string; label?: string }) {
  return (
    <Link
      href={href}
      className="mb-1 inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <span aria-hidden>←</span> {label}
    </Link>
  );
}
