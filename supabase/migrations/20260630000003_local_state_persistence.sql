-- OWNER-GATED, NOT YET APPLIED (proposed 2026-06-30).
--
-- Moves two pieces of state off per-browser localStorage and into the DB
-- (docs/portal-completion-audit.md gap a.4), so they survive across devices and
-- (once Clerk team rollout lands) can be scoped per user:
--   1. check_in_reviews: a coach's "reviewed" ticks on the Check-ins screen.
--   2. notification_prefs: the owner's Settings notification toggles.
--
-- Both are wired behind persistenceEnabled(); until applied the existing
-- localStorage behaviour stays the working fallback and the server writes are
-- best-effort no-ops. Internal state only, no outbound path (toggling a
-- notification preference does NOT send anything; delivery is a later backend).
--
-- Conventions: RLS on with zero policies (service-role only), set_updated_at().

create table if not exists public.check_in_reviews (
  coach_id uuid not null references public.coaches(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  reviewed boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (coach_id, client_id)
);

create trigger check_in_reviews_set_updated_at before update on public.check_in_reviews
  for each row execute function public.set_updated_at();

-- Per-scope notification toggles. scope is 'owner' until per-user Clerk ids land
-- (then scope can hold a user id). One row per (scope, pref_key).
create table if not exists public.notification_prefs (
  scope text not null default 'owner',
  pref_key text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (scope, pref_key)
);

create trigger notification_prefs_set_updated_at before update on public.notification_prefs
  for each row execute function public.set_updated_at();

alter table public.check_in_reviews enable row level security;
alter table public.notification_prefs enable row level security;
