# Cloud sessions (Claude Code on the web)

Day-to-day coding now happens in Claude Code on the web, which works from the
GitHub repo only (`rawandformed/hq-portal`, private). This file says what
a cloud session may and may not do. Read it after CLAUDE.md, then the
"CURRENT STATE" block at the top of PROGRESS.md.

## What a cloud session works with

- The code on GitHub, nothing else. No `.env.local`, no `.env.tjd.local`, no
  `data-imports/`, no `.vercel/` link, no access to the owner's Chrome.
- Demo/seed data. With no Supabase or GHL env vars the app runs on
  `src/lib/seed` (DEMO_MODE), which is what the tests use too.

## A cloud session MAY

- Write and change code under `src/`, `test/`, `docs/`, `supabase/migrations/`
  (as files only, see below), and the tracking docs (PROGRESS.md,
  FEEDBACK-V2.md).
- Run the checks: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`,
  `NEXT_PUBLIC_BRAND=dp npm run build`, `NEXT_PUBLIC_BRAND=tjd npm run build`.
  Both builds must pass, because one codebase serves both brands.
- Run the dev server on seed data (`npm run dev`, dev-preview roles) for
  visual checks.
- Commit on a branch and open a pull request against `master`, with the
  test/build results in the description.

## A cloud session MAY NOT

- **Touch a production database.** No Supabase writes or reads against DP
  (`vutdqjfixvijldlyvbaw`) or TJD (`evydffzomgrnhjcrfjxi`), no SQL editor, no
  running `scripts/*.mjs` that connect to either. A migration may be WRITTEN
  as a file in `supabase/migrations/`, but applying it is a local, owner-
  approved step.
- **Handle secrets.** Never create, request, paste or commit a key, token or
  `.env*` file (only `.env.example` with placeholder values is tracked).
- **Deploy.** Neither Vercel project is git-connected, so merging or pushing
  does NOT deploy anything. Deploys are local CLI runs (see below).
- **Contact anyone.** The NO CONTACT rule in CLAUDE.md applies: no emails,
  Slack, GHL messages or Clerk invitations to real people.
- **Commit local-only material.** Client names, emails, prices or roster
  data, spreadsheets, CSVs, backups, screenshots of real data. If a script
  needs client-specific decisions, they go in a gitignored file under
  `data-imports/` (pattern: `data-imports/sheets/tjd/master-sync-decisions.json`).

## Local-only files (not on GitHub, must never be committed)

All gitignored. A cloud session will not see them, and must not recreate
them with real values.

| Path | What it is |
|---|---|
| `.env.local` | DP Supabase + Clerk dev keys used by local scripts and `vercel link` |
| `.env.tjd.local` | TJD Supabase URL + service-role key (the only local TJD DB access) |
| `.vercel/` | Vercel project link (currently TJD) |
| `data-imports/` | Sheets, CSVs, import backups, owner decision files |
| `private/` | TJD business notes (sign-ins, syncs, pay decisions); owner only |
| `.next/` | Build output and the dev fetch cache |

## Jobs that stay LOCAL (owner's machine, Claude Code CLI)

- Any database write or import: `scripts/tjd-master-sync.mjs`,
  `scripts/tjd-import.mjs`, `scripts/import-checkin-logs.mjs`,
  `scripts/import-coach-log.mjs`, `scripts/reconcile-clerk-users.mjs`,
  invite rows, relinking or deleting `users` rows, applying migrations.
- Sheet syncs and diffs: `npm run sheets:diff`, `scripts/roster-diff.mjs`,
  anything reading `data-imports/` or `~/Downloads`.
- Anything that needs `.env.local` or `.env.tjd.local`.
- Deploys: `vercel --prod --yes` from the repo (linked to TJD), and the DP
  link swap described in PROGRESS.md. Deploy only the brand the owner names.
- Browser checks in the owner's Chrome (signed-in portal, Supabase
  dashboard SQL editor, Clerk dashboard), and live "view as" walkthroughs.

## Handing work from cloud to local

1. Cloud: PR with code + tests, both builds green, and a note of any
   migration file or data step it needs.
2. Owner merges to `master`.
3. Local session: pull, apply any migration (owner go), run any data step
   (dry run first), deploy the named brand, verify live, update PROGRESS.md.
