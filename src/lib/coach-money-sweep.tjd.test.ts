import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ServerIdentity } from "@/lib/role-server";
import { moneyLeaksInHtml, moneyLeaksInPayload, serialise } from "../../test/coach-money-fixtures";

// SWEEP (TJD owner rule): NO pay or money figure reaches a coach or head
// coach anywhere. Every page under src/app/(hq) (discovered from disk, so a
// new page is swept automatically) is rendered as a TJD coach and as a TJD
// head coach on the REAL data layer (demo/seed mode) whose money fields are
// all sentinels (4321.99 / 8765). For each page the test checks:
//   1. the payload: every prop of the returned element tree, i.e. exactly what
//      crosses the RSC boundary to client components, serialised to JSON;
//   2. the rendered HTML (the tree rendered inside the shell's providers);
// and fails on a sentinel, a "$" followed by a digit, or a money-only field
// (weeklyRate, monthlyRate, revenue, payroll, invoiceable, ...) holding a
// non-zero value. A page may instead redirect (never an error page). The
// coach + head-coach nav slugs must all be covered by the swept pages.
//
// "View as coach" (owner rule): the owner viewing the portal as a coach or a
// head coach must see EXACTLY what that coach sees, so every page (the owner
// money routes included: payroll, financials, my-pay, rate-card settings) is
// swept again as "TJD owner viewing as coach" and "TJD owner viewing as head
// coach" with the same money checks and the same money-route redirects. The
// owner NOT viewing as anyone keeps everything (asserted at the bottom).

(globalThis as unknown as { React: typeof React }).React = React;

const h = vi.hoisted(() => ({
  identity: null as unknown as ServerIdentity,
  /** Off for the page sweep (demo/seed). The server-action sweep turns it on
   *  so every action runs past its "no datastore" early return and reaches
   *  its role gate; dbAdmin throws, proving a coach is refused BEFORE any
   *  money is read. */
  persistence: false,
}));

vi.mock("@/lib/brand", async (orig) => {
  const real = (await orig()) as { BRANDS: Record<string, unknown> };
  return { ...real, BRAND: real.BRANDS.tjd, BRAND_KEY: "tjd", IS_DP: false };
});
vi.mock("@/lib/seed", async (orig) => {
  const { moneySeed } = await import("../../test/coach-money-fixtures");
  return moneySeed(await orig());
});
vi.mock("@/lib/role-server", async () => {
  const ap = await import("@/lib/access-policy");
  const id = () => h.identity;
  return {
    NO_ACCESS_PATH: "/no-access",
    clerkAuthEnabled: () => false,
    getServerIdentity: async () => id(),
    getServerRole: async () => id().role,
    assertBrandManager: async () => (ap.canManageBrandContent(id()) ? null : ap.DENY.brand),
    assertFinancialsAccess: async () => (ap.canViewFinancials(id()) ? null : ap.DENY.financials),
    assertOwnerOnly: async () => (ap.canGrantRoles(id()) ? null : ap.DENY.ownerOnly),
  };
});
vi.mock("@/lib/db/client", async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  persistenceEnabled: () => h.persistence,
  dbAdmin: () => {
    throw new Error("dbAdmin reached: a coach got past a money gate");
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set() {}, delete() {} }),
  headers: async () => new Headers(),
}));
// React 18's client build has no `cache` (an RSC export); the live layer
// wraps loaders in it at module load. Identity is the right stand-in here.
vi.mock("react", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, cache: (fn: unknown) => fn };
});
vi.mock("next/cache", () => ({ revalidatePath() {}, revalidateTag() {}, unstable_cache: (fn: unknown) => fn }));

import { getNavGroupsFor, getDefaultRoute } from "@/lib/navigation";
import { getCoachRosterData } from "@/lib/data";

// Component modules are loaded after React is on the global (the suite's
// classic JSX runtime needs it at module-evaluation time).
type Provider = React.ComponentType<Record<string, unknown> & { children?: React.ReactNode }>;
let RoleProvider: Provider;
let ToastProvider: Provider;
let SensitiveProvider: Provider;

const HQ = fileURLToPath(new URL("../app/(hq)", import.meta.url));

/** Every page.tsx under (hq), as its route ("/my-clients/[id]"). */
function discoverPages(dir = HQ): { route: string; file: string }[] {
  const out: { route: string; file: string }[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...discoverPages(full));
    else if (name === "page.tsx") {
      const rel = relative(HQ, dir).split(sep).join("/");
      out.push({ route: `/${rel}`, file: full });
    }
  }
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

