import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  channelFromGhl,
  fieldNameById,
  journeyStage,
  looseSalesRole,
  mapCalendarEvents,
  mapCallBookings,
  mapContactsToRoster,
  mapConversations,
  mapMessages,
  mapOpportunitiesToLeads,
  salesRepKey,
  userNameById,
  WEEKS,
} from "@/lib/ghl/map";
import type {
  GhlCalendarEvent,
  GhlContact,
  GhlConversation,
  GhlCustomFieldDef,
  GhlMessage,
  GhlOpportunity,
  GhlPipeline,
  GhlUser,
} from "@/lib/ghl/types";

// The roster/journey helpers read Date.now(); freeze it so week maths and the
// renewal-window branches are deterministic. Pinned to the project "today".
const NOW = new Date("2026-06-21T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

// ISO for a date N days before the frozen NOW.
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

describe("fieldNameById", () => {
  it("normalises def names (lowercase, strip non-alphanumerics) keyed by id", () => {
    const defs: GhlCustomFieldDef[] = [
      { id: "d1", name: "Assigned Coach" },
      { id: "d2", name: "Check-in Frequency" },
      { id: "d3", name: "Weekly Rate" },
    ];
    const map = fieldNameById(defs);
    expect(map.get("d1")).toBe("assignedcoach");
    expect(map.get("d2")).toBe("checkinfrequency");
    expect(map.get("d3")).toBe("weeklyrate");
  });
});

describe("WEEKS", () => {
  it("returns 0 for null or unparseable input", () => {
    expect(WEEKS(null)).toBe(0);
    expect(WEEKS("not-a-date")).toBe(0);
  });
  it("floors elapsed whole weeks from an ISO start", () => {
    expect(WEEKS(daysAgo(0))).toBe(0);
    expect(WEEKS(daysAgo(13))).toBe(1);
    expect(WEEKS(daysAgo(14))).toBe(2);
    expect(WEEKS(daysAgo(70))).toBe(10);
  });
  it("never returns negative weeks for a future start", () => {
    expect(WEEKS(daysAhead(30))).toBe(0);
  });
});

describe("journeyStage", () => {
  it("treats cancelled and past as graduated", () => {
    expect(journeyStage("cancelled", 50, 16, null)).toBe("Renewed/Graduated");
    expect(journeyStage("past", 2, null, null)).toBe("Renewed/Graduated");
  });
  it("maps early weeks to onboarding then straight to active", () => {
    expect(journeyStage("active", 1, null, null)).toBe("Onboarding");
    expect(journeyStage("active", 3, null, null)).toBe("Active");
  });
  it("flags an imminent term end as approaching renewal, ahead of the mid-program window", () => {
    // weeks 8-10 would normally be "Mid-Program Review", but a term end within
    // 21 days takes priority.
    expect(journeyStage("active", 9, null, daysAhead(10))).toBe("Approaching Renewal");
  });
  it("flags the PIF re-sign window near the end of the term length", () => {
    expect(journeyStage("active", 14, 16, null)).toBe("Approaching Renewal");
  });
  it("maps the mid-program window", () => {
    expect(journeyStage("active", 9, null, null)).toBe("Mid-Program Review");
  });
  it("falls through to Active", () => {
    expect(journeyStage("active", 20, null, null)).toBe("Active");
  });
});

describe("channelFromGhl", () => {
  it("buckets known GHL types onto the three first-class channels", () => {
    expect(channelFromGhl("TYPE_INSTAGRAM").channel).toBe("instagram");
    expect(channelFromGhl("TYPE_EMAIL").channel).toBe("email");
    expect(channelFromGhl("TYPE_GMB").channel).toBe("email");
    expect(channelFromGhl("TYPE_WHATSAPP").channel).toBe("whatsapp");
    expect(channelFromGhl("TYPE_SMS").channel).toBe("whatsapp");
    expect(channelFromGhl("TYPE_FACEBOOK").channel).toBe("instagram");
  });
  it("defaults the unknown/empty to the whatsapp messaging bucket", () => {
    expect(channelFromGhl(null).channel).toBe("whatsapp");
    expect(channelFromGhl("TYPE_LIVE_CHAT").channel).toBe("whatsapp");
  });
  it("keeps an honest raw label when it does not match the bucket's name", () => {
    // SMS lands in the whatsapp bucket but should still show its true label.
    expect(channelFromGhl("TYPE_SMS").rawChannel).toBe("SMS");
    // IG lands in instagram and matches the bucket label, so no raw override.
    expect(channelFromGhl("TYPE_INSTAGRAM").rawChannel).toBeUndefined();
  });
});

describe("looseSalesRole / salesRepKey", () => {
  it("resolves a role from a full display name via the first word", () => {
    expect(looseSalesRole("Lucas Smith")).toBe("setter");
    expect(looseSalesRole("Lilli")).toBe("closer");
    expect(looseSalesRole("Someone Unmapped")).toBeNull();
    expect(looseSalesRole(null)).toBeNull();
  });
  it("returns the config key (lowercased first name) for a mapped rep", () => {
    expect(salesRepKey("Lucas Smith")).toBe("lucas");
    expect(salesRepKey("lilli")).toBe("lilli");
    expect(salesRepKey("Nobody")).toBeNull();
    expect(salesRepKey(undefined)).toBeNull();
  });
});

describe("userNameById", () => {
  it("prefers name, falling back to first + last", () => {
    const users: GhlUser[] = [
      { id: "u1", name: "Lucas Smith" },
      { id: "u2", firstName: "Lilli", lastName: "Jones" },
      { id: "u3" },
    ];
    const map = userNameById(users);
    expect(map.get("u1")).toBe("Lucas Smith");
    expect(map.get("u2")).toBe("Lilli Jones");
    expect(map.get("u3")).toBe("");
  });
});

// Helper to build a contact with named custom fields against a shared def set.
const DEFS: GhlCustomFieldDef[] = [
  { id: "status", name: "Status" },
  { id: "coach", name: "Assigned Coach" },
  { id: "rate", name: "Weekly Rate" },
  { id: "start", name: "Start Date" },
  { id: "term", name: "Term Length" },
  { id: "termend", name: "Term End Date" },
  { id: "freq", name: "Check-in Frequency" },
  { id: "billing", name: "Billing Frequency" },
  { id: "onboard", name: "Onboarding Type" },
  { id: "lead", name: "Lead Source" },
];

describe("mapContactsToRoster", () => {
  it("maps a status-bearing contact and derives the snake->camel client fields", () => {
    const contacts: GhlContact[] = [
      {
        id: "c1",
        contactName: "Jane Doe",
        customFields: [
          { id: "status", value: "Active" },
          { id: "coach", value: "Stephen" },
          { id: "rate", value: 60 },
          { id: "start", value: daysAgo(14) },
          { id: "term", value: 16 },
          { id: "freq", value: "Fortnightly" },
          { id: "billing", value: "PIF" },
          { id: "lead", value: "TikTok" },
        ],
      },
    ];
    const { clients, coaches } = mapContactsToRoster(contacts, DEFS);
    expect(clients).toHaveLength(1);
    const cl = clients[0];
    expect(cl.id).toBe("c1");
    expect(cl.name).toBe("Jane Doe");
    expect(cl.status).toBe("active");
    expect(cl.plan).toBe("Fortnightly");
    expect(cl.weeklyRate).toBe(60);
    expect(cl.monthlyRate).toBe(Math.round((60 * 52) / 12)); // 260
    expect(cl.termLength).toBe(16);
    expect(cl.billingFrequency).toBe("PIF");
    expect(cl.source).toBe("TikTok");
    expect(cl.checkInCode).toBe("N");
    // 2 weeks in -> cashCollected = weeklyRate * min(weeks, term).
    expect(cl.cashCollected).toBe(60 * 2);
    // One coach created and linked.
    expect(coaches).toHaveLength(1);
    expect(coaches[0].name).toBe("Stephen");
    expect(cl.coachId).toBe(coaches[0].id);
  });

  it("excludes contacts with no Status custom field (not coaching clients)", () => {
    const contacts: GhlContact[] = [
      { id: "x", contactName: "No Status", customFields: [{ id: "rate", value: 50 }] },
    ];
    const { clients, coaches } = mapContactsToRoster(contacts, DEFS);
    expect(clients).toHaveLength(0);
    expect(coaches).toHaveLength(0);
  });

  it("dedupes coaches by name across multiple clients and marks Angus head_coach", () => {
    const mk = (id: string, coach: string): GhlContact => ({
      id,
      contactName: id,
      customFields: [
        { id: "status", value: "active" },
        { id: "coach", value: coach },
        { id: "start", value: daysAgo(7) },
      ],
    });
    const { clients, coaches } = mapContactsToRoster(
      [mk("a", "Angus"), mk("b", "Angus"), mk("c", "Stephen")],
      DEFS,
    );
    expect(clients).toHaveLength(3);
    expect(coaches).toHaveLength(2); // Angus once, Stephen once
    const angus = coaches.find((c) => c.name === "Angus");
    expect(angus?.role).toBe("head_coach");
    expect(coaches.find((c) => c.name === "Stephen")?.role).toBe("coach");
    // Both Angus clients share the one coach id.
    expect(clients[0].coachId).toBe(clients[1].coachId);
  });

  it("marks paused and cancelled with the right check-in codes", () => {
    const mk = (id: string, status: string): GhlContact => ({
      id,
      contactName: id,
      customFields: [
        { id: "status", value: status },
        { id: "start", value: daysAgo(7) },
      ],
    });
    const { clients } = mapContactsToRoster([mk("p", "paused"), mk("c", "cancelled")], DEFS);
    const byId = new Map(clients.map((c) => [c.id, c]));
    expect(byId.get("p")?.checkInCode).toBe("P");
    expect(byId.get("c")?.checkInCode).toBe("C");
  });
});

describe("mapOpportunitiesToLeads", () => {
  const pipelines: GhlPipeline[] = [
    {
      id: "p1",
      name: "Sales",
      stages: [
        { id: "s-new", name: "New Enquiry" },
        { id: "s-booked", name: "Call Booked" },
      ],
    },
  ];

  it("maps the pipeline stage name onto the HQ LeadStage", () => {
    const opps: GhlOpportunity[] = [
      { id: "o1", pipelineStageId: "s-booked", status: "open", contact: { id: "k", contactName: "Lead One" } },
    ];
    const [lead] = mapOpportunitiesToLeads(opps, pipelines);
    expect(lead.stage).toBe("Call Booked");
    expect(lead.name).toBe("Lead One");
  });

  it("overrides stage from opportunity status (won->Submitted, lost->Lost)", () => {
    const opps: GhlOpportunity[] = [
      { id: "won", pipelineStageId: "s-new", status: "won" },
      { id: "lost", pipelineStageId: "s-booked", status: "lost" },
      { id: "abandoned", pipelineStageId: "s-booked", status: "abandoned" },
    ];
    const leads = mapOpportunitiesToLeads(opps, pipelines);
    expect(leads.find((l) => l.id === "won")?.stage).toBe("Submitted");
    expect(leads.find((l) => l.id === "lost")?.stage).toBe("Lost");
    expect(leads.find((l) => l.id === "abandoned")?.stage).toBe("Lost");
  });

  it("defaults an unknown stage to New Enquiry", () => {
    const opps: GhlOpportunity[] = [{ id: "o", pipelineStageId: "mystery", status: "open" }];
    expect(mapOpportunitiesToLeads(opps, pipelines)[0].stage).toBe("New Enquiry");
  });
});

describe("mapConversations", () => {
  it("joins the roster by contactId and classifies Client vs Lead", () => {
    const clients = [{ id: "c1", name: "Roster Client", plan: "Weekly", coachId: "co1", cashCollected: 999 }] as never[];
    const coaches = [{ id: "co1", name: "Stephen" }] as never[];
    const convos: GhlConversation[] = [
      { id: "v1", contactId: "c1", lastMessageType: "TYPE_INSTAGRAM", lastMessageBody: "hi", lastMessageDate: NOW.getTime() },
      { id: "v2", contactId: "unknown", fullName: "Walk In Lead", lastMessageType: "TYPE_SMS", lastMessageBody: "yo" },
    ];
    const out = mapConversations(convos, clients, coaches);
    const v1 = out.find((c) => c.id === "v1")!;
    expect(v1.name).toBe("Roster Client");
    expect(v1.contactType).toBe("Client");
    expect(v1.channel).toBe("instagram");
    expect(v1.coach).toBe("Stephen");
    expect(v1.ltv).toBe(999);
    const v2 = out.find((c) => c.id === "v2")!;
    expect(v2.contactType).toBe("Lead");
    expect(v2.name).toBe("Walk In Lead");
    expect(v2.coach).toBe("Unassigned");
  });
});

describe("mapMessages", () => {
  it("drops empty bodies, sorts oldest first, and tags direction", () => {
    const messages: GhlMessage[] = [
      { id: "m2", body: "second", direction: "outbound", dateAdded: 2000 },
      { id: "m0", body: "   ", direction: "inbound", dateAdded: 500 }, // dropped (blank)
      { id: "m1", body: "first", direction: "inbound", dateAdded: 1000 },
    ];
    const out = mapMessages(messages);
    expect(out.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(out[0]).toMatchObject({ from: "them", text: "first" });
    expect(out[1]).toMatchObject({ from: "us", text: "second" });
  });
});

describe("mapCalendarEvents", () => {
  it("drops events with no start time and formats the date", () => {
    const events: GhlCalendarEvent[] = [
      { id: "e1", title: "Consult", startTime: NOW.getTime() },
      { id: "e2", title: "No Time", startTime: null },
    ];
    const out = mapCalendarEvents(events);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("e1");
    expect(out[0].date).toBe(new Date(NOW.getTime()).toISOString().slice(0, 10));
    expect(out[0].type).toBe("call");
  });
});

describe("mapCallBookings", () => {
  it("assigns the owner to the setter or closer slot via sales-config", () => {
    const clients = [{ id: "c1", name: "Booked Client" }] as never[];
    const users = new Map([
      ["u-set", "Lucas Smith"],
      ["u-close", "Lilli"],
    ]);
    const events: GhlCalendarEvent[] = [
      { id: "e-set", contactId: "c1", startTime: NOW.getTime(), assignedUserId: "u-set", address: "Zoom" },
      { id: "e-close", contactId: "off", title: "Cold Lead", startTime: NOW.getTime() + 1000, assignedUserId: "u-close", address: "0400 000 000" },
    ];
    const out = mapCallBookings(events, clients, users);
    const set = out.find((b) => b.id === "e-set")!;
    expect(set.kind).toBe("Client");
    expect(set.name).toBe("Booked Client");
    expect(set.setter).toBe("Lucas Smith");
    expect(set.closer).toBe("-");
    expect(set.channel).toBe("Zoom");
    const close = out.find((b) => b.id === "e-close")!;
    expect(close.kind).toBe("Lead");
    expect(close.closer).toBe("Lilli");
    expect(close.setter).toBe("-");
    expect(close.channel).toBe("Phone");
  });

  it("leaves both slots blank when no users map is supplied", () => {
    const events: GhlCalendarEvent[] = [
      { id: "e", contactId: "x", startTime: NOW.getTime(), assignedUserId: "u-set" },
    ];
    const [b] = mapCallBookings(events, [], undefined);
    expect(b.setter).toBe("-");
    expect(b.closer).toBe("-");
  });
});
