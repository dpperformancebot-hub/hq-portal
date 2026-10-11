-- Datastore Phase 1: document + content stores (HQ-native).
-- Source design: docs/datastore-phase1-proposal.md (owner review 2026-06-20).
-- NOT applied automatically: run via `supabase db push` or the SQL editor.
--
-- Unlocks the create/edit controls currently disabled-with-tooltip on:
--   SOPs, Contracts, Brief, Merch, Content Planner, Collaborations, Brand Assets,
--   plus a live read + status write for Client Audits.
--
-- Conventions carried from 20260612000001_initial_schema.sql:
--   * uuid pk, set_updated_at() trigger, RLS on with ZERO policies
--     (service-role-only until Clerk lands; read policies go in role_policies).
--   * Computed/derived fields stay in selectors, never stored.
--   * No PII (email/phone) stored here. These tables cannot message anyone.

-- ------------------------------------------------- client_audits: add resolved
-- The app's ClientAudit type carries `resolved` (basis for the computed due
-- state); the live table predates it. Add it so the audits live read and the
-- resolve/advance write have a column to land in.
alter table public.client_audits
  add column if not exists resolved boolean not null default false;

-- ------------------------------------------------------------------------ sops
create table if not exists public.sops (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'General',
  version text not null default 'v1',
  document_url text,            -- Phase 2: Storage link to the SOP file
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------- contracts
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,    -- OVERRIDE POINT: could FK to clients(id) instead
  type text not null default 'Coaching',
  value numeric(10,2) not null default 0,
  signed date,
  term text,
  status text not null default 'pending' check (status in ('active','expired','pending')),
  document_url text,            -- Phase 2: Storage link to the signed PDF
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contracts_status_idx on public.contracts (status);

-- ----------------------------------------------------------------- brief_items
create table if not exists public.brief_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------- merch_products
create table if not exists public.merch_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  units_sold integer not null default 0,   -- OVERRIDE POINT: manual now; could sync a store later
  revenue numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------------- content_posts
create table if not exists public.content_posts (
  id uuid primary key default gen_random_uuid(),
  account text not null,
  day integer not null default 0,           -- planner grid column (week day index 0-6)
  type text not null check (type in ('Reel','Post','Story','YouTube','Email')),
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------- collaborations
create table if not exists public.collaborations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  assignee text not null default '',
  status text not null default 'planned' check (status in ('planned','to-do','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- brand_assets
create table if not exists public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('Logo','Photo','Video','Guideline')),
  file_url text,                -- Phase 2: Storage object URL
  storage_path text,            -- Phase 2: Storage object key
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------ triggers + RLS
-- Mirrors initial_schema: updated_at trigger + RLS ON with ZERO policies, so
-- only the server-side service-role key can read/write until Clerk activation
-- adds per-role read policies in role_policies.sql.
do $$
declare t text;
begin
  foreach t in array array[
    'sops','contracts','brief_items','merch_products',
    'content_posts','collaborations','brand_assets']
  loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t, t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
