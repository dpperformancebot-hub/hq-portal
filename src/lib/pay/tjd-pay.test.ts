import { describe, expect, it } from "vitest";
import {
  buildTjdInvoice,
  clientRateFor,
  invoiceableWeeks,
  monthlyToWeekly,
  rateFor,
  weeksEndingInMonth,
  type TjdPayClient,
  type TjdRateCard,
} from "./tjd-pay";

// FICTIONAL rate cards (the real ones are business data, kept in the
// database, not the repo). Shaped like the real thing: per-coach money, a
// higher referral rate, a fractional fortnightly figure.
const COACH_A: TjdRateCard = {
  brandWeekly: 60, brandFortnightly: 45,
  referralWeekly: 80, referralFortnightly: 60,
  clientWeekly: 110, clientFortnightly: 85,
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

const client = (over: Partial<TjdPayClient> = {}): TjdPayClient => ({
  clientId: "c1", clientName: "Client One",
  cadence: "weekly", type: "brand", payer: "weekly", weeksPaid: 4,
  ...over,
});

describe("the rate card", () => {
  it("pays 240/mo weekly brand as 60/wk", () => {
    expect(monthlyToWeekly(240)).toBe(60);
    expect(rateFor(COACH_A, "brand", "weekly")).toBe(60);
    expect(rateFor(COACH_A, "brand", "fortnightly")).toBe(45);
  });
  it("pays the referral rate on referred clients, and it is higher", () => {
    expect(rateFor(COACH_A, "referral", "weekly")).toBe(80);
    expect(rateFor(COACH_A, "referral", "fortnightly")).toBe(60);
    expect(rateFor(COACH_A, "referral", "weekly")).toBeGreaterThan(rateFor(COACH_A, "brand", "weekly"));
  });
  it("keeps each coach on their own money", () => {
    expect(rateFor(COACH_B, "brand", "weekly")).toBe(52);
    expect(rateFor(COACH_C, "brand", "weekly")).toBe(35);
    // A and B share the weekly referral rate; C does not.
    expect(rateFor(COACH_B, "referral", "weekly")).toBe(80);
    expect(rateFor(COACH_C, "referral", "weekly")).toBe(55);
  });
  it("charges the client 440/mo weekly and 340/mo fortnightly", () => {
    expect(clientRateFor(COACH_A, "weekly")).toBe(110);
    expect(clientRateFor(COACH_A, "fortnightly")).toBe(85);
    expect(monthlyToWeekly(440)).toBe(110);
    expect(monthlyToWeekly(340)).toBe(85);
  });
});

describe("the five-week month rule", () => {
  it("counts weeks by the month their SUNDAY falls in", () => {
    // Sundays in Aug 2026: 2, 9, 16, 23, 30 -> five.
    expect(weeksEndingInMonth(2026, 7)).toBe(5);
    // Sundays in Sep 2026: 6, 13, 20, 27 -> four.
    expect(weeksEndingInMonth(2026, 8)).toBe(4);
  });

  it("gives a weekly payer the fifth week, because they paid for it", () => {
    expect(invoiceableWeeks("weekly", 5, 5)).toBe(5);
  });

  it("caps a monthly payer at four, because one payment does not cover a fifth", () => {
    expect(invoiceableWeeks("monthly", 5, 5)).toBe(4);
  });

  it("never invents weeks nobody ticked", () => {
    expect(invoiceableWeeks("weekly", 2, 5)).toBe(2);
    expect(invoiceableWeeks("monthly", 0, 4)).toBe(0);
    expect(invoiceableWeeks("weekly", -1, 4)).toBe(0);
  });
});

describe("building a coach invoice", () => {
  it("is weeks paid times the rate, per client, summed", () => {
    const inv = buildTjdInvoice(
      COACH_A,
      [
        client({ clientId: "a", clientName: "A", weeksPaid: 4 }), // brand weekly 60 x 4
        client({ clientId: "b", clientName: "B", type: "referral", weeksPaid: 4 }), // 80 x 4
        client({ clientId: "c", clientName: "C", cadence: "fortnightly", weeksPaid: 2 }), // 45 x 2
      ],
      4,
    );
    expect(inv.lines.map((l) => l.invoiceable)).toEqual([240, 320, 90]);
    expect(inv.payroll).toBe(650);
    expect(inv.clients).toBe(3);
    expect(inv.weeksPaid).toBe(10);
  });

  it("flags the fifth week it dropped for a monthly payer", () => {
    const inv = buildTjdInvoice(COACH_A, [client({ payer: "monthly", weeksPaid: 5 })], 5);
    expect(inv.lines[0].weeksInvoiced).toBe(4);
    expect(inv.lines[0].cappedFifthWeek).toBe(true);
    expect(inv.payroll).toBe(240);
  });

  it("does not flag a capped week when nothing was dropped", () => {
    const inv = buildTjdInvoice(COACH_A, [client({ payer: "monthly", weeksPaid: 4 })], 5);
    expect(inv.lines[0].cappedFifthWeek).toBe(false);
  });

  it("lets a custom MONTHLY override replace the rate card, divided by four", () => {
    const inv = buildTjdInvoice(COACH_A, [client({ customCoachMonthly: 320, weeksPaid: 4 })], 4);
    expect(inv.lines[0].ratePerWeek).toBe(80);
    expect(inv.lines[0].invoiceable).toBe(320);
    expect(inv.lines[0].overridden).toBe(true);
  });

  it("ignores a blank or zero override and uses the card", () => {
    for (const v of [null, undefined, 0]) {
      const inv = buildTjdInvoice(COACH_A, [client({ customCoachMonthly: v as number | null })], 4);
      expect(inv.lines[0].ratePerWeek).toBe(60);
      expect(inv.lines[0].overridden).toBe(false);
    }
  });

  it("tracks revenue and what the brand keeps", () => {
    const inv = buildTjdInvoice(COACH_A, [client({ weeksPaid: 4 })], 4);
    expect(inv.revenue).toBe(440); // client pays 110/wk
    expect(inv.payroll).toBe(240);
    expect(inv.brandKeeps).toBe(200);
  });

  it("honours a custom client price for revenue without touching coach pay", () => {
    const inv = buildTjdInvoice(COACH_A, [client({ customClientMonthly: 250, weeksPaid: 4 })], 4);
    expect(inv.revenue).toBe(250);
    expect(inv.payroll).toBe(240); // coach still on the card
  });

  it("gives the owner's own clients revenue but no coach split", () => {
    const inv = buildTjdInvoice(COACH_A, [client({ weeksPaid: 4 })], 4, true);
    expect(inv.payroll).toBe(0);
    expect(inv.revenue).toBe(440);
    expect(inv.brandKeeps).toBe(440);
  });

  it("counts challenge clients separately without changing the money", () => {
    const inv = buildTjdInvoice(COACH_A, [client({ challenge: true }), client({ clientId: "z" })], 4);
    expect(inv.challengeClients).toBe(1);
    expect(inv.clients).toBe(2);
  });

  it("is zero for an empty roster rather than throwing", () => {
    const inv = buildTjdInvoice(COACH_C, [], 4);
    expect(inv).toMatchObject({ payroll: 0, revenue: 0, brandKeeps: 0, clients: 0, weeksPaid: 0 });
  });

  it("keeps fortnightly referral money exact to the cent", () => {
    const inv = buildTjdInvoice(COACH_B, [client({ type: "referral", cadence: "fortnightly", weeksPaid: 2 })], 4);
    expect(inv.lines[0].ratePerWeek).toBe(61.25);
    expect(inv.lines[0].invoiceable).toBe(122.5);
  });
});
