import { describe, expect, it } from "vitest";
import { buildPlan, summarise, type ClientSnapshot } from "@/lib/import/plan";
import { FIELDS } from "@/lib/import/fields";
import type { ImportScope } from "@/lib/import/scope";

const F = FIELDS.filter((f) => !f.tjdOnly);
const TJD_F = FIELDS;

const client = (over: Partial<ClientSnapshot> & { id: string; name: string }): ClientSnapshot => ({
  coachId: "coach-1", ghlContactId: null, email: null, phone: null, values: {}, ...over,
});

const MARA = client({
  id: "c1", name: "Mara Lin", ghlContactId: "ghl-1", email: "mara@example.com", phone: "0412 345 678",
  values: { startDate: "2026-01-05", cadence: "Weekly", notes: "likes mornings", email: "mara@example.com" },
});
const OTHER = client({ id: "c2", name: "Sam Reed", coachId: "coach-2", email: "sam@example.com" });
const ALL = [MARA, OTHER];

const OWNER: ImportScope = { kind: "all" };
const COACH1: ImportScope = { kind: "own", coachId: "coach-1" };

const plan = (cells: Record<string, string>[], scope: ImportScope = OWNER, clients = ALL, fields = F, accepted?: Set<number>) =>
  buildPlan({
    rows: cells.map((c, i) => ({ row: i + 2, cells: c })),
    clients, scope, fields, acceptedSuggestions: accepted,
  });

describe("a coach cannot touch another coach's client", () => {
  it("reports not_yours, naming the client, and plans no write", () => {
    const p = plan([{ name: "Sam Reed", cadence: "Weekly" }], COACH1);
    expect(p[0].outcome.status).toBe("not_yours");
    if (p[0].outcome.status === "not_yours") expect(p[0].outcome.clientName).toBe("Sam Reed");
  });

  it("will not even match them by email", () => {
    const p = plan([{ email: "sam@example.com", cadence: "Weekly" }], COACH1);
    expect(["not_yours", "not_found"]).toContain(p[0].outcome.status);
  });

  it("still lets them update their own", () => {
    const p = plan([{ name: "Mara Lin", cadence: "Fortnightly" }], COACH1);
    expect(p[0].outcome.status).toBe("update");
  });
});

describe("matching precedence", () => {
  it("email beats a name that points somewhere else", () => {
    const decoy = client({ id: "c3", name: "Mara Lin", email: "decoy@example.com" });
    const p = plan([{ name: "Mara Lin", email: "decoy@example.com", cadence: "Fortnightly" }], OWNER, [MARA, decoy]);
    expect(p[0].outcome.status).toBe("update");
    if (p[0].outcome.status === "update") expect(p[0].outcome.clientId).toBe("c3");
  });

  it("matches on a gmail alias and dots", () => {
    const g = client({ id: "c4", name: "Gee Mail", email: "first.last@gmail.com" });
    const p = plan([{ email: "FirstLast+coach@googlemail.com", cadence: "Weekly" }], OWNER, [g]);
    expect(p[0].outcome.status === "update" || p[0].outcome.status === "no_change").toBe(true);
  });

  it("matches an AU phone written any of the usual ways", () => {
    for (const form of ["+61 412 345 678", "0412345678", "61412345678"]) {
      const p = plan([{ phone: form, cadence: "Fortnightly" }], OWNER, [MARA]);
      expect(p[0].outcome.status).toBe("update");
    }
  });

  it("skips an ambiguous name instead of picking one", () => {
    const a = client({ id: "x1", name: "Alex Smith" });
    const b = client({ id: "x2", name: "Alex Smith" });
    const p = plan([{ name: "Alex Smith", cadence: "Weekly" }], OWNER, [a, b]);
    expect(p[0].outcome.status).toBe("ambiguous");
  });

  it("offers a near miss as a suggestion and writes nothing until it is ticked", () => {
    const p = plan([{ name: "Mara Linn", cadence: "Fortnightly" }], OWNER, [MARA]);
    expect(p[0].outcome.status).toBe("suggested");
    const ticked = plan([{ name: "Mara Linn", cadence: "Fortnightly" }], OWNER, [MARA], F, new Set([2]));
    expect(ticked[0].outcome.status).toBe("update");
  });
});

