-- '12h' = am/pm, '24h' = military time
alter table public.profiles
  add column time_format text not null default '12h'
    check (time_format in ('12h', '24h'));
