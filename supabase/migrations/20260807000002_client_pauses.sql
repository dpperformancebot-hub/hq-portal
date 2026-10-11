-- R4-1 (FEEDBACK-V2): pause management board, modelled on the master sheet
-- "Pause List" tab verbatim. Stored: the two dates + the two manual Kahunas
-- checkboxes; pause weeks / days-until-reactivation / reactivating-soon are
-- DERIVED in code, never stored. One open pause per client at a time is a
-- workflow convention, not a constraint (history rows stay).
--
-- OWNER APPLIES THIS. Until applied the board reports the missing migration.
--
-- Conventions: RLS on with zero policies (service-role only), set_updated_at().

create table if not exists public.client_pauses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  pause_start date not null,
  pause_end date,
  cancelled_in_kahunas boolean not null default false,
  reactivated_in_kahunas boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_pauses_client_idx on public.client_pauses (client_id);
create index if not exists client_pauses_end_idx on public.client_pauses (pause_end);

drop trigger if exists client_pauses_set_updated_at on public.client_pauses;
create trigger client_pauses_set_updated_at before update on public.client_pauses
  for each row execute function public.set_updated_at();

alter table public.client_pauses enable row level security;
