-- Create Event Table
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  title text not null,
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  color text,
  created_at timestamptz not null default now(),
  constraint ends_after_start check (ends_at >= starts_at)
);

-- Speeds up "this user's events in this date range"
create index events_user_time_idx on public.events (user_id, starts_at);

-- Adds Row-Level Secruity
alter table public.events enable row level security;

create policy "Users manage their own events" on public.events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Let signed-in users reach the table through the API.
grant select, insert, update, delete on public.events to authenticated;