const PAGES = discoverPages();

const COACH: ServerIdentity = {
  role: "coach",
  realRole: "coach",
  displayName: "Sarah Bennett",
  linkedCoachId: "co2",
  impersonating: false,
  isHeadCoach: false,
  realIsHeadCoach: false,
};
const HEAD_COACH: ServerIdentity = {
  ...COACH,
  displayName: "Angus",
  linkedCoachId: "co1",
  isHeadCoach: true,
  realIsHeadCoach: true,
};

/** The owner (real role) viewing the portal as each of the above. */
const OWNER_AS_COACH: ServerIdentity = { ...COACH, realRole: "owner", impersonating: true, realIsHeadCoach: false };
const OWNER_AS_HEAD_COACH: ServerIdentity = { ...HEAD_COACH, realRole: "owner", impersonating: true, realIsHeadCoach: false };
const OWNER: ServerIdentity = {
  role: "owner",
  realRole: "owner",
  displayName: "Owner",
  linkedCoachId: null,
  impersonating: false,
  isHeadCoach: false,
  realIsHeadCoach: false,
};

const SWEPT: [string, ServerIdentity][] = [
  ["TJD coach", COACH],
  ["TJD head coach", HEAD_COACH],
  ["TJD owner viewing as coach", OWNER_AS_COACH],
  ["TJD owner viewing as head coach", OWNER_AS_HEAD_COACH],
];

/** Routes a coach must be bounced from (money screens), straight to their
 *  dashboard, never an error page. */
const MONEY_ROUTES = [
  "/my-pay",
  "/payroll",
  "/financials",
  "/settings",
  "/daily-digest",
  "/weekly-report",
  "/sales-dashboard",
  "/sales-performance",
  "/reports",
  "/reports/[id]",
  "/contracts",
  "/merch",
  "/ambassadors",
  "/marketing-campaigns",
];

let rosterClientId = "";

beforeAll(async () => {
  RoleProvider = (await import("@/components/role/role-provider")).RoleProvider as unknown as Provider;
  ToastProvider = (await import("@/components/ui")).ToastProvider as unknown as Provider;
  SensitiveProvider = (await import("@/components/sensitive-provider")).SensitiveProvider as unknown as Provider;
  h.identity = COACH;
  rosterClientId = (await getCoachRosterData("co2")).clients[0]?.id ?? "";
});

function paramsFor(route: string): Record<string, unknown> {
  if (route === "/[...slug]") return { slug: ["not-a-screen"] };
  if (route.endsWith("[coachId]")) return { coachId: "co2" };
  if (route === "/reports/[id]") return { id: "r1" };
  if (route.endsWith("[id]")) return { id: rosterClientId };
  return {};
}

type Outcome =
  | { kind: "redirect"; to: string }
  | { kind: "notFound" }
  | { kind: "rendered"; tree: unknown };

async function hit(route: string, file: string, identity: ServerIdentity): Promise<Outcome> {
  h.identity = identity;
  const mod = (await import(/* @vite-ignore */ file)) as {
    default: (props: { params: Promise<unknown>; searchParams: Promise<unknown> }) => unknown;
  };
  try {
    const tree = await mod.default({ params: Promise.resolve(paramsFor(route)), searchParams: Promise.resolve({}) });
    return { kind: "rendered", tree };
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.startsWith("NEXT_REDIRECT:")) return { kind: "redirect", to: msg.slice("NEXT_REDIRECT:".length) };
    if (msg === "NEXT_NOT_FOUND") return { kind: "notFound" };
    throw e;
  }
}

/** Render the tree to HTML inside the providers the (hq) shell supplies. */
function renderHtml(tree: unknown, identity: ServerIdentity): string {
  return renderToStaticMarkup(
    React.createElement(
      RoleProvider,
      { authRole: identity.role, realRole: identity.realRole, isHeadCoach: identity.isHeadCoach, displayName: identity.displayName },
      React.createElement(ToastProvider, null, React.createElement(SensitiveProvider, null, tree as React.ReactNode)),
    ),
  );
}

const ALLOWED_REDIRECTS = new Set(["/dashboard", "/team", "/client-journey?filter=unassigned"]);

