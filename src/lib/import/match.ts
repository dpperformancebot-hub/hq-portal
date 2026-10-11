// Matching a spreadsheet row to a client. Strict precedence, and never a
// silent guess: the whole point of this importer is that it writes to clients
// the uploader already has, so a wrong match is worse than no match.
//
//   1. GHL contact id   exact, unambiguous by construction
//   2. email            normalised (gmail dots and +aliases collapse)
//   3. phone            normalised to AU national digits
//   4. name             EXACT after normalisation, within the uploader's scope
//
// A fuzzy name is never applied on its own. It is offered as "Is this X?" and
// only counts once the user ticks it. Two candidates at any step is ambiguous
// and the row is skipped.

export type Candidate = {
  id: string;
  name: string;
  coachId: string | null;
  ghlContactId: string | null;
  email: string | null;
  phone: string | null;
};

export const normName = (s: string | null | undefined): string =>
  String(s ?? "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]/g, "");

/** Gmail dots and +aliases are the same mailbox; everything else is literal. */
export function normEmail(s: string | null | undefined): string {
  const raw = String(s ?? "").trim().toLowerCase();
  const at = raw.lastIndexOf("@");
  if (at < 1) return "";
  let local = raw.slice(0, at);
  let domain = raw.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    // googlemail.com IS gmail.com. Without collapsing the domain too, the same
    // mailbox written two ways still reads as two different people.
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
}

/**
 * AU phone numbers to a comparable form. 0412 345 678, +61 412 345 678 and
 * 61412345678 are one number; anything that is not a plausible AU number
 * returns "" rather than a partial match on the last few digits.
 */
export function normPhone(s: string | null | undefined): string {
  let d = String(s ?? "").replace(/[^\d+]/g, "");
  if (!d) return "";
  d = d.replace(/^\+/, "");
  if (d.startsWith("0011")) d = d.slice(4);
  if (d.startsWith("61") && d.length >= 11) d = d.slice(2);
  d = d.replace(/^0+/, "");
  // AU mobiles are 4xxxxxxxx; landlines carry a 1-digit area code.
  if (d.length !== 9) return "";
  return d;
}

const bigrams = (s: string) => { const o: string[] = []; for (let i = 0; i < s.length - 1; i++) o.push(s.slice(i, i + 2)); return o; };
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a), B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const pool = [...B];
  let hit = 0;
  for (const g of A) { const i = pool.indexOf(g); if (i >= 0) { pool.splice(i, 1); hit++; } }
  return (2 * hit) / (A.length + B.length);
}

export const FUZZY_MIN = 0.78;

export type RowKeys = { ghlContactId?: string | null; email?: string | null; phone?: string | null; name?: string | null };

export type MatchResult =
  | { kind: "matched"; client: Candidate; by: "ghl_id" | "email" | "phone" | "name" }
  | { kind: "suggested"; client: Candidate; score: number }
  | { kind: "ambiguous"; by: string; candidates: Candidate[] }
  | { kind: "not_found" };

/** `pool` must already be narrowed to what the uploader may see, so a coach's
 *  name match can never resolve to another coach's client. */
export function matchRow(keys: RowKeys, pool: Candidate[]): MatchResult {
  const tryExact = (
    by: "ghl_id" | "email" | "phone" | "name",
    key: string,
    of: (c: Candidate) => string,
  ): MatchResult | null => {
    if (!key) return null;
    const hits = pool.filter((c) => of(c) === key);
    if (hits.length === 1) return { kind: "matched", client: hits[0], by };
    if (hits.length > 1) return { kind: "ambiguous", by, candidates: hits };
    return null;
  };

  return (
    tryExact("ghl_id", String(keys.ghlContactId ?? "").trim(), (c) => String(c.ghlContactId ?? "").trim()) ??
    tryExact("email", normEmail(keys.email), (c) => normEmail(c.email)) ??
    tryExact("phone", normPhone(keys.phone), (c) => normPhone(c.phone)) ??
    tryExact("name", normName(keys.name), (c) => normName(c.name)) ??
    fuzzyName(keys.name, pool)
  );
}

function fuzzyName(name: string | null | undefined, pool: Candidate[]): MatchResult {
  const key = normName(name);
  if (!key) return { kind: "not_found" };
  const scored = pool
    .map((c) => ({ c, score: similarity(key, normName(c.name)) }))
    .filter((x) => x.score >= FUZZY_MIN)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { kind: "not_found" };
  // Two near-equal candidates is a coin toss, so it is ambiguous rather than
  // a suggestion the user might tick without reading.
  if (scored.length > 1 && scored[1].score >= scored[0].score - 0.02) {
    return { kind: "ambiguous", by: "name", candidates: scored.slice(0, 3).map((x) => x.c) };
  }
  return { kind: "suggested", client: scored[0].c, score: scored[0].score };
}
