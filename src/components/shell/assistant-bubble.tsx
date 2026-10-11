"use client";

// I1 (FEEDBACK-V2, 2026-08-07): the Coach Assistant as a floating bubble,
// bottom-right on every coach screen, so coaches actually reach for it. Same
// shared AssistantChat surface as /coach-assistant (same gating, same
// read-only guarantees). Rendered from the HQ layout only for coach sessions
// and only when ANTHROPIC_API_KEY is configured (honest absence otherwise).
// The layout persists across route changes, so an open conversation survives
// navigating between coach screens. Hidden on /coach-assistant itself.

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/lib/icons";
import { AssistantChat } from "@/components/screens/coach-tools/assistant-chat";

export function AssistantBubble() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  if (pathname?.startsWith("/coach-assistant")) return null;

  return (
    <>
      {open ? (
        <div className="fixed bottom-24 right-6 z-40 flex w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-card border border-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Coach Assistant</div>
            <div className="flex items-center gap-3">
              <Link
                href="/coach-assistant"
                onClick={() => setOpen(false)}
                className="text-xs font-medium text-accent hover:underline"
              >
                Full page
              </Link>
              <button
                type="button"
                aria-label="Close assistant"
                onClick={() => setOpen(false)}
                className="text-fg-muted transition-colors hover:text-fg"
              >
                ✕
              </button>
            </div>
          </div>
          <AssistantChat configured heightClass="h-[26rem]" />
        </div>
      ) : null}

      <button
        type="button"
        aria-label={open ? "Close the coach assistant" : "Open the coach assistant"}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-pill bg-accent text-white shadow-lg transition-transform hover:scale-105"
      >
        <Icon name="cpu" size={22} />
      </button>
    </>
  );
}
