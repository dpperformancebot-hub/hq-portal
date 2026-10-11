# DRIFT-AUDIT.md

Read-only audit. Compares the actual repo against [BUILD-SPEC.md](./BUILD-SPEC.md) and [PROGRESS.md](./PROGRESS.md). No code or spec was changed to produce this.

Date: 2026-06-04. Sources checked: `src/app/(hq)/*` route folders (built screens), `src/lib/navigation.ts` (role nav config), `reference/prototype.html` (coach-portal prototype), BUILD-SPEC owner nav + M3/M4/M6 screen lists, PROGRESS done markers.

## At a glance
- **34** owner screens built as real routes; **3** owner nav items are placeholders (no screen).
- **6** role-scaffold slugs (coach/VA/ambassador) render placeholders, expected (M6 gated).
- After the M4 refinement pass, the previously-undocumented extras (leaderboards, revenue Compare, Merch, the 5 added sidebar items) are now already folded into BUILD-SPEC, so there is **little pure build-not-spec drift left**.
- The biggest real drift is the **prototype's coach toolset** (My Pay, Quizzes, Academy, Calculators, Coach Assistant), which is neither in BUILD-SPEC nor built. These are coach-facing and belong in the M6 Coach view, not the owner sidebar.

---

## A. Built but NOT in BUILD-SPEC

Minimal, because the refinement pass already reconciled most extras.

| Item | Status | Note |
|---|---|---|
| `/style-guide` | Built, intentional | Token + primitive QA page. Lives outside the `(hq)` shell. Tracked in PROGRESS (M1), not a product screen, so absent from BUILD-SPEC screen lists by design. |
| Dev role switcher + owner RouteGuard bypass | Built, documented | Architecture decision; noted in PROGRESS and BUILD-SPEC. Not a screen. |
| Coach/VA/Ambassador/Sales nav configs in `navigation.ts` | Built (data only) | Match the M6 role-scaffold spec; the screens behind most of their slugs are not built yet (see B). |

Already reconciled into BUILD-SPEC during the refinement pass (NOT drift anymore): Coach + Sales leaderboards, revenue-trend Custom range + Compare, the `SalesRep` entity (in DATA-MODEL.md), and the 5 sidebar additions (Inbox, Tasks, Client Audits, Daily Digest, Merch).

---

## B. In BUILD-SPEC / implied done, but NOT built or only stubbed

### B1. Owner nav items with no screen (render the "Coming next" placeholder)
These appear in the BUILD-SPEC owner nav and in the live sidebar, but have no route folder, so they fall through to the catch-all placeholder:

| Nav item | Slug | Reality |
|---|---|---|
| Sales Dashboard | `sales-dashboard` | Placeholder. No screen built; not in the M3/M4 screen specs (only in the nav list). |
| VA Dashboard | `va-dashboard` | Placeholder. Same. |
| Ambassador Dashboard | `ambassador-dashboard` | Placeholder. Same. |

These are owner-facing "read another role's dashboard" views. They were never given a screen spec in M3/M4, only nav entries, so they have quietly been placeholders since M2.

### B2. Role-scaffold slugs that are placeholders (expected, M6 is gated/todo)
Reachable only via the dev role switcher; all render "Coming next":
`my-clients`, `check-ins`, `results`, `recipes` (coach), `payouts`, `my-referrals` (ambassador). VA and Sales reuse already-built owner screens (client-database, pipeline, client-audits, calendar, call-calendar, sales-performance).

