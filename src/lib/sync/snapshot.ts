// Daily snapshot writer (M5 phase 2, step 3). One row per day in
// daily_snapshots, computed from the clients projection. Powers true
// "yesterday" deltas in the Daily Digest and fast trend charts.
//
// gained_1d / lost_1d are exact-date matches (start_date / end_date equal to
// the snapshot date), so the job should run after the day's sync.

import { dbAdmin } from "@/lib/db/client";
import type { ClientRow } from "@/lib/db/rows";

export async function writeDailySnapshot(date = new Date()): Promise<void> {
  const db = dbAdmin();
  const day = date.toISOString().slice(0, 10);

  const { data, error } = await db
    .from("clients")
    .select("status,weekly_rate,start_date,end_date,coach_id");
  if (error) throw new Error(`snapshot read failed: ${error.message}`);
  const rows = (data ?? []) as Pick<
    ClientRow,
    "status" | "weekly_rate" | "start_date" | "end_date" | "coach_id"
  >[];

  const active = rows.filter((r) => r.status === "active");
  const mrr = active.reduce((s, r) => s + Math.round((Number(r.weekly_rate) * 52) / 12), 0);

  const perCoach: Record<string, { active: number; mrr: number }> = {};
  for (const r of active) {
    const key = r.coach_id ?? "unassigned";
    perCoach[key] ??= { active: 0, mrr: 0 };
    perCoach[key].active += 1;
    perCoach[key].mrr += Math.round((Number(r.weekly_rate) * 52) / 12);
  }

  const { error: upsertErr } = await db.from("daily_snapshots").upsert(
    {
      snapshot_date: day,
      active_count: active.length,
      paused_count: rows.filter((r) => r.status === "paused").length,
      cancelled_count: rows.filter((r) => r.status === "cancelled").length,
      mrr,
      gained_1d: rows.filter((r) => r.start_date === day).length,
      lost_1d: rows.filter((r) => r.status === "cancelled" && r.end_date === day).length,
      per_coach: perCoach,
    },
    { onConflict: "snapshot_date" },
  );
  if (upsertErr) throw new Error(`snapshot upsert failed: ${upsertErr.message}`);
}
