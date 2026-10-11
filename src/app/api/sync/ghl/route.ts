// POST /api/sync/ghl: runs the GHL -> Supabase sync + daily snapshot.
// Inert unless HQ_PERSISTENCE=true. Auth: Bearer CRON_SECRET, or a Vercel
// cron invocation (x-vercel-cron header). Wire a Vercel cron to this route
// once persistence is live; until then trigger manually with curl.

import { NextRequest, NextResponse } from "next/server";
import { persistenceEnabled } from "@/lib/db/client";
import { syncGhlToDb } from "@/lib/sync/ghl-sync";
import { writeDailySnapshot } from "@/lib/sync/snapshot";

export const dynamic = "force-dynamic";
// 300s: Vercel's current ceiling on all plans (the old 60s note predates
// that). The DP book is now ~12k contacts + ~17k opportunities and GHL's
// list endpoints intermittently retry with backoff, so 60s was killing the
// nightly cron mid-run (no sync_event written, portal went stale 2026-07-18
// to 2026-07-24).
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron")) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(req: NextRequest) {
  if (!persistenceEnabled()) {
    return NextResponse.json({ error: "persistence disabled" }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncGhlToDb("poll");
    await writeDailySnapshot();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    // No PII in logs: message only.
    const message = e instanceof Error ? e.message : "sync failed";
    console.error("[sync/ghl]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return run(req);
}

// Vercel crons invoke with GET (vercel.json schedules 19:55 UTC, which is
// 5:55am AEST: the snapshot lands just before the 7am digest).
export async function GET(req: NextRequest) {
  return run(req);
}
