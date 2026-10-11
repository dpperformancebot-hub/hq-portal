import { describe, expect, it } from "vitest";
import { buildTjdInvoice, invoiceableWeeks, weeksEndingInMonth, type TjdPayClient, type TjdRateCard } from "@/lib/pay/tjd-pay";

// The weeks-paid pay rules, pinned with FICTIONAL rate cards (the real cards
// are business data and live in the database, not the repo). Every expected
// figure is worked out by hand from the rules, not from the implementation,
// so a change to the engine that breaks the owner's maths fails loudly.
//
// Rate cards are WEEKLY dollars: the rules quote monthly, divided by 4.
const COACH_A: TjdRateCard = {
  brandWeekly: 60, brandFortnightly: 45,          // $240 / $180 a month
  referralWeekly: 80, referralFortnightly: 60,    // $320 / $240 a month
  clientWeekly: 110, clientFortnightly: 85,       // $440 / $340 a month
};
const COACH_B: TjdRateCard = {
  brandWeekly: 52, brandFortnightly: 39,
  referralWeekly: 80, referralFortnightly: 61.25,
  clientWeekly: 110, clientFortnightly: 85,
};
const COACH_C: TjdRateCard = {
  brandWeekly: 35, brandFortnightly: 26,
  referralWeekly: 55, referralFortnightly: 41,
  clientWeekly: 110, clientFortnightly: 85,
};

const client = (over: Partial<TjdPayClient> & { clientId: string }): TjdPayClient => ({
  clientName: over.clientId, cadence: "weekly", type: "brand", payer: "weekly", weeksPaid: 4, ...over,
});

describe("the four rate-card combinations", () => {
  it("pays the brand rate on a weekly brand client", () => {
    const inv = buildTjdInvoice(COACH_A, [client({ clientId: "a" })], 4);
    expect(inv.lines[0].ratePerWeek).toBe(60);
    expect(inv.payroll).toBe(240); // 60 x 4
  });

  it("pays the higher REFERRAL rate on a client the coach brought in", () => {
    const inv = buildTjdInvoice(COACH_A, [client({ clientId: "a", type: "referral" })], 4);
    expect(inv.payroll).toBe(320); // 80 x 4
  });

  it("pays the fortnightly rate on a fortnightly client", () => {
    expect(buildTjdInvoice(COACH_A, [client({ clientId: "a", cadence: "fortnightly" })], 4).payroll).toBe(180);
    expect(buildTjdInvoice(COACH_A, [client({ clientId: "a", cadence: "fortnightly", type: "referral" })], 4).payroll).toBe(240);
  });

  it("uses each coach's own card, which is the point of per-coach rates", () => {
    const one = [client({ clientId: "a" })];
    expect(buildTjdInvoice(COACH_A, one, 4).payroll).toBe(240);
    expect(buildTjdInvoice(COACH_B, one, 4).payroll).toBe(208);
    expect(buildTjdInvoice(COACH_C, one, 4).payroll).toBe(140);
  });
});

describe("the five-week month, and the monthly-payer cap", () => {
  it("knows a five-week month when it sees one", () => {
    // November 2026: Sundays on 1, 8, 15, 22 and 29.
    expect(weeksEndingInMonth(2026, 10)).toBe(5);
  });

  it("pays a WEEKLY payer the fifth week, because they paid for it", () => {
    const inv = buildTjdInvoice(COACH_A, [client({ clientId: "a", payer: "weekly", weeksPaid: 5 })], 5);
    expect(inv.lines[0].weeksInvoiced).toBe(5);
    expect(inv.payroll).toBe(300); // 60 x 5
    expect(inv.lines[0].cappedFifthWeek).toBe(false);
  });

  it("caps a MONTHLY payer at four, because one payment does not cover five", () => {
    const inv = buildTjdInvoice(COACH_A, [client({ clientId: "a", payer: "monthly", weeksPaid: 5 })], 5);
    expect(inv.lines[0].weeksInvoiced).toBe(4);
    expect(inv.payroll).toBe(240);
    expect(inv.lines[0].cappedFifthWeek).toBe(true); // the screen says why
  });

  it("caps everyone at the weeks the month actually has", () => {
    expect(invoiceableWeeks("weekly", 5, 4)).toBe(4);
    expect(invoiceableWeeks("monthly", 4, 4)).toBe(4);
    expect(invoiceableWeeks("weekly", 0, 5)).toBe(0);
  });
});

