-- R19-2b: a phone number on the coach record. HELD, NOT APPLIED.
--
-- WHY THIS IS A HARD STOP AND NOT JUST A COLUMN:
-- 20260612000001 states an explicit decision, "PII boundary (DEFAULT DECISION
-- 1): email/phone are NOT stored here." Coach email already had to be stored,
-- on invites, because a login needs one. Phone has no such forcing reason: the
-- portal never calls or texts a coach, and the NO CONTACT rule means it never
-- will. So this column adds personal data the app does not use.
--
-- The owner asked for the field in the R19-2b brief. That is reason enough to
-- write the migration, and not reason enough to apply it without saying plainly
-- what it changes. Apply it only if the owner wants a phone number kept in the
-- portal rather than in GHL, where the rest of the contact details live.
alter table public.coaches add column if not exists phone text;
comment on column public.coaches.phone is 'R19-2b: coach contact number, owner records only. The portal never dials or messages it (NO CONTACT). Reverses the original no-phone PII boundary; applied deliberately.';
