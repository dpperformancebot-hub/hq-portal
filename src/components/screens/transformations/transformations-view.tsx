"use client";

import { useState, useTransition } from "react";
import { Button, Card, EmptyState, PageHeader, useToast } from "@/components/ui";
import { Icon } from "@/lib/icons";
import { type TransformationCard, type TransformationStatus } from "@/lib/seed";
import {
  advanceTransformationAction,
  sendBackTransformationAction,
  setPostLogAction,
} from "@/lib/transformations-actions";

// R4-4: stages where the post-log editor (sheet "Ready To Post"/"Post Log")
// is available: approved onward.
const POST_LOG_STAGES: TransformationStatus[] = ["admin_approved", "scheduled", "posted"];

function PostLogEditor({ card }: { card: TransformationCard }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [ig, setIg] = useState(card.postedIg ?? false);
  const [tt, setTt] = useState(card.postedTt ?? false);
  const [canva, setCanva] = useState(card.canvaUrl ?? "");
  const [caption, setCaption] = useState(card.caption ?? "");
  const [pending, start] = useTransition();

  const save = () => {
    start(async () => {
      const res = await setPostLogAction({
        id: card.id,
        postedIg: ig,
        postedTt: tt,
        canvaUrl: canva || null,
        caption: caption || null,
      });
      if (res.ok) toast.push(`${card.clientName}: post log saved.`);
      else toast.push(res.error ?? "Could not save the post log.", "error");
    });
  };

  const box = (checked: boolean, label: string, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      className={`flex items-center gap-1.5 rounded-pill border px-2 py-0.5 text-[11px] transition-colors ${
        checked ? "border-accent bg-accent-soft text-accent-deep" : "border-border text-fg-dim hover:border-accent/40"
      }`}
    >
      <span>{checked ? "✓" : "○"}</span>
      {label}
    </button>
  );

  return (
    <div className="border-t border-border-soft pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-accent hover:underline"
      >
        {open ? "Hide post log" : `Post log${ig || tt ? " ·" : ""}${ig ? " IG✓" : ""}${tt ? " TT✓" : ""}`}
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            {box(ig, "Posted IG", () => setIg((v) => !v))}
            {box(tt, "Posted TikTok", () => setTt((v) => !v))}
          </div>
          <input
            value={canva}
            onChange={(e) => setCanva(e.target.value)}
            placeholder="Canva link (https://…)"
            className="w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
            aria-label={`${card.clientName} Canva link`}
          />
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Caption"
            className="w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
            aria-label={`${card.clientName} caption`}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save post log"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const STATUS_META: Record<
  TransformationStatus,
  { label: string; chip: string; next?: TransformationStatus; action?: string }
> = {
  draft: { label: "Draft", chip: "bg-surface-2 text-fg-muted", next: "coach_approved", action: "Coach approve" },
  coach_approved: { label: "Head Coach Approved", chip: "bg-status-messaged text-status-messaged-fg", next: "admin_approved", action: "Admin approve" },
  admin_approved: { label: "Admin approved", chip: "bg-status-sent text-status-sent-fg", next: "scheduled", action: "Schedule" },
  scheduled: { label: "Scheduled", chip: "bg-status-due text-status-due-fg", next: "posted", action: "Mark posted" },
  posted: { label: "Posted", chip: "bg-status-submitted text-status-submitted-fg" },
};

const TABS: { label: string; status: TransformationStatus | "all" }[] = [
  { label: "All", status: "all" },
  { label: "Draft", status: "draft" },
  { label: "Head Coach Approved", status: "coach_approved" },
  { label: "Admin approved", status: "admin_approved" },
  { label: "Scheduled", status: "scheduled" },
  { label: "Posted", status: "posted" },
];

function Slot({ label, filled }: { label: string; filled: boolean }) {
  return filled ? (
    <div className="flex h-20 flex-1 flex-col items-center justify-center gap-1 rounded-control border border-border-soft bg-surface-2 text-fg-muted">
      <Icon name="image" size={18} />
      <span className="text-[10px] uppercase tracking-[0.08em]">{label}</span>
    </div>
  ) : (
    <div className="flex h-20 flex-1 flex-col items-center justify-center gap-1 rounded-control border border-dashed border-border text-fg-muted">
      <Icon name="plus" size={16} />
      <span className="text-[10px] uppercase tracking-[0.08em]">{label}</span>
    </div>
  );
}

export function TransformationsView({ transformations }: { transformations: TransformationCard[] }) {
  // Optimistic UI over a persisted state machine: advancing writes
  // transformations.status to Supabase via advanceTransformationAction (which
  // revalidates), and the card reconciles to the persisted stage. On failure
  // (no datastore, or another user already advanced it) the optimistic change
  // rolls back and the error shows on the card.
  const [items, setItems] = useState(transformations);
  const [tab, setTab] = useState<TransformationStatus | "all">("all");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  // A9: card id whose send-back reason box is open, plus its draft reason.
  const [sendBackId, setSendBackId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [, startTransition] = useTransition();

  const setStatus = (id: string, status: TransformationStatus, sentBackReason?: string | null) =>
    setItems((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status, sentBackReason: sentBackReason === undefined ? t.sentBackReason : sentBackReason } : t,
      ),
    );

  const advance = (id: string, from: TransformationStatus) => {
    const next = STATUS_META[from].next;
    if (!next) return;
    setErrors((e) => {
      const rest = { ...e };
      delete rest[id];
      return rest;
    });
    setPending((p) => ({ ...p, [id]: true }));
    setStatus(id, next); // optimistic
    startTransition(async () => {
      const res = await advanceTransformationAction(id, from);
      if (!res.ok) {
        setStatus(id, from); // roll back
        setErrors((e) => ({ ...e, [id]: res.error }));
      } else {
        setStatus(id, res.status); // reconcile to persisted stage
      }
      setPending((p) => {
        const rest = { ...p };
        delete rest[id];
        return rest;
      });
    });
  };

  // A9: send back one stage with a required reason. Optimistic like advance;
  // the reason renders on the card until it moves forward again.
  const SENT_BACK_TO: Partial<Record<TransformationStatus, TransformationStatus>> = {
    coach_approved: "draft",
    admin_approved: "coach_approved",
    scheduled: "admin_approved",
  };
  const sendBack = (id: string, from: TransformationStatus) => {
    const prev = SENT_BACK_TO[from];
    const trimmed = reason.trim();
    if (!prev || !trimmed) return;
    setErrors((e) => {
      const rest = { ...e };
      delete rest[id];
      return rest;
    });
    setPending((p) => ({ ...p, [id]: true }));
    setStatus(id, prev, trimmed); // optimistic
    setSendBackId(null);
    setReason("");
    startTransition(async () => {
      const res = await sendBackTransformationAction(id, from, trimmed);
      if (!res.ok) {
        setStatus(id, from, null); // roll back
        setErrors((e) => ({ ...e, [id]: res.error }));
      } else {
        setStatus(id, res.status, trimmed);
        if (res.warning) setErrors((e) => ({ ...e, [id]: res.warning as string }));
      }
      setPending((p) => {
        const rest = { ...p };
        delete rest[id];
        return rest;
      });
    });
  };

  const total = items.length;
  const inFlight = items.filter((t) => t.status !== "draft" && t.status !== "posted").length;
  const ready = items.filter((t) => t.status === "scheduled").length;
  const filtered = tab === "all" ? items : items.filter((t) => t.status === tab);

  return (
    <div className="space-y-6">
      <PageHeader
        back
        eyebrow="Operations"
        title="Results Tracker"
        subtitle={`${total} total · ${inFlight} in-flight · ${ready} ready to post · approval flows coach to admin`}
      />

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => {
          const count = t.status === "all" ? items.length : items.filter((x) => x.status === t.status).length;
          const isActive = t.status === tab;
          return (
            <button
              key={t.label}
              type="button"
              onClick={() => setTab(t.status)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? "border-accent text-fg" : "border-transparent text-fg-dim hover:text-fg"
              }`}
            >
              {t.label}
              <span className="text-xs tabular-nums text-fg-muted">{count}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon="image" title="Nothing here" message="No transformations in this stage." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const meta = STATUS_META[t.status];
            return (
              <Card key={t.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-fg">{t.clientName}</div>
                    <div className="truncate text-xs text-fg-dim">{t.coachName}</div>
                  </div>
                  <span className="shrink-0 rounded-pill bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-deep">
                    {t.milestone}
                  </span>
                </div>

                <div className="flex gap-2">
                  <Slot label="Before" filled={t.hasBefore} />
                  <Slot label="After" filled={t.hasAfter} />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium ${meta.chip}`}>
                    {meta.label}
                  </span>
                  <div className="flex items-center gap-2">
                    {SENT_BACK_TO[t.status] ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending[t.id]}
                        onClick={() => {
                          setSendBackId((cur) => (cur === t.id ? null : t.id));
                          setReason("");
                        }}
                      >
                        Send back
                      </Button>
                    ) : null}
                    {meta.action ? (
                      <Button
                        size="sm"
                        variant={t.status === "scheduled" ? "primary" : "ghost"}
                        disabled={pending[t.id]}
                        onClick={() => advance(t.id, t.status)}
                      >
                        {pending[t.id] ? "Saving..." : meta.action}
                      </Button>
                    ) : (
                      <span className="text-xs text-fg-muted">Posted</span>
                    )}
                  </div>
                </div>

                {sendBackId === t.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="Why is this going back? (required)"
                      className="w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setSendBackId(null)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={!reason.trim() || pending[t.id]}
                        onClick={() => sendBack(t.id, t.status)}
                      >
                        Send back a stage
                      </Button>
                    </div>
                  </div>
                ) : null}

                {t.sentBackReason && !pending[t.id] ? (
                  <p className="rounded-control bg-warn-soft px-2.5 py-1.5 text-xs text-warn">
                    Sent back: {t.sentBackReason}
                  </p>
                ) : null}

                {errors[t.id] ? (
                  <p className="text-xs text-danger" role="alert">
                    {errors[t.id]}
                  </p>
                ) : null}

                {/* R4-4: post log once approved. */}
                {POST_LOG_STAGES.includes(t.status) ? <PostLogEditor card={t} /> : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
