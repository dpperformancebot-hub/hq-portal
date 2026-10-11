# HQ Functional Audit: non-functional controls

Read-only audit of every HQ screen (and the global shell). Lists each control
that is **displayed but does nothing yet**, with its location and a category:

- **HQ-native** — can be wired to Supabase now. No GHL write, no client/lead contact. Greenlit.
- **GHL-write** — writes back to GoHighLevel (or an external system of record). Gated behind the two-way integration brief (`docs/ghl-twoway-integration-brief.md`) and the no-contact rule (`assertOutreachAllowed()` / `OUTREACH_ENABLED`).
- **auth-gated** — needs Clerk (per-user identity / roles) before it can be real.
- **dead** — no planned backing, or duplicated by a working control. Remove or relabel.

Controls NOT listed here are wired and working (tab/filter/search/sort state,
navigation links, the coach picker + Assign clients on Coach Overview, the
Transformations/Results approval flow, Tasks, Team invites, Calculators,
Quizzes, Recipes favourites, the Cmd+K command palette). Screens that are
intentionally read-only projections (Analytics, Sales Performance, the role
dashboards, Social, Ambassadors, Referrals, Check-ins, My Pay, Pipeline detail)
have no broken controls and are noted at the end.

Audited 2026-06-20 against `master`.

---

## Global shell (every screen)

These render on the topbar/sidebar, so they are non-functional on every screen.

| Control | Location | Category | Note |
|---|---|---|---|
| "Record Loom" button | `src/components/shell/topbar.tsx:23` | **dead** | No `onClick`, no Loom integration in scope. Remove, or relabel/route to a real Loom flow if one is wanted. |
| "Add client" button | `src/components/shell/topbar.tsx:27` | **GHL-write** | No handler. Clients are projected from GHL (source of truth); creating one means writing a GHL contact, which can trigger GHL onboarding workflows that contact the person. Gate behind the two-way brief + no-contact rule. |
| Sidebar search input | `src/components/shell/sidebar.tsx:41` | **dead** | No `value`/`onChange`. Real search is the Cmd+K `CommandPalette` in the topbar. Remove this box, or wire it to open the palette. |
| Topbar avatar | `src/components/shell/topbar.tsx:45` | **auth-gated** | Static avatar, no menu. The user menu / profile / sign-out arrives with Clerk. |

---

## Client Database

`src/components/screens/client-database/client-detail.tsx`

| Control | Location | Category | Note |
|---|---|---|---|
| Start date "Edit" | `client-detail.tsx:160` | **GHL-write** | Calls `writeback.setStartDate` (a deliberate no-op stub) and is already labeled "writes back to GHL at M5". Start date mirrors to the GHL "Start Date" custom field. Keep gated. |

The roster list (`client-database-view.tsx`) is fully functional (search across
all statuses, status tabs, row click to detail). The coach picker on the detail
page is now wired (HQ-owned Supabase write).

---

## Coach Overview

`src/components/screens/coach/coach-overview-view.tsx`

| Control | Location | Category | Note |
|---|---|---|---|
| "Portal (soon)" button | `coach-overview-view.tsx:270` | **auth-gated** | Already `disabled` and labeled. Opening a coach's portal needs role-scoped login (Clerk + role scaffolds, M6). |

"Assign clients" is now functional (HQ-owned bulk write to `clients.coach_id`).

---

## Inbox

`src/components/screens/inbox/inbox-view.tsx` — whole screen is a MOCK preview in
demo mode; in live mode it reads GHL conversations but cannot write.

| Control | Location | Category | Note |
|---|---|---|---|
| "Send" (composer) | `inbox-view.tsx:196` | **GHL-write** | Already `disabled` + labeled "Sending is Stage 2 (write)". Outbound messaging — must route through `assertOutreachAllowed()`; gated by no-contact rule. |
| Message input | `inbox-view.tsx:195` | **GHL-write** | No `value`/`onChange`. Part of the gated send composer. |
| Quick-reply chips (Templates / Form check / Send check-in link / Book call) | `inbox-view.tsx:188` | **GHL-write** | No handlers. Insert/initiate outbound content; gated with Send. (Pure template-text insertion into the composer could be HQ-native, but is meaningless until the composer is wired.) |
| "Snooze" | `inbox-view.tsx:160` | **GHL-write** | No handler. Mutates GHL conversation state. |
| "Assign" | `inbox-view.tsx:161` | **GHL-write** | No handler. Assigns the GHL conversation to a user. |
| Thread search input | `inbox-view.tsx:109` | **HQ-native** | No `onChange`. Thread filtering is client-side over already-loaded conversations; can be wired now. Currently dead. |
| "Open profile" | `inbox-view.tsx:226` | **HQ-native** | No handler. Should link to the client/lead detail route. |

