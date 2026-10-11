# GHL transition audit, 2026-07-03

Read-only audit of the DP Performance GHL sub-account (location
R99JktDA6ajZeTWo4YPu) against the truth docs (BUILD-SPEC, DATA-MODEL,
ghl-inventory, questions-for-dan, ghl-twoway-integration-brief). Sources: the
June API inventory (scripts/ghl-inventory.txt), live verification done today,
and the docs above. Goal: everything needed for a seamless GHL -> HQ
operation, by owner.

## Verified working today

- GHL_API_TOKEN replaced (was dead since ~Jun 16; every screen was living on
  the Jun-14 Supabase snapshot). Live reads work again.
- REAL-TIME SYNC LIVE: workflow "GHL WBHK" (Contact Created + webhook to
  /api/webhooks/ghl) fired, authenticated, fetched the contact, and correctly
  skipped a non-client (contact_skipped_no_status). Contact edits now reach
  the HQ in seconds; the nightly cron is the backstop.
- Private integrations: "DP HQ Sync" is the HQ's token. "DP Performance API"
  is in active use by something else (last used today; likely Dan's old
  portal): do not touch. Two "DP PERFORMANCE V3" entries look abandoned
  (warning icons): candidates to delete after confirming nothing uses them.

## Foundation that is already right

- 17 contact custom fields exist with exactly the names the HQ maps (Status,
  Assigned Coach, Weekly Rate, Billing Frequency, Term Length, Start Date,
  Term End Date, Lead Source, Transformation, Permission to Post, Posted,
  Handover, onboarding checkboxes, etc.). No schema work needed in GHL.
- Both pipelines match the HQ stage mapping exactly (Client Acquisition:
  New Inquiry -> ... -> Won/Lost; Marketing Pipeline: New Lead -> ... ->
  Left a Review). The HQ also now reads the opportunity-level Lead Source the
  Typeform Zaps will set.
- 781 contacts; ~423 active+paused projected as clients into the HQ.

## THE PUNCH-LIST

### Dan (needs his logins/phone, ~1 hour total)

1. Typeform OAuth in Zapier (2 min) -> unblocks the TikTok Zap (already
   configured: pipeline, stage, lead source); duplicate for Instagram.
   This single login fills Pipeline, Sales Dashboard, Sales Performance,
   Analytics, close rate, new-leads KPIs.
2. WhatsApp COEXISTENCE connect (Settings -> WhatsApp -> "Connect your
   WhatsApp", QR scan from his WhatsApp Business app) + Facebook tile with
   Meta admin login (brings Instagram DMs). -> HQ Inbox lights up.
3. Data answers (from questions-for-dan, still open): real per-coach max
   capacities (all 70 now), rates for the 2 clients at $0/wk, renewal
   price/plan/term for ~16 clients flagged in the VA cleanup sheet, coach
   assignment for the handful of unassigned June clients.
4. Confirm the "Schedule an Appointment" calendar is the discovery-call
   calendar; connect Google Calendar + Zoom per user in My Profile.
5. Approve/veto the 13 draft workflows: which turn on at go-live. Delete the
   duplicate "New Client Onboarding" and finish or delete "Lost Lead Nurture
   (building)". NOTE: any workflow that sends messages must stay off until
   wording is approved (no-contact rule protects this from the HQ side, but
   GHL-side workflows are Dan's responsibility).

### Kai (config, ~30 min)

6. SMART LISTS in GHL Contacts (create these; the setters/VA live in GHL and
   need the same segments the HQ shows):
   - Active Clients: Status = active
   - Paused Clients: Status = paused
   - Expiring 30d: Status = active AND Term End Date within next 30 days
   - No Coach Assigned: Status = active AND Assigned Coach is empty
   - Missing Billing: Status = active AND (Weekly Rate empty OR Term Length empty)
   - New Leads 7d: Created in last 7 days AND no Status field
   Note: GHL smart lists are NOT readable via the public API, so the HQ
   cannot import them literally. The HQ mirrors the same segments natively
   (Client Database filters + the dashboard drill-ins: Active, Paused,
   Expiring already exist). Missing in the HQ today: "No coach" and
   "Missing billing" segment chips: small build, on the list below.
7. Custom values: replace the placeholder marketing URLs (New Booking Thank
   You Page URL, Website Booking Page URL) with the real ones once the
   Typeform booking flow is decided.
8. GHL embed menu links: add the remaining HQ tabs (data-imports/
   ghl-hq-menu-links.md); "DP DASHBOARD HQ" exists already.
9. Housekeeping: delete the two abandoned "DP PERFORMANCE V3" private
   integrations (after confirming no Last Used activity), and rotate the
   secrets still live in Dan's old portal repo (api/: Vercel token, Gmail app
   password, JWT secret).

### HQ build (code, whenever Kai green-lights)

10. Client Database segment chips to mirror the smart lists: No coach,
    Missing billing, Expiring 30d (drill-in exists on dashboard; add as
    roster filters too). Small.
11. Opportunity webhook trigger: extend the GHL workflow (or add a second
    one) for opportunity create/stage-change so Pipeline updates real-time
    once leads flow. The receiver already handles opportunity events; it is
    only the GHL-side trigger that is missing. Do after the Typeform Zap is
    live.
12. Stage 2 write-back (gated, per ghl-twoway-integration-brief): coach
    assignment mirror, pipeline drag stage moves, then (much later, behind
    OUTREACH_ENABLED) message send. Test on a throwaway contact; field
    writes can fire GHL workflows.
13. Setter/closer mapping: when Dan adds Lilli/Lucas as GHL users and
    assigns opportunities, verify sales-config.ts matches their user ids so
    the sales leaderboards attribute correctly.

## What "done" looks like

Lead fills Typeform -> Zap creates a GHL opportunity (New Inquiry, sourced
TikTok/Instagram) -> webhook pushes it to the HQ in seconds -> Pipeline,
Sales screens and dashboard KPIs move -> setter works the lead in GHL,
stages update everywhere -> closes to Won -> contact gets Status/rates ->
becomes an HQ client on the coach's roster -> coach works them in the HQ
portal -> their renewal window shows up in Renewals and the bell. Everything else
(check-ins, pay, audits, notes, tasks, expenses) already lives HQ-native.
