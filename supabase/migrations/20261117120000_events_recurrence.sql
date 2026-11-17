-- Repeating events: every occurrence is still its own row (so the calendar views and
-- range queries work unchanged), and occurrences created together share a series_id.
-- `recurrence` holds the rule they were created from, e.g.
--   {"freq": "weekly", "days": [1, 3, 5], "until": "2026-12-31"}   (days: 0 = Sunday ... 6 = Saturday)
alter table public.events
  add column series_id uuid,
  add column recurrence jsonb;

-- Speeds up "all events in this series" (edit / delete the whole series)
create index events_series_idx on public.events (series_id) where series_id is not null;

-- "Never ends" series are stored a year ahead and topped up by the app. This returns the latest
-- event of each such series (runs as the caller, so row-level security still applies).
create function public.open_series_tails()
returns setof public.events
language sql stable security invoker
as $$
  select distinct on (series_id) *
  from public.events
  where recurrence ->> 'never' = 'true'
  order by series_id, starts_at desc
$$;

grant execute on function public.open_series_tails() to authenticated;
