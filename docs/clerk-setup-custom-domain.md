# Clerk Activation — DP Performance HQ (custom domain, team rollout)

Clerk auth is fully coded behind `AUTH_MODE=clerk` (off by default). This sheet turns it on
for a 10-20 person team (all coaches + sales + VAs) on a custom domain. It's free at this size:
Clerk's free tier covers 50,000 monthly users.

## Who owns the Clerk app

Either person can create it, it's free, and you do NOT need Dan's existing Clerk account. The
simplest path is **Kai creates it** (Kai does the wiring, the Vercel env vars, and holds the keys),
then **invite Dan as a member** inside Clerk so the business keeps admin access long term. You're
not "connecting an account", you're creating one application and copying its two keys into the HQ.

## Part 1 — Create the Clerk app (Kai, ~5 min)

1. clerk.com -> create application -> name it "DP Performance HQ".
2. Sign-in options: Email + password (and/or email verification code). Social (Google) is optional,
   only worth it if the team is on Google Workspace.
3. What you get first is the Development instance (test keys, `pk_test`/`sk_test`), used for local
   testing only.

## Part 2 — Production instance on the custom domain (Kai + whoever controls the domain DNS)

1. Pick the URL the team will use, e.g. `hq.dpperformance.com`.
2. Add it to Vercel: project -> Settings -> Domains -> add the host -> add the record Vercel shows
   at your DNS host.
3. In Clerk, switch to the Production instance and set the application domain to the same host.
   Clerk shows a handful of CNAME records (frontend API, account portal, and email/DKIM).
4. Add those Clerk CNAME records at your DNS host, then wait for Clerk + Vercel to verify (minutes
   to a few hours).
   - This DNS step is the ONLY thing that needs whoever controls the DP domain. If that's Dan, you
     just send him the records to paste, he doesn't need to touch Clerk.
5. Once verified, copy the LIVE keys: Publishable (`pk_live...`) + Secret (`sk_live...`).

## Part 3 — Env vars (Kai)

Vercel -> Settings -> Environment Variables (Production):

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` = the `pk_live` key
- `CLERK_SECRET_KEY` = the `sk_live` key (secret, never in chat / Notion / git)
- `AUTH_MODE` = leave UNSET until the final switch-on (Part 4)

Local `.env.local` uses the dev (`pk_test`/`sk_test`) keys for testing, so nobody is affected while
the domain verifies.

## Part 4 — Wiring (Claude, with owner go-ahead, this is gated role work)

1. Supabase -> Authentication -> Third Party Auth -> add Clerk (using the Clerk domain), then apply
   `20260612000002_role_policies.sql` so the database trusts Clerk logins (RLS).
2. Load the team invite roster (Part 5) so people self-onboard by email, no manual account creation.
3. Test locally with `AUTH_MODE=clerk`, then set `AUTH_MODE=clerk` in Vercel and redeploy.
   Rollback is just unsetting `AUTH_MODE`, no data changes either way.

## Part 5 — Team invite roster (fill in)

One row per person. On first sign-in at the HQ URL, each account auto-creates from its invite with
the correct role and scope, so onboarding 20 people = everyone logs in once.

| Name | Email | Role | Linked coach |
| --- | --- | --- | --- |
| Daniel Price | (fill) | owner | — |
| Kai Fourie | (fill) | owner | — |
| (every coach) | (fill) | coach | their own coach record |
| (setters + closers) | (fill) | sales | — |
| (VAs) | (fill) | va | — |

Roles:

- **owner** — full access (Dan, Kai).
- **coach** — own clients only; dashboard, my clients, check-ins, results, audits, tasks, pay.
  Never other coaches' data or financials.
- **sales** (setters + closers) — lead pipeline, call calendar, sales performance.
- **va** — client database, pipeline, audits, calendar, tasks. No financials or brand.

Claude pre-fills every coach from the live coach list (GHL "Assigned Coach"); you add the emails.

## Notes

- Cost: free (Clerk free tier covers 50,000 monthly users).
- The HQ password gate stays only for the GHL embed paths; everyone else uses Clerk.
- No outreach: none of this auth work contacts any client or lead.
