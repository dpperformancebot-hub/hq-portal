# DATA-MODEL.md

Entity spec for TJD Fit HQ. This is the source spec we will build the Supabase schema from later. No database tables exist yet. See `CLAUDE.md` for stack and architecture rules. The design reference is `reference/prototype.html` (there is no `REFERENCE-NOTES.md` in this repo; the prototype shared-data block is the closest thing to captured notes).

## Global rules

1. **Active-only by default.** Dashboards and rosters filter to `status = active` at the query level. Other statuses are reachable only through explicit filters or a dedicated view. This applies to Client and, by extension, to any roster, KPI, or roll-up built on top of clients.
2. **GHL-projected fields are read-mostly.** GoHighLevel is the CRM and source of truth. Fields marked `GHL-projected` arrive via API or webhook and should not be written back from the HQ except through a deliberate, audited sync. Treat them as read-only in normal app flows.
3. **Computed fields are never stored.** Anything marked `Computed` is derived at read time (query, view, or selector). Do not persist it. If a computed value needs caching for performance later, that is a materialized view decision, not a column on the base table.

### Source legend

| Source | Meaning |
|---|---|
| `Supabase` | HQ-native. Created and owned in this app. Read/write. |
| `GHL-projected` | Mirrored from GoHighLevel. Read-mostly. |
| `Clerk` | Provided by the Clerk auth layer, mirrored into Supabase. |
| `Computed` | Derived at read time. Never stored. |

### Common fields

Every `Supabase` entity is assumed to carry `id` (uuid, pk), `createdAt` (timestamptz), and `updatedAt` (timestamptz). These are omitted from the per-entity tables below to avoid repetition.

---

## Client

A coaching client. Roster and check-in data largely originate in GHL; coaching-internal links live in the HQ. Fields below are corrected against the real DP Performance master sheet + coach check-in log (ground truth over earlier assumptions).

| Field | Type | Source | Required | Notes |
|---|---|---|---|---|
| name | string | GHL-projected | yes | Contact name. Lives in GHL (see Contact fields note below). |
| plan | enum `Weekly` \| `Fortnightly` \| `Monthly` | GHL-projected | yes | Billing AND check-in cadence, mapped from the GHL Billing Frequency custom field. Fortnightly clients check in every other week (off-weeks show `-`). |
| billingFrequency | string, nullable | GHL-projected | no | Raw GHL Billing Frequency value, kept verbatim for the Billing tab. `plan` is the normalized enum. |
| weeklyRate | numeric (currency) | GHL-projected | yes | The master sheet's "$/Week". Billing is WEEKLY-RATE based; this is the canonical billing figure. |
| monthlyRate | numeric (currency) | Computed | no | Derived from `weeklyRate` (≈ weeklyRate × 52/12) for MRR/reporting only. NOT the billing figure. |
| termLength | integer (weeks), nullable | GHL-projected | no | PIF term length in weeks (typically 16). Re-sign call lands around active week 13-14. |
| startDate | date | GHL-projected | yes | Coaching start. Basis for `weekNumber`. |
| endDate | date, nullable | GHL-projected | no | Term End Date. For active clients: upcoming renewal (drives /renewals window). For cancelled clients: when the engagement ended (drives retention/churn history). |
| status | enum `active` \| `paused` \| `cancelled` \| `past` | GHL-projected | yes | Active-only default applies. `paused` shows as `P` for week. |
| coachId | uuid (FK Coach), **nullable** | Supabase | no | Assigned coach. Often blank/unassigned in the real data, so MUST be nullable. The sheet stores a coach name which we resolve to a Coach; the HQ owns the assignment. |
| videosUploaded | boolean | GHL-projected | no | Onboarding step: client has uploaded their intro/form videos. |
| convertedToApp | boolean | GHL-projected | no | Onboarding step (sheet records y/n): client has been moved onto the coaching app. |
| source | enum (see Lead.source) | GHL-projected | yes | Acquisition channel. Lives in GHL (see Contact fields note below). |
| results | relation -> Transformation[] | Supabase | no | Transformations belonging to this client. |
| ltv | numeric (currency) | Computed | no | Lifetime value. Sum of cash collected for this client to date (preferred), or weeklyRate times tenure as a fallback estimate. |
| lastCheckIn | date | GHL-projected | no | Date of the most recent check-in submission. Null if none yet. |
| checkInStatus | string (raw code) | GHL-projected | no | Latest weekly check-in cell value from the coach sheet. Raw codes are inconsistent across coaches; normalized on import (see "Check-in status codes" below). |
| weekNumber | integer | Computed | no | Whole weeks since `startDate`. Surfaces as `P` when status is `paused`. Drives audit cadence milestones. |

