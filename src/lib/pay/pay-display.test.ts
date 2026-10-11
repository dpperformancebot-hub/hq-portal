import { describe, expect, it } from "vitest";
import { BRANDS } from "@/lib/brand";
import { payDisplayFor } from "@/lib/pay/pay-display";

describe("payDisplayFor", () => {
  it("shows bonuses on DP, at the brand's own numbers", () => {
    const d = payDisplayFor(BRANDS.dp.pay);
    expect(d.hasBonuses).toBe(true);
    expect(d.setupBonus).toBe(50);
    expect(d.retentionPer10Weeks).toBe(50);
  });

  it("hides every bonus element on TJD", () => {
    const d = payDisplayFor(BRANDS.tjd.pay);
    expect(d.hasBonuses).toBe(false);
  });

  it("hides them when both bonuses are zero, whatever the model", () => {
    const pay = { ...BRANDS.dp.pay, setupBonus: 0, retentionBonusPer10Weeks: 0 };
    expect(payDisplayFor(pay).hasBonuses).toBe(false);
  });

  it("hides them on the weeks-paid model even if a bonus number is left set", () => {
    // Guards the case where someone fills a rate card in and leaves a stale
    // bonus behind: the model, not the leftover number, decides.
    const pay = { ...BRANDS.tjd.pay, setupBonus: 50, retentionBonusPer10Weeks: 50 };
    expect(payDisplayFor(pay).hasBonuses).toBe(false);
  });

  it("still shows them when only one of the two is set", () => {
    expect(payDisplayFor({ ...BRANDS.dp.pay, setupBonus: 0 }).hasBonuses).toBe(true);
    expect(payDisplayFor({ ...BRANDS.dp.pay, retentionBonusPer10Weeks: 0 }).hasBonuses).toBe(true);
  });
});
