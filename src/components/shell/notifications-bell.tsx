"use client";

// Topbar notifications bell (2026-07-02): real, role-scoped signals from
// getNotificationsData. Red dot when anything needs attention; dropdown lists
// each item and links to the screen where the work lives. Closes on outside
// click and Escape.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/lib/icons";
import type { HqNotification } from "@/lib/data";

export function NotificationsBell({ items }: { items: HqNotification[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hasWarn = items.some((i) => i.tone === "warn");

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label={items.length ? `Notifications: ${items.length}` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-8 w-8 items-center justify-center rounded-control border border-border bg-surface text-fg-dim transition-colors hover:text-fg"
      >
        <Icon name="bell" size={16} />
        {items.length > 0 ? (
          <span
            aria-hidden
            className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-pill border-2 border-surface ${
              hasWarn ? "bg-warn" : "bg-accent"
            }`}
          />
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-10 z-50 w-72 overflow-hidden rounded-card border border-border bg-surface shadow-xl">
          <div className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
            Notifications
          </div>
          {items.length === 0 ? (
            <div className="px-3 py-4 text-sm text-fg-dim">All clear. Nothing needs you right now.</div>
          ) : (
            <div className="py-1">
              {items.map((n) => (
                <Link
                  key={n.id}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2"
                >
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 shrink-0 rounded-pill ${n.tone === "warn" ? "bg-warn" : "bg-accent"}`}
                  />
                  {n.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
