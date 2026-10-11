# Taskboard — Developer Handoff

An interactive design prototype of the DP Performance HQ Taskboard. The visual
design and interaction model are final. Data, auth, persistence and
notifications are **mocked** — your job is to rebuild this in the production
codebase against a real API.

Open **`Taskboard.bundle.html`** in any browser to use the prototype. No server,
no install. Everything persists to `localStorage`, so refresh keeps your changes.

---

## What this replaces

The current taskboard. The brief was: make it kanban, make tasks assignable
across people, make different request types collect different information, and
make blocked/completed work route back to whoever raised it.

---

## Files

| File | What it is |
|---|---|
| `Taskboard.bundle.html` | Self-contained build — open this to see it working |
| `Taskboard.html` | Entry HTML (loads React + Babel, then the two JSX files) |
| `taskboard-data.jsx` | People, client database, unassigned queue, task templates, statuses, seed tasks, theme tokens |
| `taskboard-app.jsx` | All UI — board, cards, inline detail, modal, archive, strips |

The prototype uses React 18 with in-browser Babel and inline `style={{}}`
objects. That is a prototyping shortcut. **Use whatever the production codebase
already uses.**

---

## Core concepts

### 1. Roles drive everything

```
owner        Dan Adams        creates general/admin/onboarding tasks
ops_manager  Mykael Reyes     creates general/admin/onboarding tasks
head_of_ops  Jameela Haddad   processes pause + cancel requests; only role that can escalate
head_coach   Angus Bell       owns the unassigned-client queue; can raise pause/cancel
coach        Sarah, Amy       can raise pause/cancel/admin requests
va           Priya Nair       receives tasks, does not create them
```

The **Viewing as** switcher at the top of the prototype is a demo device. In
production this is just the logged-in user — delete the switcher.

### 2. Templates — different skeletons per request type

This is the heart of the feature. A task is not one shape; each request type
collects different fields, and `creatableBy` gates which roles can raise it.

| Template | Who can raise | Fields | Routes to |
|---|---|---|---|
| **General task** | owner, ops_manager, head_of_ops, head_coach | Task brief, Timeline, Priority | anyone |
| **Pause request** | coach, head_coach | Client\*, Pause starts, Pause ends, Reason, Context for ops | Jameela by default |
| **Cancel request** | coach, head_coach | Client\*, Effective date, Reason (free text), Save attempt made, Context for ops | Jameela by default |
| **Admin request** | all except VA | What do you need, System, Needed by, Priority | anyone |
| **Onboarding handover** | owner, ops_manager, head_of_ops | Client\*, Start date, Plan, Intake notes | a coach |

\* Client fields use a **type-ahead picker against the client database**, not a
text input — see below.

Templates also carry:
- `title(values)` — how the card headline is derived
- `summary(values)` — the plain-English line shown at the top of the expanded
  card, e.g. *"Alannah Parfett needs to pause from 18 Aug until 15 Sep — travel."*
  This is what makes a request scannable for the person processing it.
- `resolvable: true` — marks pause/cancel as things that get *processed* rather
  than just *done*. Changes the primary button to "Process as done".

Adding a new request type should be adding one object to `TB_TEMPLATES` and
nothing else. Preserve that.

### 3. Statuses

`not_started` → `in_progress` → `blocked` → `complete`

Changed from a dropdown inside the expanded card. Two have side effects:

- **Blocked** prompts for a reason, then flags the task back to whoever raised
  it. The reason is required context — do not let it be skipped.
- **Complete** stamps `completedAt` and notifies the raiser.

### 4. Where flagged work surfaces — the Action strip

A task assigned to someone else never appears in *My tasks*. Without a dedicated
surface, a blocked task is invisible to the person who needs to unblock it.

So above the board, for the logged-in user, there is a strip showing:

- **Blocked (red, one row each)** — who is blocked, on what, and the reason
  inline, with **Open** and **Unblock**. The reason being visible without
  clicking is the whole point; most can be answered from the strip.
- **Completed (green, one collapsed row)** — grouped, since completions are FYI
  not action. **Clear all** acknowledges them and drops the bell count.

This strip follows the user regardless of which scope tab they are on.

### 5. Unassigned clients → automatic onboarding task

New signups with no coach sit in a queue on the **Head Coach's** board (Angus).
Expanding it shows each client with a coach dropdown. Assigning:

1. creates an **Onboarding handover** task on that coach's board
2. status `not_started`, flagged `isNew` (green "New" badge)
3. pre-filled with start date, plan and intake notes
4. removes the client from the queue

In production this queue should be a live view of clients where `coach_id IS NULL`.

### 6. Client picker

