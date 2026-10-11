// Shared fixtures for the coach money tests (TJD owner rule: NO pay or money
// figure reaches a coach or head coach anywhere). Not a test file itself.
//
// The suite runs the REAL data layer in demo mode (seed data), with the seed's
// money fields overwritten by distinctive sentinel amounts so a leak is easy
// to spot in any serialised payload or rendered HTML:
//   4321.99 = every price / pay RATE (client weekly price, coach rates)
//   8765    = every other $ figure (monthly equivalent, billed to date, lead
//             value, inbox LTV, analytics revenue)

import type { ReactNode } from "react";

export const SENTINEL_RATE = 4321.99;
export const SENTINEL_MONEY = 8765;

/** Field names that only ever hold money. A payload containing one of these
 *  with a non-zero number is a leak, whatever the amount. */
export const MONEY_FIELD_NAMES = [
  "weeklyRate",
  "fortnightlyRate",
  "monthlyRate",
  "cashCollected",
  "customClientMonthly",
  "customCoachMonthly",
  "revenue",
  "revenueClosed",
  "payroll",
  "invoiceable",
  "brandKeeps",
  "ltv",
  "mrr",
  "cashCollected30d",
  "gross",
  "earned",
  "ratePerWeek",
  "commission",
  "pipelineValue",
] as const;

type SeedModule = Record<string, unknown> & {
  getClients: () => Record<string, unknown>[];
  getActiveClients: () => Record<string, unknown>[];
  getCoaches: () => Record<string, unknown>[];
  getCoachScorecards: () => Record<string, unknown>[];
  getLeads: () => Record<string, unknown>[];
  getConversations: () => Record<string, unknown>[];
  getAnalytics: () => { sourcePerf: Record<string, unknown>[] } & Record<string, unknown>;
};

const clientMoney = <T extends Record<string, unknown>>(c: T): T => ({
  ...c,
  weeklyRate: SENTINEL_RATE,
  monthlyRate: SENTINEL_MONEY,
  cashCollected: SENTINEL_MONEY,
});

const coachMoney = <T extends Record<string, unknown>>(c: T): T => ({
  ...c,
  weeklyRate: SENTINEL_RATE,
  fortnightlyRate: SENTINEL_RATE,
});

/** The real seed module with every money field replaced by a sentinel.
 *  Use as: vi.mock("@/lib/seed", async (orig) => moneySeed(await orig())). */
export function moneySeed(real: unknown): SeedModule {
  const r = real as SeedModule;
  return {
    ...r,
    getClients: () => r.getClients().map(clientMoney),
    getActiveClients: () => r.getActiveClients().map(clientMoney),
    getCoaches: () => r.getCoaches().map(coachMoney),
    getCoachScorecards: () => r.getCoachScorecards().map(coachMoney),
    getLeads: () => r.getLeads().map((l) => ({ ...l, value: SENTINEL_MONEY })),
    getConversations: () => r.getConversations().map((c) => ({ ...c, ltv: SENTINEL_MONEY })),
    getAnalytics: () => {
      const a = r.getAnalytics();
      return { ...a, sourcePerf: a.sourcePerf.map((s) => ({ ...s, revenue: SENTINEL_MONEY })) };
    },
  };
}

/** JSON of anything a page or action hands back, React element trees
 *  included: every prop of every element (i.e. exactly what would cross the
 *  RSC boundary to a client component). Functions and symbols drop out, Sets
 *  and Maps are expanded, cycles are cut. */
export function serialise(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (key, v) => {
    if (key === "_owner" || key === "_store") return undefined;
    if (typeof v === "function" || typeof v === "symbol") return undefined;
    if (typeof v === "bigint") return v.toString();
    if (v instanceof Set) return [...v];
    if (v instanceof Map) return Object.fromEntries(v);
    if (v && typeof v === "object") {
      if (seen.has(v)) return undefined;
      seen.add(v);
    }
    return v;
  });
}

const SENTINEL_STRINGS = ["4321.99", "4,321.99", "4322", "4,322", "8765", "8,765"];

/** Every money leak in a serialised payload: a sentinel, a "$" followed by a
 *  digit, or a money-only field holding a non-zero number. */
export function moneyLeaksInPayload(json: string): string[] {
  const hits: string[] = [];
  for (const s of SENTINEL_STRINGS) if (json.includes(s)) hits.push(`sentinel ${s}`);
  const dollar = json.match(/\$\s?\d[\d,.]*/g);
  if (dollar) hits.push(...dollar.map((d) => `dollar ${d}`));
  const field = new RegExp(`"(${MONEY_FIELD_NAMES.join("|")})":(-?(?:[1-9][0-9]*(?:\\.[0-9]+)?|0\\.[0-9]*[1-9][0-9]*))`, "g");
  for (const m of json.matchAll(field)) hits.push(`field ${m[1]}=${m[2]}`);
  return hits;
}

/** Every money leak in rendered HTML: a sentinel or a "$" followed by a digit. */
export function moneyLeaksInHtml(html: string): string[] {
  const hits: string[] = [];
  for (const s of SENTINEL_STRINGS) if (html.includes(s)) hits.push(`sentinel ${s}`);
  const dollar = html.match(/\$\s?(?:<!-- -->)?\d[\d,.]*/g);
  if (dollar) hits.push(...dollar.map((d) => `dollar ${d}`));
  return hits;
}

/** A React tree as the shell would wrap it, for rendering pages to HTML. */
export type Wrap = (node: ReactNode) => ReactNode;
