// Stripe -> HQ Financials mapping. Turns charges, refunds, and open invoices
// into the cash facts the Financials screen shows: cash collected (30d),
// refunds (30d), past-due, and the recent transactions list. Plan is not a
// Stripe concept, so it is matched from the roster by billing name (fallback
// Weekly). Pure functions over the client's fetchers; no fetch logic here.

import type { Client, Plan, Transaction, TransactionStatus } from "@/lib/seed/types";
import {
  fetchCharges,
  fetchOpenInvoices,
  fetchRefunds,
  type StripeCharge,
} from "@/lib/stripe/client";

const DAY = 24 * 60 * 60;
const WINDOW_DAYS = 30;

export type StripeFinancials = {
  cashCollected30d: number;
  refunds: number;
  pastDue: number;
  pastDueCount: number;
  transactions: Transaction[];
};

/** Zero facts: the honest shape when Stripe is not connected or unreachable. */
export const EMPTY_STRIPE_FINANCIALS: StripeFinancials = {
  cashCollected30d: 0,
  refunds: 0,
  pastDue: 0,
  pastDueCount: 0,
  transactions: [],
};

const dollars = (cents: number) => Math.round(cents) / 100;

function chargeToTransaction(ch: StripeCharge, planByName: Map<string, Plan>): Transaction {
  const name = ch.billing_details?.name?.trim() || "Stripe customer";
  const plan: Plan = planByName.get(name.toLowerCase()) ?? "Weekly";
  const status: TransactionStatus = ch.refunded ? "refunded" : "paid";
  return {
    id: ch.id,
    date: new Date(ch.created * 1000).toISOString().slice(0, 10),
    clientName: name,
    plan,
    amount: dollars(ch.amount),
    source: "Stripe",
    status,
  };
}

/** Read the last 30 days of charges/refunds plus open invoices and reduce them
 *  to HQ cash facts. The caller (live.getFinancials) only invokes this when
 *  stripeConfigured() is true and wraps it in try/catch. */
export async function getStripeFinancials(clients: Client[]): Promise<StripeFinancials> {
  const now = Math.floor(Date.now() / 1000);
  const since = now - WINDOW_DAYS * DAY;

  const [charges, refundList, openInvoices] = await Promise.all([
    fetchCharges(since),
    fetchRefunds(since),
    fetchOpenInvoices(),
  ]);

  const planByName = new Map(clients.map((c) => [c.name.trim().toLowerCase(), c.plan]));

  // Cash collected: succeeded, captured charges in the window. Failed/uncaptured
  // charges never moved money, so they are excluded.
  const collected = charges.filter((ch) => ch.status === "succeeded" && ch.captured);
  const cashCollected30d = dollars(collected.reduce((s, ch) => s + ch.amount, 0));

  // Refunds this period: settled refunds created in the window.
  const refunds = dollars(
    refundList
      .filter((r) => r.status === "succeeded")
      .reduce((s, r) => s + r.amount, 0),
  );

  // Past due: open invoices whose due date has passed. Charges alone cannot show
  // this, so it comes from the invoices endpoint.
  const pastDueInvoices = openInvoices.filter(
    (inv) => inv.due_date != null && inv.due_date < now && inv.amount_remaining > 0,
  );
  const pastDue = dollars(pastDueInvoices.reduce((s, inv) => s + inv.amount_remaining, 0));

  // Recent transactions list: most recent charges first.
  const transactions = [...charges]
    .sort((a, b) => b.created - a.created)
    .map((ch) => chargeToTransaction(ch, planByName));

  return {
    cashCollected30d,
    refunds,
    pastDue,
    pastDueCount: pastDueInvoices.length,
    transactions,
  };
}
