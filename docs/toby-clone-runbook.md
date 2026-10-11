# Toby (TJD Fit) Clone — Duplication Runbook

Goal: stand up a second client (Toby / TJD Fit) on the same system, his own data. Two layers:
duplicate the GHL sub-account setup, then clone the HQ app pointed at Toby's GHL + his own database.

## Layer 1 — Duplicate the GHL sub-account (GHL Snapshot)

GHL's native tool is a **Snapshot**. It copies a sub-account's STRUCTURE, pipelines + stages,
custom fields, custom values, workflows, calendars, forms / funnels, triggers, tags, into a new
sub-account WITHOUT the contacts, conversations, or opportunities. Exactly right: Toby gets the
same system, his own clients.

Steps (GHL agency dashboard, Kai / Dan):

1. Agency view -> Account Snapshots -> create a snapshot from the DP Performance sub-account
   (`R99JktDA6ajZeTWo4YPu`). Name it e.g. "DP / TJD Master".
2. Create Toby's new sub-account (TJD Fit), or use an existing empty one.
3. Load the snapshot into Toby's sub-account.
4. **No-contact check:** DP's 13 workflows are all draft today, so they copy in as draft. Confirm
   they're still draft in Toby's account after the load so nobody is contacted during setup.

A snapshot does NOT copy: contacts/opportunities, the Private Integration Token, channel
connections (Instagram / WhatsApp / email / SMS must be reconnected per account), or account
branding.

## Layer 2 — Toby's integration token

The token is per-sub-account and is not in the snapshot, create a fresh one:

1. Toby's sub-account -> Settings -> Private Integrations -> create a token with ALL the same
   scopes as DP (contacts, opportunities, calendars, conversations, custom fields, etc.).
2. Same lesson learned on DP: tick every scope at creation. Editing scopes later does not attach
   them to an existing token, you'd have to make a new one.
3. That token + Toby's location id are what Toby's HQ uses.

## Layer 3 — Clone the HQ app for Toby

The app was built to be rebranded per client (brand values live in one config file, never
hardcoded). For Toby / TJD Fit:

- **Brand config:** name (TJD Fit), logo, colors, the single theme/config file.
- **His own Supabase project** (Toby's data, fully separate from DP).
- **His GHL token + location id** (from Layer 2).
- **His own Clerk app** (Toby's team logins) and **separate Vercel deploy** (his own URL).

Same codebase, his own everything. This is Thread 3 of the next-phase plan.

## Recommended order

1. GHL snapshot -> Toby sub-account (Kai / Dan, agency dashboard).
2. Toby's Private Integration Token (Kai / Dan).
3. App clone: brand config (Claude) + Toby's Supabase + token + Clerk + deploy (gated on the new
   secrets / database, owner-driven).

## What Claude can prep now (no new accounts needed)

- The TJD Fit brand config (name + colour/logo placeholders) in the theme file.
- This runbook.

Everything else waits on Toby's GHL sub-account + token + his Supabase/Clerk/Vercel, which are
account-creation steps (owner side).
