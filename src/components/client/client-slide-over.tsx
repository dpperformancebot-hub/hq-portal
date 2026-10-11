"use client";

// R12-1 (Dan's coach walkthrough): the half-screen client panel. Clicking a
// client anywhere coach-side (Check-ins grid + list, My Clients, Results,
// coach dashboard roster) opens this INSTEAD of navigating, so closing it
// returns you exactly where you were. Everything inside is the same set of
// client components the full profile uses, so the panel is not a reduced
// copy that drifts: check-in codes and summaries are editable inline here too.

import { useCallback, useEffect, useState } from "react";
import { NEEDS_START_DATE } from "@/lib/client-start-date";
import Link from "next/link";
import { EmptyState, Panel, SlideOver } from "@/components/ui";
import { CheckInCodeEditor } from "@/components/client/check-in-code-editor";
import { CheckInSummaryNote } from "@/components/client/check-in-summary-note";
import { ClientFlagsPanel } from "@/components/client/client-flags-panel";
import { ClientNotesPanel } from "@/components/client/client-notes-panel";
import { LogCheckInForm } from "@/components/client/log-check-in-form";
import { matchSummariesToCheckIns } from "@/lib/checkin-summary-match";
import { getClientPanelAction, type ClientPanelData } from "@/lib/client-panel-actions";
import { displayClientName } from "@/lib/client-name";

const fmtDate = (iso: string | null) => {
  if (!iso) return NEEDS_START_DATE;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};
const weeksIn = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / (7 * 86_400_000))) : null);

/** Panel target: id + name, so the header renders instantly while data loads. */
export type PanelClient = { id: string; name: string } | null;

export function ClientSlideOver({ target, onClose }: { target: PanelClient; onClose: () => void }) {
  const [data, setData] = useState<ClientPanelData | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const load = useCallback(async (id: string) => {
    setState("loading");
    setData(null);
    try {
      const res = await getClientPanelAction(id);
      if (res) {
        setData(res);
        setState("idle");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (target?.id) void load(target.id);
    else setData(null);
  }, [target?.id, load]);

  const client = data?.detail.client;
  const summaryByCheckIn = data ? matchSummariesToCheckIns(data.detail.checkIns, data.summaries) : new Map();

  return (
    <SlideOver
      open={target !== null}
      onClose={onClose}
      size="half"
      title={displayClientName(target?.name) ?? "Client"}
      subtitle={
        client ? `${client.plan} · ${client.status} · ${weeksIn(client.startDate) === null ? NEEDS_START_DATE : `week ${weeksIn(client.startDate)}`}` : undefined
      }
      actions={
        target ? (
          <Link
            href={`/my-clients/${target.id}`}
            className="rounded-control border border-border px-2.5 py-1 text-xs font-medium text-fg-dim transition-colors hover:bg-surface-2 hover:text-fg"
          >
            Open full profile
          </Link>
        ) : null
      }
    >
      {state === "loading" ? (
        <p className="text-sm text-fg-dim">Loading…</p>
      ) : state === "error" || !data || !client ? (
        <EmptyState
          icon="user"
          title="Could not open this client"
          message="They may not be on your roster, or the record has moved. Try the full profile."
        />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Status", value: client.status },
              { label: "Start", value: fmtDate(client.startDate) },
              { label: "Term end", value: client.endDate ?? "-" },
              { label: "Plan", value: client.plan },
            ].map((f) => (
              <div key={f.label} className="rounded-control border border-border-soft px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{f.label}</div>
                <div className="mt-0.5 text-sm capitalize text-fg tabular-nums">{f.value}</div>
              </div>
            ))}
          </div>

          <Panel title="Log a check-in" subtitle="Internal only, never sent to the client.">
            <LogCheckInForm clients={[{ id: client.id, name: client.name, coachId: client.coachId }]} />
          </Panel>

          {/* R12-8: workflow flags feed Results. */}
          <ClientFlagsPanel client={client} canEdit={data.canEditCheckIns} />

          <Panel title={`Check-in history (${data.detail.checkIns.length})`}>
            {data.detail.checkIns.length === 0 ? (
              <EmptyState compact icon="checkins" title="No check-ins yet" message="Weekly check-ins show here." />
            ) : (
              <div className="space-y-1">
                {data.detail.checkIns.slice(0, 20).map((ci) => (
                  <div key={ci.id} className="border-b border-border-soft last:border-0">
                    <div className="flex items-center gap-3 px-1 py-2">
                      <span className="w-24 text-xs tabular-nums text-fg-muted">{fmtDate(ci.submittedAt)}</span>
                      <span className="w-14 text-xs tabular-nums text-fg-dim">{ci.weekNumber ? `wk ${ci.weekNumber}` : ""}</span>
                      <CheckInCodeEditor checkInId={ci.id} code={ci.code} canEdit={data.canEditCheckIns} />
                      {ci.loomUrl ? (
                        <a href={ci.loomUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-accent hover:underline">
                          Loom
                        </a>
                      ) : null}
                      {ci.adherence != null ? (
                        <span className="ml-auto text-xs tabular-nums text-fg-muted">{ci.adherence}%</span>
                      ) : null}
                    </div>
                    <CheckInSummaryNote
                      summary={summaryByCheckIn.get(ci.id) ?? null}
                      clientId={client.id}
                      weekNumber={ci.weekNumber ?? null}
                      canEdit={data.canEditCheckIns}
                    />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <ClientNotesPanel clientId={client.id} notes={data.detail.notes} />
        </div>
      )}
    </SlideOver>
  );
}

/** Convenience hook: one piece of state + the handlers every coach screen needs. */
export function useClientPanel() {
  const [target, setTarget] = useState<PanelClient>(null);
  return {
    target,
    open: (c: { id: string; name: string }) => setTarget({ id: c.id, name: c.name }),
    close: () => setTarget(null),
  };
}
