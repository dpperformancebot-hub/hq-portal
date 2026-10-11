# Onboarding (and offboarding) a coach

For Dan or Jameela. Follow it top to bottom; the order matters.

Why the order matters: clients are matched to coaches **by name**, using the GHL "Assigned Coach" field. The portal creates a coach record the first time the nightly sync sees that name on a client. So the name has to exist in GHL, spelled the right way, before anything else lines up.

---

## Adding a coach

### 1. GHL first: add the name to the Assigned Coach dropdown

Spell it exactly the way it should appear everywhere else: first name only, matching how the other coaches are written (Perry, Angus, Darcy).

**This is the step that breaks things if you get it wrong.** A name that differs by one character does not fail loudly, it creates a *second* coach. The duplicate "Cody", "Jake" and "Riley" records deleted in September 2026 all came from this, and a check-in import nearly wrote 21 check-ins against the empty copies where nobody would ever have seen them.

### 2. Portal: Team screen, Add coach

Fill in:

- **Display name**: exactly what you typed in GHL. The form shows the names already in use, and warns if your spelling is close to an existing one.
- **Login email**: the address they will actually sign in with. It must match exactly. A VA once hit a blank screen purely because they signed in with a different address.
- **Head coach**: only for the coach who oversees the others.
- **Capacity**: how many active clients they can hold. Default 70.
- **Start date**: for your records.

That one form creates their coach record and their login invite together, and links them. If a coach record already exists with that exact name and no login, it attaches to that record instead of making a second one.

### 3. Send them what the form gives you

The form produces a message with the sign-in link and their exact email. Copy it and send it. They sign in, and land on My Clients, Check-ins and Academy module 1.

### 4. Assign them at least one client

In GHL, set Assigned Coach on a client to their name. After the nightly sync (05:55 AEST) that client appears on their roster. You can also hand clients over in the portal: **Assign clients** in the sidebar, or the Unassigned column of the Client Journey Tracker.

### 5. Pay rates

Weekly and fortnightly rates live on the coach record. Bonuses are per brand in `src/lib/brand.ts`. Ask for these to be set; they are not in the Add coach form yet.

---

## Removing a coach

Do **not** delete the coach record. Their name is attached to every client they have ever had, and to their check-in and pay history.

1. **Reassign their clients first.** Sidebar, Assign clients. Move every active client to another coach. A coach with no clients is safe to deactivate; a coach with clients is not, because those clients become invisible to everyone.
2. **Deactivate the coach record** on the Team screen. They stop appearing in pickers and capacity maths; their history stays intact.
3. **Revoke their login** on the Team screen, so the invite can no longer be claimed.
4. **In GHL**, leave the Assigned Coach value alone unless every client has been moved off it. See the warning below.

---

## What not to do

- **Do not rename a coach in GHL.** Clients are matched by name. Renaming orphans every client assigned to the old spelling: the next sync sees a name it does not recognise, and those clients end up unassigned or attached to a brand-new empty record. If a name really has to change, move every client first, then change it, then tell whoever maintains the portal.
- **Do not create the login before the coach record exists.** The invite needs something to link to. The Add coach form handles both, which is the point of it.
- **Do not delete a coach record to "clean up".** Deactivate instead.
- **Do not assume a blank Assigned Coach field means unassigned on purpose.** The nightly sync no longer clears a coach when GHL is blank (it keeps what the portal has and logs the difference), but a blank field in GHL still means nobody is named as their coach there.

---

## If something looks wrong

- **A coach sees no clients:** check the Assigned Coach spelling in GHL against their name on the Team screen. One character is enough.
- **A coach sees someone else's clients:** check whether there are two coach records with similar names.
- **A new coach cannot sign in:** check the invite email matches the address they are actually using, exactly.
