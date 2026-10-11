import { describe, expect, it } from "vitest";
import { displayClientName, nameNeedsAttention } from "./client-name";

describe("displayClientName (R12-3)", () => {
  it("strips the GHL funnel suffixes coaches complained about", () => {
    expect(displayClientName("angelique dimitriou (client)")).toBe("angelique dimitriou");
    expect(displayClientName("molly hayes (challenge)")).toBe("molly hayes");
    expect(displayClientName("Sam Jones (Challenge 2026)")).toBe("Sam Jones");
    expect(displayClientName("Kim Lee - personal")).toBe("Kim Lee");
  });
  it("handles stacked suffixes", () => {
    expect(displayClientName("Jane Doe (client) (challenge)")).toBe("Jane Doe");
  });
  it("leaves clean names untouched and is idempotent", () => {
    expect(displayClientName("Alannah Parfett")).toBe("Alannah Parfett");
    expect(displayClientName(displayClientName("molly hayes (challenge)"))).toBe("molly hayes");
  });
  it("never returns empty", () => {
    expect(displayClientName("")).toBe("Unknown");
    expect(displayClientName(null)).toBe("Unknown");
    expect(displayClientName("(client)")).toBe("(client)");
  });
});

describe("nameNeedsAttention (R12-3)", () => {
  it("flags names that are still irregular after cleaning", () => {
    expect(nameNeedsAttention("fotini")).toBe(true);          // no surname
    expect(nameNeedsAttention("client 2 [dup]")).toBe(true);  // brackets + digits
    expect(nameNeedsAttention("a@b.com")).toBe(true);         // an email, not a name
  });
  it("does not flag ordinary names, incl. ones we cleaned", () => {
    expect(nameNeedsAttention("Alannah Parfett")).toBe(false);
    expect(nameNeedsAttention("molly hayes (challenge)")).toBe(false);
  });
});
