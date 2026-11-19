-- Tasks: to-dos that can be given a due date (and time) and ticked off, like Google Calendar tasks.
-- The due date and time are plain wall-clock values (no time zone): "due Nov 20 at 17:00" means
-- 17:00 wherever you are.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  title text not null,
  notes text,
  due_date date,                -- null = no due date
  due_time time,                -- optional, only with a due date
  completed_at timestamptz,     -- null = still to do
  created_at timestamptz not null default now(),
  constraint due_time_needs_date check (due_time is null or due_date is not null)
);

-- Speeds up "this user's tasks due in this date range"
create index tasks_user_due_idx on public.tasks (user_id, due_date);

alter table public.tasks enable row level security;

create policy "Users manage their own tasks" on public.tasks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.tasks to authenticated;
