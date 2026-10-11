-- R11 (adversarial access audit): return the database to SERVICE-ROLE ONLY.
--
-- 20260612000002_role_policies.sql added 17 per-role SELECT policies intended
-- for a future "Clerk JWT verified by Supabase" direct-read model. That model
-- was never adopted: VERIFIED 2026-08-18 that nothing in the app reads the
-- database with the anon key or a user JWT. Every read goes through server
-- components and server actions using the service-role key, which bypasses
-- RLS entirely. src/lib/supabase.ts (the only anon client) had ZERO importers
-- and is deleted in the same commit.
--
-- So these policies grant access no feature needs: pure attack surface. If
-- Supabase is ever configured with Clerk as a third-party auth provider, any
-- signed-in user's JWT would immediately gain direct table reads (a coach
-- could query the clients table straight from a browser console, bypassing
-- every server-side guard added in this audit). Dropping them closes that.
--
-- SAFE TO RE-RUN: every drop is IF EXISTS. Dropping a policy on an
-- RLS-enabled table with no other policies = deny-all for non-service-role,
-- which is the intended posture. RLS itself stays ENABLED (untouched).
--
-- REVERSIBLE: re-apply 20260612000002_role_policies.sql to restore them.
--
-- ⚠ PROPOSED - OWNER APPLIES THIS AFTER REVIEW. Apply to BOTH brands.

drop policy if exists users_select_own on public.users;
drop policy if exists users_select_owner on public.users;

drop policy if exists coaches_select_owner on public.coaches;
drop policy if exists coaches_select_self on public.coaches;

drop policy if exists clients_select_owner_va on public.clients;
drop policy if exists clients_select_own_coach on public.clients;

drop policy if exists leads_select on public.leads;

drop policy if exists transformations_select_owner on public.transformations;
drop policy if exists transformations_select_own_coach on public.transformations;

drop policy if exists client_audits_select_owner_va on public.client_audits;
drop policy if exists client_audits_select_own_coach on public.client_audits;

drop policy if exists tasks_select_owner_va on public.tasks;
drop policy if exists tasks_select_assigned on public.tasks;

drop policy if exists automations_select_owner on public.automations;

drop policy if exists sales_reps_select on public.sales_reps;

drop policy if exists daily_snapshots_select_owner on public.daily_snapshots;

drop policy if exists sync_events_select_owner on public.sync_events;

-- The helper functions the policies used are now unreferenced. Dropped so a
-- future policy cannot silently resurrect the JWT-read model.
drop function if exists public.hq_role();
drop function if exists public.hq_linked_coach_id();
drop function if exists public.hq_clerk_id();
