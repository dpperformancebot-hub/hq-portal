"use server";

// HQ-native create for the Marketing & Campaigns screen: the campaigns and
// lead_magnets stores (migration 20260630000002). Server-side only: every
// write goes through the service-role dbAdmin() client and is gated by
// persistenceEnabled(), so the actions no-op with an honest message until the
// owner flips HQ_PERSISTENCE.
//
// Both tables are internal growth-tracking lists with no outbound path: they
// contact nobody, and creating a campaign here does NOT launch ad spend or send
// anything. Do NOT add any send/outreach here. roas is optional (left null when
// blank); the read mapper coerces a null back to 0 for the table.

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import type { Campaign, LeadMagnet } from "@/lib/seed";
import { assertBrandManager } from "@/lib/role-server";

const PATH = "/marketing-campaigns";

type Result<T> = { ok: boolean; error?: string; data?: T };

const OFF: Result<never> = {
  ok: false,
  error: "Persistence is off. Saving goes live with the database.",
};

// The seed view contract is active | ended; the table also allows paused.
const CAMPAIGN_STATUSES: Campaign["status"][] = ["active", "ended"];

const nonNeg = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

// --- campaigns ------------------------------------------------------------

export async function createCampaignAction(input: {
  name: string;
  type: string;
  status: Campaign["status"];
  spend: number;
  leads: number;
  closed: number;
  roas: number | null;
  period: string;
}): Promise<Result<Campaign>> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!persistenceEnabled()) return OFF;
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Campaign name is required." };
  const status = CAMPAIGN_STATUSES.includes(input.status) ? input.status : "active";
  const { data, error } = await dbAdmin()
    .from("campaigns")
    .insert({
      name,
      type: input.type.trim() || "Paid",
      status,
      spend: nonNeg(input.spend),
      leads: Math.round(nonNeg(input.leads)),
      closed: Math.round(nonNeg(input.closed)),
      roas: input.roas != null && input.roas > 0 ? input.roas : null,
      period: input.period.trim() || null,
    })
    .select("id,name,type,status,spend,leads,closed,roas,period")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not add campaign." };
  const r = data as {
    id: string;
    name: string;
    type: string;
    status: "active" | "paused" | "ended";
    spend: number | string;
    leads: number;
    closed: number;
    roas: number | string | null;
    period: string | null;
  };
  revalidatePath(PATH);
  return {
    ok: true,
    data: {
      id: r.id,
      name: r.name,
      type: r.type,
      status: r.status === "active" ? "active" : "ended",
      spend: Number(r.spend) || 0,
      leads: r.leads,
      closed: r.closed,
      roas: Number(r.roas) || 0,
      period: r.period ?? "",
    },
  };
}

// --- lead_magnets ---------------------------------------------------------

export async function createLeadMagnetAction(input: {
  name: string;
  optIns: number;
  conversionPct: number;
}): Promise<Result<LeadMagnet>> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  if (!persistenceEnabled()) return OFF;
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Lead magnet name is required." };
  const { data, error } = await dbAdmin()
    .from("lead_magnets")
    .insert({
      name,
      opt_ins: Math.round(nonNeg(input.optIns)),
      conversion_pct: nonNeg(input.conversionPct),
    })
    .select("id,name,opt_ins,conversion_pct")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not add lead magnet." };
  const r = data as { id: string; name: string; opt_ins: number; conversion_pct: number | string };
  revalidatePath(PATH);
  return { ok: true, data: { id: r.id, name: r.name, optIns: r.opt_ins, conversionPct: Number(r.conversion_pct) || 0 } };
}
