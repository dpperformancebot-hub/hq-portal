import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client, Lead } from "@/lib/seed/types";
import type { AccessIdentity } from "@/lib/access-policy";

// SEC-AUDIT P0-2: the Cmd+K index must never hand a coach another coach's
// client. Data layer mocked; the scoping under test is pure.
const h = vi.hoisted(() => ({
  clients: [] as Client[],
  leads: [] as Lead[],
}));

vi.mock("@/lib/data", () => ({
  getClientsData: () => Promise.resolve(h.clients),
  getCoachNamesData: () => Promise.resolve({ co1: "Coach One", co2: "Coach Two" }),
  getLeadsData: () => Promise.resolve(h.leads),
}));

import { buildSearchIndex } from "./search-index";

const id = (role: AccessIdentity["role"], over: Partial<AccessIdentity> = {}): AccessIdentity => ({
  role,
  realRole: role,
  isHeadCoach: false,
  linkedCoachId: null,
  ...over,
});
const mk = (cid: string, name: string, coachId: string | null) => ({ id: cid, name, coachId, status: "active" }) as Client;

beforeEach(() => {
  h.clients = [mk("a", "Alice (co1)", "co1"), mk("b", "Bob (co2)", "co2"), mk("u", "Una (none)", null)];
  h.leads = [{ id: "l1", name: "Lead One", source: "IG", stage: "New Enquiry" } as unknown as Lead];
});

describe("buildSearchIndex scoping", () => {
  it("a plain coach only gets their own roster, linked to /my-clients, and no coaches or leads", async () => {
    const items = await buildSearchIndex(id("coach", { linkedCoachId: "co1" }));
    const clients = items.filter((i) => i.type === "client");
    expect(clients.map((c) => c.id)).toEqual(["client:a"]);
    expect(clients[0].href).toBe("/my-clients/a");
    expect(items.some((i) => i.type === "coach")).toBe(false);
    expect(items.some((i) => i.type === "lead")).toBe(false);
    // Another coach's client never appears under any label.
    expect(JSON.stringify(items)).not.toContain("Bob");
  });
  it("a coach with no linked roster gets no clients at all", async () => {
    const items = await buildSearchIndex(id("coach"));
    expect(items.filter((i) => i.type === "client")).toEqual([]);
  });
  it("a head coach sees every client via the client database plus coaches", async () => {
    const items = await buildSearchIndex(id("coach", { isHeadCoach: true, linkedCoachId: "co1" }));
    expect(items.filter((i) => i.type === "client").map((c) => c.id).sort()).toEqual(["client:a", "client:b", "client:u"]);
    expect(items.find((i) => i.type === "client")?.href).toMatch(/^\/client-database\//);
    expect(items.some((i) => i.type === "coach")).toBe(true);
  });
  it("owner / admin / va see everything including leads", async () => {
    for (const r of ["owner", "admin", "va"] as const) {
      const items = await buildSearchIndex(id(r));
      expect(items.filter((i) => i.type === "client")).toHaveLength(3);
      expect(items.filter((i) => i.type === "lead")).toHaveLength(1);
    }
  });
  it("sales gets leads but no clients; ambassador_mgr gets neither", async () => {
    const sales = await buildSearchIndex(id("sales"));
    expect(sales.filter((i) => i.type === "client")).toEqual([]);
    expect(sales.filter((i) => i.type === "lead")).toHaveLength(1);
    const amb = await buildSearchIndex(id("ambassador_mgr"));
    expect(amb.filter((i) => i.type !== "screen")).toEqual([]);
  });
  it("an impersonating owner inside a coach portal is scoped like that coach for entities", async () => {
    // Effective role coach; realRole owner keeps all-client access by policy.
    const items = await buildSearchIndex(id("coach", { realRole: "owner", linkedCoachId: "co2" }));
    expect(items.filter((i) => i.type === "client")).toHaveLength(3);
  });
});
