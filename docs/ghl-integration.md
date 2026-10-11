# GHL integration (M5)

The HQ reads GoHighLevel through a Private Integration token. GHL stays the
source of truth; the HQ is a read-only projection (see OWNERSHIP BOUNDARY in
BUILD-SPEC.md).

## Token

- Created in the DP sub-account: Settings, Private Integrations, "DP HQ Sync".
- Scopes (read-only): View Contacts, View Opportunities, View Custom Fields.
- Stored ONLY in `.env.local` (gitignored) and Vercel env vars. Never in git,
  chat, or Notion. Rotate from the same GHL screen if exposed.

## Env

| Var | Meaning |
|---|---|
| `GHL_API_TOKEN` | Private Integration token (server-side only). |
| `GHL_LOCATION_ID` | Sub-account id. Defaults to the DP build (`R99JktDA6ajZeTWo4YPu`); override per brand. |
| `NEXT_PUBLIC_DEMO_MODE` | `false` switches the swapped screens to live GHL data and hides the demo badge. Any other value (or unset) keeps seed data. |

## How data flows (phase 1, polling)

1. `src/lib/ghl/client.ts` calls the GHL API v2 (`services.leadconnectorhq.com`,
   Version `2021-07-28`), cached 5 minutes via the Next.js data cache.
2. `src/lib/ghl/map.ts` maps contacts (16 DP custom fields) onto the app's
   `Client`/`Coach` contracts and opportunities onto `Lead`. Contacts without a
   `Status` custom field are not roster clients and are skipped.
3. `src/lib/live/index.ts` exposes the same selector shapes as the seed layer.
4. `src/lib/data.ts` is the facade: demo mode serves seed, live mode serves GHL.

MRR maths: `monthlyRate = weeklyRate x 52 / 12`. PIF carries the same
weekly-equivalent inside its term. Re-sign tracking keys off active weeks.

## Swapped to live so far

- Dashboard (owner)
- Client Database (list + detail)

Other screens still read seed directly; swap them through `src/lib/data.ts`.

## Not live yet (rendered as zeros/empty, never faked)

- Check-ins: live in Kahunas, which has no public API. Start fresh from go-live.
- Cash collected / payment history: Stripe feed, retainer phase. The dashboard
  shows the MRR run-rate as the 30d estimate, commented in code.
- Coach retention/churn + sales leaderboard: need cancelled-client history and
  lead-owner mapping (GHL gap G1).
- Tasks, audits, transformations, social stats: HQ-native (Supabase phase) or
  deferred feeds.

## Phase 2 (next)

- Supabase persistence per DATA-MODEL.md, then webhooks for live updates.
- Import the cancelled-client CSV into GHL to power retention/churn.
