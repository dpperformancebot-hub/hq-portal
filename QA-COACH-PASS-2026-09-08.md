# DP coach portal — QA pass checklist

**For:** Dan's VA · **Date:** 2026-09-08 · **Method:** Clerk dashboard impersonation (no passwords)

You are checking that each coach's portal **looks right and shows their own people**.
You are not reading code. If something looks wrong, screenshot it and note the coach + screen.

---

## Before you start

1. Clerk dashboard → **Users** → click the coach → **Impersonate user**.
2. That opens their portal as them. Do the checks below.
3. **End the impersonation session before starting the next coach.** Don't just close the tab.

Do not change anything. This is a look-only pass — no editing check-ins, no saving forms.

---

## The 11 coaches, and the number that proves it

Every coach's **My Clients** roster should show roughly this many people. This is the single
most useful check: if the count is 0, or it's wildly off, something is wired wrong.

These are **active + paused** clients, which is what the roster list shows. Cancelled and past
clients are real but sit in their own section further down the screen, so don't count those.

| Coach | Expect ~this many clients |
|---|---|
| Amy | 40 |
| Angus *(head coach — see extra section)* | 67 |
| Damon | 31 |
| Darcy | 59 |
| Ella | 54 |
| Kate | 49 |
| Keri | 44 |
| Paul | 13 |
| Perry | 28 |
| Riley Purton | 3 |
| Stephen | 53 |

*Paul's 13 and Riley's 3 are correct, not bugs — most of Paul's book has cancelled, and Riley is newly onboarded. Small differences from these numbers are
fine (clients move). Zero, or someone else's number, is not.*

---

## Every coach — screen by screen

For each screen, the **one thing to look at**:

| Screen | What proves it's THIS coach's data |
|---|---|
| **Dashboard** | Greeting shows **their** name; the Today card lists people from their roster |
| **My Clients** | Count matches the table above; you recognise the names as theirs |
| **Check-ins** | Only their own clients are listed to check in |
| **My Capacity** | Shows a real number in line with their roster — not 0, not the whole business |
| **Results** | Before/after entries belong to their clients |
| **Client Audits** | Their roster only |
| **Tasks** | Tasks addressed to them |
| **My Pay** | ⚠️ **Their own pay figure and nobody else's.** Highest-risk screen — look carefully |
| **Recipe Index / SOPs / Calendar** | Shared company content — same for everyone. Just confirm it loads |
| **Quizzes / Academy / Calculators / Coach Assistant / Loom Summaries / Feedback** | Tool screens, not personal data. Confirm they open without an error |

---

## Angus only (head coach)

Angus gets everything above **plus** an **Oversight** group. Check:

- **Coach Performance / Coach Overview / Client Database** — he should see **all coaches**, not just himself.
- **Onboarding, Pauses, Engagement, Access requests** — these should be **present** for him.
- ⚠️ **No money screens.** Angus must **not** see Financials or anything showing other coaches' pay.
  If he can, stop and report it.

> **FIXED 2026-09-09 — please verify.** Angus's **My Clients** used to show every client in the
> business. It should now show **his own ~67**. This is the one screen worth checking twice: if it
> still shows hundreds, stop and report it.

> **EXPECTED, not a bug.** Angus's **Check-ins**, **Tasks**, **Loom Summaries** and his dashboard
> "needs attention" count still cover *all* coaches, not just his own. That is the current
> behaviour and is under review — note anything odd, but don't treat the breadth itself as a fault.

> **KNOWN, UNCONFIRMED.** Angus also reported **Calendar not working** (2026-09-05). If the
> Calendar screen is empty or misbehaves for him, capture exactly what you see — that screenshot
> is the missing piece for diagnosing it.

---

## Stop and report immediately if

- Any screen shows **another coach's name or clients**.
- **My Clients is empty** for a coach in the table above.
- **My Pay** shows a figure that isn't theirs.
- A **plain coach** (anyone except Angus) can see **Pauses**, **Engagement**, or **Onboarding** —
  those are meant to be blocked for them.
- Any screen shows a raw error page rather than a normal "nothing here yet" message.

---

## Not part of this pass

- **Cody Philip** and **Jake Calder** — invites not yet claimed, no accounts exist. Nothing to test.
- **"Daniel"** — a coach record with no login attached. Cannot be impersonated. See the note to Kai.
