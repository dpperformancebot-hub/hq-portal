# PROGRESS.md

Build status tracker. Source of truth for scope is [BUILD-SPEC.md](./BUILD-SPEC.md); this file tracks what is `[done]` / `[in progress]` / `[todo]` against it. Update items as you complete them, then update "Last session summary" and "Next item" at the bottom.

Legend: `[done]` complete and compiling · `[in progress]` started · `[todo]` not started · `[GATE]` hard stop for owner review before starting.

---

## CURRENT STATE (2026-10-09) — read this first

Day-to-day coding moves to Claude Code on the web (GitHub only). Read
[docs/CLOUD-SESSIONS.md](./docs/CLOUD-SESSIONS.md) for what a cloud session
may and may not do. Detailed round notes are in FEEDBACK-V2.md.

### What is live

| Brand | Domain | Vercel project | Live deploy | Commit | Clerk |
|---|---|---|---|---|---|
| DP Performance | dpperformanceportal.com (use www for webhooks, apex 308s) | `tjd-fit-hq-app`, team `dp-performance`, region hnd1 | `tjd-fit-hq-2v45vahp8` (2026-10-05) | `c48b5d5` (R19-6) | production, clerk.dpperformanceportal.com |
| TJD Fit | tjdfithq.com | `tjdportal` (id prj_sAkvHhxDJieqzEr1UMAPo0z25ZJs), personal team, region bom1 | `tjdportal-mwdro7q9o` (2026-10-08) | `5e3db20` | **production** since 2026-10-08, clerk.tjdfithq.com, sign-up mode Public (owner: leave it) |

Neither project is git-connected: pushing does not deploy. Deploys are local
CLI runs, one brand at a time, only when the owner names the brand.

**DP is 7 commits behind master** (b405ffb..5e3db20). Most of it is gated to
TJD by brand flags and changes nothing on DP, but these WOULD change DP on its
next deploy and need an owner go: full-height shell + audits/tasks grids +
phone page header (layout only); Owner review now also allowed for admin;
task assignee picker lists not-yet-signed-in coaches/invitees with assignment
rules enforced server-side; Today card task matching.

### TJD (details are local-only)

TJD business notes (sign-ins, data syncs, client counts, pay decisions,
open TJD items) live in `private/TJD-BUSINESS-NOTES.md` on the owner's
machine. That folder is gitignored; never commit it or copy its contents
into tracked files.

### Coach hub (2026-10-11, cloud session, branch feat/coach-hub)

DP plain coaches now get a slim hub (Home, Start here, SOPs, Academy,
Resources) instead of the client toolset; client work moved to 1fit. Head
coach and TJD unchanged. Coaches sign in with Google on their work email
(Clerk setup is a dashboard job, see docs/coach-hub.md). This repo
(dpperformancebot-hub/hq-portal) is now git-connected to the DP Vercel project:
pushing a branch makes a preview, merging to main deploys DP.

### Pending owner decisions

- DP: deploy the 7 commits above, or hold.
- DP: `/reports/[id]` has no server guard (any logged-in DP user can open a
  report by URL). Recommended fix: the same guard `/reports` uses.
- Both: the mobile top bar runs off the right edge (pre-existing).
- Older DP threads still open: does a MISSED check-in pay the week (M absent
  from PAY_RULES), the ASK DAN clients, the GHL hygiene lists (start dates,
  expired terms), Engagement visibility for va/ops_manager.
- TJD: see the local-only `private/TJD-BUSINESS-NOTES.md` (owner machine).

### Must stay LOCAL (see docs/CLOUD-SESSIONS.md)

Database writes and imports, sheet syncs, anything using `.env.local` or
`.env.tjd.local` or `data-imports/`, applying migrations, Vercel deploys, and
browser checks in the owner's Chrome.

---

## V2 BUILD (2026-08-04, Claude Code) — FEEDBACK-V2.md is the V2 source of truth
**V2 DEFINITION OF DONE REACHED IN CODE (2026-08-05).** P0 + Phases A-G + H1 + H2 done, committed per item (9587612..dca8c4d), tsc + lint + 104/104 tests + dev boot clean per item. NOT deployed. Parked pending owner sign-off: H3 Meta ads, H4 Xero, H5 Google Calendar, Phase I, compatibility auto-assign.

**Phase F (F1, 8449aa0):** inbox "Draft with AI" chip → editable suggestion panel with Copy draft + Open their chat (wa.me from GHL contact phone for WhatsApp, else GHL conversation) + Dismiss; new inbox-reply assistant mode (ANTHROPIC_API_KEY-gated). No send path: outreach guard untouched.
**Phase G (G1, b1b7882):** VA dashboard = Jameela's job list: renewals panel first (coach + program + note), tick-off job list, active-clients block removed; VA nav gains Renewals. Dan's checklist slots in as tasks when shared (open q5).
**Phase H (1698e28, dca8c4d):** /weekly-report live page (last week / week ahead / rule-based consultant review, screenshot-friendly) linked from the dashboard; Monday 6am AEST cron snapshots it into Reports (route excluded from the middleware gate, idempotent per week). MRR split donut on Financials: by plan or PIF vs WRR (signal traced and present: billing frequency + term length), no-signal clients shown honestly.

**Phase E (weekly capacity, ce401a6):** coach capacity prompt modal (0/1-2/3-4/5+) from Sunday until answered, one coach_capacity row per coach per applicable week (Sunday → coming Monday, late answers → current week), session-derived coach id; capacity in the Journey Tracker assign picker and as pills on Coach Overview cards; Daily Digest "Team this week" (slots remaining + answered count, transformations last 7 days; response time deliberately omitted). ⚠️ NEEDS OWNER MIGRATION 20260805000001 (coach_capacity).

**Phase D (coach metrics done properly):**
- [done] **D1-D3** (f80e50b): retention on every coach surface is now the lifetime average of month-to-month retention (1 − monthly avg churn); monthlyRetentionSeries (tested) powers the new Monthly retention panel on the per-coach overview (12-month bars + pick-two-months compare with retention delta, churn counts, and D2's avg weeks-at-churn per month, Dan's exact formula); roster-growth graph replaced. Transformations per coach (count + % of active roster) on overview cards, ranking cards and the scorecard table.
- [done] **D4-D5** (01f013d): dashboard Retention KPI → Coach Performance, Expiring KPI → /renewals?tab=next30. Renewals: Program column replaces monthly rate, inline owner/VA renewal notes (client-row column, sync-safe), tabs All / Next 30 days / Overdue. ⚠️ NEEDS OWNER MIGRATION 20260804000003 (clients.renewal_note).

**Phase C (Taskboard → Tickets & Kanban):**
- [done] **C1-C3** (b216e2a): taskboard is a five-status kanban (To do / In progress / Blocked / Done / Approved) with drag-to-move; opened_by stamped from the session, cards show provenance, scopes All / Assigned to me / Opened by me; Submit ticket routes server-side coach → head coach → owner and a coach's board includes tickets they opened. ⚠️ NEEDS OWNER MIGRATION 20260804000002 (widened status check + opened_by + audit feedback/loom columns); degrades honestly until applied.
- [done] **C4** (4d0e3fa): dashboard "Today I will" card in the revenue row; items are tasks rows (type Today) so ops can add to anyone's list from /tasks; board suggestions tick the real task.
- [done] **C5** (12e1d50): audit cards gain feedback + Loom link (setAuditDetails, same write gate); coaches get Request audit → C3-routed ticket. Fuller rework awaits Dan's draft (open question 4).

**Phase B (Journey Tracker rework):**
- [done] **B1-B4** (fe98b59): columns Unassigned/Onboarding/W1-8/W9-16/W17-24/24+ via pure journeyBucket (+9 tests); Unassigned cards with owner-editable start date (setClientStartDateAction), plan pill, PIF/WBW pill (owner/VA only, honest unknown state); coach selector + Assign (owner-only assignCoachAction) with optimistic move; team-Slack ping on assign (existing SLACK_WEBHOOK_URL, documented in .env.example, no new key). Page redirects coach/sales server-side. CAVEAT: nightly GHL sync re-projects start_date — HQ edits should be mirrored in GHL until ownership decided (FEEDBACK-V2 open question 8).
- [done] **B5** (c1b816f): dashboard warn callout above the KPIs listing unassigned clients (name + start date), links to Journey Tracker, hidden at zero.
- [done] **B6** (08200cb): verified Onboarding screen gating (owner + head coach) and that no assignment UI existed; subtitle now points assignment at the Journey Tracker.

