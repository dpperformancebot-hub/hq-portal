-- OWNER-GATED, NOT YET APPLIED (proposed 2026-06-30).
--
-- Unlocks in-portal coach data entry (docs/portal-completion-audit.md gap a.1):
--   1. client_notes: HQ-owned free-text notes a coach or owner writes on a
--      client, from the client profile or the Check-ins screen. Internal only,
--      no outbound path (the NO-CONTACT rule is unaffected).
--   2. Extend check_ins.source to allow 'manual' rows logged in-portal,
--      distinct from the 'kahunas' webhook intake and the 'coach_log' importer.
--
-- The features are wired behind persistenceEnabled() and fail closed with an
-- honest message until this migration is applied. Apply with the other
-- migrations (supabase db push / SQL editor), then the entry forms go live.
--
-- Service-role only (RLS on, zero policies): written via dbAdmin() with the
-- service-role key, never the browser. set_updated_at() already exists
-- (20260612000001_initial_schema.sql).

create table public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid references public.coaches(id),
  author_name text,            -- display name of the owner/coach who wrote it
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index client_notes_client_idx on public.client_notes (client_id, created_at desc);

create trigger client_notes_set_updated_at
  before update on public.client_notes
  for each row execute function public.set_updated_at();

alter table public.client_notes enable row level security;

-- Allow in-portal manual check-in entries alongside the existing sources.
alter table public.check_ins drop constraint check_ins_source_check;
alter table public.check_ins
  add constraint check_ins_source_check
  check (source in ('kahunas', 'coach_log', 'manual'));
