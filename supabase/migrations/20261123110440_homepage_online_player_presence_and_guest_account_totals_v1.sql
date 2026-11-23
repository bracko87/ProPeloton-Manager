-- Additive guest-inclusive player-presence and account statistics.
-- Applied to production Supabase as migration 20261123110440.
-- No club, finance, points, race or game-clock data is changed.
CREATE TABLE private.site_online_players_v1 (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.site_online_players_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.site_online_players_v1 FROM PUBLIC, anon, authenticated;
CREATE INDEX site_online_players_seen_at_idx ON private.site_online_players_v1(last_seen_at);

CREATE OR REPLACE FUNCTION public.touch_online_player_v1()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
begin
  if v_user is null then return false; end if;
  if not exists(select 1 from auth.users u where u.id = v_user and u.deleted_at is null) then
    return false;
  end if;
  insert into private.site_online_players_v1(user_id, last_seen_at) values (v_user, v_now)
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at
  where private.site_online_players_v1.last_seen_at < excluded.last_seen_at - interval '30 seconds';
  return true;
end;
$function$;
REVOKE ALL ON FUNCTION public.touch_online_player_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_online_player_v1() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_homepage_snapshot_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_active_managers integer := 0;
  v_online_users integer := 0;
  v_total_player_accounts integer := 0;
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

  -- Last 3 minutes of authenticated activity, including anonymous Supabase
  -- Auth users; a page view without a signed-in identity does not count.
  select count(*)::integer into v_online_users
  from private.site_online_players_v1 p
  where p.last_seen_at >= clock_timestamp() - interval '3 minutes'
    and exists (
      select 1 from auth.users u
      where u.id = p.user_id and u.deleted_at is null
    );

  -- All non-deleted Supabase Auth accounts, including guests without email.
  select count(*)::integer into v_total_player_accounts
  from auth.users u
  where u.deleted_at is null
    and lower(coalesce(u.email,'')) not like 'deleted_%@deleted.local';

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
    'total_player_accounts', coalesce(v_total_player_accounts, 0),
    'total_teams', coalesce(v_total_teams, 0),
    'total_races', coalesce(v_total_races, 0),
    'total_stages', coalesce(v_total_stages, 0)
  );
end;
$function$;
