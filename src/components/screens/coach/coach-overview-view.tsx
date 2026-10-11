"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SegmentedControl,
  useToast,
} from "@/components/ui";
import type { CoachScorecard } from "@/lib/seed";
import { datedFilename, exportRowsToCsv } from "@/lib/csv";
import {
  assignClientsToCoachAction,
  listAssignableClientsAction,
  type AssignableClient,
} from "@/lib/coach-assign-actions";

type SortKey = "Name" | "Active clients" | "Pending audits" | "Slots open";

// Capacity denominator + open slots come from the owner-configured source of
// truth (coach-config.ts, baseline 70), matching the live data path and the
// Coach Performance screen, rather than the stale stored max.
// R17-4: capacity comes from the coach row now, not a name lookup in code.
const maxCapacity = (c: CoachScorecard) => c.maxCapacity;
const slotsOpen = (c: CoachScorecard) => Math.max(0, maxCapacity(c) - c.activeClients);

/** Modal picker: assign one or more clients to `coach`. Loads the assignable
 *  roster on open and writes clients.coach_id via the HQ server action. */
function AssignClientsPanel({
  coach,
  coachNames,
  onClose,
}: {
  coach: CoachScorecard;
  coachNames: Record<string, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [clients, setClients] = useState<AssignableClient[] | null>(null);
  const [allowed, setAllowed] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    listAssignableClientsAction()
      .then((res) => {
        if (!live) return;
        setAllowed(res.allowed);
        setClients(res.clients);
      })
      .catch(() => {
        if (live) setLoadError("Could not load clients.");
      });
    return () => {
      live = false;
    };
  }, []);

  const visible = useMemo(() => {
    if (!clients) return [];
    const q = query.trim().toLowerCase();
    return clients.filter((c) => c.coachId !== coach.id && (!q || c.name.toLowerCase().includes(q)));
  }, [clients, query, coach.id]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = () => {
    setSaveError(null);
    const count = selected.size;
    startTransition(async () => {
      const res = await assignClientsToCoachAction([...selected], coach.id);
      if (res.ok) {
        toast.push(`Assigned ${count} ${count === 1 ? "client" : "clients"} to ${coach.name}`);
        router.refresh();
        onClose();
      } else {
        setSaveError(res.error);
        toast.push(res.error, "error");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <Card
        className="flex max-h-[80vh] w-full max-w-md flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="font-display text-lg tracking-display text-fg">Assign clients</div>
          <div className="text-xs text-fg-dim">
            To {coach.name} · {slotsOpen(coach)} slot{slotsOpen(coach) === 1 ? "" : "s"} open
          </div>
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients"
          className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />

        <div className="min-h-0 flex-1 overflow-y-auto rounded-control border border-border-soft">
          {loadError ? (
            <div className="p-4 text-sm text-warn">{loadError}</div>
          ) : clients === null ? (
            <div className="p-4 text-sm text-fg-muted">Loading…</div>
          ) : !allowed ? (
            // R16-4d: never say "no clients" when the truth is "no permission".
            <div className="p-4 text-sm text-warn">You don&apos;t have access to assign clients.</div>
          ) : visible.length === 0 ? (
            <div className="p-4 text-sm text-fg-muted">
              {query ? "No matches." : "No other clients to assign."}
            </div>
          ) : (
            visible.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center justify-between gap-3 border-b border-border-soft px-3 py-2 last:border-0 hover:bg-surface-2"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="accent-accent"
                  />
                  <span className="text-sm text-fg">{c.name}</span>
                </span>
                <span className="text-right text-[11px] text-fg-muted">
                  <span className={c.coachId ? "" : "font-medium text-warn"}>
                    {c.coachId ? coachNames[c.coachId] ?? "Coach" : "Unassigned"}
                  </span>
                  {c.status === "paused" ? " · Paused" : ""}
                  <span className="block tabular-nums">
                    starts {c.startDate} · {c.plan}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>

        {saveError ? <div className="text-xs text-warn">{saveError}</div> : null}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={pending || selected.size === 0}>
            {pending ? "Assigning…" : `Assign ${selected.size || ""}`.trim()}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function CoachOverviewView({
  coaches,
  canAddCoach = false,
  canOpenPortal = false,
  transformationsByCoach = {},
  capacityByCoach = {},
}: {
  coaches: CoachScorecard[];
  /** R19-2b: owner/admin. The second place a new coach is actually wanted:
   *  you notice a capacity problem here, so the fix belongs here too. */
  canAddCoach?: boolean;
  /** Owner only: entering a coach's portal. The head coach reviews via the
   *  read-only per-coach overview instead (owner decision, 2026-07-11). */
  canOpenPortal?: boolean;
  /** D3: transformation counts per coach id. */
  transformationsByCoach?: Record<string, number>;
  /** E2: this week's self-reported capacity per coach id. */
  capacityByCoach?: Record<string, string>;
}) {
  const [tab, setTab] = useState("All");
  const [sort, setSort] = useState<SortKey>("Active clients");
  const [query, setQuery] = useState("");
  const [assignFor, setAssignFor] = useState<CoachScorecard | null>(null);
  const pathname = usePathname();
  // "Open portal" (A8): opens the coach's portal in a NEW TAB via the
  // owner-gated /api/impersonate route (a server action could only swap this
  // tab). Pass the current path so exiting returns here exactly.
  const openPortal = (c: CoachScorecard) => {
    window.open(
      `/api/impersonate?coachId=${encodeURIComponent(c.id)}&returnTo=${encodeURIComponent(pathname)}`,
      "_blank",
      "noopener",
    );
  };
  const coachNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of coaches) m[c.id] = c.name;
    return m;
  }, [coaches]);

  const totalActive = coaches.reduce((s, c) => s + c.activeClients, 0);
  const totalPending = coaches.reduce((s, c) => s + c.pendingAudits, 0);

  const filtered = coaches
    .filter((c) => (tab === "Coaches" ? c.role === "coach" : true))
    .filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => {
      if (sort === "Name") return a.name.localeCompare(b.name);
      if (sort === "Pending audits") return b.pendingAudits - a.pendingAudits;
      if (sort === "Slots open") return slotsOpen(b) - slotsOpen(a);
      return b.activeClients - a.activeClients;
    });

  const exportCsv = () =>
    exportRowsToCsv(datedFilename("coach-overview"), filtered, [
      { header: "Coach", value: (c) => c.name },
      { header: "Role", value: (c) => (c.role === "head_coach" ? "Head Coach" : "Coach") },
      { header: "Active clients", value: (c) => c.activeClients },
      { header: "Capacity", value: (c) => maxCapacity(c) },
      { header: "Slots open", value: (c) => slotsOpen(c) },
      { header: "Pending audits", value: (c) => c.pendingAudits },
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        back
        eyebrow="Operations"
        title="Coach Overview"
        subtitle={`${coaches.length} coaches · ${totalActive} active clients · ${totalPending} pending audits`}
        actions={
          <div className="flex items-center gap-3">
            {canAddCoach ? (
              <Link
                href="/team/new-coach"
                className="rounded-control bg-accent px-3 py-1.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
              >
                + New coach
              </Link>
            ) : null}
            <Link href="/client-audits" className="text-xs text-accent hover:underline">
              Client audits
            </Link>
            <Button variant="ghost" size="sm" onClick={exportCsv} disabled={filtered.length === 0} title="Download these coaches as a CSV">
              Export CSV
            </Button>
            <SegmentedControl
              aria-label="Filter"
              size="sm"
              value={tab}
              onChange={setTab}
              options={[
                { label: "All", value: "All" },
                { label: "Coaches", value: "Coaches" },
              ]}
            />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search coaches"
          className="w-56 rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none"
        />
        <SegmentedControl
          aria-label="Sort by"
          size="sm"
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          options={[
            { label: "Name", value: "Name" },
            { label: "Active", value: "Active clients" },
            { label: "Audits", value: "Pending audits" },
            { label: "Slots", value: "Slots open" },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon="user" title="No coaches found" message="Try a different search or filter." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Card key={c.id} className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Avatar name={c.name} size="lg" />
                <div className="min-w-0">
                  <div className="truncate font-medium text-fg">{c.name}</div>
                  <span className="mt-0.5 inline-flex flex-wrap items-center gap-1">
                    <span className="inline-flex rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-dim">
                      {c.role === "head_coach" ? "Head Coach" : "Coach"}
                    </span>
                    {/* E2: this week's self-reported capacity. */}
                    <span
                      className={`inline-flex rounded-pill px-2 py-0.5 text-[11px] font-medium ${
                        capacityByCoach[c.id]
                          ? capacityByCoach[c.id] === "0"
                            ? "bg-danger-soft text-danger"
                            : "bg-positive-soft text-positive"
                          : "bg-surface-2 text-fg-muted"
                      }`}
                      title="Self-reported capacity for the coming week (Sunday prompt)"
                    >
                      {capacityByCoach[c.id] ? `${capacityByCoach[c.id]} this wk` : "no answer"}
                    </span>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-control border border-border-soft bg-surface-2 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Active clients</div>
                  <div className="mt-0.5 font-display text-xl tabular-nums tracking-display text-fg">
                    {c.activeClients}
                    <span className="ml-1 text-xs font-normal text-fg-muted">/ {maxCapacity(c)}</span>
                  </div>
                </div>
                <div className="rounded-control border border-border-soft bg-surface-2 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Pending audits</div>
                  <div className={`mt-0.5 font-display text-xl tabular-nums tracking-display ${c.pendingAudits > 0 ? "text-warn" : "text-fg"}`}>
                    {c.pendingAudits}
                  </div>
                </div>
                {/* D3: transformations logged for this coach + share of roster. */}
                <div className="col-span-2 rounded-control border border-border-soft bg-surface-2 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Transformations</div>
                  <div className="mt-0.5 font-display text-xl tabular-nums tracking-display text-fg">
                    {transformationsByCoach[c.id] ?? 0}
                    {c.activeClients > 0 ? (
                      <span className="ml-1 text-xs font-normal text-fg-muted">
                        {Math.round(((transformationsByCoach[c.id] ?? 0) / c.activeClients) * 100)}% of roster
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/coach-overview/${c.id}`}
                    className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                    title="Read-only performance overview (no pay)"
                  >
                    View overview
                  </Link>
                  {canOpenPortal ? (
                    <Button variant="ghost" size="sm" onClick={() => openPortal(c)} title="Open this coach's portal (view as them)">
                      Open portal
                    </Button>
                  ) : null}
                  {/* R19-2c: the other place you notice a coach should go, so
                      the way out lives here as well as on Team. */}
                  {canAddCoach ? (
                    <Link
                      href={`/team/remove-coach/${c.id}`}
                      className="text-xs text-fg-muted transition-colors hover:text-danger"
                      title="Deactivate this coach. Nothing is deleted and their history stays."
                    >
                      Remove
                    </Link>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAssignFor(c)}
                  title="Assign clients to this coach (writes to the HQ datastore)"
                >
                  Assign clients
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {assignFor ? (
        <AssignClientsPanel
          coach={assignFor}
          coachNames={coachNames}
          onClose={() => setAssignFor(null)}
        />
      ) : null}
    </div>
  );
}
