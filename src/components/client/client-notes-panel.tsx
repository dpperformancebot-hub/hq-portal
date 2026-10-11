"use client";

// Add/read/delete HQ notes on a client, from the client profile (owner + coach)
// and reused wherever a client is in focus. Optimistic add/delete with rollback
// on failure (matches the audits-view pattern). Internal notes only: no
// outbound path. Persists via client-notes-actions, gated server-side on
// persistenceEnabled() (honest message until the owner applies the migration).

import { useState, useTransition } from "react";
import { EmptyState, Panel, useToast } from "@/components/ui";
import { createClientNoteAction, deleteClientNoteAction } from "@/lib/client-notes-actions";
import type { ClientNote } from "@/lib/client-notes";

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

export function ClientNotesPanel({ clientId, notes }: { clientId: string; notes: ClientNote[] }) {
  const toast = useToast();
  const [items, setItems] = useState<ClientNote[]>(notes);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const add = () => {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    const temp: ClientNote = {
      id: `temp-${items.length}-${body.length}`,
      clientId,
      coachId: null,
      authorName: "You",
      body,
      createdAt: new Date().toISOString(),
    };
    setItems((prev) => [temp, ...prev]); // optimistic
    setDraft("");
    startTransition(async () => {
      const res = await createClientNoteAction({ clientId, body });
      if (res.ok && res.data) {
        setItems((prev) => prev.map((n) => (n.id === temp.id ? { ...n, id: res.data!.id } : n)));
        toast.push("Note added");
      } else {
        setItems((prev) => prev.filter((n) => n.id !== temp.id)); // roll back
        setDraft(body);
        setError(res.error ?? "Could not save note.");
        toast.push(res.error ?? "Could not save note.", "error");
      }
    });
  };

  const remove = (id: string) => {
    const prev = items;
    setItems((p) => p.filter((n) => n.id !== id)); // optimistic
    startTransition(async () => {
      const res = await deleteClientNoteAction(id, clientId);
      if (res.ok) {
        toast.push("Note deleted");
      } else {
        setItems(prev); // roll back
        setError(res.error ?? "Could not delete note.");
        toast.push(res.error ?? "Could not delete note.", "error");
      }
    });
  };

  return (
    <Panel title={`Notes (${items.length})`}>
      <div className="space-y-3">
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a note about this client (internal only, never sent to them)"
            rows={2}
            className="w-full resize-y rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-fg-muted">Internal note. The HQ never contacts clients.</span>
            <button
              type="button"
              onClick={add}
              disabled={pending || !draft.trim()}
              className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "Saving…" : "Add note"}
            </button>
          </div>
          {error ? <p className="text-[11px] text-danger" role="alert">{error}</p> : null}
        </div>

        {items.length === 0 ? (
          <EmptyState icon="document" title="No notes yet" message="Notes you add appear here, newest first." />
        ) : (
          <div className="space-y-2">
            {items.map((n) => (
              <div key={n.id} className="rounded-control border border-border-soft px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-[11px] text-fg-muted">
                  <span>
                    {n.authorName ?? "Unknown"}
                    {n.createdAt ? ` · ${fmt(n.createdAt)}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(n.id)}
                    disabled={pending}
                    className="text-fg-muted transition-colors hover:text-danger disabled:opacity-40"
                    aria-label="Delete note"
                  >
                    Delete
                  </button>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{n.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