### B3. Built screens with intentionally stubbed actions (by the seed/no-backend approach)
UI is built and real; the action is a no-op or local-only, with code comments marking the M5/M6 wiring:
- Client detail "Reassign coach"; Coach Overview "Assign clients" / "Open their portal".
- Results Tracker stage advance (local optimistic state, no persistence).
- Automations on/off toggles (persist in UI, do not execute).
- Inbox composer/send; document-store Upload / "New X"; Settings "Connect" integrations.
- Coach Performance / Reports "Export"; "Record Loom" / "Add client" in the topbar.
- Dashboard period toggle and several filters are visual (don't refilter seed).

None of these are claimed as complete in PROGRESS; they are the expected shape until M5/M6.

---

## C. In BUILD-SPEC, still TODO

| Milestone | Status |
|---|---|
| M5 GHL integration | TODO, GATED (data model + secrets). Not started. |
| M6 Role scaffolds | TODO, GATED (auth/roles). Nav configs exist; role screens are placeholders (B2). |
| M8 Rebrand + deploy | PARTIAL. Rebrand to DP Performance done via central config (TJD swap proven); **deployment not done** (this is the open request). |

(M1, M2, M3, M4, M7 are built and verified.)

---

## D. In the PROTOTYPE but NOT in BUILD-SPEC and NOT built  ← the "Coach Tools" question

The prototype (`reference/prototype.html`) is a **coach portal**. Its nav: Dashboard, Check-In Log, My Clients, Client Audits, My Pay, Recipe Index, SOPs, Quizzes, Academy, Calculators, Coach Assistant.

Of these, only **Recipe Index** and **SOPs** made it into the spec/build. The rest are missing from both BUILD-SPEC and the build. Per your note these are legitimate DP features to KEEP. Classification by who they serve:

| Prototype feature | In spec? | Built? | Owner- or coach-facing | Recommended home |
|---|---|---|---|---|
| My Pay | No | No | **Coach-facing** (a coach's own earnings/payslips) | M6 Coach view |
| Recipe Index | Yes (M6 coach) | Coach nav (placeholder) | **Coach-facing** | M6 Coach view (already placed) |
| SOPs | Yes | **Built** | **Both** (owner manages, coach consumes) | Owner Documents + Coach view (current split is fine) |
| Quizzes | No | No | **Coach-facing** (coach training/CPD) | M6 Coach view |
| Academy | No | No | **Coach-facing** (coach education/onboarding) | M6 Coach view |
| Calculators | No | No | **Coach-facing** (macro/calorie tools used while coaching) | M6 Coach view |
| Coach Assistant | No | No | **Coach-facing** (AI helper for coaching) | M6 Coach view |
| Check-In Log | Yes (M6 coach "Check-ins") | Coach nav (placeholder) | **Coach-facing** | M6 Coach view |
| My Clients | Yes (M6 coach) | Coach nav (placeholder) | **Coach-facing** | M6 Coach view |

**Finding:** the gap is 5 net-new coach tools (My Pay, Quizzes, Academy, Calculators, Coach Assistant) that exist in the prototype but not in our spec or build. All five are coach-facing by nature, so the reconciliation should add them to the **M6 Coach role view + BUILD-SPEC's M6 coach nav**, not the owner sidebar. SOPs is the only dual-audience one and is already in both places.

**Calculators verification (2026-06-04):** confirmed NOT built. There is no `calculators` route folder, no Calculators component, and no "Coach Tools" nav group anywhere in `src` (the only "calculator" string is the seed lead-magnet "Free Macro Calculator"). Visiting `/calculators` renders the catch-all "Coming next" placeholder, which prettifies any unknown slug into a title ("Calculators") and so can look like a stub screen. The working Calculators view exists only in `reference/prototype.html`. No status correction needed; this note records the check.

---

## E. Provenance of the extras

- **Coach + Sales leaderboards, revenue Custom range + Compare, `SalesRep`:** added in the 2026-06-04 owner refinement pass; already written back into BUILD-SPEC + DATA-MODEL during that pass.
- **Inbox / Tasks / Client Audits / Daily Digest / Merch in the owner sidebar:** added after M4 review per owner instruction; BUILD-SPEC owner nav updated to match.
- **My Pay / Quizzes / Academy / Calculators / Coach Assistant:** straight from `reference/prototype.html` (the coach portal). Never entered BUILD-SPEC or the build.
- **`/style-guide`, dev role switcher, RouteGuard, catch-all placeholder:** M1/M2 tooling and architecture; in PROGRESS.

---

## Reconciliation (applied 2026-06-04, per owner)
1. APPLIED: added the 5 coach tools (My Pay, Quizzes, Academy, Calculators, Coach Assistant) to BUILD-SPEC's M6 Coach role view, noting prototype provenance. Spec only; build in M6 (gated).
2. APPLIED: the 3 owner placeholder dashboards (Sales/VA/Ambassador Dashboard) are kept as placeholders and specced as part of M6 (the owner's preview of each role's view, meaningful only once role views exist). Not built now.
3. APPLIED (no change): SOPs stays dual-homed (owner Documents + coach view).
4. APPLIED (verification): Calculators confirmed not built; see the Calculators verification note in section D.
