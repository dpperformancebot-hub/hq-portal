-- D5 (FEEDBACK-V2): a notes field per renewal (call booked / thinking / etc).
-- One live note per client, kept on the client row: renewals are DERIVED rows
-- (client + term end), so the note rides the client. The nightly GHL sync
-- never writes this column, so it is HQ-owned and survives syncs.
--
-- OWNER APPLIES THIS. Until applied, saving a renewal note reports the
-- missing migration honestly.

alter table public.clients
  add column if not exists renewal_note text;
