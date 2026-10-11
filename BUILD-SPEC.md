# TJD Fit HQ — Build Spec (single source of truth for the build)

> This file is the complete brief. Work through it top to bottom. It contains the end goal, the milestones, and the detailed spec for every screen. You should never need to ask the user "what goes on this screen" — it's all here. Only stop at the hard gates defined in CLAUDE.md (data model / auth / secrets / push / destructive actions) or at the end of a phase.

---

## THE END GOAL (definition of done for v1)

TJD Fit HQ is an internal operating dashboard ("HQ") for an online fitness coaching business. GoHighLevel (GHL) is the CRM and source of truth. This app **projects** GHL data and adds the operational tooling GHL can't do (results approval, content planner, coach scorecards, client audits, daily digest). It is NOT a custom CRM rebuild.

One codebase, rebranded per client: TJD Fit first, then DP Performance.

**v1 is done when:**
- The Owner view is fully built across every sidebar screen listed below.
- Coach, VA, and Sales exist as working, role-scoped scaffolds (their own sidebar + a real default dashboard, data scoped to that role). Ambassador is not a login role.
- Light + dark theming works across everything; light is default.
- Every screen implements empty, loading, and error states.
- All screens are wired to Supabase (real data layer), with the GHL projection layer feeding it.
- The app is deployed and reachable at a URL.

**Out of scope for v1 (retainer/later phases — do NOT build now):**
- Messaging backend (WhatsApp Business API / IG Graph / email send)
- Automation execution engine (the rules UI is built; the engine that fires them is later)
- Stripe revenue feed, ads tracking, landing pages
- Kahunas integration (no public API; webhook-only, deferred)

---

## DESIGN RULES (apply to every screen)

- Light default, dark toggle. Both first-class. Never hardcode colors — use theme tokens.
- Accent green is the only accent, used sparingly (active nav, KPI deltas, primary CTAs, chart fills).
- Hierarchy from the three-step text ladder (primary / dim / muted), not font weight.
- Body font Inter, display/headings Fraunces (serif), tight tracking. Tabular numerals on all metrics.
- Depth via 1px hairline borders, not shadows. Card radius 14px, control radius 8px.
- No em dashes in any UI copy.
- Every screen: empty state, loading skeleton, error state.
- Default all dashboard/roster queries to active-only at the query level.
- Reuse primitives; never duplicate a Card or KPI. Match patterns in /reference/prototype.html.

---

## MILESTONES (phases, in order)

- **M1 Foundation** — done when: scaffold + stack + CLAUDE.md + DATA-MODEL.md + tokens/theming + style-guide exist. [DONE]
- **M2 Primitives + Shell** — done when: primitive library built + owner shell (sidebar + topbar + routing to placeholders) + 5-role architecture works.
- **M3 Core screens** — done when: Dashboard, Pipeline (CRM), Client Database, Client Journey Tracker, Coach Overview, Coach Performance, Results Tracker/Transformations, Financials all built on Supabase seed.
- **M4 Secondary screens** — done when: Inbox, Tasks, Client Audits, Daily Digest, Calendar, Call Calendar, Content Planner, Content & Collaborations, Marketing & Campaigns, Automations, Analytics, Reports, Sales Performance, + document stores (Brand Assets, SOPs, Contracts, Brief, Merch) + Brand, Building the Brand, Building the Team, Referrals, Social Media, Ambassadors, Team, Settings all built.
- **M5 GHL integration** — done when: GHL projection layer (contacts/leads/pipeline) feeds Supabase via API + webhooks; core screens read live data. [GATE: data model + secrets]
- **M6 Role scaffolds** — done when: Coach/VA/Sales each have their own sidebar + default dashboard, data scoped at query level (4 login roles total incl. owner; Ambassador is not a login role). [GATE: auth/roles]
- **M7 States hardening** — done when: every screen has empty/loading/error verified.
- **M8 Rebrand** — done when: DP Performance brand config + separate deployment.

---

## PRIMITIVES (build first, M2)

