-- R5-3 (FEEDBACK-V2): client feedback-form responses land in the portal via
-- Typeform webhooks (each coach has their own form; the webhook URL carries
-- ?coach=<name>). Replaces the per-coach Zapier Slack DMs. Raw simplified
-- answers stored as jsonb; coach matched by name at intake (coach_key keeps
-- the raw slug for unmatched forms).
--
-- OWNER APPLIES THIS. Until applied the webhook returns 503 and the coach
-- panel renders empty.
--
-- Conventions: RLS on with zero policies (service-role only).

create table if not exists public.client_feedback_responses (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references public.coaches(id) on delete set null,
  coach_key text,
  client_name text,
  form_id text,
  answers jsonb not null default '[]'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists client_feedback_responses_coach_idx
  on public.client_feedback_responses (coach_id, created_at desc);

alter table public.client_feedback_responses enable row level security;
