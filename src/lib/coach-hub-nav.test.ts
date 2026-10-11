import { describe, expect, it } from "vitest";
import { getDefaultRoute, getNavGroupsFor, visibleSlugsFor } from "@/lib/navigation";
import { HANDBOOK_SECTIONS, handbookHref } from "@/lib/coach-content/handbook";

// DP coach hub (owner decision 2026-10-11): plain coaches get a slim nav,
// head coaches keep their full toolset plus the hub. Suite is pinned to DP.
describe("DP coach hub nav", () => {
  it("a plain coach sees only the hub", () => {
    expect([...visibleSlugsFor({ role: "coach" })].sort()).toEqual(
      ["academy", "calculators", "home", "quizzes", "recipes", "resources", "sops", "start-here"].sort(),
    );
    expect(getDefaultRoute("coach")).toBe("/home");
  });

  it("a head coach keeps the full toolset and oversight, with no duplicate items", () => {
    const slugs = getNavGroupsFor({ role: "coach", isHeadCoach: true }).flatMap((g) => g.items.map((i) => i.slug));
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of ["home", "start-here", "dashboard", "my-clients", "check-ins", "onboarding", "coach-performance"]) {
      expect(slugs).toContain(s);
    }
  });
});

describe("coach handbook content", () => {
  it("every page id is unique and every page: link resolves", () => {
    const ids = HANDBOOK_SECTIONS.flatMap((s) => s.pages.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    const text = JSON.stringify(HANDBOOK_SECTIONS);
    for (const m of text.matchAll(/\]\(page:([a-z0-9-]+)\)/g)) {
      expect(ids, `page:${m[1]}`).toContain(m[1]);
      expect(handbookHref(`page:${m[1]}`)).toMatch(/^\/(start-here|sops)\?p=/);
    }
  });
});
