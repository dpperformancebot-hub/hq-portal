-- OWNER-GATED (proposed 2026-07-10, owner request: gated Academy stages with a
-- live per-coach tracker for the owner + head coach).
--
-- One row per coach per completed Academy lesson. Module (stage) completion is
-- DERIVED: a module is complete when every one of its lessons has a row, and
-- module N+1 unlocks only when module N is complete. Lesson/module ids are the
-- stable string ids from src/lib/coach-content/modules.json (m1, l1-1, ...).
--
-- Conventions: RLS on with zero policies (service-role only).

create table if not exists public.academy_progress (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  module_id text not null,
  lesson_id text not null,
  completed_at timestamptz not null default now(),
  unique (coach_id, lesson_id)
);

create index if not exists academy_progress_coach_idx on public.academy_progress (coach_id);

alter table public.academy_progress enable row level security;
