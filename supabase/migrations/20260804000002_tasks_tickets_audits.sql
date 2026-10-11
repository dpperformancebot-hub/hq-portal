-- Phase C (FEEDBACK-V2): Taskboard -> Tickets & Kanban + Client Audits rework.
--
-- OWNER APPLIES THIS (schema changes are owner-gated). Until applied:
-- - tasks keep working with the legacy open/done statuses (the app maps
--   open -> "To do" on read and degrades honestly when a new status or the
--   opened_by stamp cannot be stored);
-- - audit feedback/Loom saves report the missing migration.

-- C1: kanban statuses. Legacy 'open' stays allowed; the app treats it as todo.
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('open','todo','in_progress','blocked','done','approved'));

-- C2/C3: who opened the task/ticket (display name; role drives ticket routing
-- at insert time, server-derived).
alter table public.tasks
  add column if not exists opened_by text;

-- C5: reviewer feedback + Loom walkthrough link per client audit.
alter table public.client_audits
  add column if not exists feedback text,
  add column if not exists loom_url text;
