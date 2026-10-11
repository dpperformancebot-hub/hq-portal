# DP Performance HQ — Portal Completion Audit

Honest, code-verified status of the portal as a central operating hub. Audited against the codebase (the source of truth), not PROGRESS.md (which is stale on the newest work). Verified 2026-06-30.

## RE-AUDIT — 2026-06-30 (post-finalisation, code-verified)

Re-verified the six finalisation commits against the actual code (not the commit claims). All six land as intended; nothing is broken or falsely "live". `tsc --noEmit` passes; working tree clean.

| # | Item (commit) | Status | One-line verification |
|---|---|---|---|
| 1 | Reusable CSV export (`d9a5a1c`) | **DONE** | `src/lib/csv.ts` + `DataTable.exportFilename` (csvValue → sortValue → key, with csvExclude) genuinely wired on all 11 named screens: Client Database, Check-ins, My Clients, My Pay (ledger + pay-log grid), Coach Overview, Coach Performance, Renewals, Client Audits, Financials, Sales Performance, Pipeline. Server-rendered tables use the `DownloadCsvButton` island with `rowsToCsv`. Not just the helper existing — every screen exposes it. |
| 2 | In-portal check-in logging + client notes (`01f8a67`) | **DONE (gated on migration 1)** | `LogCheckInForm` + `ClientNotesPanel` mounted in owner client-detail, coach client-detail, and Check-ins. Actions (`check-in-entry-actions.ts`, `client-notes-actions.ts`) are service-role, gated on `persistenceEnabled()`, author derived server-side, NO outbound path; fail closed with an honest "apply migration 20260630000001" message keyed to the exact constraint (23514) / missing-relation (42P01) errors. Upsert conflict target `(client_id,submitted_at,source)` already exists as a unique index. |
| 3 | New-X stores migration + honest stubs (`8e693d4`) | **DONE (stubs honest; not wired by design)** | Migration `20260630000002` creates reports/brand_build_tasks/hires/campaigns/lead_magnets. All five New-X buttons (Reports, Building the Brand, Building the Team, Marketing campaign + lead magnet) are `disabled` with a tooltip naming `20260630000002`. The new tables are read by nothing yet — consistent with "honest stub", not a fake-live screen. |
| 4 | Review-tick + notification persistence (`8309b25`) | **DONE (gated on migration 3)** | `setCheckInReviewedAction` wired in Check-ins, `setNotificationPrefAction` wired in Settings; both best-effort + gated. Read layer (`local-state.ts`) returns empty pre-migration so localStorage stays the fallback; pages pass `reviewedIds` / `savedPrefs`, and DB state wins over localStorage when present. Needs migration `20260630000003`. |
| 5 | Impersonation exit returns to origin (`545f375`) | **DONE** | `startImpersonation(coachId, returnTo)` stores an `hq-impersonate-return` cookie; `stopImpersonation` redirects to it (`safeReturnPath` blocks open-redirect; falls back to `/coach-overview`). There is exactly ONE "Open their portal" caller (`coach-overview-view.tsx`) and it passes `usePathname()` as returnTo. No un-passed call sites. |
| 6 | SOPs flagged external (`0099a13`) | **DONE** | Coach SOPs view shows an honest "3 of ~22 ported, rest on the external SOP library" card linking `sop-library-six.vercel.app`; `docs/sops-port-status.md` lists ported vs missing by category. Verified the repo (and prototype) contain only those 3 SOP bodies — nothing left to port in-repo. |

### OWNER MUST APPLY THESE MIGRATIONS TO ACTIVATE (written, NOT applied)

Three migrations are committed but not applied. Until the owner applies them (`supabase db push` / SQL editor), the features above are BUILT but INERT and fail closed with an honest on-screen message. This is the owner's key action list:

