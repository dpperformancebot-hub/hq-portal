-- Check-in ingest (owner-approved schema change 2026-06-16; refined to match
-- the real coach check-in log format).
--
-- Two sources land here:
--   1. Kahunas check-in form submissions, via the Zapier intake
--      (/api/webhooks/kahunas). Real-time "submitted" signal.
--   2. Coach check-in logs (the weekly tracker spreadsheets), via
--      scripts/import-coach-log.mjs. The authoritative weekly status codes the
--      coaches already maintain.
--
-- `code` is the coach's weekly status (CheckInCode: SM/Y/F/G/M/P/C/N, matching
-- src/lib/seed/types.ts). `adherence` is an optional 0..100 score from a
-- Kahunas form. The coach roster screen shows the latest row per client.
--
-- Service-role only: RLS on, zero policies. Written by the webhook / import
-- script using the service-role key, never the browser.

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  coach_id uuid not null references public.coaches(id),
  submitted_at timestamptz not null, -- the check-in week / date
  code text check (code in ('SM','Y','F','G','M','P','C','N')),
  adherence numeric, -- 0..100, from a Kahunas form when present
  week_number int,
  source text not null default 'kahunas' check (source in ('kahunas','coach_log')),
  external_id text unique, -- Kahunas submission id, for idempotent upserts
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index check_ins_client_idx on public.check_ins (client_id);
create index check_ins_submitted_idx on public.check_ins (submitted_at);
-- One row per client per date per source (coach logs are weekly; the Kahunas
-- path also dedups on external_id).
create unique index check_ins_client_date_source_idx
  on public.check_ins (client_id, submitted_at, source);

create trigger check_ins_set_updated_at
  before update on public.check_ins
  for each row execute function public.set_updated_at();

alter table public.check_ins enable row level security;