describe("sweep: discovered pages cover the coach and head-coach nav", () => {
  it("finds the (hq) pages on disk", () => {
    expect(PAGES.length).toBeGreaterThan(50);
  });

  it("every coach and head-coach nav slug is a swept page", () => {
    const routes = new Set(PAGES.map((p) => p.route));
    for (const id of [COACH, HEAD_COACH, OWNER_AS_COACH, OWNER_AS_HEAD_COACH]) {
      const slugs = getNavGroupsFor({ role: id.role, isHeadCoach: id.isHeadCoach, realRole: id.realRole }).flatMap((g) =>
        g.items.map((i) => i.slug),
      );
      for (const slug of slugs) expect(routes.has(`/${slug}`), `nav slug /${slug} has no page`).toBe(true);
    }
  });

  it("the owner viewing as a coach / head coach gets exactly that coach's nav (no My Pay)", () => {
    const slugs = (id: ServerIdentity) =>
      getNavGroupsFor({ role: id.role, isHeadCoach: id.isHeadCoach, realRole: id.realRole })
        .flatMap((g) => g.items.map((i) => i.slug))
        .sort();
    expect(slugs(OWNER_AS_COACH)).toEqual(slugs(COACH));
    expect(slugs(OWNER_AS_HEAD_COACH)).toEqual(slugs(HEAD_COACH));
    expect(slugs(OWNER_AS_COACH)).not.toContain("my-pay");
    expect(slugs(OWNER_AS_HEAD_COACH)).not.toContain("my-pay");
  });
});

for (const [label, identity] of SWEPT) {
  describe(`sweep: ${label}`, () => {
    // Pages whose rendered HTML could be produced in Node. Every page's
    // PAYLOAD is always checked; HTML is checked wherever it renders.
    const htmlChecked: string[] = [];

    for (const { route, file } of PAGES) {
      it(`${route}: no money in the payload or the rendered page`, async () => {
        const out = await hit(route, file, identity);
        if (out.kind === "redirect") {
          expect(ALLOWED_REDIRECTS.has(out.to), `${route} redirected to ${out.to}`).toBe(true);
          return;
        }
        expect(out.kind, `${route} must never be an error/404 page for a coach`).toBe("rendered");
        if (out.kind !== "rendered") return;
        const payload = serialise(out.tree);
        expect(moneyLeaksInPayload(payload), `${route} payload`).toEqual([]);
        let html: string | null = null;
        try {
          html = renderHtml(out.tree, identity);
        } catch {
          html = null; // a client-only dependency (e.g. browser APIs); payload is still checked
        }
        if (html !== null) {
          htmlChecked.push(route);
          expect(moneyLeaksInHtml(html), `${route} html`).toEqual([]);
        }
      });
    }

    it("money routes redirect a coach to the dashboard", async () => {
      for (const route of MONEY_ROUTES) {
        const page = PAGES.find((p) => p.route === route);
        expect(page, `${route} exists`).toBeTruthy();
        const out = await hit(route, page!.file, identity);
        expect(out, route).toEqual({ kind: "redirect", to: getDefaultRoute("coach") });
      }
    });

    it("the money-bearing coach screens rendered to HTML (not just payload)", () => {
      const mustRender = ["/dashboard", "/my-clients", "/my-clients/[id]", "/check-ins"];
      if (identity.isHeadCoach) mustRender.push("/client-database", "/client-database/[id]", "/renewals");
      for (const r of mustRender) expect(htmlChecked, `${r} html`).toContain(r);
    });
  });
}

// ---------------------------------------------------------------------------
// Server actions + API routes a coach can call directly (every exported
// function in a "use server" file is a public endpoint). The money-bearing
// ones must refuse a coach or return nothing with a $ in it.

