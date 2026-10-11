-- R17-1. APPLIED to DP (vutdqjfixvijldlyvbaw) on 2026-09-25 via the Supabase
-- SQL editor, on the owner's explicit go. Verified after: start_date
-- is_nullable = YES, start_date_override exists as date.
-- Two changes to clients, both required before the R17 build can be deployed.
--
-- 1. start_date DROP NOT NULL.
--    Root cause of R17-1a: GHL's "Start Date" custom field is blank on new
--    Newie signups, and src/lib/ghl/map.ts fell back to the contact's
--    dateAdded, which for a Newie signup is the PAYMENT date. Audited
--    2026-09-25: 122 of 533 active DP clients carry a start date that is
--    really their signup/payment date, every one of them from a blank field.
--    The fallback is being removed, so the sync must be able to store "we do
--    not know yet" instead of inventing a date. The portal then shows
--    "Start date needed" and counts the client as needing one.
--
-- 2. start_date_override date null.
--    Root cause of R17-1b: setClientStartDateAction wrote clients.start_date
--    and the nightly sync overwrote it from GHL on the next run, so even the
--    owner's correction did not survive the night. Same shape as
--    clients.term_end_override (R16-6a): the sync keeps owning start_date,
--    the portal owns the override, and every read resolves
--    effectiveStartDate = start_date_override ?? start_date.
--    NOT written back to GHL: its workflows key off that field and the
--    NO CONTACT rule stands.
--
-- ORDER: apply this BEFORE deploying R17. If the code ships first, the sync
-- will try to write a null start_date and the whole clients upsert chunk will
-- fail the NOT NULL constraint.
alter table public.clients alter column start_date drop not null;
alter table public.clients add column if not exists start_date_override date;
comment on column public.clients.start_date is 'Program start as projected from GHL. NULL = GHL has no Start Date for this client yet (never guess it from dateAdded, that is the payment date).';
comment on column public.clients.start_date_override is 'R17-1b: program start set in the portal. Wins over start_date. Never written back to GHL.';
