// R13-3: email normalisation for invite matching. A coach who was invited
// as "Keri.Iwata@gmail.com" and signs up as "keriiwata+dp@gmail.com" is the
// same mailbox: Gmail ignores dots and everything after "+" in the local
// part, and googlemail.com is an alias of gmail.com. Plus-aliases are
// stripped for every domain (they are always the same mailbox); dot
// stripping is Gmail-only because other providers treat dots as distinct.
//
// Pure, no I/O: unit-tested in email-normalise.test.ts.

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

export function normaliseEmail(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toLowerCase();
  const at = s.lastIndexOf("@");
  if (at <= 0) return s;
  let local = s.slice(0, at);
  let domain = s.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
}

/** True when two addresses resolve to the same mailbox after normalisation. */
export function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normaliseEmail(a);
  const nb = normaliseEmail(b);
  return na.length > 0 && na === nb;
}

/** Loose person-name key for the ADMIN-FACING coach suggestion (never a
 *  grant by itself): lowercase, letters only, so "Keri-Ann Iwata" and
 *  "keri ann iwata" agree. */
export function nameKey(raw: string | null | undefined): string {
  return (raw ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}
