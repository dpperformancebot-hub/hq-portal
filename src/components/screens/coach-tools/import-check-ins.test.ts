import { describe, expect, it } from "vitest";
import { parseCheckInPaste } from "./import-check-ins";

describe("parseCheckInPaste", () => {
  it("parses a copied Kahunas table with a header row (tab-separated)", () => {
    const text = [
      "Client Name\tEmail\tDate/Time\tSubmitted On\tCheck-in Day",
      "Jane Smith\tjane@x.com\t09:15\t14/07/2026\tMonday",
      "Bob O'Brien\tbob@x.com\t18:40\t15/07/2026\tTuesday",
    ].join("\n");
    const { rows, error } = parseCheckInPaste(text);
    expect(error).toBeUndefined();
    expect(rows).toEqual([
      { name: "Jane Smith", email: "jane@x.com", dateIso: "2026-07-14" },
      { name: "Bob O'Brien", email: "bob@x.com", dateIso: "2026-07-15" },
    ]);
  });

  it("parses headerless rows by classifying cells (email = @, date parses, name = rest)", () => {
    const { rows } = parseCheckInPaste("jane@x.com\tJane Smith\t2026-07-14\nMonday\tBob Jones\t14/07/2026");
    expect(rows).toEqual([
      { name: "Jane Smith", email: "jane@x.com", dateIso: "2026-07-14" },
      // Day names are never a date or a name.
      { name: "Bob Jones", email: null, dateIso: "2026-07-14" },
    ]);
  });

  it("skips rows without a name or without a date", () => {
    const { rows } = parseCheckInPaste("Client Name\tSubmitted On\nJane Smith\t\n\t14/07/2026\nOk Person\t14/07/2026");
    expect(rows).toEqual([{ name: "Ok Person", email: null, dateIso: "2026-07-14" }]);
  });

  it("errors on unusable input", () => {
    expect(parseCheckInPaste("   ").error).toMatch(/Nothing to parse/);
    expect(parseCheckInPaste("just some words").error).toMatch(/name \+ date/);
  });
});
