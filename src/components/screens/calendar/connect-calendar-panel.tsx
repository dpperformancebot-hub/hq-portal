"use client";

// R12-13: the coach-facing connect/disconnect control for their personal
// calendar feed. The full secret URL is never echoed back - only a mask.

import { useState, useTransition } from "react";
import { Button, useToast } from "@/components/ui";
import { connectCalendarAction, disconnectCalendarAction } from "@/lib/calendar-connect-actions";

export function ConnectCalendarPanel({ maskedUrl }: { maskedUrl: string | null }) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();

  if (maskedUrl) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border px-4 py-2.5 text-sm">
        <span className="text-fg">
          Your calendar is connected: <span className="tabular-nums text-fg-dim">{maskedUrl}</span>
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await disconnectCalendarAction();
              toast.push(res.ok ? "Calendar disconnected." : res.error, res.ok ? "success" : "error");
            })
          }
        >
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-card border border-border px-4 py-3">
      <p className="text-sm text-fg">
        <span className="font-medium">Connect your calendar</span> to see your own events here beside the booked
        calls. In Google Calendar: Settings, your calendar, then copy the{" "}
        <span className="font-medium">Secret address in iCal format</span> and paste it below. Read-only; the link
        stays private to your login.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
          className="min-w-0 flex-1 rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
          aria-label="iCal address"
        />
        <Button
          size="sm"
          disabled={pending || !url.trim()}
          onClick={() =>
            start(async () => {
              const res = await connectCalendarAction(url);
              if (res.ok) {
                setUrl("");
                toast.push("Calendar connected. Your events now show alongside bookings.", "success");
              } else {
                toast.push(res.error, "error");
              }
            })
          }
        >
          {pending ? "Connecting…" : "Connect"}
        </Button>
      </div>
    </div>
  );
}
