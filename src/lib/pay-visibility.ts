import { moneyHiddenFromViewer } from "@/lib/access-policy";
import type { Role } from "@/lib/navigation";

// Pay-visibility hardening (V2-01, 2026-08-04). Coach pay rates
// (weeklyRate/fortnightlyRate on the coach card) are what a coach is PAID per
// client per week: money, so the head-coach/no-pay contract applies. The
// oversight screens (Coach Performance, Coach Overview, the per-coach
// overview) never render these fields, but RSC props ship in the page payload
// even when unrendered, so they must be stripped server-side before the data
// crosses to the client, same as /financials and /team redirect coaches
// before streaming.
//
// My Pay is the ONLY screen that legitimately renders a rate, and it is
// pre-scoped to the signed-in coach's own card, so it never goes through here.

/** Zero the pay-rate fields on a coach card, leaving performance data intact. */
export function stripPayRates<T extends { weeklyRate: number; fortnightlyRate: number }>(card: T): T {
  return { ...card, weeklyRate: 0, fortnightlyRate: 0 };
}

export function stripPayRatesAll<T extends { weeklyRate: number; fortnightlyRate: number }>(
  cards: T[],
): T[] {
  return cards.map(stripPayRates);
}

// Client payment-structure hardening (V2 B2 follow-up, 2026-08-05). PIF/WBW
// is owner/VA-only, and it is DERIVABLE from billingFrequency + termLength,
// so those two fields must not stream to coach sessions even unrendered.
// resolveCoachContext (every coach-facing roster) and getCoachClientDetail
// apply this; owner/VA surfaces (journey, renewals, financials) read the
// fields through their own data paths and are unaffected.

/** Null the payment-structure signals on a client record. */
export function stripPaymentSignals<
  T extends { billingFrequency?: string | null; termLength?: number | null },
>(client: T): T {
  return { ...client, billingFrequency: null, termLength: null };
}

export function stripPaymentSignalsAll<
  T extends { billingFrequency?: string | null; termLength?: number | null },
>(clients: T[]): T[] {
  return clients.map(stripPaymentSignals);
}

// Coach-dashboard pay (Brand.pay.coachCanSeePay, TJD: coaches never see pay).
// The coach dashboard payload carries the pay snapshot, the weekly pay trend
// and the coach card's own rates. Hiding them in render is not enough (RSC
// props ship unrendered), so pages strip them here before the data crosses to
// the client. Also used by the pay-free per-coach overview.

/** The pay-bearing slice of CoachDashboardData. Structural so this module
 *  stays free of the data layer. */
type CoachDashboardPayShape = {
  coach: { weeklyRate: number; fortnightlyRate: number } | null;
  pay: { gross: number; nextPayDate: string };
  trends: { pay: number[] };
};

/** Zero the coach's pay snapshot, drop the pay trend series and strip the
 *  coach card's rates, leaving every performance field intact. */
export function stripCoachDashboardPay<T extends CoachDashboardPayShape>(data: T): T {
  return {
    ...data,
    coach: data.coach ? stripPayRates(data.coach) : null,
    pay: { gross: 0, nextPayDate: "" },
    trends: { ...data.trends, pay: [] },
  };
}

// Client money (Brand.pay.coachCanSeePay = false, TJD owner rule: NO pay or
// money figure reaches a coach or head coach anywhere). A client record
// carries three $ figures: monthlyRate (monthly equivalent of the price),
// weeklyRate (the price itself) and cashCollected (billed to date, the LTV
// basis). Leads carry a deal value, inbox threads an LTV, analytics a revenue
// column. Hiding them in render is not enough (RSC props, server action
// returns and API JSON all ship unrendered fields), so every coach-reachable
// loader, page, action and route runs its payload through these helpers
// before it leaves the server. Cadence (plan), client type and payer are NOT
// money and stay. DP (flag true) never strips: see moneyHiddenFromViewer.

/** The $-bearing fields of a client record. Structural, optional, so the
 *  helpers accept any client-shaped object without importing the data layer. */
export type ClientMoneyShape = {
  monthlyRate?: number;
  weeklyRate?: number | null;
  cashCollected?: number;
};

/** Every field name the client-money strip zeroes. Exported for the sweep
 *  tests, which assert none of them survives with a value. */
export const CLIENT_MONEY_FIELDS = ["monthlyRate", "weeklyRate", "cashCollected"] as const;

/** Zero a client's price, monthly equivalent and billed-to-date. Fields the
 *  object does not carry stay absent; everything else is untouched. */
export function stripClientMoney<T extends ClientMoneyShape>(client: T): T {
  const out = { ...client } as T & ClientMoneyShape;
  for (const k of CLIENT_MONEY_FIELDS) if (k in out) out[k] = 0;
  return out;
}

export function stripClientMoneyAll<T extends ClientMoneyShape>(clients: T[]): T[] {
  return clients.map(stripClientMoney);
}

/** Any row that wraps a client (renewal rows, client detail). */
export function stripWrappedClientMoney<T extends { client: ClientMoneyShape }>(row: T): T {
  return { ...row, client: stripClientMoney(row.client) };
}

export function stripWrappedClientMoneyAll<T extends { client: ClientMoneyShape }>(rows: T[]): T[] {
  return rows.map(stripWrappedClientMoney);
}

/** Pipeline leads: the deal value is money. */
export function stripLeadMoneyAll<T extends { value: number }>(leads: T[]): T[] {
  return leads.map((l) => ({ ...l, value: 0 }));
}

/** Inbox threads: the contact's LTV is money. */
export function stripConversationMoneyAll<T extends { ltv: number }>(conversations: T[]): T[] {
  return conversations.map((c) => ({ ...c, ltv: 0 }));
}

/** Analytics: the per-source revenue column is money. */
export function stripAnalyticsMoney<T extends { sourcePerf: { revenue: number }[] }>(data: T): T {
  return { ...data, sourcePerf: data.sourcePerf.map((s) => ({ ...s, revenue: 0 })) };
}

/** The one call every page/action/route makes: strip `data` with `strip`
 *  when the viewer is a money-blind coach (moneyHiddenFromViewer), else
 *  return it untouched. Keyed on the REAL and the effective role: a coach, or
 *  the owner viewing as a coach on TJD, gets the stripped view; the owner not
 *  viewing as anyone keeps everything and DP (flag true) never strips. */
export function forMoneyViewer<T>(viewer: { realRole: Role; role: Role }, data: T, strip: (d: T) => T): T {
  return moneyHiddenFromViewer(viewer) ? strip(data) : data;
}