Each themed light+dark, typed props, added to /style-guide for QA:
- Card, KPI (label + tabular value + delta + hint + optional sparkline), Pill/StatusPill (all 9 status + plan + resource-type variants from theme), Delta (green up/warm down), Avatar (sm/md/lg), SegmentedControl, DataTable (generic/typed, grid rows, uppercase hairline header, hover, click-through), SidebarNavItem, Button (primary/ghost/sizes), PageHeader (eyebrow + Fraunces title + subtitle + actions slot), AreaChart (recharts, green gradient, themed).

---

## OWNER SHELL + SIDEBAR (M2)

Fixed 240px sidebar, light default/dark toggle. Topbar: Cmd+K search left; right = "Record Loom", "+ Add client" (primary), notifications bell, profile avatar. Sidebar: logo top, search, grouped scrollable nav, theme toggle + profile pinned bottom. Group labels = small uppercase muted. Active item = surface bg + hairline border + green icon. Unbuilt screens render a clean "Coming next" placeholder, never a broken route.

**Owner nav (exact; the sidebar config in src/lib/navigation.ts is the source of truth):**
- OPERATIONS: Dashboard · Inbox · Tasks · Sales Dashboard · VA Dashboard · Client Database · Client Journey Tracker · Coach Overview · Client Audits · Coach Performance · Results Tracker · Pipeline (CRM) · Financials
- INSIGHTS: Daily Digest · Analytics · Reports · Sales Performance
- BRAND: Brand · Building the Brand · Building the Team · Calendar · Call Calendar · Content Planner · Content & Collaborations · Marketing & Campaigns · Social Media · Ambassadors · Referrals
- AUTOMATIONS: Automations
- DOCUMENTS: Brand Assets · SOPs · Contracts · Brief · Merch
- TEAM & SETTINGS: Team · Settings

(Inbox, Tasks, Client Audits, Daily Digest, and Merch were added to the sidebar after M4 review, matching the prototype. Topbar icons and contextual links remain as secondary entry points. "Ambassador Dashboard" was removed from the owner nav once Ambassador stopped being a login role; the Ambassadors data view stays under BRAND.)

**Role architecture:** role is a property on the user. There are 4 LOGIN ROLES: owner, coach, sales, va. A config object maps role -> {navGroups, defaultRoute}. Owner = full nav. Coach/sales/va = reduced scaffolds (M6). Wrong-role route -> redirect to that role's default. Dev-only role switcher for previewing. Ambassador is NOT a login role (no portal, no auth); ambassadors are a view-only data area inside the owner/team side (the Ambassadors screen under BRAND).

---

## CORE SCREENS (M3) — all on Supabase seed data

