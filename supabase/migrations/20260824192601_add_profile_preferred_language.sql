alter table public.profiles
  add column preferred_language text not null default 'en';

alter table public.profiles
  add constraint profiles_preferred_language_check
  check (preferred_language in ('en', 'sr-Latn'));