### Check-in status codes (raw, from coach sheets, normalize on import)

The real weekly check-in cell values vary between sheets and coaches and are messier than earlier assumed. The full observed set across both sheets:

| Raw value | Meaning |
|---|---|
| `y` | checked in / done |
| `n` | no check-in / missed |
| `expired` | membership / program expired |
| `Paused` / `P` | paused |
| `-` | no check-in expected that week (e.g. a fortnightly off-week) |
| `SM` | start / measurement week |
| `F` | fortnightly marker |
| `G` | ghosted |
| `M` | messaged |
| `C` | cancelled |

These raw values are NOT consistent across coaches (casing, spelling, blank vs `-`). They must be normalized into a single clean enum on import at M5; do not treat the raw strings as a stable enum. (This supersedes the earlier provisional `SM/Y/F/G/M/P/C/N` assumption.)

### Contact fields (GHL-owned)

Email, phone, and lead source are NOT in these coaching sheets and are NOT stored in our Supabase. They live in GoHighLevel; the HQ reads them as read-only projections. The full client contact roster comes from GHL at M5, not from these sheets. See the ownership boundary in BUILD-SPEC.md.

---

## Coach

A coach on the team. HQ-native. Capacity and load metrics are derived from the live client roster.

| Field | Type | Source | Required | Notes |
|---|---|---|---|---|
| name | string | Supabase | yes | |
| role | enum `coach` \| `head_coach` | Supabase | yes | `head_coach` may have audit/approval duties over other coaches. |
| maxCapacity | integer | Supabase | yes | Maximum active clients this coach should hold. |
| weeklyRate | numeric (currency) | Supabase | yes | Per-client payout for a Weekly client check-in. Prototype default 25. |
| fortnightlyRate | numeric (currency) | Supabase | yes | Per-client payout for a Fortnightly client check-in. Prototype default 15. |
| activeClientCount | integer | Computed | no | Count of clients where `coachId = this` and `status = active`. |
| pendingAudits | integer | Computed | no | Count of ClientAudit for this coach with `dueState` in (`due`, `overdue`). |
| churn | numeric (rate) | Computed | no | Clients lost over a period divided by active at period start, for this coach. Period-scoped. |
| capacityPct | numeric (0..1) | Computed | no | `activeClientCount / maxCapacity`. |

---

## Lead

A prospect in the sales pipeline. Owned in GHL. Projected into the HQ for sales tooling and reporting.

| Field | Type | Source | Required | Notes |
|---|---|---|---|---|
| name | string | GHL-projected | yes | |
| source | enum `Instagram` \| `YouTube` \| `Referral` \| `Ambassador` \| `Lead Magnet` \| `Email` \| `Website` \| `Word of Mouth` | GHL-projected | yes | Acquisition channel. Becomes Client.source on conversion. |
| stage | enum `New Enquiry` \| `Contacted` \| `Call Booked` \| `Call Taken` \| `Follow-Up` \| `New Client Processing` \| `Submitted` \| `Lost` | GHL-projected | yes | Ordered pipeline. `Lost` is terminal. |
| owner | uuid (FK User) | GHL-projected | yes | Pipeline owner in GHL, mapped to an HQ User (sales or owner). |
| lastActivity | timestamptz | GHL-projected | yes | Most recent recorded touch. |
| nextAction | string | GHL-projected | no | Planned next step. Read-mostly. |
| daysInStage | integer | Computed | no | Days since the lead entered the current `stage`. |
| value | numeric (currency) | GHL-projected | no | Estimated deal value. |
| contactChannels | array of `{ channel: enum (whatsapp \| instagram \| imessage \| email), priority: integer }` | GHL-projected | yes | Outreach channels in priority order. Lower `priority` is tried first. |