### Dashboard (owner default)
Period toggle (Weekly/Monthly/Quarterly/Yearly). KPI row 1: Recurring revenue ($ + MoM delta), Active clients (count + this month), Net change (+gained/-lost), Retention (% + churn beneath). KPI row 2 (both owners' priority metrics): Cash Collected 30d, Paused, Expiring 30d, New Leads, Close Rate, MRR, Coach Capacity. Middle: Revenue trend (wide area chart, range toggle 1M/3M/6M/1Y/Custom, YTD) + Coach capacity (per-coach bars active/max). Bottom 3 panels: Pipeline (bars per stage -> links to CRM), Social (channels + follower deltas + coming-soon), Today's focus (tasks, done = strikethrough). Build the all-zero empty-state variant.

Leaderboards section (below the bottom row, added M4 refinement): (a) Coach Leaderboard ranked by retention % with avg client length, churn, active clients, capacity %, rank + movement indicators, links to Coach Performance; (b) Sales Leaderboard ranking setters + closers (rank, name, role, calls taken, closes, close rate %, cash collected), sortable by close rate or cash collected. Revenue trend also supports a working Custom range and a Compare mode (last year / previous period / custom) rendering a muted comparison series with a delta summary.

### Pipeline (CRM) — projects GHL leads (two-way deferred, visual only)
Both views toggleable. KANBAN (default): columns New Enquiry · Contacted · Call Booked · Call Taken · Follow-Up · New Client Processing · Submitted · Lost; cards = name, source tag (colored per channel), owner avatar, days-in-stage; draggable (visual only, comment where GHL write-back goes later). TABLE: tabs All Leads · Submitted · Call Booked · Call Done · Follow-Up · New Client Processing · Lead Magnets · Lost (counts, green underline active); KPI row Active Leads · Conversion Rate · Avg Days to Close · Pipeline Value; columns Name · Source (dot) · Status (pill) · Owner · Last Activity · Next Action · Days in Stage (warm->red as ages). Sources: Instagram, YouTube, Referral, Ambassador, Lead Magnet, Email, Website, Word of Mouth.

### Client Database
Active-only default. Tabs Active · Paused · Cancelled · Past (counts). Columns: Client (avatar+name) · Coach · Plan (Weekly/Fortnightly) · Monthly Rate · Start Date · Week Number (computed) · Last Check-in (green recent/amber due/red overdue) · Status pill. Row click -> client detail scaffold (Overview/Check-ins/Results/Billing tabs). Coach assignment action on unassigned clients (writes Supabase; HQ owns this).

### Client Journey Tracker
Coaching-lifecycle view (distinct from sales pipeline). Stages: Onboarding · Settling In · Active · Mid-Program Review · Approaching Renewal · Renewed/Graduated. Cards: name, coach, stage, week number, set-reminder affordance, next milestone. Projects GHL client-journey pipeline later; seed now.

### Coach Overview
Summary line "X coaches · Y active clients · Z pending audits". Tabs All/Coaches; sort by Name/Active clients/Pending audits; search. Coach cards: avatar + name + role badge (Coach/Head Coach), stats Active Clients + Pending Audits (warm when >0), "Open their portal" link. Head coach can assign clients.

### Coach Performance / Scorecard
"X coaches · N% avg capacity · [period] · range" + period selector + Export. Per-coach: capacity (active/max bar), adherence %, avg check-in response time, retention, churn, slots open. Empty: "No coaches with active clients in this period."

### Results Tracker + Transformations (state machine)
Tabs All · Draft · Coach approved · Admin approved · Scheduled · Posted. Sub-line "X total · Y in-flight · Z ready to post · approval flows coach -> admin". Flow: coach marks result at milestone (W12/W20) -> Draft -> Coach approved -> Admin approved -> Scheduled -> Posted. Cards: client, coach, milestone tag, status pill, before/after slots, state-appropriate action button. (Mirrors the real coach sheet: Transformation TRUE/FALSE + Post? Approved.)

### Financials
Range toggle. KPI: MRR · LTV · Refunds · Past due (+client count). Charts: Revenue trend (area), Plan breakdown (donut/bars by plan). Coach payouts table: coach · gross · fee · net · period. Recent transactions: date · client · plan · amount · source · status. Mark which need Stripe/GHL feed.

---

## SECONDARY SCREENS (M4)

### Inbox / Conversations (UI now, real backend later)
3 panes. LEFT: channel filter (All/WhatsApp/IG/Email + counts), search, thread list (avatar, name, preview, time, unread, contact-type tag, channel icon). CENTER: bubbles (inbound left, outbound green right), date dividers, header (name + status + Snooze + Assign), composer with chips Templates · Form check · Send check-in link · Book call + "Sending as [Brand] WhatsApp". RIGHT: context rail (coach, plan, adherence, last check-in, LTV, Open profile, This Week's Signals, Next check-in). Keep "MOCK · UI preview" banner. Outbound priority: WhatsApp -> Instagram -> iMessage/email.

### Tasks
"Tasks · N due today" + Mine/Team toggle + Type filter + New task. Buckets: Overdue · Today · Tomorrow · This Week · Completed Today. List grouped by bucket; checkbox (done=strikethrough), title, assignee, type, due. Empty: "All clear. No tasks assigned to you."

### Client Audits (4-week QA cadence)
"QA Review · 4-week cadence · N clients up for audit this week". Tabs All · Due · Overdue · Completed. Columns by cadence week W4 · W8 · W12 · W16 (counts). Cards: avatar+name, cadence-week tag, status pill (Submitted/Sent/Messaged/Ghosted), due-state pill (Due/Overdue). Collapse/Expand all.

### Daily Digest
"Daily Digest · [Brand] · To:[owner email] · [date] 7:00 AM" + Open in portal. "Good morning, [name]." + net +/- day. Sections: Yesterday at a glance (New Clients/Paused/Cancelled/Refunds/MRR delta/Cash Collected); This week so far (Calls Booked/Closed Won/Closed Lost); Coming up 7 days (PIF renewals, campaign deadlines); Coach attention needed (stuck onboarding >7d, payment failures, handover approvals). Empty = "good shape" copy.

### Calendar + Call Calendar
Calendar: month grid, events color-coded by type, pulls Google Calendar later (seed now), +Event. Call Calendar: pulls Calendly later (seed now), booked calls with lead/client + setter/closer + time + channel.

### Content Planner + Content & Collaborations
Planner: weekly grid, rows = accounts/platforms (e.g. @tjdfit IG, owner IG, YouTube), cols = days, cells = scheduled posts (color by type), add/drag, week nav. C&C: assign content to ambassadors/team/self, status planned/to-do/done.

### Marketing & Campaigns
"Growth · Active campaigns, lead magnets, content & challenges" + New campaign. Active campaigns (type/status/spend/leads/closed/ROAS/period; empty "No active campaigns"). Lead magnets (+Add magnet, opt-ins + conversion; empty "No lead magnets yet"). Embedded content calendar week view. Ads = extension point only.

### Automations (management UI; engine is later)
"Workflows · N active · N rules replace VA tasks" + Browse templates + New automation. Tabs All · Active · Paused · Failing · Drafts · Replaces VA task. Banners: drafts-until-engine-ships; est. time saved (~40h/month). Rows: name + NEW badge + "Replaces '[VA task]'" tag, trigger->actions summary, cadence tag (Real-time/Weekly), on/off toggle. Seed real rules: Auto-create WhatsApp GCs (closed_won), Booking GC on call_booked, Fathom call notes->CRM, Newie sync cancels+pauses, Payroll weekly compute+approval (Fri 18:00), Setter commission ledger (Sun 23:00), Typeform->lead with source tag, W20 graduation pack. Toggles persist, don't execute.

### Analytics / Reports / Sales Performance
Analytics: KPI (conversion, avg time to close, show-up rate, avg tenure); conversion funnel (Submitted->Called->Showed->Signed->Onboarded); retention curve; lead source performance table (source·leads·calls·closed·conv%·revenue). Reports: list of generated reports, each opens detail, +New report. Sales Performance: setter/closer metrics (calls taken, closed, close rate, revenue closed, per-rep).

### Document stores + remaining nav
Consistent store layout (grid/list, upload, categories, search): Brand Assets (tabs All/Logos/Photos/Video/Guidelines), SOPs (categorized Operations/Coaching/Sales/Marketing + version + updated), Contracts (client·type·value·signed·term·status), Brief, Merch (product grid units sold + revenue). Brand (master reference store + pinned north-star). Building the Brand (assignable to-do: to-do/in progress/done). Building the Team (hiring tracker). Referrals (who referred/who/reward status). Social Media (per-account followers + growth + top posts). Ambassadors (handle, tier Gold/Silver/Bronze, referrals, closed, commission, status). Team (staff + roles + access). Settings (tabs Integrations [Stripe/GHL/Calendly/Zoom/WhatsApp/Typeform/ManyChat/Google Calendar w/ connection status], Notifications, Profile, Billing, Security).

---

## GHL INTEGRATION (M5) — [HARD GATE: stop for review before starting]

Read-mostly projection. GHL API auth (keys in .env.local, document scopes in /docs/ghl-integration.md). Sync service pulls GHL -> Supabase (contacts/leads -> Lead+Client, map GHL stages to our stages; pipeline -> Pipeline + Journey Tracker). Webhook receiver updates projection on GHL change. Map GHL source tags -> our channels. Surface conditional onboarding (Standard/Challenge/Photoshoot). Do NOT build write-back yet; stub the two-way points (start date, coach assignment). Then swap all projection screens from seed to live.

---

## ROLE SCAFFOLDS (M6) — [GATE: auth/roles]

4 login roles: owner, coach, sales, va. Ambassador is NOT a login role (no portal/auth; owner-facing data view only). Real components + role-scoped seed data; enforce scoping at the query level. Build nothing here until auth is set up.

Nav per role:
- Coach: Dashboard · My Clients · Check-ins · Results · Recipe Index · SOPs · Calendar · plus the coach toolset (My Pay · Quizzes · Academy · Calculators · Coach Assistant). Never sees other coaches' data or financials.
- Sales: Dashboard · Lead Pipeline · Call Calendar · Sales Performance (own).
- VA: Dashboard · Client Database · Pipeline · Client Audits · Calendar · Tasks. No financials, no brand/marketing, no master references.

### Finalized role dashboard specs

**OWNER / FOUNDER dashboard (already built; confirm it matches):**
Recurring revenue (MRR) + MoM change; Active client count + net change (gained vs lost); Retention/churn; Revenue trend (weekly/monthly/quarterly/yearly toggle); Coach capacity overview (roster vs cap per coach); Pipeline snapshot (leads -> consults -> closes); Today's focus / key tasks; Social + audience quick stats.

**COACH dashboard:**
Active Clients; Check-ins due/completed this period; My retention/churn (this coach only); Quick-access client roster overview. Scoped to the logged-in coach's own clients only — never other coaches' data or financials.

**SALES dashboard:**
New leads this period (by source); New leads to action; Consults booked vs completed; Show-up rate %; Close rate %; New clients onboarded; Follow-ups; Top-performing lead sources.
- DMs section (Outbound & Inbound): Outbound DMs sent vs targets; Inbound DMs to respond to; Conversations active/awaiting reply; Follow-up sequence tracking; Conversion from conversation -> consult booked.
- Spec note: build the DM section visually on seed data when M6 is built. The real DM feed (messaging backend) is retainer-phase, so mark those metrics as awaiting-live-source, same pattern as other deferred feeds.

**VA dashboard:**
To-Do List; Admin tasks. A simple ops landing screen. Scope: ops access (Client Database, Pipeline, Client Audits, Calendar, Tasks) but no financials, no brand/marketing, no master references.

**Coach toolset (ported from the coach portal in /reference/prototype.html; spec only, build in M6, not now):**
- My Pay: the coach's own earnings / payslips per pay cycle.
- Quizzes: coach training / CPD quizzes.
- Academy: coach education and onboarding lessons.
- Calculators: macro / calorie calculators used while coaching.
- Coach Assistant: AI helper for coaching workflows.
These are coach-facing and live in the Coach role view only, never the owner sidebar. SOPs is the one dual-audience item (owner Documents + coach view); Recipe Index is coach-facing and already placed in the coach nav.

**Owner's role-preview dashboards:** the owner OPERATIONS nav includes Sales Dashboard and VA Dashboard (Ambassador Dashboard was removed when Ambassador stopped being a login role). These are the owner's read-only preview of those role dashboards, meaningful only once the role views exist, so they are specced as part of M6 and remain "Coming next" placeholders until then. Do not build them before M6.

---

## OWNERSHIP BOUNDARY (what HQ can write vs only display)
- GHL-owned (HQ reads only): lead capture, signup, payment status, pipeline stage.
- HQ-owned (HQ writes, Supabase): coach assignment, transformations, client audits, tasks, automations config, content planner, referrals.
- Computed (never stored): financials, capacity %, days in stage, week number, churn.
