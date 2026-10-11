-- R7-1 (FEEDBACK-V2): Weekly Capacity rebuild to Dan's mockup
-- (reference/capacity-mockup). coach_capacity gains the five-band scale and
-- the optional note; submitted_at (created_at) and updated_at already exist
-- separately, so a late submission is distinguishable from a late revision.
-- Existing '5+' answers map to '5-6' (the conservative half of the old band).
--
-- ⚠ PROPOSED - OWNER APPLIES THIS AFTER REVIEW. Until applied, the two new
-- bands and notes fail with an honest error; old bands keep working.

alter table public.coach_capacity drop constraint if exists coach_capacity_capacity_check;
update public.coach_capacity set capacity = '5-6' where capacity = '5+';
alter table public.coach_capacity add constraint coach_capacity_capacity_check
  check (capacity in ('0','1-2','3-4','5-6','7+'));

alter table public.coach_capacity
  add column if not exists note text;
