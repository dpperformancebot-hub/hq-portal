-- R16-2c step 1 of 2 (PROPOSED, not applied): allow the new MS ("Message
-- sent") code alongside the old set while scripts/remap-checkin-codes.mjs
-- converts every SM and M row to MS. Apply this BEFORE the remap. After the
-- remap, 20260921000002 drops SM. M stays valid: it now means "Missed".
alter table public.check_ins drop constraint if exists check_ins_code_check;
alter table public.check_ins
  add constraint check_ins_code_check
  check (code in ('SM','Y','MS','M','F','G','P','C','N'));
