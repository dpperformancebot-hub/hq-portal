-- R6-5 (FEEDBACK-V2, Dan's architecture): the dashboard owns notifications;
-- Slack is a delivery channel. One row per event: recipient (display name,
-- matching tasks.assignee_name conventions), type, payload jsonb. The insert
-- happens in the same server action as the event; delivery to Slack stamps
-- delivered_slack_at (immediate attempt + cron retry for undelivered rows);
-- the in-portal bell renders unread rows and read_at clears them.
--
-- OWNER APPLIES THIS.
--
-- Conventions: RLS on with zero policies (service-role only).

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_name text not null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  delivered_slack_at timestamptz
);

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_name, created_at desc);
create index if not exists notifications_undelivered_idx
  on public.notifications (created_at) where delivered_slack_at is null;

alter table public.notifications enable row level security;
