-- M6: per-role RLS policies. APPLY AT AUTH ACTIVATION, after:
--   1. 20260612000001_initial_schema.sql is applied,
--   2. Clerk is configured as a third-party auth provider in Supabase
--      (Clerk JWTs verified by Supabase; auth.jwt()->>'sub' = clerk user id),
--   3. users rows exist (clerk_id -> role, linked_coach_id).
--
-- Until then the schema stays service-role-only (RLS on, zero policies) and
-- this file is inert. Applying it early is harmless: policies only widen
-- access for verified Clerk JWTs, which do not exist before activation.
-- Idempotent: each policy is dropped-if-exists first, so re-running is safe.
--
-- Model (DEFAULT DECISIONS 19-20, flagged in docs/supabase-schema-proposal.md):
--   * READ policies only. ALL writes keep going through server routes using
--     the service-role key (which bypasses RLS); no JWT-holder can write.
--   * Scopes mirror the nav/spec: owner everything; coach own roster only,
--     never financials; sales pipeline only; va ops (clients, audits, tasks)
--     but no financials/snapshots.
--   * coaches table holds pay rates, so non-owner roles get NO direct read;
--     coach names reach the UI through server-side selectors. A coach may
--     read their own row (their own rates are their business).

-- ---------------------------------------------------------- helpers
create or replace function public.hq_clerk_id()
returns text language sql stable as $$
  select nullif(auth.jwt()->>'sub', '')
$$;

create or replace function public.hq_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.users where clerk_id = public.hq_clerk_id()
$$;

create or replace function public.hq_linked_coach_id()
returns uuid language sql stable security definer set search_path = public as $$
  select linked_coach_id from public.users where clerk_id = public.hq_clerk_id()
$$;

-- ---------------------------------------------------------- users
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select using (clerk_id = public.hq_clerk_id());
drop policy if exists users_select_owner on public.users;
create policy users_select_owner on public.users
  for select using (public.hq_role() = 'owner');

-- ---------------------------------------------------------- coaches
drop policy if exists coaches_select_owner on public.coaches;
create policy coaches_select_owner on public.coaches
  for select using (public.hq_role() = 'owner');
drop policy if exists coaches_select_self on public.coaches;
create policy coaches_select_self on public.coaches
  for select using (id = public.hq_linked_coach_id());

-- ---------------------------------------------------------- clients
drop policy if exists clients_select_owner_va on public.clients;
create policy clients_select_owner_va on public.clients
  for select using (public.hq_role() in ('owner','va'));
drop policy if exists clients_select_own_coach on public.clients;
create policy clients_select_own_coach on public.clients
  for select using (
    public.hq_role() = 'coach' and coach_id = public.hq_linked_coach_id()
  );

-- ---------------------------------------------------------- leads
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select using (public.hq_role() in ('owner','sales','va'));

-- ---------------------------------------------------- transformations
drop policy if exists transformations_select_owner on public.transformations;
create policy transformations_select_owner on public.transformations
  for select using (public.hq_role() = 'owner');
drop policy if exists transformations_select_own_coach on public.transformations;
create policy transformations_select_own_coach on public.transformations
  for select using (
    public.hq_role() = 'coach' and coach_id = public.hq_linked_coach_id()
  );

-- ------------------------------------------------------ client_audits
drop policy if exists client_audits_select_owner_va on public.client_audits;
create policy client_audits_select_owner_va on public.client_audits
  for select using (public.hq_role() in ('owner','va'));
drop policy if exists client_audits_select_own_coach on public.client_audits;
create policy client_audits_select_own_coach on public.client_audits
  for select using (
    public.hq_role() = 'coach' and coach_id = public.hq_linked_coach_id()
  );

-- -------------------------------------------------------------- tasks
drop policy if exists tasks_select_owner_va on public.tasks;
create policy tasks_select_owner_va on public.tasks
  for select using (public.hq_role() in ('owner','va'));
drop policy if exists tasks_select_assigned on public.tasks;
create policy tasks_select_assigned on public.tasks
  for select using (
    assigned_to = (select id from public.users where clerk_id = public.hq_clerk_id())
  );

-- -------------------------------------------------------- automations
drop policy if exists automations_select_owner on public.automations;
create policy automations_select_owner on public.automations
  for select using (public.hq_role() = 'owner');

-- --------------------------------------------------------- sales_reps
drop policy if exists sales_reps_select on public.sales_reps;
create policy sales_reps_select on public.sales_reps
  for select using (public.hq_role() in ('owner','sales'));

-- ---------------------------------------------- daily_snapshots (financial)
drop policy if exists daily_snapshots_select_owner on public.daily_snapshots;
create policy daily_snapshots_select_owner on public.daily_snapshots
  for select using (public.hq_role() = 'owner');

-- -------------------------------------------------------- sync_events
drop policy if exists sync_events_select_owner on public.sync_events;
create policy sync_events_select_owner on public.sync_events
  for select using (public.hq_role() = 'owner');
