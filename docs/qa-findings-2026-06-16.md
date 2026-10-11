# QA pass — deployed HQ (tjd-fit-hq-app.vercel.app) — 2026-06-16

Owner-role walkthrough of Dashboard, Client Database, and Coach Performance.
Content-level QA (the screenshot capture was locked ~720px wide, so layout was
assessed by page text, not pixels). My local check-in display changes are not
deployed yet, so they don't appear here.

## High

1. **Coaches are placeholder/prototype records, not real DP coaches.** Every
   screen shows the seed ten: Amy, Angus, Damon, Darcy, Ella, Kate, Keri, Paul,
   Perry, Stephen. Their capacity (e.g. 60/30), retention, and churn are seed
   values. The real coach roster needs to replace these in the `coaches` table.

2. **Every client is "Unassigned" to a coach.** All 378 live clients import with
   no coach link. Consequence: coach rosters, My Clients, Coach scorecards, and
   the new Check-ins screen will all be empty per coach until clients are mapped
   to (real) coaches. This is the single biggest blocker to the coach-facing
   side being useful. The client→coach mapping needs to come across from GHL (or
   be assigned in HQ).

3. **Stray "Empty state" text in the dashboard header**, between the subtitle and
   the Weekly/Monthly/Quarterly/Yearly toggle. Reads like a leaked dev/preview
   control or label. Verify and remove from prod.

## Medium

4. **Adherence, Avg Response = "awaiting feed"; Last check-in = "Never" for all
   clients.** Expected (no check-in feed yet) and exactly what the Kahunas →
   Zapier pipe we're building fills. Confirms that work targets a real gap.

5. **Pipeline, New Leads, Close Rate, and Sales leaderboard all read 0 / "No
   sales reps yet".** No GHL opportunities imported yet; populates once
   opportunities and sales reps exist. Expected, not a bug.

6. **Coach capacity renders over 100% (Angus 200%, 60/30).** Partly seed data,
   but confirm the capacity bar handles overflow gracefully and that the real cap
   (70 default) applies once real coaches load.

## Low / data quality (mostly GHL source, not app bugs)

7. Client names render lowercase ("jacqueline venegas"). Consider title-casing
   for display.

8. Some clients are first-name-only ("yaren", "maddie", "charly") or have source
   typos ("cluadia armstrong"). Source-data quality in GHL.

9. At least one client has a $0 monthly rate (ruby sheohmelian). Confirm
   comped/free vs a mapping miss.

## What's working well

- Client Database is a clean live projection of the real GHL roster (378 active,
  active-only default holding).
- The honest-data rule is visibly working: zeroed metrics say "awaiting feed"
  rather than faking numbers.
- Branding (DP Performance HQ), navigation, owner shell, and empty states
  ("All clear / No tasks due today") render correctly.

## Suggested order

Real coaches (#1) → client→coach mapping (#2) unlock the entire coach side and
make the Kahunas check-in feed actually land against the right people. The stray
"Empty state" text (#3) is a quick fix. The rest are expected-state or cosmetic.