- [done] **V2-01 pay-visibility check (P0)**: Dan's sighting was the owner path (realRole stays owner while impersonating = expected). REAL LEAK FOUND + FIXED: /coach-performance and /coach-overview shipped every coach's pay RATES (weeklyRate/fortnightlyRate) in the RSC payload with no server gate, and /coach-overview/[coachId] stripped pay totals but not the coach card rates. Fixed with stripPayRates page-boundary helpers (unit-tested) + server-side plain-coach redirects (same pattern as /financials //team). My Pay scoping, owner-only impersonation, financials/team redirects all verified intact.
- [done] **V2-02**: "Coach fee ~10%" traced to a hardcoded gross*0.1 placeholder -> now Brand.coachFeePct (both brands 0.1, values unchanged), labelled "Fee (10%)" with tooltip; 0 hides the column. Dan owes the real rule.
- [done] **V2-03**: monthly rate traced: ALWAYS derived weekly_rate x 52/12, never billed. Labelled "Monthly equiv." with provenance tooltip in Client Database + Renewals; detail fact renamed.
- [done] **A1**: hover grab-grip removed from owner + coach dashboards (MovableLayout locked mode; saved order still applies; other screens keep grips).
- [done] **A2**: Active clients drawer sort toggle New to old / A to Z, default newest.
- [done] **A3**: Net change drill-down: two-section drawer (New / Cancelled this period), same 30-day windows as the KPI; DashboardClient gained endDate.
- [done] **A4**: avg tenure in weeks everywhere (Analytics was the last months surface).
- [done] **A5**: churn = lifetime monthly average (new churn-math.ts, 6 tests) across leaderboard, ranking, scorecard table, cards; labels "Churn (mo avg)".
- [done] **A6**: My Pay headlines "This pay cycle" (month the next payday covers); all-time totals removed, Pay Log history intact.
- [done] **A7**: VERIFIED, no code change: no pay-log editor exists; check-in writes are server-gated (coach = own roster). Caveat flagged to Dan (open question 7): codes drive pay and coaches log their own roster by design.
- [done] **A8**: Open their portal opens a new tab via owner-gated GET /api/impersonate. Known limit: cookie is session-wide.
- [done] **A9**: transformations send-back with required reason (owner/VA/head coach any card; coach their own approval only), reason on card, cleared on advance, 6 new tests. ⚠️ NEEDS OWNER MIGRATION 20260804000001 (sent_back_reason columns) for reason storage; works degraded without it.
- [done] **A10**: Client Database tabs now Active / Paused / "Past clients" (covers cancelled + past; badges still distinguish).
- [done] **A11**: revenue trend is a BarChart (new primitive), weekly bars when the visible range < 6 months; compare stays monthly-only with a note.
- [done] **A12**: leading zero-history trimmed with "history starts at X" note; all-zero windows render an EmptyState.

## LIVE ROLLOUT (2026-07-02) — team go-live (historical; see CURRENT STATE at the top).
The HQ is LIVE for the whole team on real data with real Clerk logins.

- [done] **All 9 migrations applied** to live Supabase (incl. the 3 from 2026-06-30: client_notes/manual check-ins, brand/marketing/reports stores, local-state persistence). The "owner must apply" flags in older sections below are stale.
- [done] **10 coach logins created in Clerk** (username sign-in; the earlier session's username toggle had never been saved — fixed and saved). All 10 linked to their coaches rows via users table (clerk_id → role 'coach', linked_coach_id). Owner + coaches can all log in. Temp passwords issued, coaches told to change them.
- [done] **Deployed via `vercel --prod`** (ships through commit 54df658) and verified live: owner dashboard on real data, impersonation round-trip (Open their portal → Exit to admin), head-coach tier confirmed on Angus.
- [done] **Report detail body** now renders stored report body text (was the last honest stub with data behind it). Committed abab4c3 with HANDOFF-2026-07-02.md.
- [done] **Sidebar search wired**: the sidebar search box opens the existing Cmd+K command palette (single search surface, "hq:open-search" event). tsc clean, uncommitted pending git-lock cleanup.
- [done] **VA weekly check-in import runbook**: docs/va-weekly-checkin-import-runbook.md (Kahunas has no API; weekly export → import-coach-log.mjs cadence). Uncommitted pending git-lock cleanup.
- [in progress] **Typeform → GHL Zap** ("TYPEFORM (TikTok) -> CRM" in Kai's Zapier): trigger Typeform/New Entry, action LeadConnector Add/Update Opportunity with Pipeline=Client Acquisition, Stage=New Inquiry, Lead Source=TikTok already set. BLOCKED: the only Typeform connection is private to Dan's Zapier profile; Dan must add a Typeform connection under Kai's account (Change → Connect a new account → Typeform OAuth). Then: pick TikTok form, map name/email/phone, test, publish, duplicate for Instagram (Lead Source=Instagram).
- [todo, Dan] **GHL WhatsApp Coexistence** (Settings → WhatsApp → "Connect your WhatsApp", QR scan from his phone's WhatsApp Business app) + Facebook/Instagram tile with Meta admin login → HQ Inbox lights up automatically.
- [todo, owner] Terminal cleanup: `rm -f .git/HEAD.lock .git/index.lock` (sandbox leftovers), commit the two pending files, `vercel --prod` to ship report-body + sidebar-search.

---

## MASTER AUDIT + gap builds + deploy (2026-07-11/12, Claude Code, owner-authorized push + deploy)
Full audit of the feature inventory via 4 parallel read-only audit agents; every finding fixed or built; pushed and deployed per the owner's session authorization.

**Audit verdicts (feature -> result):** coach oversight nav/impersonation/exclusions/team = PASS (hardened: /settings now redirects coaches server-side like /financials + /team). Onboarding grid/gates/tabs/sync/Slack = PASS (stale comment noted). Academy gating/2-min lesson gate/owner preview/tracker = PASS. Bracket board + ranking + scorecard + academy-tracker gating = PASS. Coach Assistant + Loom Summary = PASS (FIXED: the Y check-in wrote millisecond timestamps so same-day re-submits duplicated instead of editing in place; now day precision). Recipes shared library = PASS. Shell/UX = PASS except notifications (FIXED: head-coach bell items added, onboarding awaiting review + open team audits). Security = 2 FAILs FIXED: logCheckInAction trusted posted ids (any coach could log against any client, now roster-scoped with coach derived from the client row); deleteClientNoteAction let any coach delete any note (now own-notes-only, owner/head-coach moderate) + createClientNoteAction roster-scoped. Copy: em dashes removed (lesson gate, invoice title, placeholder cells).

**BUILT: Kahunas check-in importer** (the big gap): "Import check-ins" on the Check-ins screen; upload CSV/XLSX or paste the copied Kahunas table; matches clients by name case-insensitively (no emails stored, PII decision); preview reports matched / unmatched fix list / new / already recorded; NOTHING writes until Confirm, which re-runs matching server-side (preview payload never trusted). Writes code 'Y' source 'kahunas', dedupe (client_id, submitted_at, source); plain coach = own roster, owner/VA/head coach = anyone. Parser unit-tested; tests caught a timezone off-by-one (local midnight -> UTC ISO shifts the day) that was ALSO latent in the onboarding sheet parser: fixed in both.

**BUILT: approval steps on every sync** (owner rule): onboarding sheet sync and recipe uploads now dry-run first and show "X new, Y updated, nothing written yet" with Confirm/Cancel, matching the check-in importer.

Verified: tsc clean, lint clean (one pre-existing writeback.ts warning), 76/76 tests, production build all routes, dev boot 200-path OK. Migrations still awaiting owner: 20260710000001_check_in_summaries.sql, 20260711000001_recipes.sql (both written, NOT applied; also apply 20260630000001 if not yet, the 'manual' check-in source + client_notes migration the loom Y-log and notes rely on).

## Shared recipe index (2026-07-11 latest, Claude Code)
Owner brief: /recipes becomes one shared library every coach can add to by uploading a sheet. Done, committed, STOPPED for owner review (NOT deployed). ⚠️ NEEDS OWNER MIGRATION: supabase/migrations/20260711000001_recipes.sql (recipes table, unique on lower(title)); until applied the screen is seed-only and upload returns the honest migration error.

- [done] **recipes table migration** (write-only): title/category/serves/ingredients/method text, uploaded_by FK coaches, RLS zero policies, set_updated_at, unique index on lower(title) for re-upload dedupe.
- [done] **recipes-actions.ts**: listRecipes (seed + DB merged, DB wins on title, silent seed-only degrade), importRecipesAction (any coach or owner, 300-row cap, JS-side title match because PostgREST onConflict cannot target an expression index, returns inserted/updated), deleteRecipeAction (owner + head coach, DB rows only).
- [done] **import-recipes.ts parser**: CSV/XLSX via dynamic xlsx import, loose headers (Title/Name, Category, Serves, Ingredients, Method/Instructions/Directions), multi-line cells preserved one item per line, titleless rows skipped.
- [done] **View**: Upload recipes button (all coaches + owner) with parse -> action -> toast counts -> reload; search covers title + ingredients; category chips derived from the data; count label; added-by byline on DB rows with head-coach/owner Remove; macro grid/rating hidden on macro-less uploads; detail slide-over layout unchanged. Page is now a server component (listRecipes + identity).
- Also committed the pending loom-summary change (saving a summary upserts the client's 'Y' manual check-in). tsc + lint + 72 tests clean.

## DEPLOYED 2026-07-11 (vercel --prod, owner-directed)
Bracket board + owner-only impersonation + per-coach overview live and browser-verified: board columns rank per bracket (INFO expand works), Board/Table toggle, Coach Overview cards show View overview (+ Open portal owner-only), /coach-overview/[coachId] renders pay-free. Found live + fixed + redeployed: the head coach's own overview page showed the ALL-coach numbers (378 clients / 402 audits) via resolveCoachContext widening; getCoachDashboardData gained an ownOnly option and the page now shows his own 60. Also: a regular coach (impersonated) is correctly bounced off /coach-performance.

## Impersonation policy change (2026-07-11 later, owner decision)
Head coach NO LONGER enters coach portals; impersonation is owner-only again. Instead: read-only, PAY-FREE per-coach overview at /coach-overview/[coachId] (KPIs, check-in/roster trends, ghosted list, roster; client rows link to /client-database/[id]). Coach Overview cards: "View overview" for owner + head coach, "Open portal" owner-only. Hardening added on review: the page zeroes pay server-side before props cross to the client (RSC payloads ship unrendered props) and unknown coach ids 404 instead of falling back to the head coach's data (resolver crutch). tsc + lint + 72 tests clean. Committed, NOT deployed.

## Retention bracket board (2026-07-11 later, Claude Code)
Owner sketch: the retention block on /coach-performance as a Tasks-style kanban. Done, committed, STOPPED for owner review (NOT deployed; prod still shows the table-first version).

- [done] **RetentionBracketBoard** (retention-bracket-board.tsx): five columns (0-8 / 8-16 / 16-32 / 32+ weeks + Average) in the Tasks column idiom, one card per coach ranked best-first per bracket; Average ranks by lifetime retention. Cards: Avatar + name, bracket retention big (positive >= 85%, danger < 70%), "n clients · -x churned" sub-line, INFO chip; click expands inline detail (active/churned in bracket, avg weeks at churn, lifetime retention), no navigation. No-entrant coaches get no card; empty columns show a dashed placeholder. Mobile stacks 1 / md:2 / xl:5.
- [done] **Board/Table toggle** in RetentionBoard (SegmentedControl, Board default); the original table kept intact behind it. Scorecard + Academy tracker untouched; movable blocks unchanged.
- [done] **Maths extracted to src/lib/retention-math.ts** (pure): computeRetentionRows moved out of the component + new bracketStats (entrants = tenure reached the bracket; retention = survivors of entrants; null when none entered). 4 new unit tests; suite 72 passed. tsc + lint clean.

## Ranked coach performance board (2026-07-11, Claude Code)
Owner brief: redesign /coach-performance to lead with a ranked, card-based leaderboard. Done, committed, STOPPED for owner review (not deployed).

- [done] **PerformanceRanking block** (performance-ranking.tsx), FIRST in the MovableLayout: single-column stack of coach cards in the Tasks-board idiom. Rank number in display type, Avatar + name + Head Coach pill, then retention %, capacity bar (n/max from coach-config), churn % (danger when > 8%), avg weeks at churn (from the retention-board maths). Rank 1 gets border-accent/40 + "Top performer" eyebrow; the bottom card gets a "Needs attention" danger eyebrow ONLY when it also has the worst churn. Display-only, no links. Zero-active coaches excluded; EmptyState when none remain. Retention board / scorecard / academy tracker unchanged below.
- [done] **Composite ordering in src/lib/coach-ranking.ts** (pure, no UI imports): rankScore = (retention*3 + capacityPct*1 + (1-churn)*2)/6, inputs clamped; rankCoaches sorts desc with retention-then-name tie-breaks and an injectable capacity resolver. Unit-tested (coach-ranking.test.ts, 9 tests incl. the acceptance spot-check 95%/2% > 70%/12%).
- [done] **Fixed the broken unit suite** (pre-existing): coach-assign-actions.test.ts had 5 tests failing since the 2026-07-02 assertOwner gate (getServerIdentity -> cookies() outside a request scope), masked lately by role-server's React cache() import throwing at module load in plain Node. role-server now falls back to the bare function outside the RSC runtime; the suite mocks getServerIdentity and gains a non-owner rejection test. Full suite: 68 passed.
- tsc + lint + vitest clean. NOTE: an auto checkpoint (ba44339) captured mid-edit copies of this session's files; final versions are in e8fa82c and the stray test copy was removed after.

## Head-coach elevation + Loom Summary Assistant (2026-07-10, Claude Code)
Both goals of the owner brief done; tsc + lint + full production build clean. Committed per item.

**SHIPPED LIVE (same day, owner-directed "make onboarding live in Angus's portal"):**
- Migration 20260709000001 (client_onboarding, incl. the notes column) APPLIED to the live DP Supabase via the dashboard SQL editor, plus the Ella seed (12 rows, coach matched: Ella). The seed needed a start_date::date cast, fixed in the repo copy too.
- Deployed `vercel deploy --prod` (dpl_EcPsN68BQMfz5AWUp3AgUvpxrarV) and VERIFIED IN PROD as the owner login: /onboarding shows 12 rows / 3 needing review; "Open their portal" on Angus lands on his coach dashboard with the Oversight panel (audits 402, onboarding 3), his sidebar has Onboarding + Loom Summaries + the OVERSIGHT group (Coach Performance, Client Database, Coach Overview), his /onboarding is the all-coach reviewer view, and Exit to admin returns to the owner dashboard.
- Migration 20260710000001 (check_in_summaries) is NOT yet applied: Loom Summaries generates but does not save until it is (and ANTHROPIC_API_KEY is still unset, so the page shows its waiting-on-key state).
- Note: two transient 503s on the first impersonation server-action clicks (cold function); third click 303'd and worked. Watch it, but looks environmental.

- [done] **Committed the 2026-07-09 leftovers first** (were uncommitted in the tree): onboarding tracker (migration 20260709000001 + screen + actions + nav) and the Coach Performance retention leaderboard. Also cleared the stale zero-byte .git/index.lock the top-of-file cleanup note already called for (verified no git process was running).
- [done] **Head-coach elevation (Angus)**: getServerIdentity now resolves + request-caches `isHeadCoach` (coaches.role = 'head_coach' via the same coach-card resolution/dev-fallback as resolveCoachContext; `realIsHeadCoach` survives impersonation). Nav: `getNavGroupsFor`/`visibleSlugsFor` give a head coach COACH_NAV plus an Oversight group (Coach Performance, Client Database, Coach Overview); plain coaches byte-for-byte unchanged. RoleProvider/Sidebar/RouteGuard carry the flag. Client Audits widens to the full cadence for a head coach; onboarding resolveAccess now reuses the identity flag (one query, not two).
- [done] **Impersonation**: startImpersonation gate is owner OR real head coach (re-validated server-side; forged cookie on a plain-coach session stays ignored); exit returns to the page they came from, falling back to /coach-overview (owner) or /dashboard (head coach).
- [done] **Money hard-exclusions**: /financials and /team now redirect any coach role server-side (RouteGuard alone still streamed the payload). My Pay was already own-roster-only for a head coach; the coach-performance scorecard carries no pay figures.
- [done] **Head-coach dashboard Oversight panel**: audits needing action (all-coach), onboarding awaiting review (same derivation as the tracker), Coach Performance link. Null for plain coaches, so their dashboard is unchanged.
- [done] **Loom Summary Assistant**: new /api/assistant mode `loom-summary` ({transcript, loomUrl?, clientId?, weekNumber?} -> Summary / Action items / Coach notes in the DP tone, REFUSED for non-fitness transcripts, transcript clipped at 60k chars). ⚠️ NEEDS OWNER MIGRATION 20260710000001_check_in_summaries.sql (written, NOT applied); saves are best-effort and the UI says so until then. New /loom-summary screen under coach Toolset (roster client picker, week, URL, transcript, copy buttons, history without transcripts) gated on ANTHROPIC_API_KEY like Coach Assistant; summaries render newest-first on the coach client profile. Scoping: plain coach = own clients only, head coach/owner = all. Fixed a latent prod-build breaker while here: route.ts exported non-route field `aiConfigured` (Next 15 rejects it; `next build` was failing).
- NOT verified in a browser: local dev now redirects to Clerk /sign-in (AUTH_MODE=clerk in .env.local), so verification was tsc + eslint + full `next build` (all routes compile). Owner: preview as Angus and as a regular coach per the brief's acceptance list.

---

## Effortless-lists pass (2026-07-03) — depth + list management portal-wide
Owner ask: every big list (clients, coach rosters, etc.) sortable/filterable/searchable, bonuses tracked as easily as the dashboard. All committed per item, tsc + lint clean, dev boots.

- [done] **Shared DataTable upgraded** (data-table.tsx): pagination (50/page, "Showing X-Y of Z", appears only on long lists so the 400+ row live roster no longer renders every row), optional built-in search, faceted filter dropdowns with counts derived from the data, defaultSort, and a sort fallback (sortValue -> csvValue -> raw key) that made most csvValue-only tables click-to-sort with zero per-screen changes. CSV export still downloads all filtered+sorted rows.
- [done] **Client Database**: Coach / Plan / Check-in freshness filter dropdowns, default A-Z sort, every column sortable (was none: columns had csvValue only), pagination.
- [done] **Coach My Clients**: Status / Journey / Plan / Check-in filters, last check-in column with the same freshness dot as the owner roster, search moved into the table toolbar, default A-Z sort.
- [done] **My Pay bonus tracker**: new panel with each client's progress bar to their next $50 retention milestone (10-wk blocks), sorted closest-first, weeks-to-go + milestone week + retention earned per client, warn highlight within 4 wks; header strip totals retention earned / onboarding / dollars landing within 4 wks. By-client table now searchable, default sorted by earned.
- [done] **Portal-wide sorting sweep**: Pipeline, Financials, Renewals, Referrals, Ambassadors, Team, Marketing, Contracts, Reports, Call Calendar, VA tasks all sort via the fallback; explicit sortValue added for derived columns on Coach Performance (capacity/response/slots), Coach Leaderboard (avg length/active/capacity), Analytics (conv %). Coach Overview gained a Slots-open sort. Coach Check-ins already had search/chips/sort.

---

## Portal finalisation (2026-06-30) — closing docs/portal-completion-audit.md
Working the audit gap list in order. tsc + lint clean per item.

- [done] **1. CSV export everywhere.** Added a reusable client helper `src/lib/csv.ts` (`exportRowsToCsv` / `rowsToCsv` / `downloadCsv` / `datedFilename`, RFC-4180 + BOM, generalised from the old Coach Performance export). Wired export into the shared `DataTable` via an `exportFilename` prop (+ per-column `csvValue` / `csvExclude`) so it downloads the currently filtered+sorted rows; added a `DownloadCsvButton` client primitive for server components (CSV precomputed with the pure `rowsToCsv`). Coach Performance migrated onto the shared helper. Export now on: Client Database, Check-ins, My Clients, My Pay (ledger + pay log grid), Coach Overview, Coach Performance, Renewals, Client Audits, Financials (payouts + transactions), Sales Performance, Pipeline.
- [done] **2. In-portal data entry (coach can log a check-in + add client notes).** ⚠️ NEEDS OWNER MIGRATION. Wrote `supabase/migrations/20260630000001_client_notes_and_manual_checkins.sql` (new `client_notes` table + extends `check_ins.source` to allow `'manual'`), **NOT applied** — owner runs it. Built `client-notes-actions.ts` (create/delete, author + coach scope derived server-side from getServerIdentity, NO outbound path) and `check-in-entry-actions.ts` (logCheckInAction, upsert on client+date+source='manual'); both gated on persistenceEnabled() and fail closed with an honest "owner must apply migration" message until then. Read layer `client-notes.ts` (returns [] if off / table absent); notes added to `getClientDetailData`. UI: shared `ClientNotesPanel` + `LogCheckInForm` (optimistic, useTransition) wired into the owner client profile (Check-ins tab + Notes panel), the coach client profile, and the coach Check-ins screen (Log check-in toggle).
- [done] **3. Remaining "New X" buttons.** All four (Reports, Building the Brand "New task", Building the Team "New role", Marketing "New campaign" / "Add magnet") need new tables, none had a write path. Wrote `supabase/migrations/20260630000002_brand_marketing_reports_stores.sql` (reports, brand_build_tasks, hires, campaigns, lead_magnets; same store conventions, RLS service-role-only), **NOT applied**. Per instruction, kept the buttons as honest disabled stubs, now each naming the exact migration to apply rather than a vague "not yet wired".
- [done] **4. Persist localStorage-only state.** ⚠️ NEEDS OWNER MIGRATION. Wrote `supabase/migrations/20260630000003_local_state_persistence.sql` (`check_in_reviews` keyed by coach+client, `notification_prefs` keyed by scope+pref), **NOT applied**. Read layer `local-state.ts` + best-effort writes `local-state-actions.ts`, gated on persistenceEnabled(). Wired Check-ins review ticks (seed from DB merged with the localStorage fallback; toggle writes both) and Settings notification toggles (DB wins over localStorage; toggle persists both). localStorage stays the working fallback until the migration is applied, then it carries across devices with no data loss.
**Owner-gated migrations to apply (written this pass, NOT applied):** `20260630000001` (client_notes + check_ins 'manual'), `20260630000002` (reports/brand_build_tasks/hires/campaigns/lead_magnets), `20260630000003` (check_in_reviews + notification_prefs).

**OUT OF SCOPE this pass (owner/Dan-gated, NOT started):** Stripe key (Financials cash/refunds), GHL lead/opportunity import (Pipeline/Sales/Analytics), Kahunas live feed (exact pay-by-status), real coach capacities, full Clerk team rollout, real file upload/storage (Brand Assets + transformation photos).

- [done] **5. SOPs port — nothing more to port in-repo; gap made honest + flagged.** Verified the only SOP content anywhere in the repo is the same 3 already in `coach-content/sops.ts` (the prototype's SOPS array holds exactly those 3; the other ~19 live only on the external sop-library-six.vercel.app). Added an honest "More SOPs" card to the coach SOPs view (states 3 of ~22, that the rest are external, that the owner must export them, links out) and wrote `docs/sops-port-status.md` listing ported vs missing by category with the exact owner action (export the SOP text → verbatim paste into COACH_SOPS, no code change). Did not scrape the external site.

---

## M1 Foundation [DONE]
- [done] Next.js scaffold (App Router, src/, @/* alias)
- [done] Stack pinned: Next 15 / React 18 / Tailwind 3
- [done] CLAUDE.md (rules + stack + conventions)
- [done] DATA-MODEL.md (entity spec)
- [done] Design tokens + theming (light default, dark toggle, persisted)
- [done] /style-guide QA page (both themes)

## M2 Primitives + Shell [DONE]
- [done] Primitives: Card, KPI, Pill/StatusPill (status+plan+type), Delta, Avatar, SegmentedControl, DataTable, SidebarNavItem, Button, PageHeader, AreaChart (all on /style-guide)
- [done] Owner shell: fixed 240px sidebar (logo, search, grouped scrollable nav, theme toggle + profile pinned bottom)
- [done] Topbar: Cmd+K search, Record Loom, + Add client (primary), notifications bell, profile avatar
- [done] Routing to placeholders + "Coming next" placeholder for unbuilt screens (catch-all route)
- [done] Owner nav groups exactly per spec (OPERATIONS / INSIGHTS / BRAND / AUTOMATIONS / DOCUMENTS / TEAM & SETTINGS)
- [done] Role architecture: ROLE_CONFIG role -> {navGroups, defaultRoute}; wrong-role redirect (RouteGuard); dev-only role switcher

## M3 Core screens (seed data) [DONE]
- [done] In-repo seed data layer (src/lib/seed) as the live-Supabase swap point
- [done] Dashboard (owner default) + all-zero empty-state variant (?state=empty)
- [done] Pipeline (CRM): Kanban + Table views
- [done] Client Database (Active/Paused/Cancelled/Past + client detail scaffold)
- [done] Client Journey Tracker
- [done] Coach Overview
- [done] Coach Performance / Scorecard
- [done] Results Tracker + Transformations (state machine)
- [done] Financials

## M4 Secondary screens [DONE]
- [done] Inbox / Conversations (3-pane, mock banner)
- [done] Tasks
- [done] Client Audits
- [done] Daily Digest
- [done] Calendar
- [done] Call Calendar
- [done] Content Planner
- [done] Content & Collaborations
- [done] Marketing & Campaigns
- [done] Automations (management UI, toggles persist not execute)
- [done] Analytics
- [done] Reports (+ /reports/[id] detail scaffold)
- [done] Sales Performance
- [done] Document stores: Brand Assets, SOPs, Contracts, Brief, Merch
- [done] Brand
- [done] Building the Brand
- [done] Building the Team
- [done] Referrals
- [done] Social Media
- [done] Ambassadors
- [done] Team
- [done] Settings

## M5 GHL integration [GATE: data model + secrets] [in progress]
- [done] Real DP client base imported into GHL (423 active+paused contacts, 16 custom fields, VA exceptions list)
- [done] GHL API auth (read-only Private Integration) + scopes documented in /docs/ghl-integration.md
- [done] Phase 1 live layer: GHL -> app direct (polling, 5 min cache). src/lib/ghl (client/map) + src/lib/live selectors + src/lib/data facade. DEMO_MODE now env-driven (NEXT_PUBLIC_DEMO_MODE=false + GHL_API_TOKEN = live)
- [done] Source tag mapping GHL -> our channels (incl. TikTok added to LeadSource; Monthly added to Plan)
- [done] Pipeline stage mapping (GHL stage names -> HQ LeadStage)
- [in progress] Swap projection screens from seed to live: Dashboard + Client Database done; remaining screens go through src/lib/data.ts
- [in progress] Supabase persistence per DATA-MODEL.md (phase 2). Gate opened by owner 2026-06-12 with defaults. BUILT (code-complete, behind HQ_PERSISTENCE=false): migration SQL, db client, GHL->Supabase sync + snapshot writer, /api/sync/ghl, flag-gated reads. REMAINING: owner creates the DP Supabase project, applies the migration, sets env (SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET), runs first sync, flips HQ_PERSISTENCE=true. See docs/supabase-schema-proposal.md status block for the 7 flagged default decisions.
- [done] Webhook receiver code (POST /api/webhooks/ghl: shared-secret auth, single-row contact/opportunity upserts via refetch-by-id, contact delete = soft 'past', opportunity delete = row removed, PII-free event log). Inert until HQ_PERSISTENCE=true + GHL_WEBHOOK_SECRET set + GHL workflow webhook pointed at it (owner, in GHL).
- [done] Conditional onboarding surfacing (Standard/Challenge/Photoshoot): OnboardingType on Client, parsed from GHL custom field (parseOnboarding in ghl/map.ts), seeded, OnboardingPill primitive (reuses resource-type tokens, on /style-guide), surfaced on client detail Overview + journey onboarding/settling-in cards
- [done] Stub two-way write-back points (start date, coach assignment): src/lib/writeback.ts names both integration points (assignCoach, setStartDate) as typed no-ops with the Supabase->GHL write path documented; client detail Reassign coach + Start date Edit and coach overview Assign clients wired to them (no actual writes, WRITEBACK_STUBBED=true)
- [todo] Password-gate the live Vercel URL (Basic Auth) BEFORE real data deploys (non-optional)
- [todo] Import cancelled-client history into GHL (powers retention/churn + leaderboards)

## M6 Role scaffolds [GATE opened by owner 2026-06-12] [in progress]
- 4 LOGIN ROLES ONLY: owner, coach, sales, va. Ambassador dropped as a login role (now an owner-facing view-only data screen under BRAND).
- [done] Server-side role resolution: getServerIdentity (src/lib/role-server.ts). AUTH_MODE=clerk -> Clerk session + users table (role, linked_coach_id); default -> hq-dev-role cookie written by the dev switcher (cookie mirror added to RoleProvider + router.refresh on switch). Unresolved clerk user = va (least privilege).
- [done] Role-branched /dashboard: owner view unchanged; coach/sales/va render their own dashboards from the same route.
- [done] Coach dashboard: active clients, own retention/churn, avg tenure, roster table (links to client detail), check-ins due/completed as awaiting-feed (Kahunas). Scoped at the facade (getCoachDashboardData), components never see other coaches.
- [done] Sales dashboard: new leads/to action/consults booked+completed/close rate/onboarded/follow-ups/top sources from the leads facade (lights up at pipeline import; honest empty state until then); show-up rate + DM section labelled awaiting-live-source.
- [done] VA dashboard: to-do list (seed in demo, empty-state in live until HQ tasks go live), ops KPIs (active/paused/renewal calls this week), quick links. Ops scope only.
- [done] Owner role-preview pages: /sales-dashboard and /va-dashboard render the real views with a preview banner.
- [done] Coach toolset nav items (My Pay, Quizzes, Academy, Calculators, Coach Assistant) in the coach nav as Coming-next placeholders; VA nav gained Tasks per spec.
- [done] Clerk wiring CODE behind AUTH_MODE=clerk (default off, prod unchanged): middleware composition (direct visits need a Clerk session, GHL iframe stays on the password gate, machine endpoints excluded), /sign-in page, server role locks the shell (dev switcher hidden, RoleProvider authRole). ACTIVATION = owner runbook docs/auth-activation.md (Clerk app + keys, Supabase third-party auth, users rows SQL, local test checklist, then AUTH_MODE=clerk in Vercel). Untested against real keys until then.
- [done] Coach screens: My Clients (scoped roster, search, active+paused), Check-ins (roster codes + awaiting-Kahunas banner in live mode, seed codes in demo), Results (own transformations read-view, live-empty until activation). All pre-scoped at the facade (getCoachRosterData/getCoachResultsData); no links into owner/VA routes.
- [done] Recipe Index: prototype recipe library (12 recipes, tags, search, favourites in localStorage). Custom authoring deferred.
- [done] Coach toolset screens: Calculators (full Starting Macro port, DP policy maths in src/lib/coach-content/macro-calculator.ts), Quizzes (4 banks, working runner, pass 100%, best scores in localStorage), Academy (full 6-module / 31-lesson course extracted verbatim from the prototype into src/lib/coach-content/modules.json, server-rendered reader; module quizzes + progress await auth), My Pay (run-rate estimate, payroll rules await Dan), Coach Assistant (honest disabled scaffold, backend retainer-phase).
- [done] Per-role RLS policies: supabase/migrations/20260612000002_role_policies.sql (read-only policies per role, writes stay service-role). APPLY AT AUTH ACTIVATION after Clerk third-party auth is configured in Supabase; harmless if applied early.
- [todo] Query-level scoping for remaining shared screens as reads move per-screen to Supabase
- Note: nav configs for owner/coach/sales/va exist (navigation.ts); ambassador role + "Ambassador Dashboard" nav item removed. Role-specific screens (my-clients, check-ins, results, recipes) render "Coming next" placeholders until built here

## M7 States hardening [DONE]
- [done] Empty states (shipped with M3/M4)
- [done] Loading skeletons: shared (hq)/loading.tsx for all screens + tailored loaders for the 8 core screens
- [done] Error states: (hq)/error.tsx (in-shell, retry), app/error.tsx (root), app/global-error.tsx
- [done] Skeleton + ErrorState primitives added to the component library

## M8 Rebrand + deploy [in progress]
- [done] DP Performance brand config (central BRAND config; TJD swap proven)
- [done] App deployed and reachable at a URL: Vercel production, https://tjd-fit-hq-app.vercel.app (public; renders DP Performance build on seed data). Project name is tjd-fit-hq-app (repo dir); placeholder Clerk/Supabase env vars persisted to the Vercel project so redeploys build.
- [todo] Map to rawandformed.com/crmprototype1 (needs owner: where rawandformed.com is hosted; subpath via basePath + redeploy, or a rewrite/proxy from that domain to the vercel deployment)
- [todo] TJD Fit deployment (separate project from the same codebase via BRAND swap)

## GHL two-way integration (docs/ghl-twoway-integration-brief.md)
- [in progress] STAGE 1 READ (Inbox + Calendar). CODE COMPLETE, NOT yet verified against real GHL responses. Built: ghl/types.ts (GhlConversation/Message/Calendar/CalendarEvent), ghl/client.ts (fetchConversations, fetchMessages [uncached, on-demand], fetchCalendars, fetchCalendarEvents), ghl/map.ts (channelFromGhl + date/time helpers + mapConversations/mapMessages/mapCalendarEvents/mapCallBookings; tolerant of ISO-or-epoch + nested-or-flat shapes), live/index.ts (getInbox, getMessages, getCalendarEventsLive, getCallBookingsLive), data.ts facades (getInboxData, getMessagesData, getCalendarData, getCallCalendarData). Wired: inbox page->server component + on-demand getMessages server action (app/(hq)/inbox/actions.ts), MOCK banner dropped in live mode, Send disabled (Stage 2); calendar view renders the live current month; call-calendar live. Conversation type gained optional rawChannel for honest non-1:1 channel labels (FB, SMS, Live Chat). tsc + lint clean.
  - BLOCKER (owner): GHL_API_TOKEN in .env.local is still the old read-only token. Probed live: contacts/customFields/opportunities = 200, but conversations/search + calendars + calendars/events = 401 "not authorized for this scope". Swap GHL_API_TOKEN to the DP HQ Sync v2 token (Conversations + Calendar scopes), then the screens go live with no code change. Wiring verified end to end: /inbox hits GHL /conversations/search and /calendar+/call-calendar hit /calendars/events, each 401-ing only at the scope (dev log); all routes return 200 via the error boundary.
  - TUNE AFTER TOKEN SWAP (against real shapes): channel-type enum -> InboxChannel buckets (default messaging bucket = whatsapp); lastMessageDate ISO-vs-epoch; messages response nesting; calendars/events may need calendarId/groupId/userId alongside locationId; call-calendar setter/closer need a GHL users map (currently "—"); appointment->EventType is all "call" for now.
- [todo] STAGE 2 WRITE (send message + writeback.ts -> real PUT /contacts). GATED: owner review of Stage 1 live first, then test contact only, confirm-on-every-write.

---

## Last session summary

**2026-09-25 ROUND 17 DEPLOYED (DP only).** Production deployment `tjd-fit-hq-ufw0djd7g`, aliased to dpperformanceportal.com, serving from hnd1. Carries commits c6cb95a..3689130. All five gates were released first: migration 20260925000001 applied and verified, R17-1c roles, R17-4 UI, R17-4 capacity. TJD was NOT deployed and must not be: its database has none of the R16 or R17 migrations, so the MS/M check-in codes and the start-date columns would fail there. Its newest production build is still 5 days old.

WHAT CHANGES ON THE NEXT SYNC (05:55 AEST): the dateAdded fallback is gone, so clients whose GHL "Start Date" field is blank will have start_date written as NULL and will show "Start date needed" instead of their signup/payment date. That is 122 active clients as audited on 2026-09-25. Their worklist is ~/tjd-fit-hq/R17-1-START-DATES-TO-CHECK-2026-09-25.csv, and Jameela (ops_manager) can now set the real date herself on the Journey Tracker; it writes start_date_override and survives the sync.

**2026-09-25 ROUND 17 (DP only, TJD out of scope). Built on master, NOT deployed.** Brief: ~/tjd-fit-hq/CC-ROUND-17-BRIEF.md. Tracker: FEEDBACK-V2.md "ROUND 17". Commits c6cb95a..1f9b639.

## Round 17 self-review

**1. Per-item status.** R17-1a DONE (commit 8e726e7): root cause proved against live GHL, dateAdded fallback removed, unknown start handled everywhere. R17-1b DONE in code (8e726e7), GATED on migration 20260925000001. R17-1c APPLIED 2026-09-25 on the owner's go. R17-2 DONE (e0aa540), all three parts. R17-3 DONE (f9e1da9); the reported leak did not exist, the real cause is documented and exported. R17-4 BUILT (1f9b639) and RELEASED into the UI 2026-09-25, plus docs/coach-onboarding.md; capacity moved onto coaches.max_capacity 2026-09-25. Nothing skipped.

**2. Checks actually run.** `npx tsc --noEmit` clean after every item. `npx vitest run` 295 tests / 25 files pass (8 new in client-start-date.test.ts). `npm run lint` clean apart from the pre-existing writeback.ts warning. `npx next build` compiled successfully. Dev server + curl after each item: R17-1 /dashboard /client-journey (+?filter=unassigned) /client-database /renewals /engagement /tasks /va-dashboard /my-clients /check-ins /pauses all 200, and /dashboard + /va-dashboard as `va` 200; R17-2 /pauses /dashboard /va-dashboard 200; R17-3 /engagement /renewals /client-journey /va-dashboard /pauses /dashboard 200; R17-4 /team /engagement /pauses /client-journey /dashboard 200. No server errors in any run. Live data checks: 533 active clients audited against GHL one contact at a time with retry/backoff (2 staff rows unresolvable, reported not hidden); all 42 portal-paused clients checked against GHL Status; 34 client_pauses rows checked for staleness.

**3. Cross-check grep pass (diff 1dc4675..HEAD).** No hardcoded hex in changed components. No new roster query without a status default (the two new `from("clients")` reads are a per-coach client count for the Add coach picker and a single-row read by id in the start-date action). No console logging of client name/email/phone. No GHL write of any kind, so the outreach guard is not bypassed; writeback.ts is still stubbed. No em dashes in added UI copy or docs. `dateAdded` no longer appears in the client start-date path (only in unrelated message timestamps). The Add coach form has 0 references outside its own file, confirming it is unreachable.

**4. HARD STOPS, with the exact words to release each.**
- ~~Migration 20260925000001~~ **APPLIED 2026-09-25** to DP by Claude Code in the Supabase SQL editor on Kai's explicit go, and verified (start_date is_nullable YES, start_date_override date). The deploy is no longer blocked on schema.
- ~~R17-1c start-date permissions~~ **APPLIED 2026-09-25** (owner, admin, ops_manager; head coach deliberately excluded).
- ~~R17-4 release into the UI~~ **DONE 2026-09-25**: Team screen, owner + admin, verified per role.
- ~~R17-4 capacity switch~~ **DONE 2026-09-25**: 17 rows normalised 30 -> 70 (backed up, verified, audited), read moved off COACH_CAPACITIES onto coaches.max_capacity.
- Deploy. Say **"deploy R17"**.

**5. For Jameela and Dan (three lists, no bulk corrections made).** ~/tjd-fit-hq/R17-1-START-DATES-TO-CHECK-2026-09-25.csv (122 active clients whose start date is really their signup/payment date). ~/tjd-fit-hq/R17-3-TERM-ENDED-STILL-ACTIVE-2026-09-25.csv (97 active clients whose term end has already passed, GHL Status never updated). The 8 derived pause rows are listed in the R17-2 FEEDBACK entry. Two zero-rate staff rows sitting in `clients` as active, `mykael` and `kai fourie`, whose GHL contacts no longer exist: worth deleting, not touched.

**2026-09-23 DEPLOYED (DP only).** Round 16 is LIVE on DP: production deployment `tjd-fit-hq-c54lwvr1d`, aliased to dpperformanceportal.com, serving from hnd1. Contains everything from a5e2691 through fb5899e: the check-in grid v2 and new code set (Y/MS/M/F/G/P/C/N), the pauses fix, the roles change (ops_manager can assign and open a coach overview), assign-clients findability, renewals term-end override and note chips, the engagement per-brand config, the Academy full-access allowlist for Angus, and the pay map. All four DP migrations were applied and verified first (constraint has MS and no SM, check_ins.note and clients.term_end_override exist), and the SM/M -> MS remap of 196 rows ran before the UI shipped. TJD is deliberately OUT of Round 16: its database never got the migrations, so it must not receive this build.

**2026-09-21 (Claude Code, ROUND 16 from ~/tjd-fit-hq/CC-ROUND-16-BRIEF.md; live tracker = FEEDBACK-V2.md "ROUND 16").** R16-0 done (`npm run sheets:diff`, shared xlsx parser). R16-1 done: roster-diff diagnostic, GHL sync no longer nulls an existing coach_id (coach_drift events), 50 coach assignments applied from the coach sheets with audit rows (Perry 24->33, Angus 58->62, unassigned active 110->65); Vercel function regions moved to Tokyo (DP) / Mumbai (TJD) next to the databases; both brands deployed (sync fix + regions only). R16-2 built on master, NOT deployed: gated on migrations 20260921000001/2/3 and the SM/M -> MS remap (DP 196 rows). Held for Dan: 2 B rows (Sophie Hassell, Lisa Jansen), stub "olivia" shared by two people, stub "ashley".
2026-06-15 (GHL two-way, Stage 1 read scaffolding, Claude Code session): Built the live read path for Inbox + Calendar + Call Calendar end to end (types -> client fetchers -> mappers -> live selectors -> data facade -> screens), following the existing M5 GHL patterns. On-demand thread messages via a server action (not loaded upfront). Roster join by contactId (Client.id IS the GHL contact id). Found the .env.local token still lacks the Conversations/Calendar scopes (probed: those endpoints 401, contacts/opps 200), so live verification is blocked on the owner pasting the DP HQ Sync v2 token into .env.local (this is a secrets hard-stop; not touched by me). Per owner direction, built the scaffolding now to tune after the swap. Smoke-tested through the password gate: all routes 200; dev log shows the chain reaching GHL and failing only at the scope 401, confirming correct wiring. tsc + lint clean. NOT committed (owner review per the brief's Stage 1 gate; Stage 2 write untouched). Note: live/index.ts gained Stripe financials concurrently; re-ran tsc after, still clean.

2026-06-15 (live-activation verified + GHL embed + M6 invites + bonuses, Cowork session): Confirmed M5 phase 2 Supabase persistence is LIVE in prod (DP project, 11 tables, ~776 clients/10 coaches, daily Vercel cron sync source=poll with zero errors, HQ_PERSISTENCE=true) — the prior chat assumed it still needed setup; it was already done. GHL embed expanded: custom menu links grown from 8 to ~30 of the 37 owner screens as native iFrame tabs in the "Kai Fourie" sub-account (location R99JktDA6ajZeTWo4YPu); verified rendering the live dashboard with no doubled sidebar. 6 menu links still to add (Building the Team, Content Planner, Content & Collaborations, Marketing & Campaigns, SOPs, Merch); full spec in data-imports/ghl-hq-menu-links.md. Hiding GHL's default tabs per-subaccount is NOT natively possible (only the plan-level SaaS configurator); deferred. NOTE: GHL's settings UI runs in a cross-origin iframe whose Save ignores automated clicks, so the owner clicks Save for menu-link creation. Coach capacities now configurable in src/lib/coach-config.ts (DEFAULT_COACH_CAPACITY=70 per owner + per-coach overrides), wired through ghl/map.ts; real per-coach numbers pending Dan. Team invites built (M6, owner-approved schema change): migration 20260615000001_invites.sql (invites table, RLS service-role-only), src/lib/invites.ts + src/lib/invites-actions.ts, pre-authorise-by-email claim in role-server.ts (first Clerk sign-in matches email -> creates users row, marks invite claimed), Team screen at src/app/(hq)/team + components/screens/team/team-view.tsx with the invite form (name/email/role/coach). Replaces manual users-row SQL; inert until AUTH_MODE=clerk. My Pay bonuses wired from live client data ($50 setup/client + $50 per full 10 weeks retained; constants in coach-config.ts, getMyPayData in data.ts, my-pay-view). Sales-role config src/lib/sales-config.ts (Lilli=closer, Lucas=setter) ready for the sales screens once pipeline data flows. Two-way GHL integration scoped + briefed in docs/ghl-twoway-integration-brief.md for a tested Claude Code build (Stage 1 read: live Inbox + Calendar; Stage 2 write: send messages + client write-back via writeback.ts, confirm-gated); GHL token widened to "DP HQ Sync v2" with conversations + calendars + edit scopes (new GHL_API_TOKEN to set in Vercel + .env.local). All tsc clean; dev-boot/lint not runnable in the Cowork sandbox (offline SWC). Uncommitted: owner commits in Terminal (rm -f .git/index.lock first).

2026-06-13 (M5 non-gated code items): Cleared the two M5 todos that need no Supabase project/secrets/GHL settings. (1) Conditional onboarding surfacing: added OnboardingType (Standard/Challenge/Photoshoot) to the Client contract, parse it from the GHL onboarding-type custom field (parseOnboarding, unrecognised/absent -> null so the UI never guesses), seeded a few clients, added an OnboardingPill primitive that reuses existing resource-type theme tokens (no new vars; added to /style-guide), and surfaced it on the client detail Overview and the journey Onboarding/Settling-In cards. (2) Write-back stub points: new src/lib/writeback.ts names the two HQ-initiated integration points (assignCoach, setStartDate) as typed, validated NO-OPS with the Supabase->GHL write path documented and WRITEBACK_STUBBED=true; wired the previously-empty handlers (client detail Reassign coach + a new Start date Edit affordance, coach overview Assign clients) to them. No actual writes, no network, no schema touched. tsc clean; lint/dev-boot not runnable in the sandbox (offline SWC binary), owner verifies locally. Remaining M5/M8 items are all owner-gated (Supabase project, secrets, GHL webhook/import, domain mapping).

2026-06-12 last (M6 part 4, Clerk wiring behind flag): middleware now composes clerkMiddleware when AUTH_MODE=clerk (direct visits redirect to /sign-in; the GHL iframe embed deliberately stays on the password gate, decision 24; /api/sync + /api/webhooks excluded from both gates); /sign-in page added; (hq) layout resolves the server identity in clerk mode and locks the shell role (RoleProvider authRole, dev switcher hidden, setRole no-op, decision 25). Gate-only mode is byte-for-byte today's behaviour. docs/auth-activation.md is the owner runbook (Clerk app, env keys, Supabase third-party auth, users rows SQL incl. linked_coach_id for coaches, 5-point local test, prod flip, rollback = unset AUTH_MODE). AUTH_MODE added to .env.example. tsc clean. NOT testable without real Clerk keys: the runbook's step 5 checklist is the verification. Earlier today: see entries below (digest live, M5 phase 2, webhooks, role dashboards, coach screens, coach toolset, RLS). All committed through d09f46f; this pass is uncommitted.

2026-06-12 final (M6 part 3, coach toolset + RLS policies): Extracted the prototype's content data programmatically (node bracket-matcher eval, not retyped): 12 recipes, 4 quiz banks (73 questions), the FULL 6-module/31-lesson DP Academy course (336KB), 1 calculator meta. Built all five toolset screens + Recipe Index (see M6 checklist). Academy renders server-side so the course never ships to the browser; content modules are split per consumer after a fix-pass catch: the original barrel would have dragged 330KB into the client bundle via the recipes/quizzes imports. My Pay is a labelled run-rate estimate (per-check-in pay + bonuses await Dan's payroll rules; prototype's hardcoded pay-log password deliberately not ported). Coach Assistant is an honest disabled scaffold. RLS policies migration 0002 written (read-only per-role, writes stay service-role; apply at auth activation). Decisions 19-23 flagged in the proposal doc. tsc clean. M6 remaining: Clerk wiring (activation) + per-screen Supabase scoping. NOTE for owner commit: src/lib/coach-content/*.json are generated extracts from reference/prototype.html; re-extract rather than hand-edit.

2026-06-12 latest (M6 part 2, coach screens + fix-pass): Built My Clients (scoped roster, search, active+paused, paused pill), Check-ins (latest check-in codes; live mode shows the awaiting-Kahunas banner, demo shows seed codes), Results (own transformations, read-only, live-empty until activation) on new facade selectors getCoachRosterData/getCoachResultsData sharing one resolveCoachContext choke point. Fix-pass findings, all fixed: (1) coach dashboard roster linked into /client-database, which RouteGuard denies to coaches, links removed, plain text (coach client detail = later M6 item, decision 16); (2) VA dashboard quick-linked /renewals, outside VA scope, removed; (3) /api/sync/ghl maxDuration 120 exceeded the Vercel Hobby 60s ceiling and would have failed at activation, now 60; (4) tidied malformed error strings in the new GHL single-fetch helpers. Decisions 16-18 added to the proposal doc. tsc clean. All M6 screens previewable now via the dev role switcher.

2026-06-12 late night (M6 part 1, role dashboards live behind the dev switcher): Owner opened the M6 gate. Built server-side role resolution (role-server.ts; dev cookie now, Clerk+users table when AUTH_MODE=clerk), role-branched /dashboard, and the three role dashboards (coach scoped via getCoachDashboardData, sales with awaiting-source DM section, va ops landing) + owner previews at /sales-dashboard and /va-dashboard. Coach toolset added to coach nav as placeholders; VA nav gained Tasks. IMPORTANT BUGFIX: middleware password gate no longer intercepts /api/sync and /api/webhooks (cron and GHL webhooks cannot carry the gate cookie; both have their own secret auth). New default decisions 11-15 in the proposal doc. tsc clean. Clerk wiring itself deferred to activation (needs real keys; test against gate + iframe). Preview now: dev role switcher, roles render real data.

2026-06-12 night (webhooks + yesterday deltas, still behind flag): Webhook receiver at POST /api/webhooks/ghl: tolerant payload parsing (native subscription + workflow shapes), refetch-by-id (fetchContactById/fetchOpportunityById added to ghl/client, uncached), contact delete soft-marks 'past', opportunity delete removes the lead row, sync_events logs type+id only (payloads can carry PII). Digest "yesterday" now real when snapshots exist: getDailyDeltas reads the latest daily_snapshots row, DigestData.daily, view shows a Yesterday stat trio + headline switches from "this month" to "yesterday"; falls back cleanly when null. vercel.json cron hits /api/sync/ghl daily 19:55 UTC (5:55am AEST, pre-digest); route gained a GET handler for Vercel cron. New default decisions 8-10 flagged in the proposal doc. tsc clean. Everything inert until HQ_PERSISTENCE=true; webhook also needs GHL_WEBHOOK_SECRET + a GHL workflow webhook action (owner drives GHL settings).

2026-06-12 evening (M5 phase 2 code-complete behind flag): Owner opened the schema gate with "sensible defaults, flag choices". Built: supabase/migrations/20260612000001_initial_schema.sql (11 tables, RLS on with zero policies = service-role only, updated_at triggers, checks not enums); src/lib/db (service-role client + row mappers, computed fields still derived at read); src/lib/sync (ghl-sync upserts clients/coaches/leads on GHL ids, absent rows logged not flipped; snapshot writer for daily_snapshots); POST /api/sync/ghl (CRON_SECRET or Vercel cron auth, inert while HQ_PERSISTENCE=false); loadLiveData reads Supabase when flag on, falls back to GHL-direct on error or empty table. Also: DATA-MODEL.md billing-fields doc fix; docs/supabase-schema-proposal.md carries the 7 flagged default decisions. tsc clean. NOTHING APPLIED: no Supabase project touched, flag default false, prod path unchanged. Earlier sessions today: Daily Digest live + VA cleanup checklist (54 rows, data-imports/). GIT NOTE: .git/index.lock blocks sandbox commits; everything since 404201a is uncommitted, owner commits in Terminal.

2026-06-12 later still (real-system pass, part 2): Daily Digest now LIVE through the facade: new getDigestData() in src/lib/data.ts (one flat DigestData shape, demo and live), DigestView is now presentational (props, no seed imports), page is an async server component. Live values: gained/lost (30d), paused, MRR, refunds/past-due (honest zeros until Stripe), pipeline counts from live leads (calls booked = Call Booked stage), renewal calls due this week + re-sign window count reusing getRenewals (links to /renewals), payouts count. Handovers are HQ-native so 0 in live. Copy updated: "this month" not "yesterday" (no daily snapshots until Supabase phase), seed-only "June challenge" line removed. tsc clean; dev-boot + lint not runnable in the sandbox (Linux swc binary unavailable offline), owner to verify /daily-digest locally. REMAINING from this pass: client-detail Billing tab live fields was DONE earlier per handoff; next is VA data cleanup support / coach capacities / pipeline import.

2026-06-12 later (real-system pass, part 1): Dashboard time controls now LIVE: Weekly/Monthly/Quarterly/Yearly period toggle and 1M/3M/6M/1Y ranges + Compare all compute true historical MRR from client start/end dates (activeAt sampling; cancelled history makes the curve real). New /renewals screen (owner nav, OPERATIONS): re-sign call list of active clients with term end in window (-7d..+45d), overdue/this-week highlighting, links to client detail; live selector getRenewals + facade + seed fallback. Fixed live coach names in Client Database (was showing Unassigned for ghl-co-* ids; coachNameLoose helper). Coach Performance adherence/response now read "awaiting feed" instead of 0% (Kahunas has no API). STILL TODO from this pass: Daily Digest live wiring; client-detail Billing tab live fields.

2026-06-12 (M5 phase 1 complete, live in production + embedded in GHL): Password gate (cookie-based, iframe-safe) live on Vercel; GHL_API_TOKEN/NEXT_PUBLIC_DEMO_MODE/HQ_ACCESS_PASSWORD in Vercel env. Cancelled history (377) imported into GHL: retention/churn now real (lifetime retention ~50%; per-coach retention powers the leaderboard; net-change lost scoped to 30d via Term End Date; Client.endDate added). All core projection screens live: Dashboard, Client Database (+detail), Pipeline, Client Journey, Coach Overview, Coach Performance, Financials. Embed mode: middleware detects Sec-Fetch-Dest iframe (or ?embed=1) and the (hq) layout drops sidebar/topbar inside GHL; six GHL Custom Menu Links now host the screens as native tabs (DP DASHBOARD HQ portal + 5 per-screen tabs). Verified inside GHL. KNOWN DATA ITEMS for VA: ~14 active clients flipped to Cancelled by duplicate-email merges (see import-exceptions.csv); June-2026 clients show Unassigned coach where the tracker had no coach value. Coach maxCapacity still defaults to 30 pending real numbers.

2026-06-11 (M5 phase 1, owner-triggered): Imported the real DP client base into GHL via the import wizard (423 active+paused from the merged master sheet + renewal tracker; all workflows confirmed Draft first, zero outbound messages; smart list created for VA cross-check; duplicate emails merged by GHL, see import-exceptions.csv). Built the live GHL data layer: src/lib/ghl/client.ts (API v2, paginated, 5 min cache), src/lib/ghl/map.ts (16 custom fields -> Client/Coach, MRR maths weekly x52/12, journey stage derivation, stage mapping), src/lib/live (async selectors matching seed shapes), src/lib/data.ts (demo/live facade). DEMO_MODE is now env-driven. Dashboard + Client Database (list/detail) swapped to the facade. Types: Plan + "Monthly", LeadSource + "TikTok" (pill styles added). tsc clean. VERIFIED LIVE locally (owner token in .env.local): dashboard shows the real book ($137.9k MRR, 392 active, 24 paused, +63 this month, 39 expiring 30d, real coach roster). Fixed: GHL date custom fields arrive as epoch ms (toIsoDate in map.ts). Known gaps: coach maxCapacity defaults to 30 (need real capacities), retention pegged 100% until cancelled history is imported, cash collected = MRR run-rate until Stripe feed. Remaining for go-live: Vercel env vars + Basic Auth gate, then swap the GHL menu link.

2026-06-06 (role decisions, spec update only): Dropped from 5 to 4 login roles. Ambassador is no longer a login role (now an owner-facing, view-only data area; the Ambassadors screen under BRAND stays). Updated BUILD-SPEC, DATA-MODEL User entity, and CLAUDE.md to 4 roles (owner/coach/sales/va). Finalized the M6 role dashboard specs in BUILD-SPEC (Owner confirmed matches built; Coach; Sales incl. a DMs section flagged awaiting-live-source; VA). Config edits to navigation.ts: removed the `ambassador` role from the Role enum/ROLES/ROLE_CONFIG and removed the "Ambassador Dashboard" owner nav item (the dev role switcher now shows 4 roles). No screens built; M6 stays gated on auth. tsc + lint clean.

2026-06-05 (demo-readiness pass): Polish + consistency + redeploy; no new features, M5/M6 untouched.
1. Consistency sweep across all 34 owner screens at 1280/1440/1920: zero page-level overflow; pills correct in both themes; empty states sensible (verified the all-zero dashboard); no stray TJD copy (only the brand.ts comment). One real fix: revenue AreaChart Y-axis $ labels clipped the 48px band, now compact ($30k) with full value still in the tooltip.
2. Seed realism: aligned the revenue trend + comparison series to the actual MRR ($14,080) so the chart matches the Recurring revenue/MRR KPIs (was ~$48k, mismatched). Added a subtle "Demo data" topbar badge gated by DEMO_MODE (src/lib/demo.ts), trivial to remove at M5.
3. Redeployed to https://tjd-fit-hq-app.vercel.app (public, seed only, keys are Vercel env vars). Browser-QA'd live in light + dark, no errors.

2026-06-04 (spec-drift audit + reconcile): Produced DRIFT-AUDIT.md (build vs spec). Findings: after the refinement pass, little pure build-not-spec drift remained; main gaps were (a) 5 coach tools from the prototype (My Pay, Quizzes, Academy, Calculators, Coach Assistant) not in spec or build, and (b) 3 owner role-preview dashboards (Sales/VA/Ambassador) that were nav placeholders with no screen. Reconciled per owner (spec only, no app code): added the 5 coach tools to BUILD-SPEC M6 Coach view (prototype provenance noted); noted the 3 owner dashboards are specced as part of M6 and stay placeholders; SOPs stays dual-homed. Verified Calculators is NOT built (the working Calculators view is only in the prototype; /calculators serves the catch-all placeholder). Deploy request paused pending this audit.

2026-06-04 (owner refinement pass): Worked 5 owner-review items, committed per item.
1. KPI overflow fixed globally in the Kpi primitive: numbers >= 10k abbreviate ($14.0k / 1.25M) with the full value in title, and .kpi font scales to the card via container queries (no overflow on the 7-up row).
2. Revenue trend gained a working Custom range (date pickers) and Compare (last year / previous period / custom) rendering a muted comparison series with legend + delta summary ("+22% vs last year"). AreaChart primitive extended; seed gained last-year + prev-period arrays.
3. Rebranded this build to DP Performance through the central BRAND config (added ownerFirstName/ownerEmail/handle; refactored hardcoded title + digest values into it; updated seed mock handles). Still one BRAND swap from TJD Fit. Internal localStorage keys (tjd-*) left as-is.
4. Sidebar brand lockup realigned (logo mark on the nav row edge, wordmark on the nav-label column, footer avatar aligned).
5. Added Coach Leaderboard (by retention, with avg length/churn/active/capacity + movement, links to Coach Performance) and Sales Leaderboard (setters/closers, sortable by cash or close rate). New SalesRep seed entity documented in DATA-MODEL.md (flagged for M5 schema) and leaderboards noted in BUILD-SPEC.md.

Also removed a stray Playwright QA script + devDependency that an auto-created wip checkpoint (b3aab61) had leaked into the repo. Verified: tsc + lint clean, dev boots, dashboard browser-QA in light + dark with no errors.

STOPPING for owner review. M5/M6 still gated/deferred; M8 (rebrand-per-client config now proven via DP swap + deploy) still outstanding.

Earlier 2026-06-04 (sidebar + M7): Added Inbox, Tasks, Client Audits, Daily Digest, and Merch to the owner sidebar (navigation.ts is now the source of truth; BUILD-SPEC updated to match). Kept the topbar/contextual entry points. Owner sees all; non-owner roles stay scoped.

Then completed M7 states hardening: Skeleton + ErrorState primitives; a shared (hq)/loading.tsx plus tailored loaders for the 8 core screens; error boundaries at (hq)/error.tsx (in-shell, retry), app/error.tsx, and app/global-error.tsx (no PII in logs). Empty states were already in place from M3/M4. Verified with a clean production build (40/40 pages) and lint/tsc clean. Note: in dev, Next's own error overlay masks the custom error.tsx (the boundary scope is correct, the shell persists); the styled ErrorState renders in production.

M5 (GHL) and M6 (roles) are DEFERRED by owner until the real data sheets exist and auth is set up; both are gated and the owner will trigger them explicitly.

M7 complete. STOPPING for review.

Earlier 2026-06-04 (M4): Built all 22 secondary screens on the seed layer (extended via src/lib/seed/m4.ts). Inbox (3-pane mock), Tasks, Client Audits, Daily Digest, Calendar, Call Calendar, Content Planner, Content & Collaborations, Marketing & Campaigns, Automations (toggles persist, do not execute), Analytics, Reports (+ /reports/[id] detail), Sales Performance, document stores (Brand Assets, SOPs, Contracts, Brief, Merch), Brand, Building the Brand, Building the Team, Referrals, Social Media, Ambassadors, Team, Settings.

Decision worth owner review: Inbox, Tasks, Client Audits, Daily Digest, and Merch are NOT in the exact approved owner sidebar. They are reachable by URL plus entry points (topbar Inbox + Daily Digest icons; dashboard "Today's focus" -> Tasks; Coach Overview -> Client Audits). To support this, owner now bypasses the RouteGuard (full access); non-owner roles stay scoped to their nav. If you want any of these in the sidebar, say so and I will add them.

All write/integration actions are stubbed (upload, connect, new X, toggles) with comments. Verified: tsc + lint clean, dev boots, browser QA (Inbox, Automations, Analytics, Calendar, Settings) in light + dark with no errors.

M4 complete. STOPPING for milestone review per the session protocol. NOTE: M5 (GHL integration) is a HARD GATE (data model + secrets) - do not start without owner go-ahead.

Earlier 2026-06-03 (M3): Built all 8 core screens on a typed in-repo seed layer (Option A; no real Supabase tables, by owner decision, to design the schema once at M5 with the client's real sheets).

Seed: src/lib/seed (types.ts + index.ts) is the single swap point; screens read only through selectors (getDashboardMetrics, getClients, getFinancials, getCoachScorecards, ...). Uses real check-in codes SM/Y/F/G/M/P/C/N (labels provisional). Computed fields derived, never stored.

Screens: Dashboard (KPI rows, revenue area chart, coach capacity bars, pipeline/social/today panels, ?state=empty empty variant); Pipeline CRM (Kanban + Table, source colors, aging); Client Database (status tabs + roster + /client-database/[id] detail scaffold with Overview/Check-ins/Results/Billing); Client Journey Tracker (lifecycle board); Coach Overview (cards, search/sort/tabs); Coach Performance (scorecard table); Results Tracker (approval state machine, local optimistic advance); Financials (KPIs, revenue chart, plan breakdown, payouts + transactions tables). New primitives: EmptyState, Panel.

Write actions (coach reassign, assign clients, advance transformation) are stubbed/local with comments marking the M5 Supabase write. Verified: tsc + lint clean, dev boots, browser QA across screens in light + dark with no errors.

M3 complete. STOPPING for milestone review per the session protocol before starting M4.

Earlier 2026-06-03: Committed the self-directing system (BUILD-SPEC.md + PROGRESS.md + CLAUDE.md session protocol), then built the M2 Owner Shell, completing M2.

Shell built: fixed 240px sidebar (Fraunces logo + tagline from src/lib/brand.ts, search box, grouped scrollable nav, theme toggle + profile pinned bottom); topbar (Cmd+K search affordance, dev role switcher, Record Loom, + Add client, bell, avatar); icon set in src/lib/icons.tsx; nav + role architecture in src/lib/navigation.ts (ROLE_CONFIG, owner full nav per spec + reduced coach/va/ambassador/sales navs). Routing via a route group app/(hq)/ with a [...slug] catch-all rendering a "Coming next" placeholder; built screens will get their own folders (precedence over the catch-all). Root / redirects to /dashboard. RouteGuard redirects wrong-role routes to the role default. RoleProvider holds the dev-only role preview (localStorage, default owner; NOT auth).

Verified: tsc clean, lint clean, dev server boots. Browser QA: owner shows 32 nav items with correct active highlighting; switching to coach reduces nav to the exact 7 coach items and redirects off /financials to /dashboard; light + dark both correct.

M2 complete. STOPPING for milestone review per the session protocol before starting M3.

Prior sessions (recap): scaffolded Next 15 app; downgraded to Next 15 / React 18 / Tailwind 3; wrote DATA-MODEL.md; built tokens + theming + /style-guide; built the primitive component library; added the self-directing build system.

## Last session summary (2026-06-16, Cowork)
Connected the coaching-data path PROGRESS had marked deferred ("Kahunas has no API"). Kahunas has no REST API but is a Zapier app whose triggers are check-in forms, so: built /api/webhooks/kahunas (shared-secret intake) and a coach-log CSV importer (scripts/import-coach-log.mjs, dry-run by default) that links each client to their coach and loads weekly check-in codes + transformations. Realigned the check_ins model to the real coach-log format (weekly status codes SM/Y/F/G/M/P/C/N, matching CheckInCode; adherence kept as an optional Kahunas field). Wired the live read end to end: getCheckIns + getTransformations live readers; the coach Check-ins screen shows real codes; the coach Results view AND the owner Results Tracker both read live transformations (client/coach names resolved at read time, so the view no longer reaches into the seed layer); coach scorecard adherence is now derived from recent check-ins (Y vs G/N over 8 weeks, "awaiting feed" preserved when there is no signal). QA pass of the deployed app (docs/qa-findings-2026-06-16.md): clients are live/real but all "Unassigned" and coaches are placeholder names, which the importer fixes. Removed a stray dev "Empty state" toggle from the dashboard header, and clamped the dashboard coach-capacity bar (over-capacity coaches now render in warn instead of overflowing). All tsc + eslint clean. Everything is uncommitted (the sandbox cannot hold the git lock), commit host-side. The owner-approved migration was refined: 20260616000001_check_ins.sql, NOT yet applied to the live DB.

## Round 16 self-review (2026-09-21)

1. Items: R16-0 done (a5e2691) · R16-1 done (diagnosis a5e2691, sync fix e1e77b8, 50 writes applied a65426e; 2 B rows + 2 stubs held for Dan) · R16-2 built (b9369a3, ac24780), gated on migrations 20260921000001/2/3 + `remap-checkin-codes.mjs --apply` (DP 196 rows; TJD count needs Kai's key) · R16-3 done (91a90f6) · R16-4 c+d done (5dcf47b), a+b HARD STOP (roles; proposal in ~/tjd-fit-hq/R16-4-PROPOSED-ROLES-DIFF.md) · R16-5 done (01665a3) · R16-6 built (b60088c), (a) gated on migration 20260921000004 · R16-7 done (abc1cae). Nothing skipped.
2. Acceptance checks run: `npx tsc --noEmit` clean; `npx vitest run` 22 files / 248 tests pass; `npm run lint` only the pre-existing writeback.ts warning; `npx next build` compiled, 68 pages; importer parse-only byte-identical before/after the parser extraction; sheets:diff self-test against Perry's June export (15 added, 2 cadence, 311 cells); roster-diff before/after (unassigned active 110 -> 65); apply-roster-fixes 50 written / 0 failed with 50 audit rows verified in sync_events.
3. Cross-check greps (diff 4155e61..HEAD): no hardcoded hex in components; no new roster query on clients without the active-only default (the three added `from("clients")` calls are id-scoped single-row reads/updates and the sync's existing-row read); no console.log of client name/email/phone; no GHL write anywhere (writeback.ts still stubbed); no "SM" left in code (only SOP prose); no em dashes in added UI copy.
4. Dev server (AUTH_MODE unset, dev-role cookie): /dashboard, /check-ins, /pauses, /coach-overview, /coach-overview/<angus>, /client-journey, /client-journey?filter=unassigned, /assign-clients, /renewals, /engagement all 200 as owner; as coach (Angus) and as ops_manager every listed route 200, no server errors. Caveat: the preview cookie keeps realRole = owner, so it exercises the role shells, not the ops_manager redirect in R16-4a.
5. Perry 24 -> 33, Angus 58 -> 62 portal active (applied, not just dry-run).
6. HARD STOPS awaiting Kai: (1) "apply 20260921000001" then "remap --apply" then "apply 20260921000002" (R16-2c); (2) "apply 20260921000003" (R16-2f notes); (3) "apply 20260921000004" (R16-6a term end); (4) "go R16-4 roles"; (5) Dan's calls: Sophie Hassell / Lisa Jansen (Cody Philip vs Stephen), the shared "olivia" stub, Ashley Donner, milestoneCallsAfterWeek value; (6) "deploy R16" once 1-3 are applied on BOTH brands.

## Next item

See CURRENT STATE at the top of this file: the pending owner decisions there are the next work (TJD items are in the local-only `private/TJD-BUSINESS-NOTES.md`). Everything below is historical.

Round 17 is deployed to DP. Nothing is gated. Open threads are owner decisions, not code: the three ASK DAN clients in ~/tjd-fit-hq/R17-1-GHL-FIXES-FOR-JAMEELA-2026-09-22.csv, whether a MISSED check-in pays the week (M is still deliberately absent from PAY_RULES), whether the Engagement tab stays visible to va/ops_manager (BRAND.engagement.visibleTo), and the two GHL hygiene lists (122 start dates, 97 expired terms). Legacy notes below this line are historical.

Round 17 is built and waiting on the five releases listed in the self-review above. Nothing deploys until "deploy R17". Legacy notes below this line are historical.

Owner decisions, nothing code-blocked: (1) the three clients marked ASK DAN in ~/tjd-fit-hq/R16-1-GHL-FIXES-FOR-JAMEELA-2026-09-22.csv (Jasmine Clarke, Sophie Hassell, Lisa Jansen); (2) does a MISSED check-in pay the week (M is deliberately absent from PAY_RULES, see FEEDBACK-V2 R16-2c); (3) Jameela works the rest of that CSV in GHL, 4 Coach fixes + 4 Start Date corrections + 19 Status fixes, until the Coach field is right the nightly sync keeps reverting portal assignments. Legacy notes below this line are historical.

R16-3 (pause end date does not persist), then R16-4..R16-7 per the brief. Owner gates outstanding: apply migrations 20260921000001 -> remap --apply -> 20260921000002 -> 20260921000003, then deploy R16-2 to both brands. Legacy notes below this line are historical.

---

2026-08-05: OWNER REVIEW + SHIP of the complete V2 build (P0 + A-G + H1 + H2; per-item notes in FEEDBACK-V2.md). The V2 definition of done is reached in code. To ship: (1) `vercel --prod` (all commits local on master; TJD deploy = same codebase, NEXT_PUBLIC_BRAND=tjd), (2) apply migrations 20260804000001 (transformation send-back), 20260804000002 (task statuses/opened_by + audit feedback/loom), 20260804000003 (renewal notes), 20260805000001 (coach_capacity), (3) answers from Dan on open questions 1-8. Parked pending sign-off: H3 Meta ads, H4 Xero, H5 Google Calendar, Phase I (assistant bubble, check-in grid), compatibility auto-assign.

Previously: 2026-07-10 head-coach elevation review: apply migrations 20260709000001 + 20260710000001, ANTHROPIC_API_KEY in Vercel lights up Coach Assistant + Loom Summaries.

Previously: 2026-07-03 effortless-lists pass is committed locally on master; `vercel --prod` (or the owner's usual deploy) ships it to the team. Otherwise unchanged: see "LIVE ROLLOUT (2026-07-02)" at the top: the app is live for the team. Open threads, in order: (1) Dan's Typeform OAuth in Zapier → finish + publish the TikTok Zap, duplicate for Instagram; (2) Dan's WhatsApp Coexistence + Meta login in GHL → verify Inbox; (3) owner git-lock cleanup + commit + redeploy; (4) VA starts the weekly check-in import cadence (docs/va-weekly-checkin-import-runbook.md); (5) later: rotate flagged secrets, Claude API key for Coach Assistant, Stripe/financials, TJD Fit rebrand deploy. Everything below this line is history.

## Prior next-item notes (superseded 2026-07-02)
2026-06-16 (Cowork) also deepened Settings: the Integrations tab now shows REAL connection status computed server-side (GHL, Supabase, Stripe via their *Configured() helpers; Kahunas via KAHUNAS_WEBHOOK_SECRET; Clerk via AUTH_MODE) plus the spec'd not-yet-connected ones (Calendly/Zoom/WhatsApp/Typeform/ManyChat/Google Calendar), read-only (no secret entry in-app). Added the Security tab: auth mode (Clerk vs password gate) + the four roles with their access scope and screen counts from ROLE_CONFIG. tsc + eslint clean. Reviewed the rest of the owner's list: Automations (systems) is already built to spec (toggles persist, engine is the later/gated phase); Social Media is built but seed-only (no social API); Pipeline is built but empty until GHL opportunities exist. So those three need either data or an explicit spec for deeper functionality.

Owner then picked three UI-depth builds, all now done + tsc/eslint clean: (1) Settings Notifications (toggle list), Profile, and Billing tabs built out (no longer "wired up later"); (2) Pipeline lead detail drawer (click any Kanban card or table name) + a read-only Stages view (mirrors the GHL pipeline with per-stage counts/value); (3) Automations per-rule detail/editor drawer (When -> Then layout, cadence, replaces-VA-task, enabled toggle wired to the list). All still read-only/local where writes would need the engine or GHL write-back. Social was deliberately skipped (no API; persisting manual stats needs a table = owner sign-off).

Then wired the client detail Check-ins + Results tabs to live check_ins/transformations (new per-client facade getClientDetailData), and added the outreach kill-switch (src/lib/outreach-guard.ts, OFF by default) that enforces the owner's NO-CONTACT rule across every send path (also recorded in CLAUDE.md Security + the Stage 2 brief). CONCLUSION (owner direction: finish all backend coding before integrations): the non-integration backend coding is COMPLETE. Every owner + role screen is built and type-checked; the only remaining stubs are integration write-back points (coach assign, start date, send message, export) which are the deliberate next phase, plus a minor academy quiz-runner deferral. NOTE: "role-dashboards" is a components folder (coach/sales/va dashboard views, already built + wired via /dashboard, /sales-dashboard, /va-dashboard), not a missing route. Everything is uncommitted: Daniel pushes host-side (commit + push auto-deploys), THEN the integration phase (keys in Vercel, Kahunas Zap, check_ins migration + importer, GHL write-back per docs/ghl-twoway-integration-brief.md).

2026-06-21: Tasks screen now does real CRUD on the Supabase tasks table. src/lib/tasks-actions.ts is the full write layer (create / update / set-status / delete) via dbAdmin, each gated on persistenceEnabled() with honest "persistence off" messages and revalidatePath('/tasks'); src/lib/tasks.ts is the read layer (listTasks now embeds users(name) for the real assignee, exposes assigned_to, plus listTaskAssignees). The view (tasks-view.tsx) is rebuilt on the useOptimistic reducer pattern (matches content-planner-board): New task, the checkbox (open<->done), click-title-to-edit, and delete all apply optimistically then persist; Mine/Team + Type filters and the due-date buckets still drive off the optimistic list. Assignee picker is honest-by-absence: it only renders when users rows exist (none until Clerk logins), so no dead dropdown. Page gates writes on liveMode() && persistenceEnabled() like the other live document stores; reads go live whenever persistence is on. No schema/migration change (the tasks table + assigned_to FK already existed); added one optional field assignedTo? to the shared Task type. tsc + eslint clean, /tasks compiles and serves 200.

OWNER STEPS to light up the coaching data, in order:
1. Re-apply supabase/migrations/20260616000001_check_ins.sql (schema refined to the code model).
2. Run the importer per coach log: `node scripts/import-coach-log.mjs "<Coach> - Check In Log....csv"` (dry-run first), then add `--commit`. Damon's log = 59 clients, 865 check-ins, 3 transformations. Send the other coaches' logs to map the rest. This fixes the "Unassigned" clients (QA #2) and lights up Check-ins, Results, and coach adherence.
3. Connect the Kahunas account in the paused Zapier Zap (the Kahunas -> Checkin Forms trigger is set; it needs the Sign in), then finish the Webhooks POST action and set KAHUNAS_WEBHOOK_SECRET in Vercel. See docs/kahunas-integration.md.

DEFERRED (noted, not done): real coach names/stats (the 10 are first-name placeholders, Damon = Damon Astuti confirmed; needs the full roster + last names); lowercase client names left as-is to avoid mangling McGann / O'Brien; per-client check-in timeline on the client detail page (best built once data is flowing so it can be verified against real history). Pipeline and sales stay 0 until GHL opportunities exist. NOTE: all live-read work is type-checked but not visually verified (no check_ins/transformations data until the migration + importer run); verify on the deployed app after step 2.

PRIOR (still open):
M5 phase 2 is LIVE (Supabase persistence + daily sync in prod). Current state as of 2026-06-15:

IN PROGRESS (Claude Code, tested loop): two-way GHL integration per docs/ghl-twoway-integration-brief.md. STAGE 1 READ code is now COMPLETE (live Inbox + Calendar + Call Calendar; see the "GHL two-way integration" section above) but UNVERIFIED against real GHL because .env.local still holds the old read-only token. IMMEDIATE NEXT STEP (owner): paste the "DP HQ Sync v2" token into GHL_API_TOKEN in .env.local (and Vercel), then tell Claude Code to re-probe + verify Stage 1 live and tune the mappings against real response shapes. Only after that, Stage 2 write (send messages + client write-back via src/lib/writeback.ts), every write confirm-gated + test contact first.

WAITING ON OWNER / DAN (each unblocks a track):
- M6 logins: Clerk keys (pk/sk + Clerk domain) from Dan -> follow docs/auth-activation.md, run migration 20260615000001_invites.sql, then invite the team from the Team screen (no manual users SQL needed). Auth gate is owner-opened.
- Coach capacities: Dan's real per-coach numbers -> src/lib/coach-config.ts COACH_CAPACITIES.
- Sales/pipeline: owner imports leads/opportunities into GHL -> sales screens light up (Lilli=closer/Lucas=setter already in sales-config.ts).
- Financials cash/refunds/past-due: needs a Stripe key + integration (NOT built).
- GHL embed: add the 6 remaining menu links (data-imports/ghl-hq-menu-links.md).
- VA data cleanup: 54 flagged clients in data-imports/va-cleanup-checklist.xlsx (sent to Dan).

NOT STARTED / DEFERRED: domain mapping (rawandformed.com/crmprototype1, needs hosting info), TJD Fit second deploy (BRAND swap), hiding GHL default tabs (plan-level SaaS only), social stats (no APIs), check-ins/adherence/transformations (Kahunas has no API). Owner go-ahead already given for M6 auth and write-to-GHL.
Previously: awaiting owner direction. Two open threads:
- DEPLOY (M8): DONE to Vercel at https://tjd-fit-hq-app.vercel.app (public, DP Performance build on seed). REMAINING: map it to rawandformed.com/crmprototype1, which needs the owner to say how rawandformed.com is hosted. If that domain is on Vercel, add a rewrite or a path/domain alias; otherwise reverse-proxy /crmprototype1 to the vercel deployment. A true subpath app also wants basePath: "/crmprototype1" + redeploy. Also note: real auth/data still placeholder (M5/M6).
- M5 (GHL) and M6 (roles) remain GATED and deferred until the owner triggers them with real data sheets + auth. M6 now also covers the 5 coach tools and the 3 owner role-preview dashboards (spec'd, not built).
Do not start M5/M6 or deploy without an explicit owner go-ahead.
