// Kahunas -> HQ intake. Kahunas has no REST API but is a Zapier app, so a Zap
// maps a Kahunas trigger onto the contract below and POSTs it to
// /api/webhooks/kahunas. Server-side only (service-role writes). PII boundary:
// we store only the milestone + before/after markers, never health metrics.

import { dbAdmin } from "@/lib/db/client";
import type { CheckInCode } from "@/lib/seed/types";

export type KahunasTransformation = {
  clientName: string; // matched to clients.name (case-insensitive)
  milestone: string; // e.g. "W12"
  permission?: "Y" | "N" | "?";
  hasBefore?: boolean;
  hasAfter?: boolean;
};

export type KahunasCheckIn = {
  clientName: string; // matched to clients.name (case-insensitive)
  submittedAt?: string; // ISO; defaults to now()
  code?: CheckInCode; // weekly status; defaults to "Y" (submitted)
  weekNumber?: number;
  adherence?: number; // 0..100
  externalId?: string; // Kahunas submission id, used as the idempotency key
};

export type IntakeResult = { ok: boolean; detail: string };

async function matchClient(name: string): Promise<{ id: string; coach_id: string | null } | null> {
  const { data } = await dbAdmin()
    .from("clients")
    .select("id,coach_id")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function applyKahunasCheckIn(p: KahunasCheckIn): Promise<IntakeResult> {
  const name = (p.clientName ?? "").trim();
  if (!name) return { ok: false, detail: "missing clientName" };

  const client = await matchClient(name);
  if (!client) return { ok: false, detail: `no client matched "${name}"` };
  if (!client.coach_id) return { ok: false, detail: `client "${name}" has no coach assigned` };

  const submittedAt = p.submittedAt ?? new Date().toISOString();
  const row = {
    client_id: client.id,
    coach_id: client.coach_id,
    submitted_at: submittedAt,
    code: (p.code ?? "Y") as CheckInCode,
    adherence: typeof p.adherence === "number" ? p.adherence : null,
    week_number: typeof p.weekNumber === "number" ? p.weekNumber : null,
    source: "kahunas" as const,
    external_id: p.externalId ?? null,
  };

  // Idempotent on Kahunas' submission id when present; else dedupe by
  // client + date + source so a re-polled form does not duplicate.
  const existing = p.externalId
    ? await dbAdmin().from("check_ins").select("id").eq("external_id", p.externalId).limit(1).maybeSingle()
    : await dbAdmin()
        .from("check_ins")
        .select("id")
        .eq("client_id", client.id)
        .eq("submitted_at", submittedAt)
        .eq("source", "kahunas")
        .limit(1)
        .maybeSingle();

  if (existing.data) {
    await dbAdmin().from("check_ins").update(row).eq("id", existing.data.id);
    return { ok: true, detail: `updated check-in for ${name}` };
  }
  await dbAdmin().from("check_ins").insert(row);
  return { ok: true, detail: `created check-in for ${name}` };
}

export async function applyKahunasTransformation(p: KahunasTransformation): Promise<IntakeResult> {
  const name = (p.clientName ?? "").trim();
  const milestone = (p.milestone ?? "").trim();
  if (!name || !milestone) return { ok: false, detail: "missing clientName or milestone" };

  const { data: client } = await dbAdmin()
    .from("clients")
    .select("id,coach_id")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (!client) return { ok: false, detail: `no client matched "${name}"` };
  if (!client.coach_id) return { ok: false, detail: `client "${name}" has no coach assigned` };

  const assets = [
    ...(p.hasBefore ? [{ kind: "before" }] : []),
    ...(p.hasAfter ? [{ kind: "after" }] : []),
  ];
  const row = {
    client_id: client.id,
    coach_id: client.coach_id,
    milestone,
    permission: p.permission ?? null,
    before_after_assets: assets,
  };

  // Upsert by (client_id, milestone): update if present, else insert. The
  // table has no unique constraint on that pair, so check first.
  const { data: existing } = await dbAdmin()
    .from("transformations")
    .select("id")
    .eq("client_id", client.id)
    .eq("milestone", milestone)
    .limit(1)
    .maybeSingle();

  if (existing) {
    await dbAdmin().from("transformations").update(row).eq("id", existing.id);
    return { ok: true, detail: `updated ${milestone} transformation for ${name}` };
  }
  await dbAdmin().from("transformations").insert(row);
  return { ok: true, detail: `created ${milestone} transformation for ${name}` };
}
