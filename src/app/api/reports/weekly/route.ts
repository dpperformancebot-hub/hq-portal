// GET /api/reports/weekly: snapshot the weekly report into the reports store
// (H1, FEEDBACK-V2). Runs from the Monday-morning Vercel cron (vercel.json);
// same auth as /api/sync/ghl (x-vercel-cron header, or Bearer CRON_SECRET for
// a manual run). Idempotent per week: re-runs update the same week's row.

import { NextRequest, NextResponse } from "next/server";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { getWeeklyReportData, renderWeeklyReportBody } from "@/lib/weekly-report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron")) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!persistenceEnabled()) {
    return NextResponse.json({ error: "persistence disabled" }, { status: 503 });
  }

  try {
    const data = await getWeeklyReportData();
    const title = `Weekly report · w/c ${data.weekStart}`;
    const body = renderWeeklyReportBody(data);
    const db = dbAdmin();

    // Idempotent per week: update the existing row for this week if the cron
    // re-fires, otherwise insert.
    const { data: existing } = await db.from("reports").select("id").eq("title", title).maybeSingle();
    const row = {
      title,
      type: "Weekly",
      period: `${data.weekStart} to ${data.weekEnd}`,
      body,
      generated_at: new Date().toISOString().slice(0, 10),
    };
    const { error } = existing
      ? await db.from("reports").update(row).eq("id", existing.id)
      : await db.from("reports").insert(row);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, title, updated: Boolean(existing) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "weekly report failed" },
      { status: 500 },
    );
  }
}
