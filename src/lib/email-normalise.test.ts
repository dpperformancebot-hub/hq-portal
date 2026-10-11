import { describe, expect, it } from "vitest";
import { emailsMatch, nameKey, normaliseEmail } from "./email-normalise";

describe("normaliseEmail (R13-3)", () => {
  it("trims and lowercases", () => {
    expect(normaliseEmail("  Keri.Iwata@Example.com ")).toBe("keri.iwata@example.com");
  });
  it("strips gmail dots and plus-aliases, folds googlemail", () => {
    expect(normaliseEmail("Keri.Iwata+dp@gmail.com")).toBe("keriiwata@gmail.com");
    expect(normaliseEmail("keriiwata@googlemail.com")).toBe("keriiwata@gmail.com");
  });
  it("keeps dots on non-gmail domains but still strips plus-aliases", () => {
    expect(normaliseEmail("keri.iwata+hq@outlook.com")).toBe("keri.iwata@outlook.com");
  });
  it("leaves junk alone rather than throwing", () => {
    expect(normaliseEmail("")).toBe("");
    expect(normaliseEmail(null)).toBe("");
    expect(normaliseEmail("not-an-email")).toBe("not-an-email");
  });
});

describe("emailsMatch", () => {
  it("matches the same gmail mailbox written three ways", () => {
    expect(emailsMatch("keri.iwata3201@gmail.com", "KeriIwata3201+x@gmail.com")).toBe(true);
  });
  it("never matches two empties", () => {
    expect(emailsMatch("", "")).toBe(false);
  });
  it("does not cross domains", () => {
    expect(emailsMatch("a@gmail.com", "a@outlook.com")).toBe(false);
  });
});

describe("nameKey", () => {
  it("collapses punctuation, case and accents", () => {
    expect(nameKey("Keri-Ann Iwata")).toBe("kerianniwata");
    expect(nameKey("keri ann iwata")).toBe("kerianniwata");
    expect(nameKey("José Núñez")).toBe("josenunez");
  });
});
