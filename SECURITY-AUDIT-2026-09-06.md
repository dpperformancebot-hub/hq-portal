# Server-action scope audit, 2026-09-06

Trigger: external security audit found cross-coach data leaks. Page guards do
not protect server actions (a "use server" export is directly invokable with
the caller's session), so every export in every "use server" file was checked
for WHAT identity check it performs and WHETHER that check scopes the data to
the caller. API routes and the (hq) pages that stream all-client data were
swept in the same pass.

Verdict key: **OK** = scoped correctly before this audit. **FIXED** = changed
in this pass (see commit). **BY DESIGN** = no client-data exposure; open to
any signed-in role on purpose.

Identity primitives: `getServerIdentity()` (real role, effective role, head
coach flag, linked coach) and the pure policy functions in
`src/lib/access-policy.ts` (`canViewAllClientData`, `canViewLeadData`,
`canAccessCoachData`, `scopeClientsForIdentity`, ...), all unit-tested.

## P0

| Surface | Scope check | Verdict |
|---|---|---|
| `app/(hq)/client-database/[id]/page.tsx` | none -> `canViewAllClientData` + redirect; `stripPaymentSignals` for head coach / ops_manager | FIXED |
| `api/search/route.ts` + `lib/search-index.ts` | role-only nav scoping, entity rows unscoped -> full identity; clients via `scopeClientsForIdentity` (coach = own roster, links to /my-clients), coaches only for all-client roles, leads via `canViewLeadData` | FIXED |

## Server actions ("use server" exports)

| File | Export | Scope check | Verdict |
|---|---|---|---|
| app/(hq)/inbox/actions.ts | loadMessages | none -> `canViewLeadData` | FIXED |
| | getWhatsAppLink | none -> `canViewLeadData` | FIXED |
| | sendInboxMessageAction | realRole owner + outreach guard | OK |
| | canSendTo | none (display-only boolean, no data) | BY DESIGN |
| lib/academy-actions.ts | getAcademyProgress | own linkedCoachId | OK |
| | setLessonCompleteAction | own linkedCoachId | OK |
| | getAcademyTracker | owner or head coach | OK |
| lib/access-request-actions.ts | approveAccessRequestAction | `canApproveAccessRequests` + `grantableRoles` | OK |
| | rejectAccessRequestAction | `canApproveAccessRequests` | OK |
| lib/audit-actions.ts | setAuditStatus / setAuditDetails / setAuditResolved | owner/ops any; coach only if client.coach_id = own | OK |
| | setOwnerReview | realRole owner | OK |
| lib/automations-actions.ts | setAutomationEnabled, saveAutomationConfig | `assertBrandManager` | OK |
| lib/brand-assets-actions.ts | create/update/deleteBrandAsset | `assertBrandManager` | OK |
| lib/brand-build-actions.ts | createBrandBuildTaskAction, createHireAction | `assertBrandManager` | OK |
| lib/calendar-connect-actions.ts | connect / disconnect / getConnectedCalendarUrl | per-login key (Clerk id resolved server-side) | OK |
| lib/capacity-actions.ts | submitCapacityAction | coach, own linkedCoachId only | OK |
| | nudgeCapacityAction | owner/admin/ops_manager/head coach | OK |
| lib/check-in-entry-actions.ts | logCheckInAction, clearCheckInWeekAction | role allowlist + client.coach_id = own for plain coach + CHECKIN_EDITS_ADMIN_ONLY | OK |
| lib/check-in-import-actions.ts | previewCheckInImportAction, commitCheckInImportAction | matchRows: role allowlist + ownOnly roster for plain coach | OK |
| lib/check-in-summary-actions.ts | upsertCheckInSummaryAction, updateCheckInCodeAction | role allowlist + `canAccessClient` | OK |
| lib/client-flags-actions.ts | setCheckInDayAction, setClientPlanAction, setClientFlagsAction | role allowlist + `canAccessCoachData` on the client's coach | OK |
| lib/client-notes-actions.ts | createClientNoteAction | plain coach: client.coach_id = own | OK |
| | deleteClientNoteAction | owner/head coach any; coach own note only | OK |
| lib/client-panel-actions.ts | getClientPanelAction | `getCoachClientDetail(id, linkedCoachId)`: null unless on roster (head coach any); non-coach gets null in clerk mode | OK |
| lib/client-rate-actions.ts | setClientRateAction | realRole owner | OK |
| lib/coach-assign-actions.ts | assignCoachAction, assignClientsToCoachAction | owner/admin/head coach | OK |
| | listAssignableClientsAction | none -> same owner/admin/head coach gate, [] otherwise | FIXED |
| lib/content-actions.ts | 6 CRUD exports | `assertBrandManager` | OK |
| lib/contracts-merch-actions.ts | 6 CRUD exports | `assertBrandManager` | OK |
| lib/engagement-actions.ts | setMilestoneAction, setFeedbackFormSentAction, clearMilestoneAction | scopeCheck: owner/ops/head coach any; coach client.coach_id = own | OK |
| | listMilestones | none -> privileged all; coach own-roster client ids; others [] | FIXED |
| | listFeedbackFormSent | none -> same | FIXED |
| lib/expenses-actions.ts | listExpenses | none -> owner/admin, [] otherwise | FIXED |
| | createExpenseAction, setExpenseActiveAction, deleteExpenseAction | realRole owner | OK |
| lib/feedback-actions.ts | submitFeedbackAction | coach, own coach_id | OK |
| | listFeedback | plain coach own; owner/ops all; sales/ambassador_mgr [] | FIXED (was: all for any non-coach) |
| lib/impersonation-actions.ts | startImpersonation | realRole owner | OK |
| | stopImpersonation | clears own cookie | OK |
| lib/invites-actions.ts | createInviteAction, revokeInviteAction, addInviteEmailAction | role owner | OK |
| lib/journey-actions.ts | assignJourneyClientAction | delegates to guarded assignCoachAction | OK |
| | setClientStartDateAction | realRole owner | OK |
| lib/local-state-actions.ts | setCheckInReviewedAction | `canAccessCoachData(coachId)` | OK |
| | setNotificationPrefAction | `scope` trusted from client -> owner/admin only | FIXED |
| lib/marketing-actions.ts | createCampaignAction, createLeadMagnetAction | `assertBrandManager` | OK |
| lib/onboarding-actions.ts | listOnboarding, create, update, bulkImport, delete | resolveAccess: owner/head coach only | OK |
| lib/pause-actions.ts | createPauseAction, updatePauseAction | owner/ops/head coach | OK |
| | listPauses | plain coach own roster; owner/ops/head coach all; sales/ambassador_mgr [] | FIXED (was: all for any non-coach) |
| lib/recipes-actions.ts | listRecipes | none (shared coach recipe index, no client data) | BY DESIGN |
| | importRecipesAction | coach or owner, uploads under own coach id | OK |
| | deleteRecipeAction | owner or head coach | OK |
| lib/referral-actions.ts | addReferralAction, setReferralPaidAction | owner/ops | OK |
| | listReferrals | none -> owner/ops, [] otherwise | FIXED |
| lib/renewal-actions.ts | setRenewalNoteAction | owner/ops | OK |
| lib/reports-actions.ts | createReportAction | `assertBrandManager` | OK |
| lib/sops-brief-actions.ts | 6 CRUD exports | `assertBrandManager` | OK |
| lib/tasks-actions.ts | createTaskAction, createTicketAction | identity stamped as opener; any signed-in role may raise a task | BY DESIGN |
| | updateTaskAction, setTaskStatusAction, setBlockedAction, unblockAction, ackTaskAction, markTaskSeenAction | identity used only for the activity log -> `assertTaskAccess("edit")`: owner/head_of_ops/head coach any; others only tasks they raised or are assigned | FIXED |
| | deleteTaskAction | none -> `assertTaskAccess("delete")`: privileged or raiser only | FIXED |
| | createPauseTicketAction | coach: client.coach_id = own; ops any | OK |
| | createTemplateTaskAction | template `creatableBy` role gate | OK |
| | escalateTaskAction | head_of_ops or owner | OK |
| lib/transformations-actions.ts | advanceTransformationAction | none -> owner/ops/head coach any; plain coach draft->coach_approved on own client only | FIXED |
| | sendBackTransformationAction | owner/ops/head coach any; coach own coach_approved->draft | OK |
| | setPostLogAction | owner/ops/head coach | OK |
| lib/user-state-actions.ts | getUserStateAction, setUserStateAction | keyed by Clerk id resolved server-side | OK |
| lib/users-admin-actions.ts | listLoginsAction, updateLoginAction, listRoleChangesAction, getHeadCoachAction, setHeadCoachAction | realRole owner | OK |

## API routes

| Route | Auth | Verdict |
|---|---|---|
| api/assistant POST | signed-in identity; client context resolved via caller's linkedCoachId, clientId enumeration blocked | OK |
| api/backups/alert POST | Bearer CRON_SECRET | OK |
| api/gate POST | password gate | OK |
| api/impersonate GET | realRole owner | OK |
| api/notifications/deliver GET | CRON_SECRET / Vercel cron | OK |
| api/reports/weekly GET | CRON_SECRET / Vercel cron | OK |
| api/search GET | full identity -> scoped index | FIXED |
| api/sync/ghl GET/POST | CRON_SECRET / Vercel cron | OK |
| api/webhooks/ghl, kahunas, typeform POST | per-source webhook secret | OK |

## Pages streaming all-client data (server-side guard sweep)

| Page | Before | After |
|---|---|---|
| client-database/[id] | no guard | `canViewAllClientData` + redirect, payment signals stripped for head coach / ops_manager | 
| renewals | no guard (every coach's expiring clients) | `canViewAllClientData` + redirect |
| referrals | no guard (full client name list as picker) | `canViewAllClientData` + redirect |
| client-audits | plain coach scoped; any other role got the full cadence | non-coach must be all-client role |
| tasks | non-coach branch loaded the full active roster for pickers | pickers only for all-client roles |
| client-database, analytics, results-tracker, va-dashboard, inbox, pipeline, financials, team, onboarding, coach-overview, coach-performance, capacity, daily-digest | already guarded | unchanged |
| my-clients, check-ins, engagement, pauses, feedback, results, my-pay, dashboard | data layer scopes by identity | unchanged |

## Tests added

- `access-policy.test.ts`: `scopeClientsForIdentity` cross-coach matrix (a coach never receives another coach's client; forged linkedCoachId on a non-coach role grants nothing).
- `search-index.test.ts`: `buildSearchIndex` per role (coach gets own roster only, linked to /my-clients; no coaches, no leads; head coach / owner / admin / va see all; sales leads only).
- `coach-assign-actions.test.ts`: `listAssignableClientsAction` returns nothing to coach / sales / va.

## Production auth mode

Both live domains redirect `/dashboard` to `/sign-in` (Clerk), not to `/gate`
(password wall), which is only possible with `AUTH_MODE=clerk`: confirmed on
tjdfithq.com and www.dpperformanceportal.com on 2026-09-06. The env var itself
is stored as a sensitive Vercel variable on both projects, so the value cannot
be read back via the CLI; the redirect behaviour is the verification.

## Residual notes (no change made)

- `resolveCoachCard` falls back to the head coach's roster when `AUTH_MODE` is
  not `clerk` and no coach id is given. That is the dev-preview path behind the
  password gate; in production it returns null. Worth removing once the
  password-gate mode is retired.
- `createTaskAction` / `createTicketAction` let any role raise a free-form
  task (by design: team tool). They cannot read anything.
- `listRecipes` is open to every role: shared coaching content, no client data.