| Migration | Activates | Stays non-functional until applied |
|---|---|---|
| `20260630000001_client_notes_and_manual_checkins.sql` | client_notes table + check_ins 'manual' source | In-portal "Log check-in" form (rejected by source constraint) and "add client note" form (missing relation). Both show "needs migration 20260630000001". |
| `20260630000002_brand_marketing_reports_stores.sql` | reports / brand_build_tasks / hires / campaigns / lead_magnets tables | New-X buttons stay disabled stubs. (Note: tables alone do not finish these — the buttons still need wiring after the migration, same pattern as the document stores.) |
| `20260630000003_local_state_persistence.sql` | check_in_reviews + notification_prefs tables | Coach check-in review ticks and Settings notification toggles persist to localStorage only (per-browser), not the DB. No data loss — localStorage is the working fallback. |

### Updated headline

**~92% complete as an internal operating hub.** Every owner and role screen is built and the app runs LIVE (real Clerk auth, real GHL reads, Supabase persistence on). The finalisation pass closed the two largest in-code gaps (CSV export everywhere; in-portal coach data entry). What genuinely remains splits into:

- **Owner-gated (one action, code complete):** apply the three migrations above to switch on in-portal check-in/notes entry and DB-backed review-tick/notification persistence.
- **Code-remaining (small):** wire the 5 New-X buttons after migration 2; file upload for Brand Assets + transformation photos (Supabase Storage, Phase 2); Reports detail body.
- **External-feed-gated (not code — needs Dan / a key):** Stripe (Financials depth), GHL leads/opportunities (Pipeline / Sales / Analytics), Kahunas (live check-ins + exact pay-by-status), social APIs (Social Media), remaining coach capacity/log data, the rest of the external SOP library, Clerk team rollout.

**No NO-CONTACT, secret, or gate violations introduced.** None of the new files have an outbound/contact path; no `.env`/secret files were touched by the six commits; every new write is service-role + `persistenceEnabled()`-gated.


## UPDATE — 2026-06-30 finalisation pass (gaps closed)

This audit's "to finalise" list has now been worked through (see PROGRESS.md "Portal finalisation"):

1. **CSV export — DONE, broadly.** No longer "exactly one screen". A reusable helper (`src/lib/csv.ts`) + `DataTable` `exportFilename` prop now export the currently filtered/sorted rows on: Client Database, Check-ins, My Clients, My Pay (ledger + pay-log grid), Coach Overview, Coach Performance, Renewals, Client Audits, Financials (payouts + transactions), Sales Performance, Pipeline. (Export columns in the tables below now read **CSV** for these.)
2. **In-portal data entry — BUILT, behind a gated migration.** Coaches/owners can log a check-in and add client notes from the client profile and Check-ins screen. Needs owner migration `20260630000001` (client_notes + check_ins 'manual' source).
3. **"New X" buttons — migration written, honest stubs.** Reports / Building the Brand / Building the Team / Marketing need migration `20260630000002`; buttons now name it.
4. **localStorage → DB — BUILT, gated.** Check-in review ticks + Settings notification toggles persist to the DB once owner migration `20260630000003` is applied (localStorage stays the fallback until then).
5. **SOPs — nothing more in-repo to port.** Still 3 of ~22; the rest are external. The view now flags this honestly; `docs/sops-port-status.md` lists what the owner must export.

**Owner action — three migrations to apply (written, NOT applied):** `20260630000001_client_notes_and_manual_checkins.sql`, `20260630000002_brand_marketing_reports_stores.sql`, `20260630000003_local_state_persistence.sql`.

**Headline: ~90% complete as an internal operating hub.** Every owner and role screen is built, the app runs LIVE (real Clerk logins, real GHL data, Supabase persistence on), and the HQ-owned operational layer (tasks, audits, transformations, content, documents, coach assignment, team invites, owner-impersonates-coach) does real create / edit / delete to the database. The remaining 10% is: CSV/export coverage (only one screen has it), a handful of "new X" buttons on minor brand screens that are not yet wired, and feeds that depend on outside systems (Stripe, social APIs, GHL sales pipeline, Kahunas check-ins).

