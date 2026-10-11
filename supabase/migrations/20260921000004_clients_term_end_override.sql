-- R16-6a (PROPOSED, not applied): manual Term End override, edited in the
-- Renewals screen. Chosen over a GHL write-back of `termenddate` because (1)
-- src/lib/writeback.ts is still a stub (no GHL PUT path exists), and (2) the
-- GHL Subscription End / Pause workflows key off that date field, so a portal
-- write could fire a workflow that contacts a client (NO-CONTACT rule).
-- The nightly sync keeps refreshing clients.end_date from GHL; the override,
-- when set, wins on the Renewals screen and is never written back to GHL.
alter table public.clients add column if not exists term_end_override date;
comment on column public.clients.term_end_override is 'R16-6a: manual term end set in the Renewals screen; overrides end_date (GHL) for the re-sign window. Not written back to GHL.';
