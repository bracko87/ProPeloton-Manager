alter table public.profiles
  drop constraint if exists profiles_preferred_language_check;

alter table public.profiles
  add constraint profiles_preferred_language_check
  check (
    preferred_language = any (
      array['en'::text, 'sr-Latn'::text, 'de'::text, 'hr'::text, 'es'::text, 'it'::text]
    )
  );