> **Live config confirmed in `.env.local` / deploy:** `AUTH_MODE=clerk`, `HQ_PERSISTENCE=true`, `NEXT_PUBLIC_DEMO_MODE=false`, live `GHL_API_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` present. So the gates PROGRESS.md still describes as "pending" (Clerk auth, Supabase persistence) are in fact ON. PROGRESS.md last reflects ~2026-06-21 and predates: real Clerk auth, owner-impersonates-coach ("Open their portal"), the interactive check-in log, accurate per-coach My Pay, and sortable/clickable tables.

---

## STATUS LEGEND

- **Live** — built and reading real GHL/Supabase data.
- **Seed-only** — built and working, shows demo data until an outside feed exists.
- **Stub** — honest placeholder / disabled control (says so on screen).
- Read-only vs write noted per screen, with the write path named.

---

## STATUS TABLE — by area

### Operations

| Screen | Status | Data writes (path) | Export |
|---|---|---|---|
| Dashboard | Live | read-only | none |
| Inbox / Conversations | Live (read), send disabled | read-only; Send is gated Stage 2 (no-contact rule) | none |
| Tasks | Live | CREATE/EDIT/DELETE/complete — `tasks-actions.ts` | none |
| Sales Dashboard (owner preview) | Live (empty until leads in GHL) | read-only | none |
| VA Dashboard (owner preview) | Live | read-only | none |
| Client Database (+ detail) | Live | detail: reassign coach — `coach-assign-actions.ts`. Start-date Edit = GHL stub | **CSV** |
| Client Journey Tracker | Live | read-only (Set reminder is a no-op label) | none |
| Renewals | Live | read-only | **CSV** |
| Coach Overview | Live | bulk assign clients — `coach-assign-actions.ts`; **Open their portal** (impersonation) — `impersonation-actions.ts` | **CSV** |
| Client Audits | Live | set status + resolved — `audit-actions.ts` | **CSV** |
| Coach Performance / Scorecard | Live | read-only | **CSV** |
| Pipeline (CRM) | Live (empty until GHL opportunities) | read-only by design (GHL is source of truth) | **CSV** |
| Financials | Live (run-rate; Stripe pending) | read-only | **CSV** |

### Insights

| Screen | Status | Data writes | Export |
|---|---|---|---|
| Daily Digest | Live | read-only (Open in portal = dead link) | none |
| Analytics | Live (empty until lead data) | read-only | none |
| Reports | **Stub** | New report not wired; detail page is a placeholder | none |
| Sales Performance | Live (empty until leads) | read-only | **CSV** |

### Brand

| Screen | Status | Data writes | Export |
|---|---|---|---|
| Brand | Seed-only | read-only (link hub) | none |
| Building the Brand | **Stub** | New task not wired | none |
| Building the Team | **Stub** | New role not wired | none |
| Calendar | Live (read), Add event gated | read-only | none |
| Call Calendar | Live (read) | read-only | none |
| Content Planner | Live | CREATE/EDIT/DELETE posts — `content-actions.ts` | none |
| Content & Collaborations | Live | CREATE/EDIT/DELETE — `content-actions.ts` | none |
| Marketing & Campaigns | **Stub** | New campaign / Add magnet not wired | none |
| Social Media | **Stub** (honest "no API") | read-only | none |
| Ambassadors | Seed-only (owner-facing data view) | read-only | none |
| Referrals | Seed-only | read-only | none |

### Automations

| Screen | Status | Data writes | Export |
|---|---|---|---|
| Automations | Live (config persists; engine is later) | toggle + edit rule — `automations-actions.ts`. "Browse templates" is dead. Engine does not execute. | none |

### Documents