describe("custom dollars override the card", () => {
  it("divides a custom MONTHLY coach figure by four", () => {
    const inv = buildTjdInvoice(COACH_A, [client({ clientId: "a", customCoachMonthly: 400 })], 4);
    expect(inv.lines[0].ratePerWeek).toBe(100); // 400 / 4
    expect(inv.payroll).toBe(400);
    expect(inv.lines[0].overridden).toBe(true);
  });

  it("does the same for what the client pays, which drives revenue", () => {
    const inv = buildTjdInvoice(COACH_A, [client({ clientId: "a", customClientMonthly: 250 })], 4);
    expect(inv.revenue).toBe(250);
    expect(inv.payroll).toBe(240);
    expect(inv.brandKeeps).toBe(10);
  });

  it("ignores a zero or blank override rather than paying nothing", () => {
    expect(buildTjdInvoice(COACH_A, [client({ clientId: "a", customCoachMonthly: 0 })], 4).payroll).toBe(240);
    expect(buildTjdInvoice(COACH_A, [client({ clientId: "a", customCoachMonthly: null })], 4).payroll).toBe(240);
  });
});

describe("the owner's own roster carries no coach split", () => {
  const OWNER: TjdRateCard = { ...COACH_A, brandWeekly: 0, brandFortnightly: 0, referralWeekly: 0, referralFortnightly: 0 };

  it("shows revenue but pays no payroll", () => {
    const inv = buildTjdInvoice(OWNER, [client({ clientId: "a", customClientMonthly: 400 })], 4, true);
    expect(inv.payroll).toBe(0);
    expect(inv.revenue).toBe(400);
    expect(inv.brandKeeps).toBe(400);
  });

  it("keeps paying nothing even when a custom COACH figure is set", () => {
    const inv = buildTjdInvoice(OWNER, [client({ clientId: "a", customCoachMonthly: 400 })], 4, true);
    expect(inv.payroll).toBe(0);
  });
});

describe("a client at zero weeks still appears", () => {
  it("lists them, so nobody looks missing from the roster", () => {
    const inv = buildTjdInvoice(COACH_A, [client({ clientId: "a", weeksPaid: 0 }), client({ clientId: "b" })], 4);
    expect(inv.clients).toBe(2);
    expect(inv.lines[0].invoiceable).toBe(0);
    expect(inv.payroll).toBe(240);
  });
});

describe("a whole month, the way the Overview tab adds up", () => {
  const roster: TjdPayClient[] = [
    client({ clientId: "1", type: "brand", cadence: "weekly", weeksPaid: 4 }),            // 240, rev 440
    client({ clientId: "2", type: "referral", cadence: "weekly", weeksPaid: 4 }),         // 320, rev 440
    client({ clientId: "3", type: "brand", cadence: "fortnightly", weeksPaid: 4 }),       // 180, rev 340
    client({ clientId: "4", type: "brand", payer: "monthly", weeksPaid: 2 }),             // 120, rev 220
    client({ clientId: "5", type: "brand", weeksPaid: 0 }),                               //   0, rev 0
  ];

  it("totals payroll, revenue and what the brand keeps", () => {
    const inv = buildTjdInvoice(COACH_A, roster, 4);
    expect(inv.payroll).toBe(240 + 320 + 180 + 120);
    expect(inv.revenue).toBe(440 + 440 + 340 + 220);
    expect(inv.brandKeeps).toBe(inv.revenue - inv.payroll);
    expect(inv.weeksPaid).toBe(14);
    expect(inv.clients).toBe(5);
  });
});
