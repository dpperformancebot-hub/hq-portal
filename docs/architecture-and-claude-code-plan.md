# Architecture decision + Claude Code execution plan

Written 2026-06-17. Purpose: lock the system architecture, capture the
outstanding "small things," and hand execution to Claude Code (which can run
the app against live data and verify — the Cowork/desktop session cannot run
the Next server or reach Supabase, which is why live debugging stalled).

---

## 1. Architecture (the decision)

Two systems, each doing what it is best at, with the HQ reporting across both.

- **GoHighLevel = sales/CRM engine + source of truth.** Contacts, leads,
  pipeline/opportunities, messaging, calendars, sales workflows. **Setters and
  closers work in GHL.** Do NOT rebuild this in the custom app.
- **Custom HQ (this app) = coaching ops + admin + cross-system reporting.**
  **Coaches and admin/owner work here.** It owns coaching data — check-ins,
  transformations, coach assignment, scorecards, pay — in Supabase.
- **Kahunas → HQ (via Zapier):** check-in forms. **Stripe → HQ:** payments.

**Data flow**
- GHL — API read → HQ (projects contacts/leads/pipeline/calendar/messages for
  display + reporting).
- HQ — Supabase → owns coaching data (check_ins, transformations, coach links).
- HQ — gated write-back → GHL (optional, only fields that should sync, e.g.
  coach assignment). Every outbound-contact path obeys the NO-CONTACT rule
  (`src/lib/outreach-guard.ts`, off by default).

**Is GHL necessary?** Yes, as the sales engine and lead/contact source of truth.
The HQ complements it; it does not replace it.

## 2. Who uses what

| Role | Lives in | The HQ shows them |
| --- | --- | --- |
| Owner / Admin | Custom HQ | Everything (full nav) |
| Coaches | Custom HQ | Their roster, check-ins, results, pay (own clients only) |
| Setters / Closers | GHL | Their sales numbers, reported in the HQ by reading GHL (no sales actions in the HQ) |

Setters = Lucas, Closers = Lilli (`src/lib/sales-config.ts`).

## 3. Current state (honest)

**Done + live:** app deployed (deploys via `vercel --prod`, NOT git — the
project has no Git remote); GHL + Supabase connected; all owner/coach screens
built; Settings/Pipeline/Automations deepened; no-contact kill-switch; Damon
Astuti's coach log imported (58 clients linked, 850 check-ins, 3 transformations
written to Supabase, confirmed by the importer output).

**Needs verifying/finishing in a real env (Claude Code):**
- Live coach names: a fix is in code (`src/lib/coach-registry.ts` +
  `coachNameLoose`) so live coach UUIDs resolve, but it's unverified on the
  deployed app (the desktop session's browser tools time out loading the pages).
- Client Database has **no search/filter** — add one.
- Data caching: `src/lib/db/client.ts` now reads `no-store` (live every
  request). Verify pages aren't slow; if they are, switch to `revalidate ~30s`.
- Kahunas Zap is built up to the trigger but **paused on connecting the Kahunas
  account** (owner step, in Zapier).

## 4. Claude Code execution plan (paste these, one at a time)

Run Claude Code in the repo. It can run `npm run dev` against `.env.local`
(which now has the live Supabase + GHL keys) and verify against real data.

### Prompt A — verify + finish the coaching-data display
> Read CLAUDE.md, PROGRESS.md, and docs/architecture-and-claude-code-plan.md.
> Run the dev server against .env.local (live Supabase). Verify that Damon
> Astuti's 58 imported clients show "Damon" as their coach across Client
> Database, client detail, Coach Overview, Coach Performance, and the coach
> Check-ins screen, with weekly check-in codes and derived adherence. Fix any
> place still showing "Unassigned" for a live coach UUID (a registry exists at
> src/lib/coach-registry.ts; coachNameLoose should resolve it). Add a search/
> filter box to the Client Database. Confirm reads are live; if pages are slow
> from the no-store change in src/lib/db/client.ts, switch to revalidate ~30s.
> Report exactly what you verified on screen.

### Prompt B — enforce the role split
> Per docs/architecture-and-claude-code-plan.md section 2: owner/admin and
> coaches use the HQ (scoped screens); setters/closers are GHL-native. Make the
> HQ's sales screens (Sales Dashboard, Sales Performance, Pipeline) READ from
> GHL for reporting only — no sales write-back/actions in the HQ. Ensure
> ROLE_CONFIG nav matches each role. Verify role scoping with the dev role
> switcher.

### Prompt C — GHL sales reporting (read path)
> Build/verify the GHL read path so setters'/closers' activity reports in the
> HQ: pull opportunities/pipeline and call bookings from GHL into the Sales
> Dashboard, Sales Performance, and Pipeline (read-only projection). Map
> Setters=Lucas, Closers=Lilli (sales-config.ts). Verify against live GHL.

### Prompt D — import the rest of the coaches (when logs are provided)
> For each coach check-in log CSV the owner provides, run:
> node scripts/import-coach-log.mjs "<file.csv>" --commit
> It creates the coach if missing, links clients by name, and loads check-ins +
> transformations. Confirm each coach's roster + check-ins appear in the HQ.

### Prompt E — GHL two-way write (only when the owner asks)
> Follow docs/ghl-twoway-integration-brief.md. Stage 2 write is gated and the
> NO-CONTACT rule is absolute (assertOutreachAllowed, off by default). Coaches'
> assignment write-back first; messaging last and stays off.

## 5. Owner steps (not Claude Code)
- Kahunas Zap: connect the Kahunas account in Zapier, then the webhook
  (`/api/webhooks/kahunas`) needs `KAHUNAS_WEBHOOK_SECRET` set in Vercel.
- Stripe key (from Toby) and Clerk keys (from Dan) → add in Vercel env to turn
  on Financials and logins. Add them in Vercel directly; never paste keys in chat.
