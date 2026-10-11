-- R6-4 (FEEDBACK-V2): new access roles.
--   admin          Jameela: full access (owner-equivalent minus owner-only
--                  actions, which check the real owner role in code).
--   ops_manager    Mykael: everything except financials/MRR/sales; taskboard
--                  is his landing page; money renders digit-masked.
--   ambassador_mgr Ruby: the Ambassadors area only (tabs land with her sheet).
-- Widens the role checks on users AND invites so both flows accept them.
--
-- OWNER APPLIES THIS.

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('owner','coach','sales','va','admin','ops_manager','ambassador_mgr'));

alter table public.invites drop constraint if exists invites_role_check;
alter table public.invites add constraint invites_role_check
  check (role in ('owner','coach','sales','va','admin','ops_manager','ambassador_mgr'));
