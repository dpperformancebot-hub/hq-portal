# GHL Two-Way Integration — Build Brief

Goal: the HQ reads AND writes GoHighLevel. Live Inbox (read messages, send
replies), live Calendar (read events, book), and client write-back (status,
coach, start date) from the HQ.

## HARD RULE — NO ONE GETS CONTACTED (owner, non-negotiable)

No real client or lead may be contacted by the HQ while this is built. Enforced
in code by `src/lib/outreach-guard.ts` (`assertOutreachAllowed()`), which fails
CLOSED: every send path MUST call it, and it is OFF unless `OUTREACH_ENABLED="true"`.
- Send-message write-back: gate behind `assertOutreachAllowed()`; leave OFF.
- Any automation action that contacts a person: same gate; the engine stays
  non-executing regardless.
- Even non-message write-backs (coach / status / start date) can trigger
  GHL-SIDE workflows that contact people. So test write-back on ONE throwaway
  contact only, and confirm which GHL workflows are live before any real record.

Owner priority order for the write-backs (all four requested):
1. Move leads through pipeline stages (`PUT /opportunities/{id}` stage).
2. Assign / reassign coaches — HQ-owned today (Supabase `clients.coach_id`);
   easiest and carries no GHL contact risk, so do this first.
3. Edit client details (start date, plan, status) via `writeback.ts`.
4. Send messages from Inbox — build last, and keep it gated OFF by the
   kill-switch until the owner deliberately enables it.

## Why this is a tested build, not blind code

It touches real client records and live conversations. Build it with the dev
server running against the live `DP HQ Sync v2` token in `.env.local`, so the
GHL response shapes are exact and no write ships untested. Cowork can't run the
dev server or hit GHL, which is why this brief exists.

## Scopes (already on DP HQ Sync v2)

View+Edit Contacts · View+Edit Opportunities · View Custom Fields ·
View Conversations + View Conversation Messages + Edit Conversation Messages ·
View Calendars + View Calendar Events + Edit Calendar Events.

GHL API: `https://services.leadconnectorhq.com`, header `Version: 2021-07-28`,
`Authorization: Bearer <GHL_API_TOKEN>`. Match the patterns in
`src/lib/ghl/client.ts`.

---

## STAGE 1 — READ (do first, deploy + verify before Stage 2; zero write risk)

### Inbox
- `GET /conversations/search?locationId=…` → conversations (id, contactId,
  type, lastMessageBody, lastMessageDate, unreadCount).
- `GET /conversations/{id}/messages` → messages (id, body, direction, type,
  dateAdded).
- Map to the existing `Conversation` shape in `src/lib/seed/m4.ts`:
  - `channel`: from GHL type — SMS/WhatsApp → `whatsapp`, IG → `instagram`,
    Email → `email`; FB/other → closest + keep the raw type for a label.
  - `name`, `coach`, `plan`, `ltv`, `contactType`: join the roster (clients by
    `ghl_contact_id`); not in the roster → contactType `Lead`.
  - `adherence`, `lastCheckIn`: leave 0 / "awaiting" — Kahunas has no API.
  - `messages`: load **on demand** when a thread is opened (server action
    `getMessages(conversationId)`), not all upfront.
- Files: `ghl/types.ts` (GhlConversation, GhlMessage), `ghl/client.ts`
  (fetchConversations, fetchMessages), `live/index.ts` (getInbox), `data.ts`
  (getInboxData facade), `inbox/page.tsx` + `inbox-view.tsx` (props + on-demand
  messages; drop the MOCK banner in live mode).

### Calendar / Call Calendar
- `GET /calendars/events?locationId=…&startTime=…&endTime=…` → events.
- Map to the Calendar + Call Calendar screens (currently M4 mock).
- Files: `ghl/client.ts` (fetchCalendarEvents), `live/index.ts`, `data.ts`, the
  calendar views.

Verify: deploy, confirm real threads + events render, tune the mapping against
what actually comes back.

---

## STAGE 2 — WRITE (only after Stage 1 is verified)

### Send message
- `POST /conversations/messages` `{ type, contactId, message }`. Wire into the
  Inbox composer. MUST call `assertOutreachAllowed()` before any send (fails
  closed), then confirm-on-send. Stays blocked by default (OUTREACH_ENABLED off).

### Client write-back — wire the existing `src/lib/writeback.ts` stubs to real calls
- `assignCoach`, `setStartDate`, set status → `PUT /contacts/{id}` (custom
  fields). These functions already exist as typed no-ops; make them real.
- Every write: explicit confirm step, optimistic UI with rollback on error, and
  an entry in `sync_events`.

### Safety (non-negotiable)
- NO CONTACT: every send path calls `assertOutreachAllowed()`, off by default (see the hard rule at the top).
- Test against ONE throwaway test contact first — including field write-backs, since GHL-side workflows can fire on a change.
- No silent writes — a confirm on every mutation.
- Keep a revert path; never bulk-write.

Verify: each write on the test contact, then one real record behind a confirm.

---

## Kickoff prompt (paste into Claude Code, opened in this repo)

> Read docs/ghl-twoway-integration-brief.md, CLAUDE.md, and PROGRESS.md first.
> Build STAGE 1 (read: Inbox + Calendar) only. Run the dev server against my
> .env.local token, verify against real GHL data, then stop for my review
> before touching Stage 2 (write).
