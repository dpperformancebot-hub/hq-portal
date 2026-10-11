import { beforeEach, describe, expect, it, vi } from "vitest";

// The GHL webhook is the instant path for coach changes, so it must apply the
// nightly sync's coach rule exactly: GHL wins when it names an ACTIVE coach;
// blank, unresolvable or deactivated keeps the existing coach and logs drift;
// TJD (ownFieldsInHq) never has its portal-owned coach or rate touched.

const h = vi.hoisted(() => ({
  ownHq: false,
  contact: { id: "ghl-1" } as Record<string, unknown> | null,
  mappedCoachName: "Perry" as string | null,
  existing: { coach_id: "uuid-angus" } as Record<string, unknown> | null,
  coaches: [] as Record<string, unknown>[],
  upserts: [] as Record<string, unknown>[],
  events: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/brand", () => ({
  BRAND: { roster: { get ownFieldsInHq() { return h.ownHq; } } },
}));
vi.mock("@/lib/ghl/client", () => ({
  fetchContactById: () => Promise.resolve(h.contact),
  fetchCustomFieldDefs: () => Promise.resolve([]),
  fetchOpportunityById: () => Promise.resolve(null),
  fetchPipelines: () => Promise.resolve([]),
}));
vi.mock("@/lib/ghl/map", () => ({
  mapContactsToRoster: () => {
    const name = h.mappedCoachName;
    const coachId = name ? `ghl-co-${name.toLowerCase()}` : null;
    return {
      clients: [{
        id: "ghl-1", name: "Client One", plan: "standard", startDate: "2026-09-01", status: "active",
        source: "brand", weeklyRate: 50, coachId,
      }],
      coaches: name ? [{ id: coachId, name, role: "coach" }] : [],
    };
  },
  mapOpportunitiesToLeads: () => [],
}));
vi.mock("@/lib/db/client", () => ({
  dbAdmin: () => {
    let table = "";
    const b: Record<string, unknown> = {
      from: (t: string) => ((table = t), b),
      select: () => b,
      order: () => b,
      range: () => b,
      eq: () => b,
      maybeSingle: () => Promise.resolve({ data: table === "clients" ? h.existing : null, error: null }),
      upsert: (v: unknown) => {
        if (table === "clients") h.upserts.push(v as Record<string, unknown>);
        return Promise.resolve({ error: null });
      },
      update: () => b,
      insert: (v: Record<string, unknown>) => (h.events.push(v), Promise.resolve({ error: null })),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: table === "coaches" ? h.coaches : [], error: null }).then(res, rej),
    };
    return b;
  },
}));

import { handleContactEvent } from "@/lib/sync/webhook-handlers";

const lastUpsert = () => h.upserts[h.upserts.length - 1];
const drift = () => h.events.filter((e) => e.action === "coach_drift");
const upsertedEvent = () => h.events.find((e) => e.action === "contact_upserted");

beforeEach(() => {
  h.ownHq = false;
  h.contact = { id: "ghl-1" };
  h.mappedCoachName = "Perry";
  h.existing = { coach_id: "uuid-angus" };
  h.coaches = [
    { id: "uuid-angus", name: "Angus", is_active: true },
    { id: "uuid-perry", name: "Perry", is_active: true },
    { id: "uuid-nina", name: "Nina Hart", is_active: false },
  ];
  h.upserts = [];
  h.events = [];
});

describe("handleContactEvent applies the sync's coach rule", () => {
  it("coach SET: a new client gets the active coach GHL names", async () => {
    h.existing = null;
    expect(await handleContactEvent("ghl-1")).toBe("upserted");
    expect(lastUpsert().coach_id).toBe("uuid-perry");
    expect(drift()).toHaveLength(0);
    expect(upsertedEvent()?.payload).toEqual({ coach_reason: "ghl", coach_from: null, coach_to: "uuid-perry" });
  });

  it("coach SET: an unassigned existing client picks up the coach", async () => {
    h.existing = { coach_id: null };
    await handleContactEvent("ghl-1");
    expect(lastUpsert().coach_id).toBe("uuid-perry");
  });

  it("coach CHANGED: GHL naming a different active coach wins", async () => {
    await handleContactEvent("ghl-1");
    expect(lastUpsert().coach_id).toBe("uuid-perry");
    expect(drift()).toHaveLength(0);
    expect(upsertedEvent()?.payload).toMatchObject({ coach_from: "uuid-angus", coach_to: "uuid-perry" });
  });

  it("coach CLEARED: a blank GHL field keeps the existing coach and logs drift", async () => {
    h.mappedCoachName = null;
    await handleContactEvent("ghl-1");
    expect(lastUpsert().coach_id).toBe("uuid-angus");
    expect(drift()).toHaveLength(1);
    expect(drift()[0]).toMatchObject({ source: "webhook", ghl_id: "ghl-1", payload: { reason: "kept_existing_blank", kept_coach_id: "uuid-angus" } });
  });

  it("REMOVED coach: GHL naming a deactivated coach keeps the existing coach and names them in the drift row", async () => {
    h.mappedCoachName = "Nina Hart";
    await handleContactEvent("ghl-1");
    expect(lastUpsert().coach_id).toBe("uuid-angus");
    expect(drift()[0]).toMatchObject({ payload: { reason: "kept_existing_inactive_coach", inactive_coach_name: "Nina Hart" } });
  });

  it("REMOVED coach on a new client: stays unassigned, never attached to the removed coach", async () => {
    h.existing = null;
    h.mappedCoachName = "Nina Hart";
    await handleContactEvent("ghl-1");
    expect(lastUpsert().coach_id).toBeNull();
    expect(drift()).toHaveLength(1);
  });

  it("UNRESOLVED coach name keeps the existing coach and logs drift", async () => {
    h.mappedCoachName = "Perri";
    h.coaches = h.coaches.filter((c) => c.name !== "Perri"); // the upsert mock does not create rows
    await handleContactEvent("ghl-1");
    expect(lastUpsert().coach_id).toBe("uuid-angus");
    expect(drift()[0]).toMatchObject({ payload: { reason: "kept_existing_unresolved" } });
  });

  it("TJD (ownFieldsInHq): never writes coach_id or weekly_rate, whatever GHL says", async () => {
    h.ownHq = true;
    for (const name of ["Perry", null, "Nina Hart"]) {
      h.mappedCoachName = name;
      await handleContactEvent("ghl-1");
      expect(lastUpsert()).not.toHaveProperty("coach_id");
      expect(lastUpsert()).not.toHaveProperty("weekly_rate");
    }
    expect(drift()).toHaveLength(0);
  });

  it("a contact deleted in GHL is marked past, never hard-deleted", async () => {
    h.contact = null;
    expect(await handleContactEvent("ghl-1")).toBe("marked_past");
    expect(h.upserts).toHaveLength(0);
  });
});