---

## Transformation

A client transformation (before/after) moving through an approval and publishing workflow. HQ-native. The master sheet records this as four raw fields (below); we keep our `status` state machine and project the sheet fields onto it.

**Raw master-sheet fields (ground truth):**

| Sheet field | Type | Meaning |
|---|---|---|
| transformation | boolean | Client has a transformation (the trigger). |
| permission | enum `Y` \| `N` \| `?` | Permission to post (coach/admin approval; `?` = undecided). |
| posted | boolean | Has been posted. |
| handover | boolean | Tracks the coach -> admin handoff. |

**Mapping onto our status machine** (`draft -> coach_approved -> admin_approved -> posted`):
- `transformation = true` -> exists as at least `draft` (the trigger).
- `permission = Y` -> approved (`coach_approved`, then `admin_approved` once `handover = true`); `permission = ?` stays `draft`/in-review; `permission = N` is not approved to post.
- `handover = true` -> the coach -> admin handoff has happened (gates `admin_approved`).
- `posted = true` -> `posted`.
(The intermediate `scheduled` state has no direct sheet field; it is HQ-only, set between `admin_approved` and `posted`.)

| Field | Type | Source | Required | Notes |
|---|---|---|---|---|
| clientId | uuid (FK Client) | Supabase | yes | |
| coachId | uuid (FK Coach) | Supabase | yes | Coach attached to the transformation. |
| milestone | enum `W12` \| `W20` \| ... | Supabase | yes | Week milestone the transformation marks. Open-ended set (`W{n}`). |
| status | enum `draft` \| `coach_approved` \| `admin_approved` \| `scheduled` \| `posted` | Supabase | yes | Ordered workflow. Each step gates the next. Derived from the raw sheet fields per the mapping above. |
| permission | enum `Y` \| `N` \| `?` | GHL-projected (sheet) | no | Raw permission-to-post flag from the sheet; feeds `status`. |
| handover | boolean | GHL-projected (sheet) | no | Coach -> admin handoff flag; gates `admin_approved`. |
| beforeAfterAssets | array of asset refs (Supabase Storage paths or URLs) | Supabase | no | Before/after media. Stored in Supabase Storage. |
| approvedToPostAt | timestamptz | Supabase | no | Set when it reaches `admin_approved`. |
| postedAt | timestamptz | Supabase | no | Set when it reaches `posted` (`posted = true`). |

---

## ClientAudit

A scheduled QA checkpoint on a client's check-in cadence. HQ-native QA process.

| Field | Type | Source | Required | Notes |
|---|---|---|---|---|
| clientId | uuid (FK Client) | Supabase | yes | |
| coachId | uuid (FK Coach) | Supabase | yes | Coach responsible for the audited client. |
| cadenceWeek | enum `W4` \| `W8` \| `W12` \| `W16` | Supabase | yes | Milestone week the audit is anchored to. |
| status | enum `submitted` \| `sent` \| `messaged` \| `ghosted` | Supabase | yes | Outcome of the check-in handling for this checkpoint. |
| dueState | enum `due` \| `overdue` \| `completed` | Computed | no | Derived from `cadenceWeek` vs the client's `weekNumber` and whether the audit is resolved. |

---

## Financials

A period-scoped reporting model, not a stored table. Every figure is bound to a reporting period (for example a given month). Payment facts come from GHL; the rest is rolled up.

