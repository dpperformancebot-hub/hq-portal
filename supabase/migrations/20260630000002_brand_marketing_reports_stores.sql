-- OWNER-GATED, NOT YET APPLIED (proposed 2026-06-30).
--
-- Unlocks the "New X" controls currently disabled-with-tooltip on the minor
-- brand/insights screens (docs/portal-completion-audit.md gap a.2):
--   Reports (New report), Building the Brand (New task), Building the Team
--   (New role), Marketing & Campaigns (New campaign / Add magnet).
--
-- These are HQ-native lists with no outbound path. Once applied, wire the
-- buttons with the same server-action + persistenceEnabled() pattern as the
-- document stores (sops/contracts/etc). Until applied the buttons stay honest
-- disabled stubs that name this migration.
--
-- Conventions from 20260620000001_document_content_stores.sql: uuid pk,
-- set_updated_at() trigger, RLS on with zero policies (service-role only),
-- no PII, computed fields stay in selectors.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null default 'Summary',
  period text,
  body text,                    -- report detail / notes
  generated_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brand_build_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'to-do' check (status in ('to-do', 'in progress', 'done')),
  assignee_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hires (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  candidate text,
  stage text not null default 'Sourcing' check (stage in ('Sourcing', 'Interviewing', 'Offer', 'Hired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'Paid',
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  spend numeric(10,2) not null default 0,
  leads int not null default 0,
  closed int not null default 0,
  roas numeric(6,2),
  period text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_magnets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  opt_ins int not null default 0,
  conversion_pct numeric(5,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger reports_set_updated_at before update on public.reports
  for each row execute function public.set_updated_at();
create trigger brand_build_tasks_set_updated_at before update on public.brand_build_tasks
  for each row execute function public.set_updated_at();
create trigger hires_set_updated_at before update on public.hires
  for each row execute function public.set_updated_at();
create trigger campaigns_set_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();
create trigger lead_magnets_set_updated_at before update on public.lead_magnets
  for each row execute function public.set_updated_at();

alter table public.reports enable row level security;
alter table public.brand_build_tasks enable row level security;
alter table public.hires enable row level security;
alter table public.campaigns enable row level security;
alter table public.lead_magnets enable row level security;
