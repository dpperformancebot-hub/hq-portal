"use client";

// Blur-financials privacy state (owner request): one toggle hides every dollar
// figure on screen so the owner can screen-share without exposing revenue. Off
// by default. Persisted per LOGIN like the other portal prefs: localStorage for
// instant, no-flash reads, then user_state (follows the login across devices,
// same pattern as quiz best scores / recipe favourites). Best-effort: a missing
// table or persistence-off degrades to localStorage only.
//
// Shared primitive: wrap any money value in <Sensitive> and it reads this
// context, so extending the blur to Financials / Coach Performance later is
// just wrapping their figures, no new plumbing.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getUserStateAction, setUserStateAction } from "@/lib/user-state-actions";

const LS_KEY = "hq-blur-financials";
const STATE_KEY = "blur-financials";

type SensitiveContextValue = {
  blurred: boolean;
  toggle: () => void;
  setBlurred: (next: boolean) => void;
};

// Default (no provider) is inert: never blurs, so <Sensitive>/<Kpi> stay safe
// anywhere in the tree even outside a provider.
const SensitiveContext = createContext<SensitiveContextValue>({
  blurred: false,
  toggle: () => {},
  setBlurred: () => {},
});

export function SensitiveProvider({
  children,
  forced = false,
}: {
  children: React.ReactNode;
  /** R6-4: lock the mask ON for roles excluded from financial figures
   *  (ops_manager). The toggle becomes a no-op and prefs are ignored. */
  forced?: boolean;
}) {
  const [blurred, setBlurredState] = useState(false);

  // Load: localStorage first (instant), then the per-login value wins if present.
  useEffect(() => {
    if (forced) return;
    try {
      const local = localStorage.getItem(LS_KEY);
      if (local !== null) setBlurredState(local === "true");
    } catch {
      // private mode etc.
    }
    void getUserStateAction(STATE_KEY).then((remote) => {
      if (typeof remote === "boolean") setBlurredState(remote);
    });
  }, [forced]);

  const setBlurred = useCallback((next: boolean) => {
    if (forced) return;
    setBlurredState(next);
    try {
      localStorage.setItem(LS_KEY, String(next));
    } catch {
      // ignore storage failures
    }
    // Follow the login (best-effort; localStorage stays the working fallback).
    void setUserStateAction(STATE_KEY, next);
  }, [forced]);

  const toggle = useCallback(() => setBlurred(!blurred), [blurred, setBlurred]);

  return (
    <SensitiveContext.Provider value={{ blurred: forced || blurred, toggle, setBlurred }}>
      {children}
    </SensitiveContext.Provider>
  );
}

export function useSensitive() {
  return useContext(SensitiveContext);
}
