-- OWNER-GATED (proposed 2026-07-11, shared recipe index).
--
-- Shared recipes table: any coach can upload a CSV/XLSX of recipes and they
-- merge into every coach's Recipe Index alongside the 12 built-ins
-- (src/lib/coach-content/recipes.json). DB rows win over seed recipes on a
-- title collision at read time; re-uploads dedupe on lower(title).
--
-- ingredients/method are plain text with one item/step per line (the sheet
-- cells are multi-line); the read layer splits them for the existing renderer.
--
-- Conventions: RLS on with zero policies (service-role only), set_updated_at().

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  serves text,
  ingredients text not null default '',
  method text not null default '',
  uploaded_by uuid references public.coaches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Re-uploads dedupe: one row per title, case-insensitive.
create unique index if not exists recipes_title_lower_idx on public.recipes (lower(title));

create trigger recipes_set_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();

alter table public.recipes enable row level security;
