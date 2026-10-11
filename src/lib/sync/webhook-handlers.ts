// Single-entity sync handlers for GHL webhooks (M5 phase 2, step 4 of the
// rollout). A webhook updates ONE row instead of refetching 800 contacts;
// the poll (/api/sync/ghl) stays as the reconciliation pass.
//
// Policies (defaults, flagged in docs/supabase-schema-proposal.md):
//   * Contact delete/merge -> row marked status 'past', never hard-deleted
//     (per the reviewed proposal; history powers retention).
//   * Opportunity delete -> lead row hard-deleted. Leads are pure pipeline
//     projection with no history value; the next full sync would drop them
//     anyway. DEFAULT DECISION 8, overridable.
//   * sync_events logs {type, id} ONLY: webhook payloads can carry email and
//     phone, and the PII boundary keeps those out of Supabase entirely.

import { fetchContactById, fetchCustomFieldDefs, fetchOpportunityById, fetchPipelines } from "@/lib/ghl/client";
import { mapContactsToRoster, mapOpportunitiesToLeads } from "@/lib/ghl/map";
import { dbAdmin } from "@/lib/db/client";
import { BRAND } from "@/lib/brand";
import { coachDriftEvent, projectClientRow, upsertCoachesAndLoadContext } from "@/lib/sync/client-projection";

async function logEvent(
  action: string,
  entity: string,
  ghlId: string | null,
  error?: string,
  payload?: Record<string, unknown>,
) {
  await dbAdmin().from("sync_events").insert({
    source: "webhook",
    entity,
    ghl_id: ghlId,
    action,
    error: error ?? null,
    ...(payload ? { payload } : {}),
  });
}

export async function handleContactEvent(ghlContactId: string): Promise<string> {
  const db = dbAdmin();
  const contact = await fetchContactById(ghlContactId);

  if (!contact) {
    // Deleted or merged away in GHL: soft-mark, keep history.
    const { error } = await db
      .from("clients")
      .update({ status: "past", synced_at: new Date().toISOString() })
      .eq("ghl_contact_id", ghlContactId);
    await logEvent("contact_deleted_marked_past", "client", ghlContactId, error?.message);
    return "marked_past";
  }

  const defs = await fetchCustomFieldDefs();
  const { clients, coaches } = mapContactsToRoster([contact], defs);
  if (clients.length === 0) {
    // No Status custom field: a raw lead or non-roster contact, not ours.
    await logEvent("contact_skipped_no_status", "client", ghlContactId);
    return "skipped";
  }
  const c = clients[0];

  // Same coach rule as the nightly sync, through the same function: blank,
  // unresolvable or deactivated coach keeps the existing coach and logs drift;
  // ownFieldsInHq brands (TJD) never have coach_id/weekly_rate written.
  const ctx = await upsertCoachesAndLoadContext(coaches);
  const { data: existing, error: readError } = await db
    .from("clients")
    .select("coach_id")
    .eq("ghl_contact_id", c.id)
    .maybeSingle();
  if (readError) throw new Error(`existing client read failed: ${readError.message}`);
  const existingCoachId = existing ? ((existing.coach_id as string | null) ?? null) : undefined;

  const { row, decision, drift } = projectClientRow(c, {
    ownFieldsInHq: BRAND.roster.ownFieldsInHq,
    existingCoachId,
    ctx,
    syncedAt: new Date().toISOString(),
  });

  const { error } = await db.from("clients").upsert(row, { onConflict: "ghl_contact_id" });
  if (drift) await db.from("sync_events").insert(coachDriftEvent(drift, "webhook"));
  // ids only: lets anyone confirm from sync_events that a GHL coach change
  // landed, and what the rule did with it.
  await logEvent(
    error ? "contact_upsert_failed" : "contact_upserted",
    "client",
    ghlContactId,
    error?.message,
    decision
      ? { coach_reason: decision.reason, coach_from: existingCoachId ?? null, coach_to: decision.coachId }
      : { coach_reason: "hq_owned" },
  );
  if (error) throw new Error(`client upsert failed: ${error.message}`);
  return "upserted";
}

export async function handleOpportunityEvent(ghlOpportunityId: string): Promise<string> {
  const db = dbAdmin();
  const opp = await fetchOpportunityById(ghlOpportunityId);

  if (!opp) {
    const { error } = await db.from("leads").delete().eq("ghl_opportunity_id", ghlOpportunityId);
    await logEvent("opportunity_deleted", "lead", ghlOpportunityId, error?.message);
    return "deleted";
  }

  const pipelines = await fetchPipelines();
  const [lead] = mapOpportunitiesToLeads([opp], pipelines);
  const { error } = await db.from("leads").upsert(
    {
      ghl_opportunity_id: lead.id,
      name: lead.name,
      source: lead.source,
      stage: lead.stage,
      ghl_assigned_to: lead.ownerId || null,
      last_activity: lead.lastActivity || null,
      next_action: lead.nextAction || null,
      value: lead.value,
      stage_entered_at: lead.stageEnteredAt || null,
      contact_channels: lead.contactChannels,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "ghl_opportunity_id" },
  );
  await logEvent(error ? "opportunity_upsert_failed" : "opportunity_upserted", "lead", ghlOpportunityId, error?.message);
  if (error) throw new Error(`lead upsert failed: ${error.message}`);
  return "upserted";
}
