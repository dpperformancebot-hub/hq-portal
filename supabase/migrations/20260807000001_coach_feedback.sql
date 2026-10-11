-- R3-3 (FEEDBACK-V2): coach feedback forms move into the portal, replacing
-- the Slack/Typeform flow. One row per submission; the submitting coach is
-- session-derived. A C3-routed ticket is ALSO filed on submit (best-effort)
-- so feedback lands on the head coach's board.
--
-- OWNER APPLIES THIS. Until applied, submitting reports the missing
-- migration honestly and the list renders empty.
--
-- Conventions: RLS on with zero policies (service-role only).

create table if not exists public.coach_feedback (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references public.coaches(id) on delete set null,
  coach_name text not null,
  category text not null default 'Feedback' check (category in ('Feedback','Issue','Idea')),
  subject text not null,
  details text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists coach_feedback_coach_idx on public.coach_feedback (coach_id);

alter table public.coach_feedback enable row level security;
