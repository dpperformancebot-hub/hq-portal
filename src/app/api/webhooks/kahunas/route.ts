// POST /api/webhooks/kahunas: Kahunas -> Zapier -> HQ intake. Kahunas has no
// public REST API but is a Zapier app, so a Zap watches a Kahunas trigger and
// POSTs the contract in src/lib/sync/kahunas.ts here. Inert unless
// HQ_PERSISTENCE=true.
//
// Auth: shared secret, accepted as the x-hq-webhook-secret header OR a ?token=
// query param (Zapier's "Webhooks by Zapier" action can set either).
// KAHUNAS_WEBHOOK_SECRET env; unset = endpoint rejects all.
//
// Every hit is logged to sync_events (source "kahunas"). Skips return 202 so
// Zapier does not retry-spam rows we could not match.

import { NextRequest, NextResponse } from "next/server";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import {
  applyKahunasCheckIn,
  applyKahunasTransformation,
  type KahunasCheckIn,
  type KahunasTransformation,
} from "@/lib/sync/kahunas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.KAHUNAS_WEBHOOK_SECRET;
  if (!secret) return false;
  return (
    req.headers.get("x-hq-webhook-secret") === secret ||
    req.nextUrl.searchParams.get("token") === secret
  );
}

export async function POST(req: NextRequest) {
  if (!persistenceEnabled()) {
    return NextResponse.json({ error: "persistence disabled" }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* tolerate empty / non-JSON bodies */
  }

  // Check-ins are the primary Kahunas feed, so they are the default.
  const type = String(body.type ?? "checkin").toLowerCase();
  let entity = "checkin";
  let result: { ok: boolean; detail: string };
  if (type.includes("transformation")) {
    entity = "transformation";
    result = await applyKahunasTransformation(body as unknown as KahunasTransformation);
  } else if (type.includes("check")) {
    result = await applyKahunasCheckIn(body as unknown as KahunasCheckIn);
  } else {
    result = { ok: false, detail: `unhandled type "${type}" (checkin or transformation)` };
  }

  // Best-effort audit trail; never let logging failure break the response.
  try {
    await dbAdmin().from("sync_events").insert({
      source: "kahunas",
      entity,
      action: result.ok ? "applied" : "skipped",
      payload: { type, detail: result.detail },
      error: result.ok ? null : result.detail,
      processed_at: new Date().toISOString(),
    });
  } catch {
    /* logging is best-effort */
  }

  return NextResponse.json({ ok: result.ok, detail: result.detail }, { status: result.ok ? 200 : 202 });
}
