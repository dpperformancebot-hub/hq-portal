"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/components/role/role-provider";

// Dev-only preview affordance: when previewing the coach role (no real auth),
// pick which coach to view as. Sets the hq-dev-coach cookie that role-server
// reads as linkedCoachId, so the whole coach portal re-scopes to that coach's
// own clients, check-ins, and pay. Hidden under real auth (locked) and for any
// role other than coach.
const COACH_COOKIE = "hq-dev-coach";

export function CoachPreviewPicker({ coaches }: { coaches: { id: string; name: string }[] }) {
  const { role, locked } = useRole();
  const router = useRouter();
  const [coachId, setCoachId] = useState("");

  useEffect(() => {
    setCoachId(document.cookie.match(/hq-dev-coach=([^;]+)/)?.[1] ?? "");
  }, []);

  if (locked || role !== "coach" || coaches.length === 0) return null;

  return (
    <label className="flex items-center gap-2 rounded-control border border-border bg-surface-2 px-2 py-1 text-xs text-fg-dim">
      <span className="text-fg-muted">Coach</span>
      <select
        aria-label="Preview as coach (dev only)"
        value={coachId}
        onChange={(e) => {
          const v = e.target.value;
          setCoachId(v);
          document.cookie = `${COACH_COOKIE}=${v}; path=/; max-age=31536000; SameSite=Lax`;
          router.refresh();
        }}
        className="bg-transparent text-xs font-medium text-fg focus:outline-none"
      >
        <option value="">Head coach</option>
        {coaches.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
