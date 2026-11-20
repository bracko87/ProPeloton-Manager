-- Project Saturn SAT-07 (ProPeloton Manager only).
-- Production change 20 Nov 2026: the existing signup trigger already supports
-- an optional username, but its previous fallback exposed the local part of
-- the player's email address. Use a non-identifying 24-character handle
-- derived from a stable hash of the entire server-issued UUID instead.
-- Replaces the existing function in place; doesn't modify accounts, clubs,
-- paid entitlements, birthdays, rewards or the game clock.
-- Trigger and explicit nickname behavior remain unchanged.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_username text;
  v_email text;
  v_birthday_month smallint;
  v_birthday_day smallint;
  v_birthday_year smallint;
begin
  v_email := coalesce(new.email, '');

  v_username := nullif(trim(new.raw_user_meta_data ->> 'username'), '');

  if v_username is null then
    -- Saturn SAT-07: avoid exposing email prefix in public usernames.
    v_username := 'mgr_' || left(md5(new.id::text), 20);
  end if;

  v_username := left(
    regexp_replace(
      regexp_replace(trim(v_username), '\s+', '_', 'g'),
      '[^a-zA-Z0-9_]',
      '',
      'g'
    ),
    24
  );

  if length(v_username) < 3 then
    v_username := 'user_' || substring(new.id::text, 1, 8);
  end if;

  v_birthday_month := nullif(new.raw_user_meta_data ->> 'birthday_month', '')::smallint;
  v_birthday_day := nullif(new.raw_user_meta_data ->> 'birthday_day', '')::smallint;
  v_birthday_year := nullif(new.raw_user_meta_data ->> 'birthday_year', '')::smallint;

  insert into public.profiles (
    id,
    username,
    email,
    birthday_month,
    birthday_day,
    birthday_year,
    birthday_locked,
    birthday_set_at
  )
  values (
    new.id,
    v_username,
    v_email,
    v_birthday_month,
    v_birthday_day,
    v_birthday_year,
    case
      when v_birthday_month is not null and v_birthday_day is not null then true
      else false
    end,
    case
      when v_birthday_month is not null and v_birthday_day is not null then now()
      else null
    end
  )
  on conflict (id) do update
  set
    email = excluded.email,
    username = coalesce(public.profiles.username, excluded.username),
    birthday_month = case
      when public.profiles.birthday_locked = true then public.profiles.birthday_month
      else excluded.birthday_month
    end,
    birthday_day = case
      when public.profiles.birthday_locked = true then public.profiles.birthday_day
      else excluded.birthday_day
    end,
    birthday_year = case
      when public.profiles.birthday_locked = true then public.profiles.birthday_year
      else excluded.birthday_year
    end,
    birthday_locked = case
      when public.profiles.birthday_locked = true then true
      when excluded.birthday_month is not null and excluded.birthday_day is not null then true
      else public.profiles.birthday_locked
    end,
    birthday_set_at = case
      when public.profiles.birthday_set_at is not null then public.profiles.birthday_set_at
      when excluded.birthday_month is not null and excluded.birthday_day is not null then now()
      else null
    end;

  return new;
end;
$function$;
