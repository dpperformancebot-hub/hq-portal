"use client";

// Mobile navigation (2026-07-02): below md the fixed sidebar is hidden and
// this hamburger opens it as an overlay drawer. Desktop layout is untouched.
// Closes on backdrop click, Escape, and route change.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Sidebar } from "@/components/shell/sidebar";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navigating closes the drawer.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Open navigation"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-control border border-border bg-surface text-fg-dim transition-colors hover:text-fg"
      >
        <Icon name="menu" size={16} />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex">
            <Sidebar forceVisible />
          </div>
        </div>
      ) : null}
    </div>
  );
}
