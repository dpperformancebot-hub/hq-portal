# Datastore Phase 1: document + content stores

Owner review, 2026-06-20. **HARD STOP gate: schema change.** Nothing is applied until you approve and run it.

## Why this, why now

The "functional or honestly labeled" sweep is complete: every screen is honest, zero dead controls. The remaining disabled buttons all say the same thing, "needs the datastore." This migration is that datastore. It is the biggest single unlock, it is all internal HQ data, and it cannot contact anyone, so it carries none of the NO-CONTACT risk that GHL write-back does.

## What it adds

One migration: `supabase/migrations/20260620000001_document_content_stores.sql`. Seven new tables plus one column added to the existing `client_audits`. Columns mirror the app's existing seed types exactly, so the screens render unchanged.

| Store | Table | Unlocks |
|---|---|---|
| Client Audits | `client_audits` (+`resolved` column) | Live read + status/resolve write (table already existed, never read) |
| SOPs | `sops` | "New SOP" |
| Contracts | `contracts` | "New contract" |
| Brief | `brief_items` | Add brief item |
| Merch | `merch_products` | "Add product" |
| Content Planner | `content_posts` | "Add post" |
| Collaborations | `collaborations` | "New collaboration" |
| Brand Assets | `brand_assets` | Create asset record (file upload is Phase 2) |

## Defaults and override points (flagged in the SQL)

- **`contracts.client_name` is free text**, not a foreign key to `clients`. Keeps it faithful to the seed and lets contracts reference prospects who are not yet clients. Override: switch to `client_id uuid references clients(id)` if you only ever contract existing clients.
- **`merch_products.units_sold` / `revenue` are manual entry.** Override: sync from a store (Shopify is connected) in a later phase.
- **`content_posts.day` is a 0-6 planner column index**, not a calendar date. Says where a post sits in the weekly grid.

## Security

Matches the house pattern exactly: RLS on, zero policies, so only the server-side service-role key reads or writes until Clerk activation adds per-role read policies in `role_policies.sql`. No PII (email, phone) is stored. These tables have no outbound path, so the NO-CONTACT rule is untouched.

## Deferred to Phase 2 (separate gate)

- **File storage**: actual brand-asset images and signed contract/SOP PDFs via Supabase Storage. The columns (`file_url`, `storage_path`, `document_url`) exist now so no second `ALTER` is needed; only the bucket and upload wiring is deferred.
- **Referrals and Ambassadors** tables: these screens are view-only with no create/edit controls to unblock, so they stay on seed until you want to track them live.

## Build sequence after you approve

1. **You apply** the migration (`supabase db push` or the SQL editor). Schema changes stay yours to run.
2. **One commit, shared data layer**: add the live reads for all eight stores to `src/lib/live/index.ts` and the `src/lib/data.ts` facade. Done once, up front, because these files are shared.
3. **Parallel tabs, one store each**: build the create/edit/delete server action (one file per store, disjoint) and wire each screen's now-enabled buttons with optimistic UI. This is where the tabs fan back out.
4. **Deploy** with `vercel --prod`.

## The ask

Review the columns and the three override points above. If they look right, apply the migration and tell me. I will then land the shared data-layer commit and set the tabs loose on the per-store actions. If you want any column changed, say so and I will revise the draft before it is applied.
