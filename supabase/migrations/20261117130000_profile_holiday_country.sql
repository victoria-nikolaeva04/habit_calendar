-- ISO 3166-1 alpha-2 country code (e.g. 'US') whose public holidays are shown; null = none
alter table public.profiles
  add column holiday_country text
    check (holiday_country is null or holiday_country ~ '^[A-Z]{2}$');