---

## Calendar

`src/components/screens/calendar/calendar-view.tsx`

| Control | Location | Category | Note |
|---|---|---|---|
| "Add event" | `calendar-view.tsx:40` | **GHL-write** | No handler. Events project from GHL appointments (Google Calendar later); creating one writes to the external calendar. Gate. |

`call-calendar-view.tsx` is read-only and has no controls.

---

## Content Planner

`src/components/screens/content/content-planner-view.tsx`

| Control | Location | Category | Note |
|---|---|---|---|
| "Add post" | `content-planner-view.tsx:24` | **HQ-native** | No handler. Content schedule is HQ-owned; persist to Supabase. |
| Post drag-and-drop | `content-planner-view.tsx:48` | **HQ-native** | `draggable` with no `onDragEnd`; visual-only. Persisting the schedule is HQ-native. |
| "This week" | `content-planner-view.tsx:23` | **HQ-native** | No handler. Week navigation/filter; client-side. Currently dead. |

---

## Content & Collaborations

`src/components/screens/content/collaborations-view.tsx`

| Control | Location | Category | Note |
|---|---|---|---|
| "New collaboration" | `collaborations-view.tsx:17` | **HQ-native** | No handler. Collaboration kanban is HQ-owned; wire create to Supabase. |

---

## Marketing & Campaigns

`src/components/screens/marketing/marketing-view.tsx`

| Control | Location | Category | Note |
|---|---|---|---|
| "New campaign" | `marketing-view.tsx:35` | **HQ-native** | No handler. Campaign record is HQ-owned (ad-platform metrics integration is a separate later extension). |
| "Add magnet" | `marketing-view.tsx:47` | **HQ-native** | No handler. Lead-magnet record is HQ-owned. |

---

## Automations

`src/components/screens/automations/automations-view.tsx` — the automation
*engine* ships later; the screen says so.

| Control | Location | Category | Note |
|---|---|---|---|
| "New automation" | `automations-view.tsx:131` | **HQ-native** | No handler. The rule definition (trigger/actions/cadence) is HQ-owned config and can persist to Supabase now. NOTE: actually *running* a rule is the future engine and may itself perform GHL writes / contact (gate that part). |
| Enable/disable toggles | `automations-view.tsx:116`, `:197`, `:98` | **HQ-native** | Toggles change local React state only (comment: "save locally for now"). Persisting the on/off flag is HQ-native; execution is the future engine. |
| "Browse templates" | `automations-view.tsx:130` | **dead** | No handler, no template library exists. Remove or relabel until the engine + templates exist. |

---

## Documents

| Control | Location | Category | Note |
|---|---|---|---|
| "New SOP" | `src/components/screens/documents/sops-view.tsx:20` | **HQ-native** | No handler. SOPs are HQ-owned content. |
| "New contract" | `src/components/screens/documents/contracts-view.tsx:34` | **HQ-native** | No handler. Contract *record* is HQ-owned (e-sign/sending would be a separate gated path). |
| "Add product" (Merch) | `src/components/screens/documents/merch-view.tsx:15` | **HQ-native** | No handler. Merch catalogue is HQ-owned. |
| "Upload" (Brand Assets) | `src/components/screens/documents/brand-assets-view.tsx:33` | **HQ-native** | No handler. Wire to Supabase Storage. |

`brief-view.tsx` is read-only (no controls).

---

## Brand build screens

| Control | Location | Category | Note |
|---|---|---|---|
| "New task" (Building the Brand) | `src/components/screens/brand/building-brand-view.tsx:17` | **HQ-native** | No handler. Brand-build kanban is HQ-owned. |
| "New role" (Building the Team) | `src/components/screens/brand/building-team-view.tsx:13` | **HQ-native** | No handler. Hiring pipeline is HQ-owned. |

`brand-view.tsx` link tiles are functional (the "Brand Guidelines" tile points
to `/brand-assets`, same as the "Brand Assets" tile — minor: no dedicated
guidelines view yet).

---

## Daily Digest

`src/components/screens/digest/digest-view.tsx`

| Control | Location | Category | Note |
|---|---|---|---|
| "Open in portal" | `digest-view.tsx:39` | **HQ-native** | No handler. Should link to the dashboard (or the persisted digest). Currently dead. |

---

## Coach Performance

`src/components/screens/coach/coach-performance-view.tsx`

| Control | Location | Category | Note |
|---|---|---|---|
| "Export" | `coach-performance-view.tsx:82` | **HQ-native** | `onClick={() => {}}`, labeled "Export lands later". The table data is already in memory; a client-side CSV/print export needs no backend. |

