// R15-1 (Angus, 2026-09-05): "My Clients" rendered every client in the
// business for the head coach, because resolveCoachContext widens `clients`
// for head_coach and getCoachRosterData had no way to opt out. The screen now
// passes { ownOnly: true }. These tests pin both halves: own-only really is
// the head coach's own roster length, and the wide default is untouched for
// the oversight screens that want it.
import { describe, expect, it, vi } from "vitest";
import type { Client } from "@/lib/seed/types";
import type { CoachScorecard } from "@/lib/seed";

const HEAD = "co-head";
const OTHER = "co-other";

const client = (id: string, coachId: string): Client =>
  ({ id, name: id, coachId, status: "active" }) as unknown as Client;

// 3 for the head coach, 5 for another coach: the wide view is 8, own is 3.
const CLIENTS: Client[] = [
  client("h1", HEAD),
  client("h2", HEAD),
  client("h3", HEAD),
  client("o1", OTHER),
  client("o2", OTHER),
  client("o3", OTHER),
  client("o4", OTHER),
  client("o5", OTHER),
];

const CARDS: CoachScorecard[] = [
  { id: HEAD, name: "Angus", role: "head_coach" } as unknown as CoachScorecard,
  { id: OTHER, name: "Darcy", role: "coach" } as unknown as CoachScorecard,
];

vi.mock("@/lib/seed", () => ({
  getCoachScorecards: () => CARDS,
  getClients: () => CLIENTS,
}));

// liveMode() must stay false so the seed path above is the one under test.
vi.mock("@/lib/ghl/client", () => ({ ghlConfigured: () => false }));

// @/lib/live calls react's cache() at module scope, which needs a request
// context. liveMode() is false here so nothing in it runs; this just lets the
// module graph import.
vi.mock("@/lib/live", () => ({ getCheckInsScoped: () => Promise.resolve([]) }));

const { getCoachRosterData } = await import("@/lib/data");

describe("getCoachRosterData head-coach scoping", () => {
  it("ownOnly gives the head coach his OWN roster, not every coach's", async () => {
    const { clients } = await getCoachRosterData(HEAD, { ownOnly: true });
    expect(clients).toHaveLength(3);
    expect(clients.every((c) => c.coachId === HEAD)).toBe(true);
  });

  it("without ownOnly the head coach still sees every coach (oversight screens)", async () => {
    const { clients } = await getCoachRosterData(HEAD);
    expect(clients).toHaveLength(8);
  });

  it("a plain coach is own-roster either way", async () => {
    expect((await getCoachRosterData(OTHER)).clients).toHaveLength(5);
    expect((await getCoachRosterData(OTHER, { ownOnly: true })).clients).toHaveLength(5);
  });
});
