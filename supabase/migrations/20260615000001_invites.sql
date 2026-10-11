-- M6: pre-authorised team invites (owner-approved schema change 2026-06-15).
--
-- The owner adds a row (email -> role + optional coach) from the Team screen.
-- On that person's first Clerk sign-in, src/lib/role-server.ts matches their
-- email, creates their public.users row, and marks the invite claimed. They
-- self-sign-up in Clerk; no email is sent from the app (owner decision).
--
-- Service-role only: RLS on, zero policies. Managed exclusively through owner
-- server actions using the service-role key, never the browser.

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  role text not null check (role in ('owner','coach','sales','va')),
  linked_coach_id uuid references public.coaches(id) on delete set null,
  claimed_at timestamptz,
  claimed_by text, -- clerk user id that claimed it
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger invites_set_updated_at
  before update on public.invites
  for each row execute function public.set_updated_at();

alter table public.invites enable row level security;
