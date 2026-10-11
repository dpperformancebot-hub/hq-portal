# Kahunas → HQ integration (via Zapier)

Kahunas has no public REST API, but it is a Zapier app (`KahunasCLIAPI`). So the
connection is:

```
Kahunas (poll trigger)  →  Zapier  →  Webhooks by Zapier (POST)  →  HQ /api/webhooks/kahunas  →  Supabase
```

The HQ side is built. What's left is the migration (apply once), one env var, and
the Zap.

## What Kahunas actually exposes

Its Zapier **triggers** are check-in forms, not transformations:

- **Checkin Forms** (`get_checkin_forms`) — weekly coach check-ins ← primary feed
- **Get Daily Checkin Forms** (`get_daily_checkin_forms`)
- **Get Initial QA Forms** (`get_initial_QA_forms`)
- **Get Packages** (`get_packages`)

Plus one **action**: **Create New Client** (Zapier can create a client in Kahunas
— useful later for GHL win → auto-onboard, no HQ table needed).

Triggers are **polling** (Zapier checks ~every 15 min on the Free plan), so this is
near-real-time, not instant.

## 1. Apply the migration (once)

`supabase/migrations/20260616000001_check_ins.sql` adds the `check_ins` table.
Apply it to the live project (Supabase SQL editor or `supabase db push`). Nothing
ingests until this table exists.

## 2. Set the shared secret

In Vercel (and `.env.local` locally):

```
KAHUNAS_WEBHOOK_SECRET=<a long random string>
```

The endpoint rejects every request until this is set. Use the same value in the
Zap. (`HQ_PERSISTENCE` must be `true`, which it is in prod.)

## 3. Build the Zap

1. **Trigger:** Kahunas → **Checkin Forms** (connect Dan's Kahunas account when prompted — that auth step is yours, not mine).
2. **Action:** "Webhooks by Zapier" → **POST**.
   - **URL:** `https://tjd-fit-hq-app.vercel.app/api/webhooks/kahunas?token=<KAHUNAS_WEBHOOK_SECRET>`
   - **Payload type:** JSON
   - **Data:** map the Kahunas trigger fields onto the contract below.

## 4. The check-in contract (what to send)

| Key          | Required | Example                | Notes                                                      |
| ------------ | -------- | ---------------------- | ---------------------------------------------------------- |
| `type`       | no       | `checkin`              | defaults to `checkin`                                      |
| `clientName` | **yes**  | `Jane Smith`           | matched to the HQ client by name (case-insensitive)        |
| `code`       | no       | `Y`                    | weekly status: SM/Y/F/G/M/P/C/N (matches the coach log). Defaults to `Y` (submitted) |
| `submittedAt`| no       | `2026-06-16T09:00:00Z` | ISO; defaults to now()                                     |
| `weekNumber` | no       | `12`                   | week of program                                            |
| `adherence`  | no       | `92`                   | 0–100 score, if the Kahunas form has one                   |
| `externalId` | no       | `kah_8842`             | Kahunas submission id; used as the idempotency key         |

The client's coach is derived automatically from the matched HQ client, so you
don't send it. A submission with no `code` is recorded as `Y` (submitted). Send
`externalId` if Kahunas gives a stable id — it makes re-polls idempotent.

Example body:

```json
{
  "type": "checkin",
  "clientName": "Jane Smith",
  "code": "Y",
  "weekNumber": 12,
  "submittedAt": "2026-06-16T09:00:00Z",
  "externalId": "kah_8842"
}
```

## 5. What happens on the HQ side

- Auth checked (`?token=` must equal `KAHUNAS_WEBHOOK_SECRET`).
- Client matched by name → check-in created or updated (idempotent on `externalId`,
  else deduped by client + date + source).
- Every hit logged to `sync_events` (`source = 'kahunas'`) — you can see exactly
  what landed and why anything was skipped (e.g. "no client matched").
- Responses: `200` applied, `202` skipped (so Zapier doesn't retry-spam unmatched
  rows), `401` bad/missing secret, `503` persistence off.

## 6. Test

Use Zapier's "Test action" with one real client, then check the `sync_events`
table (newest first) for a `kahunas` row with `action = 'applied'`, and the
`check_ins` table for the row.

## Also supported: transformations

If you ever get a transformation/progress feed (Kahunas doesn't expose one today),
the same endpoint accepts `type: "transformation"` with `clientName`, `milestone`,
`permission`, `hasBefore`, `hasAfter` → writes to the existing `transformations`
table.

## What's next (HQ read side)

This lands check-ins in Supabase. Surfacing them on the coach scorecards / adherence
screens (which show placeholders today) is the follow-on: a live read over
`check_ins` per coach. Small, and it's the payoff for this pipe.
