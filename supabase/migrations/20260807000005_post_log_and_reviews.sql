-- R4-4 + R4-5 (FEEDBACK-V2), two small column adds:
--
-- R4-4: content post-log on transformations (master sheet "Ready To Post" /
-- "Post Log" tabs): posted-to-IG, posted-to-TikTok, Canva link, caption.
-- Editable once a transformation reaches "approved".
--
-- R4-5: owner spot-review on client audits (coach log "Daniel Reviews" tabs):
-- rating 1-3 + notes, owner-only write, filterable by coach via the existing
-- audit coach filter.
--
-- OWNER APPLIES THIS. Until applied both editors report the missing migration.

alter table public.transformations
  add column if not exists posted_ig boolean not null default false,
  add column if not exists posted_tt boolean not null default false,
  add column if not exists canva_url text,
  add column if not exists caption text;

alter table public.client_audits
  add column if not exists owner_rating integer check (owner_rating between 1 and 3),
  add column if not exists owner_notes text;
