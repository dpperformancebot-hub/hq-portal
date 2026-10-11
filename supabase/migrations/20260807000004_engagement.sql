-- R4-3 (FEEDBACK-V2): engagement milestone calls, modelled on the master
-- sheet "Engagement tracker" tab. Milestones are COMPUTED from start date +
-- plan (W14 for everyone; PIF clients then every 16 weeks: W30/46/62/...);
-- only booked/done state is stored, one row per (client, week). A milestone
-- with no row that the client has reached reads as "due".
--
-- Also: clients.feedback_form_sent (sheet "Feedback Form Sent" flag; the
-- sheet rule is send at start + 3 weeks — R3-3 tie-in). HQ-owned: the GHL
-- sync never writes this column.
--
-- OWNER APPLIES THIS. Until applied the tracker reports the missing migration.
--
-- Conventions: RLS on with zero policies (service-role only), set_updated_at().

create table if not exists public.engagement_milestones (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  -- Week number of the milestone (14, 30, 46, ...).
  week integer not null check (week > 0),
  state text not null check (state in ('booked','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, week)
);

create index if not exists engagement_milestones_client_idx on public.engagement_milestones (client_id);

drop trigger if exists engagement_milestones_set_updated_at on public.engagement_milestones;
create trigger engagement_milestones_set_updated_at before update on public.engagement_milestones
  for each row execute function public.set_updated_at();

alter table public.engagement_milestones enable row level security;

alter table public.clients
  add column if not exists feedback_form_sent boolean not null default false;
