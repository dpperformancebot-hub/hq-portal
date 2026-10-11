# Supabase Schema Proposal (M5 phase 2)

> STATUS 2026-06-12: Owner opened the gate ("assume sensible defaults, flag choices"). Built to this design: supabase/migrations/20260612000001_initial_schema.sql + src/lib/db + src/lib/sync + /api/sync/ghl + flag-gated reads in src/lib/live. NOT yet applied to any Supabase project (sandbox has no network). Decisions taken on the owner's behalf, all overridable:
>
> 1. PII: email/phone NOT stored in Supabase (fetched live from GHL on detail views).
> 2. Snapshots: daily rows kept forever; revisit roll-up at 12 months.
> 3. Payout fee: stays hardcoded 10% in code until payroll rules land from Dan (no schema change needed to revisit).
> 4. sales_reps: identity-only table, no metrics columns.
> 5. Supabase project: one project PER BRAND (matches rebrand-per-client model).
> 6. (New) Absent-row policy: clients in the DB but missing from a GHL fetch are logged to sync_events, never auto-flipped to past. Human reviews; GHL merges burned us once already.
> 7. (New) Empty-DB guard: with HQ_PERSISTENCE=true but no synced rows, reads fall back to GHL-direct so the dashboard never zeroes out.
> 8. (New) Opportunity delete webhooks hard-delete the lead row (leads are pure projection, no history value); contact deletes still soft-mark 'past'.
> 9. (New) Webhook auth is a shared secret (GHL_WEBHOOK_SECRET, header x-hq-webhook-secret or ?token=) set in the GHL workflow webhook action. GHL signed subscriptions can replace it at hardening time.
> 10. (New) Cron: vercel.json schedules /api/sync/ghl daily at 19:55 UTC (5:55am AEST), so the snapshot lands just before the 7am digest. Digest "yesterday" reads the latest snapshot row (avoids UTC/AEST off-by-one).
>
> M6 defaults (same review terms):
>
> 11. Dev role preview: the coach view previews as the HEAD COACH (Angus) since no auth means no linked coach. Clerk mode uses users.linked_coach_id.
> 12. AUTH_MODE=clerk with an authenticated user but NO users-table row resolves to role "va" (least privilege), never owner.
> 13. Middleware bugfix folded in: /api/sync and /api/webhooks are exempt from the password gate (cron + GHL cannot carry the cookie; both routes have their own secret auth).
> 14. /dashboard stays the single default route for all four roles; the server picks the view by role (vs separate per-role routes).
> 15. Clerk middleware/sign-in wiring is NOT built yet: it needs real Clerk keys and testing against the password gate + GHL iframe embed, so it lands at activation. getServerIdentity is ready for it.
> 16. Coach screens have NO links into /client-database (owner/VA scope; RouteGuard bounces coaches). A coach-facing client detail view is a later M6 item.
> 17. Coach roster scope: My Clients/Check-ins show active + paused (coaches still check on paused clients); cancelled/past stay out per the active-only rule. Results read-only for coaches; state advancing stays in the owner Results Tracker until coach write flows land.
> 18. /api/sync/ghl maxDuration set to 60s (Vercel Hobby ceiling; sync fits comfortably). Raise only on Pro if the book outgrows it.
> 19. RLS policies (migration 0002, apply at auth activation): READ-ONLY policies per role; ALL writes stay on server routes with the service-role key. No JWT holder can write directly.
> 20. Policy scopes mirror the nav spec: owner all; coach own roster/transformations/audits + own coaches row (pay rates hidden from other roles); sales leads only, no client roster; va ops tables, no financials/snapshots/sync log.
> 21. My Pay is a labelled RUN-RATE ESTIMATE using the Financials payout maths (Weekly = weeklyRate x 4, Fortnightly = fortnightlyRate x 2, Monthly treated as Weekly cadence, 10% fee). The prototype's per-check-in pay engine + bonuses await Dan's payroll rules and a check-in feed. The prototype's hardcoded pay-log password was NOT ported.
> 22. Quiz best scores and recipe favourites persist in localStorage until auth gives per-coach persistence; custom recipe authoring (a write flow) is deferred.
> 23. Academy is server-rendered (the ~330KB course never ships to the browser; content data modules are split per consumer to keep it that way). Module quizzes and per-coach progress tracking are deferred to auth; lesson Looms are pending (empty in the source content) and labelled as such.
> 24. AUTH_MODE=clerk applies to DIRECT visits only: the GHL iframe embed stays on the password gate (third-party auth cookies in a cross-origin iframe are unreliable; the tabs are the owner view anyway). Supersedes decision 15: Clerk wiring is now BUILT behind the flag (middleware composition, /sign-in, locked role in the shell); activation runbook in docs/auth-activation.md.
> 25. In clerk mode the role is locked to the users-table row: dev role switcher hidden, setRole no-op, server identity wins. Users rows are managed by SQL until a Team settings UI lands.

