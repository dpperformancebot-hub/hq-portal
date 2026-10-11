-- OWNER-GATED (proposed 2026-07-10, head-coach workflow).
--
-- Loom Summary Assistant: a coach pastes a Loom/Trellis check-in transcript
-- and the assistant produces a client-facing summary, action items, and
-- private coach notes (DP tone). Saved per client + week so the head coach
-- reads summaries instead of watching every Loom.
--
-- transcript is kept for re-generation and audit; the list read layer never
-- ships it to the browser. Internal records only, NO outbound path: the
-- summary text is copied out by the coach, never sent from the HQ.
--
-- Conventions: RLS on with zero policies (service-role only), set_updated_at().

create table if not exists public.check_in_summaries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  coach_id uuid references public.coaches(id) on delete set null,
  week_number integer,
  loom_url text,
  transcript text not null,
  summary text not null,
  action_items text not null,
  coach_notes text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists check_in_summaries_client_idx
  on public.check_in_summaries (client_id, created_at desc);
create index if not exists check_in_summaries_coach_idx
  on public.check_in_summaries (coach_id);

create trigger check_in_summaries_set_updated_at before update on public.check_in_summaries
  for each row execute function public.set_updated_at();

alter table public.check_in_summaries enable row level security;
