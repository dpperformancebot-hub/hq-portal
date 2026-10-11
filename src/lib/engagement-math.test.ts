import { describe, expect, it } from "vitest";
import { feedbackFormDue, milestoneState, milestoneWeeks } from "@/lib/engagement-math";

describe("milestoneWeeks", () => {
  it("is W14 only for non-PIF clients", () => {
    expect(milestoneWeeks(false, 40)).toEqual([14]);
  });
  it("adds every 16 weeks for PIF clients through the lookahead horizon", () => {
    expect(milestoneWeeks(true, 40)).toEqual([14, 30, 46]);
    expect(milestoneWeeks(true, 100)).toEqual([14, 30, 46, 62, 78, 94, 110]);
  });
  it("shows just the W14 milestone for brand-new clients", () => {
    expect(milestoneWeeks(true, 0)).toEqual([14]);
  });
  // R16-7b: per-brand cap on the PIF ladder (Dan's pending call).
  it("caps the ladder at milestoneCallsAfterWeek and leaves null = unlimited", () => {
    expect(milestoneWeeks(true, 100, 16, 30)).toEqual([14, 30]);
    expect(milestoneWeeks(true, 100, 16, 46)).toEqual([14, 30, 46]);
    expect(milestoneWeeks(true, 100, 16, null)).toEqual([14, 30, 46, 62, 78, 94, 110]);
    expect(milestoneWeeks(false, 100, 16, 30)).toEqual([14]);
  });
});

describe("milestoneState", () => {
  it("stored state wins", () => {
    expect(milestoneState(14, 5, "booked")).toBe("booked");
    expect(milestoneState(14, 50, "done")).toBe("done");
  });
  it("goes due 2 weeks ahead and stays due when passed", () => {
    expect(milestoneState(14, 11, undefined)).toBe("upcoming");
    expect(milestoneState(14, 12, undefined)).toBe("due");
    expect(milestoneState(14, 30, undefined)).toBe("due");
  });
});

describe("feedbackFormDue", () => {
  it("is due from week 3 until sent", () => {
    expect(feedbackFormDue(2, false)).toBe(false);
    expect(feedbackFormDue(3, false)).toBe(true);
    expect(feedbackFormDue(10, true)).toBe(false);
  });
});
