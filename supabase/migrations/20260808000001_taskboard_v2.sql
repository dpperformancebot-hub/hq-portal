-- R6-1 (FEEDBACK-V2): taskboard rebuild to Dan's mockup
-- (reference/taskboard-mockup). Tasks gain the template model: typed request
-- kind, structured fields jsonb, blocked reason, completion stamp, append-only
-- activity log, and the "New" badge flag. Existing rows keep working (all
-- columns nullable/defaulted); the app degrades honestly until this applies.
--
-- OWNER APPLIES THIS.

alter table public.tasks
  add column if not exists template text check (template in ('general','pause','cancel','admin','onboard')),
  add column if not exists fields jsonb,
  add column if not exists blocked_reason text,
  add column if not exists completed_at timestamptz,
  add column if not exists activity jsonb not null default '[]'::jsonb,
  add column if not exists is_new boolean not null default false;

create index if not exists tasks_completed_at_idx on public.tasks (completed_at);
