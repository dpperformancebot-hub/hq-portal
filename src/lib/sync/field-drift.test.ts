import { describe, expect, it } from "vitest";
import { projectClientRow, type ExistingClientRow } from "@/lib/sync/client-projection";
import type { GhlPresentField } from "@/lib/ghl/map";
import type { Client } from "@/lib/seed/types";

// R19-6: ONE RULE, every GHL-mapped field. A blank or unrecognised GHL value
// never overwrites what the portal holds.
//
// The mapper must return something for every field, so an empty CRM cell
// arrives as a DEFAULT, and a default is indistinguishable from real data once
// it reaches the row. That is how 18 TJD clients moved from fortnightly to
// weekly overnight and started being paid at the wrong rate.

const mapped: Client = {
  id: "ghl-1", name: "Mara Lin",
  plan: "Weekly",                 // the default a blank field produces
  monthlyRate: 0, startDate: null, endDate: null, billingFrequency: null,
  weeklyRate: 0,                  // the default a blank field produces
  termLength: null, onboardingType: null, status: "active", coachId: null,
  source: "Instagram",            // the default a blank field produces
  lastCheckIn: null, checkInCode: "N", cashCollected: 0, journeyStage: "Active",
  weightStart: 0, weightCurrent: 0, videosUploaded: false, convertedToApp: false,
} as unknown as Client;

const existing: ExistingClientRow = {
  coach_id: "coach-1",
  plan: "Fortnightly",
  billing_frequency: "Monthly",
  start_date: "2026-01-05",
  end_date: "2026-06-30",
  term_length: 16,
  weekly_rate: 75,
  source: "TikTok",
};

const ctx = { coachNameByGhlId: new Map(), coachUuidByName: new Map(), inactiveCoachNames: new Set<string>() };
const project = (present: GhlPresentField[], over: Partial<Client> = {}, ownFieldsInHq = false) =>
  projectClientRow({ ...mapped, ...over } as Client, {
    ownFieldsInHq,
    existingCoachId: existing.coach_id,
    existing,
    present: new Set(present),
    ctx,
    syncedAt: "2026-10-05T00:00:00Z",
  });

describe("a blank GHL field keeps the portal's value, field by field", () => {
  it("cadence: the bug that was costing real money on TJD", () => {
    const { row, keptFields } = project([]);
    expect(row.plan).toBe("Fortnightly"); // NOT the "Weekly" default
    expect(keptFields).toContain("plan");
  });

  it("start date", () => {
    expect(project([]).row.start_date).toBe("2026-01-05");
  });

  it("term end", () => {
    expect(project([]).row.end_date).toBe("2026-06-30");
  });

  it("term length", () => {
    expect(project([]).row.term_length).toBe(16);
  });

  it("weekly rate: a blank field must not zero a real rate", () => {
    expect(project([]).row.weekly_rate).toBe(75);
  });

  it("billing frequency", () => {
    expect(project([]).row.billing_frequency).toBe("Monthly");
  });

  it("source: the Instagram default must not overwrite TikTok", () => {
    expect(project([]).row.source).toBe("TikTok");
  });

  it("coach: already followed the rule, and still does", () => {
    expect(project([]).row.coach_id).toBe("coach-1");
  });

  it("lists every field it kept, so the run is auditable", () => {
    const { keptFields } = project([]);
    expect([...keptFields].sort()).toEqual(
      ["billingFrequency", "endDate", "plan", "source", "startDate", "termLength", "weeklyRate"],
    );
  });
});

describe("when GHL DOES say something, GHL still wins", () => {
  it("takes the cadence GHL carries", () => {
    const { row, keptFields } = project(["plan"], { plan: "Weekly" });
    expect(row.plan).toBe("Weekly");
    expect(keptFields).not.toContain("plan");
  });

  it("takes a real rate, a real start date and a real source", () => {
    const { row } = project(["weeklyRate", "startDate", "source"], {
      weeklyRate: 99, startDate: "2026-09-01", source: "Referral",
    });
    expect(row.weekly_rate).toBe(99);
    expect(row.start_date).toBe("2026-09-01");
    expect(row.source).toBe("Referral");
  });
});

describe("a brand-new client has nothing to protect", () => {
  it("takes the mapped values, defaults and all", () => {
    const { row, keptFields } = projectClientRow(mapped, {
      ownFieldsInHq: false,
      existingCoachId: undefined,
      existing: null,
      present: new Set(),
      ctx,
      syncedAt: "2026-10-05T00:00:00Z",
    });
    expect(row.plan).toBe("Weekly");
    expect(keptFields).toEqual([]);
  });

  it("does not resurrect a value the portal never had", () => {
    const { row } = projectClientRow(mapped, {
      ownFieldsInHq: false,
      existingCoachId: null,
      existing: { plan: null, start_date: null },
      present: new Set(),
      ctx,
      syncedAt: "2026-10-05T00:00:00Z",
    });
    expect(row.plan).toBe("Weekly");
    expect(row.start_date).toBeNull();
  });
});

describe("the rule applies on BOTH brands", () => {
  it("protects cadence on a weeks-paid brand, where the sync skips coach and rate", () => {
    const { row, keptFields } = project([], {}, true);
    expect(row.plan).toBe("Fortnightly");
    expect(keptFields).toContain("plan");
    // ownFieldsInHq still means no coach_id and no rate in the payload at all.
    expect(row.coach_id).toBeUndefined();
    expect(row.weekly_rate).toBeUndefined();
  });
});

describe("status is safe by construction, not by this rule", () => {
  it("is always written, because a contact with no status never reaches here", () => {
    // mapContactsToRoster skips a contact whose Status is blank (and which
    // carries no client tag), so the projection only ever sees a real status.
    expect(project([]).row.status).toBe("active");
  });
});
