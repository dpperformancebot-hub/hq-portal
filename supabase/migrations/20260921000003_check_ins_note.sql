-- R16-2f (PROPOSED, not applied): per-cell coach note on the check-in grid,
-- right-click to edit, max 280 chars (enforced in the action). Nullable, no
-- default, no backfill. Cleared with the cell ("Clear entry").
alter table public.check_ins add column if not exists note text;
comment on column public.check_ins.note is 'Coach note for this client-week (R16-2f); max 280 chars, cleared with the entry.';
