"use client";

// Slide-over drawer (2026-07-02 dashboard drill-ins): click into any metric,
// see the underlying records, click out. Closes on backdrop click, Escape,
// and the X. Content scrolls; the trigger screen stays mounted behind it.

import { useEffect } from "react";

export function SlideOver({
  open,
  onClose,
  title,
  subtitle,
  children,
  size = "md",
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** R12-1: "half" is the coach client panel (half the screen on desktop);
   *  "md" stays the narrow dashboard drill-in width. */
  size?: "md" | "half";
  /** Optional controls rendered next to the close button (e.g. Open full profile). */
  actions?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`absolute inset-y-0 right-0 flex w-full flex-col border-l border-border bg-surface shadow-xl ${size === "half" ? "max-w-3xl lg:w-1/2" : "max-w-md"}`}>
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="font-display text-lg tracking-display text-fg">{title}</div>
            {subtitle ? <div className="mt-0.5 text-xs text-fg-dim">{subtitle}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
          {actions}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control border border-border text-fg-dim transition-colors hover:bg-surface-2 hover:text-fg"
          >
            ×
          </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