OWNER REVIEW RECORD. Original proposal below as reviewed. No migrations have been run; no tables exist. This is the design to approve, amend, or reject before any schema work starts. Source spec: DATA-MODEL.md. Live-layer shapes it must serve: src/lib/seed/types.ts (the type contracts) via src/lib/data.ts.

## Goals

1. Persist the GHL projection so the HQ stops depending on a 5 minute poll for every request, and webhooks can update one row instead of refetching 800 contacts.
2. Give HQ-native entities (transformations, audits, tasks, automations, users) a real home.
3. Unlock history: daily snapshots so the digest can say "yesterday" instead of "this month", and net-change/MRR curves stop being recomputed from raw start/end dates on every request.

Non-goals: rebuilding the CRM (GHL stays source of truth), cash facts (Stripe, retainer phase), check-in data (Kahunas has no API).

## Conventions

- All tables: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at timestamptz` (trigger-maintained).
- Enums as `text` + `check` constraints, not Postgres enums. GHL values drift (TikTok and Monthly were both added mid-build); a check constraint changes with one migration, an enum type is more ceremony for no gain.
- Computed fields are NEVER stored (DATA-MODEL rule 3). monthlyRate, weekNumber, capacityPct, journeyStage, ltv etc stay in selectors.
- snake_case in Postgres, mapped to the existing camelCase types at the selector layer.

## Tables

### 1. clients (GHL projection, read-mostly)

| Column | Type | Constraints |
|---|---|---|
| ghl_contact_id | text | unique, not null. The sync key. |
| name | text | not null |
| plan | text | check in ('Weekly','Fortnightly','Monthly') |
| billing_frequency | text | nullable, raw GHL value |
| weekly_rate | numeric(10,2) | not null default 0 |
| term_length | integer | nullable, weeks |
| start_date | date | not null |
| end_date | date | nullable. Term End Date (renewals window + churn history) |
| status | text | check in ('active','paused','cancelled','past'), indexed |
| coach_id | uuid | FK coaches, nullable (real data has unassigned) |
| source | text | nullable. Lead source as mapped in src/lib/ghl/map.ts |
| videos_uploaded | boolean | default false |
| converted_to_app | boolean | default false |
| synced_at | timestamptz | when this row last matched GHL |

Indexes: (status), (coach_id), (end_date) for the renewals window, unique (ghl_contact_id).

PII decision (question 1 below): email and phone are NOT columns. DATA-MODEL.md says contact details stay GHL-owned; detail screens fetch them live by ghl_contact_id. Storing name only keeps the Supabase footprint low-sensitivity.

### 2. coaches (HQ-native)

name, role check in ('coach','head_coach'), max_capacity integer not null, weekly_rate numeric, fortnightly_rate numeric, ghl_user_id text nullable (to resolve GHL assigned-coach values), is_active boolean default true.

Seeded once from the current roster (Amy, Angus head, Damon, Darcy, Ella, Kate, Keri, Paul, Perry, Stephen) with real capacities from Dan, replacing COACH_DEFAULTS in map.ts.

### 3. leads (GHL projection, read-mostly)

ghl_opportunity_id text unique not null, name, source, stage (check on the 8 LeadStage values), owner_user_id uuid FK users nullable (GHL gap G1: owner mapping), last_activity timestamptz, next_action text, value numeric, contact_channels jsonb, synced_at. Indexes: (stage), unique (ghl_opportunity_id).

### 4. transformations (HQ-native)

client_id FK clients not null, coach_id FK coaches not null, milestone text (W{n}), status check in ('draft','coach_approved','admin_approved','scheduled','posted'), permission text check in ('Y','N','?') nullable, handover boolean default false, before_after_assets jsonb (Supabase Storage paths), approved_to_post_at timestamptz, posted_at timestamptz.

### 5. client_audits (HQ-native)

client_id FK, coach_id FK, cadence_week check in ('W4','W8','W12','W16'), status check in ('submitted','sent','messaged','ghosted'). due_state stays computed.

### 6. tasks (HQ-native)

title, assigned_to FK users, type text, due_date date nullable, status check in ('open','done').

### 7. automations (HQ-native)

name, trigger jsonb, actions jsonb, cadence text, status check in ('draft','active','paused','failing'), replaces_va_task jsonb.

### 8. users (Clerk-linked, M6)

clerk_id text unique not null, role check in ('owner','coach','sales','va'), name, theme_preference check in ('light','dark') default 'light', linked_coach_id FK coaches nullable. Created now so tasks.assigned_to and leads.owner_user_id have a target; populated at M6.

### 9. sales_reps (deferred decision, question 4)

Per DATA-MODEL.md SalesRep. Period metrics (calls_taken, closes, cash) are really facts, not attributes. Proposal: a reps table (name, role setter|closer) only, with metrics computed from leads/opportunities once owner mapping exists. No metrics columns.

### 10. daily_snapshots (new, enables history)

One row per day, written by a scheduled job after the GHL sync: snapshot_date date unique, active_count int, paused_count int, cancelled_count int, mrr numeric, gained_1d int, lost_1d int, per_coach jsonb (coachId -> {active, mrr}). Powers digest "yesterday" deltas and fast trend charts without resampling client history per request.

### 11. sync_events (plumbing)

source text ('poll','webhook'), entity text, ghl_id text, action text, payload jsonb, processed_at timestamptz, error text. Webhook idempotency + audit trail; GHL webhooks can deliver out of order and repeat.

## Sync strategy

Phase order, each step shippable alone:

1. Migrations create the tables above. App behaviour unchanged.
2. Backfill job: existing poll (src/lib/ghl/client.ts) upserts into clients/leads on ghl_contact_id / ghl_opportunity_id instead of feeding selectors directly. Selectors in src/lib/live read Supabase. The 5 minute poll becomes the refresher, not the request path.
3. Daily snapshot job (Vercel cron) writes daily_snapshots.
4. Webhook receiver (/api/webhooks/ghl): contact create/update/delete -> upsert one clients row, log to sync_events. Poll drops to a reconciliation pass (hourly).
5. Write-back stubs (start date, coach assignment) become audited writes: HQ -> GHL API -> webhook confirms -> row updates. Still gated separately.

GHL merge handling: a GHL contact merge deletes one contact id. On webhook delete, mark the row `status = 'past'` + synced_at, never hard-delete (the VA checklist showed merges are the main data hazard).

## RLS

RLS ON for every table from migration 1. Until M6 auth, the only access path is the server-side service-role key (Vercel env, never NEXT_PUBLIC). Anon key gets zero policies, so a leaked anon key reads nothing. At M6, Clerk JWT -> Supabase policies per role (coach sees own roster via linked_coach_id, sales sees leads, va ops scope, owner all).

## Open questions for the owner

1. PII boundary: confirm email/phone stay OUT of Supabase (fetched live from GHL on detail views). Costs one GHL call on client-detail open; keeps the database low-sensitivity.
2. daily_snapshots cadence and retention: daily forever (tiny rows), or roll up to weekly after 12 months?
3. Coach payout fee: live layer hardcodes 10%. Make it a column on coaches, a global setting row, or leave hardcoded until payroll rules land from Dan?
4. sales_reps: agree to defer metrics columns until lead owner mapping exists?
5. Supabase project: one project for DP + future TJD (brand column), or one project per brand? Current rebrand-per-client model suggests per brand; confirm.

## What this does NOT touch

No Clerk wiring (M6 gate). No Stripe. No client messaging. No GHL writes. .env additions (SUPABASE_SERVICE_ROLE_KEY) happen only at implementation, owner-handled per the secrets rule.
