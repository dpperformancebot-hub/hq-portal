# VA runbook: weekly check-in import

Keeps the HQ check-in feed current. Kahunas has no API or webhook, so check-ins
reach the HQ by exporting each coach's Check In Log and running the importer.
This is the same proven path that loaded the first 13,621 check-ins.

Cadence: once a week, same day each week (suggested: Monday morning).
Time: about 20 minutes for all 10 coaches.

## What you need

- The repo on your machine: `tjd-fit-hq-app`, with `.env.local` present
  (it must contain `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`;
  ask the owner if missing, never share these values).
- Node installed (`node -v` should print a version).
- Access to the coaches' Check In Log sheets.

## Step 1: export each coach's log as CSV

For each coach, open their "Check In Log" sheet and download the "Check Ins"
tab as CSV. Keep the exact naming convention, the importer reads the coach
name from the filename:

```
<Coach Full Name> - Check In Log - Check Ins.csv
```

Examples (these match the coaches table, reuse them exactly):

- Amy Roberts - Check In Log - Check Ins.csv
- Angus Stals - Check In Log - Check Ins.csv
- Damon Astuti - Check In Log - Check Ins.csv
- Darcy - Check In Log - Check Ins.csv
- Ella Nissen - Check In Log - Check Ins.csv
- Kate Usher - Check In Log - Check Ins.csv
- Keri Iwata - Check In Log - Check Ins.csv
- Paul Van Gerven - Check In Log - Check Ins.csv
- Perry Choong - Check In Log - Check Ins.csv
- Stephen Butera - Check In Log - Check Ins.csv

Save them into `data-imports/coach-logs/`, overwriting last week's files.
This folder is gitignored (client PII stays local, never commit it).

## Step 2: dry-run first, always

From the repo root, run the importer WITHOUT `--commit` first. It prints what
it would do and writes nothing:

```
node scripts/import-coach-log.mjs "data-imports/coach-logs/Amy Roberts - Check In Log - Check Ins.csv"
```

Read the output. Expected: matched client counts, weeks detected, and a small
"no match" list (misspelled or brand-new clients). If the no-match list is
unusually long (more than a handful), STOP and tell the owner, the sheet
format may have changed.

If the filename does not start with the coach's name, pass it explicitly:

```
node scripts/import-coach-log.mjs "data-imports/coach-logs/<file>.csv" --coach "Full Name"
```

## Step 3: commit the import

Re-run the same command with `--commit`:

```
node scripts/import-coach-log.mjs "data-imports/coach-logs/Amy Roberts - Check In Log - Check Ins.csv" --commit
```

Repeat steps 2 and 3 for each coach's file. Imports are idempotent upserts:
re-running a file is safe and will not duplicate check-ins.

## Step 4: verify in the HQ

1. Open the HQ dashboard and go to Check-ins.
2. Confirm the newest entries show this week's dates for a couple of coaches.
3. Spot-check one client per coach against their sheet.

## Step 5: log exceptions

Add any "no match" names to `data-imports/import-exceptions.csv` with the
coach name and date, and flag them to the owner in your weekly summary. Do not
create clients yourself.

## Rules

- NEVER contact clients. This process is data entry only.
- Never commit anything in `data-imports/` to git.
- Never paste the Supabase keys anywhere outside `.env.local`.
- If a command errors in a way this doc does not cover, stop and ask, do not
  improvise with the database.
