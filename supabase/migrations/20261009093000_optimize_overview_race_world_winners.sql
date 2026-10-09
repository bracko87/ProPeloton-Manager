-- Replace expensive dynamic JSON/text joins over 53k+ race-stage results.
-- Preserve the same world headline payload while selecting only recent winners.
CREATE INDEX IF NOT EXISTS race_stage_results_stage_winner_idx
  ON public.race_stage_results(stage_id, created_at DESC)
  WHERE rank = 1;

CREATE OR REPLACE FUNCTION public.get_overview_race_world_v1(p_club_id uuid, p_season_year integer DEFAULT 2000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current_game_date date;
  v_upcoming_schedule jsonb := '[]'::jsonb;
  v_today_races jsonb := '[]'::jsonb;
  v_world_news jsonb := '[]'::jsonb;
begin
  select public.get_current_game_date_date() into v_current_game_date;

  if v_current_game_date is null then
    v_current_game_date := make_date(coalesce(p_season_year, 2000), 1, 1);
  end if;

  with club_scope as (
    select p_club_id::text as club_id
    union
    select c.id::text
    from public.clubs c
    where c.parent_club_id = p_club_id
      and c.club_type = 'developing'
  ),
  prep_base as (
    select
      rp.*,
      to_jsonb(rp) as rp_json,
      coalesce(
        nullif(to_jsonb(rp)->>'participating_club_id', ''),
        nullif(to_jsonb(rp)->>'owner_club_id', ''),
        nullif(to_jsonb(rp)->>'club_id', ''),
        nullif(to_jsonb(rp)->>'team_id', '')
      ) as resolved_participating_club_id_text,
      coalesce(
        nullif(to_jsonb(rp)->>'owner_club_id', ''),
        nullif(to_jsonb(rp)->>'club_id', ''),
        nullif(to_jsonb(rp)->>'team_id', ''),
        nullif(to_jsonb(rp)->>'participating_club_id', '')
      ) as resolved_owner_club_id_text
    from public.race_preparations rp
  ),
  accepted_races as (
    select distinct on (r.id)
      r.id as race_id,
      r.name as race_name,
      coalesce(
        to_jsonb(r)->>'race_category',
        to_jsonb(r)->>'category',
        to_jsonb(r)->>'class',
        to_jsonb(r)->>'race_class'
      ) as race_category,
      coalesce(
        nullif(to_jsonb(r)->>'country_code', ''),
        nullif(to_jsonb(r)->>'host_country_code', ''),
        nullif(to_jsonb(r)->>'countryCode', ''),
        nullif(to_jsonb(r)->>'hostCountryCode', ''),
        nullif(to_jsonb(r)->>'nation_code', ''),
        case
          when lower(r.name) like '%black river gorges%' then 'MU'
          when lower(r.name) like '%mauritius%' then 'MU'
          when lower(r.name) like '%guadeloupe%' then 'GP'
          when lower(r.name) like '%namib%' then 'NA'
          when lower(r.name) like '%faso%' then 'BF'
          when lower(r.name) like '%israel%' then 'IL'
          else null
        end
      ) as race_country_code,
      pb.resolved_participating_club_id_text as participating_club_id,
      min(s.stage_date) filter (where s.stage_date >= v_current_game_date) over (partition by r.id) as next_stage_date
    from prep_base pb
    join club_scope cs
      on cs.club_id = pb.resolved_owner_club_id_text
      or cs.club_id = pb.resolved_participating_club_id_text
    join public.races r
      on r.id = pb.race_id
    join public.race_stages s
      on s.race_id = r.id
    where lower(coalesce(pb.rp_json->>'status', '')) not in ('declined', 'rejected', 'cancelled', 'canceled', 'withdrawn')
      and lower(coalesce(pb.rp_json->>'startlist_status', '')) not in ('declined', 'rejected', 'cancelled', 'canceled', 'withdrawn')
      and lower(coalesce(r.status::text, '')) not in ('completed', 'cancelled', 'canceled')
      and exists (
        select 1
        from public.race_stages s2
        where s2.race_id = r.id
          and s2.stage_date >= v_current_game_date
      )
    order by r.id, pb.updated_at desc nulls last
  ),
  upcoming as (
    select
      ar.race_id,
      ar.race_name,
      ar.race_category,
      ar.race_country_code,
      ns.stage_number,
      ns.stage_date,
      coalesce(to_jsonb(ns)->>'route_label', '') as route_label,
      count(*) over (partition by ar.race_id) as stage_count
    from accepted_races ar
    join public.race_stages ns
      on ns.race_id = ar.race_id
     and ns.stage_date = ar.next_stage_date
    where ar.next_stage_date is not null
    order by ns.stage_date asc, ar.race_name asc
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
          case when stage_count > 1 then stage_count::text || ' stages' else null end,
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
        to_jsonb(r)->>'race_category',
        to_jsonb(r)->>'category',
        to_jsonb(r)->>'class',
        to_jsonb(r)->>'race_class'
      ) as race_category,
      coalesce(
        nullif(to_jsonb(r)->>'country_code', ''),
        nullif(to_jsonb(r)->>'host_country_code', ''),
        nullif(to_jsonb(r)->>'countryCode', ''),
        nullif(to_jsonb(r)->>'hostCountryCode', ''),
        nullif(to_jsonb(r)->>'nation_code', ''),
        case
          when lower(r.name) like '%black river gorges%' then 'MU'
          when lower(r.name) like '%mauritius%' then 'MU'
          when lower(r.name) like '%guadeloupe%' then 'GP'
          when lower(r.name) like '%namib%' then 'NA'
          when lower(r.name) like '%faso%' then 'BF'
          when lower(r.name) like '%israel%' then 'IL'
          else null
        end
      ) as race_country_code,
      s.stage_number,
      s.stage_date,
      coalesce(
        to_jsonb(s)->>'stage_format',
        to_jsonb(s)->>'terrain_type',
        'road_race'
      ) as stage_format,
      coalesce(to_jsonb(s)->>'route_label', '') as route_label
    from public.race_stages s
    join public.races r
      on r.id = s.race_id
    where s.stage_date = v_current_game_date
      and lower(coalesce(r.status::text, '')) not in ('cancelled', 'canceled')
    order by r.name asc, s.stage_number asc
    limit 20
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', race_id::text || ':' || stage_number::text,
        'timeLabel', case when stage_date = v_current_game_date then 'Today' else to_char(stage_date, 'Mon DD') end,
        'title', race_name,
        'countryCode', race_country_code,
        'subtitle', concat_ws(
          ' ',
          'Stage ' || stage_number::text ||
            case
              when nullif(race_category, '') is not null then ' of this ' || race_category || ' race'
              else ''
            end || ' is scheduled today.',
          case
            when nullif(stage_format, '') is not null then 'Race type: ' || initcap(replace(stage_format, '_', ' ')) || '.'
            else null
          end,
          case
            when nullif(route_label, '') is not null then 'Route: ' || route_label || '.'
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

  with published_stage_results as (
    -- Read only winning results from the last 14 game days, using native
    -- UUID joins rather than casting every result and rider to JSON/text.
    select distinct on (s.id)
      ('stage-result:' || s.id::text) as id,
      s.stage_date as news_date,
      '#/dashboard/races/' || r.id::text as href,
      r.name as race_name,
      coalesce(
        to_jsonb(r)->>'race_category',
        to_jsonb(r)->>'category',
        to_jsonb(r)->>'class',
        to_jsonb(r)->>'race_class'
      ) as race_category,
      s.stage_number,
      coalesce(
        to_jsonb(s)->>'stage_format',
        to_jsonb(s)->>'terrain_type',
        'road_race'
      ) as stage_format,
      coalesce(
        nullif(rsr.rider_name_snapshot, ''),
        to_jsonb(rd)->>'display_name',
        to_jsonb(rd)->>'full_name',
        nullif(concat_ws(' ', to_jsonb(rd)->>'first_name', to_jsonb(rd)->>'last_name'), ''),
        rsr.rider_id::text,
        'Unknown rider'
      ) as rider_name,
      coalesce(
        nullif(rsr.team_name_snapshot, ''),
        c.name,
        to_jsonb(c)->>'club_name',
        'Unknown team'
      ) as team_name
    from public.race_stage_results rsr
    join public.race_stages s on s.id = rsr.stage_id
    join public.races r on r.id = s.race_id
    left join public.riders rd on rd.id = rsr.rider_id
    left join public.clubs c on c.id = rsr.team_id
    where rsr.rank = 1
      and s.stage_date between (v_current_game_date - 14) and v_current_game_date
    order by s.id, s.stage_date desc, rsr.created_at desc
    limit 20
  ),
  ranking_award_base as (
    select
      to_jsonb(rrpa) as rrpa_json,
      coalesce(
        nullif(to_jsonb(rrpa)->>'rider_id', ''),
        nullif(to_jsonb(rrpa)->>'riderId', '')
      ) as resolved_rider_id_text,
      coalesce(
        nullif(to_jsonb(rrpa)->>'team_id', ''),
        nullif(to_jsonb(rrpa)->>'club_id', ''),
        nullif(to_jsonb(rrpa)->>'teamId', ''),
        nullif(to_jsonb(rrpa)->>'clubId', '')
      ) as resolved_team_id_text,
      coalesce(
        nullif(to_jsonb(rrpa)->>'season_year', ''),
        nullif(to_jsonb(rrpa)->>'seasonYear', ''),
        nullif(to_jsonb(rrpa)->>'season', '')
      ) as resolved_season_year_text,
      coalesce(
        nullif(to_jsonb(rrpa)->>'rider_points', ''),
        nullif(to_jsonb(rrpa)->>'team_points', ''),
        nullif(to_jsonb(rrpa)->>'points', ''),
        '0'
      ) as resolved_rider_points_text,
      coalesce(
        nullif(to_jsonb(rrpa)->>'team_points', ''),
        nullif(to_jsonb(rrpa)->>'rider_points', ''),
        nullif(to_jsonb(rrpa)->>'points', ''),
        '0'
      ) as resolved_team_points_text
    from public.race_ranking_point_awards rrpa
  ),
  ranking_award_clean as (
    select
      resolved_rider_id_text,
      resolved_team_id_text,
      case
        when resolved_season_year_text ~ '^\d+$'
          then resolved_season_year_text::integer
        else null
      end as resolved_season_year,
      case
        when resolved_rider_points_text ~ '^-?\d+(\.\d+)?$'
          then resolved_rider_points_text::numeric
        else 0::numeric
      end as rider_points,
      case
        when resolved_team_points_text ~ '^-?\d+(\.\d+)?$'
          then resolved_team_points_text::numeric
        else 0::numeric
      end as team_points
    from ranking_award_base
  ),
  top_riders as (
    select
      ('top-rider:' || rac.resolved_rider_id_text) as id,
      v_current_game_date as news_date,
      '#/dashboard/external-riders/' || rac.resolved_rider_id_text as href,
      coalesce(
        to_jsonb(rd)->>'display_name',
        to_jsonb(rd)->>'full_name',
        concat_ws(' ', to_jsonb(rd)->>'first_name', to_jsonb(rd)->>'last_name'),
        rac.resolved_rider_id_text,
        'Unknown rider'
      ) as rider_name,
      coalesce(c.name, to_jsonb(c)->>'club_name', 'Unknown team') as team_name,
      sum(rac.rider_points)::integer as points
    from ranking_award_clean rac
    left join public.riders rd
      on rd.id::text = rac.resolved_rider_id_text
    left join public.clubs c
      on c.id::text = rac.resolved_team_id_text
    where rac.resolved_rider_id_text is not null
      and (
        rac.resolved_season_year = p_season_year
        or rac.resolved_season_year is null
      )
    group by rac.resolved_rider_id_text, rd.id, c.id
    having sum(rac.rider_points) > 0
    order by sum(rac.rider_points) desc
    limit 3
  ),
  top_teams as (
    select
      ('top-team:' || rac.resolved_team_id_text) as id,
      v_current_game_date as news_date,
      '#/dashboard/team-profile/' || rac.resolved_team_id_text as href,
      coalesce(c.name, to_jsonb(c)->>'club_name', rac.resolved_team_id_text, 'Unknown team') as team_name,
      sum(rac.team_points)::integer as points
    from ranking_award_clean rac
    left join public.clubs c
      on c.id::text = rac.resolved_team_id_text
    where rac.resolved_team_id_text is not null
      and (
        rac.resolved_season_year = p_season_year
        or rac.resolved_season_year is null
      )
    group by rac.resolved_team_id_text, c.id
    having sum(rac.team_points) > 0
    order by sum(rac.team_points) desc
    limit 3
  ),
  today_headlines as (
    select
      ('today:' || (item->>'id')) as id,
      v_current_game_date as news_date,
      item->>'href' as href,
      item->>'title' as race_name,
      item->>'subtitle' as subtitle
    from jsonb_array_elements(v_today_races) item
    limit 2
  ),
  world_news_rows as (
    select
      id,
      news_date,
      href,
      'Stage result: ' || race_name || ' Stage ' || stage_number::text as title,
      rider_name || ' won Stage ' || stage_number::text || ' of ' || race_name || ' for ' || team_name || '.' as subtitle,
      concat_ws(
        ' ',
        'Published from the in-game stage results.',
        'This result is shown for the world peloton, whether or not your own club participated.',
        case when race_category is not null then 'Race category: ' || race_category || '.' else null end,
        'Race type: ' || replace(stage_format, '_', ' ') || '.',
        'Open the competition page for full results, classifications, replay, profile, and stage details.'
      ) as expanded_text,
      'stage_result' as source_type,
      'competition' as related_type,
      href as related_href,
      20 as sort_priority
    from published_stage_results

    union all

    select
      id,
      news_date,
      href,
      'World rider ranking: ' || rider_name || ' stays in focus' as title,
      rider_name || ' is one of the leading international-points riders with ' || points::text ||
      ' points for ' || team_name || '.' as subtitle,
      'This ranking update is generated from the in-game international-points table. It is a world-peloton item and should link only to the rider profile or another in-game related page.' as expanded_text,
      'rider_ranking' as source_type,
      'rider' as related_type,
      href as related_href,
      30 as sort_priority
    from top_riders

    union all

    select
      id,
      news_date,
      href,
      'Team ranking watch: ' || team_name || ' near the front' as title,
      team_name || ' is among the top international-points teams with ' || points::text ||
      ' points this season.' as subtitle,
      'This ranking update is generated from the in-game team points table. It is a world-peloton item and should link only to the related team profile or competition page.' as expanded_text,
      'team_ranking' as source_type,
      'team' as related_type,
      href as related_href,
      40 as sort_priority
    from top_teams

    union all

    select
      id,
      news_date,
      href,
      'Race today: ' || race_name as title,
      case
        when subtitle is null or subtitle = '' then 'A race is scheduled on the current game day.'
        else subtitle
      end as subtitle,
      'This is a schedule headline for the current in-game day. Open the competition page for the route, profile, participating teams, live/replay access, and published results once the stage is completed.' as expanded_text,
      'today_race' as source_type,
      'competition' as related_type,
      href as related_href,
      10 as sort_priority
    from today_headlines
  )

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'title', title,
        'subtitle', subtitle,
        'timeLabel', case when news_date = v_current_game_date then 'Today' else to_char(news_date, 'Mon DD') end,
        'href', href,
        'relatedHref', related_href,
        'relatedType', related_type,
        'sourceType', source_type,
        'expandedText', expanded_text
      )
      order by sort_priority asc, news_date desc, id asc
    ),
    '[]'::jsonb
  )
  into v_world_news
  from (
    select *
    from (
      select distinct on (id) *
      from world_news_rows
      order by id, sort_priority asc, news_date desc
    ) d
    order by sort_priority asc, news_date desc, id asc
    limit 7
  ) limited_news;

  if jsonb_array_length(v_world_news) < 7 then
    with filler as (
      select jsonb_build_object(
        'id', 'calendar-fallback-' || ord::text,
        'title', item->>'title',
        'subtitle', case
          when coalesce(item->>'subtitle', '') = '' then 'A race is scheduled on the in-game calendar.'
          else 'Scheduled in-game race: ' || (item->>'subtitle') || '.'
        end,
        'timeLabel', case
          when coalesce(item->>'timeLabel', item->>'dateLabel', '') in ('Today', to_char(v_current_game_date, 'Mon DD')) then 'Today'
          else coalesce(item->>'timeLabel', item->>'dateLabel', to_char(v_current_game_date, 'Mon DD'))
        end,
        'href', item->>'href',
        'relatedHref', item->>'href',
        'relatedType', 'competition',
        'sourceType', 'calendar',
        'expandedText', 'Calendar headline generated from in-game race data. Open the competition page for route, participants, live/replay access, and results when published.'
      ) as item
      from (
        select row_number() over () as ord, item
        from (
          select item from jsonb_array_elements(v_today_races) item
          union all
          select item from jsonb_array_elements(v_upcoming_schedule) item
        ) src
      ) x
      where not exists (
        select 1
        from jsonb_array_elements(v_world_news) existing
        where existing->>'href' = x.item->>'href'
          and existing->>'title' = x.item->>'title'
      )
      limit greatest(0, 7 - jsonb_array_length(v_world_news))
    )
    select v_world_news || coalesce(jsonb_agg(item), '[]'::jsonb)
    into v_world_news
    from filler;
  end if;

  return jsonb_build_object(
    'currentGameDate', v_current_game_date::text,
    'upcomingSchedule', v_upcoming_schedule,
    'todayRaces', v_today_races,
    'worldNews', coalesce(v_world_news, '[]'::jsonb)
  );
end;
$function$

