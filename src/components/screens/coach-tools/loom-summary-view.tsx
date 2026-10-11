"use client";

// Loom Summary Assistant (2026-07-10): paste a Loom/Trellis check-in
// transcript, get Link + Summary + Action items + Coach notes in the DP tone,
// with copy buttons. GATED like the Coach Assistant: until ANTHROPIC_API_KEY
// is set the form keeps its honest disabled state. Nothing here ever reaches
// a client; the coach copies text out themselves.

import { useMemo, useState } from "react";
import { Button, Card, EmptyState, PageHeader, Panel, useToast } from "@/components/ui";
import type { CheckInSummary } from "@/lib/check-in-summaries";

type ClientOption = { id: string; name: string };

type Result = {
  loomUrl: string | null;
  summary: string;
  actionItems: string;
  coachNotes: string;
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

function CopyButton({ text, what }: { text: string; what: string }) {
  const toast = useToast();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={!text}
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => toast.push(`${what} copied.`, "success"))
          .catch(() => toast.push("Copy failed.", "error"));
      }}
    >
      Copy
    </Button>
  );
}

function Section({ title, text, note }: { title: string; text: string; note?: string }) {
  return (
    <Panel
      title={title}
      subtitle={note}
      action={<CopyButton text={text} what={title} />}
    >
      {text ? (
        <p className="whitespace-pre-wrap text-sm text-fg">{text}</p>
      ) : (
        <p className="text-sm text-fg-muted">Nothing in this section.</p>
      )}
    </Panel>
  );
}

export function LoomSummaryView({
  configured = false,
  clients,
  history,
}: {
  configured?: boolean;
  clients: ClientOption[];
  history: CheckInSummary[];
}) {
  const toast = useToast();
  const [clientId, setClientId] = useState("");
  const [weekNumber, setWeekNumber] = useState("");
  const [loomUrl, setLoomUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [saves, setSaves] = useState<CheckInSummary[]>([]);

  const clientNames = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  // New saves this session first, then the server history; scoped to the
  // selected client once one is picked.
  const visibleHistory = useMemo(() => {
    const all = [...saves, ...history];
    return clientId ? all.filter((s) => s.clientId === clientId) : all;
  }, [saves, history, clientId]);

  const generate = async () => {
    if (!transcript.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "loom-summary",
          transcript,
          clientId: clientId || undefined,
          loomUrl: loomUrl.trim() || undefined,
          weekNumber: weekNumber ? Number(weekNumber) : undefined,
        }),
      });
      const data = (await res.json()) as {
        summary?: string;
        actionItems?: string;
        coachNotes?: string;
        saved?: CheckInSummary | null;
        refused?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Assistant failed.");
      if (data.refused) {
        toast.push(data.refused, "error");
        return;
      }
      setResult({
        loomUrl: loomUrl.trim() || null,
        summary: data.summary ?? "",
        actionItems: data.actionItems ?? "",
        coachNotes: data.coachNotes ?? "",
      });
      if (data.saved) {
        setSaves((s) => [data.saved as CheckInSummary, ...s]);
      } else if (clientId) {
        toast.push("Summary generated but not saved (persistence off or migration pending).", "error");
      }
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Assistant failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Coach tools"
        title="Loom Summaries"
        subtitle={
          configured
            ? "Paste a check-in video transcript; get the client message, action items, and coach notes in the house tone. Saved per client so the head coach can read instead of watch."
            : "Turns Loom transcripts into client summaries and coach notes. Switches on when the API key lands."
        }
      />

      {!configured ? (
        <Card>
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Waiting on the key</div>
          <p className="mt-1 text-sm text-fg-dim">
            The backend is built and gated on ANTHROPIC_API_KEY, the same key as the Coach Assistant. Add it in
            Vercel, redeploy, and this page turns pasted Loom/Trellis transcripts into a client-facing summary,
            action items, and private coach notes. Nothing here ever messages a client.
          </p>
        </Card>
      ) : null}

      <Card className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-fg-dim">
            Client
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={busy}
              className={inputCls}
            >
              <option value="">No client (do not save)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-fg-dim">
            Week number
            <input
              type="number"
              min={1}
              value={weekNumber}
              onChange={(e) => setWeekNumber(e.target.value)}
              disabled={busy}
              placeholder="e.g. 8"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-fg-dim">
            Loom URL
            <input
              type="url"
              value={loomUrl}
              onChange={(e) => setLoomUrl(e.target.value)}
              disabled={busy}
              placeholder="https://www.loom.com/share/…"
              className={inputCls}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-dim">
          Transcript
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            disabled={!configured || busy}
            rows={8}
            placeholder={
              configured
                ? "Paste the full Loom or Trellis transcript here"
                : "Paste the transcript here (not yet connected)"
            }
            className={inputCls}
          />
        </label>
        <div className="flex items-center justify-end gap-3">
          {clientId ? null : (
            <span className="text-xs text-fg-muted">Pick a client to save this summary to their profile.</span>
          )}
          <Button onClick={() => void generate()} disabled={!configured || busy || !transcript.trim()}>
            {busy ? "Summarising…" : "Summarise"}
          </Button>
        </div>
      </Card>

      {result ? (
        <div className="space-y-4">
          <Panel title="Link" action={<CopyButton text={result.loomUrl ?? ""} what="Link" />}>
            {result.loomUrl ? (
              <a
                href={result.loomUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all text-sm text-accent hover:underline"
              >
                {result.loomUrl}
              </a>
            ) : (
              <p className="text-sm text-fg-muted">No Loom URL attached.</p>
            )}
          </Panel>
          <Section title="Summary" text={result.summary} note="Client-facing. Copy it into your own message; the HQ never sends it." />
          <Section title="Action items" text={result.actionItems} />
          <Section title="Coach notes" text={result.coachNotes} note="Internal only, never shown to the client." />
        </div>
      ) : null}

      <Panel
        title={`Past summaries${clientId ? `: ${clientNames.get(clientId) ?? ""}` : ""} (${visibleHistory.length})`}
        subtitle={clientId ? undefined : "Every summary you can see, newest first. Pick a client to narrow."}
      >
        {visibleHistory.length === 0 ? (
          <EmptyState
            icon="video"
            title="No summaries yet"
            message="Summaries land here (and on the client's profile) once you attach a client and summarise."
          />
        ) : (
          <div className="space-y-2">
            {visibleHistory.slice(0, 30).map((s) => (
              <details key={s.id} className="rounded-control border border-border-soft px-3 py-2">
                <summary className="cursor-pointer text-sm text-fg">
                  <span className="font-medium">{(s.clientId && clientNames.get(s.clientId)) ?? "Unlinked client"}</span>
                  <span className="ml-2 text-xs tabular-nums text-fg-muted">
                    {s.weekNumber ? `wk ${s.weekNumber} · ` : ""}
                    {fmtDate(s.createdAt)}
                  </span>
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
            {visibleHistory.length > 30 ? (
              <div className="px-1 pt-1 text-xs text-fg-muted">Showing the 30 most recent of {visibleHistory.length}.</div>
            ) : null}
          </div>
        )}
      </Panel>
    </div>
  );
}
