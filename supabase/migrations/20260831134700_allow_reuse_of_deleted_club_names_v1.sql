-- Allow names from soft-deleted clubs to be reused while keeping case-insensitive
-- uniqueness across all current/non-deleted clubs.

drop index if exists public.clubs_name_lower_key;

create unique index clubs_name_lower_key
on public.clubs (lower(name))
where deleted_at is null;
