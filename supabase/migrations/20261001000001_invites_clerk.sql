-- R19-2a: carry the Clerk invitation on the portal invite row.
--
-- WHY: the portal invite row stays the source of truth for role and coach
-- link, but until now it had nowhere to record what Clerk did with it. Without
-- these columns the screen cannot show Sent / Failed / Accepted, and Resend
-- and Revoke have to re-derive the invitation by listing Clerk every time.
--
-- Also widens the role check. It was written when the portal had four roles;
-- the approved R19-2 matrix invites admin and ops_manager too, and today the
-- constraint would reject both.
alter table public.invites add column if not exists clerk_invitation_id text;
alter table public.invites add column if not exists clerk_status text;
alter table public.invites add column if not exists clerk_error text;
alter table public.invites add column if not exists clerk_synced_at timestamptz;

comment on column public.invites.clerk_invitation_id is 'R19-2a: the Clerk invitation this row created, for Resend and Revoke.';
comment on column public.invites.clerk_status is 'R19-2a: sent | already_invited | already_a_user | failed | skipped | revoked | accepted.';
comment on column public.invites.clerk_error is 'R19-2a: the last Clerk error, so a failed invite is diagnosable rather than just red.';

alter table public.invites drop constraint if exists invites_role_check;
alter table public.invites
  add constraint invites_role_check
  check (role in ('owner','admin','ops_manager','ambassador_mgr','coach','sales','va'));
