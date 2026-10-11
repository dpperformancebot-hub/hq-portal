-- OWNER-GATED (proposed 2026-07-09, head-coach request via owner).
--
-- Client onboarding tracker: replaces the per-coach "New Client Plan Creation
-- Tracker" spreadsheet (Ella's sheet is the reference schema). One row per new
-- client being onboarded by a coach; the head coach reviews and approves.
-- Column groups mirror the sheet: Activation | Nutrition | Workout | Welcome
-- Video. Client names deep-link to Kahunas via kahunas_url.
--
-- Internal records only, NO outbound path. Notifications derive from state
-- (submitted-but-not-approved), no notifications table needed.
--
-- Conventions: RLS on with zero policies (service-role only), set_updated_at().

create table if not exists public.client_onboarding (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null,
  coach_id uuid references public.coaches(id) on delete set null,
  kahunas_url text,
  start_date date,
  -- Client Activation
  qna_received boolean not null default false,
  -- Nutrition
  nutrition_plan_made boolean not null default false,
  nutrition_feedback text,
  nutrition_adjusted boolean not null default false,
  -- Workout
  workout_plan_made boolean not null default false,
  workout_feedback text,
  workout_adjusted boolean not null default false,
  -- Welcome video + sign-off
  loom_url text,
  approved boolean not null default false,
  sent boolean not null default false,
  -- Free-text room per row (spreadsheet-style general notes).
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_onboarding_coach_idx on public.client_onboarding (coach_id);
create index if not exists client_onboarding_client_idx on public.client_onboarding (client_id);

create trigger client_onboarding_set_updated_at before update on public.client_onboarding
  for each row execute function public.set_updated_at();

alter table public.client_onboarding enable row level security;
