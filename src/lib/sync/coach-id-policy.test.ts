import { describe, expect, it } from "vitest";
import { decideCoachId } from "./coach-id-policy";

const coachNameByGhlId = new Map([["ghl-co-perry", "Perry"], ["ghl-co-ghost", "Ghost"]]);
const coachUuidByName = new Map([["Perry", "uuid-perry"], ["Angus", "uuid-angus"]]);
const base = { coachNameByGhlId, coachUuidByName };

describe("decideCoachId (R16-1 sync null bug)", () => {
  it("keeps the existing coach when the GHL Coach field is blank, and flags drift", () => {
    expect(decideCoachId({ ...base, ghlCoachId: null, existingCoachId: "uuid-angus" })).toEqual({
      coachId: "uuid-angus", drift: true, reason: "kept_existing_blank",
    });
  });
  it("keeps the existing coach when GHL names a coach that has no coaches row", () => {
    expect(decideCoachId({ ...base, ghlCoachId: "ghl-co-ghost", existingCoachId: "uuid-angus" })).toEqual({
      coachId: "uuid-angus", drift: true, reason: "kept_existing_unresolved",
    });
  });
  it("still lets a resolvable GHL coach win over the existing assignment", () => {
    expect(decideCoachId({ ...base, ghlCoachId: "ghl-co-perry", existingCoachId: "uuid-angus" })).toEqual({
      coachId: "uuid-perry", drift: false, reason: "ghl",
    });
  });
  it("leaves a brand-new row unassigned when GHL is blank (no drift: nothing was lost)", () => {
    expect(decideCoachId({ ...base, ghlCoachId: null, existingCoachId: undefined })).toEqual({ coachId: null, drift: false, reason: "none" });
    expect(decideCoachId({ ...base, ghlCoachId: null, existingCoachId: null })).toEqual({ coachId: null, drift: false, reason: "none" });
  });
  it("never returns null for a row that already has a coach", () => {
    for (const ghl of [null, "ghl-co-ghost", "ghl-co-perry"]) {
      expect(decideCoachId({ ...base, ghlCoachId: ghl, existingCoachId: "uuid-angus" }).coachId).not.toBeNull();
    }
  });
});

// R19-2c: removing a coach must survive the nightly sync. GHL contacts keep
// naming them (the dropdown option is deliberately left in place), so this is
// the only thing stopping a removal from undoing itself overnight.
describe("a DEACTIVATED coach is never resolvable", () => {
  const coachNameByGhlId = new Map([["ghl-co-nina", "Nina Hart"], ["ghl-co-sam", "Sam Reed"]]);
  // The sync builds this from ACTIVE coaches only, so Nina is simply absent.
  const coachUuidByName = new Map([["Sam Reed", "uuid-sam"]]);
  const inactiveCoachNames = new Set(["Nina Hart"]);

  it("keeps the client with the coach they were MOVED to, not the removed one", () => {
    const d = decideCoachId({
      ghlCoachId: "ghl-co-nina",
      existingCoachId: "uuid-sam",
      coachNameByGhlId,
      coachUuidByName,
      inactiveCoachNames,
    });
    expect(d.coachId).toBe("uuid-sam");
    expect(d.drift).toBe(true);
    expect(d.reason).toBe("kept_existing_inactive_coach");
    expect(d.inactiveCoachName).toBe("Nina Hart");
  });

  it("never attaches a NEW client to a removed coach", () => {
    const d = decideCoachId({
      ghlCoachId: "ghl-co-nina",
      existingCoachId: null,
      coachNameByGhlId,
      coachUuidByName,
      inactiveCoachNames,
    });
    expect(d.coachId).toBeNull();
    // Still drift: an unassigned client whose GHL field names a removed coach
    // is precisely what the VA has to go and fix.
    expect(d.drift).toBe(true);
    expect(d.inactiveCoachName).toBe("Nina Hart");
  });

  it("tells a removed coach apart from a typo, because they are different jobs", () => {
    const typo = decideCoachId({
      ghlCoachId: "ghl-co-ghost",
      existingCoachId: "uuid-sam",
      coachNameByGhlId: new Map([["ghl-co-ghost", "Nnia Hart"]]),
      coachUuidByName,
      inactiveCoachNames,
    });
    expect(typo.reason).toBe("kept_existing_unresolved");
    expect(typo.inactiveCoachName).toBeUndefined();
  });

  it("still lets an ACTIVE coach named in GHL win", () => {
    const d = decideCoachId({
      ghlCoachId: "ghl-co-sam",
      existingCoachId: null,
      coachNameByGhlId,
      coachUuidByName,
      inactiveCoachNames,
    });
    expect(d.coachId).toBe("uuid-sam");
    expect(d.drift).toBe(false);
  });
});
