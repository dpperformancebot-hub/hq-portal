// R12-3 (Dan's walkthrough): client display names. GHL contact names carry
// operational suffixes the coaches never want to read - "(client)",
// "(challenge)", "personal", stray trailing punctuation - because the sales
// and challenge funnels tag people in the NAME field. We clean at DISPLAY
// time only: the underlying GHL name is left alone so the sync, name-matching
// and any GHL-side search keep working on the real value.

const JUNK_PAREN = /\s*\((client|challenge|personal|pt|online|new)\b[^)]*\)\s*$/i;
const JUNK_TRAIL = /\s*[-–—]\s*(client|challenge|personal)\s*$/i;

/** Human display name for a client. Idempotent and safe on any input. */
export function displayClientName(raw: string | null | undefined): string {
  let s = (raw ?? "").trim();
  if (!s) return "Unknown";
  let prev = "";
  // Repeat: a few records carry two suffixes, e.g. "Jane (client) (challenge)".
  while (s !== prev) {
    prev = s;
    s = s.replace(JUNK_PAREN, "").replace(JUNK_TRAIL, "").trim();
  }
  s = s.replace(/\s{2,}/g, " ").replace(/[,;]+$/, "").trim();
  return s || (raw ?? "").trim();
}

/** True when the raw name still looks irregular AFTER cleaning, so the UI can
 *  flag it for a manual fix in GHL rather than pretending it is tidy:
 *  leftover brackets, digits, emails, or a single word (no surname). */
export function nameNeedsAttention(raw: string | null | undefined): boolean {
  const cleaned = displayClientName(raw);
  if (!cleaned || cleaned === "Unknown") return true;
  if (/[()\[\]{}<>@]|\d/.test(cleaned)) return true;
  return cleaned.split(/\s+/).length < 2;
}