| Field | Type | Source | Required | Notes |
|---|---|---|---|---|
| mrr | numeric (currency) | Computed | no | Sum of `monthlyRate` across active clients. |
| arr | numeric (currency) | Computed | no | `mrr * 12`. |
| cashCollected | numeric (currency) | GHL-projected | no | Actual cash collected in the period (payment events from GHL). |
| refunds | numeric (currency) | GHL-projected | no | Refunds issued in the period. |
| coachPayout | object `{ gross, fee, net }` (currency) | Computed | no | Derived from payout rules: per-client weekly/fortnightly rate against eligible check-ins, less platform fee. `net = gross - fee`. |
| revenueMix | map `plan -> numeric` | Computed | no | MRR split by plan (Weekly vs Fortnightly vs Monthly). |
| netChange | numeric | Computed | no | Clients gained minus clients lost in the period. |

---

## SalesRep

> Added in the M4 refinement pass for the Sales Leaderboard. INCLUDE IN THE M5 SCHEMA DESIGN. Likely backed by GHL pipeline/call data plus payment events; finalize source split at M5.

An appointment setter or closer. Powers the Sales Leaderboard on the owner dashboard.

| Field | Type | Source | Required | Notes |
|---|---|---|---|---|
| name | string | GHL-projected | yes | Rep name. |
| role | enum `setter` \| `closer` | Supabase | yes | Which side of the sales motion they own. |
| callsTaken | integer | GHL-projected | yes | Calls taken in the period (from the call/pipeline feed). |
| closes | integer | GHL-projected | yes | Deals closed in the period. |
| closeRate | numeric (0..1 or %) | Computed | no | `closes / callsTaken`. Never stored. |
| cashCollected | numeric (currency) | GHL-projected | no | Cash attributed to the rep in the period (payment events). |
| movement | integer | Computed | no | Leaderboard rank change vs the previous period. |

---

## Task

An HQ to-do, assignable to a user. HQ-native.

| Field | Type | Source | Required | Notes |
|---|---|---|---|---|
| title | string | Supabase | yes | |
| assignedTo | uuid (FK User) | Supabase | yes | |
| type | enum/string | Supabase | yes | Task category. |
| dueDate | date | Supabase | no | |
| status | enum `open` \| `done` | Supabase | yes | |
| scope | enum `mine` \| `team` | Computed | no | View-relative to the current user. `mine` = `assignedTo` is the current user; `team` = assigned within the current user's team. |

---

## Automation

A configured automation that can replace manual VA work. HQ-native.

| Field | Type | Source | Required | Notes |
|---|---|---|---|---|
| name | string | Supabase | yes | |
| trigger | json | Supabase | yes | Event or condition that fires the automation. |
| actions | array (json) | Supabase | yes | Ordered actions to run when triggered. |
| cadence | enum `real-time` \| `weekly` \| ... | Supabase | yes | How often it can run. Open-ended set. |
| status | enum `draft` \| `active` \| `paused` \| `failing` | Supabase | yes | `failing` is set by run monitoring, not chosen by a user. |
| replacesVATask | object `{ replaces: boolean, label: string }` | Supabase | no | Flags that this automation stands in for a manual VA task. `label` names the task it replaces. |

---

## User (auth)

An authenticated HQ user. Identity comes from Clerk; profile and role live in Supabase. `role` selects the shell and default screen (see `CLAUDE.md`).

There are **4 login roles: `owner`, `coach`, `sales`, `va`**. Ambassador is NOT a login role: ambassadors do not log in and have no portal/auth. Ambassador data is an owner-facing, view-only area (the Ambassadors screen under BRAND); see the Ambassador entity in m4 seed, which is reference data, not an auth identity.

| Field | Type | Source | Required | Notes |
|---|---|---|---|---|
| clerkId | string | Clerk | yes | Clerk user id. Unique. Links the Supabase profile to the auth identity. |
| role | enum `owner` \| `coach` \| `sales` \| `va` | Supabase | yes | Drives the shell (sidebar + default screen). Owner is fully built; coach/sales/va are M6 scaffolds. No `ambassador` value. |
| name | string | Clerk | yes | Display name, mirrored from Clerk. |
| themePreference | enum `light` \| `dark` | Supabase | yes | Persisted theme. Default `light`. |
| linkedCoachId | uuid (FK Coach) | Supabase | no | Required when `role = coach`. Links the user to their Coach record. Null for other roles. |
