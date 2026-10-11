"use server";

// R18: the editable coach rate card. TJD FIT ONLY.
//
// TJD pays every coach different money, and it changes: each coach has their
// own rate per client, and earns more on clients they referred themselves.
// Until now that lived in a spreadsheet, and on DP it lives in code. Neither
// is somewhere the owner can edit it.
//
// Guarded three ways: the brand must be on the weeks-paid engine, the caller
// must be owner or admin, and every write is audited. On DP this action
// refuses outright, because DP's engine never reads these rows.

import { revalidatePath } from "next/cache";
import { BRAND } from "@/lib/brand";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import { moneyHiddenFromViewer } from "@/lib/access-policy";
import { getServerIdentity } from "@/lib/role-server";
import { DEFAULT_RATE_CARD } from "@/lib/pay/default-rate-card";
import type { TjdRateCard } from "@/lib/pay/tjd-pay";

export type CoachRateRow = TjdRateCard & {
  coachId: string;
  coachName: string;
  isActive: boolean;
  /** Owner's own roster: revenue tracked, no coach split. */
  ownerNoSplit: boolean;
  /** False when this coach has no stored row and is showing brand defaults. */
  stored: boolean;
};

export type RateResult = { ok: true } | { ok: false; error: string };

const NO_DB = "Coach rates need the HQ datastore. Set HQ_PERSISTENCE=true with Supabase configured.";
const WRONG_BRAND =
  "This brand does not use the weeks-paid payroll model, so it has no coach rate cards to edit.";
const NEEDS_MIGRATION =
  "Coach rates need a one-time database migration the owner must apply (20260926000001). It is written, not yet applied.";

const missingTable = (e: { code?: string; message?: string } | null) =>
  e?.code === "42P01" || /coach_pay_rates/i.test(e?.message ?? "");

/** Owner + admin, and only on a weeks-paid brand. Refused while the owner
 *  views as a coach on TJD (moneyHiddenFromViewer): the coach view is exactly
 *  what the coach sees. */
async function canEditRates(): Promise<{ ok: true; by: string } | { ok: false; error: string }> {
  if (BRAND.pay.model !== "weeks-paid") return { ok: false, error: WRONG_BRAND };
  const id = await getServerIdentity();
  if ((id.realRole !== "owner" && id.role !== "admin") || moneyHiddenFromViewer(id)) {
    return { ok: false, error: "Only the owner or an admin can change coach rates." };
  }
  return { ok: true, by: id.role };
}

const card = (r: Record<string, unknown> | null): TjdRateCard => ({
  brandWeekly: Number(r?.brand_weekly ?? 0),
  brandFortnightly: Number(r?.brand_fortnightly ?? 0),
  referralWeekly: Number(r?.referral_weekly ?? 0),
  referralFortnightly: Number(r?.referral_fortnightly ?? 0),
  clientWeekly: Number(r?.client_weekly ?? 0),
  clientFortnightly: Number(r?.client_fortnightly ?? 0),
});

/** Every coach with their rate card, falling back to the brand default for a
 *  coach who has never been given one. */
export async function listCoachRatesAction(): Promise<CoachRateRow[]> {
  const gate = await canEditRates();
  if (!gate.ok || !persistenceEnabled()) return [];
  const db = dbAdmin();
  const { data: coaches } = await db.from("coaches").select("id,name,is_active").order("name");
  let rates: Record<string, unknown>[] = [];
  const res = await db.from("coach_pay_rates").select("*");
  if (!res.error) rates = (res.data ?? []) as Record<string, unknown>[];
  const byCoach = new Map(rates.map((r) => [r.coach_id as string, r]));
  const fallback = DEFAULT_RATE_CARD;
  return ((coaches ?? []) as { id: string; name: string; is_active: boolean }[]).map((c) => {
    const row = byCoach.get(c.id) ?? null;
    return {
      coachId: c.id,
      coachName: c.name,
      isActive: c.is_active,
      ownerNoSplit: Boolean(row?.owner_no_split),
      stored: !!row,
      ...(row ? card(row) : (fallback ?? card(null))),
    };
  });
}

/** Save one coach's card. Rates are WEEKLY dollars; the form converts. */
export async function setCoachRatesAction(input: {
  coachId: string;
  rates: TjdRateCard;
  ownerNoSplit: boolean;
}): Promise<RateResult> {
  const gate = await canEditRates();
  if (!gate.ok) return gate;
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  if (!input.coachId) return { ok: false, error: "Missing coach." };

  const values = Object.values(input.rates);
  if (values.some((v) => !Number.isFinite(v) || v < 0)) {
    return { ok: false, error: "Every rate must be a number, and none can be negative." };
  }
  if (values.some((v) => v > 10_000)) {
    return { ok: false, error: "That rate looks wrong. These are WEEKLY dollars, not monthly." };
  }

  const db = dbAdmin();
  const { data: before } = await db.from("coach_pay_rates").select("*").eq("coach_id", input.coachId).maybeSingle();
  const { error } = await db.from("coach_pay_rates").upsert(
    {
      coach_id: input.coachId,
      brand_weekly: input.rates.brandWeekly,
      brand_fortnightly: input.rates.brandFortnightly,
      referral_weekly: input.rates.referralWeekly,
      referral_fortnightly: input.rates.referralFortnightly,
      client_weekly: input.rates.clientWeekly,
      client_fortnightly: input.rates.clientFortnightly,
      owner_no_split: input.ownerNoSplit,
      updated_by: gate.by,
    },
    { onConflict: "coach_id" },
  );
  if (error) return { ok: false, error: missingTable(error) ? NEEDS_MIGRATION : error.message };

  // Pay-affecting change: always leave a trail of what moved and who moved it.
  try {
    await db.from("sync_events").insert({
      source: "manual",
      entity: "coach",
      ghl_id: null,
      action: "coach_rates_changed",
      payload: { coach_id: input.coachId, from: before ?? null, to: input.rates, owner_no_split: input.ownerNoSplit, by: gate.by },
    });
  } catch {
    /* best-effort: the audit row must never fail the save */
  }

  revalidatePath("/settings");
  revalidatePath("/my-pay");
  revalidatePath("/financials");
  return { ok: true };
}
