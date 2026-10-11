-- OWNER-GATED (proposed 2026-07-02, owner requested: "all portal state stored
-- inside the portal login").
--
-- Generic per-login key/value store so portal state follows the LOGIN, not the
-- browser: quiz best scores, recipe favourites, and any future per-user UI
-- state. One row per (user_key, state_key); value is jsonb.
--
-- user_key is the Clerk user id in clerk mode, or the dev-preview scope
-- ('dev:<role>') before auth. Wired behind persistenceEnabled(); until applied
-- the existing localStorage behaviour stays the working fallback.
--
-- Conventions: RLS on with zero policies (service-role only), set_updated_at().

create table if not exists public.user_state (
  user_key text not null,
  state_key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_key, state_key)
);

create trigger user_state_set_updated_at before update on public.user_state
  for each row execute function public.set_updated_at();

alter table public.user_state enable row level security;
