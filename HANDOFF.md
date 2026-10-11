# DP Performance HQ - Handoff (updated 12 Jun 2026)

Continuation file for the next Cowork/Claude session. Read this, then PROGRESS.md and CLAUDE.md. The original full-context handoff (9-11 Jun) still applies except where superseded below. Owner: Kai Fourie.

## WHAT IS NOW TRUE (since the last handoff)

M5 phase 1 is COMPLETE and LIVE:

1. Real data in GHL. Active+paused (423) AND cancelled history (377) imported into the DP sub-account (location R99JktDA6ajZeTWo4YPu) via CSV with the 16 custom fields. Zero messages sent (all workflows confirmed Draft before each import; they remain Draft, including Sales Pipeline). Smart lists exist per import batch for VA cross-check.
2. Live HQ in production. https://tjd-fit-hq-app.vercel.app runs on real GHL data. Read-only Private Integration token (scopes: View Contacts, View Opportunities, View Custom Fields) in .env.local + Vercel env only. NEXT_PUBLIC_DEMO_MODE=false in both. GHL date custom fields arrive as EPOCH MS (handled in src/lib/ghl/map.ts toIsoDate).
3. Password gate. Cookie-based (NOT Basic Auth; Chrome blocks that in iframes). /gate + /api/gate + middleware. HQ_ACCESS_PASSWORD env in .env.local + Vercel. Rotating it invalidates all sessions.
4. Embedded in GHL as native tabs. Middleware detects the iframe (Sec-Fetch-Dest, or ?embed=1) and the (hq) layout drops the HQ sidebar/topbar inside GHL. Agency Settings > Custom Menu Links hosts: DP DASHBOARD HQ (full portal) + Client Database, Client Journey, Coach Overview, Coach Performance, Financials (+ Renewals if Kai added it).
5. Live screens: Dashboard (time controls REAL: period toggle + ranges + compares sample true historical MRR via activeAt/endDate), Client Database (+detail incl live Billing tab), Pipeline (empty until opportunities exist), Client Journey, Coach Overview, Coach Performance (real per-coach lifetime retention/churn; adherence+response show "awaiting feed", Kahunas has no API), Financials (MRR/ARR/plan breakdown/payouts live; transactions/refunds await Stripe), NEW /renewals (re-sign call list, -7d..+45d window, the replacement for Dan's renewal tracker sheet).
6. Architecture: src/lib/ghl (API client + mapping) -> src/lib/live (async selectors mirroring seed shapes) -> src/lib/data.ts (demo/live facade) -> pages. Seed remains for demo mode and type contracts. Deploys are MANUAL: npx vercel --prod (project NOT connected to GitHub; connecting it is a nice-to-have).

## IMMEDIATE NEXT ITEM

Daily Digest on live data (src/app/(hq)/daily-digest, currently m4 seed): owner morning view with gained/lost, expiring this week, renewal calls due (reuse live getRenewals), paused count. Same facade pattern as other swaps.

## THEN (in rough order)

- VA data cleanup: ~14 active clients flipped to Cancelled by duplicate-email merges (list: import-exceptions.csv from the first session's outputs; also in GHL smart lists), and June-2026 clients with Unassigned coach.
- Real coach capacities from Dan (coach maxCapacity hardcoded default 30 in src/lib/ghl/map.ts COACH_DEFAULTS).
- Dan/Toby Loom feedback; resign-rate breakdown; payroll/commission rules; team discrepancy (Lilli/Lucas vs founders-close).
- Pipeline data: import opportunities into GHL (sales screens light up automatically; stage mapping done).
- M5 phase 2: Supabase persistence per DATA-MODEL.md (schema design = owner gate), then webhooks. Stripe cash feed = retainer phase. M6 auth (Clerk) + coach tools after.
- DATA-MODEL.md doc fix still pending: plan -> Billing/Check-in/PIF/Term wording (type already extended: Plan includes Monthly, Client has endDate/billingFrequency/weeklyRate/termLength).

## SECURITY / RULES (unchanged but critical)

- Secrets never in chat, git, Notion, or screenshots. Token + password live in .env.local and Vercel only. One token was exposed early and ROTATED; current one is clean. Delete any key still sitting in Apple Notes.
- All GHL workflows stay Draft until Dan/Toby sign off wording. NO client messaging without Kai's explicit go (strict rule #1).
- git locks: sandbox commits leave stale .git/*.lock files; clear with rm -f .git/HEAD.lock .git/index.lock before committing in Terminal.
- GHL settings pages and the workflows list are cross-origin iframes; Cowork browser clicks may not land there. Contacts/import works fine. Kai drives GHL settings clicks when needed.
- Kai working style: one step at a time, minimal words, he says "next". No em dashes. Australian spelling. Honest-partner stance; do not relitigate the settled architecture (HQ on Vercel, GHL source of truth, iframe embed).

## STATE OF THE NUMBERS (sanity reference)

~378 active / 24 paused / ~374 cancelled after merges. MRR ~$133-138k, lifetime retention ~50%. Coach roster: Amy, Angus (head), Damon, Darcy, Ella, Kate, Keri, Paul, Perry, Stephen. Renewals window typically ~65 clients.
