# CLAUDE.md

Rules file for every session. Read this first.

## Session protocol

This project is self-directing. The full brief is [BUILD-SPEC.md](./BUILD-SPEC.md); live status is [PROGRESS.md](./PROGRESS.md).

**Session start**
- Cloud sessions (Claude Code on the web): read [docs/CLOUD-SESSIONS.md](./docs/CLOUD-SESSIONS.md) first. No production database, secrets or deploys from the cloud; those jobs stay local.
- Current state of both brands: the CURRENT STATE block at the top of `PROGRESS.md`.
- Read `BUILD-SPEC.md` (the goal and every screen spec) and `PROGRESS.md` (current status).
- State the next item out loud before starting (it is the "Next item" pointer at the bottom of `PROGRESS.md`).

**Working loop**
- Work continuously through `[todo]` items in `BUILD-SPEC.md` order. Do NOT stop and check in after every item, except at the hard gates below.
- Take design and screen detail from `BUILD-SPEC.md`; you should not need to ask "what goes on this screen." Match `/reference/prototype.html` and reuse primitives.
- After each item:
  1. Confirm the app still compiles: `tsc --noEmit` passes and the dev server boots. Fix any breakage before moving on.
  2. Mark the item `[done]` in `PROGRESS.md`.
  3. Commit with a conventional message.
  4. Continue to the next item.
- Keep a plain-English running note in the `PROGRESS.md` "Last session summary" and keep the "Next item" pointer current, for the owner's manual review.

**HARD STOP and ask the owner before** (do not proceed autonomously):
- Data model or schema changes (Supabase tables, migrations).
- Auth or roles (Clerk wiring, role enforcement).
- Secrets or `.env` (any key, any `.env*` file).
- Pushing to a remote.
- Deleting files or any destructive action.
- These map to M5 (GHL integration) and M6 (role scaffolds); both are gated.

**Also stop at the end of each milestone (M1...M8) for owner review** before starting the next one.

## Project
- TJD Fit HQ: internal operating dashboard for an online fitness coaching business.
- This is the HQ layer ON TOP of GoHighLevel (GHL). GHL is the CRM and source of truth. This app projects GHL data and adds tooling GHL cannot do. We are NOT rebuilding a CRM.
- The prototype in `/reference/prototype.html` is the DESIGN REFERENCE ONLY. We copy its look and screens, we do not reuse its code.
- One codebase, rebranded per client (TJD Fit, DP Performance). Keep brand-specific values (logo, name, colors) in a single theme/config file, never hardcoded.

## Stack
> Installed versions (pinned from `package.json` at scaffold). Keep this list in sync when you bump dependencies.

- Framework: Next.js `15.5.19`, App Router. `src/` directory, `@/*` import alias.
- Runtime: React `18.3.1` / react-dom `18.3.1`.
- Language: TypeScript `5.9.3`, strict mode.
- Styling: Tailwind CSS `3.4.19` (config-based: `tailwind.config.ts` + `@tailwind` directives in `src/app/globals.css`; PostCSS via `tailwindcss` + `autoprefixer`).
- Lint: ESLint `9.39.4` with `eslint-config-next` `15.5.19` (flat config via `@eslint/eslintrc` FlatCompat); `npm run lint` runs `next lint`.
- Datastore: `@supabase/supabase-js` `2.107.0`. Client in `src/lib/supabase.ts`, reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Auth: `@clerk/nextjs` `^7.4.2`. `<ClerkProvider>` is wired in `src/app/layout.tsx` (provider only, full auth not built yet).
- Env: copy `.env.example` to `.env.local` and fill real keys. `.env.local` is gitignored.

Note on the prototype: `/reference/prototype.html` is a single-file React 18 build loaded via UMD and Babel Standalone from a CDN. That is a prototyping convenience, NOT the app stack. Do not model the real app on it. Take the design (layout, screens, palette, typography) and rebuild on the stack above.

Design language pulled from the prototype, carry it forward:
- Body type: Inter. Display type: Fraunces (serif), with tight negative letter-spacing (about -0.018em).
- Accent green: `#16a34a` light, `#4ade80` dark.
- Light background `#fbfaf7`, dark background `#0f0f12`.
- Full light and dark palettes plus status, plan, and resource-type pill colors are defined in the prototype shared-data block. Use these as the basis for the theme config.

## Architecture rules
- 4 login roles: owner, coach, sales, va. Role is a property on the user. The shell (sidebar + default screen) is chosen by role. Owner is fully built; coach/sales/va are scaffolds (M6). Ambassador is NOT a login role: ambassadors do not log in; the Ambassadors screen is an owner-facing, view-only data area.
- Data layer: Supabase is the live datastore. GHL data arrives via API or webhook and is projected (read-mostly) into the HQ. Default all dashboard and roster queries to active-only at the query level.
- Every screen must implement: empty state, loading state (skeleton), error state.
- Theme: light is default, dark is a toggle. Both are first-class. Persist the preference.

## Conventions
- Match existing file, folder, and naming patterns before inventing new ones.
- Reusable primitives live in one components dir. Do not duplicate a Card or KPI.
- UI copy: no em dashes. Use commas, colons, or sentence breaks.
- Tabular numerals on every metric. Tight negative letter-spacing on display numbers.

## Security
- Never commit secrets. All keys in `.env.local` (gitignored). Reference via env vars only.
- Never log full client PII to console in committed code.
- NO CONTACT (owner, non-negotiable): no real client or lead may be contacted by the HQ. Every outbound-contact path (Inbox send, GHL message write-back, automation sends) MUST call `assertOutreachAllowed()` in `src/lib/outreach-guard.ts`, which is OFF unless `OUTREACH_ENABLED="true"`. Note: GHL field write-backs can trigger GHL-side workflows that contact people, so test write-back on a throwaway contact only.

## Git
- Small, frequently committed increments. Conventional commit messages.
- Never force-push main. Feature branches for anything non-trivial.