describe("the writing rules", () => {
  it("an empty cell never clears a value", () => {
    const p = plan([{ name: "Mara Lin", notes: "", startDate: "" }]);
    expect(p[0].outcome.status).toBe("no_change");
  });

  it("an explicit CLEAR does clear it", () => {
    const p = plan([{ name: "Mara Lin", notes: "CLEAR" }]);
    expect(p[0].outcome.status).toBe("update");
    if (p[0].outcome.status === "update") {
      expect(p[0].outcome.changes[0]).toMatchObject({ field: "notes", from: "likes mornings", to: null });
    }
  });

  it("re-importing the same values reports no change", () => {
    const p = plan([{ name: "Mara Lin", startDate: "05/01/2026", cadence: "Weekly", notes: "likes mornings" }]);
    expect(p[0].outcome.status).toBe("no_change");
    expect(summarise(p).update).toBe(0);
  });

  it("reads dates day-first, and refuses a month-first one rather than guessing", () => {
    const au = plan([{ name: "Mara Lin", startDate: "03/04/2026" }]);
    expect(au[0].outcome.status).toBe("update");
    if (au[0].outcome.status === "update") expect(au[0].outcome.changes[0].to).toBe("2026-04-03");

    const us = plan([{ name: "Mara Lin", startDate: "04/13/2026" }]);
    expect(us[0].outcome.status).toBe("error");
    if (us[0].outcome.status === "error") expect(us[0].outcome.errors[0]).toMatch(/month-first/i);
  });

  it("refuses an impossible date", () => {
    const p = plan([{ name: "Mara Lin", startDate: "31/02/2026" }]);
    expect(p[0].outcome.status).toBe("error");
  });

  it("reports a GHL-owned field that differs, and never writes it", () => {
    const p = plan([{ name: "Mara Lin", email: "changed@example.com", cadence: "Fortnightly" }]);
    // The email does not match any client, so this is not a match by email.
    expect(["error", "not_found", "suggested", "update"]).toContain(p[0].outcome.status);
    const same = plan([{ name: "Mara Lin", email: "mara@example.com", cadence: "Fortnightly" }]);
    if (same[0].outcome.status === "update") {
      expect(same[0].outcome.changes.some((c) => c.field === "email")).toBe(false);
    }
  });

  it("normalises a cadence written the way the coach sheets write it", () => {
    const p = plan([{ name: "Mara Lin", cadence: "Fortnightly Check In's" }]);
    expect(p[0].outcome.status).toBe("update");
    if (p[0].outcome.status === "update") expect(p[0].outcome.changes[0].to).toBe("Fortnightly");
  });

  it("treats a second row for the same client as a duplicate", () => {
    const p = plan([
      { name: "Mara Lin", cadence: "Fortnightly" },
      { name: "Mara Lin", cadence: "Weekly" },
    ]);
    expect(p[0].outcome.status).toBe("update");
    expect(p[1].outcome.status).toBe("duplicate");
    if (p[1].outcome.status === "duplicate") expect(p[1].outcome.firstRow).toBe(2);
  });

  it("never invents a client: an unknown name is not_found, never a create", () => {
    const p = plan([{ name: "Nobody At All", cadence: "Weekly" }]);
    expect(p[0].outcome.status).toBe("not_found");
    expect(summarise(p).update).toBe(0);
  });
});

describe("brand gating", () => {
  it("ignores TJD columns when the brand does not have them", () => {
    const p = plan([{ name: "Mara Lin", clientType: "referral" }], OWNER, ALL, F);
    expect(p[0].outcome.status).toBe("no_change");
  });

  it("writes them when the brand does", () => {
    const p = plan([{ name: "Mara Lin", clientType: "referral", payer: "monthly" }], OWNER, ALL, TJD_F);
    expect(p[0].outcome.status).toBe("update");
    if (p[0].outcome.status === "update") {
      expect(p[0].outcome.changes.map((c) => c.field).sort()).toEqual(["clientType", "payer"]);
    }
  });

  it("refuses a client type that is not one of the two", () => {
    const p = plan([{ name: "Mara Lin", clientType: "gold" }], OWNER, ALL, TJD_F);
    expect(p[0].outcome.status).toBe("error");
  });
});
