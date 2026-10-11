# GHL Sub-Account Inventory — DP Performance (snapshot)

Read-only snapshot of the DP Performance GoHighLevel sub-account, pulled via the GHL API on
24 Jun 2026. Location `R99JktDA6ajZeTWo4YPu`. Nothing was modified in GHL. Re-runnable any time:
`node scripts/ghl-inventory.mjs` writes the raw output to `scripts/ghl-inventory.txt`.

Also lives in Notion: "GHL Sub-Account Inventory — DP Performance (snapshot)" under the Master Build Plan.

## At a glance

| Area | What's there |
| --- | --- |
| Pipelines | 2 — Client Acquisition (8 stages), Marketing Pipeline (6 stages) |
| Calendars | 1 calendar, 1 group |
| Custom fields | 17 (all on the contact) + 4 custom values |
| Tags | 6 |
| Users / staff | 0 returned (token lacks Users scope) |
| Workflows | 13, all draft (none active) |
| Forms / surveys | 1 form, 0 surveys |
| Contacts | 781 |
| Opportunities | 0 (both pipelines empty) |
| Channels (IG / WhatsApp / Email / SMS) | Not connected / not API-verifiable — check in GHL UI |

## 1. Pipelines + stages

**Client Acquisition** — the sales pipeline the HQ reads. `7LVtRv3IxCW79lV5XCBx`

1. New Inquiry
2. In Conversation
3. Call Booked
4. Call Taken
5. No Show
6. Follow Up
7. Won / New Client
8. Lost

**Marketing Pipeline** `rTLBgAHwSVw2SGEURebK`

1. New Lead
2. Hot Lead
3. New Booking
4. Visit Attended
5. Sale
6. Left a Review

## 2. Calendars + groups

- **Schedule an Appointment** — active, event type. `hlENil7TryqbHqCM16XA`
- Group: **Business Coaching** — active.

## 3. Custom fields + values

17 custom fields, all on the **contact** record. This is how DP stores client and lead data, and
exactly what the HQ importer and roster / audit screens read.

| Field | Type |
| --- | --- |
| Lead Source | Single select |
| Status | Single select |
| Assigned Coach | Single select |
| Weekly Rate | Number |
| Billing Frequency | Single select |
| Check in frequency | Single select |
| Term Length | Single select |
| Start Date | Date |
| Term End Date | Date |
| Onboarding Fee | Single select |
| Transformation | Single select |
| Permission to Post | Single select |
| Posted | Single select |
| Handover | Single select |
| Content Uploaded | Checkbox |
| Converted to App | Checkbox |
| How often do you normally workout? | Radio |

**Custom values (4)** — merge-field placeholders, not stored data: Promotion Name, Hours of
Operation, Marketing - New Booking Thank You Page URL, Marketing - Website Booking Page URL.

## 4. Tags (6)

ambassador, follow-up, high priority, instagram, tiktok, warm lead

## 5. Users / staff

API returned **0**. The integration token has no View Users scope, so staff aren't readable
through it (they almost certainly exist). Confirm the real user list in the GHL UI. No setters /
closers are set up as opportunity owners yet.

## 6. Workflows (13 — all draft, none active)

| Workflow | Status |
| --- | --- |
| 1. New Lead Nurture (Fast 5) - Claim Offer | draft |
| 2. Appointment Confirmation + Reminders | draft |
| 3. Appt No Show | draft |
| 4. New Sale - Send Review Request | draft |
| 5. Long-Term Nurture | draft |
| 6. Stale Leads | draft |
| Follow-Up Cadence | draft |
| Lost Lead Nurture (building) | draft |
| New Client Onboarding | draft |
| New Client Onboarding | draft |
| No Show Follow Up | draft |
| Sales Pipeline | draft |
| Tag lost reason + add to nurture | draft |

A full nurture / onboarding / no-show set is built but switched **off**, consistent with the
NO-CONTACT rule. Note: two workflows are both named "New Client Onboarding" (one is likely a
duplicate to clean up), and "Lost Lead Nurture (building)" is unfinished.

## 7. Forms / surveys

- Form: **Marketing Form - Claim Offer**. `4JTzxApdzk5PTt1rXhxB`
- Surveys: none.

## 8. Counts

- Contacts: **781**
- Opportunities: **0** (Client Acquisition 0, Marketing Pipeline 0)

## 9. Channels / conversation providers

GHL's API does not expose a definitive "which channels are connected" read. The location carries
the standard social-URL block (Facebook, Instagram, YouTube, and so on), but those are profile
links, not channel connections. **IG / WhatsApp / Email / SMS connection status has to be checked
directly in the GHL UI.** The empty Inbox strongly suggests none are connected yet.

## What this confirms about the HQ

- The HQ's stage mapping matches GHL's real 8 Client Acquisition stages exactly. No drift.
- DP runs on **tagged contacts + custom fields**, not the opportunity object (0 opportunities
  against 781 contacts). The roster and audit screens are correctly wired to read contacts, which
  is why they are populated while the Pipeline screen is empty.
- The 17 contact custom fields are exactly what the client importer and roster / audit read:
  Assigned Coach, Status, Weekly Rate, Billing Frequency, Check in frequency, Term dates,
  Onboarding Fee, Lead Source.

## Gaps + action items

1. **Pipeline is empty (0 opportunities)** — the single biggest gap. Nothing shows on Pipeline,
   Sales Performance, or Analytics until leads become *opportunities*. Fix: the Typeform → GHL
   "Add/Update Opportunity" Zap (built, awaiting Typeform + GHL logins) plus setters logging leads
   as opportunities. Owner: Kai / Dan.
2. **Channels not connected** — IG, WhatsApp, Email, SMS. This is why the Inbox is empty. OAuth in
   GHL settings, by hand. Owner: Dan.
3. **Workflows all draft** — decide which to switch on (new-contacts-only) when going live, and
   clean up the duplicate "New Client Onboarding". Owner: Dan / Kai.
4. **Users, setters + closers** — add them as GHL users and assign them to opportunities (powers
   per-rep sales reporting and the owner avatar). Verify the user list in the UI. Owner: Dan / Kai.
5. **Booking calendar** — only "Schedule an Appointment" exists. Confirm it is the calendar the
   Typeform end-screen points to (replacing Calendly) and that it fits discovery calls. Owner: Kai.
6. **Custom-value URLs** — the two marketing URLs (booking page, thank-you page) are placeholders;
   confirm they hold real URLs. Owner: Dan / Kai.
