"use client";

// R3-3 (FEEDBACK-V2): coach feedback into the portal, replacing the
// Slack/Typeform flow. Simple default (owner can reshape when Dan sends the
// real field list): category + subject + details. Submissions store to
// coach_feedback and ALSO file a C3-routed ticket, so a coach's feedback
// lands on the head coach's board and the head coach's on the owner's.

import { useState, useTransition } from "react";
import { Button, EmptyState, PageHeader, Panel, useToast } from "@/components/ui";
import { submitFeedbackAction } from "@/lib/feedback-actions";
import { FEEDBACK_CATEGORIES, type FeedbackCategory, type FeedbackRow } from "@/lib/feedback-shared";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const CATEGORY_CLS: Record<FeedbackCategory, string> = {
  Feedback: "bg-accent-soft text-accent-deep",
  Issue: "bg-warn-soft text-warn",
  Idea: "bg-surface-2 text-fg-dim",
};

export function FeedbackView({ rows, teamWide }: { rows: FeedbackRow[]; teamWide: boolean }) {
  const toast = useToast();
  const [category, setCategory] = useState<FeedbackCategory>("Feedback");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [submitted, setSubmitted] = useState<FeedbackRow[]>([]);
  const [pending, start] = useTransition();

  const submit = () => {
    if (!subject.trim() || pending) return;
    start(async () => {
      const res = await submitFeedbackAction({ category, subject, details });
      if (res.ok) {
        setSubmitted((prev) => [
          {
            id: `local-${prev.length}`,
            coachName: "You",
            category,
            subject: subject.trim(),
            details: details.trim(),
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        setSubject("");
        setDetails("");
        toast.push(res.routedTo ? `Sent. Filed as a ticket for ${res.routedTo}.` : "Sent.");
      } else {
        toast.push(res.error, "error");
      }
    });
  };

  const list = [...submitted, ...rows];
  const inputCls =
    "w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Coach tools"
        title="Feedback"
        subtitle="Feedback, issues, and ideas for the team. Files a ticket to the head coach automatically."
      />

      <Panel title="Submit">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {FEEDBACK_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-pill px-3 py-1 text-xs font-medium transition-colors ${
                  category === c ? "bg-accent text-white" : "bg-surface-2 text-fg-dim hover:text-fg"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            maxLength={200}
            className={inputCls}
            aria-label="Feedback subject"
          />
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Details (optional)"
            rows={4}
            maxLength={4000}
            className={inputCls}
            aria-label="Feedback details"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={pending || !subject.trim()}>
              {pending ? "Sending…" : "Send feedback"}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel
        title={teamWide ? `Team submissions (${list.length})` : `Your submissions (${list.length})`}
        subtitle={teamWide ? "Everything the team has sent, newest first." : "What you have sent, newest first."}
      >
        {list.length === 0 ? (
          <EmptyState compact icon="megaphone" title="Nothing yet" message="Submissions land here as they are sent." />
        ) : (
          <div className="space-y-2">
            {list.map((r) => (
              <details key={r.id} className="rounded-control border border-border-soft px-3 py-2">
                <summary className="cursor-pointer text-sm text-fg">
                  <span className={`mr-2 rounded-pill px-2 py-0.5 text-[11px] font-semibold ${CATEGORY_CLS[r.category]}`}>
                    {r.category}
                  </span>
                  <span className="font-medium">{r.subject}</span>
                  <span className="ml-2 text-xs text-fg-muted">
                    {teamWide ? `${r.coachName} · ` : ""}
                    {fmtDate(r.createdAt)}
                  </span>
                </summary>
                {r.details ? <p className="mt-2 whitespace-pre-wrap text-sm text-fg-dim">{r.details}</p> : null}
              </details>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
