"use client";

// Toast feedback (2026-07-02 "feels alive" pass). One provider mounted in the
// HQ shell; any client component calls useToast().push("Saved") after a write
// so no action succeeds silently. Auto-dismisses; errors stay a little
// longer. Deliberately tiny: no queue caps, no portals, no animation lib.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export type ToastTone = "success" | "error" | "info";
type Toast = { id: number; message: string; tone: ToastTone };

type ToastApi = {
  push: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  // Fail soft: a component rendered outside the provider (tests, style guide)
  // just no-ops instead of crashing the screen.
  return ctx ?? { push: () => {} };
}

const TONE_CLS: Record<ToastTone, string> = {
  success: "border-positive/30 bg-positive-soft text-positive",
  error: "border-danger/30 bg-danger-soft text-danger",
  info: "border-border bg-surface-2 text-fg-dim",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, tone: ToastTone = "success") => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, tone }]);
    const ttl = tone === "error" ? 6000 : 3200;
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
  }, []);

  const api = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-72 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start justify-between gap-3 rounded-card border px-3 py-2 text-sm shadow-lg ${TONE_CLS[t.tone]}`}
          >
            <span>{t.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
              className="text-current opacity-60 transition-opacity hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
