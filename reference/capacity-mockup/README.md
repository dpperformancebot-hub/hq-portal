# Weekly Capacity Check — Developer Handoff

An interactive design prototype of the DP Performance HQ weekly capacity check.
Coaches submit how many new clients they can take on; the head coach, ops and
owner see every result and can chase whoever hasn't answered.

The visual design and interaction model are final. Data, auth, persistence and
notification delivery are **mocked** — rebuild this in the production codebase
against a real API.

Open **`Weekly Capacity Check.bundle.html`** in any browser to use it. No server,
no install. State persists to `localStorage`, so a refresh keeps your changes.

---

## Files

| File | What it is |
|---|---|
| `Weekly Capacity Check.bundle.html` | Self-contained build — open this to see it working |
| `Weekly Capacity Check.html` | Entry HTML (loads React + Babel, then the two JSX files) |
| `capacity-data.jsx` | People, capacity bands, weeks, seed submissions, theme tokens |
| `capacity-app.jsx` | All UI — coach poll, results view, capacity log, banners |

React 18 with in-browser Babel and inline `style={{}}` objects. That's a
prototyping shortcut — **use whatever the production codebase already uses.**

---

## Roles

```
owner        Dan Adams        sees all results + log
head_of_ops  Jameela Haddad   sees all results + log
head_coach   Angus Bell       sees all results + log, AND submits his own
coach        Sarah, Amy,      submits only; sees own history
             Marco, Tess
```

The **Viewing as** switcher at the top is a demo device. In production this is
the logged-in user — delete the switcher and derive views from their role.

Angus is the interesting case: he's a coach *and* a manager, so he gets the
manager tabs **plus** a **My submission** tab. Any role that both submits and
oversees should behave the same way.

---

## The poll

One question per week: *"How many new clients can you take on for the week
starting X?"* Five bands, rendered as large tappable cards:

| Band | Subtitle | `mid` (for maths) |
|---|---|---|
| `0` | At capacity | 0 |
| `1-2` | Nearly full | 1.5 |
| `3-4` | Some room | 3.5 |
| `5-6` | Good room | 5.5 |
| `7+` | Plenty of room | 8 |

`mid` is the midpoint used to compute total team capacity and per-coach averages.
Bands are deliberately coarse — coaches answer honestly and fast rather than
agonising over an exact number.

