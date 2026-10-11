# Coach hub (DP, 2026-10)

Owner decision 2026-10-11: DP's plain coach login becomes a slim hub. Client
work moved to 1fit, so a coach sees only:

- Home (`/home`): Academy progress, the handbook, quick SOP links
- Start here (`/start-here`): onboarding pages from the Coach Welcome Pack
- SOPs (`/sops`): the welcome pack's admin, client setup, KPI and client wins
  pages, then Dan's earlier written SOPs
- Academy, plus Resources (`/resources`), Calculators, Recipe Index, Quizzes

Nothing was deleted. The full coach toolset (`LEGACY_COACH_NAV` in
`src/lib/navigation.ts`) is still TJD's coach nav and is still inside DP's
head-coach nav (relabelled "Clients"), so it can be switched back on.

Content lives in `src/lib/coach-content/handbook.ts` (pages are typed blocks:
paragraphs, steps, tables, scripts, copy-ready templates). Outside links are in
`COACH_LINKS` there; a null link shows "Link coming".

## Coach sign-in: Google with the work email

The app already matches a signed-in email to an invite (Team screen) and
sends unmatched emails to Access requests, so no code change is needed. The
setup is in two dashboards:

1. Google Cloud console, signed in as a DP Workspace admin
   (admin@dpperformance.com.au): create a project, set the OAuth consent
   screen to **Internal** (only dpperformance.com.au accounts can use it),
   then create an OAuth client ID of type **Web application**.
2. Clerk dashboard (production instance), Configure > SSO connections > Add
   connection > Google > **Use custom credentials**. Paste the client ID and
   secret from step 1, and copy Clerk's "Authorized redirect URI" back into the
   Google OAuth client.
3. Optional, recommended: Clerk > Restrictions > allowlist the domain
   `dpperformance.com.au`.
4. In the portal Team screen, make sure each coach's invite carries their
   @dpperformance.com.au address (add it as an extra email if the invite was
   made with a personal one).
