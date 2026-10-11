import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  rowToCheckIn,
  rowToClient,
  rowToCoach,
  rowToLead,
  rowToTransformation,
  type CheckInRow,
  type ClientRow,
  type CoachRow,
  type LeadRow,
  type TransformationRow,
} from "@/lib/db/rows";
import { DEFAULT_COACH_CAPACITY } from "@/lib/coach-config";

// rowToClient derives weeks/journeyStage from Date.now(); freeze it.
const NOW = new Date("2026-06-21T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const baseClientRow: ClientRow = {
  id: "cl1",
  ghl_contact_id: "ghl1",
  name: "Mara Lin",
  plan: "Weekly",
  billing_frequency: "Weekly",
  weekly_rate: 60,
  term_length: 16,
  start_date: daysAgo(14), // 2 weeks
  end_date: null,
  status: "active",
  coach_id: "co1",
  source: "TikTok",
  videos_uploaded: false,
  converted_to_app: false,
  synced_at: null,
};

describe("rowToClient", () => {
  it("maps snake_case columns to the camelCase Client and derives money/journey", () => {
    const c = rowToClient(baseClientRow);
    expect(c.id).toBe("cl1");
    expect(c.name).toBe("Mara Lin");
    expect(c.weeklyRate).toBe(60);
    expect(c.monthlyRate).toBe(Math.round((60 * 52) / 12)); // 260
    expect(c.billingFrequency).toBe("Weekly");
    expect(c.termLength).toBe(16);
    expect(c.coachId).toBe("co1");
    expect(c.source).toBe("TikTok");
    expect(c.lastCheckIn).toBeNull();
    expect(c.checkInCode).toBe("N");
    // 2 weeks elapsed, capped at term -> 60 * 2.
    expect(c.cashCollected).toBe(120);
    expect(c.journeyStage).toBe("Active");
  });

  it("caps cashCollected at the term length once weeks exceed it", () => {
    const c = rowToClient({ ...baseClientRow, start_date: daysAgo(7 * 20), term_length: 16 });
    expect(c.cashCollected).toBe(60 * 16);
  });

  it("uses elapsed weeks when there is no term length", () => {
    const c = rowToClient({ ...baseClientRow, start_date: daysAgo(7 * 5), term_length: null });
    expect(c.cashCollected).toBe(60 * 5);
  });

  it("derives the paused and cancelled check-in codes", () => {
    expect(rowToClient({ ...baseClientRow, status: "paused" }).checkInCode).toBe("P");
    expect(rowToClient({ ...baseClientRow, status: "cancelled" }).checkInCode).toBe("C");
  });

  it("defaults a null source to Instagram", () => {
    expect(rowToClient({ ...baseClientRow, source: null }).source).toBe("Instagram");
  });

  it("coerces a string weekly_rate and tolerates a non-numeric one", () => {
    expect(rowToClient({ ...baseClientRow, weekly_rate: "75" as unknown as number }).weeklyRate).toBe(75);
    expect(rowToClient({ ...baseClientRow, weekly_rate: "" as unknown as number }).weeklyRate).toBe(0);
  });
});

describe("rowToCoach", () => {
  const row: CoachRow = {
    id: "co1",
    name: "Stephen",
    role: "coach",
    max_capacity: 70, // R17-4: the row owns capacity now
    weekly_rate: 25,
    fortnightly_rate: 15,
    is_active: true,
  };

  // R17-4 (2026-09-25): capacity moved OUT of code and onto the row. This used
  // to assert the opposite, because every stored value was the legacy default
  // 30 while the code resolved everyone to 70. The rows were normalised to 70
  // first, then this read was switched over.
  it("reads capacity from the coach row and zeroes unsynced metrics", () => {
    const c = rowToCoach(row);
    expect(c.maxCapacity).toBe(70);
    expect(c.weeklyRate).toBe(25);
    expect(c.fortnightlyRate).toBe(15);
    expect(c.adherence).toBe(0);
    expect(c.avgResponseHours).toBe(0);
    expect(c.retention).toBe(0);
    expect(c.churn).toBe(0);
  });

  it("honours a per-coach capacity that differs from the default", () => {
    expect(rowToCoach({ ...row, max_capacity: 45 }).maxCapacity).toBe(45);
    expect(DEFAULT_COACH_CAPACITY).toBe(70); // still the default for a coach with no row yet
  });
});

describe("rowToLead", () => {
  const row: LeadRow = {
    id: "l1",
    ghl_opportunity_id: "opp1",
    name: "Cold Lead",
    source: null,
    stage: "New Enquiry",
    ghl_assigned_to: "u9",
    last_activity: null,
    next_action: null,
    value: 1200,
    stage_entered_at: null,
    contact_channels: [],
  };

  it("maps the lead and fills null text fields with empty strings", () => {
    const l = rowToLead(row);
    expect(l.id).toBe("l1");
    expect(l.source).toBe("Instagram"); // null -> default channel
    expect(l.ownerId).toBe("u9");
    expect(l.ownerName).toBe("");
    expect(l.lastActivity).toBe("");
    expect(l.nextAction).toBe("");
    expect(l.value).toBe(1200);
    expect(l.stageEnteredAt).toBe("");
    expect(l.contactChannels).toEqual([]);
  });

  it("defaults a null contact_channels to an empty array", () => {
    const l = rowToLead({ ...row, contact_channels: null as unknown as LeadRow["contact_channels"] });
    expect(l.contactChannels).toEqual([]);
  });
});

describe("rowToCheckIn", () => {
  const row: CheckInRow = {
    id: "ci1",
    client_id: "cl1",
    coach_id: "co1",
    submitted_at: "2026-06-01T00:00:00Z",
    code: "Y",
    adherence: 80,
    week_number: 3,
    source: "kahunas",
  };

  it("maps snake_case to camelCase", () => {
    const ci = rowToCheckIn(row);
    expect(ci).toMatchObject({
      id: "ci1",
      clientId: "cl1",
      coachId: "co1",
      submittedAt: "2026-06-01T00:00:00Z",
      code: "Y",
      adherence: 80,
      weekNumber: 3,
      source: "kahunas",
    });
  });

  it("keeps a null adherence null rather than coercing to 0", () => {
    expect(rowToCheckIn({ ...row, adherence: null }).adherence).toBeNull();
  });
});

describe("rowToTransformation", () => {
  const row: TransformationRow = {
    id: "t1",
    client_id: "cl1",
    coach_id: "co1",
    milestone: "12-week",
    status: "draft",
    permission: "Y",
    handover: false,
    before_after_assets: [{ kind: "before" }, { kind: "after" }],
    approved_to_post_at: null,
    posted_at: null,
  };

  it("derives hasBefore/hasAfter from the assets array", () => {
    const t = rowToTransformation(row);
    expect(t.hasBefore).toBe(true);
    expect(t.hasAfter).toBe(true);
    expect(t.status).toBe("draft");
    expect(t.clientId).toBe("cl1");
  });

  it("is false for a missing side and tolerates a null assets array", () => {
    const t = rowToTransformation({ ...row, before_after_assets: [{ kind: "before" }] });
    expect(t.hasBefore).toBe(true);
    expect(t.hasAfter).toBe(false);
    const tNull = rowToTransformation({ ...row, before_after_assets: null });
    expect(tNull.hasBefore).toBe(false);
    expect(tNull.hasAfter).toBe(false);
  });
});
