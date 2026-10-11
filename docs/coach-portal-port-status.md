# Coach Portal — Port Status & Map (Dan's coach-portal → HQ)

Tracks porting Dan's `dpperformancebot-hub/coach-portal` (single-file HTML app) into the HQ.
Key realisation: most of it was already in the HQ from an earlier build. All changes below
compile (`tsc --noEmit` clean).

## Done (in the HQ now)

- **Coach shell** — Client Audits + Tasks scoped per coach, route guard, coach dashboard, My Clients, Results. (Earlier work, verified.)
- **Coach tools content** (ported earlier, confirmed wired): Recipes (12), Quizzes (4, real questions), Academy (6 modules), Calculators (macro calculator).
- **My Pay** — rebuilt to Dan's exact model: $25/wk (Weekly) / $15/wk (Fortnightly) from each coach's rate, $50 onboarding bonus per client, $50 retention per full 10 weeks, next-payday (5th of month), per-client ledger with Rate/wk. Run-rate estimate until the weekly check-in feed lands; status-based weekly pay switches on automatically then.
- **SOPs** — Dan's 3 real coaching SOPs (Welcome Videos; Admin/Logs/Follow-Ups & Client Management; Kahunas System & Plan Setup) ported verbatim from source, shown to the coach role at `/sops` (owner still sees the business-docs SOPs).
- **Clerk auth** — wired behind `AUTH_MODE=clerk`; added the missing `/sign-up` route + redirects; owner login works locally.

## Remaining (with blocker + next action)

| Item | Status | Blocked on | Next action |
| --- | --- | --- | --- |
| Clerk team rollout | owner login works locally | team roster + Vercel deploy | Kai sends team list (name / email / role) → load invites + deploy with dev keys on vercel.app |
| The other ~19 SOPs | 3 of ~22 ported | live on sop-library-six.vercel.app (external) | pull that site or its repo, then extract the same way |
| 9-status check-in + pay-by-status | pay engine ready for it | live Kahunas check-in feed | connect Kahunas → real weekly statuses drive exact pay |
| Client Audit extras (audit rating + start/current weight) | specced | small Supabase migration (owner approval, gated) | approve migration → add fields + audit-card UI |
| AI client check-in summary | specced | Dan's Claude API key + placement decision | set key + pick where it shows → build the summary |
| Coach Assistant AI | UI exists, "not connected" | same Claude key | wire to Claude |

## Notes

- The My Pay + SOPs changes are in the working tree, ready to commit + deploy (`vercel --prod` bundles the working tree).
- The pay-log password and hardcoded secrets from Dan's portal were deliberately NOT ported.
- Dan's repo `api/` files contain live secrets (Vercel token, Gmail app password, JWT secret) — rotate them.
