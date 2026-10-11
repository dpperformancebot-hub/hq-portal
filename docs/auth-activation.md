# M6 Auth Activation Runbook (Clerk)

Code is fully wired behind `AUTH_MODE=clerk` (default off). Follow this in
order; prod is unchanged until step 6. Owner handles every key per the
secrets rule: no keys in chat, git, or Notion.

## 1. Clerk application

Create a production Clerk app (clerk.com) named DP Performance HQ. Enable
email + password (or email code) only; no social logins needed for a
4-person team. Collect: publishable key (pk_live...) and secret key
(sk_live...).

## 2. Env vars (.env.local + Vercel)

Replace the placeholder Clerk values:

- NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: the pk_live key
- CLERK_SECRET_KEY: the sk_live key
- AUTH_MODE: leave UNSET for now (set in step 6)

## 3. Supabase third-party auth

Supabase Dashboard > Authentication > Sign In / Up > Third Party Auth > add
Clerk, using the Clerk domain. This lets Supabase verify Clerk JWTs so the
RLS policies (migration 0002) can read `auth.jwt()->>'sub'`. Apply
migration 20260612000002_role_policies.sql now if not already applied.

## 4. Users rows

Each team member signs in once (their Clerk user id appears in the Clerk
dashboard under Users), then insert their row in the Supabase SQL editor:

```sql
insert into users (clerk_id, role, name, linked_coach_id) values
  ('user_xxx', 'owner', 'Kai', null),
  ('user_yyy', 'coach', 'Angus', (select id from coaches where name = 'Angus')),
  ('user_zzz', 'va',    'VA name', null);
```

Roles: owner | coach | sales | va. linked_coach_id is REQUIRED for coaches
(it scopes their entire view) and null for everyone else. A signed-in user
with no row gets role va (least privilege), never owner.

## 5. Local test (before prod)

Set AUTH_MODE=clerk in .env.local, boot dev, then check:

1. Direct visit to / redirects to /sign-in; signing in lands on /dashboard
   with the role's own dashboard and scoped sidebar.
2. Dev role switcher is GONE (role is locked to the users row).
3. Coach login: dashboard/My Clients/Check-ins/Results/My Pay show ONLY that
   coach's clients; /client-database and /financials redirect away.
4. ?embed=1 still goes through the password gate, not Clerk (the GHL iframe
   path; decision 24).
5. /api/sync/ghl and /api/webhooks/ghl still answer to their secrets
   (middleware excludes them from both gates).

## 6. Production

Set AUTH_MODE=clerk in Vercel, redeploy, re-run the checklist against the
live URL, then check the GHL tabs still load (they stay on the password
gate).

## Rollback

Unset AUTH_MODE (or set to anything except "clerk") and redeploy: the app
reverts to the password gate exactly as before. No data changes either way.

## Known limits (flagged decisions)

- Embedded GHL tabs never use Clerk (decision 24): third-party auth cookies
  inside a cross-origin iframe are unreliable. The tabs remain the
  password-gated owner view.
- No user admin UI yet: users rows are managed in SQL (above). A Team
  settings UI can follow once auth is proven.
- Sales/VA logins work today but their deep screens beyond the dashboards
  still render owner-built views scoped by the RouteGuard nav, with
  query-level scoping per screen arriving as reads move to Supabase.
