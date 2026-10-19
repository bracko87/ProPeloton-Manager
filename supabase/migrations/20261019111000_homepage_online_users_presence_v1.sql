-- Homepage shows recently online authenticated users, not total managers.
-- Presence is a lightweight timestamp update without referral, contracts, or
-- inactivity side effects. Only the authenticated caller may update their own.
create or replace function public.mark_online_presence_v1()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Online presence requires authentication';
  end if;
  update public.profiles set last_seen_at=now()
  where id=v_user;
end;
$$;

revoke all on function public.mark_online_presence_v1() from public,anon,authenticated;
grant execute on function public.mark_online_presence_v1() to authenticated,service_role;

create or replace function public.get_public_homepage_snapshot_v1()
returns jsonb
language plpgsql security definer set search_path to 'public', 'auth'
as $function$
declare
  v_active_managers integer := 0;
  v_online_users integer := 0;
  v_total_teams integer := 0;
  v_total_races integer := 0;
  v_total_stages integer := 0;
  v_game_time_label text := 'Season 1 • Game time unavailable';
  v_clock record;
begin
  -- Existing snapshot fields remain unchanged for other consumers.
  select count(distinct c.owner_user_id)::integer
    into v_active_managers
  from public.clubs c
  where c.owner_user_id is not null
    and coalesce(c.is_ai, false) = false
    and coalesce(c.club_type, 'main') = 'main'
    and coalesce(c.is_active, true) = true;

  -- Five-minute presence window, DISTINCT authenticated user accounts.
  -- No individual identifiers or timestamps are returned publicly.
  select count(distinct p.id)::integer into v_online_users
  from public.profiles p
  where p.last_seen_at >= now() - interval '5 minutes';

  select count(*)::integer into v_total_teams
  from public.clubs c
  where coalesce(c.club_type, 'main') = 'main';

  select count(*)::integer into v_total_races from public.races;
  select count(*)::integer into v_total_stages from public.race_stages;

  select * into v_clock
  from public.get_current_game_clock_v1()
  limit 1;

  if v_clock.game_time_label is not null and btrim(v_clock.game_time_label) <> '' then
    v_game_time_label := v_clock.game_time_label;
  else
    v_game_time_label :=
      'Season ' || coalesce(v_clock.season_number, 1)::text ||
      ' • ' ||
      coalesce(v_clock.game_date_display, 'Game date unavailable') ||
      ' • ' ||
      lpad(coalesce(v_clock.hour_number, 0)::text, 2, '0') ||
      ':' ||
      lpad(coalesce(v_clock.minute_number, 0)::text, 2, '0');
  end if;

  return jsonb_build_object(
    'game_time_label', v_game_time_label,
    'active_managers', coalesce(v_active_managers, 0),
    'online_users', coalesce(v_online_users, 0),
    'total_teams', coalesce(v_total_teams, 0),
    'total_races', coalesce(v_total_races, 0),
    'total_stages', coalesce(v_total_stages, 0)
  );
end;
$function$;
