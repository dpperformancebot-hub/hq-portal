-- R18 (PROPOSED, NOT APPLIED). TJD FIT ONLY. Do not apply to DP Performance:
-- DP pays per check-in code and none of this is used there.
--
-- TJD pays coaches on WEEKS PAID (the weeks a client actually paid for) times
-- a per-coach rate that differs for brand vs referral clients, per the owner's
-- Coach Rates SOP (2026) and the September master workbook. Three things have
-- to be stored that the schema has no home for today.
--
-- 1. coach_pay_rates: the editable rate card, one row per coach.
--    coaches.weekly_rate / fortnightly_rate cannot hold this: TJD needs SIX
--    figures per coach (brand and referral, weekly and fortnightly, plus what
--    the client pays), and the owner edits them in the portal.
--    All figures are WEEKLY dollars, i.e. the SOP's monthly rate / 4.
create table if not exists public.coach_pay_rates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null unique references public.coaches(id) on delete cascade,
  brand_weekly numeric(10,2) not null default 0,
  brand_fortnightly numeric(10,2) not null default 0,
  referral_weekly numeric(10,2) not null default 0,
  referral_fortnightly numeric(10,2) not null default 0,
  client_weekly numeric(10,2) not null default 0,
  client_fortnightly numeric(10,2) not null default 0,
  /** Owner's own roster: tracked at the client price with no coach split. */
  owner_no_split boolean not null default false,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger coach_pay_rates_set_updated_at
  before update on public.coach_pay_rates
  for each row execute function public.set_updated_at();
alter table public.coach_pay_rates enable row level security;
comment on table public.coach_pay_rates is 'R18, TJD only: per-coach rate card in WEEKLY dollars (SOP monthly / 4). Editable in the portal by the owner.';

-- 2. Per-client billing facts the rate card keys off. Nullable: DP never sets
--    them and its engine never reads them.
alter table public.clients add column if not exists client_type text
  check (client_type in ('brand','referral'));
alter table public.clients add column if not exists payer text
  check (payer in ('weekly','monthly'));
alter table public.clients add column if not exists custom_coach_monthly numeric(10,2);
alter table public.clients add column if not exists custom_client_monthly numeric(10,2);
alter table public.clients add column if not exists is_challenge boolean not null default false;
comment on column public.clients.client_type is 'R18, TJD: brand lead vs a client the coach personally referred. Referral pays the coach more, for the lifetime of that client. Set at signup.';
comment on column public.clients.payer is 'R18, TJD: weekly payers can earn a 5th week in a 5-week month; monthly payers cap at 4.';

-- 3. The ticks. One row per client per week actually PAID, which is what the
--    coach invoices on. week_start is the Monday; the SOP counts a week in
--    the month its SUNDAY falls in, which the app derives from this.
create table if not exists public.client_paid_weeks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid references public.coaches(id) on delete set null,
  week_start date not null,
  paid_at timestamptz not null default now(),
  marked_by text,
  created_at timestamptz not null default now(),
  unique (client_id, week_start)
);
create index if not exists client_paid_weeks_week_idx on public.client_paid_weeks (week_start);
create index if not exists client_paid_weeks_coach_idx on public.client_paid_weeks (coach_id);
alter table public.client_paid_weeks enable row level security;
comment on table public.client_paid_weeks is 'R18, TJD only: one row per client-week ticked as PAID. Coach pay = weeks paid x their rate for that client.';
