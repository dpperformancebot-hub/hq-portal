# Coach-portal feature gaps, 2026-07-02

What Dan's original portal (dpperformancebot-hub/coach-portal, last fetched
commit 0d8f304, 2026-04-27) has that the HQ does not. Verified against HQ code
at HEAD, not just docs. Caveat: the local clone is the Apr 27 snapshot; if Dan
pushed to GitHub after that, those changes are not covered.

## Real gaps (portal has it, HQ does not)

1. **Week-grid check-in spreadsheet.** Portal's core view: frozen client
   columns + 12 scrolling week columns of status codes (S/Y/D/M/SM/...),
   auto-scroll to current week, arrow-key row navigation, By Priority / By
   Day / By Start Date sorts. HQ's Check-ins screen is a filterable feed
   instead (deliberate redesign, but the grid is genuinely more scannable for
   a coach working a week).
2. **Pay Log color-coded week grid.** Portal has a per-client week-by-week pay
   spreadsheet (green full / yellow 50% / red $0 / P paused) with a totals
   row. HQ My Pay has the ledger, invoice modal and period selector, but not
   the color-coded week grid.
3. **"Pending bonuses" card on My Pay** (clients within 4 weeks of their next
   $50 retention milestone + the dollar value at stake).
4. **Clients-at-risk / "waiting on reply" urgency** on the coach dashboard
   (driven by last-message timestamps). Data depends on the GHL inbox feed,
   so this becomes buildable once Dan connects WhatsApp/IG.
5. **Per-client operational fields in the detail panel:** check-in
   day-of-week picker, Weekly/Fortnightly plan toggle, transformation-photo
   yes/no, post-approval (pending/approved/denied), Loom URL field, and the
   "Last Program Date" picker that fires the $50 onboarding bonus once.
   Some of this data exists in HQ seeds/DB; the editing UI does not.
6. **Quiz runner polish:** 100%-pass requirement with retry-only-missed
   questions, attempt counter, timer, intro screen. HQ scores quizzes but has
   none of the retry flow.
7. **Custom recipes** (coach adds their own recipes; portal stored them in
   localStorage). HQ recipes have search but are a fixed list.
8. **The other ~19 SOPs** (known: they live only on the external
   sop-library-six.vercel.app; owner must export the text).
9. **Client audit extras:** audit rating + start/current weight on the audit
   cards (known; needs a small owner-approved migration).

## Portal features intentionally NOT ported

- Mock messaging tab and bulk-send panel (HQ is no-contact by design; real
  conversations come read-only via GHL Inbox).
- Pay Log password (`DPperformancePayRoll` hardcoded) - replaced by real auth.
- api/ backend: JWT secret, Vercel token, Gmail app password, Google Sheets
  creds, password-reset + quiz-result emails. SECURITY: those live secrets
  are still sitting in Dan's repo - rotate them.
- Tweaks devtools panel (development aid, not a feature).

## Claimed by a first-pass audit but actually PRESENT in HQ

Dashboard + stat cards, theme toggle (persisted), sidebar search / Cmd+K,
Record Loom + Add client buttons, notifications bell, My Pay invoice
generation + pay period selector, check-ins filters/sort/click-through/review
ticks, client notes (DB-backed, better than the portal's localStorage), 12
recipes with search, academy modules, macro calculator, coach-scoped logins
(done today), 9-status pay engine (waiting only on the weekly data cadence).

## Suggested priority if the owner wants parity

1 (week grid) and 2 (pay log grid) are the two the coaches will actually
miss; 3 and 5 are small; 4 unlocks after Dan's channel connects; 6-7 are
nice-to-have; 8-9 already tracked.
