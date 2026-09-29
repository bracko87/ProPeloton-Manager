do $$
declare
  v_shadow_id uuid;
  v_runtime_rows bigint;
begin
  select r.id
  into v_shadow_id
  from public.races r
  where lower(trim(r.name)) = lower(trim('Vuelta del Táchero en Bicicleta'))
    and r.start_date = date '2000-01-12'
    and r.end_date = date '2000-01-19'
    and r.status = 'archived'
    and r.metadata->>'archived_fix' = 'calendar_duplicate_cleanup_20260903'
    and r.metadata->>'archived_reason' = 'duplicate merged into UI-facing race row'
  order by r.created_at desc
  limit 1;

  if v_shadow_id is null then
    raise exception 'Expected archived Vuelta del Táchero duplicate was not found';
  end if;

  select
      (select count(*) from public.race_stage_results where race_id = v_shadow_id)
    + (select count(*) from public.race_stage_authoritative_runs where race_id = v_shadow_id)
    + (select count(*) from public.race_stage_simulation_runs where race_id = v_shadow_id)
    + (select count(*) from public.race_participant_teams where race_id = v_shadow_id)
    + (select count(*) from public.race_participant_riders where race_id = v_shadow_id)
    + (select count(*) from public.race_team_applications where race_id = v_shadow_id)
    + (select count(*) from public.race_team_entries where race_id = v_shadow_id)
    + (select count(*) from public.race_preparations where race_id = v_shadow_id)
    + (select count(*) from public.race_classification_standings where race_id = v_shadow_id)
    + (select count(*) from public.race_prize_awards where race_id = v_shadow_id)
    + (select count(*) from public.race_ranking_point_awards where race_id = v_shadow_id)
  into v_runtime_rows;

  if v_runtime_rows <> 0 then
    raise exception 'Refusing to delete archived Vuelta duplicate because it has % runtime rows', v_runtime_rows;
  end if;

  delete from public.races
  where id = v_shadow_id
    and status = 'archived';

  if not found then
    raise exception 'Archived Vuelta duplicate disappeared before delete';
  end if;
end
$$;

create or replace function public.get_public_homepage_race_days_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current_game_date date;
  v_yesterday date;
  v_tomorrow date;
  v_yesterday_rows jsonb := '[]'::jsonb;
  v_today_rows jsonb := '[]'::jsonb;
  v_tomorrow_rows jsonb := '[]'::jsonb;
begin
  select public.get_current_game_date_date()
  into v_current_game_date;

  if v_current_game_date is null then
    return jsonb_build_object(
      'yesterdayRaces', '[]'::jsonb,
      'todayRaces', '[]'::jsonb,
      'tomorrowRaces', '[]'::jsonb
    );
  end if;

  v_yesterday := v_current_game_date - interval '1 day';
  v_tomorrow := v_current_game_date + interval '1 day';

  select coalesce(jsonb_agg(row_data order by sort_date, race_name, stage_number), '[]'::jsonb)
  into v_yesterday_rows
  from (
    select
      rs.stage_date as sort_date,
      r.name as race_name,
      rs.stage_number,
      jsonb_build_object(
        'id', rs.id::text,
        'title', r.name,
        'subtitle', 'Stage ' || rs.stage_number::text,
        'timeLabel', 'Yesterday',
        'dateLabel', trim(to_char(v_yesterday, 'Mon DD')),
        'countryCode', r.country_code,
        'href', '/dashboard/races/' || r.id::text
      ) as row_data
    from public.race_stages rs
    join public.races r on r.id = rs.race_id
    where rs.stage_date = v_yesterday
      and coalesce(r.status, '') <> 'archived'
  ) rows;

  select coalesce(jsonb_agg(row_data order by sort_date, race_name, stage_number), '[]'::jsonb)
  into v_today_rows
  from (
    select
      rs.stage_date as sort_date,
      r.name as race_name,
      rs.stage_number,
      jsonb_build_object(
        'id', rs.id::text,
        'title', r.name,
        'subtitle', 'Stage ' || rs.stage_number::text,
        'timeLabel', 'Today',
        'dateLabel', trim(to_char(v_current_game_date, 'Mon DD')),
        'countryCode', r.country_code,
        'href', '/dashboard/races/' || r.id::text
      ) as row_data
    from public.race_stages rs
    join public.races r on r.id = rs.race_id
    where rs.stage_date = v_current_game_date
      and coalesce(r.status, '') <> 'archived'
  ) rows;

  select coalesce(jsonb_agg(row_data order by sort_date, race_name, stage_number), '[]'::jsonb)
  into v_tomorrow_rows
  from (
    select
      rs.stage_date as sort_date,
      r.name as race_name,
      rs.stage_number,
      jsonb_build_object(
        'id', rs.id::text,
        'title', r.name,
        'subtitle', 'Stage ' || rs.stage_number::text,
        'timeLabel', 'Tomorrow',
        'dateLabel', trim(to_char(v_tomorrow, 'Mon DD')),
        'countryCode', r.country_code,
        'href', '/dashboard/races/' || r.id::text
      ) as row_data
    from public.race_stages rs
    join public.races r on r.id = rs.race_id
    where rs.stage_date = v_tomorrow
      and coalesce(r.status, '') <> 'archived'
  ) rows;

  return jsonb_build_object(
    'yesterdayRaces', v_yesterday_rows,
    'todayRaces', v_today_rows,
    'tomorrowRaces', v_tomorrow_rows
  );
end;
$function$;
