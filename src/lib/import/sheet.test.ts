import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { cellStr, gridFromBuffer, looksLikeCheckInLog, parseAuDate } from "@/lib/import/sheet";

const book = (rows: unknown[][], type: "xlsx" | "csv") => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: type }) as ArrayBuffer);
};

describe("dates, day-first and never guessed", () => {
  it("reads dd/mm/yyyy", () => {
    expect(parseAuDate("03/04/2026")).toEqual({ ok: true, iso: "2026-04-03" });
    expect(parseAuDate("13/04/2026")).toEqual({ ok: true, iso: "2026-04-13" });
  });

  it("refuses a month-first date and says why, rather than swapping it", () => {
    const r = parseAuDate("04/13/2026");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/month-first/i);
  });

  it("refuses a date that does not exist", () => {
    expect(parseAuDate("31/02/2026").ok).toBe(false);
  });

  it("reads ISO and real Date cells", () => {
    expect(parseAuDate("2026-04-03")).toEqual({ ok: true, iso: "2026-04-03" });
    expect(parseAuDate(new Date(2026, 3, 3))).toEqual({ ok: true, iso: "2026-04-03" });
  });

  it("reads an Excel serial, but not a number that is plainly a price", () => {
    expect(parseAuDate(46115)).toEqual({ ok: true, iso: "2026-04-03" });
    expect(parseAuDate(250).ok).toBe(false); // a $250 rate is not 1900
  });

  it("treats an empty cell as absent, not as an error to shout about", () => {
    expect(parseAuDate("")).toEqual({ ok: false, reason: "empty" });
    expect(parseAuDate(null)).toEqual({ ok: false, reason: "empty" });
  });
});

describe("xlsx and csv are the same file to this importer", () => {
  const rows = [
    ["Client Name", "Email", "Start Date", "Cadence", "Notes"],
    ["Mara Lin", "mara@example.com", "05/01/2026", "Weekly", "likes mornings"],
    ["Sam Reed", "sam@example.com", "12/02/2026", "Fortnightly", ""],
  ];

  it("produces identical text for every cell", () => {
    const x = gridFromBuffer(book(rows, "xlsx")).grid.map((r) => r.map(cellStr));
    const c = gridFromBuffer(book(rows, "csv"), { csv: true }).grid.map((r) => r.map(cellStr));
    expect(x).toEqual(c);
    expect(x[1][0]).toBe("Mara Lin");
  });

  it("parses the same dates from both", () => {
    const x = gridFromBuffer(book(rows, "xlsx")).grid;
    const c = gridFromBuffer(book(rows, "csv"), { csv: true }).grid;
    expect(parseAuDate(x[1][2])).toEqual(parseAuDate(c[1][2]));
    expect(parseAuDate(x[1][2])).toEqual({ ok: true, iso: "2026-01-05" });
  });
});

describe("the CSV date trap", () => {
  // Guards the bug this nearly shipped with: SheetJS reads CSV dates
  // month-first, so the same sheet saved as .csv instead of .xlsx would have
  // moved every Australian start date by months, silently.
  it("keeps a CSV date as text so the AU parser decides, not the library", () => {
    const c = gridFromBuffer(book([["Start Date"], ["05/01/2026"]], "csv"), { csv: true }).grid;
    expect(typeof c[1][0]).toBe("string");
    expect(parseAuDate(c[1][0])).toEqual({ ok: true, iso: "2026-01-05" });
  });

  it("never hands a Date object out, from either format", () => {
    // Timezone safety. SheetJS builds a Date at LOCAL midnight, which is the
    // previous day in UTC, so the same file parsed to different days on a
    // Sydney laptop and a UTC server. Serials and strings have no such
    // ambiguity, so neither path produces a Date any more.
    for (const type of ["xlsx", "csv"] as const) {
      const g = gridFromBuffer(book([["Start Date"], ["05/01/2026"]], type), { csv: type === "csv" }).grid;
      expect(g[1][0]).not.toBeInstanceOf(Date);
      expect(parseAuDate(g[1][0])).toEqual({ ok: true, iso: "2026-01-05" });
    }
  });

  it("reads a REAL Excel date cell as the day it shows, whatever the server TZ", () => {
    // Written as a Date, which Excel stores as a serial. The round trip must
    // land on 5 January, not 4 January on a UTC box.
    const g = gridFromBuffer(book([["Start Date"], [new Date(2026, 0, 5)]], "xlsx")).grid;
    expect(parseAuDate(g[1][0])).toEqual({ ok: true, iso: "2026-01-05" });
  });
});

describe("sending a check-in log to the right importer", () => {
  it("recognises one by its tab name", () => {
    expect(looksLikeCheckInLog([], ["Check Ins", "Pay"])).toBe(true);
  });

  it("recognises one by a Client header followed by week dates", () => {
    const grid = [["Client", "Start", "03/08/2026", "10/08/2026", "17/08/2026", "24/08/2026"]];
    expect(looksLikeCheckInLog(grid, ["Sheet1"])).toBe(true);
  });

  it("does not mistake a client import for one", () => {
    const grid = [["Client Name", "Email", "Start Date", "Cadence"], ["Mara Lin", "m@e.com", "05/01/2026", "Weekly"]];
    expect(looksLikeCheckInLog(grid, ["Sheet1"])).toBe(false);
  });
});
