// The ONE place a GHL contact becomes a clients row. Both the nightly sync
// (ghl-sync.ts) and the GHL webhook (webhook-handlers.ts) call this, so the
// coach rule cannot drift between the two paths.
//
// 2026-10-01: the webhook used to build its own row. It resolved the coach by
// upserting the GHL name and reading the row back, so it (a) wrote NULL when
// the GHL Coach field was blank (the R16-1 bug, back again on the fast path),
// (b) resolved a DEACTIVATED coach and handed their clients straight back
// (undoing R19-2c within seconds instead of overnight), and (c) ignored
// BRAND.roster.ownFieldsInHq, so on TJD it overwrote the portal-owned coach
// and weekly rate. Making the webhook the instant path for coach changes
// would have made all three live, which is why this file exists.

import type { Client, Coach } from "@/lib/seed/types";
import { dbAdmin } from "@/lib/db/client";
import { fetchAllRows } from "@/lib/db/fetch-all";
import type { GhlPresentField } from "@/lib/ghl/map";
import { decideCoachId, type CoachIdDecision } from "@/lib/sync/coach-id-policy";

export type CoachContext = {
  coachNameByGhlId: Map<string, string>;
  /** ACTIVE coaches only (R19-2c). */
  coachUuidByName: Map<string, string>;
  inactiveCoachNames: Set<string>;
};

export type CoachDrift = {
  ghl_id: string;
  kept_coach_id: string | null;
  reason: CoachIdDecision["reason"];
  inactive_coach_name?: string;
};

const CHUNK = 400;

/**
 * Upsert the coaches GHL names (by name; capacities and rates keep their DB
 * values) and build the lookup the coach rule needs. Deactivated coaches are
 * kept OUT of `coachUuidByName`: the upsert touches name + role only, so it
 * never reactivates anyone.
 */
export async function upsertCoachesAndLoadContext(mapped: Coach[]): Promise<CoachContext> {
  const db = dbAdmin();
  const payload = mapped.map((c) => ({ name: c.name, role: c.role }));
  for (let i = 0; i < payload.length; i += CHUNK) {
    const { error } = await db.from("coaches").upsert(payload.slice(i, i + CHUNK), { onConflict: "name" });
    if (error) throw new Error(`coaches upsert failed: ${error.message}`);
  }
  const coachRows = await fetchAllRows<{ id: string; name: string; is_active: boolean }>(
    (from, to) => db.from("coaches").select("id,name,is_active").order("id").range(from, to),
    { label: "sync: coaches" },
  );
  return {
    coachUuidByName: new Map(coachRows.filter((r) => r.is_active !== false).map((r) => [r.name, r.id])),
    inactiveCoachNames: new Set(coachRows.filter((r) => r.is_active === false).map((r) => r.name)),
    coachNameByGhlId: new Map(mapped.map((c) => [c.id, c.name])),
  };
}

/**
 * The clients row for one mapped GHL contact, plus a drift entry when the
 * coach rule kept the existing coach over what GHL said.
 *
 * `ownFieldsInHq` brands (TJD) never get coach_id or weekly_rate in the
 * payload, so an upsert leaves the portal's values alone.
 */
/** The existing clients row, for the keep-what-the-portal-holds rule. */
export type ExistingClientRow = {
  coach_id?: string | null;
  plan?: string | null;
  billing_frequency?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  term_length?: number | null;
  weekly_rate?: number | null;
  source?: string | null;
};

export function projectClientRow(
  c: Client,
  opts: {
    ownFieldsInHq: boolean;
    /** coach_id on the existing row; undefined when there is no row yet. */
    existingCoachId: string | null | undefined;
    /** The whole existing row, when there is one. */
    existing?: ExistingClientRow | null;
    /** Which GHL fields this contact actually carried a value for. */
    present?: Set<GhlPresentField>;
    ctx: CoachContext;
    syncedAt: string;
  },
): {
  row: Record<string, unknown>;
  decision: CoachIdDecision | null;
  drift: CoachDrift | null;
  /** Fields GHL said nothing about, where the portal's value was kept. */
  keptFields: GhlPresentField[];
} {
  const existing = opts.existing ?? null;
  const present = opts.present;
  const keptFields: GhlPresentField[] = [];

  /**
   * R19-6, ONE RULE FOR EVERY GHL-MAPPED FIELD: a blank or unrecognised GHL
   * value never overwrites what the portal holds.
   *
   * The mapper must return something for every field, so an empty CRM cell
   * arrives as a default: plan "Weekly", rate 0, source "Instagram". Projected
   * onto an existing row those defaults are indistinguishable from real data,
   * and that is how 18 TJD clients moved from fortnightly to weekly overnight
   * and started being paid at the wrong rate. Presence, not the value, decides.
   *
   * A brand-new row has nothing to protect, so it takes the mapped value and
   * the default stands.
   */
  function keepIfAbsent<T>(field: GhlPresentField, mapped: T, current: T | null | undefined): T {
    if (!present || !existing) return mapped;      // new row, or no presence data
    if (present.has(field)) return mapped;         // GHL actually said something
    if (current === null || current === undefined) return mapped; // nothing to keep
    keptFields.push(field);
    return current as T;
  }

  const row: Record<string, unknown> = {
    ghl_contact_id: c.id,
    name: c.name,
    plan: keepIfAbsent("plan", c.plan, existing?.plan as typeof c.plan | undefined),
    billing_frequency: keepIfAbsent("billingFrequency", c.billingFrequency ?? null, existing?.billing_frequency),
    term_length: keepIfAbsent("termLength", c.termLength ?? null, existing?.term_length),
    start_date: keepIfAbsent("startDate", c.startDate, existing?.start_date),
    end_date: keepIfAbsent("endDate", c.endDate ?? null, existing?.end_date),
    // status is safe already: a contact with no Status (and no client tag) is
    // skipped by the mapper entirely, so a blank never reaches here.
    status: c.status,
    source: keepIfAbsent("source", c.source, existing?.source as typeof c.source | undefined),
    synced_at: opts.syncedAt,
  };
  if (opts.ownFieldsInHq) return { row, decision: null, drift: null, keptFields };

  row.weekly_rate = keepIfAbsent("weeklyRate", c.weeklyRate ?? 0, existing?.weekly_rate);
  const decision = decideCoachId({
    ghlCoachId: c.coachId ?? null,
    existingCoachId: opts.existingCoachId,
    ...opts.ctx,
  });
  row.coach_id = decision.coachId;
  // The inactive-coach case is logged even when there is no coach to keep: an
  // unassigned client whose GHL field still names a removed coach is exactly
  // what the VA has to go and fix.
  const drift: CoachDrift | null =
    decision.drift && (decision.coachId || decision.inactiveCoachName)
      ? {
          ghl_id: c.id,
          kept_coach_id: decision.coachId,
          reason: decision.reason,
          ...(decision.inactiveCoachName ? { inactive_coach_name: decision.inactiveCoachName } : {}),
        }
      : null;
  return { row, decision, drift, keptFields };
}

/** sync_events row for a drift entry. ids only, no CLIENT names; the removed
 *  COACH's name is staff data and turns a count into a fix list. */
export function coachDriftEvent(d: CoachDrift, source: string): Record<string, unknown> {
  return {
    source,
    entity: "client",
    ghl_id: d.ghl_id,
    action: "coach_drift",
    payload: {
      kept_coach_id: d.kept_coach_id,
      reason: d.reason,
      ghl_coach_blank: d.reason === "kept_existing_blank",
      ...(d.inactive_coach_name ? { inactive_coach_name: d.inactive_coach_name } : {}),
    },
  };
}
