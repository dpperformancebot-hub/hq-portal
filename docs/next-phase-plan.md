# Next Phase Plan

Where we are: the HQ is built and live for DP Performance, every screen works. What's left is three things: feed it real data, turn on team logins with role-based access, and clone it for a second client (Toby).

## Thread 1 — Real data into DP

- **Coach check-in logs** → fills Check-ins, Results, and coach adherence. The importer is built and proven (Damon's log loaded). Needs: each coach's check-in log exported as a CSV.
- **Leads into GHL** → fills Pipeline, Sales Performance, Analytics, and Inbox. Needs: lead capture wired into GHL and setters working leads there.

## Thread 2 — Team logins + access (setters, closers, VAs)

Two sides to "different access for different people":

- **In GoHighLevel:** each setter / closer / VA is a GHL user with the access level you give them. This is GHL's own user management (you / Dan, inside GHL).
- **In the HQ:** turn on real logins (Clerk) so each person signs in and sees only their role's screens. This is already built, it just needs the logins switched on:
  - **Owner** (Dan / Kai): everything.
  - **Coach:** own clients only, never other coaches' data or financials.
  - **Sales** (setters + closers): lead pipeline, call calendar, sales performance.
  - **VA:** client database, pipeline, audits, calendar, tasks. No financials or brand.

  Needs: Clerk keys (from Dan), apply the invites migration, then invite the team from the Team screen.

## Thread 3 — Clone for Toby (second client)

Same codebase, his own everything:

- **Rebranded** to Toby: name, logo, colors (one config file, already designed for this).
- **His own database** (Toby's data, separate Supabase project).
- **His own GoHighLevel** account / sub-account connection.
- **Separate deployment** (his own URL).

The app was built from day one to be rebranded per client, so this is mostly setup + a second deploy, not a rebuild.

## Recommended order

1. **Team logins (Thread 2)** — gives your team their own access and is the foundation for everything multi-user. First step is simple: get the Clerk keys from Dan.
2. **Real data (Thread 1)** — populate DP as people start using it day to day.
3. **Toby clone (Thread 3)** — cleanest to do once DP is solid, but we can prep it anytime.

## Who does what

- **You / Dan:** GHL user setup, Clerk keys, coach CSVs, GHL lead capture, Toby's accounts.
- **Me:** all the wiring, role enforcement, the Toby brand config, and deployments.
