# Security + completeness audit, 2026-07-02

Scope: full-codebase security pass plus feature-completeness check against the
truth docs (BUILD-SPEC.md, DATA-MODEL.md, CLAUDE.md rules,
docs/portal-completion-audit.md). Code at HEAD abab4c3 plus two uncommitted
items (sidebar search, PROGRESS.md refresh).

## Security findings

Owner approved fixes same day; findings 1, 2, 4, 5 are FIXED in the working
tree (2026-07-02, tsc clean, pending commit + redeploy).

### HIGH (both FIXED 2026-07-02)

1. **assignCoachAction / assignClientsToCoachAction had no caller check.**
   `src/lib/coach-assign-actions.ts`. Server actions wrote `clients.coach_id`
   via the service-role client without calling `getServerIdentity()`; any
   authenticated user could reassign any client.
   FIXED: owner-only gate (checked on realRole so owner impersonation still
   works) at the top of both actions.

2. **setAuditStatus / setAuditResolved had no caller check.**
   `src/lib/audit-actions.ts`. Any authenticated user could rewrite the QA
   audit trail.
   FIXED: writes now allowed for owner (real role) and va; a coach only for
   clients on their own roster (verified against clients.coach_id); sales
   denied.

### MEDIUM

3. **Clerk is a Development instance (pk_test) in production.** Known and
   accepted for now (test keys work on the vercel.app domain; live keys are
   domain-locked). Revisit when a real domain is mapped: create a Production
   Clerk instance and swap keys in Vercel. OPEN (owner task).

4. **Password-gate comparison was not timing-safe.** `src/middleware.ts`.
   FIXED: constant-time XOR comparison (edge-safe, no node:crypto).

### LOW

5. **CSV export had no formula-injection guard.** `src/lib/csv.ts`.
   FIXED: cells starting with `=` `+` `@` `-` are prefixed with `'` unless the
   cell is a plain number (negative metrics stay numeric).

6. **Static theme script via dangerouslySetInnerHTML.** `src/app/layout.tsx:40`.
   Static string, no user input. No action needed.

### Verified clean

- No hardcoded secrets in tracked source; `.env*`, `data-imports/` (PII) and
  `.clerk/` gitignored; service-role key and GHL token server-only.
- Outreach guard: no send-capable path bypasses `assertOutreachAllowed()`;
  OUTREACH_ENABLED remains OFF.
- API routes: kahunas + ghl webhooks require their shared secrets and fail
  closed when unset; /api/sync/ghl requires CRON_SECRET or the Vercel cron
  header; /api/search sits behind middleware auth and role-scopes its index.
- Read scoping: coach screens derive the coach from the server identity, never
  from URL params; my-clients detail validates roster membership.
- Impersonation: cookie only honoured when the real session role is owner
  (validated server-side each request); returnTo paths validated against open
  redirects.
- No PII in committed logs (webhook handlers deliberately log shape only).
- No eval, no unvalidated redirects, NEXT_PUBLIC vars contain nothing secret.

## Completeness vs the truth docs

### Fully present

- All BUILD-SPEC owner screens routed and built (44 owner routes; no "Coming
  next" placeholders left). Coach portal complete (10 screens incl. tools),
  sales (4) and VA (6) scaffolds per spec.
- Roles per CLAUDE.md: 4 login roles with role-chosen shell and default route;
  head coach is a coaches-record tier, not a login role; Ambassadors is an
  owner-facing view-only area.
- Theme: light default, dark first-class, preference persisted.
- Brand: single config in src/lib/brand.ts (dp + tjd), no hardcoded brand
  values in components.
- Data layer: live selectors filter active-only at the query level; facade
  falls back to seed when persistence is off.
- CSV export on every major table; report detail now renders the stored body.
- Sidebar search opens the global command palette (single search surface).

### Known-stale agent notes, corrected here

- The three 2026-06-30 migrations ARE applied to live Supabase (2026-07-01),
  so in-portal check-in logging, client notes, the New-X buttons, review-tick
  and notification persistence are ACTIVE, not pending.

### Real gaps (accepted / scheduled)

- Per-screen error.tsx: screens rely on the route-group error boundary rather
  than one per screen. Rule is satisfied in spirit (every screen HAS an error
  state via the group boundary); strict per-screen boundaries are a low-risk
  polish item.
- One hardcoded color pair in src/app/global-error.tsx (renders when theme
  tokens may be unavailable; arguably intentional, but worth a comment or
  token use).
- File upload (Brand Assets binaries, transformation photos) not built
  (metadata only) - deferred phase.
- External feeds: Stripe (financial depth), GHL opportunities (Pipeline/Sales
  data), Kahunas live feed (no API exists), social APIs - all owner/Dan-gated,
  not code gaps.
- Coach Assistant + AI client summary need a Claude API key (decision, then
  small build).

### Verdict

Feature-complete as an operating hub (~90%+ of spec; 100% of screens). The
security posture is sound at the perimeter (auth, webhooks, scoping, outreach
guard) with two real authorization holes in server actions (findings 1-2) as
the only high-priority items.
