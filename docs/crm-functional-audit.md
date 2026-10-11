# CRM Functional Audit — 2026-06-20

Audit of what stands between today and a functional CRM, measured against BUILD-SPEC.md.

## Bottom line

Every CRM screen is **built**. The sales side looks empty for two reasons, both on the GHL side, neither fixable by writing more HQ code:

1. **No leads/opportunities live in GHL.** The client base was imported (423 active+paused, plus cancelled history); the sales *pipeline* was never populated. So Pipeline, Sales Performance, and Analytics have nothing to project.
2. **The live GHL token lacks Conversations + Calendar scope.** Inbox and Call Calendar are code-complete but 401 on those endpoints until `GHL_API_TOKEN` is swapped to the "DP HQ Sync v2" token.

## Status by capability

| CRM capability | Built? | State | Blocker |
|---|---|---|---|
| Client Database + detail | Yes | **Live** | none, working |
| Client Journey Tracker | Yes | **Live** | none, working |
| Pipeline (Kanban / Table / Stages / lead drawer) | Yes | Empty | no opportunities in GHL |
| Sales Performance / Sales dashboard | Yes | Empty | no opportunities + setter/closer users map |
| Analytics (funnel, lead-source table) | Yes | Empty | no lead data |
| Call Calendar | Yes (code) | Dark | GHL token missing Calendar scope |
| Inbox / Conversations | Yes (code) | Dark | GHL token missing Conversations scope |
| Dashboard pipeline + social panels | Yes | Partial | pipeline panel empty until opportunities exist |

## To make the sales CRM functional (owner / Dan actions)

These are the real unblockers. None are code.

1. **Swap the GHL token.** Set `GHL_API_TOKEN` = the DP HQ Sync v2 token (Conversations + Calendar scopes) in Vercel and `.env.local`. Lights up Inbox + Call Calendar with no code change.
2. **Get leads into GHL.** Wire lead capture (IG / Typeform / website → a GHL opportunity) and have the setters work leads inside GHL. Pipeline, funnel, and sales reporting populate as data lands.
3. **Confirm the GHL pipeline stage names** so they map cleanly to the HQ stages (New Enquiry / Contacted / Call Booked / Call Taken / Follow-Up / New Client Processing / Submitted / Lost).

## The fork (architecture decision)

The current plan, your call earlier, is: **sales lives in GHL, the HQ reports on it.** That makes the three actions above the path, and it keeps "GHL is the source of truth, HQ is read-mostly" intact.

The alternative, only if GHL won't hold the lead data: **make the HQ own leads** — build add / edit / move-lead and call logging directly onto the Supabase `leads` table, so the pipeline is a working CRM independent of GHL. This is a real build and a reversal of the source-of-truth rule. It is not the default; it happens only if you ask for it.

## Buildable now (HQ code, no GHL dependency)

- **Setter/closer attribution:** build the GHL users map so reps surface on Sales Performance + Call Calendar (verifies once the token is live).
- **Pipeline / Analytics live-data hardening:** finish the opportunity→Lead projection (stages, sources, funnel, days-in-stage, pipeline value) so the screens just work the moment GHL has opportunities.
- **HQ datastore Phase 1** (already approved, migration applied today): the audits / docs / content stores. This is the coaching/admin operational layer, fully unblocked.

## Owner-gated activations still open (from the original scope)

- **Clerk auth** (logins + roles): new project + keys.
- **Stripe** (cash collected / refunds / past-due in Financials): not built, needs a key.
- **Coach capacities + remaining coach logs** (My Pay accuracy, adherence): Dan's real numbers + the other coaches' check-in CSVs.
