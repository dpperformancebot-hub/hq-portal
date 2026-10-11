import { NextRequest, NextResponse } from "next/server";
import { BRAND } from "@/lib/brand";
import { insertNotification } from "@/lib/notify";

// Backup failure alerts (2026-08-17): the nightly GitHub Actions backup
// (rawandformed/tjd-hq-backups) calls this when a dump, verify-restore, or
// upload step fails. Rides the R6-5 notifications pipeline: owner bell row +
// Slack when SLACK_WEBHOOK_URL is configured. Auth: Bearer CRON_SECRET (the
// same secret the sync cron uses). INBOUND ONLY, no client contact possible.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { brand?: string; run?: string; stage?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const res = await insertNotification({
    recipientName: BRAND.ownerName,
    type: "backup_failed",
    payload: {
      brand: (body.brand ?? "unknown").slice(0, 20),
      run: (body.run ?? "").slice(0, 30),
      stage: (body.stage ?? "").slice(0, 30),
    },
  });
  return NextResponse.json({ ok: true, stored: res.stored, slack: res.slack });
}