An optional free-text note lets a coach add context (*"two finishing their block
mid-week, so room opens up"*). That note surfaces next to their answer on the
manager view — it's often the most useful part of the response.

Once submitted, the form collapses to a confirmation with a **Change** button.
Coaches can revise until the week closes.

---

## Reminders

Two banners, both amber, both matching the pattern used elsewhere in the portal.

**Friday reminder (coaches).** Shows for any coach who hasn't submitted for the
open week. Copy: *"It's Friday — submit your capacity for Week starting X before
end of day."* Has **Submit now** and a dismiss.

In the prototype this is gated on a `TODAY_IS_FRIDAY` constant so it's always
visible for the demo. In production:

- fire on Friday morning in the **coach's own timezone**
- suppress once they've submitted
- persist the dismiss for that day only, not permanently
- pair with an email or push on Friday morning, and a second nudge late
  afternoon if still outstanding

**Chase banner (managers).** Lists who's still outstanding with stacked avatars
and a **Send reminder** button that pings all of them at once. There are also
per-row **Nudge** buttons in the results list for chasing one person.

---

## Manager views

**Results** — pick any week from the dropdown. Shows:

- Three stat cards: responses (`3/5`), total team capacity (`~14 new clients`),
  and how many coaches are at capacity
- Per-coach list: avatar, active client count, their band, subtitle chip, note,
  and submission timestamp. Anyone outstanding gets an amber row and a **Nudge**
  button instead.
- **Spread** bar chart — how many coaches picked each band

**Capacity log** — every coach × every week as a grid, colour-coded by band, with
a per-coach average in the last column and CSV export. The open week is marked
with a green dot. Hovering a cell shows that week's note.

---

## Data model

```ts
type Person = {
  id: string
  name: string
  role: 'owner' | 'head_of_ops' | 'head_coach' | 'coach'
  title: string
  colour: string        // avatar colour
  clients?: number      // active client count, shown for context
}

type Week = {
  id: string            // 'w-2026-08-10'
  label: string         // 'Week starting 10 Aug'
  short: string         // '10 Aug' — for the log grid header
  due: string           // 'YYYY-MM-DD' — the Friday before
  open: boolean         // exactly one week is open at a time
}

type Submission = {
  band: '0' | '1-2' | '3-4' | '5-6' | '7+'
  note: string
  submittedAt: string   // display string in the prototype; use a timestamp
}

// Submissions are keyed `${weekId}|${coachId}`
type Submissions = Record<string, Submission>
```

The composite key keeps lookups trivial in the prototype. In a real schema this
is a `capacity_submissions` table with a unique constraint on
`(week_id, coach_id)` — upsert on change so a coach revising their answer updates
in place rather than creating duplicates.

Store `submitted_at` and `updated_at` separately so you can tell a late
submission from a late revision.

---

## Design tokens

```
bg          #faf9f5     card       #ffffff     card2   #f7f5f0
border      #e6e2d8     borderSoft #efece4
text        #1a1a17     textDim    #6b6659     textMuted #a29b8c
accent      #16a34a     accentSoft #eaf6ee     accentDeep #0f6b31
blue        #2563eb     amber      #d97706     red     #dc2626
radius      cards 12-14px · inputs/buttons 8px · pills 100px
```

Type: **Inter** for UI, **Fraunces** for page titles and the big band numbers,
**JetBrains Mono** available but barely used here. Matches the rest of the portal.

Each band carries its own `colour` + `soft` pair. Chips, bars and grid cells all
derive from those — nothing is hardcoded per component, so re-banding is a
one-place change.

---

## What needs building for real

**Tier 1 — core**
1. Auth; replace the Viewing-as switcher with the session user and gate the
   manager views server-side
2. Submissions CRUD against a real API (currently `localStorage`)
3. Week rollover — a job that closes the open week and opens the next one every
   Monday, so `open: true` is always exactly one week
4. Reminder delivery — Friday email/push per coach in their timezone, plus the
   manager **Send reminder** action

**Tier 2**
5. CSV export as a real server-side export
6. Historical retention — the prototype shows six weeks; decide how far back the
   log goes and paginate
7. Timezone handling for `due` and the Friday trigger
8. Audit trail on revisions (who changed what, when)

**Tier 3**
9. Trend view — capacity over time per coach, to spot someone consistently maxed
10. Auto-flag a coach who reports `0` for N weeks running
11. Feed total capacity into the sales pipeline so intake can be paced against it
12. Prefill suggestion based on active clients and recent cancels

---

## Deliberate decisions worth knowing

- **Bands, not a number input.** Coarse buckets get honest answers fast. A precise
  number invites overthinking and false confidence.
- **The note is optional but prominent.** It's where the real signal lives, so it
  sits right next to the answer on the manager view rather than behind a hover.
- **Coaches can revise until the week closes.** Capacity genuinely changes when a
  cancel lands on Thursday — locking the answer would make the data worse.
- **Managers see notes inline, not on hover.** Scanning five notes at once is the
  whole job of that screen.
- **No submit-on-behalf.** A manager can nudge but not answer for someone. Keeps
  the data trustworthy.

---

## Questions to settle before building

- Should the week close automatically Sunday night, or stay open until the head
  coach marks it reviewed?
- Does a coach at `0` for several weeks running need an automatic flag, or is
  that a conversation the head coach has anyway?
- Should total capacity be visible to coaches, or managers only?
- Who covers the chase if the head coach is away — does it fall to ops or the owner?
- Do you want capacity history to influence client allocation automatically, or
  stay a human decision?