| Screen | Status | Data writes | Export |
|---|---|---|---|
| Brand Assets | Live (metadata only; file upload Phase 2) | CREATE/EDIT/DELETE — `brand-assets-actions.ts` | none |
| SOPs | Live | CREATE/EDIT/DELETE — `sops-brief-actions.ts` | none |
| Contracts | Live | CREATE/EDIT/DELETE — `contracts-merch-actions.ts` | none |
| Brief | Live | CREATE/EDIT/DELETE — `sops-brief-actions.ts` | none |
| Merch | Live | CREATE/EDIT/DELETE — `contracts-merch-actions.ts` | none |

### Team & Settings

| Screen | Status | Data writes | Export |
|---|---|---|---|
| Team | Live | invite / revoke — `invites-actions.ts` (applies on first Clerk sign-in) | none |
| Settings | Live | notification toggles persist to DB once migration 3 applied (localStorage fallback) | none |

### Coach portal (role: coach, also reachable by owner via "Open their portal")

| Screen | Status | Data writes | Export |
|---|---|---|---|
| Coach Dashboard | Live (scoped) | read-only | none |
| My Clients (+ client detail w/ check-in history) | Live (scoped) | read-only | **CSV** |
| Check-ins (interactive log) | Live (scoped) | log check-in + review ticks (review-tick + check-in entry DB-gated on migrations 3 / 1; localStorage fallback) | **CSV** |
| Results | Live (scoped) | advance transformation — `transformations-actions.ts` | none |
| My Pay (+ invoice modal, pay log) | Live (scoped) | read-only | **CSV** (ledger + pay-log) + Print/PDF invoice |
| Recipe Index | Seed (12 recipes) | favourites in localStorage | none |
| Quizzes | Seed (4 banks) | best scores in localStorage | none |
| Academy | Seed (6 modules) | read-only (progress awaits auth) | none |
| Calculators | Working (real macro maths) | read-only | none |
| SOPs (coach view) | Live | read-only for coach | none |
| Coach Assistant | **Stub** (honest disabled) | none — AI backend is retainer-phase | none |

### Sales / VA portals
Sales nav (Dashboard / Lead Pipeline / Call Calendar / Sales Performance) and VA nav (Dashboard / Client Database / Pipeline / Client Audits / Calendar / Tasks) are built and role-scoped. Sales screens are empty until GHL holds leads/opportunities.

**No "Missing" screens.** Every nav slug has a real route; the "Coming next" catch-all only fires for URLs that are not in the nav.

---

## (a) CAN WE STORE AND CREATE DATA EFFECTIVELY? — YES, for HQ-owned data

This was the big open question and the answer is now clearly yes. There is a full server-action write layer (`src/lib/*-actions.ts`), each going through the service-role Supabase client, gated by `persistenceEnabled()` (currently ON), with optimistic UI and an honest "persistence off" message as a fallback.

**Objects you can CREATE / EDIT / DELETE inside the portal today:**

| Object | Screen | Write path |
|---|---|---|
| Tasks | Tasks | `tasks-actions.ts` |
| Client audits (status + resolved) | Client Audits | `audit-actions.ts` |
| Transformations (advance approval flow) | Results Tracker / Coach Results | `transformations-actions.ts` |
| Coach assignment (single + bulk) | Client detail / Coach Overview | `coach-assign-actions.ts` |
| Content posts | Content Planner | `content-actions.ts` |
| Collaborations | Content & Collaborations | `content-actions.ts` |
| SOPs | SOPs | `sops-brief-actions.ts` |
| Brief items | Brief | `sops-brief-actions.ts` |
| Contracts | Contracts | `contracts-merch-actions.ts` |
| Merch products | Merch | `contracts-merch-actions.ts` |
| Brand assets (record/metadata) | Brand Assets | `brand-assets-actions.ts` |
| Automation rules (config + on/off) | Automations | `automations-actions.ts` |
| Team invites (invite/revoke) | Team | `invites-actions.ts` |
| Owner-impersonates-coach session | Coach Overview | `impersonation-actions.ts` |

