import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import type { ServerIdentity } from "@/lib/role-server";

// The unit suite compiles .tsx with the classic JSX runtime; the page module
// needs React on the global.
(globalThis as unknown as { React: typeof React }).React = React;

// "Owner review" on audit cards (R4-5) is the owner/admin's spot-review OF
// the coach: never a coach control. DP (Brand.viewAsIsExactCoachView = false): coaches and head coaches never
// get it; the real owner keeps it while viewing as a coach (unchanged DP
// behaviour); owner and admin acting as themselves get it.

const h = vi.hoisted(() => ({
  identity: null as unknown as ServerIdentity,
  persistence: false,
}));

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

describe("DP: Owner review on client audits", () => {
  it("coach and head coach: hidden and refused", async () => {
    for (const id of [COACH, HEAD_COACH]) {
      expect(canOwnerReviewAudits(id)).toBe(false);
      expect((await renderPage(id)).canOwnerReview).toBe(false);
      h.persistence = true;
      expect(await review(id)).toMatchObject({ ok: false, error: expect.stringMatching(/owner or admin only/) });
      h.persistence = false;
    }
  });

  it("owner and admin as themselves: shown and allowed past the guard", async () => {
    for (const id of [OWNER, ADMIN]) {
      expect((await renderPage(id)).canOwnerReview).toBe(true);
      expect(await review(id)).toMatchObject({ ok: false, error: expect.stringMatching(/HQ_PERSISTENCE=true/) });
    }
  });

  it("owner viewing as a coach keeps it on DP (brand-safe, unchanged)", async () => {
    expect(canOwnerReviewAudits(OWNER_AS_COACH)).toBe(true);
    expect((await renderPage(OWNER_AS_COACH)).canOwnerReview).toBe(true);
    expect((await renderPage(OWNER_AS_HEAD_COACH)).canOwnerReview).toBe(true);
  });

  it("the same identity is refused when the brand says view-as is exactly the coach view", () => {
    expect(canOwnerReviewAudits(OWNER_AS_COACH, true)).toBe(false);
    expect(canOwnerReviewAudits(OWNER, true)).toBe(true);
    expect(canOwnerReviewAudits(ADMIN, true)).toBe(true);
  });
});

