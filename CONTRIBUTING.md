# Contributing

One codebase serves two portals: DP Performance and TJD Fit. Kai owns the
repo, the production data and the deploys. Read this before your first change.

## How to make a change

1. **Never push to `master`.** Branch from the latest `master` instead:
   `git checkout master && git pull && git checkout -b feat/short-name`
   (use `fix/` for bug fixes, `docs/` for docs).
2. Keep each branch to one change. Commit in small steps with conventional
   messages (`feat: ...`, `fix: ...`, `docs: ...`).
3. Before you open a PR, run the checks. Both builds must pass, because one
   codebase serves both brands:
   ```
   npx vitest run
   npx tsc --noEmit
   npm run lint
   NEXT_PUBLIC_BRAND=dp npm run build
   NEXT_PUBLIC_BRAND=tjd npm run build
   ```
4. Push your branch and open a pull request against `master`. In the
   description, say what changed and why, give the check results, and name
   any migration file or data step the change needs.
5. Kai reviews and merges. Don't merge your own PR, don't force-push, and
   don't rewrite shared history.

## What stays with Kai

- **Production data.** Don't connect to either production Supabase database:
  no reads, writes, SQL editor or `scripts/*.mjs` runs against them. A schema
  change is written as a file in `supabase/migrations/` and applied by Kai.
- **Deploys.** Neither Vercel project is git-connected, so merging does not
  deploy anything. Kai deploys each brand by hand.
- **Secrets.** Never commit a key, token or `.env*` file. Only `.env.example`
  with placeholder values is tracked. If you need a key to test something, ask
  Kai instead of adding one.
- **Logins and roles.** Clerk settings, invites and role changes go through
  Kai.

## Working locally

- With no Supabase or GHL env vars set, the app runs on seed data in
  `src/lib/seed`. Tests use the same seed data. `npm run dev` starts the app,
  and dev-preview roles let you see each role's view.
- Brand-specific values (name, colours, pay model, feature flags) live in
  `src/lib/brand.ts`, never in screen code. A change for one brand is gated on
  a brand flag there, so the other brand stays unchanged.

## Data rules

- Never commit real client data: names, emails, phone numbers, prices,
  rosters, spreadsheets, CSVs, screenshots of real data. Tests and fixtures use
  made-up names.
- **No contact.** Nothing in the portal may message a real client or lead.
  Every outbound path goes through `assertOutreachAllowed()` in
  `src/lib/outreach-guard.ts`. Don't bypass it.

House rules for code style and copy (for example, no em dashes in UI copy) are
in [CLAUDE.md](./CLAUDE.md).
