"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import type { SearchItem, SearchItemType } from "@/lib/search-index";

const TYPE_LABEL: Record<SearchItemType, string> = {
  screen: "Screens",
  coach: "Coaches",
  client: "Clients",
  lead: "Leads",
};

const TYPE_ORDER: SearchItemType[] = ["screen", "coach", "client", "lead"];
const MAX_RESULTS = 40;

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load the index once, on first open.
  const ensureLoaded = useCallback(async () => {
    if (items || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/search");
      const data = (await res.json()) as { items: SearchItem[] };
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [items, loading]);

  const openPalette = useCallback(() => {
    setOpen(true);
    void ensureLoaded();
  }, [ensureLoaded]);

  // Cmd+K / Ctrl+K to open, Esc to close. The sidebar search box opens the
  // palette too, via the "hq:open-search" window event, so there is exactly
  // one search surface.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpenEvent = () => openPalette();
    window.addEventListener("keydown", onKey);
    window.addEventListener("hq:open-search", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("hq:open-search", onOpenEvent);
    };
  }, [openPalette]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // Focus after the modal mounts.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = items ?? [];
    if (!q) {
      // No query: a small set of screens to jump to.
      return pool.filter((i) => i.type === "screen").slice(0, MAX_RESULTS);
    }
    const matched = pool.filter(
      (i) => i.label.toLowerCase().includes(q) || i.sublabel.toLowerCase().includes(q),
    );
    // Label-prefix matches first, then by type order, then alphabetical.
    matched.sort((a, b) => {
      const ap = a.label.toLowerCase().startsWith(q) ? 0 : 1;
      const bp = b.label.toLowerCase().startsWith(q) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const at = TYPE_ORDER.indexOf(a.type);
      const bt = TYPE_ORDER.indexOf(b.type);
      if (at !== bt) return at - bt;
      return a.label.localeCompare(b.label);
    });
    return matched.slice(0, MAX_RESULTS);
  }, [query, items]);

  useEffect(() => setActive(0), [query]);

  const go = useCallback(
    (item: SearchItem | undefined) => {
      if (!item) return;
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        className="flex items-center gap-2 rounded-control border border-border bg-surface-2 px-3 py-1.5 text-sm text-fg-muted transition-colors hover:text-fg-dim"
      >
        <Icon name="search" size={15} />
        <span>Search</span>
        <kbd className="ml-2 rounded-sm border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-card border border-border bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Icon name="search" size={16} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onListKey}
                placeholder="Search clients, coaches, leads, screens"
                aria-label="Global search"
                className="flex-1 bg-transparent py-3 text-sm text-fg placeholder:text-fg-muted focus:outline-none"
              />
              <kbd className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">
                Esc
              </kbd>
            </div>

            <div className="max-h-[50vh] overflow-y-auto py-1">
              {loading && !items ? (
                <div className="px-4 py-6 text-center text-sm text-fg-muted">Loading…</div>
              ) : results.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-fg-muted">
                  {query.trim() ? `No matches for "${query.trim()}"` : "Start typing to search"}
                </div>
              ) : (
                results.map((item, idx) => {
                  const prev = results[idx - 1];
                  const showHeader = !prev || prev.type !== item.type;
                  return (
                    <div key={item.id}>
                      {showHeader && (
                        <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                          {TYPE_LABEL[item.type]}
                        </div>
                      )}
                      <button
                        type="button"
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => go(item)}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${
                          idx === active ? "bg-surface-2 text-fg" : "text-fg-dim"
                        }`}
                      >
                        <span className="truncate font-medium text-fg">{item.label}</span>
                        <span className="shrink-0 truncate text-xs text-fg-muted">{item.sublabel}</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
