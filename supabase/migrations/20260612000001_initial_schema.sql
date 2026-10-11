-- M5 phase 2: initial HQ schema. Source design: docs/supabase-schema-proposal.md
-- (owner-approved 2026-06-12 with defaults; override points flagged there).
-- NOT applied automatically: run via supabase db push or the SQL editor.
--
-- Rules carried from DATA-MODEL.md:
--   * Computed fields are never stored (monthlyRate, weekNumber, journeyStage,
--     capacityPct, ltv etc stay in selectors).
--   * GHL-projected tables (clients, leads) are read-mostly: written only by
--     the sync layer, never by normal app flows.
--   * PII boundary (DEFAULT DECISION 1): email/phone are NOT stored here.
--     Detail screens fetch them live from GHL by ghl_contact_id.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- coaches
create table public.coaches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  role text not null default 'coach' check (role in ('coach','head_coach')),
  max_capacity integer not null default 30, -- real capacities from Dan pending
  weekly_rate numeric(10,2) not null default 25,
  fortnightly_rate numeric(10,2) not null default 15,
  ghl_user_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ users
-- Clerk-linked HQ users. Created now so FKs have a target; populated at M6.
create table public.users (
  id uuid primary key default gen_random_uuid(),
  clerk_id text not null unique,
  role text not null check (role in ('owner','coach','sales','va')),
  name text not null,
  theme_preference text not null default 'light' check (theme_preference in ('light','dark')),
  linked_coach_id uuid references public.coaches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- clients
-- GHL projection. Sync key: ghl_contact_id.
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  ghl_contact_id text not null unique,
  name text not null,
  plan text not null default 'Weekly' check (plan in ('Weekly','Fortnightly','Monthly')),
  billing_frequency text,
  weekly_rate numeric(10,2) not null default 0,
  term_length integer,
  start_date date not null,
  end_date date,
  status text not null check (status in ('active','paused','cancelled','past')),
  coach_id uuid references public.coaches(id),
  source text,
  videos_uploaded boolean not null default false,
  converted_to_app boolean not null default false,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_status_idx on public.clients (status);
create index clients_coach_idx on public.clients (coach_id);
create index clients_end_date_idx on public.clients (end_date);

-- ------------------------------------------------------------------ leads
-- GHL opportunity projection. Stage stored pre-mapped to the HQ enum.
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  ghl_opportunity_id text not null unique,
  name text not null,
  source text,
  stage text not null check (stage in (
    'New Enquiry','Contacted','Call Booked','Call Taken',
    'Follow-Up','New Client Processing','Submitted','Lost')),
  owner_user_id uuid references public.users(id), -- G1 gap: mapping pending
  ghl_assigned_to text,
  last_activity date,
  next_action text,
  value numeric(10,2) not null default 0,
  stage_entered_at date,
  contact_channels jsonb not null default '[]'::jsonb,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_stage_idx on public.leads (stage);

-- -------------------------------------------------------- transformations
create table public.transformations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  coach_id uuid not null references public.coaches(id),
  milestone text not null,
  status text not null default 'draft' check (status in
    ('draft','coach_approved','admin_approved','scheduled','posted')),
  permission text check (permission in ('Y','N','?')),
  handover boolean not null default false,
  before_after_assets jsonb not null default '[]'::jsonb,
  approved_to_post_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index transformations_client_idx on public.transformations (client_id);

-- ----------------------------------------------------------- client_audits
create table public.client_audits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  coach_id uuid not null references public.coaches(id),
  cadence_week text not null check (cadence_week in ('W4','W8','W12','W16')),
  status text not null check (status in ('submitted','sent','messaged','ghosted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index client_audits_coach_idx on public.client_audits (coach_id);

-- ------------------------------------------------------------------ tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  assigned_to uuid references public.users(id),
  type text not null default 'Ops',
  due_date date,
  status text not null default 'open' check (status in ('open','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------ automations
create table public.automations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  cadence text not null default 'weekly',
  status text not null default 'draft' check (status in ('draft','active','paused','failing')),
  replaces_va_task jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------- sales_reps
-- DEFAULT DECISION 4: identity only, NO metrics columns. Metrics are computed
-- from leads/payments once lead owner mapping (G1) exists.
create table public.sales_reps (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  role text not null check (role in ('setter','closer')),
  ghl_user_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------- daily_snapshots
-- DEFAULT DECISION 2: daily rows kept forever (tiny). Roll-up revisit at 12mo.
create table public.daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null unique,
  active_count integer not null,
  paused_count integer not null,
  cancelled_count integer not null,
  mrr numeric(12,2) not null,
  gained_1d integer not null default 0,
  lost_1d integer not null default 0,
  per_coach jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------ sync_events
create table public.sync_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('poll','webhook','manual')),
  entity text not null,
  ghl_id text,
  action text not null,
  payload jsonb,
  error text,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sync_events_entity_idx on public.sync_events (entity, ghl_id);

-- ----------------------------------------------------- triggers + RLS
do $$
declare t text;
begin
  foreach t in array array[
    'coaches','users','clients','leads','transformations','client_audits',
    'tasks','automations','sales_reps','daily_snapshots','sync_events']
  loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t, t);
    -- RLS on, ZERO policies: only the server-side service-role key (which
    -- bypasses RLS) can touch these tables until M6 adds per-role policies.
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
