-- R4-2 (FEEDBACK-V2): the REAL referral tracker, modelled on the master sheet
-- "Referall Tracker" tab: per client, up to 4 referrals, each with a
-- reward-paid flag. Replaces the fake demo Ambassadors/Referrals data (S1).
-- The 4-per-client cap is enforced in the action (sheet convention).
--
-- OWNER APPLIES THIS. Until applied the tracker reports the missing migration.
--
-- Conventions: RLS on with zero policies (service-role only).

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  referral_name text not null,
  reward_paid boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists referrals_client_idx on public.referrals (client_id);

alter table public.referrals enable row level security;