**Read-only projections of GHL (by design — GHL is the source of truth, HQ does not write these):** clients, leads/pipeline, payment status, conversations (Inbox), calendar appointments. Check-ins and transformations are read from the coach-log import / Kahunas, not editable in-portal.

**Data-creation gaps worth flagging:**
1. **A coach cannot add or edit a check-in or a client note in the portal.** Check-ins are import-only (coach-log CSV + Kahunas Zap). There is no in-portal "log a check-in" or "add a client note" form. If coaches should work the day-to-day inside the HQ, this is the single most useful thing to add (an HQ-owned `client_notes` table + a "log check-in" action).
2. **"New X" buttons not wired on minor brand screens:** Reports (New report), Building the Brand (New task), Building the Team (New role), Marketing & Campaigns (New campaign / Add magnet). These are HQ-native and could persist now (same pattern as the document stores) — they just have not been wired.
3. **File upload is metadata-only.** Brand Assets and the transformation before/after slots store records but do not upload the actual file yet (Supabase Storage is Phase 2).
4. **Coach check-in "review ticks" and Settings notification toggles persist to localStorage only**, not the database, so they do not survive across devices/users.
5. **Start date Edit** on a client is a deliberate GHL write-back stub (`writeback.ts`, `WRITEBACK_STUBBED=true`) — it changes nothing until the gated two-way write ships.

---

## (b) CSV / EXPORT GAP — the biggest "finished hub" gap

**RESOLVED 2026-06-30 (see top-of-doc update).** This was the biggest gap; CSV export now covers every high-value table via one reusable helper. The section below is the original analysis, kept for context.

~~Today, exactly ONE screen exports anything to a file:~~
- **Coach Performance** — proper RFC-4180 CSV download (now via the shared `exportRowsToCsv` helper).
- (Coach **My Pay** also has a print/save-as-PDF *invoice* in addition to its CSV export.)

Everything else was screen-only. For a team operating hub, these high-value screens **should** have CSV export (now they do):

| Screen | Why export matters |
|---|---|
| **Client Database** | The core roster. Owner/VA will want to pull active/paused/cancelled lists for ops, billing, audits. |
| **Check-ins** (coach + any owner view) | Weekly working list; export for accountability / hand-off. |
| **My Pay / pay log** | Coaches and the owner need a CSV of weekly pay + bonuses for payroll, not just a printed invoice. |
| **Financials** (payouts + transactions) | Bookkeeping export is table-stakes. |
| **Coach Overview** | Roster + capacity + pending audits snapshot. |
| **Renewals** | Re-sign call list for the week. |
| **Client Audits** | QA cadence list. |
| **Pipeline / Sales Performance / Analytics** | Lead and funnel exports (once GHL data flows). |
| **Ambassadors / Referrals / Contracts / Merch** | Simple record exports. |

A single reusable `exportCsv(rows, columns, filename)` helper (the Coach Performance code is the template) wired into the DataTable primitive would cover most of these in one pass. **This is the clearest, highest-leverage finalisation item.**

---

## (c) DAN-PORTAL PARITY — what Dan's coach portal had that this app is missing

From `docs/coach-portal-port-status.md`. Most of Dan's portal is already ported (coach shell, My Clients, Results, Check-ins, My Pay rebuilt to Dan's exact pay model, Recipes 12, Quizzes 4, Academy 6 modules, Calculators, 3 real SOPs, Clerk login). Remaining gaps:

