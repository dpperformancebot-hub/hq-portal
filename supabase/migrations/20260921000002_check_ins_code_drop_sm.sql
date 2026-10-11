-- R16-2c step 2 of 2 (PROPOSED, not applied): tighten the code set once no SM
-- rows remain (scripts/remap-checkin-codes.mjs --apply, then verify
-- `select count(*) from check_ins where code = 'SM'` = 0). Fails safely if any
-- SM row is still present.
alter table public.check_ins drop constraint if exists check_ins_code_check;
alter table public.check_ins
  add constraint check_ins_code_check
  check (code in ('Y','MS','M','F','G','P','C','N'));
