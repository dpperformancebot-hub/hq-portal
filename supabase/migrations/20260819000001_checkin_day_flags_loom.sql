-- R12-6/7/8 (Dan's coach walkthrough): three additive pieces, no rewrites.
--
-- 1. clients.check_in_day - each client's agreed weekly check-in day
--    (0=Sunday..6=Saturday, matching JS getDay()). Null until set; initial
--    values arrive from the coach Check In Logs import or manual entry.
--    Editable in-portal (Jameela/admin at minimum, per R12-6).
--
-- 2. check_ins.loom_url - optional Loom link on a logged check-in (R12-7).
--
-- 3. Client detail flags (R12-8), on clients because they are per-client
--    state, not per-week: program_done (defaults false, ticked when the
--    program is delivered), progress_review_rank (1-4, null until ranked),
--    transformation_had + transformation_post_approved (both default false;
--    these feed the Results flow).
--
-- ⚠ PROPOSED - OWNER APPLIES THIS AFTER REVIEW. Apply to BOTH brands.
-- Idempotent; all columns nullable or defaulted, so nothing existing changes.

alter table public.clients
  add column if not exists check_in_day smallint
    check (check_in_day is null or (check_in_day >= 0 and check_in_day <= 6)),
  add column if not exists program_done boolean not null default false,
  add column if not exists progress_review_rank smallint
    check (progress_review_rank is null or (progress_review_rank >= 1 and progress_review_rank <= 4)),
  add column if not exists transformation_had boolean not null default false,
  add column if not exists transformation_post_approved boolean not null default false;

alter table public.check_ins
  add column if not exists loom_url text;
