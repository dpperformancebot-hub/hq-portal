"use client";

// R9-2: correct a historical check-in's status code in place. The pill is the
// control: click it (when editable), pick the right code, done. Server action
// re-checks roster scope + the CHECKIN_EDITS_ADMIN_ONLY toggle.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusPill, useToast } from "@/components/ui";
import { CHECKIN_META, type CheckInCode } from "@/lib/seed/types";
import { updateCheckInCodeAction } from "@/lib/check-in-summary-actions";

const CODES = Object.keys(CHECKIN_META) as CheckInCode[];

export function CheckInCodeEditor({
  checkInId,
  code,
  canEdit,
}: {
  checkInId: string;
  code: CheckInCode | null;
  canEdit: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(code);
  const [pending, start] = useTransition();
  const meta = current ? CHECKIN_META[current] : null;

  const pick = (next: CheckInCode) => {
    if (pending || next === current) {
      setOpen(false);
      return;
    }
    const prev = current;
    setCurrent(next);
    setOpen(false);
    start(async () => {
      const res = await updateCheckInCodeAction({ checkInId, code: next });
      if (res.ok) {
        toast.push(`Check-in corrected to ${CHECKIN_META[next].label}.`, "success");
        router.refresh();
      } else {
        setCurrent(prev);
        toast.push(res.error, "error");
      }
    });
  };

  if (!canEdit) {
    return meta ? <StatusPill variant={meta.pill} /> : <span className="text-xs text-fg-dim">-</span>;
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        title="Correct this check-in's status"
        className="rounded-pill transition-opacity hover:opacity-75 disabled:opacity-50"
      >
        {meta ? <StatusPill variant={meta.pill} /> : <span className="text-xs text-fg-dim">set status</span>}
      </button>
      {open ? (
        <span className="absolute left-0 top-full z-20 mt-1 flex w-44 flex-col rounded-card border border-border bg-surface p-1 shadow-lg">
          {CODES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => pick(c)}
              className={`flex items-center gap-2 rounded-control px-2 py-1 text-left text-xs transition-colors hover:bg-surface-2 ${
                c === current ? "bg-surface-2" : ""
              }`}
            >
              <StatusPill variant={CHECKIN_META[c].pill} />
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
