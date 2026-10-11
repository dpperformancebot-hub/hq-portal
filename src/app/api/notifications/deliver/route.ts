import { NextRequest, NextResponse } from "next/server";
import { deliverPendingNotifications } from "@/lib/notify";

// R6-5: retry Slack delivery for notifications that missed their immediate
// send (rows with delivered_slack_at null, older than 5 minutes). Cron-only:
// same auth pattern as /api/sync/ghl (Bearer CRON_SECRET or the Vercel cron
// header). Team-internal delivery only, nothing client-facing.

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const isCron = req.headers.get("x-vercel-cron") !== null;
  if (!isCron && (!secret || auth !== `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const delivered = await deliverPendingNotifications();
  return NextResponse.json({ ok: true, delivered });
}
