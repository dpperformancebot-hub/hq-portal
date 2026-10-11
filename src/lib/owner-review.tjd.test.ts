import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import type { ServerIdentity } from "@/lib/role-server";

// The unit suite compiles .tsx with the classic JSX runtime; the page module
// needs React on the global.
(globalThis as unknown as { React: typeof React }).React = React;

// "Owner review" on audit cards (R4-5) is the owner/admin's spot-review OF
// the coach: never a coach control. TJD: view-as is exactly the coach view, so an owner viewing as a coach
// or head coach does not get it either. Hidden in the page AND refused by
// setOwnerReview (canOwnerReviewAudits).

const h = vi.hoisted(() => ({
  identity: null as unknown as ServerIdentity,
  persistence: false,
}));

vi.mock("@/lib/brand", async (orig) => {
  const real = (await orig()) as { BRANDS: Record<string, unknown> };
  return { ...real, BRAND: real.BRANDS.tjd, BRAND_KEY: "tjd", IS_DP: false };
});

vi.mock("@/lib/role-server", () => ({ getServerIdentity: () => Promise.resolve(h.identity) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock("@/lib/db/client", () => ({
  persistenceEnabled: () => h.persistence,
  dbAdmin: () => {
    throw new Error("db must not be reached by a refused caller");
  },
}));
const AUDIT = {
  id: "a1",
  clientId: "cl1",
  clientName: "Client One",
  coachId: "c-caleb",
  coachName: "Caleb",
  cadenceWeek: "W4",
  status: "sent",
  resolved: false,
  ownerRating: 2,
  ownerNotes: "private owner note",
};
vi.mock("@/lib/data", () => ({
  getAudits: () => Promise.resolve([AUDIT]),
  getCoachAuditsData: () => Promise.resolve([AUDIT]),
}));
vi.mock("@/components/screens/audits/audits-view", () => ({ AuditsView: () => null }));

import { canOwnerReviewAudits } from "@/lib/access-policy";
import { setOwnerReview } from "@/lib/audit-actions";
import ClientAuditsPage from "@/app/(hq)/client-audits/page";

const ident = (over: Partial<ServerIdentity>): ServerIdentity => ({
  role: "owner",
  realRole: "owner",
  displayName: null,
  linkedCoachId: null,
  impersonating: false,
  isHeadCoach: false,
  realIsHeadCoach: false,
  ...over,
});

const OWNER = ident({});
const ADMIN = ident({ role: "admin", realRole: "admin" });
const COACH = ident({ role: "coach", realRole: "coach", linkedCoachId: "c-emery" });
const HEAD_COACH = ident({ role: "coach", realRole: "coach", linkedCoachId: "c-caleb", isHeadCoach: true, realIsHeadCoach: true });
const OWNER_AS_COACH = ident({ role: "coach", realRole: "owner", linkedCoachId: "c-emery", impersonating: true });
const OWNER_AS_HEAD_COACH = ident({ role: "coach", realRole: "owner", linkedCoachId: "c-caleb", impersonating: true, isHeadCoach: true });

type PageProps = { canOwnerReview: boolean; audits: { ownerRating: number | null; ownerNotes: string | null }[] };
const renderPage = async (id: ServerIdentity) => {
  h.identity = id;
  const el = (await ClientAuditsPage()) as unknown as { props: PageProps };
  return el.props;
};
const review = (id: ServerIdentity) => {
  h.identity = id;
  return setOwnerReview("cl1", "W4", "c-caleb", { rating: 3, notes: "x" });
};

beforeEach(() => {
  h.persistence = false;
});

const REFUSED = [
  ["coach", COACH],
  ["head coach", HEAD_COACH],
  ["owner viewing as a coach", OWNER_AS_COACH],
  ["owner viewing as a head coach", OWNER_AS_HEAD_COACH],
] as const;
const ALLOWED = [
  ["owner as themselves", OWNER],
  ["admin as themselves", ADMIN],
] as const;

describe("TJD: Owner review on client audits", () => {
  it("brand flag: view-as is exactly the coach view on TJD", async () => {
    const { BRAND } = await import("@/lib/brand");
    expect(BRAND.viewAsIsExactCoachView).toBe(true);
  });

  for (const [label, id] of REFUSED) {
    it(`${label}: control hidden, owner notes stripped, server action refused`, async () => {
      expect(canOwnerReviewAudits(id)).toBe(false);
      const props = await renderPage(id);
      expect(props.canOwnerReview).toBe(false);
      expect(props.audits[0]).toMatchObject({ ownerRating: null, ownerNotes: null });
      // Persistence ON: a refused caller must be stopped before the db.
      h.persistence = true;
      expect(await review(id)).toEqual({ ok: false, error: expect.stringMatching(/owner or admin only/) });
    });
  }

  for (const [label, id] of ALLOWED) {
    it(`${label}: control shown with the stored review, server action passes the guard`, async () => {
      expect(canOwnerReviewAudits(id)).toBe(true);
      const props = await renderPage(id);
      expect(props.canOwnerReview).toBe(true);
      expect(props.audits[0]).toMatchObject({ ownerRating: 2, ownerNotes: "private owner note" });
      // Past the role guard it reaches the persistence check (off here).
      const res = await review(id);
      expect(res.ok).toBe(false);
      expect((res as { error: string }).error).toMatch(/HQ_PERSISTENCE=true/);
    });
  }

  it("forged effective owner on a coach login is still refused (real role decides)", () => {
    expect(canOwnerReviewAudits({ role: "owner", realRole: "coach" })).toBe(false);
  });
});

