"use client";

// R19-2c: the removed coaches, and the way back. A deactivated coach is hidden
// from every picker, capacity bar and coach list on purpose, which would leave
// Reactivate with nothing to act on if there were no surface like this one.
// Their historic client count is shown because it is the proof that nothing was
// deleted: those clients still carry their name in history.

import { useEffect, useState } from "react";
import { Button, Panel, useToast } from "@/components/ui";
import { listInactiveCoachesAction, reactivateCoachAction, type InactiveCoach } from "@/lib/coach-remove-actions";

export function RemovedCoachesPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<InactiveCoach[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => { void listInactiveCoachesAction().then(setRows); };
  useEffect(load, []);

  if (rows === null || rows.length === 0) return null;

  return (
    <Panel title={`Removed coaches (${rows.length})`} subtitle="Deactivated, not deleted. Their history and past clients are intact.">
      <div className="space-y-1">
        {rows.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 rounded-control px-2 py-1.5 hover:bg-surface-2">
            <div className="min-w-0">
              <div className="truncate text-sm text-fg">{c.name}</div>
              <div className="text-[11px] text-fg-muted">
                {c.clients} client{c.clients === 1 ? "" : "s"} in their history
                {c.removedAt ? ` · removed ${String(c.removedAt).slice(0, 10)}` : ""}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy === c.id}
              onClick={async () => {
                setBusy(c.id);
                try {
                  const r = await reactivateCoachAction(c.id);
                  toast.push(r.ok ? `${r.name} is active again. Their old clients stay where they were moved.` : r.error);
                  if (r.ok) load();
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === c.id ? "Restoring..." : "Reactivate"}
            </Button>
          </div>
        ))}
      </div>
    </Panel>
  );
}
