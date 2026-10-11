// GHL -> Supabase sync (M5 phase 2, step 2 of the rollout in
// docs/supabase-schema-proposal.md). Reuses the existing GHL fetch + mapping
// layer, then upserts the projection into Postgres on the GHL ids.
//
// Absent-row policy (DEFAULT DECISION, flagged for owner): rows in the DB
// whose GHL id no longer comes back from the API are LEFT UNTOUCHED and
// logged to sync_events (action 'missing_from_ghl'). No automated status
// flips: GHL contact merges were the main data hazard in phase 1 and a
// human should review before anything is marked past.

import { fetchAllContacts, fetchAllOpportunities, fetchCustomFieldDefs, fetchPipelines } from "@/lib/ghl/client";
import { mapContactsToRoster, mapOpportunitiesToLeads } from "@/lib/ghl/map";
import { dbAdmin } from "@/lib/db/client";
import { fetchAllRows } from "@/lib/db/fetch-all";
import { BRAND } from "@/lib/brand";
import {
  coachDriftEvent,
  projectClientRow,
  upsertCoachesAndLoadContext,
  type CoachDrift,
  type ExistingClientRow,
} from "@/lib/sync/client-projection";

const CHUNK = 400;

async function upsertChunked(table: string, rows: Record<string, unknown>[], onConflict: string) {
  const db = dbAdmin();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

export type SyncResult = {
  clients: number;
  coaches: number;
  leads: number;
  missingClients: number;
  missingLeads: number;
  /** Bootstrap rows re-keyed onto their real GHL id this run (name match).
   *  Non-zero only on the first sync after a CSV bootstrap (e.g. TJD). */
  reconciled: number;
  /** Existing coach assignments the GHL fetch would have cleared (kept, logged). */
  coachDrift: number;
};

const nrmName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function syncGhlToDb(source: "poll" | "manual" = "manual"): Promise<SyncResult> {
  const db = dbAdmin();
  const [defs, contacts] = await Promise.all([fetchCustomFieldDefs(), fetchAllContacts()]);
  const { clients, coaches, present } = mapContactsToRoster(contacts, defs);

  // 1. Coaches: upsert by name, then resolve name -> uuid for client FKs.
  // R19-2c: ACTIVE coaches only. A deactivated coach must not be resolvable,
  // or a GHL contact still naming them hands their clients straight back the
  // night after they were removed. Shared with the webhook (client-projection).
  const coachCtx = await upsertCoachesAndLoadContext(coaches);

  // 2. Reconcile bootstrap rows: a CSV import seeds clients under synthetic
  // `csv-...` ids; point each at its real GHL contact id (name match) so the
  // upsert below UPDATES it instead of inserting a duplicate. DP has no such
  // rows, so this is a no-op there.
  let reconciled = 0;
  // R19-1: MUST be paged. This map decides whether a client already has a
  // coach; any row missing from it is treated as brand new and has its
  // coach_id written to null. An unpaged select silently stopped at 1000 and
  // erased the coach on every client past that.
  // R19-6: the WHOLE row, not just coach_id. Every GHL-mapped field now needs
  // the portal's current value so a blank CRM field can keep it instead of
  // overwriting it with a default.
  const existingRows = await fetchAllRows<ExistingClientRow & { id: string; name: string; ghl_contact_id: string | null }>(
    (from, to) =>
      db.from("clients")
        .select("id,name,ghl_contact_id,coach_id,plan,billing_frequency,start_date,end_date,term_length,weekly_rate,source")
        .order("id").range(from, to),
    { label: "sync: existing clients" },
  );
  const existingCoachByGhlId = new Map(existingRows.map((r) => [r.ghl_contact_id as string, (r.coach_id as string | null) ?? null]));
  const existingByGhlId = new Map(existingRows.filter((r) => r.ghl_contact_id).map((r) => [r.ghl_contact_id as string, r]));
  const bootstrapByName = new Map(
    existingRows
      .filter((r) => typeof r.ghl_contact_id === "string" && (r.ghl_contact_id as string).startsWith("csv-"))
      .map((r) => [nrmName(r.name as string), r]),
  );
  if (bootstrapByName.size > 0) {
    for (const c of clients) {
      const row = bootstrapByName.get(nrmName(c.name));
      if (row && row.ghl_contact_id !== c.id) {
        const { error } = await db.from("clients").update({ ghl_contact_id: c.id }).eq("id", row.id as string);
        if (error) throw new Error(`reconcile ${c.name}: ${error.message}`);
        reconciled++;
      }
    }
  }

  // 3. Clients: stored projection fields only (computed fields stay derived).
  // coach_id + weekly_rate are HQ-owned for brands whose GHL does not carry
  // them (TJD): omitting them from the payload preserves the existing DB value
  // on update and defaults a new row to null/0, so the portal's coach picker
  // and rate editor are never clobbered by the nightly sync. DP projects both,
  // BUT a blank/unresolvable GHL coach never clears an existing coach_id
  // (R16-1): the row keeps its coach and a 'coach_drift' event is logged.
  const syncedAt = new Date().toISOString();
  const drift: CoachDrift[] = [];
  const fieldDrift: { ghl_id: string; fields: string[] }[] = [];
  await upsertChunked(
    "clients",
    clients.map((c) => {
      const p = projectClientRow(c, {
        ownFieldsInHq: BRAND.roster.ownFieldsInHq,
        existingCoachId: existingCoachByGhlId.get(c.id),
        existing: existingByGhlId.get(c.id) ?? null,
        present: present.get(c.id),
        ctx: coachCtx,
        syncedAt,
      });
      if (p.drift) drift.push(p.drift);
      // A field GHL said nothing about, where the portal's value was kept, is
      // logged the same way a kept coach is: visible, and never silently
      // applied or silently discarded.
      if (p.keptFields.length > 0) fieldDrift.push({ ghl_id: c.id, fields: p.keptFields });
      return p.row;
    }),
    "ghl_contact_id",
  );

  // 3b. Coach drift: GHL said nothing (or something unresolvable) about a
  // client the portal has assigned. Logged, never applied.
  for (let i = 0; i < drift.length; i += CHUNK) {
    const { error } = await db.from("sync_events").insert(drift.slice(i, i + CHUNK).map((d) => coachDriftEvent(d, source)));
    if (error) throw new Error(`sync_events coach_drift insert failed: ${error.message}`);
  }

  // 3c. Field drift: GHL carried nothing for a field the portal has a value
  // for, so the portal's value stood. One row per client, listing the fields.
  for (let i = 0; i < fieldDrift.length; i += CHUNK) {
    const { error } = await db.from("sync_events").insert(
      fieldDrift.slice(i, i + CHUNK).map((d) => ({
        source,
        entity: "client",
        ghl_id: d.ghl_id,
        action: "field_drift",
        payload: { kept_fields: d.fields, reason: "ghl_blank" },
      })),
    );
    if (error) throw new Error(`sync_events field_drift insert failed: ${error.message}`);
  }

  // 4. Leads: best-effort, pipeline may be empty pre-launch.
  let leadCount = 0;
  try {
    const [pipelines, opps] = await Promise.all([fetchPipelines(), fetchAllOpportunities()]);
    const leads = mapOpportunitiesToLeads(opps, pipelines);
    await upsertChunked(
      "leads",
      leads.map((l) => ({
        ghl_opportunity_id: l.id,
        name: l.name,
        source: l.source,
        stage: l.stage,
        ghl_assigned_to: l.ownerId || null,
        last_activity: l.lastActivity || null,
        next_action: l.nextAction || null,
        value: l.value,
        stage_entered_at: l.stageEnteredAt || null,
        contact_channels: l.contactChannels,
        synced_at: syncedAt,
      })),
      "ghl_opportunity_id",
    );
    leadCount = leads.length;
  } catch {
    leadCount = 0;
  }

  // 5. Flag DB rows missing from this GHL fetch (no automated flips).
  const seenIds = new Set(clients.map((c) => c.id));
  // R19-1: paged for the same reason. Capped, this under-reported which
  // clients GHL no longer returns.
  const allDbClients = await fetchAllRows<{ ghl_contact_id: string | null }>(
    (from, to) => db.from("clients").select("ghl_contact_id").order("id").range(from, to),
    { label: "sync: all clients" },
  );
  const missingClients = allDbClients.filter((r) => !seenIds.has(r.ghl_contact_id as string));
  for (const m of missingClients) {
    await db.from("sync_events").insert({
      source,
      entity: "client",
      ghl_id: m.ghl_contact_id,
      action: "missing_from_ghl",
    });
  }

  await db.from("sync_events").insert({
    source,
    entity: "run",
    action: "sync_run",
    payload: { clients: clients.length, coaches: coaches.length, leads: leadCount, missingClients: missingClients.length, reconciled, coachDrift: drift.length },
  });

  return {
    clients: clients.length,
    coaches: coaches.length,
    leads: leadCount,
    missingClients: missingClients.length,
    missingLeads: 0,
    reconciled,
    coachDrift: drift.length,
  };
}
