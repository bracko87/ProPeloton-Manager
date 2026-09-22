-- Lightweight Overview race schedule RPC.
-- The previous Overview path waited for get_overview_race_world_v1, which also
-- aggregates recent results and world rankings. Upcoming Schedule and Today's
-- Races should not wait for that background news work.

create or replace function public.get_overview_race_schedule_v1(
  p_club_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_current_game_date date;
  v_upcoming_schedule jsonb := '[]'::jsonb;
  v_today_races jsonb := '[]'::jsonb;
begin
  if p_club_id is null then
    return jsonb_build_object(
      'upcomingSchedule', '[]'::jsonb,
      'todayRaces', '[]'::jsonb
    );
  end if;

  v_current_game_date := public.get_current_game_date_date();

  if v_current_game_date is null then
    v_current_game_date := make_date(
      1999 + coalesce(public.get_current_season_number(), 1),
      1,
      1
    );
  end if;

  with club_scope as (
    select p_club_id::text as club_id
    union all
    select c.id::text
    from public.clubs c
    where c.parent_club_id = p_club_id
      and c.club_type = 'developing'
      and c.deleted_at is null
  ),
  accepted_races as (
    select distinct on (r.id)
      r.id as race_id,
      r.name as race_name,
      coalesce(
        nullif(to_jsonb(r)->>'race_category', ''),
        nullif(to_jsonb(r)->>'category', ''),
        nullif(to_jsonb(r)->>'class', ''),
        nullif(to_jsonb(r)->>'race_class', '')
      ) as race_category,
      coalesce(
        nullif(to_jsonb(r)->>'country_code', ''),
        nullif(to_jsonb(r)->>'host_country_code', ''),
        nullif(to_jsonb(r)->>'countryCode', ''),
        nullif(to_jsonb(r)->>'hostCountryCode', ''),
        nullif(to_jsonb(r)->>'nation_code', '')
      ) as race_country_code,
      (
        select min(stage.stage_date)
        from public.race_stages stage
        where stage.race_id = r.id
          and stage.stage_date >= v_current_game_date
      ) as next_stage_date,
      rp.updated_at
    from public.race_preparations rp
    join public.races r
      on r.id = rp.race_id
    where (
      nullif(to_jsonb(rp)->>'participating_club_id', '') in (
        select club_id from club_scope
      )
      or nullif(to_jsonb(rp)->>'owner_club_id', '') in (
        select club_id from club_scope
      )
      or nullif(to_jsonb(rp)->>'club_id', '') in (
        select club_id from club_scope
      )
      or nullif(to_jsonb(rp)->>'team_id', '') in (
        select club_id from club_scope
      )
    )
      and lower(coalesce(to_jsonb(rp)->>'status', '')) not in (
        'declined','rejected','cancelled','canceled','withdrawn'
      )
      and lower(coalesce(to_jsonb(rp)->>'startlist_status', '')) not in (
        'declined','rejected','cancelled','canceled','withdrawn'
      )
      and lower(coalesce(r.status::text, '')) not in (
        'completed','cancelled','canceled'
      )
      and exists (
        select 1
        from public.race_stages stage
        where stage.race_id = r.id
          and stage.stage_date >= v_current_game_date
      )
    order by r.id, rp.updated_at desc nulls last
  ),
  upcoming as (
    select
      ar.race_id,
      ar.race_name,
      ar.race_category,
      ar.race_country_code,
      stage.stage_number,
      stage.stage_date,
      coalesce(
        nullif(to_jsonb(stage)->>'route_label', ''),
        nullif(to_jsonb(stage)->>'name', ''),
        ''
      ) as route_label,
      (
        select count(*)::integer
        from public.race_stages count_stage
        where count_stage.race_id = ar.race_id
      ) as stage_count
    from accepted_races ar
    join public.race_stages stage
      on stage.race_id = ar.race_id
     and stage.stage_date = ar.next_stage_date
    where ar.next_stage_date is not null
    order by stage.stage_date asc, ar.race_name asc
    limit 5
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', race_id::text,
        'dateLabel', to_char(stage_date, 'Mon DD'),
        'title', race_name,
        'countryCode', race_country_code,
        'subtitle', concat_ws(
          ' · ',
          nullif(race_category, ''),
          'Stage ' || stage_number::text,
          case
            when stage_count > 1 then stage_count::text || ' stages'
            else null
          end,
          nullif(route_label, '')
        ),
        'href', '#/dashboard/races/' || race_id::text
      )
      order by stage_date asc, race_name asc
    ),
    '[]'::jsonb
  )
  into v_upcoming_schedule
  from upcoming;

  with today as (
    select
      r.id as race_id,
      r.name as race_name,
      coalesce(
        nullif(to_jsonb(r)->>'race_category', ''),
        nullif(to_jsonb(r)->>'category', ''),
        nullif(to_jsonb(r)->>'class', ''),
        nullif(to_jsonb(r)->>'race_class', '')
      ) as race_category,
      coalesce(
        nullif(to_jsonb(r)->>'country_code', ''),
        nullif(to_jsonb(r)->>'host_country_code', ''),
        nullif(to_jsonb(r)->>'countryCode', ''),
        nullif(to_jsonb(r)->>'hostCountryCode', ''),
        nullif(to_jsonb(r)->>'nation_code', '')
      ) as race_country_code,
      stage.stage_number,
      stage.stage_date,
      coalesce(
        nullif(to_jsonb(stage)->>'stage_format', ''),
        nullif(to_jsonb(stage)->>'terrain_type', ''),
        'road_race'
      ) as stage_format,
      coalesce(
        nullif(to_jsonb(stage)->>'route_label', ''),
        nullif(to_jsonb(stage)->>'name', ''),
        ''
      ) as route_label
    from public.race_stages stage
    join public.races r
      on r.id = stage.race_id
    where stage.stage_date = v_current_game_date
      and lower(coalesce(r.status::text, '')) not in ('cancelled','canceled')
    order by r.name asc, stage.stage_number asc
    limit 20
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', race_id::text || ':' || stage_number::text,
        'timeLabel', 'Today',
        'title', race_name,
        'countryCode', race_country_code,
        'subtitle', concat_ws(
          ' ',
          'Stage ' || stage_number::text ||
            case
              when nullif(race_category, '') is not null
                then ' of this ' || race_category || ' race'
              else ''
            end || ' is scheduled today.',
          case
            when nullif(stage_format, '') is not null
              then 'Race type: ' || initcap(replace(stage_format, '_', ' ')) || '.'
            else null
          end,
          case
            when nullif(route_label, '') is not null
              then 'Route: ' || route_label || '.'
            else null
          end
        ),
        'href', '#/dashboard/races/' || race_id::text
      )
      order by race_name asc, stage_number asc
    ),
    '[]'::jsonb
  )
  into v_today_races
  from today;

  return jsonb_build_object(
    'upcomingSchedule', v_upcoming_schedule,
    'todayRaces', v_today_races
  );
end;
$function$;

grant execute on function public.get_overview_race_schedule_v1(uuid)
to authenticated;
