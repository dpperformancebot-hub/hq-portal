"use server";

// PERSISTENCE for the Automations screen: on/off toggles and rule edits write
// to the public.automations table (config only). This stores intent, it does
// NOT execute anything: the automation engine ships later, so nobody is
// contacted by saving here and there is no outreach guard.
//
// The automations table ships EMPTY and uses a uuid primary key, while the
// catalog lives in the seed layer with text ids ("au1"...). So we key on the
// rule NAME (unique across the catalog): look it up, then update or insert
// (a manual upsert, since the column has no unique constraint). The data facade
// merges these rows over the seed catalog by name (see getAutomationsData).
//
// trigger/actions/replaces_va_task are jsonb columns; we store the human-
// readable strings the view shows (a bare string is valid jsonb).

import { revalidatePath } from "next/cache";
import { dbAdmin, persistenceEnabled } from "@/lib/db/client";
import type { AutomationStatus } from "@/lib/seed";
import { assertBrandManager } from "@/lib/role-server";

const PATH = "/automations";
const NO_DB =
  "This needs the HQ datastore. Set HQ_PERSISTENCE=true with Supabase configured.";

export type ActionResult = { ok: true } | { ok: false; error: string };

const STATUSES: AutomationStatus[] = ["active", "paused", "failing", "draft"];

// The full config persisted for one rule. The client passes the rule's current
// state so the first write inserts a faithful, complete row.
export type AutomationConfig = {
  name: string;
  trigger: string;
  actions: string;
  cadence: string;
  status: AutomationStatus;
  replacesVATask?: string;
};

function toRow(cfg: AutomationConfig) {
  return {
    name: cfg.name.trim(),
    trigger: cfg.trigger.trim(),
    actions: cfg.actions.trim(),
    cadence: cfg.cadence.trim() || "Real-time",
    status: cfg.status,
    replaces_va_task: cfg.replacesVATask?.trim() ? cfg.replacesVATask.trim() : null,
  };
}

// Manual upsert keyed on name: select by name, then update the match or insert.
async function upsertByName(cfg: AutomationConfig): Promise<ActionResult> {
  const name = cfg.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  if (!STATUSES.includes(cfg.status)) return { ok: false, error: "Invalid status." };
  if (!persistenceEnabled()) return { ok: false, error: NO_DB };
  const db = dbAdmin();
  const row = toRow(cfg);
  const { data: existing, error: selErr } = await db
    .from("automations")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  if (selErr) return { ok: false, error: selErr.message };
  const { error } = existing
    ? await db.from("automations").update(row).eq("id", existing.id)
    : await db.from("automations").insert(row);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

// Row / drawer on-off toggle. Enabling sets the rule active, disabling pauses it
// (a runtime "failing" state cannot exist until the engine ships).
export async function setAutomationEnabled(
  base: AutomationConfig,
  enabled: boolean,
): Promise<ActionResult> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  return upsertByName({ ...base, status: enabled ? "active" : "paused" });
}

// Rule editor (drawer): persist name/trigger/actions/cadence and current status.
export async function saveAutomationConfig(cfg: AutomationConfig): Promise<ActionResult> {
  const denied = await assertBrandManager();
  if (denied) return { ok: false, error: denied };
  return upsertByName(cfg);
}