---

## Client Journey Tracker

`src/components/screens/journey/journey-view.tsx`

| Control | Location | Category | Note |
|---|---|---|---|
| Per-client "Set reminder" (bell) | `journey-view.tsx:58` | **HQ-native** | `onClick={() => {}}`, labeled "notifications land later". Persisting a reminder record is HQ-native; the actual notification *delivery* needs notification infra (later). |

---

## Settings

`src/components/screens/team/settings-view.tsx`

| Control | Location | Category | Note |
|---|---|---|---|
| Notification preference toggles | `settings-view.tsx:109` | **HQ-native** | Local React state only; not persisted. Save prefs to Supabase (per-user once Clerk lands; per-workspace fine now). Delivery itself is later. |

Integrations / Profile / Billing / Security tabs are read-only status displays
(correct: keys live in the environment, not entered here).

---

## Reports

`src/components/screens/reports/reports-view.tsx`

| Control | Location | Category | Note |
|---|---|---|---|
| "New report" | `reports-view.tsx:22` | **HQ-native** | No handler. Report generation is HQ-native (the detail page `reports/[id]` is also a placeholder: "Report body renders here once reporting is wired to live data"). Row click → detail works. |

---

## Results Tracker (Transformations)

`src/components/screens/transformations/transformations-view.tsx` — the
approval state machine (Coach approve → Admin approve → Schedule → Mark posted)
is fully wired to Supabase. One gap:

| Control | Location | Category | Note |
|---|---|---|---|
| Before / After image slots | `transformations-view.tsx:138` (slot component `:29`) | **HQ-native** | The empty "+" slots are display-only (a `div`, no upload handler). Wire to Supabase Storage for before/after asset upload. |

---

## Coach Assistant

`src/components/screens/coach-tools/coach-assistant-view.tsx`

| Control | Location | Category | Note |
|---|---|---|---|
| Prompt input + "Send" | `coach-assistant-view.tsx:41`, `:46` | **dead** (placeholder) | Both `disabled` and labeled "not yet connected". Honest scaffold for a later AI backend (retainer phase); not GHL/contact/auth. No action needed beyond keeping it visibly disabled until the backend exists. |

---

## Team

`src/components/screens/team/team-view.tsx`

| Control | Location | Category | Note |
|---|---|---|---|
| "Add invite" / "Revoke" | `team-view.tsx:95`, `:133` | **auth-gated** | Already wired to `createInviteAction` / `revokeInviteAction`. Disabled with an explanation until `authReady` (Clerk) is true; invites apply on first sign-in. Working as intended, listed for completeness. |

---

## Pipeline (CRM)

`src/components/screens/pipeline/pipeline-view.tsx` — Kanban / Table / Stages
views and the lead drawer all work as **read-only** projections of GHL. There
are no dead buttons; the drawer is intentionally read-only and says editing a
lead "writes back to GoHighLevel, which lands in a later phase" (**GHL-write**,
gated). No control to fix, noted for coverage.

---

## Screens with no broken controls (coverage note)

Read-only or fully-wired, audited and clean: Dashboard, Analytics, Sales
Performance, Sales Dashboard, VA Dashboard, Coach Dashboard, Social Media,
Ambassadors, Referrals, Check-ins, My Pay, My Clients, Recipes, Quizzes,
Calculators, Academy, Brief, Client Audits, Client Database (list), Coach
Results, Call Calendar, Reports (list row-click), Tasks.

---

## Summary by category

- **HQ-native (wire to Supabase now, no GHL/contact):** Inbox thread search + "Open profile"; Content Planner Add post / drag / This week; New collaboration; New campaign / Add magnet; Automations New automation + enable/disable persistence; New SOP / New contract / Add product / Upload asset; Building the Brand New task / Building the Team New role; Digest "Open in portal"; Coach Performance Export; Journey Set reminder (persist); Settings notification-pref persistence; New report; Transformations before/after upload.
- **GHL-write (gated, no-contact):** Topbar "Add client"; Client detail start-date Edit; Inbox Send / message input / quick-reply chips / Snooze / Assign; Calendar Add event; Pipeline lead editing (read-only by design); Automations engine execution.
- **auth-gated (needs Clerk):** Topbar user menu (avatar); Coach Overview "Portal (soon)"; Team invites (already wired, activates with Clerk); per-user persistence of notification prefs.
- **dead (remove/relabel):** Topbar "Record Loom"; Sidebar search input (duplicate of Cmd+K); Automations "Browse templates"; Coach Assistant input/Send (keep visibly disabled until the AI backend exists).
