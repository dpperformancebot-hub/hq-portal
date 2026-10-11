import Link from "next/link";
import { NEEDS_START_DATE } from "@/lib/client-start-date";
import { Card, EmptyState, PageHeader, Panel, StatusPill } from "@/components/ui";
import { CHECKIN_META } from "@/lib/seed/types";
import { ClientFlagsPanel } from "@/components/client/client-flags-panel";
import { ClientNotesPanel } from "@/components/client/client-notes-panel";
import { LogCheckInForm } from "@/components/client/log-check-in-form";
import { CheckInSummaryNote } from "@/components/client/check-in-summary-note";
import { CheckInCodeEditor } from "@/components/client/check-in-code-editor";
import { matchSummariesToCheckIns } from "@/lib/checkin-summary-match";
import type { ClientDetailData } from "@/lib/data";
import type { CheckInSummary } from "@/lib/check-in-summaries";

const fmtDate = (iso: string | null) => {
  if (!iso) return NEEDS_START_DATE;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};
const weeksIn = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / (7 * 86_400_000))) : null);

export function CoachClientDetailView({
  data,
  summaries = [],
  canEditCheckIns = false,
}: {
  data: ClientDetailData;
  /** Loom check-in summaries for this client, newest first (2026-07-10). */
  summaries?: CheckInSummary[];
  /** R9-2: inline check-in editing (code correction + summary add/edit).
   *  Server actions re-check regardless. */
  canEditCheckIns?: boolean;
}) {
  const { client, checkIns, transformations, notes } = data;
  const latest = checkIns[0];
  // R2-4: pair each summary with its check-in row (week number, else same week).
  const summaryByCheckIn = matchSummariesToCheckIns(checkIns, summaries);

  return (
    <div className="space-y-6">
      <Link href="/my-clients" className="text-sm text-accent hover:underline">
        ← Back to My Clients
      </Link>
      <PageHeader
        eyebrow="Client"
        title={client.name}
        subtitle={`${client.plan} · ${client.journeyStage} · ${weeksIn(client.startDate) === null ? NEEDS_START_DATE : `week ${weeksIn(client.startDate)}`}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Status</div>
          <div className="mt-1 text-sm font-medium text-fg capitalize">{client.status}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Start date</div>
          <div className="mt-1 text-sm font-medium text-fg tabular-nums">{fmtDate(client.startDate)}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Term end</div>
          <div className="mt-1 text-sm font-medium text-fg tabular-nums">{client.endDate ?? "-"}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Latest check-in</div>
          <div className="mt-1 flex items-center gap-2">
            {latest?.code && CHECKIN_META[latest.code] ? <StatusPill variant={CHECKIN_META[latest.code].pill} /> : <span className="text-sm text-fg-dim">-</span>}
            {latest ? <span className="text-xs text-fg-muted tabular-nums">{fmtDate(latest.submittedAt)}</span> : null}
          </div>
        </Card>
      </div>

      <Panel title="Log a check-in" subtitle="Record this client's weekly status. Internal only, never sent to them.">
        <LogCheckInForm clients={[{ id: client.id, name: client.name, coachId: client.coachId }]} />
      </Panel>

      {/* R12-8: workflow flags feed Results. */}
      <ClientFlagsPanel client={client} canEdit={canEditCheckIns} />

      <Panel title={`Check-in history (${checkIns.length})`}>
        {checkIns.length === 0 ? (
          <EmptyState icon="checkins" title="No check-ins yet" message="This client's weekly check-ins will show here." />
        ) : (
          <div className="space-y-1">
            {checkIns.slice(0, 30).map((ci) => {
              const rowSummary = summaryByCheckIn.get(ci.id);
              return (
                <div key={ci.id} className="border-b border-border-soft last:border-0">
                  <div className="flex items-center gap-3 px-1 py-2">
                    <span className="w-24 text-xs tabular-nums text-fg-muted">{fmtDate(ci.submittedAt)}</span>
                    <span className="w-14 text-xs tabular-nums text-fg-dim">{ci.weekNumber ? `wk ${ci.weekNumber}` : ""}</span>
                    {/* R9-2: the pill is the control; click to correct in place. */}
                    <CheckInCodeEditor checkInId={ci.id} code={ci.code} canEdit={canEditCheckIns} />
                    {ci.loomUrl ? (
                      <a href={ci.loomUrl} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
                        Loom
                      </a>
                    ) : null}
                    {ci.adherence != null ? (
                      <span className="ml-auto text-xs tabular-nums text-fg-muted">{ci.adherence}% adherence</span>
                    ) : null}
                  </div>
                  {/* R2-4 + R9-2: the check-in's own summary, add/editable inline. */}
                  <CheckInSummaryNote
                    summary={rowSummary ?? null}
                    clientId={client.id}
                    weekNumber={ci.weekNumber ?? null}
                    canEdit={canEditCheckIns}
                  />
                </div>
              );
            })}
            {checkIns.length > 30 ? (
              <div className="px-1 pt-2 text-xs text-fg-muted">Showing the 30 most recent of {checkIns.length}.</div>
            ) : null}
          </div>
        )}
      </Panel>

      <Panel
        title={`Loom summaries (${summaries.length})`}
        subtitle="Check-in video summaries from the Loom Summaries tool. Coach notes are internal."
      >
        {summaries.length === 0 ? (
          <EmptyState
            icon="video"
            title="No Loom summaries yet"
            message="Summarise a check-in video under Toolset, Loom Summaries, and it lands here."
          />
        ) : (
          <div className="space-y-2">
            {summaries.slice(0, 20).map((s) => (
              <details key={s.id} className="rounded-control border border-border-soft px-3 py-2">
                <summary className="cursor-pointer text-sm text-fg">
                  <span className="font-medium">{s.weekNumber ? `Week ${s.weekNumber}` : "Check-in"}</span>
                  <span className="ml-2 text-xs tabular-nums text-fg-muted">{fmtDate(s.createdAt)}</span>
                </summary>
                <div className="mt-2 space-y-2 text-sm text-fg-dim">
                  {s.loomUrl ? (
                    <a href={s.loomUrl} target="_blank" rel="noreferrer" className="break-all text-xs text-accent hover:underline">
                      {s.loomUrl}
                    </a>
                  ) : null}
                  <p className="whitespace-pre-wrap">{s.summary}</p>
                  {s.actionItems ? (
                    <p className="whitespace-pre-wrap text-xs">
                      <span className="font-semibold uppercase tracking-[0.08em] text-fg-muted">Action items</span>
                      {"\n"}
                      {s.actionItems}
                    </p>
                  ) : null}
                  {s.coachNotes ? (
                    <p className="whitespace-pre-wrap text-xs">
                      <span className="font-semibold uppercase tracking-[0.08em] text-fg-muted">Coach notes</span>
                      {"\n"}
                      {s.coachNotes}
                    </p>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={`Results (${transformations.length})`}>
        {transformations.length === 0 ? (
          <EmptyState icon="image" title="No results logged" message="Transformations appear here once logged." />
        ) : (
          <div className="space-y-2">
            {transformations.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-control border border-border-soft px-3 py-2">
                <span className="text-sm font-medium text-fg">{t.milestone}</span>
                <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] capitalize text-fg-dim">
                  {t.status.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <ClientNotesPanel clientId={client.id} notes={notes} />
    </div>
  );
}
