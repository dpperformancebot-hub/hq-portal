import { describe, expect, it } from "vitest";
import { BRANDS } from "@/lib/brand";

// Brand parity. The two brands ship from ONE codebase, so a feature added for
// DP reaches TJD only if TJD's config block has the key that gates it. A
// missing key does not fail the build, it silently turns the feature off on
// that brand, which is exactly the failure this file exists to catch.
//
// These read the BRANDS map directly rather than the resolved BRAND, so they
// hold whichever brand the process was built as.

const dp = BRANDS.dp;
const tjd = BRANDS.tjd;

/** Every key path in an object, so a missing nested key is caught too. */
const keyPaths = (o: unknown, prefix = ""): string[] => {
  if (o === null || typeof o !== "object" || Array.isArray(o)) return [prefix];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  );
};

describe("brand parity", () => {
  it("defines both brands", () => {
    expect(dp).toBeDefined();
    expect(tjd).toBeDefined();
  });

  it("gives TJD every config key DP has, so no DP feature is silently off", () => {
    const missing = keyPaths(dp).filter((k) => !keyPaths(tjd).includes(k));
    expect(missing).toEqual([]);
  });
});

describe("the brand-gated features are set the way each brand needs", () => {
  it("runs TJD on the weeks-paid pay model and DP on check-in codes", () => {
    expect(tjd.pay.model).toBe("weeks-paid");
    expect(dp.pay.model).toBe("checkin-codes");
  });

  it("keeps the academy full-access allowlist to DP", () => {
    expect(dp.academy.fullAccessCoachIds.length).toBeGreaterThan(0);
    expect(tjd.academy.fullAccessCoachIds).toEqual([]);
  });

  it("gives each brand its own identity, never a shared default", () => {
    expect(tjd.name).not.toBe(dp.name);
    expect(tjd.logoSrc).not.toBe(dp.logoSrc);
    expect(tjd.ownerEmail).not.toBe(dp.ownerEmail);
  });
});
