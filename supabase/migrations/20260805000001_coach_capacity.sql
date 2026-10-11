-- Phase E (FEEDBACK-V2): weekly coach capacity. Every Sunday each coach is
-- prompted in-portal for their capacity for the coming week (0 / 1-2 / 3-4 /
-- 5+); answers key on the Monday of the week they apply to, one row per coach
-- per week (re-answering updates in place).
--
-- OWNER APPLIES THIS. Until applied the prompt still shows but submitting
-- reports the missing migration; Journey Tracker / digest capacity read as
-- "not answered".
--
-- Conventions: RLS on with zero policies (service-role only), set_updated_at().

create table if not exists public.coach_capacity (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  -- Monday of the week this answer applies to.
  week_start date not null,
  capacity text not null check (capacity in ('0','1-2','3-4','5+')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, week_start)
);

create trigger coach_capacity_set_updated_at before update on public.coach_capacity
  for each row execute function public.set_updated_at();

alter table public.coach_capacity enable row level security;
