import { afterEach, describe, expect, it, vi } from "vitest";
import { PAY_RULES, payTreatment } from "./coach-config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PAY_RULES after the R16-2c code change", () => {
  it("pays MS, which carries the old SM/messaged behaviour", () => {
    expect(payTreatment("MS")).toBe("full");
    expect(payTreatment("ms")).toBe("full");
  });
  it("no longer knows SM, the retired code", () => {
    expect(PAY_RULES.SM).toBeUndefined();
  });
  it("leaves M (Missed) unmapped, pending the owner's decision", () => {
    expect(PAY_RULES.M).toBeUndefined();
  });
  it("keeps every settled code as it was", () => {
    expect(payTreatment("Y")).toBe("full");
    expect(payTreatment("F")).toBe("full");
    expect(payTreatment("G")).toBe("ghosted");
    expect(payTreatment("P")).toBe("none");
    expect(payTreatment("C")).toBe("none");
    expect(payTreatment("N")).toBe("none");
  });
});

describe("payTreatment on an unmapped code", () => {
  it("throws outside production, so a missing rule cannot ship unnoticed", () => {
    expect(() => payTreatment("M")).toThrow(/No pay rule for check-in code "M"/);
    expect(() => payTreatment("ZZ")).toThrow(/coach-config/);
  });
  it("in production pays nothing and warns instead of taking the pay screen down", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(payTreatment("M")).toBe("none");
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toMatch(/No pay rule for check-in code "M"/);
    warn.mockRestore();
  });
  it("treats an absent code as nothing to pay, never as an error", () => {
    expect(payTreatment(null)).toBe("none");
    expect(payTreatment(undefined)).toBe("none");
    expect(payTreatment("")).toBe("none");
    expect(payTreatment("   ")).toBe("none");
  });
});
