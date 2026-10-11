"use client";

// R12-8 (Dan's walkthrough): the per-client workflow flags on the check-in
// card. Program Done (defaults No, tick when delivered), Progress Review rank
// 1-4, and the transformation pair that feeds Results: ticking
// "Transformation had" creates the draft Results card if none exists.

import { useState, useTransition } from "react";
import { Panel, useToast } from "@/components/ui";
import { setClientFlagsAction, type ClientFlagsPatch } from "@/lib/client-flags-actions";
import type { Client } from "@/lib/seed/types";

export function ClientFlagsPanel({ client, canEdit }: { client: Client; canEdit: boolean }) {
  const toast = useToast();
  const [flags, setFlags] = useState({
    programDone: client.programDone ?? false,
    progressReviewRank: client.progressReviewRank ?? null,
    transformationHad: client.transformationHad ?? false,
    transformationPostApproved: client.transformationPostApproved ?? false,
  });
  const [pending, start] = useTransition();

  const apply = (patch: ClientFlagsPatch) => {
    const prev = { ...flags };
    setFlags((f) => ({ ...f, ...patch }));
    start(async () => {
      const res = await setClientFlagsAction(client.id, patch);
      if (!res.ok) {
        setFlags(prev);
        toast.push(res.error, "error");
      } else if (patch.transformationHad === true) {
        toast.push("Flagged. A draft card is waiting in Results.", "success");
      }
    });
  };

  const box = "h-4 w-4 cursor-pointer accent-accent disabled:cursor-default";
  return (
    <Panel title="Check-in flags" subtitle="Program delivery and results signals. The transformation tick flows to Results.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" className={box} disabled={!canEdit || pending} checked={flags.programDone}
            onChange={(e) => apply({ programDone: e.target.checked })} />
          Program done
        </label>
        <label className="flex items-center gap-2 text-sm text-fg">
          Progress review
          <select
            value={flags.progressReviewRank ?? ""}
            disabled={!canEdit || pending}
            onChange={(e) => apply({ progressReviewRank: e.target.value === "" ? null : Number(e.target.value) })}
            className="rounded-control border border-border bg-surface px-2 py-1 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent"
            aria-label="Progress review rank"
          >
            <option value="">unranked</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" className={box} disabled={!canEdit || pending} checked={flags.transformationHad}
            onChange={(e) => apply({ transformationHad: e.target.checked })} />
          Transformation had
        </label>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" className={box} disabled={!canEdit || pending} checked={flags.transformationPostApproved}
            onChange={(e) => apply({ transformationPostApproved: e.target.checked })} />
          Transformation post approved
        </label>
      </div>
    </Panel>
  );
}
