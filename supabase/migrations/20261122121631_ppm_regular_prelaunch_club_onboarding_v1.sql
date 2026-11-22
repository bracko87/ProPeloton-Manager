-- Regular pre-registration and team onboarding follow the authoritative registration gate.
-- Guest creation stays on the separately approved Saturn RPC and cannot use this function.
create or replace function public.is_current_user_club_creation_allowed_v1()
returns boolean language sql stable security definer set search_path='' as $allowed$
  select auth.uid() is not null
    and exists(select 1 from auth.users u where u.id=auth.uid() and u.is_anonymous is false and u.email_confirmed_at is not null)
    and not exists(select 1 from public.saturn_test_accounts_v1 t where t.user_id=auth.uid() and t.converted_at is null)
    and not exists(select 1 from private.game_world_reset_maintenance_gate_v1 m where m.id and m.locked)
    and (exists(select 1 from private.ppm_public_registration_gate_v1 g where g.id and g.registration_open
      and (g.registration_phase='prelaunch_test' or (g.registration_phase='public_launch' and g.launch_approved_at is not null)))
      or public.is_current_user_club_creation_exception_v1());
$allowed$;
revoke all on function public.is_current_user_club_creation_allowed_v1() from public,anon,authenticated;
grant execute on function public.is_current_user_club_creation_allowed_v1() to authenticated;
CREATE OR REPLACE FUNCTION public.create_club(p_name text, p_country_code text, p_primary_color text, p_secondary_color text, p_logo_path text DEFAULT NULL::text, p_motto text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_existing_club uuid;
  v_club_id uuid;

  v_name text;
  v_country_code text;
  v_primary_color text;
  v_secondary_color text;
  v_logo_path text;
  v_motto text;

  v_final_cash_balance numeric := 0;

  v_stage text := 'start';
  v_msg text;
  v_detail text;
  v_hint text;
  v_constraint text;
  v_table text;
begin
  v_stage := 'auth.uid';
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be authenticated to create a club.';
  end if;

  -- Guest sessions may preview game mechanics but cannot own
  -- official multiplayer clubs without converting to a verified identity.
  if exists(select 1 from auth.users au where au.id=v_user_id and au.is_anonymous=true) then
    raise exception 'Guest players cannot create an official club until they convert to a verified account.';
  end if;

  v_stage := 'lock profile';
  perform 1
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Profile not found for authenticated user.';
  end if;

  v_stage := 'club creation gate';
  if not public.is_current_user_club_creation_allowed_v1() then
    raise exception 'New club creation is temporarily disabled.';
  end if;

  v_stage := 'check existing club';
  select c.id
  into v_existing_club
  from public.clubs c
  where c.owner_user_id = v_user_id
  limit 1;

  if v_existing_club is not null then
    raise exception 'This account already owns a club.';
  end if;

  v_stage := 'normalize inputs';
  v_name := btrim(coalesce(p_name, ''));
  v_country_code := upper(btrim(coalesce(p_country_code, '')));
  v_primary_color := btrim(coalesce(p_primary_color, ''));
  v_secondary_color := btrim(coalesce(p_secondary_color, ''));
  v_logo_path := nullif(btrim(coalesce(p_logo_path, '')), '');
  v_motto := nullif(btrim(coalesce(p_motto, '')), '');

  if v_name = '' or char_length(v_name) < 3 or char_length(v_name) > 40 then
    raise exception 'Club name must be between 3 and 40 characters.';
  end if;

  if v_country_code = '' then
    raise exception 'Country code is required.';
  end if;

  if v_primary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Primary color must be a hex color like #F3C623.';
  end if;

  if v_secondary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Secondary color must be a hex color like #111216.';
  end if;

  if lower(v_primary_color) = lower(v_secondary_color) then
    raise exception 'Primary and secondary colors must be different.';
  end if;

  v_stage := 'validate country';
  if not exists (
    select 1
    from public.countries
    where code = v_country_code
      and is_selectable = true
  ) then
    raise exception 'Invalid or unavailable country code.';
  end if;

  v_stage := 'insert clubs';

  insert into public.clubs (
    owner_user_id,
    name,
    country_code,
    primary_color,
    secondary_color,
    logo_path,
    motto,
    world_tier,
    club_tier,
    tier2_division,
    reputation,
    is_ai,
    is_active,
    club_type
  )
  values (
    v_user_id,
    v_name,
    v_country_code,
    v_primary_color,
    v_secondary_color,
    v_logo_path,
    v_motto,
    3,
    'proteam'::public.club_tier,
    'PRO_EAST',
    0,
    false,
    true,
    'main'
  )
  returning id into v_club_id;

  v_stage := 'insert club_memberships';
  insert into public.club_memberships (club_id, user_id, role)
  values (v_club_id, v_user_id, 'owner')
  on conflict do nothing;

  v_stage := 'insert club_settings';
  insert into public.club_settings (club_id)
  values (v_club_id)
  on conflict (club_id) do nothing;

  v_stage := 'finance_setup_new_club';
  if to_regprocedure('public.finance_setup_new_club(uuid)') is not null then
    perform public.finance_setup_new_club(v_club_id);
  end if;

  v_stage := 'final new club balance setup';
  perform public.apply_new_club_creation_balance_v1(v_club_id, true);

  -- Extra safety: sync finance summary after finalizer.
  v_stage := 'sync club_finance_summary';
  select coalesce(c.cash_balance, 0)
  into v_final_cash_balance
  from public.clubs c
  where c.id = v_club_id;

  insert into public.club_finance_summary (club_id, current_balance)
  values (v_club_id, v_final_cash_balance)
  on conflict (club_id) do update
  set current_balance = excluded.current_balance;

  v_stage := 'update profiles';
  update public.profiles
  set has_created_club = true
  where id = v_user_id;

  return v_club_id;

exception
  when others then
    get stacked diagnostics
      v_msg = message_text,
      v_detail = pg_exception_detail,
      v_hint = pg_exception_hint,
      v_constraint = constraint_name,
      v_table = table_name;

    raise exception
      'create_club failed at stage=% | sqlstate=% | msg=% | table=% | constraint=% | detail=% | hint=%',
      v_stage,
      SQLSTATE,
      coalesce(v_msg, '?'),
      coalesce(v_table, '?'),
      coalesce(v_constraint, '?'),
      coalesce(v_detail, '?'),
      coalesce(v_hint, '?');
end;
$function$
;
