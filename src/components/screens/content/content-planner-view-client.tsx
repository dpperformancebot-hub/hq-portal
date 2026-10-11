"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Button, Card, PageHeader } from "@/components/ui";
import { Icon } from "@/lib/icons";
import type { ContentPost, PostType } from "@/lib/seed";
import { createContentPost, deleteContentPost, updateContentPost } from "@/lib/content-actions";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const POST_TYPES: PostType[] = ["Reel", "Post", "Story", "YouTube", "Email"];

const TYPE_STYLE: Record<PostType, string> = {
  Reel: "bg-type-video text-type-video-fg",
  Post: "bg-type-sop text-type-sop-fg",
  Story: "bg-type-article text-type-article-fg",
  YouTube: "bg-type-cpd text-type-cpd-fg",
  Email: "bg-type-template text-type-template-fg",
};

const inputCls =
  "rounded-control border border-border-soft bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent disabled:opacity-50";

type Draft = { id?: string; account: string; day: number; type: PostType; title: string };

type OptAction =
  | { kind: "add"; post: ContentPost }
  | { kind: "update"; post: ContentPost }
  | { kind: "delete"; id: string };

function reduce(state: ContentPost[], action: OptAction): ContentPost[] {
  switch (action.kind) {
    case "add":
      return [...state, action.post];
    case "update":
      return state.map((p) => (p.id === action.post.id ? action.post : p));
    case "delete":
      return state.filter((p) => p.id !== action.id);
  }
}

export function ContentPlannerView({
  accounts,
  posts,
  live,
}: {
  accounts: string[];
  posts: ContentPost[];
  live: boolean;
}) {
  const [optimistic, apply] = useOptimistic(posts, reduce);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const openNew = (account: string, day: number) => {
    if (!live) return;
    setMsg(null);
    setDraft({ account, day, type: "Post", title: "" });
  };
  const openEdit = (p: ContentPost) => {
    if (!live) return;
    setMsg(null);
    setDraft({ ...p });
  };

  const save = () => {
    if (!draft || !draft.title.trim()) return;
    const d = draft;
    setMsg(null);
    start(async () => {
      if (d.id) {
        apply({ kind: "update", post: { id: d.id, account: d.account, day: d.day, type: d.type, title: d.title } });
        const res = await updateContentPost(d.id, { account: d.account, day: d.day, type: d.type, title: d.title });
        if (!res.ok) return setMsg(res.error ?? "Could not save the post.");
      } else {
        const temp: ContentPost = { id: `temp-${crypto.randomUUID()}`, account: d.account, day: d.day, type: d.type, title: d.title };
        apply({ kind: "add", post: temp });
        const res = await createContentPost({ account: d.account, day: d.day, type: d.type, title: d.title });
        if (!res.ok) return setMsg(res.error ?? "Could not add the post.");
      }
      setDraft(null);
    });
  };

  const remove = () => {
    if (!draft?.id) return;
    const id = draft.id;
    setMsg(null);
    start(async () => {
      apply({ kind: "delete", id });
      const res = await deleteContentPost(id);
      if (!res.ok) return setMsg(res.error ?? "Could not delete the post.");
      setDraft(null);
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Brand"
        title="Content Planner"
        subtitle="Weekly schedule across accounts. This week."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled title="Week navigation lands with calendar dates in a later phase">
              This week
            </Button>
            <Button
              size="sm"
              onClick={() => openNew(accounts[0] ?? "", 0)}
              disabled={!live || accounts.length === 0}
              title={live ? "" : "Saving goes live with the database"}
            >
              <Icon name="plus" size={14} />
              Add post
            </Button>
          </div>
        }
      />

      {!live && (
        <div className="rounded-control border border-warn/40 bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
          Demo planner. Adding, editing, and removing posts goes live with the database (active in production).
        </div>
      )}

      {draft && (
        <Card className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_2fr_auto]">
            <select
              aria-label="Account"
              className={inputCls}
              value={draft.account}
              onChange={(e) => setDraft({ ...draft, account: e.target.value })}
              disabled={pending}
            >
              {accounts.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <select
              aria-label="Day"
              className={inputCls}
              value={draft.day}
              onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) })}
              disabled={pending}
            >
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
            <select
              aria-label="Type"
              className={inputCls}
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as PostType })}
              disabled={pending}
            >
              {POST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              className={inputCls}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Post title"
              disabled={pending}
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={save} disabled={pending || !draft.title.trim()}>
                {pending ? "Saving…" : draft.id ? "Save" : "Add"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            {msg ? <span className="text-sm text-danger">{msg}</span> : <span />}
            {draft.id && (
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
              >
                Delete post
              </button>
            )}
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[140px_repeat(7,1fr)] border-b border-border">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-muted">Account</div>
            {DAYS.map((d) => (
              <div key={d} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
                {d}
              </div>
            ))}
          </div>
          {accounts.map((account) => (
            <div key={account} className="grid grid-cols-[140px_repeat(7,1fr)] border-b border-border-soft">
              <div className="px-3 py-3 text-sm font-medium text-fg">{account}</div>
              {DAYS.map((_, dayIdx) => {
                const cell = optimistic.filter((p) => p.account === account && p.day === dayIdx);
                return (
                  <div key={dayIdx} className="group/cell space-y-1 border-l border-border-soft p-2">
                    {cell.map((p) => (
                      // Drag-to-reschedule stays deferred; tap a chip to edit its day, type, or title.
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => openEdit(p)}
                        disabled={!live}
                        className={`block w-full truncate rounded-sm px-1.5 py-1 text-left text-[11px] ${TYPE_STYLE[p.type]} ${live ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                        title={live ? `Edit ${p.type}: ${p.title}` : `${p.type}: ${p.title}`}
                      >
                        {p.title}
                      </button>
                    ))}
                    {live && (
                      <button
                        type="button"
                        onClick={() => openNew(account, dayIdx)}
                        className="flex w-full items-center justify-center rounded-sm py-0.5 text-fg-muted opacity-0 transition-opacity hover:bg-surface-2 group-hover/cell:opacity-100"
                        aria-label={`Add post for ${account} on ${DAYS[dayIdx]}`}
                      >
                        <Icon name="plus" size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
