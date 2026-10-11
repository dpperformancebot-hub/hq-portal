// Stripe read client for Financials. INERT until STRIPE_SECRET_KEY is set.
// Server-side only: calls the Stripe REST API via fetch (no SDK dependency),
// matching the GHL client pattern in src/lib/ghl/client.ts. Read-mostly: this
// client never writes to Stripe, so it cannot contact anyone (NO CONTACT rule).

const STRIPE_API = "https://api.stripe.com/v1";

// One page of charges/refunds is plenty for a 30d cash window on this account;
// cap pagination so a busy account can't spin the read forever.
const MAX_PAGES = 10;
const PAGE_SIZE = 100;

/** True once the owner has set STRIPE_SECRET_KEY. Absent = honest "not
 *  connected": the Financials cash KPIs stay at zero and the estimate label
 *  remains. Also gates the Settings integrations list. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

type ListResponse<T> = { data?: T[]; has_more?: boolean };

/** Authorized GET against the Stripe REST API. Throws on non-2xx so callers can
 *  fall back to the run-rate estimate (Financials wraps this in try/catch). */
async function stripeGet<T>(path: string, params: Record<string, string | number>): Promise<ListResponse<T>> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe not configured");
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  const res = await fetch(`${STRIPE_API}/${path}?${qs}`, {
    headers: { Authorization: `Bearer ${key}` },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Stripe ${path} responded ${res.status}`);
  return (await res.json()) as ListResponse<T>;
}

/** Walk a Stripe list endpoint via cursor pagination up to MAX_PAGES. */
async function stripeList<T extends { id: string }>(
  path: string,
  params: Record<string, string | number>,
): Promise<T[]> {
  const out: T[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query: Record<string, string | number> = { ...params, limit: PAGE_SIZE };
    if (startingAfter) query.starting_after = startingAfter;
    const body = await stripeGet<T>(path, query);
    const rows = body.data ?? [];
    out.push(...rows);
    if (!body.has_more || rows.length === 0) break;
    startingAfter = rows[rows.length - 1].id;
  }
  return out;
}

export type StripeCharge = {
  id: string;
  amount: number;
  amount_refunded: number;
  captured: boolean;
  created: number;
  paid: boolean;
  refunded: boolean;
  status: string; // "succeeded" | "pending" | "failed"
  billing_details?: { name?: string | null };
};

export type StripeRefund = {
  id: string;
  amount: number;
  created: number;
  status: string; // "succeeded" | "pending" | "failed" | "canceled"
};

export type StripeInvoice = {
  id: string;
  amount_remaining: number;
  due_date: number | null;
  status: string; // "draft" | "open" | "paid" | "uncollectible" | "void"
};

/** Charges created at or after `sinceUnix` (succeeded + failed; callers filter). */
export function fetchCharges(sinceUnix: number): Promise<StripeCharge[]> {
  return stripeList<StripeCharge>("charges", { "created[gte]": sinceUnix });
}

/** Refunds created at or after `sinceUnix`. */
export function fetchRefunds(sinceUnix: number): Promise<StripeRefund[]> {
  return stripeList<StripeRefund>("refunds", { "created[gte]": sinceUnix });
}

/** Open (unpaid) invoices. Past-due is derived in the mapping from due_date. */
export function fetchOpenInvoices(): Promise<StripeInvoice[]> {
  return stripeList<StripeInvoice>("invoices", { status: "open" });
}
