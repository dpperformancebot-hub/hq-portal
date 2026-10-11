-- A9 (FEEDBACK-V2): approvals are no longer one-way. A reviewer can send a
-- transformation back a stage with a reason; the reason surfaces on the card
-- until the transformation advances again.
--
-- OWNER APPLIES THIS (schema changes are owner-gated). Until applied, the
-- send-back action still moves the stage but reports that the reason could
-- not be stored.

alter table public.transformations
  add column if not exists sent_back_reason text,
  add column if not exists sent_back_at timestamptz;
