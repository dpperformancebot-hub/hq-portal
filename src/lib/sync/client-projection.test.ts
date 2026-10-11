import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ dbAdmin: () => ({}) }));

import { projectClientRow, type CoachContext } from "./client-projection";
import type { Client } from "@/lib/seed/types";

// projectClientRow is shared by the nightly sync and the GHL webhook, so these
// cases hold for both paths.

const ctx: CoachContext = {
  coachNameByGhlId: new Map([["ghl-co-perry", "Perry"], ["ghl-co-nina", "Nina Hart"], ["ghl-co-perri", "Perri"]]),
  coachUuidByName: new Map([["Perry", "uuid-perry"], ["Angus", "uuid-angus"]]),
  inactiveCoachNames: new Set(["Nina Hart"]),
};
const client = (coachId: string | null) =>
  ({ id: "ghl-1", name: "C", plan: "standard", startDate: null, status: "active", source: "brand", weeklyRate: 40, coachId }) as unknown as Client;
const project = (coachId: string | null, existingCoachId: string | null | undefined, ownFieldsInHq = false) =>
  projectClientRow(client(coachId), { ownFieldsInHq, existingCoachId, ctx, syncedAt: "t" });

describe("projectClientRow", () => {
  it("coach set: new row takes the GHL coach", () => {
    expect(project("ghl-co-perry", undefined).row.coach_id).toBe("uuid-perry");
  });
  it("coach changed: GHL active coach replaces the existing one, no drift", () => {
    const p = project("ghl-co-perry", "uuid-angus");
    expect(p.row.coach_id).toBe("uuid-perry");
    expect(p.drift).toBeNull();
  });
  it("coach cleared: blank GHL keeps existing, drift logged", () => {
    const p = project(null, "uuid-angus");
    expect(p.row.coach_id).toBe("uuid-angus");
    expect(p.drift).toMatchObject({ reason: "kept_existing_blank", kept_coach_id: "uuid-angus" });
  });
  it("removed coach: keeps existing, drift names the removed coach", () => {
    const p = project("ghl-co-nina", "uuid-angus");
    expect(p.row.coach_id).toBe("uuid-angus");
    expect(p.drift).toMatchObject({ reason: "kept_existing_inactive_coach", inactive_coach_name: "Nina Hart" });
  });
  it("unresolved name: keeps existing, drift logged", () => {
    expect(project("ghl-co-perri", "uuid-angus").drift).toMatchObject({ reason: "kept_existing_unresolved" });
  });
  it("blank GHL on an unassigned row: nothing to keep, no drift", () => {
    const p = project(null, null);
    expect(p.row.coach_id).toBeNull();
    expect(p.drift).toBeNull();
  });
  it("ownFieldsInHq: coach_id and weekly_rate are left out of the row entirely", () => {
    const p = project("ghl-co-perry", "uuid-angus", true);
    expect(p.row).not.toHaveProperty("coach_id");
    expect(p.row).not.toHaveProperty("weekly_rate");
    expect(p.decision).toBeNull();
  });
});
