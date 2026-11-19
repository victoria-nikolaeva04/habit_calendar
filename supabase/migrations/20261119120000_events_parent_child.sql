-- Repeating events, parent/child style.
--
-- A series is ONE "master" row: its first start/end plus the rule in `recurrence`, e.g.
--   {"freq": "weekly", "days": [1, 3, 5], "until": "2026-12-31"}   (days: 0 = Sunday ... 6 = Saturday)
-- The app expands the rule into occurrences when it draws the calendar, so nothing is stored per
-- occurrence. Only a single occurrence that was changed or deleted gets its own "exception" row:
--   series_id       -> the master's id
--   original_start  -> which generated occurrence it replaces (its start before the change)
--   cancelled       -> true when that occurrence was deleted
-- Deleting the master deletes its exceptions.
--
-- Rows are one of: a plain event (no series_id, no recurrence), a master (recurrence set, no series_id)
-- or an exception (series_id and original_start set).

alter table public.events
  add column original_start timestamptz,
  add column cancelled boolean not null default false,
  -- When the last occurrence ends; null for "never ends". Lets range queries skip finished series.
  add column recurrence_ends_at timestamptz;

-- Convert the old one-row-per-occurrence series: the earliest row of each series becomes the master and
-- every other row becomes an exception that replaces the occurrence at its own start time.
-- (An occurrence that was moved or deleted in the old model can't be recognised, so it may show up
-- again at its original time.)
with firsts as (
  select distinct on (series_id) series_id as old_series, id as master_id
  from public.events
  where series_id is not null
  order by series_id, starts_at, id
)
update public.events e
set original_start = e.starts_at,
    series_id = f.master_id,
    recurrence = null
from firsts f
where e.series_id = f.old_series and e.id <> f.master_id;

update public.events
set series_id = null,
    recurrence = recurrence - 'anchor'
where series_id is not null and original_start is null;

alter table public.events
  add constraint events_series_fk foreign key (series_id) references public.events (id) on delete cascade,
  add constraint events_exception_shape check ((series_id is null) = (original_start is null)),
  add constraint events_master_or_exception check (recurrence is null or series_id is null);

-- One exception per occurrence
create unique index events_exception_unique on public.events (series_id, original_start)
  where series_id is not null;

-- "Which series could reach this date range?"
create index events_master_idx on public.events (user_id, starts_at)
  where recurrence is not null and series_id is null;

-- The old "top up never-ending series" helper is no longer needed: those series are now truly endless.
drop function if exists public.open_series_tails();

-- Everything the calendar needs to draw [range_start, range_end) in one round trip (runs as the caller,
-- so row-level security still applies):
--   * plain events that overlap the range
--   * masters whose rule could reach the range, plus all of their exceptions
--     (an exception moved out of the range still has to hide the occurrence it replaces)
--   * exceptions that land in the range, plus their masters
create function public.events_in_range(range_start timestamptz, range_end timestamptz)
returns setof public.events
language sql stable security invoker
as $$
  with masters as (
    select * from public.events
    where recurrence is not null and series_id is null
      and starts_at < range_end
      and (recurrence_ends_at is null or recurrence_ends_at > range_start)
  ),
  moved_in as (
    select * from public.events
    where series_id is not null and starts_at < range_end and ends_at > range_start
  )
  select * from public.events
    where recurrence is null and series_id is null and starts_at < range_end and ends_at > range_start
  union all
  select * from masters
  union all
  select * from public.events where series_id in (select id from masters)
  union all
  select * from public.events
    where id in (select series_id from moved_in) and id not in (select id from masters)
  union all
  select * from moved_in where series_id not in (select id from masters)
$$;

grant execute on function public.events_in_range(timestamptz, timestamptz) to authenticated;

-- "This and following events": ends the series just before `p_split_at`, optionally starts a new series
-- from there, and moves the exceptions along with it, all in one transaction.
--   p_old_rule  the old master's rule, ending the day before the split; null when nothing is left
--               before the split, which deletes the old master
--   p_new       the new master as JSON (title, notes, starts_at, ends_at, all_day, color, recurrence,
--               recurrence_ends_at); null just deletes the events from the split on
--   p_drop_exceptions  true when the schedule changed, so the old exceptions no longer line up
-- Returns the new master's id (null when p_new is null).
create function public.split_series(
  p_series uuid,
  p_split_at timestamptz,
  p_old_rule jsonb,
  p_old_ends_at timestamptz,
  p_new jsonb,
  p_drop_exceptions boolean
) returns uuid
language plpgsql security invoker
as $$
declare
  v_new uuid;
begin
  if p_new is not null then
    insert into public.events (title, notes, starts_at, ends_at, all_day, color, recurrence, recurrence_ends_at)
    select n.title, n.notes, n.starts_at, n.ends_at, n.all_day, n.color, n.recurrence, n.recurrence_ends_at
    from jsonb_populate_record(null::public.events, p_new) as n
    returning id into v_new;
  end if;

  if p_new is null or p_drop_exceptions then
    delete from public.events where series_id = p_series and original_start >= p_split_at;
  else
    update public.events e
    set series_id = v_new, title = n.title, notes = n.notes, color = n.color, all_day = n.all_day
    from jsonb_populate_record(null::public.events, p_new) as n
    where e.series_id = p_series and e.original_start >= p_split_at;
  end if;

  if p_old_rule is null then
    delete from public.events where id = p_series and series_id is null;
  else
    update public.events
    set recurrence = p_old_rule, recurrence_ends_at = p_old_ends_at
    where id = p_series and series_id is null;
  end if;

  return v_new;
end
$$;

grant execute on function public.split_series(uuid, timestamptz, jsonb, timestamptz, jsonb, boolean) to authenticated;
