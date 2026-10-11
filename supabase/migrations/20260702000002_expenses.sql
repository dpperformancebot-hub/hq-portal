-- OWNER-GATED (proposed 2026-07-02, owner requested expense tracking).
--
-- Business expenses with recurring cadence, entered by the owner on the
-- Financials screen and rolled into the dashboard's monthly expense number
-- alongside computed coach pay. Internal records only, no outbound path.
--
-- Conventions: RLS on with zero policies (service-role only), set_updated_at().

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric not null check (amount >= 0),
  cadence text not null default 'monthly'
    check (cadence in ('weekly','fortnightly','monthly','quarterly','yearly','one_off')),
  category text,
  active boolean not null default true,
  started_on date not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger expenses_set_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

alter table public.expenses enable row level security;