describe("sweep: server actions and API routes a coach can call", () => {
  for (const [label, identity] of SWEPT) {
    it(`${label}: getClientPanelAction (client slide-over) returns the client with no money`, async () => {
      h.identity = identity;
      const { getClientPanelAction } = await import("@/lib/client-panel-actions");
      const out = await getClientPanelAction(rosterClientId);
      expect(out?.detail.client.id).toBe(rosterClientId);
      expect(moneyLeaksInPayload(serialise(out))).toEqual([]);
    });

    it(`${label}: every pay / rate / payroll / expense action refuses before reading money`, async () => {
      h.identity = identity;
      h.persistence = true;
      try {
        const payroll = await import("@/lib/pay/tjd-payroll-actions");
        const rates = await import("@/lib/pay/coach-rates-actions");
        const { setClientRateAction } = await import("@/lib/client-rate-actions");
        const { listExpenses, createExpenseAction } = await import("@/lib/expenses-actions");
        const { listExistingCoachesAction } = await import("@/lib/add-coach-actions");
        const card = { brandWeekly: 1, brandFortnightly: 1, referralWeekly: 1, referralFortnightly: 1, clientWeekly: 1, clientFortnightly: 1 };
        const results: unknown[] = [
          await payroll.getMyTjdPayAction("2026-10"),
          await payroll.getTjdPayrollAction("2026-10"),
          await payroll.setPaidWeekAction(rosterClientId, "2026-10-05", true),
          await payroll.tickAllWeeksAction(rosterClientId, "2026-10", true),
          await rates.listCoachRatesAction(),
          await rates.setCoachRatesAction({ coachId: "co2", rates: card, ownerNoSplit: false }),
          await setClientRateAction(rosterClientId, 10),
          await listExpenses(),
          await createExpenseAction({ name: "x", amount: 1, cadence: "monthly", category: "other", notes: "" } as never),
          await listExistingCoachesAction(),
        ];
        for (const r of results) {
          const json = serialise(r);
          expect(moneyLeaksInPayload(json), json).toEqual([]);
          // Either an explicit refusal or an empty list, never data.
          const refused =
            (Array.isArray(r) && r.length === 0) || (typeof r === "object" && r !== null && (r as { ok?: boolean }).ok === false);
          expect(refused, json).toBe(true);
        }
      } finally {
        h.persistence = false;
      }
    });

    it(`${label}: listAssignableClientsAction carries no client money`, async () => {
      h.identity = identity;
      const { listAssignableClientsAction } = await import("@/lib/coach-assign-actions");
      expect(moneyLeaksInPayload(serialise(await listAssignableClientsAction()))).toEqual([]);
    });

    it(`${label}: GET /api/search (Cmd+K) returns no money and no pay screens`, async () => {
      h.identity = identity;
      const { GET } = await import("@/app/api/search/route");
      const res = await GET();
      const body = (await res.json()) as { items: { href: string }[] };
      expect(body.items.length).toBeGreaterThan(0);
      expect(moneyLeaksInPayload(JSON.stringify(body))).toEqual([]);
      const hrefs = body.items.map((i) => i.href);
      for (const money of ["/my-pay", "/payroll", "/financials", "/settings", "/daily-digest"]) {
        expect(hrefs).not.toContain(money);
      }
    });

    it(`${label}: POST /api/assistant client-summary sends the model no money`, async () => {
      h.identity = identity;
      const prev = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = "test-key";
      const sent: string[] = [];
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
        sent.push(String(init?.body ?? ""));
        return new Response(JSON.stringify({ content: [{ type: "text", text: "summary" }] }), { status: 200 });
      }) as typeof fetch;
      try {
        const { POST } = await import("@/app/api/assistant/route");
        const req = new Request("http://localhost/api/assistant", {
          method: "POST",
          body: JSON.stringify({ mode: "client-summary", clientId: rosterClientId }),
        });
        const res = await POST(req as never);
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(sent).toHaveLength(1);
        expect(moneyLeaksInPayload(sent[0])).toEqual([]);
        expect(moneyLeaksInPayload(JSON.stringify(body))).toEqual([]);
      } finally {
        globalThis.fetch = realFetch;
        if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
        else process.env.ANTHROPIC_API_KEY = prev;
      }
    });
  }
});

// ---------------------------------------------------------------------------
// The owner NOT viewing as anyone keeps every money surface on TJD: the
// inverse of the sweep, so the "view as coach" rule cannot have been met by
// hiding money from the owner too.

describe("TJD owner (not viewing as anyone) keeps pay and money", () => {
  for (const route of ["/payroll", "/financials", "/settings", "/daily-digest", "/client-database", "/pipeline"]) {
    it(`${route} renders for the owner`, async () => {
      const page = PAGES.find((p) => p.route === route)!;
      const out = await hit(route, page.file, OWNER);
      expect(out.kind, route).toBe("rendered");
    });
  }

  it("/client-database carries client prices for the owner", async () => {
    const page = PAGES.find((p) => p.route === "/client-database")!;
    const out = await hit("/client-database", page.file, OWNER);
    expect(out.kind).toBe("rendered");
    if (out.kind === "rendered") expect(moneyLeaksInPayload(serialise(out.tree)).length).toBeGreaterThan(0);
  });

  it("the client panel action returns the client price to the owner", async () => {
    h.identity = OWNER;
    const { getClientPanelAction } = await import("@/lib/client-panel-actions");
    const out = await getClientPanelAction(rosterClientId);
    expect(moneyLeaksInPayload(serialise(out)).length).toBeGreaterThan(0);
  });
});
