"use client";

// Freely movable blocks (2026-07-03, owner request). Wrap a screen's content
// in <MovableLayout storageKey> (parent must be flex-col with gap), then wrap
// each block in <MovableBlock id>. A grip appears on hover; drag a block onto
// another to swap places. Visual order is CSS `order`, so no DOM surgery, and
// the arrangement follows the LOGIN (user_state) with a localStorage
// fallback. Reusable on any screen: stable ids + a unique storageKey.

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getUserStateAction, setUserStateAction } from "@/lib/user-state-actions";

type MovableApi = {
  orderOf: (id: string) => number;
  move: (from: string, to: string) => void;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  overId: string | null;
  setOverId: (id: string | null) => void;
  /** Locked layout (A1): any saved order still applies, but the grip and all
   *  drag wiring are gone, so blocks cannot be rearranged. */
  locked: boolean;
};

const MovableContext = createContext<MovableApi | null>(null);

export function MovableLayout({
  storageKey,
  locked = false,
  children,
}: {
  storageKey: string;
  locked?: boolean;
  children: React.ReactNode;
}) {
  const localKey = `hq-block-order:${storageKey}`;
  const [order, setOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) setOrder(JSON.parse(raw) as string[]);
    } catch {
      // ignore
    }
    void getUserStateAction(localKey).then((v) => {
      if (Array.isArray(v) && v.length > 0) setOrder(v as string[]);
    });
  }, [localKey]);

  const api = useMemo<MovableApi>(
    () => ({
      orderOf: (id) => {
        const i = order.indexOf(id);
        // Unknown blocks (nothing saved yet, or newly added sections) share a
        // large order value, so flex ties break by DOM order and new blocks
        // land after the arranged ones.
        return i === -1 ? 999 : i + 1;
      },
      move: (from, to) => {
        if (from === to) return;
        setOrder((prev) => {
          // Seed from current visual order: known ids first (their saved
          // order), then swap/insert.
          const seed = prev.length > 0 ? [...prev] : [];
          if (!seed.includes(from)) seed.push(from);
          if (!seed.includes(to)) seed.push(to);
          const next = seed.filter((x) => x !== from);
          next.splice(next.indexOf(to) + (seed.indexOf(from) < seed.indexOf(to) ? 1 : 0), 0, from);
          try {
            localStorage.setItem(localKey, JSON.stringify(next));
          } catch {
            // ignore
          }
          void setUserStateAction(localKey, next);
          return next;
        });
      },
      dragId,
      setDragId,
      overId,
      setOverId,
      locked,
    }),
    [order, dragId, overId, localKey, locked],
  );

  return <MovableContext.Provider value={api}>{children}</MovableContext.Provider>;
}

export function MovableBlock({ id, children }: { id: string; children: React.ReactNode }) {
  const api = useContext(MovableContext);
  const [grabbed, setGrabbed] = useState(false);
  if (!api) return <>{children}</>;
  // Locked layout: honour the saved order, render no grip and no drag targets.
  if (api.locked) {
    return (
      <div style={{ order: api.orderOf(id) }} className="rounded-card">
        {children}
      </div>
    );
  }

  return (
    <div
      style={{ order: api.orderOf(id) }}
      draggable={grabbed}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/block-id", id);
        api.setDragId(id);
      }}
      onDragEnd={() => {
        api.setDragId(null);
        api.setOverId(null);
        setGrabbed(false);
      }}
      onDragOver={(e) => {
        if (!api.dragId || api.dragId === id) return;
        e.preventDefault();
        api.setOverId(id);
      }}
      onDrop={(e) => {
        e.preventDefault();
        const from = e.dataTransfer.getData("text/block-id");
        if (from) api.move(from, id);
        api.setOverId(null);
      }}
      className={`group/block relative rounded-card transition-shadow ${
        api.overId === id ? "ring-2 ring-accent/60" : ""
      } ${api.dragId === id ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        aria-label="Drag to move this block"
        title="Drag to move this block"
        onMouseDown={() => setGrabbed(true)}
        onMouseUp={() => setGrabbed(false)}
        className="absolute -left-2 -top-2 z-10 hidden h-6 w-6 cursor-grab items-center justify-center rounded-control border border-border bg-surface text-fg-muted shadow-sm active:cursor-grabbing group-hover/block:flex"
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
          <circle cx="2.5" cy="2" r="1.4" />
          <circle cx="7.5" cy="2" r="1.4" />
          <circle cx="2.5" cy="7" r="1.4" />
          <circle cx="7.5" cy="7" r="1.4" />
          <circle cx="2.5" cy="12" r="1.4" />
          <circle cx="7.5" cy="12" r="1.4" />
        </svg>
      </button>
      {children}
    </div>
  );
}
