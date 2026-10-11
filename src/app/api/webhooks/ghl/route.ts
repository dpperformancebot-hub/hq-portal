// POST /api/webhooks/ghl: receives GHL contact/opportunity events and
// updates single projection rows. Inert unless HQ_PERSISTENCE=true.
//
// Auth (DEFAULT DECISION 9, flagged): shared secret, accepted either as the
// x-hq-webhook-secret header or a ?token= query param. GHL workflow webhook
// actions can set custom headers on some plans and query params on all, so
// both are accepted. GHL_WEBHOOK_SECRET env; unset = endpoint rejects all.
// GHL's signed webhook subscriptions can replace this at hardening time.
//
// Payload tolerance: GHL native subscriptions send { type: "ContactCreate",
// id }, workflow webhooks send looser shapes. Entity + id are extracted from
// the common key variants; unrecognised payloads are logged and 202'd so GHL
// does not retry-spam.

import { NextRequest, NextResponse } from "next/server";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { handleContactEvent, handleOpportunityEvent } from "@/lib/sync/webhook-handlers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

function extract(body: Body): { entity: "contact" | "opportunity"; id: string } | null {
  const type = (str(body.type) ?? str(body.event) ?? "").toLowerCase();
  const oppId = str(body.opportunityId) ?? str(body.opportunity_id);
  const contactId = str(body.contactId) ?? str(body.contact_id);
  const bareId = str(body.id);

  if (type.includes("opportunity")) {
    const id = oppId ?? bareId;
    return id ? { entity: "opportunity", id } : null;
  }
  if (type.includes("contact")) {
    const id = contactId ?? bareId;
    return id ? { entity: "contact", id } : null;
  }
  // Workflow webhooks often omit a type; prefer the explicit id keys.
  if (oppId) return { entity: "opportunity", id: oppId };
  if (contactId ?? bareId) return { entity: "contact", id: (contactId ?? bareId) as string };
  return null;
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.GHL_WEBHOOK_SECRET;
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

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const target = extract(body);
  if (!target) {
    // Log shape-only (no payload: it can carry PII), accept so GHL stops retrying.
    await dbAdmin().from("sync_events").insert({
      source: "webhook",
      entity: "unknown",
      action: "unrecognised_payload",
    });
    return NextResponse.json({ ok: false, reason: "unrecognised payload" }, { status: 202 });
  }

  try {
    const result =
      target.entity === "contact"
        ? await handleContactEvent(target.id)
        : await handleOpportunityEvent(target.id);
    return NextResponse.json({ ok: true, entity: target.entity, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "webhook handling failed";
    console.error("[webhooks/ghl]", message); // message only, never payload
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
