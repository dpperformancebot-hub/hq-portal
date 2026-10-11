-- R13-2 / R13-3 (FEEDBACK-V2, owner-approved build 2026-09-05): stop the
-- silent wrong-portal fallback.
--
--   invites.alt_emails    an invite can carry more than one address, so a
--                         coach invited on their work email who signs up
--                         with a personal Gmail still lands correctly.
--   access_requests       an authenticated user with NO users row and NO
--                         matching invite is parked on /no-access and one
--                         pending row is written here (one per Clerk id).
--                         Owner / admin / head coach approve it from
--                         /access-requests, which creates the users row
--                         and writes role_change_audit (from 'none').
--                         suggested_coach_id is a name-match HINT for the
--                         approver only; it never grants anything.
--
-- ⚠ PROPOSED - OWNER APPLIES THIS AFTER REVIEW (both brands). Until applied:
--   * invite matching still works on the primary email (normalised);
--   * the holding screen still renders, but no request row is stored and
--     the approvals page shows an honest "migration pending" note.
--
-- Conventions: RLS on with zero policies (service-role only).

alter table public.invites
  add column if not exists alt_emails text[] not null default '{}';

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  clerk_id text not null unique,
  email text not null,
  email_normalised text not null,
  name text,
  suggested_coach_id uuid references public.coaches(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  granted_role text,
  granted_coach_id uuid references public.coaches(id) on delete set null,
  resolved_by_clerk_id text,
  resolved_by_name text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists access_requests_status_idx
  on public.access_requests (status, created_at desc);

create trigger access_requests_set_updated_at
  before update on public.access_requests
  for each row execute function public.set_updated_at();

alter table public.access_requests enable row level security;