1. **SOPs library is incomplete — 3 of ~22 ported.** The other ~19 live on an external site (sop-library-six.vercel.app). Needs that site/repo pulled and extracted the same way. This is the largest parity gap.
2. **9-status check-in + pay-by-status not live.** The pay engine is built and ready for it, but it needs the live **Kahunas** weekly feed (Zapier) to drive exact per-status pay. Until then My Pay is a faithful run-rate estimate.
3. **Client Audit extras (audit rating + start/current weight)** specced but not built — needs a small Supabase migration (owner-gated).
4. **AI client check-in summary** specced, not built — needs Dan's Claude API key + a placement decision.
5. **Coach Assistant AI** — UI exists but honestly disabled; needs the same Claude key to become real.
6. **Clerk team rollout** — owner login works; the full team roster (name/email/role per coach) still needs loading as invites. (Tracked as a task: "Set up coach logins".)

Deliberately NOT ported (correct): Dan's pay-log password and hardcoded secrets.

---

## (d) REMAINING STUBS / HONEST-DISABLED / HUB BLOCKERS

**Honest-disabled or unwired (in-app, visible):**
- Reports: New report + report detail body (placeholder).
- Building the Brand: New task. Building the Team: New role. Marketing & Campaigns: New campaign / Add magnet.
- Social Media: whole screen is an honest "no social API connected" state.
- Coach Assistant: honest disabled (AI backend retainer-phase).
- Automations: "Browse templates" is dead; the engine does not execute rules (config only, by design).
- Global shell: "Record Loom" button and the sidebar search box are dead (real search is Cmd+K); topbar avatar has no user menu yet.
- Inbox: Send + composer chips + Snooze + Assign are disabled (gated behind the no-contact rule / Stage 2 GHL write).
- Calendar: Add event gated (writes external calendar).

**External-feed blockers (not code — these light up when a key/feed lands):**
- **Stripe** → Financials cash collected / refunds / past-due, real transactions. Not built; needs a key.
- **GHL sales pipeline** → Pipeline, Sales Performance, Analytics are empty until leads/opportunities exist in GHL.
- **Kahunas** → real weekly check-ins, adherence, exact pay-by-status.
- **Social APIs** → Social Media follower/growth numbers.
- **Coach capacities + remaining coach logs** (Dan's numbers + other coaches' CSVs) → accurate capacity %, adherence, and pay for every coach. Currently capacity defaults to 70.

**Nothing above blocks day-to-day hub use.** The owner can run operations (clients, coaches, audits, tasks, content, documents, renewals, results approvals) and coaches can use their portal today. The blockers are about depth (exports, richer feeds), not basic function.

---

## TO FINALISE — prioritized (SUPERSEDED — see RE-AUDIT at top)

> Items 1–5 below are DONE as of the 2026-06-30 finalisation pass (CSV export, in-portal check-in/notes entry, New-X stubs + migration, SOPs external flag, localStorage→DB persistence). They remain here for history; the live owner action list is the migrations table in the RE-AUDIT section. Only item 6 (external integration depth) genuinely remains, plus wiring the New-X buttons after migration 2.


1. **CSV export, broadly.** Add one reusable export helper (Coach Performance is the template), wire it into Client Database, Check-ins, My Pay/pay log, Financials, Coach Overview, Renewals, Client Audits first. *(Biggest finished-hub gap; pure HQ code, no integration.)*
2. **In-portal data creation a coach actually needs:** a "log a check-in" action and a `client_notes` table + add-note form (the main day-to-day write coaches currently cannot do in-app).
3. **Wire the remaining "New X" buttons** (Reports, Building the Brand, Building the Team, Marketing) using the existing document-store action pattern — quick wins that remove visible stubs.
4. **Finish the SOPs port** (the other ~19 from the external library) — the main Dan-portal parity gap.
5. **Persist what is currently localStorage-only** (coach check-in review ticks, Settings notification prefs) and consider per-user once the team is on Clerk.
6. **Then the integration depth** (owner/Dan-gated, not blocking): Stripe for Financials; GHL leads to populate Pipeline/Sales/Analytics; Kahunas for live check-ins + exact pay; coach capacities; finish the team Clerk rollout; file upload (Brand Assets + transformation photos).
