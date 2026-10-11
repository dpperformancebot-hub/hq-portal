import { describe, expect, it } from "vitest";
import { ACADEMY_MODULES } from "@/lib/coach-content/academy";
import { BRAND } from "@/lib/brand";
import { hasFullAcademyAccess, unlockedFrom, unlockedModulesFor } from "./academy-gating";

// Tests run on the default brand (dp), whose allowlist holds Angus only.
const ANGUS = "a8b305b6-b018-40ae-a650-0ccffa77e422";
const NORMAL_COACH = "9838bd39-b69a-4d9a-814b-f9dc23ad091e"; // Darcy
const ALL_MODULE_IDS = ACADEMY_MODULES.map((m) => m.id);
const lessonsOf = (moduleId: string) => ACADEMY_MODULES.find((m) => m.id === moduleId)!.lessons.map((l) => l.id);
const LAST_MODULE = ACADEMY_MODULES[ACADEMY_MODULES.length - 1];

describe("the DP allowlist", () => {
  it("holds Angus's coach id and nobody else", () => {
    expect(BRAND.academy.fullAccessCoachIds).toEqual([ANGUS]);
  });
  it("recognises only that id", () => {
    expect(hasFullAcademyAccess(ANGUS)).toBe(true);
    expect(hasFullAcademyAccess(NORMAL_COACH)).toBe(false);
    expect(hasFullAcademyAccess(null)).toBe(false);
    expect(hasFullAcademyAccess(undefined)).toBe(false);
    expect(hasFullAcademyAccess("")).toBe(false);
  });
});

describe("unlockedModulesFor: allowlisted coach (R16-8)", () => {
  it("sees every module with nothing completed", () => {
    expect(unlockedModulesFor(ANGUS, new Set())).toEqual(ALL_MODULE_IDS);
    expect(ALL_MODULE_IDS.length).toBeGreaterThan(1);
  });
  it("can tick a lesson in the LAST module without finishing the earlier ones", () => {
    // This is the guard setLessonCompleteAction runs before writing.
    const unlocked = unlockedModulesFor(ANGUS, new Set());
    expect(unlocked).toContain(LAST_MODULE.id);
  });
  it("still sees every module once part-way through, so access never narrows", () => {
    expect(unlockedModulesFor(ANGUS, new Set(lessonsOf(ALL_MODULE_IDS[0])))).toEqual(ALL_MODULE_IDS);
  });
});

describe("unlockedModulesFor: everyone else is unchanged", () => {
  it("starts on module 1 only", () => {
    expect(unlockedModulesFor(NORMAL_COACH, new Set())).toEqual([ALL_MODULE_IDS[0]]);
  });
  it("is blocked from the last module, so the tick guard refuses it", () => {
    expect(unlockedModulesFor(NORMAL_COACH, new Set())).not.toContain(LAST_MODULE.id);
  });
  it("earns module 2 by finishing module 1, and no further", () => {
    const done = new Set(lessonsOf(ALL_MODULE_IDS[0]));
    expect(unlockedModulesFor(NORMAL_COACH, done)).toEqual(ALL_MODULE_IDS.slice(0, 2));
  });
  it("matches the sequential rule exactly for a non-allowlisted coach", () => {
    for (const done of [new Set<string>(), new Set(lessonsOf(ALL_MODULE_IDS[0]))]) {
      expect(unlockedModulesFor(NORMAL_COACH, done)).toEqual(unlockedFrom(done));
      expect(unlockedModulesFor(null, done)).toEqual(unlockedFrom(done));
    }
  });
  it("a gap still locks everything after it", () => {
    // Module 2 finished but module 1 left incomplete: module 3 stays locked.
    const done = new Set(lessonsOf(ALL_MODULE_IDS[1]));
    expect(unlockedModulesFor(NORMAL_COACH, done)).toEqual([ALL_MODULE_IDS[0]]);
  });
});