Client name fields are a type-ahead against the client database, showing each
match's coach, plan and status. The border and icon go green on an exact match.
No free text is accepted — if there is no match the user is told to add the
client in the Client Database first. This stops typos creating orphaned records
that can never be reconciled against a real client.

Keyboard: ↑ ↓ to move, Enter to select, Esc to close.

### 7. Archive

Tasks complete for more than **7 days** drop off the board into a searchable
archive. Two entry points: the header **Archive** button, and a dashed
"N archived" tile at the foot of the Complete column.

Search matches task title, template label, task ID, both people's names, and
every field value — so "Aria", "medical", "Drive" and "cancel" all hit.
Archived tasks are read-only.

### 8. Escalation

Only **Jameela (head_of_ops)** sees **Escalate to Dan**, and only on pause and
cancel requests. Escalating reassigns the task to Dan and resets it to
`not_started` — it leaves her board entirely rather than being copied. Confirm
with the client whether a copy/watch model is wanted instead.

---

## Data model

```ts
type Task = {
  id: string                    // 'T-001'
  template: 'general' | 'pause' | 'cancel' | 'admin' | 'onboard'
  assignedBy: PersonId
  assignedTo: PersonId
  status: 'not_started' | 'in_progress' | 'blocked' | 'complete'
  values: Record<string, string>   // shape determined by the template
  activity: { who: PersonId; what: string; when: string }[]
  createdAt: string             // 'YYYY-MM-DD'
  completedAt?: string          // set when status -> complete; drives archiving
  blockedReason?: string        // required when status === 'blocked'
  isNew?: boolean               // green badge until the assignee opens it
  acked?: boolean               // raiser has cleared the completion notice
}

type Person = { id, name, role, title, colour }
type Client = { name, coach: PersonId, plan: 'Weekly'|'Fortnightly', status }
```

`activity` is append-only and every status change writes an entry. Keep that —
it is the audit trail for pause/cancel decisions.

---

## Design tokens

```
bg          #faf9f5     card       #ffffff     card2   #f7f5f0
border      #e6e2d8     borderSoft #efece4
text        #1a1a17     textDim    #6b6659     textMuted #a29b8c
accent      #16a34a     accentSoft #eaf6ee     accentDeep #0f6b31
blue        #2563eb     amber      #d97706     red     #dc2626     violet #7c3aed
radius      cards 10-12px · inputs/buttons 8px · pills 100px
```

Type: **Inter** for UI, **Fraunces** for page titles and headline figures,
**JetBrains Mono** for task IDs. Matches the rest of the portal.

Each template and status carries its own `colour` + `soft` pair — chips derive
from those, so nothing is hardcoded per component.

---

## What needs building for real

**Tier 1 — core**
1. Auth; replace the Viewing-as switcher with the session user
2. Tasks CRUD against a real API (currently `localStorage`)
3. Notifications — the bell count, blocked flag-backs and completion notices are
   all computed client-side. Needs real push/email/in-app delivery.
4. The unassigned-client queue as a live query, not a static array
5. Client picker backed by the real client table with debounced server search

**Tier 2**
6. Permissions enforced server-side — `creatableBy`, who can change status, who
   can escalate. Currently only enforced in the UI.
7. Archive as a real query (`completed_at < now() - 7 days`) with pagination
8. Activity feed persisted per task
9. Comments/replies on a task — the current activity list is system events only

**Tier 3**
10. Drag-and-drop between columns (deliberately not built — the dropdown was the
    requested interaction, and it is more reliable on touch)
11. Due-date reminders and overdue escalation
12. Bulk assign from the unassigned queue
13. Saved filters / per-person board views

---

## Deliberate decisions worth knowing

- **No drag-and-drop.** Status changes via dropdown, as specified. Cheaper to
  build, works on mobile, and keeps the "why did this move" audit trail honest.
- **Inline expansion, not a side drawer.** Cards drop down in place. One open at
  a time.
- **New tasks land as `not_started` with a "New" badge** rather than a separate
  unassigned state. If a genuine claimable pool is wanted, that is a new status.
- **Blocked requires a reason.** No silent blocking.
- **Completions are grouped in the action strip; blocks are not.** Completions
  are FYI, blocks need individual attention.

---

## Questions to settle before building

- Should escalation reassign (current behaviour) or copy/watch?
- Do coaches need to see each other's boards, or only their own?
- Should pause/cancel requests write back to the client record automatically on
  "Process as done", or stay a manual step in Kahunas/Stripe?
- Who else besides Jameela should be able to process pause/cancel if she is away?
- Retention policy for the archive — indefinite, or purge after N months?
