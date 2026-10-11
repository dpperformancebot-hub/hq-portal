-- R7-4 (FEEDBACK-V2): in-portal role management, owner-only. Every role
-- change (including head-coach tier toggles) writes one audit row: who
-- changed whom, from -> to, when. The audit write is a HARD guard: the
-- update action refuses to change a role while this table is missing, so
-- there is never an unaudited change.
--
-- ⚠ PROPOSED - OWNER APPLIES THIS AFTER REVIEW. Until applied, role changes
-- on the Team screen fail with an honest migration error; nothing degrades.
--
-- Conventions: RLS on with zero policies (service-role only).

create table if not exists public.role_change_audit (
  id uuid primary key default gen_random_uuid(),
  changed_by_clerk_id text not null,
  changed_by_name text,
  target_clerk_id text not null,
  target_name text,
  from_role text not null,
  to_role text not null,
  from_coach_id uuid,
  to_coach_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists role_change_audit_target_idx
  on public.role_change_audit (target_clerk_id, created_at desc);

alter table public.role_change_audit enable row level security;
