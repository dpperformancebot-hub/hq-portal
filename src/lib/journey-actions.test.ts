import { beforeEach, describe, expect, it, vi } from "vitest";

// R19-2d: a client changing hands is not a client arriving. The difference is
// decided by who held them BEFORE the write, so these pin that the read happens
// first and that both side effects follow it.

const h = vi.hoisted(() => ({
  beforeCoachId: null as string | null,
  slack: [] as string[],
  tasks: [] as Record<string, unknown>[],
  notifications: [] as Record<string, unknown>[],
  assignOk: true,
}));

vi.mock("@/lib/db/client", () => ({
  persistenceEnabled: () => true,
  dbAdmin: () => {
    const b: Record<string, unknown> = {
      from: () => b,
      select: () => b,
      eq: () => b,
      maybeSingle: () => Promise.resolve({ data: { coach_id: h.beforeCoachId }, error: null }),
    };
    return b;
  },
}));
vi.mock("@/lib/coach-assign-actions", () => ({
  assignCoachAction: () => Promise.resolve(h.assignOk ? { ok: true, count: 1 } : { ok: false, error: "nope" }),
}));
vi.mock("@/lib/data", () => ({
  getClientsData: () =>
    Promise.resolve([{ id: "cl1", name: "Mara Lin", startDate: "2026-01-05", plan: "Weekly", startDateOverride: null }]),
  getCoachNamesData: () => Promise.resolve({ old1: "Nina Hart", new1: "Sam Reed" }),
}));
vi.mock("@/lib/slack", () => ({
  notifySlack: (m: string) => { h.slack.push(m); return Promise.resolve(); },
  slackPingEnabled: () => true,
}));
vi.mock("@/lib/notify", () => ({
  insertNotification: (n: Record<string, unknown>) => { h.notifications.push(n); return Promise.resolve(); },
}));
vi.mock("@/lib/tasks-actions", () => ({
  createTemplateTaskAction: (t: Record<string, unknown>) => { h.tasks.push(t); return Promise.resolve({ ok: true }); },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { assignJourneyClientAction } from "@/lib/journey-actions";

beforeEach(() => {
  h.beforeCoachId = null; h.slack = []; h.tasks = []; h.notifications = []; h.assignOk = true;
});

describe("assigning a client who had NO coach: unchanged", () => {
  it("still sends NEW CLIENT ALERT and creates an onboarding task", async () => {
    const r = await assignJourneyClientAction("cl1", "new1");
    expect(r.ok).toBe(true);
    expect(h.slack[0]).toMatch(/NEW CLIENT ALERT/);
    expect(h.slack[0]).not.toMatch(/TRANSFER/);
    expect(h.tasks[0]).toMatchObject({ template: "onboard", assigneeName: "Sam Reed" });
    expect(h.notifications[0]).toMatchObject({ type: "client_assigned" });
  });
});

describe("moving a client who ALREADY had a coach: a transfer", () => {
  beforeEach(() => { h.beforeCoachId = "old1"; });

  it("sends CLIENT TRANSFER naming both coaches, and never NEW CLIENT ALERT", async () => {
    await assignJourneyClientAction("cl1", "new1");
    expect(h.slack[0]).toMatch(/CLIENT TRANSFER/);
    expect(h.slack[0]).not.toMatch(/NEW CLIENT ALERT/);
    expect(h.slack[0]).toMatch(/From: Nina Hart/);
    expect(h.slack[0]).toMatch(/To: Sam Reed/);
    expect(h.slack[0]).toMatch(/Check Ins: weekly/);
  });

  it("creates a HANDOVER task for the new coach, not an onboarding", async () => {
    await assignJourneyClientAction("cl1", "new1");
    expect(h.tasks).toHaveLength(1);
    expect(h.tasks[0]).toMatchObject({
      template: "handover",
      assigneeName: "Sam Reed",
      fields: expect.objectContaining({ client: "Mara Lin", fromCoach: "Nina Hart" }),
    });
    expect(h.tasks.some((t) => t.template === "onboard")).toBe(false);
  });

  it("notifies the coach as a transfer, carrying who it came from", async () => {
    await assignJourneyClientAction("cl1", "new1");
    expect(h.notifications[0]).toMatchObject({
      type: "client_transferred",
      payload: expect.objectContaining({ fromCoach: "Nina Hart" }),
    });
  });

  it("re-assigning to the SAME coach is not a transfer", async () => {
    h.beforeCoachId = "new1";
    await assignJourneyClientAction("cl1", "new1");
    expect(h.slack[0]).toMatch(/NEW CLIENT ALERT/);
  });

  it("sends nothing at all when the assignment itself fails", async () => {
    h.assignOk = false;
    const r = await assignJourneyClientAction("cl1", "new1");
    expect(r.ok).toBe(false);
    expect(h.slack).toHaveLength(0);
    expect(h.tasks).toHaveLength(0);
  });
});
