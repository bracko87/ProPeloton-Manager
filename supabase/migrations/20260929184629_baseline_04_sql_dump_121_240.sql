set check_function_bodies = false;
CREATE OR REPLACE FUNCTION public.select_ai_teams_for_race_autofill_v1(p_race_id uuid, p_host_country_code text, p_slots integer)
 RETURNS TABLE(club_id uuid, club_name text, country_code text, club_tier text, world_rank integer, rider_count integer, group_code text, macro_region text, autofill_priority integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with rules as (
    select *
    from public.race_entry_rules
    where race_id = p_race_id
  ),
  host_market as (
    select
      upper(p_host_country_code) as country_code,
      cmgm.group_code,
      cmg.macro_region
    from public.country_market_group_members cmgm
    join public.country_market_groups cmg
      on cmg.code = cmgm.group_code
    where cmgm.country_code = upper(p_host_country_code)
  ),
  existing_teams as (
    select team_id
    from public.race_participant_teams
    where race_id = p_race_id

    union

    select team_id
    from public.race_team_applications
    where race_id = p_race_id
      and application_status not in ('withdrawn', 'rejected')
  ),
  candidates as (
    select
      pool.id as club_id,
      pool.name as club_name,
      pool.country_code,
      pool.club_tier::text as club_tier,
      cpv.world_rank,
      cpv.rider_count,
      cmgm.group_code,
      cmg.macro_region,
      case
        when pool.country_code = hm.country_code then 1
        when cmgm.group_code = hm.group_code then 2
        when cmg.macro_region = hm.macro_region then 3
        else 4
      end as autofill_priority
    from public.ai_competition_filler_club_pool_v1 pool
    join public.club_profile_popup_view cpv
      on cpv.club_id = pool.id
    cross join rules r
    cross join host_market hm
    left join public.country_market_group_members cmgm
      on cmgm.country_code = pool.country_code
    left join public.country_market_groups cmg
      on cmg.code = cmgm.group_code
    left join existing_teams et
      on et.team_id = pool.id
    where et.team_id is null
      and coalesce(cpv.rider_count, 0) >= r.min_riders_per_team
  )
  select
    club_id,
    club_name,
    country_code,
    club_tier,
    world_rank,
    rider_count,
    group_code,
    macro_region,
    autofill_priority
  from candidates
  order by
    autofill_priority,
    world_rank nulls last,
    rider_count desc,
    club_name
  limit greatest(0, coalesce(p_slots, 0));
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_rewards_overview_v1(p_race_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with entry as (
    select public.get_race_entry_overview_v1(p_race_id) as payload
  ),
  selected_stage as (
    select coalesce(p_stage_id, (select id from public.race_stages where race_id = p_race_id order by stage_number desc nulls last limit 1)) as stage_id
  ),
  prize_awards as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', rpa.id,
      'race_id', rpa.race_id,
      'stage_id', rpa.stage_id,
      'bucket_key', rpa.bucket_key,
      'source_type', rpa.source_type,
      'classification_type', rpa.classification_type,
      'rank', rpa.rank,
      'recipient_type', rpa.recipient_type,
      'rider_id', rpa.rider_id,
      'team_id', rpa.team_id,
      'display_name_snapshot', rpa.display_name_snapshot,
      'team_name_snapshot', rpa.team_name_snapshot,
      'amount_cash', rpa.amount_cash,
      'status', rpa.status
    ) order by rpa.bucket_key, rpa.rank), '[]'::jsonb) as rows
    from public.race_prize_awards rpa
    where rpa.race_id = p_race_id
      and (p_stage_id is null or rpa.stage_id = p_stage_id or rpa.stage_id = (select stage_id from selected_stage))
  ),
  ranking_awards as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', rrpa.id,
      'race_id', rrpa.race_id,
      'stage_id', rrpa.stage_id,
      'source_type', rrpa.source_type,
      'classification_type', rrpa.classification_type,
      'rank', rrpa.rank,
      'rider_id', rrpa.rider_id,
      'team_id', rrpa.team_id,
      'display_name_snapshot', rrpa.display_name_snapshot,
      'team_name_snapshot', rrpa.team_name_snapshot,
      'rider_points', rrpa.rider_points,
      'team_points', rrpa.team_points
    ) order by rrpa.source_type, rrpa.rank), '[]'::jsonb) as rows
    from public.race_ranking_point_awards rrpa
    where rrpa.race_id = p_race_id
      and (p_stage_id is null or rrpa.stage_id = p_stage_id or rrpa.stage_id = (select stage_id from selected_stage))
  ),
  bucket_summary as (
    select coalesce(jsonb_agg(jsonb_build_object('bucket_key', bucket_key, 'total_amount_cash', sum_amount) order by bucket_key), '[]'::jsonb) as rows
    from (
      select bucket_key, sum(amount_cash)::bigint as sum_amount
      from public.race_prize_awards
      where race_id = p_race_id
      group by bucket_key
    ) s
  )
  select jsonb_build_object(
    'race_id', p_race_id,
    'stage_id', (select stage_id from selected_stage),
    'entry', entry.payload,
    'prize_awards', prize_awards.rows,
    'ranking_awards', ranking_awards.rows,
    'prize_bucket_summary', bucket_summary.rows
  )
  from entry
  cross join prize_awards
  cross join ranking_awards
  cross join bucket_summary;
$function$
;

CREATE OR REPLACE FUNCTION public.format_season_mmdd_v1(p_season_number integer, p_month_number integer, p_day_number integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_season_number is null or p_month_number is null or p_day_number is null then null
    else
      'S'
      || p_season_number::text
      || ' '
      || lpad(p_month_number::text, 2, '0')
      || '.'
      || lpad(p_day_number::text, 2, '0')
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_order_key_v1(p_season_number integer, p_month_number integer, p_day_number integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select
    (p_season_number * 1000)
    + public.season_day_of_year_v1(p_month_number, p_day_number);
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_stage_report_v1(p_stage_id uuid)
 RETURNS TABLE(id uuid, race_id uuid, stage_id uuid, event_order integer, km_marker numeric, race_time_label text, event_type text, title text, description text, rider_id uuid, team_id uuid, rider_name_snapshot text, team_name_snapshot text, metadata jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  select
    e.id,
    e.race_id,
    e.stage_id,
    e.event_order,
    e.km_marker,
    e.race_time_label,
    e.event_type,
    e.title,
    e.description,
    e.rider_id,
    e.team_id,
    e.rider_name_snapshot,
    e.team_name_snapshot,
    e.metadata
  from public.race_stage_report_events e
  where e.stage_id = p_stage_id
  order by e.event_order asc, e.km_marker asc nulls first;
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_release_detail_v1_before_stage_date_patch(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
with race_row as (
  select
    r.id,
    r.name,
    r.short_name,
    r.start_date,
    r.end_date,
    r.country_code,
    r.host_city,
    r.category,
    r.race_type,
    r.is_stage_race,
    r.stage_count,
    r.status,
    r.logo_url
  from public.races r
  where r.id = p_race_id
),
entry_overview as (
  select public.get_race_entry_overview_v1(p_race_id) as entry_json
),
stage_rows as (
  select
    rs.id,
    rs.race_id,
    rs.stage_number,
    rs.name,

    coalesce(rs.start_city_name, rs.start_city) as start_city_name,
    coalesce(rs.finish_city_name, rs.finish_city) as finish_city_name,

    coalesce(
      d.route_label,
      case
        when coalesce(rs.start_city_name, rs.start_city) is not null
         and coalesce(rs.finish_city_name, rs.finish_city) is not null
         and coalesce(rs.start_city_name, rs.start_city) = coalesce(rs.finish_city_name, rs.finish_city)
        then coalesce(rs.start_city_name, rs.start_city) || ' circuit'

        when coalesce(rs.start_city_name, rs.start_city) is not null
         and coalesce(rs.finish_city_name, rs.finish_city) is not null
        then coalesce(rs.start_city_name, rs.start_city) || ' → ' || coalesce(rs.finish_city_name, rs.finish_city)

        else coalesce(rs.name, 'Stage ' || rs.stage_number::text)
      end
    ) as route_label,

    coalesce(d.distance_km, rs.distance_km) as distance_km,
    coalesce(d.terrain_type, rs.terrain_type) as terrain_type,
    coalesce(d.profile_type, rs.profile_type) as profile_type,
    coalesce(d.elevation_gain_m, rs.elevation_gain_m) as elevation_gain_m,

    coalesce(d.stage_summary, rs.notes) as notes,
    coalesce(d.intermediate_sprints, rs.intermediate_sprints_json, '[]'::jsonb) as intermediate_sprints_json,
    coalesce(d.mountain_climbs, rs.mountain_climbs_json, '[]'::jsonb) as mountain_climbs_json,
    coalesce(d.route_markers, '[]'::jsonb) as route_markers_json,
    coalesce(d.terrain_split, '{}'::jsonb) as terrain_split_json,
    coalesce(d.weather_summary, rs.weather_summary) as weather_summary,
    d.weather_snapshot as weather_snapshot
  from public.race_stages rs
  left join public.race_stage_profile_details d
    on d.stage_id = rs.id
  where rs.race_id = p_race_id
),
stage_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'race_id', race_id,
        'stage_number', stage_number,
        'name', name,
        'start_city_name', start_city_name,
        'finish_city_name', finish_city_name,
        'route_label', route_label,
        'distance_km', distance_km,
        'terrain_type', terrain_type,
        'profile_type', profile_type,
        'elevation_gain_m', elevation_gain_m,
        'notes', notes,
        'intermediate_sprints_json', intermediate_sprints_json,
        'mountain_climbs_json', mountain_climbs_json,
        'route_markers_json', route_markers_json,
        'terrain_split_json', terrain_split_json,
        'weather_summary', weather_summary,
        'weather_snapshot', weather_snapshot
      )
      order by stage_number
    ),
    '[]'::jsonb
  ) as stages
  from stage_rows
),
terrain_counts as (
  select
    count(*)::numeric as total_stages,
    count(*) filter (where lower(coalesce(terrain_type, '')) = 'flat')::numeric as flat_count,
    count(*) filter (where lower(coalesce(terrain_type, '')) = 'hilly')::numeric as hilly_count,
    count(*) filter (where lower(coalesce(terrain_type, '')) = 'mountain')::numeric as mountain_count,
    count(*) filter (where lower(coalesce(terrain_type, '')) = 'cobbled')::numeric as cobbled_count,
    count(*) filter (
      where lower(coalesce(terrain_type, '')) in (
        'individual_time_trial',
        'team_time_trial',
        'time_trial',
        'prologue'
      )
    )::numeric as time_trial_count
  from stage_rows
),
terrain_json as (
  select jsonb_build_object(
    'flat',
      case when total_stages > 0 then round(flat_count * 100 / total_stages)::int else 0 end,
    'hilly',
      case when total_stages > 0 then round(hilly_count * 100 / total_stages)::int else 0 end,
    'mountain',
      case when total_stages > 0 then round(mountain_count * 100 / total_stages)::int else 0 end,
    'cobbled',
      case when total_stages > 0 then round(cobbled_count * 100 / total_stages)::int else 0 end,
    'time_trial',
      case when total_stages > 0 then round(time_trial_count * 100 / total_stages)::int else 0 end
  ) as terrain_split
  from terrain_counts
)
select jsonb_build_object(
  'race',
    jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'short_name', r.short_name,
      'start_date', r.start_date,
      'end_date', r.end_date,
      'country_code', r.country_code,
      'host_city', r.host_city,
      'category', r.category,
      'race_type', r.race_type,
      'is_stage_race', r.is_stage_race,
      'stage_count', r.stage_count,
      'status', r.status,
      'logo_url', r.logo_url,
      'logo_image_url', r.logo_url,
      'image_url', r.logo_url
    ),
  'entry', e.entry_json,
  'stages', s.stages,
  'terrain_split', t.terrain_split
)
from race_row r
cross join entry_overview e
cross join stage_json s
cross join terrain_json t;
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_rewards_totals_v1(p_race_id uuid, p_viewer_team_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with prize_team_base as (
    select
      rpa.team_id,
      coalesce(max(rpa.team_name_snapshot), 'Unknown team') as team_name,
      sum(rpa.amount_cash)::bigint as total_prize_cash,
      count(*)::integer as award_rows
    from public.race_prize_awards rpa
    where rpa.race_id = p_race_id
      and rpa.team_id is not null
      and rpa.recipient_type = 'team'
    group by rpa.team_id
  ),
  prize_team as (
    select
      row_number() over (order by total_prize_cash desc, team_name asc)::integer as rank,
      team_id,
      team_name,
      total_prize_cash,
      award_rows,
      case when p_viewer_team_id is not null and team_id = p_viewer_team_id then true else false end as is_viewer_team
    from prize_team_base
  ),
  ranking_team_base as (
    select
      rrpa.team_id,
      coalesce(max(rrpa.team_name_snapshot), 'Unknown team') as team_name,
      sum(rrpa.team_points)::integer as total_team_points,
      count(*)::integer as award_rows
    from public.race_ranking_point_awards rrpa
    where rrpa.race_id = p_race_id
      and rrpa.team_id is not null
    group by rrpa.team_id
  ),
  ranking_team as (
    select
      row_number() over (order by total_team_points desc, team_name asc)::integer as rank,
      team_id,
      team_name,
      total_team_points,
      award_rows,
      case when p_viewer_team_id is not null and team_id = p_viewer_team_id then true else false end as is_viewer_team
    from ranking_team_base
  ),
  ranking_rider_base as (
    select
      rrpa.rider_id,
      rrpa.team_id,
      coalesce(max(rrpa.display_name_snapshot), 'Unknown rider') as rider_name,
      coalesce(max(rrpa.team_name_snapshot), 'Unknown team') as team_name,
      sum(rrpa.rider_points)::integer as total_rider_points,
      count(*)::integer as award_rows
    from public.race_ranking_point_awards rrpa
    where rrpa.race_id = p_race_id
      and rrpa.rider_id is not null
    group by rrpa.rider_id, rrpa.team_id
  ),
  ranking_rider as (
    select
      row_number() over (order by total_rider_points desc, rider_name asc)::integer as rank,
      rider_id,
      team_id,
      rider_name,
      team_name,
      total_rider_points,
      award_rows,
      case when p_viewer_team_id is not null and team_id = p_viewer_team_id then true else false end as is_viewer_team
    from ranking_rider_base
  )
  select jsonb_build_object(
    'race_id', p_race_id,
    'prize_team_totals', coalesce(
      (
        select jsonb_agg(to_jsonb(prize_team) order by rank)
        from prize_team
      ),
      '[]'::jsonb
    ),
    'ranking_team_totals', coalesce(
      (
        select jsonb_agg(to_jsonb(ranking_team) order by rank)
        from ranking_team
      ),
      '[]'::jsonb
    ),
    'ranking_rider_totals', coalesce(
      (
        select jsonb_agg(to_jsonb(ranking_rider) order by rank)
        from ranking_rider
      ),
      '[]'::jsonb
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_stage_profile_detail_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with stage_row as (
    select
      rs.id,
      rs.race_id,
      rs.stage_number,
      rs.start_city,
      rs.finish_city,
      rs.weather_snapshot
    from public.race_stages rs
    where rs.id = p_stage_id
    limit 1
  ),
  detail_row as (
    select *
    from public.race_stage_profile_details d
    where d.stage_id = p_stage_id
    limit 1
  )
  select coalesce(
    (
      select jsonb_build_object(
        'stage_id', s.id,
        'race_id', s.race_id,
        'stage_number', s.stage_number,
        'start_city', s.start_city,
        'finish_city', s.finish_city,

        'stage_title', d.stage_title,
        'route_label', d.route_label,
        'stage_summary', d.stage_summary,
        'weather_summary', d.weather_summary,
        'weather_snapshot', coalesce(d.weather_snapshot, s.weather_snapshot, '{}'::jsonb),

        'distance_km', d.distance_km,
        'elevation_gain_m', d.elevation_gain_m,
        'terrain_type', d.terrain_type,
        'profile_type', d.profile_type,

        'terrain_split', d.terrain_split,
        'profile_points', d.profile_points,
        'route_markers', d.route_markers,
        'intermediate_sprints', d.intermediate_sprints,
        'mountain_climbs', d.mountain_climbs,
        'metadata', d.metadata,
        'has_profile', true
      )
      from stage_row s
      join detail_row d on d.stage_id = s.id
    ),
    (
      select jsonb_build_object(
        'stage_id', s.id,
        'race_id', s.race_id,
        'stage_number', s.stage_number,
        'start_city', s.start_city,
        'finish_city', s.finish_city,
        'weather_snapshot', coalesce(s.weather_snapshot, '{}'::jsonb),
        'has_profile', false,
        'profile_points', '[]'::jsonb,
        'route_markers', '[]'::jsonb,
        'intermediate_sprints', '[]'::jsonb,
        'mountain_climbs', '[]'::jsonb,
        'terrain_split', jsonb_build_object(
          'flat', 0,
          'hilly', 0,
          'mountain', 0,
          'cobbled', 0
        )
      )
      from stage_row s
    ),
    '{}'::jsonb
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_stage_kom_marker_validation_v1(p_stage_id uuid)
 RETURNS TABLE(marker_label text, marker_km numeric, marker_elevation_m numeric, nearest_peak_km numeric, nearest_peak_elevation_m numeric, ascent_previous_12km_m numeric, is_valid boolean, warning text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with detail as (
    select *
    from public.race_stage_profile_details
    where stage_id = p_stage_id
  ),
  profile as (
    select
      (point ->> 'km')::numeric as km,
      coalesce(
        nullif(point ->> 'elevation_m', '')::numeric,
        nullif(point ->> 'elevation', '')::numeric
      ) as elevation_m
    from detail d,
    jsonb_array_elements(d.profile_points) point
  ),
  profile_indexed as (
    select
      p.*,
      lag(p.elevation_m) over (order by p.km) as previous_elevation_m,
      lead(p.elevation_m) over (order by p.km) as next_elevation_m
    from profile p
  ),
  peaks as (
    select *
    from profile_indexed
    where (previous_elevation_m is null or elevation_m >= previous_elevation_m)
      and (next_elevation_m is null or elevation_m >= next_elevation_m)
  ),
  kom_markers as (
    select
      marker ->> 'label' as marker_label,
      (marker ->> 'km')::numeric as marker_km
    from detail d,
    jsonb_array_elements(d.route_markers) marker
    where lower(marker ->> 'type') = 'kom'
       or lower(marker ->> 'label') like 'cat%'
       or lower(marker ->> 'label') like 'kom%'
  )
  select
    k.marker_label,
    k.marker_km,
    marker_point.elevation_m as marker_elevation_m,
    nearest_peak.km as nearest_peak_km,
    nearest_peak.elevation_m as nearest_peak_elevation_m,
    marker_point.elevation_m - previous_low.low_elevation_m as ascent_previous_12km_m,
    (
      nearest_peak.km is not null
      and abs(k.marker_km - nearest_peak.km) <= 2
      and marker_point.elevation_m >= nearest_peak.elevation_m - 20
      and marker_point.elevation_m - previous_low.low_elevation_m >= 40
    ) as is_valid,
    case
      when nearest_peak.km is null then 'No nearby summit found.'
      when abs(k.marker_km - nearest_peak.km) > 2 then 'KOM marker is not close enough to the summit.'
      when marker_point.elevation_m < nearest_peak.elevation_m - 20 then 'KOM marker is below the summit elevation.'
      when marker_point.elevation_m - previous_low.low_elevation_m < 40 then 'Not enough climbing before KOM marker.'
      else 'OK'
    end as warning
  from kom_markers k
  left join lateral (
    select p.*
    from profile p
    order by abs(p.km - k.marker_km)
    limit 1
  ) marker_point on true
  left join lateral (
    select p.*
    from peaks p
    where abs(p.km - k.marker_km) <= 12
    order by abs(p.km - k.marker_km), p.elevation_m desc
    limit 1
  ) nearest_peak on true
  left join lateral (
    select min(p.elevation_m) as low_elevation_m
    from profile p
    where p.km between greatest(0, k.marker_km - 12) and k.marker_km
  ) previous_low on true;
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_calendar_entries_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',
          race_data.id,

        'name',
          race_data.name,

        'short_name',
          race_data.short_name,

        'country_code',
          race_data.country_code,

        'host_city',
          race_data.host_city,

        'category',
          race_data.category,

        'race_type',
          race_data.race_type,

        'is_stage_race',
          race_data.is_stage_race,

        /*
         * stage_count now represents the real number of stage rows.
         * The stored header value is used only when no stage rows exist.
         */
        'stage_count',
          race_data.resolved_stage_count,

        'stored_stage_count',
          race_data.stored_stage_count,

        'actual_stage_count',
          race_data.actual_stage_count,

        'first_start_city',
          race_data.first_start_city,

        'final_finish_city',
          race_data.final_finish_city,

        'start_date',
          race_data.start_date,

        'end_date',
          race_data.end_date,

        'status',
          race_data.status,

        'description',
          race_data.description,

        'logo_url',
          race_data.logo_url,

        'logo_image_url',
          race_data.logo_url,

        'image_url',
          race_data.logo_url
      )
      order by
        race_data.start_date,
        race_data.name,
        race_data.id
    ),
    '[]'::jsonb
  )
  from (
    select
      race_row.id,
      race_row.name,
      race_row.short_name,
      race_row.country_code,
      race_row.host_city,
      race_row.category,
      race_row.race_type,
      race_row.is_stage_race,

      race_row.stage_count
        as stored_stage_count,

      coalesce(
        stage_summary.actual_stage_count,
        0
      ) as actual_stage_count,

      case
        when coalesce(
          stage_summary.actual_stage_count,
          0
        ) > 0
          then stage_summary.actual_stage_count

        else race_row.stage_count
      end as resolved_stage_count,

      stage_summary.first_start_city,
      stage_summary.final_finish_city,

      race_row.start_date,
      race_row.end_date,
      race_row.status,
      race_row.description,
      race_row.logo_url

    from public.races race_row

    left join lateral (
      select
        count(*)::integer
          as actual_stage_count,

        (
          array_agg(
            stage_row.start_city
            order by stage_row.stage_number
          )
        )[1]
          as first_start_city,

        (
          array_agg(
            stage_row.finish_city
            order by stage_row.stage_number desc
          )
        )[1]
          as final_finish_city

      from public.race_stages stage_row

      where stage_row.race_id =
        race_row.id
    ) stage_summary
      on true

    where coalesce(
      race_row.status,
      ''
    ) <> 'archived'
  ) race_data;
$function$
;

CREATE OR REPLACE FUNCTION public.game_date_ordinal_v1(p_season_number integer, p_month_number integer, p_day_number integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select
    ((greatest(1, p_season_number) - 1) * 360)
    + ((greatest(1, p_month_number) - 1) * 30)
    + (greatest(1, p_day_number) - 1);
$function$
;

CREATE OR REPLACE FUNCTION public.game_date_display_v1(p_season_number integer, p_month_number integer, p_day_number integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select concat(
    'S',
    p_season_number,
    ' · ',
    (array[
      'Jan','Feb','Mar','Apr','May','Jun',
      'Jul','Aug','Sep','Oct','Nov','Dec'
    ])[greatest(1, least(12, p_month_number))],
    ' ',
    lpad(p_day_number::text, 2, '0')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.country_region_code_v1(p_country_code text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case upper(coalesce(p_country_code, ''))
    when 'NL' then 'EUROPE_WEST'
    when 'BE' then 'EUROPE_WEST'
    when 'FR' then 'EUROPE_WEST'
    when 'DE' then 'EUROPE_WEST'
    when 'LU' then 'EUROPE_WEST'
    when 'CH' then 'EUROPE_WEST'
    when 'AT' then 'EUROPE_CENTRAL'
    when 'CZ' then 'EUROPE_CENTRAL'
    when 'SK' then 'EUROPE_CENTRAL'
    when 'PL' then 'EUROPE_CENTRAL'
    when 'RS' then 'EUROPE_BALKANS'
    when 'ME' then 'EUROPE_BALKANS'
    when 'BA' then 'EUROPE_BALKANS'
    when 'HR' then 'EUROPE_BALKANS'
    when 'SI' then 'EUROPE_BALKANS'
    when 'MK' then 'EUROPE_BALKANS'
    when 'AL' then 'EUROPE_BALKANS'
    when 'RO' then 'EUROPE_EAST'
    when 'BG' then 'EUROPE_EAST'
    when 'HU' then 'EUROPE_EAST'
    when 'GB' then 'EUROPE_NORTH'
    when 'IE' then 'EUROPE_NORTH'
    when 'NO' then 'EUROPE_NORTH'
    when 'SE' then 'EUROPE_NORTH'
    when 'DK' then 'EUROPE_NORTH'
    when 'FI' then 'EUROPE_NORTH'
    when 'IT' then 'EUROPE_SOUTH'
    when 'ES' then 'EUROPE_SOUTH'
    when 'PT' then 'EUROPE_SOUTH'
    when 'GR' then 'EUROPE_SOUTH'

    when 'US' then 'NORTH_AMERICA'
    when 'CA' then 'NORTH_AMERICA'
    when 'MX' then 'NORTH_AMERICA'

    when 'BR' then 'SOUTH_AMERICA'
    when 'AR' then 'SOUTH_AMERICA'
    when 'UY' then 'SOUTH_AMERICA'
    when 'CO' then 'SOUTH_AMERICA'
    when 'CL' then 'SOUTH_AMERICA'
    when 'VE' then 'SOUTH_AMERICA'

    when 'MA' then 'AFRICA'
    when 'TN' then 'AFRICA'
    when 'EG' then 'AFRICA'
    when 'ZA' then 'AFRICA'
    when 'RW' then 'AFRICA'
    when 'GA' then 'AFRICA'

    when 'AE' then 'ASIA'
    when 'QA' then 'ASIA'
    when 'SA' then 'ASIA'
    when 'JP' then 'ASIA'
    when 'CN' then 'ASIA'
    when 'KR' then 'ASIA'
    when 'TW' then 'ASIA'
    when 'MY' then 'ASIA'
    when 'TH' then 'ASIA'
    when 'LK' then 'ASIA'

    when 'AU' then 'OCEANIA'
    when 'NZ' then 'OCEANIA'
    when 'FJ' then 'OCEANIA'
    when 'NC' then 'OCEANIA'
    when 'PF' then 'OCEANIA'

    else 'WORLD'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.count_available_club_riders_for_race_v1(p_club_id uuid, p_race_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select count(*)::integer
  from public.club_roster cr
  join public.races target_race on target_race.id=p_race_id
  where cr.club_id=p_club_id
    and public.roster_status_allows_race_selection_v1(cr.availability_status)
    and public.is_developing_rider_race_eligible_v1(cr.rider_id,p_club_id,target_race.start_date)
    and not exists(select 1 from public.race_participant_riders x where x.race_id=p_race_id and x.rider_id=cr.rider_id)
    and not exists(
      select 1 from public.race_participant_riders x join public.races r2 on r2.id=x.race_id
      where x.rider_id=cr.rider_id and x.race_id<>p_race_id
        and daterange(r2.start_date,coalesce(r2.end_date,r2.start_date)+1,'[)') && daterange(target_race.start_date,coalesce(target_race.end_date,target_race.start_date)+1,'[)')
    );
$function$
;

CREATE OR REPLACE FUNCTION public.roster_status_allows_race_selection_v1(p_status text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select lower(coalesce(p_status, 'available')) not in (
    'injured',
    'sick',
    'suspended',
    'retired',
    'released',
    'unavailable',
    'not_available',
    'inactive',
    'blocked'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.rider_overall_range_label_v1(p_overall integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_overall is null then null
    when p_overall < 40 then 'OVR <40'
    when p_overall < 60 then 'OVR 40-60'
    when p_overall < 80 then 'OVR 60-80'
    else 'OVR 80+'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.standardize_race_plan_bonus_preview_v1(p_bonus_preview jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
with source_groups as (
  select value as source_group
  from jsonb_array_elements(coalesce(p_bonus_preview->'staff', '[]'::jsonb))

  union all

  select value as source_group
  from jsonb_array_elements(coalesce(p_bonus_preview->'assets', '[]'::jsonb))

  union all

  select value as source_group
  from jsonb_array_elements(coalesce(p_bonus_preview->'policies', '[]'::jsonb))
),
effect_rows as (
  select
    source_group->>'source_type' as source_type,
    coalesce(
      source_group->>'source_label',
      source_group->>'source_key',
      'Bonus source'
    ) as source_name,
    effect->>'effect_key' as effect_key,
    coalesce(effect->>'label', effect->>'effect_key') as label,
    effect->>'value' as raw_value
  from source_groups
  cross join lateral jsonb_array_elements(
    coalesce(source_group->'effects', '[]'::jsonb)
  ) effect
),
mapped as (
  select
    *,
    case
      when effect_key in (
        'tour_fatigue_reduction_pct',
        'one_day_fatigue_reduction_pct',
        'short_tour_fatigue_reduction_pct',
        'long_tour_fatigue_reduction_pct',
        'race_fatigue_protection_pct',
        'race_fatigue_reduction_pct',
        'fatigue_floor_reduction',
        'travel_comfort_pct',
        'travel_morale_bonus',
        'hydration_support_pct',
        'hydration_support_bonus_pct',
        'heat_hydration_support_pct'
      ) then 'fatigue_control'

      when effect_key in (
        'recovery_duration',
        'daily_recovery_bonus',
        'post_stage_recovery_pct',
        'post_stage_recovery_bonus_pct',
        'post_stage_recovery_support',
        'recovery_comfort_bonus_pct',
        'recovery_bonus'
      ) then 'recovery_support'

      when effect_key in (
        'injury_illness_risk',
        'minor_injury_risk_reduction_pct',
        'medical_response_pct',
        'medical_response_bonus_pct'
      ) then 'health_protection'

      when effect_key in (
        'mechanical_time_loss_reduction_pct',
        'mechanical_response_pct',
        'mechanical_response_bonus_pct',
        'pre_stage_readiness_pct',
        'pre_stage_equipment_readiness_pct',
        'spare_bike_response_pct',
        'spare_bike_response_bonus_pct',
        'wheel_change_support_pct',
        'equipment_condition_loss_reduction_pct',
        'setup_quality_bonus',
        'mechanical_risk_reduction',
        'equipment_condition_loss',
        'repair_speed_pct',
        'repair_cost_reduction_pct',
        'mechanic_response_pct',
        'mechanic_response_during_races'
      ) then 'mechanical_reliability'

      when effect_key in (
        'race_support_coverage_pct',
        'race_support_quality_pct',
        'feeding_support_pct',
        'feeding_support_bonus_pct',
        'tactical_communication_pct',
        'tactical_support_pct',
        'incident_response_pct',
        'incident_support_pct',
        'crash_incident_response_pct',
        'race_day_logistics_pct',
        'logistics_bonus'
      ) then 'race_support'

      else null
    end as canonical_bonus_key,
    nullif(regexp_replace(coalesce(raw_value, ''), '[^0-9.\-]+', '', 'g'), '')::numeric as raw_numeric
  from effect_rows
  where coalesce(raw_value, '') <> ''
    and raw_value <> 'Not connected yet'
),
scored as (
  select
    *,
    abs(raw_numeric) as points
  from mapped
  where canonical_bonus_key is not null
    and raw_numeric is not null
),
totals as (
  select
    canonical_bonus_key,
    least(30, sum(points)) as total_points
  from scored
  group by canonical_bonus_key
),
details as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'source_type', source_type,
        'source_name', source_name,
        'effect_key', effect_key,
        'label', label,
        'raw_value', raw_value,
        'canonical_bonus_key', canonical_bonus_key,
        'points', points,
        'percent', points
      )
      order by canonical_bonus_key, source_name, label
    ),
    '[]'::jsonb
  ) as rows
  from scored
),
unmapped as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'source_type', source_type,
        'source_name', source_name,
        'effect_key', effect_key,
        'label', label,
        'raw_value', raw_value
      )
    ),
    '[]'::jsonb
  ) as rows
  from mapped
  where canonical_bonus_key is null
    and effect_key not in ('equipment_wear_protection_pct','field_equipment_recovery_pct')
)
select jsonb_build_object(
  'groups',
  jsonb_build_array(
    jsonb_build_object(
      'bonus_key', 'fatigue_control',
      'display_name', 'Fatigue Control',
      'description', 'Reduces race fatigue pressure, travel fatigue, and fatigue floor effects.',
      'points', coalesce((select total_points from totals where canonical_bonus_key = 'fatigue_control'), 0),
      'percent', coalesce((select total_points from totals where canonical_bonus_key = 'fatigue_control'), 0),
      'max_points', 30,
      'max_percent', 30
    ),
    jsonb_build_object(
      'bonus_key', 'recovery_support',
      'display_name', 'Recovery Support',
      'description', 'Improves daily recovery, recovery duration, and post-stage recovery.',
      'points', coalesce((select total_points from totals where canonical_bonus_key = 'recovery_support'), 0),
      'percent', coalesce((select total_points from totals where canonical_bonus_key = 'recovery_support'), 0),
      'max_points', 30,
      'max_percent', 30
    ),
    jsonb_build_object(
      'bonus_key', 'health_protection',
      'display_name', 'Health Protection',
      'description', 'Reduces injury risk, illness risk, and minor health problems.',
      'points', coalesce((select total_points from totals where canonical_bonus_key = 'health_protection'), 0),
      'percent', coalesce((select total_points from totals where canonical_bonus_key = 'health_protection'), 0),
      'max_points', 30,
      'max_percent', 30
    ),
    jsonb_build_object(
      'bonus_key', 'mechanical_reliability',
      'display_name', 'Mechanical Reliability',
      'description', 'Reduces mechanical problems, mechanical time loss, and equipment-related race issues.',
      'points', coalesce((select total_points from totals where canonical_bonus_key = 'mechanical_reliability'), 0),
      'percent', coalesce((select total_points from totals where canonical_bonus_key = 'mechanical_reliability'), 0),
      'max_points', 30,
      'max_percent', 30
    ),
    jsonb_build_object(
      'bonus_key', 'race_support',
      'display_name', 'Race Support',
      'description', 'Improves feeding, team-car coverage, race logistics, and tactical support.',
      'points', coalesce((select total_points from totals where canonical_bonus_key = 'race_support'), 0),
      'percent', coalesce((select total_points from totals where canonical_bonus_key = 'race_support'), 0),
      'max_points', 30,
      'max_percent', 30
    )
  ),
  'totals',
  jsonb_build_object(
    'fatigue_control', coalesce((select total_points from totals where canonical_bonus_key = 'fatigue_control'), 0),
    'recovery_support', coalesce((select total_points from totals where canonical_bonus_key = 'recovery_support'), 0),
    'health_protection', coalesce((select total_points from totals where canonical_bonus_key = 'health_protection'), 0),
    'mechanical_reliability', coalesce((select total_points from totals where canonical_bonus_key = 'mechanical_reliability'), 0),
    'race_support', coalesce((select total_points from totals where canonical_bonus_key = 'race_support'), 0)
  ),
  'details', (select rows from details),
  'unmapped_effects', (select rows from unmapped)
);
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_preparation_blocked_resources_v1(p_club_id uuid, p_race_id uuid, p_exclude_race_preparation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(resource_type text, resource_id uuid, asset_key text, asset_slot_key text, blocking_race_preparation_id uuid, blocking_race_id uuid, blocking_race_name text, blocking_start_date date, blocking_end_date date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with target_race as(
  select r.id,r.start_date::date start_date,
         coalesce(r.end_date::date,r.start_date::date) end_date
  from public.races r
  where r.id=p_race_id
),
overlapping_preps as(
  select rp.id race_preparation_id,rp.race_id,r.name race_name,
         r.start_date::date start_date,
         coalesce(r.end_date::date,r.start_date::date) end_date
  from public.race_preparations rp
  join public.races r on r.id=rp.race_id
  cross join target_race tr
  where rp.club_id=p_club_id
    and rp.id is distinct from p_exclude_race_preparation_id
    and rp.race_id<>p_race_id
    and(
      coalesce(rp.status,'') in ('submitted','locked','sent_to_engine')
      or coalesce(rp.startlist_status,'') in ('submitted','locked','sent_to_engine')
    )
    and r.start_date::date<=tr.end_date
    and coalesce(r.end_date::date,r.start_date::date)>=tr.start_date
)
select 'rider'::text,rpr.rider_id,null::text,null::text,
       op.race_preparation_id,op.race_id,op.race_name,op.start_date,op.end_date
from overlapping_preps op
join public.race_preparation_riders rpr on rpr.race_preparation_id=op.race_preparation_id

union all

select 'staff'::text,rps.staff_id,null::text,null::text,
       op.race_preparation_id,op.race_id,op.race_name,op.start_date,op.end_date
from overlapping_preps op
join public.race_preparation_staff rps on rps.race_preparation_id=op.race_preparation_id

union all

select 'asset'::text,rpa.asset_id,rpa.asset_key,rpa.asset_slot_key,
       op.race_preparation_id,op.race_id,op.race_name,op.start_date,op.end_date
from overlapping_preps op
join public.race_preparation_assets rpa on rpa.race_preparation_id=op.race_preparation_id

union all

select
  'rider'::text,nd.rider_id,null::text,null::text,null::uuid,
  case
    when nd.duty_type='qualification' then h.race_id
    when nd.duty_type='final' then e.final_race_id
    else e.final_race_id
  end,
  nd.label,
  coalesce(nd.duty_start_date,nd.duty_date),
  coalesce(nd.duty_end_date,nd.duty_date)
from public.national_championship_duties nd
join public.national_championship_editions e on e.id=nd.edition_id
left join public.national_championship_heats h on h.id=nd.heat_id
cross join target_race tr
where nd.status='confirmed'
  and coalesce(nd.duty_start_date,nd.duty_date)<=tr.end_date
  and coalesce(nd.duty_end_date,nd.duty_date)>=tr.start_date
  and coalesce(
        case
          when nd.duty_type='qualification' then h.race_id
          when nd.duty_type='final' then e.final_race_id
        end,
        '00000000-0000-0000-0000-000000000000'::uuid
      ) is distinct from p_race_id

union all

select
  'rider'::text,wd.rider_id,null::text,null::text,null::uuid,
  we.race_id,
  wd.label,
  wd.duty_date,
  wd.duty_date
from public.world_road_championship_duties wd
join public.world_road_championship_editions we on we.id=wd.edition_id
cross join target_race tr
where wd.status='confirmed'
  and wd.duty_date<=tr.end_date
  and wd.duty_date>=tr.start_date
  and coalesce(we.race_id,'00000000-0000-0000-0000-000000000000'::uuid)
      is distinct from p_race_id;
$function$
;

CREATE OR REPLACE FUNCTION public._race_supply_unit_max_uses(p_supply_key text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_supply_key
    when 'race_jersey_complete' then 10
    when 'rain_jackets' then 25
    else null
  end
$function$
;

CREATE OR REPLACE FUNCTION public._race_supply_unit_display_name(p_supply_key text, p_index integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_supply_key
    when 'race_jersey_complete' then 'Race Jersey Complete #' || p_index::text
    when 'rain_jackets' then 'Rain Jacket #' || p_index::text
    else 'Race Supply #' || p_index::text
  end
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_race_supply_unit_summary_v1(p_club_id uuid)
 RETURNS TABLE(supply_key text, display_name text, summary_quantity_available integer, total_units integer, usable_units integer, worn_out_units integer, discarded_units integer, avg_uses_remaining numeric, min_uses_remaining integer, max_uses_remaining integer, max_stage_uses integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with summary_rows as (
    select
      crs.supply_key,
      crs.display_name,
      crs.quantity_available
    from public.club_race_supplies crs
    where crs.club_id = p_club_id
      and crs.supply_key in ('race_jersey_complete', 'rain_jackets')
  ),
  unit_rows as (
    select
      u.supply_key,
      count(*)::integer as total_units,
      count(*) filter (
        where u.status in ('ready', 'assigned')
          and u.stage_uses_remaining > 0
      )::integer as usable_units,
      count(*) filter (where u.status = 'worn_out')::integer as worn_out_units,
      count(*) filter (where u.status = 'discarded')::integer as discarded_units,
      round(avg(u.stage_uses_remaining)::numeric, 2) as avg_uses_remaining,
      min(u.stage_uses_remaining)::integer as min_uses_remaining,
      max(u.stage_uses_remaining)::integer as max_uses_remaining,
      max(u.max_stage_uses)::integer as max_stage_uses
    from public.club_race_supply_units u
    where u.club_id = p_club_id
    group by u.supply_key
  )
  select
    s.supply_key,
    s.display_name,
    s.quantity_available as summary_quantity_available,
    coalesce(u.total_units, 0)::integer as total_units,
    coalesce(u.usable_units, 0)::integer as usable_units,
    coalesce(u.worn_out_units, 0)::integer as worn_out_units,
    coalesce(u.discarded_units, 0)::integer as discarded_units,
    coalesce(u.avg_uses_remaining, 0)::numeric as avg_uses_remaining,
    coalesce(u.min_uses_remaining, 0)::integer as min_uses_remaining,
    coalesce(u.max_uses_remaining, 0)::integer as max_uses_remaining,
    coalesce(u.max_stage_uses, public._race_supply_unit_max_uses(s.supply_key))::integer as max_stage_uses
  from summary_rows s
  left join unit_rows u
    on u.supply_key = s.supply_key
  order by s.supply_key;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_segments_v1(p_stage_id uuid)
 RETURNS TABLE(segment_order integer, km_start numeric, km_end numeric, distance_km numeric, elevation_start_m numeric, elevation_end_m numeric, elevation_change_m numeric, slope_percent numeric, terrain_type text, phase_number integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with profile as (
    select
      rspd.stage_id,
      rspd.distance_km as stage_distance_km,
      rspd.profile_points
    from public.race_stage_profile_details rspd
    where rspd.stage_id = p_stage_id
  ),
  points as (
    select
      row_number() over (
        order by (point_data->>'km')::numeric
      ) as point_order,
      (point_data->>'km')::numeric as km,
      coalesce(
        nullif(point_data->>'elevation_m', '')::numeric,
        nullif(point_data->>'elevation', '')::numeric,
        0
      ) as elevation_m,
      p.stage_distance_km
    from profile p
    cross join lateral jsonb_array_elements(p.profile_points) as point_data
    where jsonb_typeof(p.profile_points) = 'array'
  ),
  segments as (
    select
      p1.point_order as segment_order,
      p1.km as km_start,
      p2.km as km_end,
      greatest(p2.km - p1.km, 0) as distance_km,
      p1.elevation_m as elevation_start_m,
      p2.elevation_m as elevation_end_m,
      (p2.elevation_m - p1.elevation_m) as elevation_change_m,
      case
        when greatest(p2.km - p1.km, 0) = 0 then 0
        else round(
          ((p2.elevation_m - p1.elevation_m) / ((p2.km - p1.km) * 1000)) * 100,
          3
        )
      end as slope_percent,
      p1.stage_distance_km
    from points p1
    join points p2
      on p2.point_order = p1.point_order + 1
  )
  select
    s.segment_order,
    s.km_start,
    s.km_end,
    s.distance_km,
    s.elevation_start_m,
    s.elevation_end_m,
    s.elevation_change_m,
    s.slope_percent,

    case
      when s.slope_percent <= -5.0 then 'technical_descent'
      when s.slope_percent < -1.5 then 'descent'
      when s.slope_percent <= 0.8 then 'flat'
      when s.slope_percent <= 2.5 then 'false_flat'
      when s.slope_percent <= 5.5 then 'climb'
      else 'steep_climb'
    end as terrain_type,

    least(
      4,
      greatest(
        1,
        floor((s.km_start / nullif(s.stage_distance_km, 0)) * 4)::integer + 1
      )
    ) as phase_number
  from segments s
  where s.distance_km > 0
  order by s.segment_order;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_rider_inputs_v1(p_stage_id uuid)
 RETURNS TABLE(race_id uuid, stage_id uuid, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, stage_role text, stage_tactic text, sprint smallint, climbing smallint, time_trial smallint, flat smallint, endurance smallint, recovery smallint, resistance smallint, race_iq smallint, teamwork smallint, overall smallint, morale smallint, fatigue smallint, availability_status text, unavailable_until date, unavailable_reason text, start_stamina numeric, fatigue_before_stage numeric, preparation_id uuid, stage_plan_id uuid, race_preparation_rider_id uuid, race_stage_plan_rider_id uuid, rider_snapshot_json jsonb, availability_snapshot_json jsonb, bonus_snapshot_json jsonb, rider_stage_snapshot_json jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$

with stage_base as (
  select
    stage.id as stage_id,
    stage.race_id,
    stage.stage_number,
    coalesce((race.metadata ->> 'national_championship')::boolean, false)
      as is_national_championship,
    case
      when coalesce((race.metadata ->> 'national_championship')::boolean, false)
       and nullif(race.metadata ->> 'edition_id', '') is not null
      then (race.metadata ->> 'edition_id')::uuid
      else null::uuid
    end as national_championship_edition_id
  from public.race_stages stage
  join public.races race
    on race.id = stage.race_id
  where stage.id = p_stage_id
),

participants as (
  select
    participant.race_id,
    stage.stage_id,
    participant.rider_id,
    participant.team_id,
    case
      when stage.is_national_championship
        then entry.club_id_snapshot
      else participant.team_id
    end as source_club_id,
    participant.rider_name_snapshot,
    case
      when stage.is_national_championship
        then coalesce(participant.rider_name_snapshot, 'Individual rider')
      else participant.team_name_snapshot
    end as team_name_snapshot,
    participant.role_snapshot
  from stage_base stage
  join public.race_participant_riders participant
    on participant.race_id = stage.race_id
  left join public.national_championship_entries entry
    on stage.is_national_championship
   and entry.edition_id = stage.national_championship_edition_id
   and entry.rider_id = participant.rider_id
),

preparation_candidates as (
  select
    preparation.id as preparation_id,
    preparation.race_id,
    preparation.club_id as owner_club_id,

    case
      when nullif(trim(preparation.engine_payload_json ->> 'participating_club_id'), '') ~*
        (
          '^[0-9a-f]{8}-'
          || '[0-9a-f]{4}-'
          || '[0-9a-f]{4}-'
          || '[0-9a-f]{4}-'
          || '[0-9a-f]{12}$'
        )
      then (preparation.engine_payload_json ->> 'participating_club_id')::uuid
      else preparation.club_id
    end as participating_club_id,

    preparation.status,
    preparation.updated_at
  from stage_base stage
  join public.race_preparations preparation
    on preparation.race_id = stage.race_id
),

preparations as (
  select distinct on (
    candidate.race_id,
    candidate.participating_club_id
  )
    candidate.preparation_id,
    candidate.race_id,
    candidate.owner_club_id,
    candidate.participating_club_id
  from preparation_candidates candidate
  order by
    candidate.race_id,
    candidate.participating_club_id,
    case
      when candidate.status = 'submitted' then 0
      else 1
    end,
    candidate.updated_at desc,
    candidate.preparation_id desc
),

stage_plan_candidates as (
  select
    stage_plan.id as stage_plan_id,
    stage_plan.race_preparation_id,
    stage_plan.stage_id,
    stage_plan.stage_number,

    case
      when stage_plan.stage_id = stage.stage_id then 0
      else 1
    end as stage_match_priority

  from public.race_stage_plans stage_plan
  join stage_base stage
    on (
      stage_plan.stage_id = stage.stage_id
      or (
        stage_plan.stage_id is null
        and stage_plan.stage_number = stage.stage_number
      )
    )
),

stage_plans as (
  select distinct on (
    candidate.race_preparation_id
  )
    candidate.stage_plan_id,
    candidate.race_preparation_id,
    candidate.stage_id,
    candidate.stage_number
  from stage_plan_candidates candidate
  order by
    candidate.race_preparation_id,
    candidate.stage_match_priority,
    candidate.stage_plan_id desc
),

input_rows as (
  select
    participant.race_id,
    participant.stage_id,
    participant.rider_id,
    participant.team_id,

    coalesce(
      participant.rider_name_snapshot,
      rider.display_name,
      concat_ws(' ', rider.first_name, rider.last_name)
    ) as rider_name,

    coalesce(
      participant.team_name_snapshot,
      club.name
    ) as team_name,

    coalesce(
      nullif(nullif(stage_plan_rider.stage_role, ''), 'selected'),
      nullif(nullif(preparation_rider.race_role, ''), 'selected'),
      nullif(nullif(participant.role_snapshot, ''), 'selected'),
      nullif(rider.role::text, ''),
      'free_role'
    ) as role_code,

    coalesce(
      nullif(nullif(stage_plan_rider.stage_role, ''), 'selected'),
      'free_role'
    ) as stage_role,

    coalesce(
      nullif(stage_plan_rider.tactic, ''),
      'balanced'
    ) as stage_tactic,

    rider.sprint,
    rider.climbing,
    rider.time_trial,
    rider.flat,
    rider.endurance,
    rider.recovery,
    rider.resistance,
    rider.race_iq,
    rider.teamwork,
    rider.overall,
    rider.morale,
    rider.fatigue,
    rider.availability_status,
    rider.unavailable_until,
    rider.unavailable_reason,

    coalesce(race_condition.race_sharpness, 50)::numeric as race_sharpness,

    greatest(
      -5,
      least(
        5,
        (coalesce(race_condition.race_sharpness, 50)::numeric - 50) * 0.12
      )
    )::numeric as race_sharpness_start_stamina_modifier,

    preparation.preparation_id,
    stage_plan.stage_plan_id,
    preparation_rider.id as race_preparation_rider_id,
    stage_plan_rider.id as race_stage_plan_rider_id,

    coalesce(preparation_rider.rider_snapshot_json, '{}'::jsonb) as rider_snapshot_json,
    coalesce(preparation_rider.availability_snapshot_json, '{}'::jsonb) as availability_snapshot_json,
    coalesce(preparation_rider.bonus_snapshot_json, '{}'::jsonb) as bonus_snapshot_json,
    coalesce(stage_plan_rider.rider_stage_snapshot_json, '{}'::jsonb) as rider_stage_snapshot_json

  from participants participant

  join public.riders rider
    on rider.id = participant.rider_id

  left join public.clubs club
    on club.id = participant.source_club_id

  left join public.rider_race_condition race_condition
    on race_condition.rider_id = participant.rider_id

  left join preparations preparation
    on preparation.race_id = participant.race_id
   and preparation.participating_club_id = participant.source_club_id

  left join public.race_preparation_riders preparation_rider
    on preparation_rider.race_preparation_id = preparation.preparation_id
   and preparation_rider.rider_id = participant.rider_id

  left join stage_plans stage_plan
    on stage_plan.race_preparation_id = preparation.preparation_id

  left join public.race_stage_plan_riders stage_plan_rider
    on stage_plan_rider.race_stage_plan_id = stage_plan.stage_plan_id
   and stage_plan_rider.rider_id = participant.rider_id
)

select
  input_rows.race_id,
  input_rows.stage_id,
  input_rows.rider_id,
  input_rows.team_id,
  input_rows.rider_name,
  input_rows.team_name,
  input_rows.role_code,
  input_rows.stage_role,
  input_rows.stage_tactic,
  input_rows.sprint,
  input_rows.climbing,
  input_rows.time_trial,
  input_rows.flat,
  input_rows.endurance,
  input_rows.recovery,
  input_rows.resistance,
  input_rows.race_iq,
  input_rows.teamwork,
  input_rows.overall,
  input_rows.morale,
  input_rows.fatigue,
  input_rows.availability_status,
  input_rows.unavailable_until,
  input_rows.unavailable_reason,

  greatest(
    1,
    least(
      100,

      100
      - (coalesce(input_rows.fatigue, 0)::numeric * 0.45)

      + (
        greatest(
          coalesce(input_rows.recovery, 50) - 50,
          0
        )::numeric * 0.08
      )

      + case
          when input_rows.availability_status = 'fit' then 0
          when input_rows.availability_status = 'not_fully_fit' then -8
          when input_rows.availability_status = 'sick' then -18
          when input_rows.availability_status = 'injured' then -25
          else -5
        end

      + input_rows.race_sharpness_start_stamina_modifier
    )
  ) as start_stamina,

  coalesce(input_rows.fatigue, 0)::numeric as fatigue_before_stage,

  input_rows.preparation_id,
  input_rows.stage_plan_id,
  input_rows.race_preparation_rider_id,
  input_rows.race_stage_plan_rider_id,

  input_rows.rider_snapshot_json,
  input_rows.availability_snapshot_json,

  input_rows.bonus_snapshot_json
    || jsonb_build_object(
      'race_sharpness_engine_applied', true,
      'race_sharpness_engine_version', '2026-06-19-phase-3a',
      'race_sharpness', input_rows.race_sharpness,
      'race_sharpness_start_stamina_modifier',
        input_rows.race_sharpness_start_stamina_modifier
    ) as bonus_snapshot_json,

  input_rows.rider_stage_snapshot_json
    || jsonb_build_object(
      'race_sharpness_engine_applied', true,
      'race_sharpness_engine_version', '2026-06-19-phase-3a',
      'race_sharpness', input_rows.race_sharpness,
      'race_sharpness_start_stamina_modifier',
        input_rows.race_sharpness_start_stamina_modifier
    ) as rider_stage_snapshot_json

from input_rows

order by
  input_rows.team_id,
  input_rows.rider_name;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_command_effort_multiplier_v1(p_command text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case lower(coalesce(p_command,'follow_team_plan'))
    when 'attack' then 1.45 when 'climb_hard' then 1.35 when 'chase_breakaway' then 1.30
    when 'lead_out' then 1.28 when 'sprint' then 1.40 when 'join_breakaway' then 1.25
    when 'control_tempo' then 1.18 when 'stay_near_front' then 1.12 when 'protect_leader' then 1.12
    when 'avoid_risks' then 0.92 when 'conserve_energy' then 0.82 when 'ride_naturally' then 1.00
    when 'climber_support' then 1.12 when 'sprint_control' then 1.12 when 'gc_protection' then 1.08
    when 'breakaway_support' then 1.12 when 'balanced' then 1.00 when 'follow_team_plan' then 1.00
    else 1.00 end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_command_performance_modifier_v1(p_command text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case lower(coalesce(p_command,'follow_team_plan'))
    when 'attack' then 3.00 when 'climb_hard' then 2.00 when 'chase_breakaway' then 1.75
    when 'lead_out' then 1.50 when 'sprint' then 2.25 when 'join_breakaway' then 1.25
    when 'control_tempo' then 0.75 when 'stay_near_front' then 0.50 when 'protect_leader' then 0.50
    when 'avoid_risks' then -0.25 when 'conserve_energy' then -1.50 when 'ride_naturally' then 0.00
    when 'climber_support' then 0.75 when 'sprint_control' then 0.75 when 'gc_protection' then 0.50
    when 'breakaway_support' then 0.75 when 'balanced' then 0.00 when 'follow_team_plan' then 0.00
    else 0.00 end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_role_command_effort_multiplier_v1(p_command text, p_role_code text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with normalized as (
    select
      lower(trim(coalesce(p_command, 'follow_team_plan'))) as command_code,
      public.race_engine_normalize_stage_role_code_v1(p_role_code) as role_code
  )
  select
    public.race_engine_command_effort_multiplier_v1(command_code)
    *
    case
      -- Sprinters are efficient when sprinting, but pay more for climbing/attacking.
      when role_code = 'sprinter' and command_code = 'sprint' then 0.92
      when role_code = 'sprinter' and command_code in ('climb_hard', 'attack') then 1.08

      -- Climbers are efficient on climb_hard.
      when role_code = 'climber' and command_code = 'climb_hard' then 0.92
      when role_code = 'climber' and command_code = 'sprint' then 1.06

      -- Breakaway riders are efficient attacking/joining breakaways.
      when role_code = 'breakaway' and command_code in ('attack', 'join_breakaway') then 0.90
      when role_code = 'breakaway_chaser' and command_code = 'chase_breakaway' then 0.92

      -- Lead-out/sprint train are efficient in sprint support work.
      when role_code = 'lead_out' and command_code = 'lead_out' then 0.90
      when role_code = 'sprint_train' and command_code in ('lead_out', 'control_tempo') then 0.94

      -- Domestiques are efficient at control/protection/chasing, but still spend effort.
      when role_code in ('helper_domestique', 'mountain_domestique') and command_code in ('protect_leader', 'control_tempo', 'chase_breakaway') then 0.94
      when role_code = 'mountain_domestique' and command_code = 'climb_hard' then 0.95

      -- GC leader/protected riders conserve better.
      when role_code in ('team_leader_gc', 'protected') and command_code = 'conserve_energy' then 0.92
      when role_code in ('team_leader_gc', 'protected') and command_code = 'avoid_risks' then 0.94

      else 1.00
    end
  from normalized;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_phase_commands_v1(p_stage_id uuid)
 RETURNS TABLE(race_id uuid, stage_id uuid, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, team_plan text, phase_1_command text, phase_2_command text, phase_3_command text, phase_4_command text, avg_effort_multiplier numeric, avg_performance_modifier numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with stage_context as (
  select
    stage.id as stage_id,
    stage.race_id,
    stage.stage_number,
    greatest(coalesce(stage.distance_km, 0), 0)::numeric as distance_km,
    lower(coalesce(stage.terrain_type, 'flat')) as terrain_type,
    coalesce((race.metadata->>'national_championship')::boolean,false)
      as is_national_championship
  from public.race_stages stage
  join public.races race
    on race.id=stage.race_id
  where stage.id = p_stage_id
),

rider_inputs as (
  select *
  from public.race_engine_get_stage_rider_inputs_v1(p_stage_id)
),

commands as (
  select
    ri.race_id,
    ri.stage_id,
    ri.rider_id,
    ri.team_id,
    ri.rider_name,
    ri.team_name,
    ri.sprint,
    ri.climbing,
    ri.flat,
    ri.endurance,
    ri.resistance,
    ri.race_iq,
    ri.teamwork,
    ri.availability_status,

    public.race_engine_normalize_stage_role_code_v1(
      coalesce(
        rsp.rider_roles_json ->> ri.rider_id::text,
        ri.role_code,
        'free_role'
      )
    ) as role_code,

    coalesce(rsp.team_tactic_json ->> 'plan', 'balanced') as team_plan,

    coalesce(club.is_ai, false)
      or coalesce(club.inactive_ai_controlled, false) as is_ai_controlled,

    coalesce(
      nullif(
        case
          when coalesce(
            rsp.rider_individual_tactics_json
              #>> array[ri.rider_id::text, 'phase_1', 'command'],
            ''
          ) in ('', 'follow_team_plan')
          and coalesce(
            rsp.rider_individual_tactics_json
              #>> array[ri.rider_id::text, 'phase_1', 'ui_command'],
            ''
          ) not in ('', 'follow_team_plan')
          then rsp.rider_individual_tactics_json
            #>> array[ri.rider_id::text, 'phase_1', 'ui_command']
          else rsp.rider_individual_tactics_json
            #>> array[ri.rider_id::text, 'phase_1', 'command']
        end,
        ''
      ),
      nullif(
        rsp.team_tactic_json
          #>> array['individual_tactics_by_rider', ri.rider_id::text, 'phase_1', 'command'],
        ''
      ),
      'follow_team_plan'
    ) as raw_phase_1,

    coalesce(
      nullif(
        case
          when coalesce(
            rsp.rider_individual_tactics_json
              #>> array[ri.rider_id::text, 'phase_2', 'command'],
            ''
          ) in ('', 'follow_team_plan')
          and coalesce(
            rsp.rider_individual_tactics_json
              #>> array[ri.rider_id::text, 'phase_2', 'ui_command'],
            ''
          ) not in ('', 'follow_team_plan')
          then rsp.rider_individual_tactics_json
            #>> array[ri.rider_id::text, 'phase_2', 'ui_command']
          else rsp.rider_individual_tactics_json
            #>> array[ri.rider_id::text, 'phase_2', 'command']
        end,
        ''
      ),
      nullif(
        rsp.team_tactic_json
          #>> array['individual_tactics_by_rider', ri.rider_id::text, 'phase_2', 'command'],
        ''
      ),
      'follow_team_plan'
    ) as raw_phase_2,

    coalesce(
      nullif(
        case
          when coalesce(
            rsp.rider_individual_tactics_json
              #>> array[ri.rider_id::text, 'phase_3', 'command'],
            ''
          ) in ('', 'follow_team_plan')
          and coalesce(
            rsp.rider_individual_tactics_json
              #>> array[ri.rider_id::text, 'phase_3', 'ui_command'],
            ''
          ) not in ('', 'follow_team_plan')
          then rsp.rider_individual_tactics_json
            #>> array[ri.rider_id::text, 'phase_3', 'ui_command']
          else rsp.rider_individual_tactics_json
            #>> array[ri.rider_id::text, 'phase_3', 'command']
        end,
        ''
      ),
      nullif(
        rsp.team_tactic_json
          #>> array['individual_tactics_by_rider', ri.rider_id::text, 'phase_3', 'command'],
        ''
      ),
      'follow_team_plan'
    ) as raw_phase_3,

    coalesce(
      nullif(
        case
          when coalesce(
            rsp.rider_individual_tactics_json
              #>> array[ri.rider_id::text, 'phase_4', 'command'],
            ''
          ) in ('', 'follow_team_plan')
          and coalesce(
            rsp.rider_individual_tactics_json
              #>> array[ri.rider_id::text, 'phase_4', 'ui_command'],
            ''
          ) not in ('', 'follow_team_plan')
          then rsp.rider_individual_tactics_json
            #>> array[ri.rider_id::text, 'phase_4', 'ui_command']
          else rsp.rider_individual_tactics_json
            #>> array[ri.rider_id::text, 'phase_4', 'command']
        end,
        ''
      ),
      nullif(
        rsp.team_tactic_json
          #>> array['individual_tactics_by_rider', ri.rider_id::text, 'phase_4', 'command'],
        ''
      ),
      'follow_team_plan'
    ) as raw_phase_4

  from rider_inputs ri
  left join public.race_stage_plans rsp
    on rsp.id = ri.stage_plan_id
  left join public.clubs club
    on club.id = ri.team_id
),

normalized as (
  select
    c.*,

    case c.raw_phase_1
      when 'controlled' then 'control_tempo'
      when 'steady' then 'conserve_energy'
      else c.raw_phase_1
    end as normalized_phase_1,

    case c.raw_phase_2
      when 'controlled' then 'control_tempo'
      when 'steady' then 'conserve_energy'
      else c.raw_phase_2
    end as normalized_phase_2,

    case c.raw_phase_3
      when 'controlled' then 'control_tempo'
      when 'steady' then 'conserve_energy'
      else c.raw_phase_3
    end as normalized_phase_3,

    case c.raw_phase_4
      when 'controlled' then 'control_tempo'
      when 'steady' then 'conserve_energy'
      else c.raw_phase_4
    end as normalized_phase_4

  from commands c
),

pre_stage_standings as (
  select *
  from public.get_race_stage_pre_stage_standings_v1(p_stage_id)
),

classification_leaders as (
  select
    max(points) filter (where classification_type = 'points' and rank = 1) as points_leader_points,
    max(points) filter (where classification_type = 'mountain' and rank = 1) as mountain_leader_points
  from pre_stage_standings
),

team_classification_context as (
  select
    n.team_id,
    min(s.rank) filter (where s.classification_type = 'general') as best_gc_rank,
    min(s.gap_seconds) filter (where s.classification_type = 'general') as best_gc_gap_seconds,
    min(s.rank) filter (where s.classification_type = 'points') as best_points_rank,
    max(s.points) filter (where s.classification_type = 'points') as best_points,
    min(s.rank) filter (where s.classification_type = 'mountain') as best_mountain_rank,
    max(s.points) filter (where s.classification_type = 'mountain') as best_mountain_points
  from normalized n
  left join pre_stage_standings s
    on s.team_id = n.team_id
  group by n.team_id
),

point_phase_flags as (
  select
    bool_or(lower(point.point_type) = 'kom' and point.km_from_start <= stage.distance_km * 0.25) as kom_p1,
    bool_or(lower(point.point_type) = 'kom' and point.km_from_start > stage.distance_km * 0.25 and point.km_from_start <= stage.distance_km * 0.50) as kom_p2,
    bool_or(lower(point.point_type) = 'kom' and point.km_from_start > stage.distance_km * 0.50 and point.km_from_start <= stage.distance_km * 0.70) as kom_p3,
    bool_or(lower(point.point_type) = 'kom' and point.km_from_start > stage.distance_km * 0.70) as kom_p4,
    bool_or(lower(point.point_type) in ('intermediate_sprint', 'bonus_sprint') and point.km_from_start <= stage.distance_km * 0.25) as sprint_p1,
    bool_or(lower(point.point_type) in ('intermediate_sprint', 'bonus_sprint') and point.km_from_start > stage.distance_km * 0.25 and point.km_from_start <= stage.distance_km * 0.50) as sprint_p2,
    bool_or(lower(point.point_type) in ('intermediate_sprint', 'bonus_sprint') and point.km_from_start > stage.distance_km * 0.50 and point.km_from_start <= stage.distance_km * 0.70) as sprint_p3,
    bool_or(lower(point.point_type) in ('intermediate_sprint', 'bonus_sprint') and point.km_from_start > stage.distance_km * 0.70) as sprint_p4
  from stage_context stage
  left join public.race_stage_points point
    on point.stage_id = stage.stage_id
),

ai_attack_candidate_ranked as (
  select
    n.team_id,
    n.rider_id,
    row_number() over (
      partition by n.team_id
      order by
        case n.role_code
          when 'breakaway_rider' then 0
          when 'rouleur' then 1
          when 'free_role' then 2
          when 'climber' then 3
          when 'mountain_domestique' then 4
          when 'helper_domestique' then 5
          else 6
        end,
        case
          when stage.terrain_type in ('mountain', 'hilly', 'cobbled')
            then n.climbing * 0.35 + n.endurance * 0.25 + n.resistance * 0.20 + n.race_iq * 0.20
          else n.flat * 0.35 + n.endurance * 0.25 + n.resistance * 0.20 + n.race_iq * 0.20
        end desc,
        md5(p_stage_id::text || ':ai-attack-candidate:' || n.rider_id::text)
    ) as candidate_rank
  from normalized n
  cross join stage_context stage
  where n.is_ai_controlled
    and lower(coalesce(n.availability_status, 'fit')) not in ('injured', 'sick')
    and n.role_code not in ('team_leader_gc', 'sprinter', 'lead_out_rider', 'sprint_train_rider', 'protected_rider')
    and stage.terrain_type not in ('individual_time_trial', 'team_time_trial', 'prologue')
),

ai_attack_team_candidates as (
  select team_id, rider_id
  from ai_attack_candidate_ranked
  where candidate_rank = 1
),

ai_attack_phase_ranked as (
  select
    candidate.team_id,
    candidate.rider_id,
    row_number() over (order by md5(p_stage_id::text || ':phase1-attack-team:' || candidate.team_id::text)) as p1_rank,
    row_number() over (order by md5(p_stage_id::text || ':phase2-attack-team:' || candidate.team_id::text)) as p2_rank,
    row_number() over (order by md5(p_stage_id::text || ':phase3-attack-team:' || candidate.team_id::text)) as p3_rank,
    count(*) over () as team_count
  from ai_attack_team_candidates candidate
),

ai_attack_selected as (
  select
    ranked.team_id,
    ranked.rider_id,
    ranked.p1_rank <= least(6, greatest(1, ceil(ranked.team_count *
      case when stage.terrain_type in ('mountain', 'cobbled') then 0.50 when stage.terrain_type = 'hilly' then 0.45 else 0.35 end)::integer)) as p1,
    ranked.p2_rank <= least(5, greatest(1, ceil(ranked.team_count *
      case when stage.terrain_type in ('mountain', 'cobbled') then 0.40 when stage.terrain_type = 'hilly' then 0.35 else 0.28 end)::integer)) as p2,
    ranked.p3_rank <= least(4, greatest(1, ceil(ranked.team_count *
      case when stage.terrain_type in ('mountain', 'cobbled') then 0.36 when stage.terrain_type = 'hilly' then 0.32 else 0.24 end)::integer)) as p3
  from ai_attack_phase_ranked ranked
  cross join stage_context stage
),

ai_kom_candidate_ranked as (
  select
    n.team_id,
    n.rider_id,
    row_number() over (
      partition by n.team_id
      order by
        case n.role_code when 'climber' then 0 when 'mountain_domestique' then 1 when 'breakaway_rider' then 2 when 'free_role' then 3 else 4 end,
        (n.climbing * 0.55 + n.endurance * 0.20 + n.resistance * 0.15 + n.race_iq * 0.10) desc,
        md5(p_stage_id::text || ':ai-kom:' || n.rider_id::text)
    ) as candidate_rank
  from normalized n
  where n.is_ai_controlled
    and lower(coalesce(n.availability_status, 'fit')) not in ('injured', 'sick')
    and n.role_code not in ('team_leader_gc', 'sprinter', 'lead_out_rider', 'sprint_train_rider', 'protected_rider')
),

ai_sprint_candidate_ranked as (
  select
    n.team_id,
    n.rider_id,
    row_number() over (
      partition by n.team_id
      order by
        case n.role_code when 'sprinter' then 0 when 'lead_out_rider' then 1 when 'free_role' then 2 when 'rouleur' then 3 else 4 end,
        (n.sprint * 0.58 + n.flat * 0.16 + n.race_iq * 0.12 + n.endurance * 0.08 + n.resistance * 0.06) desc,
        md5(p_stage_id::text || ':ai-sprint:' || n.rider_id::text)
    ) as candidate_rank
  from normalized n
  where n.is_ai_controlled
    and lower(coalesce(n.availability_status, 'fit')) not in ('injured', 'sick')
    and n.role_code not in ('team_leader_gc', 'protected_rider')
),

ai_kom_eligible_teams as (
  select candidate.team_id, candidate.rider_id
  from ai_kom_candidate_ranked candidate
  join team_classification_context context on context.team_id = candidate.team_id
  cross join stage_context stage
  cross join classification_leaders leader
  where candidate.candidate_rank = 1
    and (
      stage.stage_number = 1
      or coalesce(context.best_mountain_rank, 999) <= 12
      or coalesce(context.best_mountain_points, 0) >= greatest(0, coalesce(leader.mountain_leader_points, 0) - 25)
    )
),

ai_sprint_eligible_teams as (
  select candidate.team_id, candidate.rider_id
  from ai_sprint_candidate_ranked candidate
  join team_classification_context context on context.team_id = candidate.team_id
  cross join stage_context stage
  cross join classification_leaders leader
  where candidate.candidate_rank = 1
    and (
      stage.stage_number = 1
      or coalesce(context.best_points_rank, 999) <= 12
      or coalesce(context.best_points, 0) >= greatest(0, coalesce(leader.points_leader_points, 0) - 40)
    )
),

ai_kom_team_ranked as (
  select
    candidate.*,
    row_number() over (order by md5(p_stage_id::text || ':ai-kom-team:' || candidate.team_id::text)) as team_rank,
    count(*) over () as team_count
  from ai_kom_eligible_teams candidate
),

ai_sprint_team_ranked as (
  select
    candidate.*,
    row_number() over (order by md5(p_stage_id::text || ':ai-sprint-team:' || candidate.team_id::text)) as team_rank,
    count(*) over () as team_count
  from ai_sprint_eligible_teams candidate
),

ai_kom_selected as (
  select team_id, rider_id
  from ai_kom_team_ranked
  where team_rank <= least(6, greatest(1, ceil(team_count * 0.45)::integer))
),

ai_sprint_selected as (
  select team_id, rider_id
  from ai_sprint_team_ranked
  where team_rank <= least(6, greatest(1, ceil(team_count * 0.45)::integer))
),

ai_chase_candidate_ranked as (
  select
    n.team_id,
    n.rider_id,
    row_number() over (
      partition by n.team_id
      order by
        case n.role_code when 'breakaway_chaser' then 0 when 'rouleur' then 1 when 'helper_domestique' then 2 when 'mountain_domestique' then 3 when 'lead_out_rider' then 4 else 5 end,
        (n.endurance * 0.30 + n.resistance * 0.25 + n.race_iq * 0.20 + n.flat * 0.15 + n.teamwork * 0.10) desc,
        md5(p_stage_id::text || ':ai-chase-worker:' || n.rider_id::text)
    ) as candidate_rank
  from normalized n
  where n.is_ai_controlled
    and lower(coalesce(n.availability_status, 'fit')) not in ('injured', 'sick')
    and n.role_code not in ('team_leader_gc', 'sprinter', 'protected_rider')
),

ai_chase_interested_teams as (
  select distinct n.team_id
  from normalized n
  join team_classification_context context on context.team_id = n.team_id
  left join ai_kom_selected kom on kom.team_id = n.team_id
  left join ai_sprint_selected sprint on sprint.team_id = n.team_id
  where n.is_ai_controlled
    and (
      kom.team_id is not null
      or sprint.team_id is not null
      or coalesce(context.best_gc_rank, 999) <= 10
      or coalesce(context.best_gc_gap_seconds, 999999) <= 90
    )
),

ai_chase_team_ranked as (
  select
    interested.team_id,
    worker.rider_id,
    row_number() over (order by md5(p_stage_id::text || ':phase2-chase-team:' || interested.team_id::text)) as p2_rank,
    row_number() over (order by md5(p_stage_id::text || ':phase3-chase-team:' || interested.team_id::text)) as p3_rank,
    count(*) over () as team_count
  from ai_chase_interested_teams interested
  join ai_chase_candidate_ranked worker
    on worker.team_id = interested.team_id
   and worker.candidate_rank = 1
),

ai_chase_selected as (
  select
    ranked.team_id,
    ranked.rider_id,
    ranked.p2_rank <= least(8, greatest(1, ceil(ranked.team_count * 0.65)::integer)) as p2,
    ranked.p3_rank <= least(8, greatest(1, ceil(ranked.team_count * 0.70)::integer)) as p3
  from ai_chase_team_ranked ranked
),

ai_enriched as (
  select
    n.*,
    coalesce(attack.p1, false) and attack.rider_id = n.rider_id as ai_attack_p1,
    coalesce(attack.p2, false) and attack.rider_id = n.rider_id as ai_attack_p2,
    coalesce(attack.p3, false) and attack.rider_id = n.rider_id as ai_attack_p3,
    kom.rider_id = n.rider_id as ai_kom_selected,
    sprint.rider_id = n.rider_id as ai_sprint_selected,
    coalesce(chase.p2, false) and chase.rider_id = n.rider_id as ai_chase_p2,
    coalesce(chase.p3, false) and chase.rider_id = n.rider_id as ai_chase_p3,
    coalesce(flags.kom_p1, false) as kom_p1,
    coalesce(flags.kom_p2, false) as kom_p2,
    coalesce(flags.kom_p3, false) as kom_p3,
    coalesce(flags.kom_p4, false) as kom_p4,
    coalesce(flags.sprint_p1, false) as sprint_p1,
    coalesce(flags.sprint_p2, false) as sprint_p2,
    coalesce(flags.sprint_p3, false) as sprint_p3,
    coalesce(flags.sprint_p4, false) as sprint_p4
  from normalized n
  left join ai_attack_selected attack on attack.team_id = n.team_id
  left join ai_kom_selected kom on kom.team_id = n.team_id
  left join ai_sprint_selected sprint on sprint.team_id = n.team_id
  left join ai_chase_selected chase on chase.team_id = n.team_id
  cross join point_phase_flags flags
),

resolved as (
  select
    n.*,
    case
      when n.normalized_phase_1 <> 'follow_team_plan' then n.normalized_phase_1
      when stage.is_national_championship then 'ride_naturally'
      when n.is_ai_controlled and n.ai_attack_p1 then 'attack'
      when n.is_ai_controlled and n.ai_kom_selected and n.kom_p1 then 'fight_kom_points'
      when n.is_ai_controlled and n.ai_sprint_selected and n.sprint_p1 then 'fight_sprint_points'
      else n.team_plan
    end as phase_1_command,
    case
      when n.normalized_phase_2 <> 'follow_team_plan' then n.normalized_phase_2
      when stage.is_national_championship then 'ride_naturally'
      when n.is_ai_controlled and n.ai_kom_selected and n.kom_p2 then 'fight_kom_points'
      when n.is_ai_controlled and n.ai_sprint_selected and n.sprint_p2 then 'fight_sprint_points'
      when n.is_ai_controlled and n.ai_attack_p2 then 'attack'
      when n.is_ai_controlled and n.ai_chase_p2 then 'chase_breakaway'
      else n.team_plan
    end as phase_2_command,
    case
      when n.normalized_phase_3 <> 'follow_team_plan' then n.normalized_phase_3
      when stage.is_national_championship then 'ride_naturally'
      when n.is_ai_controlled and n.ai_kom_selected and n.kom_p3 then 'fight_kom_points'
      when n.is_ai_controlled and n.ai_sprint_selected and n.sprint_p3 then 'fight_sprint_points'
      when n.is_ai_controlled and n.ai_attack_p3 then 'attack'
      when n.is_ai_controlled and n.ai_chase_p3 then 'chase_breakaway'
      else n.team_plan
    end as phase_3_command,
    case
      when n.normalized_phase_4 <> 'follow_team_plan' then n.normalized_phase_4
      when stage.is_national_championship then 'ride_naturally'
      when n.is_ai_controlled and n.ai_kom_selected and n.kom_p4 then 'fight_kom_points'
      when n.is_ai_controlled and n.ai_sprint_selected and n.sprint_p4 then 'fight_sprint_points'
      else n.team_plan
    end as phase_4_command
  from ai_enriched n
  cross join stage_context stage
)

select
  r.race_id,
  r.stage_id,
  r.rider_id,
  r.team_id,
  r.rider_name,
  r.team_name,
  r.role_code,
  r.team_plan,
  r.phase_1_command,
  r.phase_2_command,
  r.phase_3_command,
  r.phase_4_command,

  (
    public.race_engine_role_command_effort_multiplier_v1(r.phase_1_command, r.role_code)
    + public.race_engine_role_command_effort_multiplier_v1(r.phase_2_command, r.role_code)
    + public.race_engine_role_command_effort_multiplier_v1(r.phase_3_command, r.role_code)
    + public.race_engine_role_command_effort_multiplier_v1(r.phase_4_command, r.role_code)
  ) / 4.0 as avg_effort_multiplier,

  (
    public.race_engine_command_performance_modifier_v1(r.phase_1_command)
    + public.race_engine_command_performance_modifier_v1(r.phase_2_command)
    + public.race_engine_command_performance_modifier_v1(r.phase_3_command)
    + public.race_engine_command_performance_modifier_v1(r.phase_4_command)
  ) / 4.0 as avg_performance_modifier

from resolved r
order by r.team_name, r.rider_name;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_phase_command_effects_v1(p_stage_id uuid)
 RETURNS TABLE(race_id uuid, stage_id uuid, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, weighted_effort_multiplier numeric, weighted_performance_modifier numeric, phase_1_command text, phase_2_command text, phase_3_command text, phase_4_command text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with phase_commands as (
    select *
    from public.race_engine_get_stage_phase_commands_v1(p_stage_id)
  ),
  segments as (
    select
      phase_number,
      sum(
        case terrain_type
          when 'flat' then 2
          when 'false_flat' then 3
          when 'climb' then 5
          when 'steep_climb' then 8
          when 'descent' then 1.2
          when 'technical_descent' then 1.6
          else 2
        end * (distance_km / 10.0)
      ) as phase_cost_weight
    from public.race_engine_get_stage_segments_v1(p_stage_id)
    group by phase_number
  ),
  totals as (
    select sum(phase_cost_weight) as total_cost_weight
    from segments
  ),
  expanded as (
    select
      pc.*,
      s.phase_number,
      s.phase_cost_weight,
      t.total_cost_weight,
      case s.phase_number
        when 1 then pc.phase_1_command
        when 2 then pc.phase_2_command
        when 3 then pc.phase_3_command
        when 4 then pc.phase_4_command
      end as command_for_phase
    from phase_commands pc
    cross join totals t
    join segments s on true
  )
  select
    race_id,
    stage_id,
    rider_id,
    team_id,
    rider_name,
    team_name,
    role_code,

    sum(
      public.race_engine_role_command_effort_multiplier_v1(command_for_phase, role_code)
      * (phase_cost_weight / nullif(total_cost_weight, 0))
    )::numeric as weighted_effort_multiplier,

    sum(
      public.race_engine_command_performance_modifier_v1(command_for_phase)
      * (phase_cost_weight / nullif(total_cost_weight, 0))
    )::numeric as weighted_performance_modifier,

    max(phase_1_command) as phase_1_command,
    max(phase_2_command) as phase_2_command,
    max(phase_3_command) as phase_3_command,
    max(phase_4_command) as phase_4_command
  from expanded
  group by
    race_id,
    stage_id,
    rider_id,
    team_id,
    rider_name,
    team_name,
    role_code
  order by team_name, rider_name;
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_stage_point_results_v1(p_stage_id uuid)
 RETURNS TABLE(point_id uuid, point_type text, point_name text, km_from_start numeric, kom_category text, sort_order integer, rank integer, rider_id uuid, team_id uuid, rider_name_snapshot text, team_name_snapshot text, points_awarded integer, bonus_seconds_awarded integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    stage_point.id as point_id,
    upper(stage_point.point_type) as point_type,
    stage_point.name as point_name,
    stage_point.km_from_start,
    stage_point.kom_category,
    stage_point.sort_order,

    point_result.rank::integer,
    point_result.rider_id,
    point_result.team_id,
    point_result.rider_name_snapshot,
    point_result.team_name_snapshot,
    point_result.points_awarded::integer,
    point_result.bonus_seconds_awarded::integer

  from public.race_stage_points stage_point

  left join public.race_stage_point_results point_result
    on point_result.point_id = stage_point.id
   and point_result.stage_id = stage_point.stage_id

  where stage_point.stage_id = p_stage_id
    and upper(stage_point.point_type) <> 'START'

  order by
    stage_point.sort_order,
    point_result.rank nulls last;
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_stage_live_state_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

  with lifecycle as (
    select
      state.stage_id,
      state.simulation_run_id,
      state.last_status,
      state.last_error,
      nullif(
        state.details ->> 'replay_opened_at_real',
        ''
      )::timestamptz as replay_opened_at_real,
      nullif(
        state.details ->> 'replay_closes_at_real',
        ''
      )::timestamptz as replay_closes_at_real
    from public.race_stage_automation_state state
    where state.stage_id = p_stage_id
    limit 1
  ),

  latest_run as (
    select
      run.id as simulation_run_id,
      run.status as run_status,
      run.created_at
    from public.race_stage_simulation_runs run
    where run.stage_id = p_stage_id
      and run.engine_version = 'race_engine_ts_v1'
      and run.simulation_mode = 'deterministic_road_race_v1'
      and run.status in ('running','completed')
    order by run.created_at desc
    limit 1
  ),

  resolved as (
    select
      coalesce(
        lifecycle.simulation_run_id,
        latest_run.simulation_run_id
      ) as simulation_run_id,

      lifecycle.last_status,
      lifecycle.last_error,
      latest_run.run_status,

      coalesce(
        lifecycle.replay_opened_at_real,
        latest_run.created_at
      ) as live_started_at,

      coalesce(
        lifecycle.replay_closes_at_real,
        latest_run.created_at + interval '15 minutes'
      ) as live_ends_at

    from (select 1) seed
    left join lifecycle on true
    left join latest_run on true
  )

  select jsonb_build_object(

    'stage_id',
    p_stage_id,

    'has_simulation',
    resolved.simulation_run_id is not null,

    'simulation_run_id',
    resolved.simulation_run_id,

    'live_started_at',
    resolved.live_started_at,

    'live_ends_at',
    resolved.live_ends_at,

    'is_live',
    case
      when resolved.simulation_run_id is null then false
      when resolved.run_status = 'completed' then false
      when resolved.last_status = 'published' then false
      when resolved.last_status = 'replay_live'
           and resolved.live_ends_at is not null
        then now() < resolved.live_ends_at
      else false
    end,

    'results_visible',
    case
      when resolved.simulation_run_id is null then false
      when resolved.run_status = 'completed' then true
      when resolved.last_status = 'published' then true
      when resolved.live_ends_at is not null
        then now() >= resolved.live_ends_at
      else false
    end,

    'speed_locked',
    case
      when resolved.simulation_run_id is null then false
      when resolved.run_status = 'completed' then false
      when resolved.last_status = 'published' then false
      when resolved.last_status = 'replay_live'
           and resolved.live_ends_at is not null
        then now() < resolved.live_ends_at
      else false
    end,

    'publication_pending',
    case
      when resolved.simulation_run_id is null then false
      when resolved.run_status = 'completed' then false
      when resolved.last_status = 'published' then false
      when resolved.live_ends_at is not null
           and now() >= resolved.live_ends_at
        then true
      else false
    end,

    'publication_error',
    resolved.last_error,

    'progress',
    case
      when resolved.simulation_run_id is null then 0
      when resolved.run_status = 'completed' then 1
      when resolved.last_status = 'published' then 1
      when resolved.live_ends_at is not null
           and now() >= resolved.live_ends_at
        then 1
      when resolved.last_status = 'replay_live'
           and resolved.live_started_at is not null
           and resolved.live_ends_at is not null
      then
        greatest(
          0,
          least(
            1,
            extract(
              epoch from (
                now() - resolved.live_started_at
              )
            )
            /
            greatest(
              1,
              extract(
                epoch from (
                  resolved.live_ends_at
                  - resolved.live_started_at
                )
              )
            )
          )
        )
      else 0
    end

  )
  from resolved;

$function$
;

CREATE OR REPLACE FUNCTION public.get_race_stage_pre_stage_leaders_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    coalesce(
      (
        select
          simulation_run.input_snapshot_json
            -> 'pre_stage_leaders'
        from public.race_stage_simulation_runs
          simulation_run
        where simulation_run.stage_id =
          p_stage_id
          and simulation_run.status in (
            'running',
            'completed'
          )
        order by
          simulation_run.started_at desc
            nulls last,
          simulation_run.id
        limit 1
      ),

      jsonb_build_object(
        'has_snapshot',
          false,

        'stage_id',
          p_stage_id,

        'has_established_leaders',
          false
      )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_time_trial_rider_inputs_v1_legacy_before_tt_tac(p_stage_id uuid)
 RETURNS TABLE(race_id uuid, stage_id uuid, stage_format text, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, stage_role text, stage_tactic text, time_trial smallint, flat smallint, climbing smallint, endurance smallint, resistance smallint, race_iq smallint, teamwork smallint, morale smallint, fatigue smallint, start_stamina numeric, fatigue_before_stage numeric, preparation_id uuid, stage_plan_id uuid, race_preparation_rider_id uuid, race_stage_plan_rider_id uuid, equipment_setup_id uuid, equipment_setup_source text, equipment_bonus_json jsonb, equipment_time_trial_bonus_pct numeric, equipment_fatigue_reduction_pct numeric, equipment_condition_factor numeric, race_support_bonus_pct numeric, fatigue_control_bonus_pct numeric, mechanical_reliability_bonus_pct numeric, command_effort_multiplier numeric, command_performance_modifier numeric, route_time_trial_weight numeric, route_flat_weight numeric, route_climbing_weight numeric, route_endurance_weight numeric, route_resistance_weight numeric, route_race_iq_weight numeric, route_teamwork_weight numeric, raw_time_trial_skill_score numeric, adjusted_time_trial_score numeric, predicted_time_seconds numeric, input_metadata_json jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$

with stage_base as (
  select
    stage.id as stage_id,
    stage.race_id,
    stage.stage_number,
    stage.stage_format,
    stage.distance_km,
    stage.terrain_type,
    stage.profile_type,
    coalesce(
      stage.elevation_gain_m,
      0
    ) as elevation_gain_m

  from public.race_stages stage

  where stage.id = p_stage_id
),

stage_profile as (
  select
    profile.stage_id,
    coalesce(
      profile.terrain_split,
      '{}'::jsonb
    ) as terrain_split,
    profile.route_label,
    profile.stage_summary

  from public.race_stage_profile_details profile

  where profile.stage_id = p_stage_id

  limit 1
),

rules as (
  select
    rule.stage_id,
    rule.start_order_mode,
    rule.start_interval_seconds,
    rule.counting_rider_number,
    rule.equipment_required,
    rule.replay_duration_seconds,
    rule.dropped_rider_time_mode,
    rule.rules_json

  from public.race_stage_time_trial_rules rule

  where rule.stage_id = p_stage_id
),

base_inputs as (
  select *
  from public.race_engine_get_stage_rider_inputs_v1(
    p_stage_id
  )
),

command_inputs as (
  select *
  from public.race_engine_get_stage_phase_command_effects_v1(
    p_stage_id
  )
),

preparation_context as (
  select
    preparation.id as preparation_id,
    preparation.race_id,
    preparation.club_id,
    preparation.default_equipment_setup_id,
    preparation.validation_snapshot_json,
    preparation.engine_payload_json

  from public.race_preparations preparation
),

rider_plan_context as (
  select
    rider_input.*,

    stage.stage_format,
    stage.distance_km,
    stage.terrain_type,
    stage.profile_type,
    stage.elevation_gain_m,

    coalesce(
      profile.terrain_split,
      '{}'::jsonb
    ) as terrain_split,

    profile.route_label,
    profile.stage_summary,

    rule.start_order_mode,
    rule.start_interval_seconds,
    rule.counting_rider_number,
    rule.equipment_required,
    rule.replay_duration_seconds,
    rule.dropped_rider_time_mode,

    preparation.default_equipment_setup_id
      as team_default_equipment_setup_id,

    preparation.validation_snapshot_json,
    preparation.engine_payload_json,

    preparation_rider.default_equipment_setup_id
      as rider_default_equipment_setup_id,

    stage_plan_rider.equipment_setup_id
      as stage_rider_equipment_setup_id,

    coalesce(
      command.weighted_effort_multiplier,
      1
    ) as command_effort_multiplier,

    coalesce(
      command.weighted_performance_modifier,
      0
    ) as command_performance_modifier

  from base_inputs rider_input

  join stage_base stage
    on stage.stage_id =
      rider_input.stage_id

  left join stage_profile profile
    on profile.stage_id =
      rider_input.stage_id

  left join rules rule
    on rule.stage_id =
      rider_input.stage_id

  left join preparation_context preparation
    on preparation.preparation_id =
      rider_input.preparation_id

  left join public.race_preparation_riders
    preparation_rider
    on preparation_rider.id =
      rider_input.race_preparation_rider_id

  left join public.race_stage_plan_riders
    stage_plan_rider
    on stage_plan_rider.id =
      rider_input.race_stage_plan_rider_id

  left join command_inputs command
    on command.stage_id =
      rider_input.stage_id

   and command.rider_id =
      rider_input.rider_id
),

selected_setup as (
  select
    context.*,

    coalesce(
      context.stage_rider_equipment_setup_id,
      context.rider_default_equipment_setup_id,
      context.team_default_equipment_setup_id
    ) as selected_equipment_setup_id,

    case
      when context.stage_rider_equipment_setup_id
        is not null
      then 'stage_rider_setup'

      when context.rider_default_equipment_setup_id
        is not null
      then 'race_rider_setup'

      when context.team_default_equipment_setup_id
        is not null
      then 'race_team_default_setup'

      else 'none'
    end as selected_equipment_setup_source

  from rider_plan_context context
),

setup_items as (
  select
    selected.*,

    setup.frame_catalog_item_id,
    setup.wheelset_catalog_item_id,
    setup.tires_catalog_item_id,
    setup.groupset_catalog_item_id,
    setup.helmet_catalog_item_id,
    setup.shoes_catalog_item_id

  from selected_setup selected

  left join public.club_equipment_setup_presets setup
    on setup.id =
      selected.selected_equipment_setup_id
),

equipment_preview as (
  select
    setup_items.*,

    public.equipment_calculate_catalog_setup_bonus_preview(
      setup_items.frame_catalog_item_id,
      setup_items.wheelset_catalog_item_id,
      setup_items.tires_catalog_item_id,
      setup_items.groupset_catalog_item_id,
      setup_items.helmet_catalog_item_id,
      setup_items.shoes_catalog_item_id
    ) as equipment_bonus_json

  from setup_items
),

equipment_condition as (
  select
    preview.rider_id,
    preview.stage_id,

    case
      when preview.selected_equipment_setup_id is null
      then 1.00::numeric

      else coalesce(
        round(
          avg(
            greatest(
              0,
              least(
                inventory.condition_percent,
                100
              )
            )
          ) / 100.0,
          4
        ),
        1.00::numeric
      )
    end as equipment_condition_factor

  from equipment_preview preview

  left join lateral (
    select unnest(
      array[
        preview.frame_catalog_item_id,
        preview.wheelset_catalog_item_id,
        preview.tires_catalog_item_id,
        preview.groupset_catalog_item_id,
        preview.helmet_catalog_item_id,
        preview.shoes_catalog_item_id
      ]
    ) as catalog_item_id
  ) selected_catalog
    on selected_catalog.catalog_item_id
      is not null

  left join public.club_equipment_inventory inventory
    on inventory.club_id =
      preview.team_id

   and inventory.catalog_item_id =
      selected_catalog.catalog_item_id

   and inventory.status in (
      'ready',
      'available',
      'assigned'
   )

   and inventory.sold_game_date is null

   and inventory.discarded_game_date is null

  group by
    preview.rider_id,
    preview.stage_id,
    preview.selected_equipment_setup_id
),

bonus_totals as (
  select
    preview.*,

    coalesce(
      preview.validation_snapshot_json
        -> 'standardized_bonus_totals',

      preview.validation_snapshot_json
        -> 'submitted_quote'
        -> 'standardized_bonus_totals',

      preview.validation_snapshot_json
        -> 'quote'
        -> 'standardized_bonus_totals',

      '{}'::jsonb
    ) as standardized_bonus_totals

  from equipment_preview preview
),

route_weights as (
  select
    bonus.*,

    coalesce(
      (
        bonus.terrain_split
          ->> 'flat'
      )::numeric,
      case
        when bonus.terrain_type = 'flat'
          then 70
        else 40
      end
    ) as flat_pct,

    coalesce(
      (
        bonus.terrain_split
          ->> 'hilly'
      )::numeric,
      case
        when bonus.terrain_type = 'hilly'
          then 40
        else 15
      end
    ) as hilly_pct,

    coalesce(
      (
        bonus.terrain_split
          ->> 'mountain'
      )::numeric,
      case
        when bonus.terrain_type = 'mountain'
          then 40
        else 0
      end
    ) as mountain_pct

  from bonus_totals bonus
),

scored as (
  select
    route.*,

    /*
     * Route-specific skill weights.
     *
     * Prologues are shorter and more explosive.
     * Longer ITTs reward endurance and resistance more.
     * Hilly/mountain TT routes add climbing weight.
     */
    case
      when route.stage_format = 'prologue'
        then 0.38::numeric

      when route.distance_km >= 40
        then 0.44::numeric

      else 0.42::numeric
    end as route_time_trial_weight,

    case
      when route.flat_pct >= 60
        then 0.16::numeric
      else 0.12::numeric
    end as route_flat_weight,

    case
      when route.mountain_pct >= 20
        then 0.12::numeric

      when route.hilly_pct >= 30
        then 0.08::numeric

      else 0.04::numeric
    end as route_climbing_weight,

    case
      when route.stage_format = 'prologue'
        then 0.10::numeric

      when route.distance_km >= 40
        then 0.18::numeric

      else 0.15::numeric
    end as route_endurance_weight,

    case
      when route.stage_format = 'prologue'
        then 0.10::numeric

      when route.distance_km >= 40
        then 0.12::numeric

      else 0.11::numeric
    end as route_resistance_weight,

    case
      when route.stage_format = 'prologue'
        then 0.16::numeric
      else 0.07::numeric
    end as route_race_iq_weight,

    case
      when route.stage_format in (
        'team_time_trial',
        'pair_time_trial'
      )
        then 0.10::numeric
      else 0.02::numeric
    end as route_teamwork_weight

  from route_weights route
)

select
  scored.race_id,
  scored.stage_id,
  scored.stage_format,
  scored.rider_id,
  scored.team_id,
  scored.rider_name,
  scored.team_name,

  scored.role_code,
  scored.stage_role,
  scored.stage_tactic,

  scored.time_trial,
  scored.flat,
  scored.climbing,
  scored.endurance,
  scored.resistance,
  scored.race_iq,
  scored.teamwork,
  scored.morale,
  scored.fatigue,

  scored.start_stamina,
  scored.fatigue_before_stage,

  scored.preparation_id,
  scored.stage_plan_id,
  scored.race_preparation_rider_id,
  scored.race_stage_plan_rider_id,

  scored.selected_equipment_setup_id
    as equipment_setup_id,

  scored.selected_equipment_setup_source
    as equipment_setup_source,

  coalesce(
    scored.equipment_bonus_json,
    '{}'::jsonb
  ) as equipment_bonus_json,

  round(
    coalesce(
      (
        scored.equipment_bonus_json
          -> 'weighted_bonuses'
          ->> 'time_trial_bonus_pct'
      )::numeric,
      0
    )
    * condition.equipment_condition_factor,
    2
  ) as equipment_time_trial_bonus_pct,

  round(
    coalesce(
      (
        scored.equipment_bonus_json
          -> 'weighted_bonuses'
          ->> 'fatigue_reduction_pct'
      )::numeric,
      0
    )
    * condition.equipment_condition_factor,
    2
  ) as equipment_fatigue_reduction_pct,

  condition.equipment_condition_factor,

  round(
    least(
      coalesce(
        (
          scored.standardized_bonus_totals
            ->> 'race_support'
        )::numeric,
        0
      ),
      8
    ),
    2
  ) as race_support_bonus_pct,

  round(
    least(
      coalesce(
        (
          scored.standardized_bonus_totals
            ->> 'fatigue_control'
        )::numeric,
        0
      ),
      10
    ),
    2
  ) as fatigue_control_bonus_pct,

  round(
    least(
      coalesce(
        (
          scored.standardized_bonus_totals
            ->> 'mechanical_reliability'
        )::numeric,
        0
      ),
      8
    ),
    2
  ) as mechanical_reliability_bonus_pct,

  scored.command_effort_multiplier,
  scored.command_performance_modifier,

  scored.route_time_trial_weight,
  scored.route_flat_weight,
  scored.route_climbing_weight,
  scored.route_endurance_weight,
  scored.route_resistance_weight,
  scored.route_race_iq_weight,
  scored.route_teamwork_weight,

  round(
    (
      scored.time_trial::numeric
        * scored.route_time_trial_weight

      + scored.flat::numeric
        * scored.route_flat_weight

      + scored.climbing::numeric
        * scored.route_climbing_weight

      + scored.endurance::numeric
        * scored.route_endurance_weight

      + scored.resistance::numeric
        * scored.route_resistance_weight

      + scored.race_iq::numeric
        * scored.route_race_iq_weight

      + scored.teamwork::numeric
        * scored.route_teamwork_weight
    )
    /
    nullif(
      scored.route_time_trial_weight
      + scored.route_flat_weight
      + scored.route_climbing_weight
      + scored.route_endurance_weight
      + scored.route_resistance_weight
      + scored.route_race_iq_weight
      + scored.route_teamwork_weight,
      0
    ),
    2
  ) as raw_time_trial_skill_score,

  round(
    greatest(
      1,
      least(
        100,

        (
          (
            scored.time_trial::numeric
              * scored.route_time_trial_weight

            + scored.flat::numeric
              * scored.route_flat_weight

            + scored.climbing::numeric
              * scored.route_climbing_weight

            + scored.endurance::numeric
              * scored.route_endurance_weight

            + scored.resistance::numeric
              * scored.route_resistance_weight

            + scored.race_iq::numeric
              * scored.route_race_iq_weight

            + scored.teamwork::numeric
              * scored.route_teamwork_weight
          )
          /
          nullif(
            scored.route_time_trial_weight
            + scored.route_flat_weight
            + scored.route_climbing_weight
            + scored.route_endurance_weight
            + scored.route_resistance_weight
            + scored.route_race_iq_weight
            + scored.route_teamwork_weight,
            0
          )
        )

        + (
          coalesce(
            (
              scored.equipment_bonus_json
                -> 'weighted_bonuses'
                ->> 'time_trial_bonus_pct'
            )::numeric,
            0
          )
          * condition.equipment_condition_factor
        )

        + least(
            coalesce(
              (
                scored.standardized_bonus_totals
                  ->> 'race_support'
              )::numeric,
              0
            ),
            8
          ) * 0.20

        + coalesce(
            scored.command_performance_modifier,
            0
          )

        + (
            (
              coalesce(
                scored.morale,
                100
              )::numeric - 100
            ) * 0.03
          )

        - greatest(
            coalesce(
              scored.fatigue,
              0
            )::numeric - 30,
            0
          ) * 0.08

        + (
            (
              scored.start_stamina - 80
            ) * 0.03
          )
      )
    ),
    2
  ) as adjusted_time_trial_score,

  /*
   * Predicted seconds are only a helper estimate for later TT
   * ranking logic. The real stage runner may add controlled
   * variation, stage-specific weather and team/pair logic.
   */
  round(
    greatest(
      60,

      (
        coalesce(
          scored.distance_km,
          1
        )
        /
        greatest(
          18,

          (
            34
            + (
              (
                (
                  scored.time_trial::numeric
                    * scored.route_time_trial_weight

                  + scored.flat::numeric
                    * scored.route_flat_weight

                  + scored.climbing::numeric
                    * scored.route_climbing_weight

                  + scored.endurance::numeric
                    * scored.route_endurance_weight

                  + scored.resistance::numeric
                    * scored.route_resistance_weight

                  + scored.race_iq::numeric
                    * scored.route_race_iq_weight

                  + scored.teamwork::numeric
                    * scored.route_teamwork_weight
                )
                /
                nullif(
                  scored.route_time_trial_weight
                  + scored.route_flat_weight
                  + scored.route_climbing_weight
                  + scored.route_endurance_weight
                  + scored.route_resistance_weight
                  + scored.route_race_iq_weight
                  + scored.route_teamwork_weight,
                  0
                )
              ) - 50
            ) * 0.22

            + coalesce(
                (
                  scored.equipment_bonus_json
                    -> 'weighted_bonuses'
                    ->> 'time_trial_bonus_pct'
                )::numeric,
                0
              ) * 0.12

            + coalesce(
                scored.command_performance_modifier,
                0
              ) * 0.08
          )
        )
      ) * 3600
    ),
    0
  ) as predicted_time_seconds,

  jsonb_build_object(
    'input_model',
      'time_trial_rider_inputs_v1',

    'stage_format',
      scored.stage_format,

    'distance_km',
      scored.distance_km,

    'terrain_type',
      scored.terrain_type,

    'profile_type',
      scored.profile_type,

    'terrain_split',
      scored.terrain_split,

    'route_label',
      scored.route_label,

    'equipment_setup_source',
      scored.selected_equipment_setup_source,

    'equipment_condition_factor',
      condition.equipment_condition_factor,

    'start_order_mode',
      scored.start_order_mode,

    'start_interval_seconds',
      scored.start_interval_seconds,

    'counting_rider_number',
      scored.counting_rider_number,

    'replay_duration_seconds',
      scored.replay_duration_seconds,

    'command_effort_multiplier',
      scored.command_effort_multiplier,

    'command_performance_modifier',
      scored.command_performance_modifier
  ) as input_metadata_json

from scored

join equipment_condition condition
  on condition.stage_id =
      scored.stage_id

 and condition.rider_id =
      scored.rider_id

where scored.stage_format in (
  'individual_time_trial',
  'prologue',
  'team_time_trial',
  'pair_time_trial'
)

order by
  scored.team_name,
  scored.rider_name;

$function$
;

CREATE OR REPLACE FUNCTION public.race_ai_geographic_priority_v1(p_race_country_code text, p_club_country_code text)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with normalized as (
    select
      upper(nullif(trim(p_race_country_code), ''))
        as race_country_code,
      upper(nullif(trim(p_club_country_code), ''))
        as club_country_code
  ),
  race_geography as (
    select
      member.group_code,
      market_group.macro_region
    from normalized input
    left join public.country_market_group_members member
      on upper(member.country_code) =
         input.race_country_code
    left join public.country_market_groups market_group
      on market_group.code = member.group_code
  ),
  club_geography as (
    select
      member.group_code,
      market_group.macro_region
    from normalized input
    left join public.country_market_group_members member
      on upper(member.country_code) =
         input.club_country_code
    left join public.country_market_groups market_group
      on market_group.code = member.group_code
  )
  select
    case
      when input.race_country_code is null
        or input.club_country_code is null
        then 3

      when input.race_country_code =
           input.club_country_code
        then 0

      when race_geo.group_code is not null
        and club_geo.group_code =
            race_geo.group_code
        then 1

      when race_geo.macro_region is not null
        and club_geo.macro_region =
            race_geo.macro_region
        then 2

      else 3
    end
  from normalized input
  left join race_geography race_geo
    on true
  left join club_geography club_geo
    on true;
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_engine_pipeline_health_v1()
 RETURNS TABLE(stage_format text, stage_count integer, completed_stage_count integer, missing_time_trial_rules integer, dispatcher_target text, pipeline_status text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with stage_base as (
    select
      rs.id as stage_id,
      lower(
        coalesce(
          nullif(rs.stage_format, ''),
          'road_race'
        )
      ) as normalized_stage_format,

      case
        when lower(
          coalesce(
            nullif(rs.stage_format, ''),
            'road_race'
          )
        ) in (
          'road',
          'road_race',
          'classic',
          'one_day',
          'mass_start'
        )
          then 'road_race_runner'

        when lower(
          coalesce(
            nullif(rs.stage_format, ''),
            'road_race'
          )
        ) in (
          'prologue',
          'individual_time_trial',
          'itt'
        )
          then 'individual_time_trial_runner'

        when lower(
          coalesce(
            nullif(rs.stage_format, ''),
            'road_race'
          )
        ) in (
          'team_time_trial',
          'ttt'
        )
          then 'team_time_trial_runner'

        when lower(
          coalesce(
            nullif(rs.stage_format, ''),
            'road_race'
          )
        ) in (
          'pair_time_trial',
          'pair_tt'
        )
          then 'not_implemented_yet'

        else 'unsupported'
      end as dispatcher_target,

      case
        when exists (
          select 1
          from public.race_stage_simulation_runs run
          where run.stage_id = rs.id
            and run.status = 'completed'
        )
          then true
        else false
      end as is_completed,

      case
        when lower(
          coalesce(
            nullif(rs.stage_format, ''),
            'road_race'
          )
        ) in (
          'prologue',
          'individual_time_trial',
          'itt',
          'team_time_trial',
          'ttt',
          'pair_time_trial',
          'pair_tt'
        )
        and not exists (
          select 1
          from public.race_stage_time_trial_rules rule
          where rule.stage_id = rs.id
        )
          then true
        else false
      end as missing_tt_rules

    from public.race_stages rs
  )

  select
    stage_base.normalized_stage_format as stage_format,
    count(*)::integer as stage_count,
    count(*) filter (
      where stage_base.is_completed
    )::integer as completed_stage_count,

    count(*) filter (
      where stage_base.missing_tt_rules
    )::integer as missing_time_trial_rules,

    min(stage_base.dispatcher_target) as dispatcher_target,

    case
      when min(stage_base.dispatcher_target) = 'unsupported'
        then 'needs_dispatcher_mapping'

      when min(stage_base.dispatcher_target) = 'not_implemented_yet'
        then 'known_gap'

      when count(*) filter (
        where stage_base.missing_tt_rules
      ) > 0
        then 'missing_time_trial_rules'

      else 'ok'
    end as pipeline_status

  from stage_base
  group by stage_base.normalized_stage_format
  order by stage_base.normalized_stage_format;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_time_trial_team_tactic_plan_v1(p_plan text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_plan in (
      'tt_balanced_pace',
      'tt_fast_start',
      'tt_negative_split',
      'tt_all_out'
    )
      then p_plan

    when p_plan = 'balanced'
      then 'tt_balanced_pace'

    when p_plan = 'aggressive'
      then 'tt_all_out'

    else 'tt_balanced_pace'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_time_trial_split_pacing_v1(p_command text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_command in (
      'follow_team_plan',
      'controlled',
      'steady',
      'hard',
      'maximum_effort'
    )
      then p_command

    else 'follow_team_plan'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_tt_pacing_effect_v1(p_team_plan text, p_before_split text, p_after_split text, p_adjusted_time_trial_score numeric, p_fatigue_before_stage numeric)
 RETURNS TABLE(normalized_team_plan text, before_split_command text, after_split_command text, time_factor numeric, effort_multiplier numeric, performance_modifier numeric, blowup_risk_score numeric)
 LANGUAGE sql
 IMMUTABLE
AS $function$
  with normalized as (
    select
      public.normalize_time_trial_team_tactic_plan_v1(
        p_team_plan
      ) as team_plan,

      public.normalize_time_trial_split_pacing_v1(
        p_before_split
      ) as before_command,

      public.normalize_time_trial_split_pacing_v1(
        p_after_split
      ) as after_command,

      coalesce(p_adjusted_time_trial_score, 60)::numeric
        as adjusted_tt_score,

      coalesce(p_fatigue_before_stage, 0)::numeric
        as fatigue_before
  ),

  team_effect as (
    select
      normalized.*,

      case normalized.team_plan
        when 'tt_balanced_pace' then 1.000::numeric
        when 'tt_fast_start' then 0.996::numeric
        when 'tt_negative_split' then 0.997::numeric
        when 'tt_all_out' then 0.990::numeric
        else 1.000::numeric
      end as team_time_factor,

      case normalized.team_plan
        when 'tt_balanced_pace' then 1.000::numeric
        when 'tt_fast_start' then 1.060::numeric
        when 'tt_negative_split' then 1.030::numeric
        when 'tt_all_out' then 1.150::numeric
        else 1.000::numeric
      end as team_effort_multiplier,

      case normalized.team_plan
        when 'tt_balanced_pace' then 0.000::numeric
        when 'tt_fast_start' then 0.004::numeric
        when 'tt_negative_split' then 0.003::numeric
        when 'tt_all_out' then 0.010::numeric
        else 0.000::numeric
      end as team_performance_modifier

    from normalized
  ),

  command_rows as (
    select
      team_effect.*,
      command.command_code

    from team_effect

    cross join lateral (
      values
        (team_effect.before_command),
        (team_effect.after_command)
    ) as command(command_code)
  ),

  command_effect as (
    select
      command_rows.*,

      case command_rows.command_code
        when 'controlled' then 1.006::numeric
        when 'steady' then 1.000::numeric
        when 'hard' then 0.996::numeric
        when 'maximum_effort' then 0.991::numeric
        else 1.000::numeric
      end as command_time_factor,

      case command_rows.command_code
        when 'controlled' then 0.920::numeric
        when 'steady' then 1.000::numeric
        when 'hard' then 1.070::numeric
        when 'maximum_effort' then 1.170::numeric
        else 1.000::numeric
      end as command_effort_multiplier,

      case command_rows.command_code
        when 'controlled' then -0.003::numeric
        when 'steady' then 0.000::numeric
        when 'hard' then 0.004::numeric
        when 'maximum_effort' then 0.009::numeric
        else 0.000::numeric
      end as command_performance_modifier

    from command_rows
  ),

  aggregated as (
    select
      command_effect.team_plan,
      command_effect.before_command,
      command_effect.after_command,
      command_effect.adjusted_tt_score,
      command_effect.fatigue_before,
      command_effect.team_time_factor,
      command_effect.team_effort_multiplier,
      command_effect.team_performance_modifier,

      avg(command_effect.command_time_factor)::numeric
        as average_command_time_factor,

      avg(command_effect.command_effort_multiplier)::numeric
        as average_command_effort_multiplier,

      avg(command_effect.command_performance_modifier)::numeric
        as average_command_performance_modifier,

      max(
        case
          when command_effect.command_code = 'maximum_effort'
            then 1
          else 0
        end
      ) as has_maximum_effort,

      max(
        case
          when command_effect.command_code = 'hard'
            then 1
          else 0
        end
      ) as has_hard_effort

    from command_effect

    group by
      command_effect.team_plan,
      command_effect.before_command,
      command_effect.after_command,
      command_effect.adjusted_tt_score,
      command_effect.fatigue_before,
      command_effect.team_time_factor,
      command_effect.team_effort_multiplier,
      command_effect.team_performance_modifier
  ),

  final_effect as (
    select
      aggregated.*,

      case
        when aggregated.team_plan = 'tt_all_out'
             and (
               aggregated.adjusted_tt_score < 65
               or aggregated.fatigue_before > 55
             )
          then 0.014::numeric

        when aggregated.team_plan = 'tt_fast_start'
             and (
               aggregated.adjusted_tt_score < 60
               or aggregated.fatigue_before > 60
             )
          then 0.010::numeric

        when aggregated.has_maximum_effort = 1
             and (
               aggregated.adjusted_tt_score < 60
               or aggregated.fatigue_before > 55
             )
          then 0.012::numeric

        when aggregated.has_hard_effort = 1
             and aggregated.fatigue_before > 70
          then 0.006::numeric

        else 0.000::numeric
      end as blowup_penalty_factor,

      case
        when aggregated.team_plan = 'tt_all_out'
          then 0.12::numeric

        when aggregated.team_plan = 'tt_fast_start'
          then 0.08::numeric

        when aggregated.has_maximum_effort = 1
          then 0.10::numeric

        when aggregated.has_hard_effort = 1
          then 0.05::numeric

        else 0.02::numeric
      end as base_blowup_risk

    from aggregated
  )

  select
    final_effect.team_plan,
    final_effect.before_command,
    final_effect.after_command,

    greatest(
      0.950,
      least(
        1.060,
        (
          final_effect.team_time_factor
          * final_effect.average_command_time_factor
        )
        + final_effect.blowup_penalty_factor
      )
    )::numeric as time_factor,

    greatest(
      0.850,
      least(
        1.350,
        final_effect.team_effort_multiplier
        * final_effect.average_command_effort_multiplier
      )
    )::numeric as effort_multiplier,

    greatest(
      -0.020,
      least(
        0.020,
        final_effect.team_performance_modifier
        + final_effect.average_command_performance_modifier
        - final_effect.blowup_penalty_factor
      )
    )::numeric as performance_modifier,

    greatest(
      0.00,
      least(
        1.00,
        final_effect.base_blowup_risk
        + case
            when final_effect.adjusted_tt_score < 55 then 0.08
            when final_effect.adjusted_tt_score < 65 then 0.04
            else 0
          end
        + case
            when final_effect.fatigue_before > 70 then 0.08
            when final_effect.fatigue_before > 55 then 0.04
            else 0
          end
      )
    )::numeric as blowup_risk_score

  from final_effect;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_time_trial_rider_inputs_v1(p_stage_id uuid)
 RETURNS TABLE(race_id uuid, stage_id uuid, stage_format text, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, stage_role text, stage_tactic text, time_trial smallint, flat smallint, climbing smallint, endurance smallint, resistance smallint, race_iq smallint, teamwork smallint, morale smallint, fatigue smallint, start_stamina numeric, fatigue_before_stage numeric, preparation_id uuid, stage_plan_id uuid, race_preparation_rider_id uuid, race_stage_plan_rider_id uuid, equipment_setup_id uuid, equipment_setup_source text, equipment_bonus_json jsonb, equipment_time_trial_bonus_pct numeric, equipment_fatigue_reduction_pct numeric, equipment_condition_factor numeric, race_support_bonus_pct numeric, fatigue_control_bonus_pct numeric, mechanical_reliability_bonus_pct numeric, command_effort_multiplier numeric, command_performance_modifier numeric, route_time_trial_weight numeric, route_flat_weight numeric, route_climbing_weight numeric, route_endurance_weight numeric, route_resistance_weight numeric, route_race_iq_weight numeric, route_teamwork_weight numeric, raw_time_trial_skill_score numeric, adjusted_time_trial_score numeric, predicted_time_seconds numeric, input_metadata_json jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with legacy_inputs as (
    select *
    from public.race_engine_get_time_trial_rider_inputs_v1_legacy_before_tt_tactics(
      p_stage_id
    )
  ),

  selected_stage_plan as (
    select
      plan.id,
      plan.stage_id,
      coalesce(plan.team_tactic_json, '{}'::jsonb)
        as team_tactic_json,
      coalesce(plan.rider_individual_tactics_json, '{}'::jsonb)
        as rider_individual_tactics_json

    from public.race_stage_plans plan

    where plan.stage_id = p_stage_id

    limit 1
  ),

  with_plan as (
    select
      legacy_inputs.*,

      coalesce(race_condition.race_sharpness, 50)::numeric
        as race_sharpness,

      greatest(
        -2.50,
        least(
          3.00,
          (coalesce(race_condition.race_sharpness, 50)::numeric - 50) * 0.06
        )
      )::numeric as race_sharpness_tt_start_stamina_modifier,

      greatest(
        -0.25,
        least(
          0.30,
          (coalesce(race_condition.race_sharpness, 50)::numeric - 50) * 0.008
        )
      )::numeric as race_sharpness_tt_score_modifier,

      greatest(
        0.986,
        least(
          1.010,
          1 - (
            (coalesce(race_condition.race_sharpness, 50)::numeric - 50)
            * 0.00035
          )
        )
      )::numeric as race_sharpness_tt_time_factor,

      greatest(
        0.985,
        least(
          1.010,
          1 - (
            (coalesce(race_condition.race_sharpness, 50)::numeric - 50)
            * 0.00030
          )
        )
      )::numeric as race_sharpness_tt_effort_factor,

      coalesce(
        selected_stage_plan.team_tactic_json,
        '{}'::jsonb
      ) as saved_team_tactic_json,

      coalesce(
        selected_stage_plan.rider_individual_tactics_json,
        '{}'::jsonb
      ) as saved_individual_tactics_json

    from legacy_inputs

    left join selected_stage_plan
      on selected_stage_plan.stage_id =
        legacy_inputs.stage_id

    left join public.rider_race_condition race_condition
      on race_condition.rider_id =
        legacy_inputs.rider_id
  ),

  normalized_plan as (
    select
      with_plan.*,

      public.normalize_time_trial_team_tactic_plan_v1(
        coalesce(
          with_plan.saved_team_tactic_json ->> 'tt_plan',
          with_plan.saved_team_tactic_json ->> 'tt_team_tactic_plan',
          with_plan.saved_team_tactic_json ->> 'plan',
          with_plan.stage_tactic,
          'tt_balanced_pace'
        )
      ) as normalized_tt_team_plan,

      coalesce(
        with_plan.saved_team_tactic_json
          #>> array[
            'tt_individual_tactics_by_rider',
            with_plan.rider_id::text,
            'before_split',
            'command'
          ],

        with_plan.saved_team_tactic_json
          #>> array[
            'individual_tactics_by_rider',
            with_plan.rider_id::text,
            'before_split',
            'command'
          ],

        with_plan.saved_individual_tactics_json
          #>> array[
            with_plan.rider_id::text,
            'before_split',
            'command'
          ],

        with_plan.saved_team_tactic_json
          #>> array[
            'tt_individual_tactics_by_rider',
            with_plan.rider_id::text,
            'before_split'
          ],

        with_plan.saved_team_tactic_json
          #>> array[
            'individual_tactics_by_rider',
            with_plan.rider_id::text,
            'before_split'
          ],

        with_plan.saved_individual_tactics_json
          #>> array[
            with_plan.rider_id::text,
            'before_split'
          ],

        'follow_team_plan'
      ) as raw_before_split_command,

      coalesce(
        with_plan.saved_team_tactic_json
          #>> array[
            'tt_individual_tactics_by_rider',
            with_plan.rider_id::text,
            'after_split',
            'command'
          ],

        with_plan.saved_team_tactic_json
          #>> array[
            'individual_tactics_by_rider',
            with_plan.rider_id::text,
            'after_split',
            'command'
          ],

        with_plan.saved_individual_tactics_json
          #>> array[
            with_plan.rider_id::text,
            'after_split',
            'command'
          ],

        with_plan.saved_team_tactic_json
          #>> array[
            'tt_individual_tactics_by_rider',
            with_plan.rider_id::text,
            'after_split'
          ],

        with_plan.saved_team_tactic_json
          #>> array[
            'individual_tactics_by_rider',
            with_plan.rider_id::text,
            'after_split'
          ],

        with_plan.saved_individual_tactics_json
          #>> array[
            with_plan.rider_id::text,
            'after_split'
          ],

        'follow_team_plan'
      ) as raw_after_split_command

    from with_plan
  ),

  effect_rows as (
    select
      normalized_plan.*,

      effect.normalized_team_plan,
      effect.before_split_command,
      effect.after_split_command,
      effect.time_factor,
      effect.effort_multiplier,
      effect.performance_modifier,
      effect.blowup_risk_score

    from normalized_plan

    cross join lateral public.race_engine_tt_pacing_effect_v1(
      normalized_plan.normalized_tt_team_plan,
      normalized_plan.raw_before_split_command,
      normalized_plan.raw_after_split_command,
      normalized_plan.adjusted_time_trial_score,
      normalized_plan.fatigue_before_stage
    ) effect
  )

  select
    effect_rows.race_id,
    effect_rows.stage_id,
    effect_rows.stage_format,
    effect_rows.rider_id,
    effect_rows.team_id,
    effect_rows.rider_name,
    effect_rows.team_name,

    case
      when effect_rows.stage_format = 'team_time_trial'
        then 'team_time_trial_rider'
      when effect_rows.stage_format in (
        'prologue',
        'individual_time_trial'
      )
        then 'time_trial_rider'
      else effect_rows.role_code
    end as role_code,

    case
      when effect_rows.stage_format = 'team_time_trial'
        then 'team_time_trial_rider'
      when effect_rows.stage_format in (
        'prologue',
        'individual_time_trial'
      )
        then 'time_trial_rider'
      else effect_rows.stage_role
    end as stage_role,

    effect_rows.normalized_team_plan
      as stage_tactic,

    effect_rows.time_trial,
    effect_rows.flat,
    effect_rows.climbing,
    effect_rows.endurance,
    effect_rows.resistance,
    effect_rows.race_iq,
    effect_rows.teamwork,
    effect_rows.morale,
    effect_rows.fatigue,
    greatest(
      1,
      least(
        100,
        coalesce(effect_rows.start_stamina, 100)
        + coalesce(effect_rows.race_sharpness_tt_start_stamina_modifier, 0)
      )
    )::numeric as start_stamina,

    effect_rows.fatigue_before_stage,
    effect_rows.preparation_id,
    effect_rows.stage_plan_id,
    effect_rows.race_preparation_rider_id,
    effect_rows.race_stage_plan_rider_id,
    effect_rows.equipment_setup_id,
    effect_rows.equipment_setup_source,
    effect_rows.equipment_bonus_json,
    effect_rows.equipment_time_trial_bonus_pct,
    effect_rows.equipment_fatigue_reduction_pct,
    effect_rows.equipment_condition_factor,
    effect_rows.race_support_bonus_pct,
    effect_rows.fatigue_control_bonus_pct,
    effect_rows.mechanical_reliability_bonus_pct,

    greatest(
      0.75,
      least(
        1.50,
        coalesce(effect_rows.command_effort_multiplier, 1)
        * effect_rows.effort_multiplier
        * coalesce(effect_rows.race_sharpness_tt_effort_factor, 1)
      )
    )::numeric as command_effort_multiplier,

    greatest(
      -0.10,
      least(
        0.10,
        coalesce(effect_rows.command_performance_modifier, 0)
        + effect_rows.performance_modifier
      )
    )::numeric as command_performance_modifier,

    effect_rows.route_time_trial_weight,
    effect_rows.route_flat_weight,
    effect_rows.route_climbing_weight,
    effect_rows.route_endurance_weight,
    effect_rows.route_resistance_weight,
    effect_rows.route_race_iq_weight,
    effect_rows.route_teamwork_weight,
    effect_rows.raw_time_trial_skill_score,

    greatest(
      1,
      least(
        99,
        coalesce(effect_rows.adjusted_time_trial_score, 50)
        + (
            effect_rows.performance_modifier
            * 100
          )
        + coalesce(effect_rows.race_sharpness_tt_score_modifier, 0)
      )
    )::numeric as adjusted_time_trial_score,

    greatest(
      60,
      round(
        coalesce(effect_rows.predicted_time_seconds, 60)
        * effect_rows.time_factor
        * coalesce(effect_rows.race_sharpness_tt_time_factor, 1)
      )
    )::numeric as predicted_time_seconds,

    coalesce(
      effect_rows.input_metadata_json,
      '{}'::jsonb
    )
    || jsonb_build_object(
      'tt_stage_plan_tactics_applied',
        true,

      'tt_stage_plan_engine_version',
        '2026-06-18-v1',

      'tt_plan',
        effect_rows.normalized_team_plan,

      'tt_team_tactic_plan',
        effect_rows.normalized_team_plan,

      'before_split',
        effect_rows.before_split_command,

      'after_split',
        effect_rows.after_split_command,

      'tt_time_factor',
        effect_rows.time_factor,

      'tt_effort_multiplier',
        effect_rows.effort_multiplier,

      'tt_performance_modifier',
        effect_rows.performance_modifier,

      'tt_blowup_risk_score',
        effect_rows.blowup_risk_score,

      'tt_native_engine_input_wrapper',
        'race_engine_get_time_trial_rider_inputs_v1',

      'race_sharpness_engine_applied',
        true,

      'race_sharpness_engine_version',
        '2026-06-19-phase-3c',

      'race_sharpness',
        effect_rows.race_sharpness,

      'race_sharpness_tt_start_stamina_modifier',
        effect_rows.race_sharpness_tt_start_stamina_modifier,

      'race_sharpness_tt_score_modifier',
        effect_rows.race_sharpness_tt_score_modifier,

      'race_sharpness_tt_time_factor',
        effect_rows.race_sharpness_tt_time_factor,

      'race_sharpness_tt_effort_factor',
        effect_rows.race_sharpness_tt_effort_factor
    ) as input_metadata_json

  from effect_rows;
$function$
;

CREATE OR REPLACE FUNCTION public.get_rider_international_rankings_v1(p_season_year integer DEFAULT NULL::integer, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(international_rank bigint, season_year integer, rider_id uuid, rider_name_snapshot text, latest_team_name_snapshot text, international_points numeric, oneday_finish_points numeric, stage_finish_points numeric, leader_day_points numeric, final_gc_points numeric, scoring_rows bigint, scoring_races bigint, scoring_stages bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select v.international_rank,v.season_year,v.rider_id,v.rider_name_snapshot,v.latest_team_name_snapshot,v.international_points,v.oneday_finish_points,v.stage_finish_points,v.leader_day_points,v.final_gc_points,v.scoring_rows,v.scoring_races,v.scoring_stages
  from public.rider_international_points_by_season_v1 v
  where v.season_year=coalesce(p_season_year,public.team_ranking_get_current_season_year_v1())
  order by v.international_rank,v.rider_name_snapshot
  limit greatest(coalesce(p_limit,100),1) offset greatest(coalesce(p_offset,0),0);
$function$
;

CREATE OR REPLACE FUNCTION public.get_team_international_rankings_v1(p_season_year integer DEFAULT NULL::integer, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(international_rank bigint, season_year integer, team_id uuid, team_name_snapshot text, international_points numeric, oneday_finish_points numeric, stage_finish_points numeric, leader_day_points numeric, final_gc_points numeric, scoring_rows bigint, scoring_races bigint, scoring_stages bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select v.international_rank,v.season_year,v.team_id,v.team_name_snapshot,v.international_points,v.oneday_finish_points,v.stage_finish_points,v.leader_day_points,v.final_gc_points,v.scoring_rows,v.scoring_races,v.scoring_stages
  from public.team_international_points_by_season_v1 v
  where v.season_year=coalesce(p_season_year,public.team_ranking_get_current_season_year_v1())
  order by v.international_rank,v.team_name_snapshot
  limit greatest(coalesce(p_limit,100),1) offset greatest(coalesce(p_offset,0),0);
$function$
;

CREATE OR REPLACE FUNCTION public.get_rider_international_points_summary_v1(p_rider_id uuid, p_season_year integer DEFAULT NULL::integer)
 RETURNS TABLE(international_rank bigint, season_year integer, rider_id uuid, rider_name_snapshot text, latest_team_name_snapshot text, international_points numeric, oneday_finish_points numeric, stage_finish_points numeric, leader_day_points numeric, final_gc_points numeric, scoring_rows bigint, scoring_races bigint, scoring_stages bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    v.international_rank,
    v.season_year,
    v.rider_id,
    v.rider_name_snapshot,
    v.latest_team_name_snapshot,
    v.international_points,
    v.oneday_finish_points,
    v.stage_finish_points,
    v.leader_day_points,
    v.final_gc_points,
    v.scoring_rows,
    v.scoring_races,
    v.scoring_stages
  from public.rider_international_points_by_season_v1 v
  where v.rider_id = p_rider_id
    and (
      p_season_year is null
      or v.season_year = p_season_year
    )
  order by
    v.season_year desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_team_international_points_summary_v1(p_team_id uuid, p_season_year integer DEFAULT NULL::integer)
 RETURNS TABLE(international_rank bigint, season_year integer, team_id uuid, team_name_snapshot text, international_points numeric, oneday_finish_points numeric, stage_finish_points numeric, leader_day_points numeric, final_gc_points numeric, scoring_rows bigint, scoring_races bigint, scoring_stages bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with params as (
  select
    public.team_ranking_get_current_season_year_v1() as current_season_year,
    public.get_current_game_date_date() as current_game_date
),
active_identity as (
  select distinct on (csi.club_id)
    csi.club_id,
    nullif(csi.display_name, '') as display_name
  from public.club_season_identities csi
  join public.club_sponsors cs
    on cs.id = csi.source_sponsor_id
   and cs.club_id = csi.club_id
  cross join params p
  where cs.status = 'active'
    and cs.sponsor_kind = 'main'
    and coalesce(csi.is_active, false) = true
    and nullif(csi.display_name, '') is not null
    and (
      p.current_game_date is null
      or (
        (csi.starts_game_date is null or csi.starts_game_date <= p.current_game_date)
        and (csi.ends_game_date is null or csi.ends_game_date >= p.current_game_date)
      )
    )
  order by
    csi.club_id,
    csi.season_number desc,
    csi.updated_at desc nulls last,
    csi.created_at desc nulls last
),
display_names as (
  select
    c.id as team_id,
    case
      when c.club_type = 'developing'
       and parent_identity.display_name is not null
        then parent_identity.display_name || ' U23'
      else coalesce(own_identity.display_name, c.name, 'Team')
    end as team_name_snapshot
  from public.clubs c
  left join active_identity own_identity
    on own_identity.club_id = c.id
  left join active_identity parent_identity
    on parent_identity.club_id = c.parent_club_id
),
season_awards as (
  select
    extract(year from coalesce(r.start_date, s.stage_date))::integer as season_year,
    a.race_id,
    a.stage_id,
    a.source_type,
    a.team_id,
    a.team_name_snapshot,
    coalesce(a.team_points, 0)::numeric as team_points
  from public.race_ranking_point_awards a
  left join public.races r
    on r.id = a.race_id
  left join public.race_stages s
    on s.id = a.stage_id
  where a.team_id is not null
    and coalesce(r.start_date, s.stage_date) is not null
    and (
      p_season_year is null
      or extract(year from coalesce(r.start_date, s.stage_date))::integer = p_season_year
    )
),
totals as (
  select
    a.season_year,
    a.team_id,
    coalesce(dn.team_name_snapshot, max(a.team_name_snapshot), 'Team') as team_name_snapshot,
    sum(a.team_points) as international_points,
    sum(a.team_points) filter (where a.source_type = 'oneday_finish') as oneday_finish_points,
    sum(a.team_points) filter (where a.source_type = 'stage_finish') as stage_finish_points,
    sum(a.team_points) filter (where a.source_type = 'leader_day') as leader_day_points,
    sum(a.team_points) filter (where a.source_type = 'final_gc') as final_gc_points,
    count(*) as scoring_rows,
    count(distinct a.race_id) as scoring_races,
    count(distinct a.stage_id) as scoring_stages
  from season_awards a
  left join display_names dn
    on dn.team_id = a.team_id
  group by
    a.season_year,
    a.team_id,
    dn.team_name_snapshot
),
current_teams as (
  select
    p.current_season_year as season_year,
    c.id as team_id,
    coalesce(dn.team_name_snapshot, c.name, 'Team') as team_name_snapshot
  from params p
  join public.clubs c
    on p_season_year is null
    or p.current_season_year = p_season_year
  left join display_names dn
    on dn.team_id = c.id
  where c.deleted_at is null
    and coalesce(c.club_type, 'main') <> 'developing'
    and c.club_tier::text = any (
      array['worldteam','proteam','continental','amateur']::text[]
    )
),
combined as (
  select
    t.season_year,
    t.team_id,
    t.team_name_snapshot,
    coalesce(t.international_points, 0::numeric) as international_points,
    coalesce(t.oneday_finish_points, 0::numeric) as oneday_finish_points,
    coalesce(t.stage_finish_points, 0::numeric) as stage_finish_points,
    coalesce(t.leader_day_points, 0::numeric) as leader_day_points,
    coalesce(t.final_gc_points, 0::numeric) as final_gc_points,
    t.scoring_rows,
    t.scoring_races,
    t.scoring_stages
  from totals t

  union all

  select
    ct.season_year,
    ct.team_id,
    ct.team_name_snapshot,
    0::numeric,
    0::numeric,
    0::numeric,
    0::numeric,
    0::numeric,
    0::bigint,
    0::bigint,
    0::bigint
  from current_teams ct
  where not exists (
    select 1
    from totals t
    where t.season_year = ct.season_year
      and t.team_id = ct.team_id
  )
),
ranked as (
  select
    rank() over (
      partition by c.season_year
      order by c.international_points desc, c.team_name_snapshot, c.team_id
    ) as international_rank,
    c.*
  from combined c
)
select
  r.international_rank,
  r.season_year,
  r.team_id,
  r.team_name_snapshot,
  r.international_points,
  r.oneday_finish_points,
  r.stage_finish_points,
  r.leader_day_points,
  r.final_gc_points,
  r.scoring_rows,
  r.scoring_races,
  r.scoring_stages
from ranked r
where r.team_id = p_team_id
  and (p_season_year is null or r.season_year = p_season_year)
order by r.season_year desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_rider_season_overview(p_rider_id uuid)
 RETURNS TABLE(points numeric, podiums integer, jerseys integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with cs as (
    select public.team_ranking_get_current_season_year_v1()::integer as season_year
  )
  select coalesce(v.points,0)::numeric,
         coalesce(v.podiums,0)::integer,
         coalesce(v.jerseys,0)::integer
  from cs
  left join public.rider_season_overview_v1 v
    on v.rider_id=p_rider_id and v.season_year=cs.season_year;
$function$
;

CREATE OR REPLACE FUNCTION public.get_rider_season_overview_v1(p_rider_id uuid, p_season_year integer DEFAULT NULL::integer)
 RETURNS TABLE(season_year integer, rider_id uuid, points numeric, podiums integer, jerseys integer, stage_wins integer, final_jerseys integer, oneday_finish_points numeric, stage_finish_points numeric, leader_day_points numeric, final_gc_points numeric, scoring_races bigint, scoring_stages bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    v.season_year,
    v.rider_id,
    v.points,
    v.podiums,
    v.jerseys,
    v.stage_wins,
    v.final_jerseys,
    v.oneday_finish_points,
    v.stage_finish_points,
    v.leader_day_points,
    v.final_gc_points,
    v.scoring_races,
    v.scoring_stages
  from public.rider_season_overview_v1 v
  where v.rider_id = p_rider_id
    and (
      p_season_year is null
      or v.season_year = p_season_year
    )
  order by v.season_year desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_rider_last_five_races(p_rider_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(race_id uuid, race_name text, race_country_code text, race_category text, race_start_date date, race_end_date date, race_date date, stage_count integer, route_label text, finish_position integer, ci_points numeric, uci_points numeric, result_source text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with stage_summary as (
    select
      s.race_id,
      count(*)::integer as stage_count,
      min(s.stage_date)::date as first_stage_date,
      max(s.stage_date)::date as last_stage_date
    from public.race_stages s
    group by s.race_id
  ),

  first_stage as (
    select distinct on (s.race_id)
      s.race_id,
      s.id as stage_id,
      s.stage_number,
      s.stage_date,
      nullif(
        coalesce(
          to_jsonb(s)->>'start_city',
          to_jsonb(s)->>'start_city_name',
          to_jsonb(s)->>'start_location',
          to_jsonb(s)->>'departure_city'
        ),
        ''
      ) as start_label
    from public.race_stages s
    order by
      s.race_id,
      s.stage_number asc nulls last,
      s.stage_date asc nulls last,
      s.id
  ),

  final_stage as (
    select distinct on (s.race_id)
      s.race_id,
      s.id as stage_id,
      s.stage_number,
      s.stage_date,
      nullif(
        coalesce(
          to_jsonb(s)->>'finish_city',
          to_jsonb(s)->>'finish_city_name',
          to_jsonb(s)->>'finish_location',
          to_jsonb(s)->>'arrival_city'
        ),
        ''
      ) as finish_label
    from public.race_stages s
    order by
      s.race_id,
      s.stage_number desc nulls last,
      s.stage_date desc nulls last,
      s.id
  ),

  completed_races as (
    select
      r.id as race_id,
      r.name::text as race_name,
      r.category::text as race_category,
      nullif(
        coalesce(
          to_jsonb(r)->>'country_code',
          to_jsonb(r)->>'country',
          to_jsonb(r)->>'host_country_code'
        ),
        ''
      ) as race_country_code,
      coalesce(r.start_date::date, ss.first_stage_date)::date as race_start_date,
      coalesce(r.end_date::date, ss.last_stage_date, r.start_date::date)::date as race_end_date,
      coalesce(r.end_date::date, ss.last_stage_date, r.start_date::date)::date as race_date,
      coalesce(ss.stage_count, 0)::integer as stage_count,
      nullif(
        coalesce(
          to_jsonb(r)->>'route_label',
          to_jsonb(r)->>'route_name',
          case
            when fs.start_label is not null and ls.finish_label is not null
              then fs.start_label || ' → ' || ls.finish_label
            else null
          end
        ),
        ''
      ) as route_label
    from public.races r
    left join stage_summary ss
      on ss.race_id = r.id
    left join first_stage fs
      on fs.race_id = r.id
    left join final_stage ls
      on ls.race_id = r.id
    where r.status::text in (
      'completed',
      'archived',
      'finished',
      'race_finished'
    )
  ),

  race_uci_points as (
    select
      a.race_id,
      a.rider_id,
      coalesce(sum(a.rider_points), 0)::numeric as uci_points
    from public.race_ranking_point_awards a
    where a.rider_id = p_rider_id
    group by
      a.race_id,
      a.rider_id
  ),

  one_day_award_finish as (
    select
      cr.race_id,
      cr.race_name,
      cr.race_country_code,
      cr.race_category,
      cr.race_start_date,
      cr.race_end_date,
      cr.race_date,
      cr.stage_count,
      cr.route_label,
      a.rank::integer as finish_position,
      coalesce(up.uci_points, 0)::numeric as uci_points,
      'oneday_finish_award'::text as result_source,
      1 as source_priority
    from completed_races cr
    join public.race_ranking_point_awards a
      on a.race_id = cr.race_id
     and a.rider_id = p_rider_id
     and a.source_type = 'oneday_finish'
    left join race_uci_points up
      on up.race_id = cr.race_id
     and up.rider_id = p_rider_id
    where cr.race_category not like '2.%'
      and a.rank is not null
  ),

  one_day_stage_result as (
    select distinct on (cr.race_id)
      cr.race_id,
      cr.race_name,
      cr.race_country_code,
      cr.race_category,
      cr.race_start_date,
      cr.race_end_date,
      cr.race_date,
      cr.stage_count,
      cr.route_label,
      sr.rank::integer as finish_position,
      coalesce(up.uci_points, 0)::numeric as uci_points,
      'one_day_stage_result'::text as result_source,
      2 as source_priority
    from completed_races cr
    join public.race_stages s
      on s.race_id = cr.race_id
    join public.race_stage_results sr
      on sr.stage_id = s.id
    left join race_uci_points up
      on up.race_id = cr.race_id
     and up.rider_id = p_rider_id
    where sr.rider_id = p_rider_id
      and sr.rank is not null
      and cr.race_category not like '2.%'
      and coalesce(lower(to_jsonb(sr)->>'status'), 'finished') not in (
        'dnf',
        'dns',
        'dsq',
        'otl',
        'abandoned',
        'did_not_finish',
        'did_not_start',
        'disqualified'
      )
    order by
      cr.race_id,
      s.stage_number desc nulls last,
      s.stage_date desc nulls last,
      s.id
  ),

  stage_race_final_gc_award as (
    select
      cr.race_id,
      cr.race_name,
      cr.race_country_code,
      cr.race_category,
      cr.race_start_date,
      cr.race_end_date,
      cr.race_date,
      cr.stage_count,
      cr.route_label,
      a.rank::integer as finish_position,
      coalesce(up.uci_points, 0)::numeric as uci_points,
      'final_gc_award'::text as result_source,
      1 as source_priority
    from completed_races cr
    join public.race_ranking_point_awards a
      on a.race_id = cr.race_id
     and a.rider_id = p_rider_id
     and a.source_type = 'final_gc'
    left join race_uci_points up
      on up.race_id = cr.race_id
     and up.rider_id = p_rider_id
    where cr.race_category like '2.%'
      and a.rank is not null
  ),

  stage_race_classification_gc as (
    select
      cr.race_id,
      cr.race_name,
      cr.race_country_code,
      cr.race_category,
      cr.race_start_date,
      cr.race_end_date,
      cr.race_date,
      cr.stage_count,
      cr.route_label,
      cs.rank::integer as finish_position,
      coalesce(up.uci_points, 0)::numeric as uci_points,
      'classification_general'::text as result_source,
      2 as source_priority
    from completed_races cr
    join public.race_classification_standings cs
      on cs.race_id = cr.race_id
    left join race_uci_points up
      on up.race_id = cr.race_id
     and up.rider_id = p_rider_id
    where cs.rider_id = p_rider_id
      and cs.rank is not null
      and cr.race_category like '2.%'
      and coalesce(to_jsonb(cs)->>'entity_type', 'rider') = 'rider'
      and lower(cs.classification_type::text) in (
        'general',
        'gc',
        'overall'
      )
  ),

  stage_race_fallback_final_stage as (
    select distinct on (cr.race_id)
      cr.race_id,
      cr.race_name,
      cr.race_country_code,
      cr.race_category,
      cr.race_start_date,
      cr.race_end_date,
      cr.race_date,
      cr.stage_count,
      cr.route_label,
      sr.rank::integer as finish_position,
      coalesce(up.uci_points, 0)::numeric as uci_points,
      'final_stage_fallback'::text as result_source,
      3 as source_priority
    from completed_races cr
    join public.race_stages s
      on s.race_id = cr.race_id
    join public.race_stage_results sr
      on sr.stage_id = s.id
    left join race_uci_points up
      on up.race_id = cr.race_id
     and up.rider_id = p_rider_id
    where sr.rider_id = p_rider_id
      and sr.rank is not null
      and cr.race_category like '2.%'
      and not exists (
        select 1
        from public.race_ranking_point_awards a
        where a.race_id = cr.race_id
          and a.rider_id = p_rider_id
          and a.source_type = 'final_gc'
      )
      and not exists (
        select 1
        from public.race_classification_standings cs
        where cs.race_id = cr.race_id
          and cs.rider_id = p_rider_id
          and lower(cs.classification_type::text) in ('general', 'gc', 'overall')
      )
      and coalesce(lower(to_jsonb(sr)->>'status'), 'finished') not in (
        'dnf',
        'dns',
        'dsq',
        'otl',
        'abandoned',
        'did_not_finish',
        'did_not_start',
        'disqualified'
      )
    order by
      cr.race_id,
      s.stage_number desc nulls last,
      s.stage_date desc nulls last,
      s.id
  ),

  combined as (
    select * from one_day_award_finish
    union all
    select * from one_day_stage_result
    union all
    select * from stage_race_final_gc_award
    union all
    select * from stage_race_classification_gc
    union all
    select * from stage_race_fallback_final_stage
  ),

  picked as (
    select distinct on (race_id)
      race_id,
      race_name,
      race_country_code,
      race_category,
      race_start_date,
      race_end_date,
      race_date,
      stage_count,
      route_label,
      finish_position,
      uci_points,
      result_source
    from combined
    order by
      race_id,
      source_priority,
      race_date desc nulls last
  )

  select
    race_id,
    race_name,
    race_country_code,
    race_category,
    race_start_date,
    race_end_date,
    race_date,
    stage_count,
    route_label,
    finish_position,
    uci_points as ci_points,
    uci_points,
    result_source
  from picked
  order by
    race_date desc nulls last,
    race_name
  limit least(greatest(coalesce(p_limit, 5), 1), 5);
$function$
;

CREATE OR REPLACE FUNCTION public.get_team_last_five_races(p_team_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(race_id uuid, race_name text, race_country_code text, race_category text, race_start_date date, race_end_date date, race_date date, stage_count integer, route_label text, team_position integer, uci_points integer, result_source text, squad_type text, parent_club_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with target_team as (
  select
    c.id as team_id,
    c.club_type::text as squad_type,
    c.parent_club_id
  from public.clubs c
  where c.id = p_team_id
),

race_stage_counts as (
  select
    s.race_id,
    count(*)::integer as stage_count
  from public.race_stages s
  group by s.race_id
),

first_stage as (
  select distinct on (s.race_id)
    s.race_id,
    s.start_city
  from public.race_stages s
  order by
    s.race_id,
    s.stage_number asc nulls last,
    s.stage_date asc nulls last,
    s.id
),

final_stage as (
  select distinct on (s.race_id)
    s.race_id,
    s.id as final_stage_id,
    s.finish_city,
    s.stage_date
  from public.race_stages s
  order by
    s.race_id,
    s.stage_number desc nulls last,
    s.stage_date desc nulls last,
    s.id
),

team_participated_races as (
  select distinct
    s.race_id
  from public.race_stage_results sr
  join public.race_stages s
    on s.id = sr.stage_id
  where sr.team_id = p_team_id
    and coalesce(lower(to_jsonb(sr)->>'status'), 'finished') not in (
      'dnf',
      'dns',
      'dsq',
      'otl',
      'abandoned',
      'did_not_finish',
      'did_not_start',
      'disqualified'
    )
),

team_uci_points as (
  select
    a.race_id,
    coalesce(sum(a.team_points), 0)::integer as uci_points
  from public.race_ranking_point_awards a
  where a.team_id = p_team_id
  group by a.race_id
),

team_final_classification as (
  select distinct on (cs.race_id)
    cs.race_id,
    cs.rank::integer as team_position,
    'team_classification'::text as result_source
  from public.race_classification_standings cs
  join final_stage fs
    on fs.race_id = cs.race_id
   and (
      cs.after_stage_id = fs.final_stage_id
      or cs.after_stage_id is null
   )
  where cs.team_id = p_team_id
    and coalesce(cs.entity_type::text, 'team') = 'team'
    and lower(cs.classification_type::text) in (
      'team',
      'team_general',
      'team_gc',
      'general',
      'gc',
      'overall'
    )
    and cs.rank is not null
  order by
    cs.race_id,
    case when cs.after_stage_id = fs.final_stage_id then 0 else 1 end,
    cs.rank
),

best_rider_final_gc as (
  select
    cs.race_id,
    min(cs.rank)::integer as team_position,
    'best_rider_final_gc'::text as result_source
  from public.race_classification_standings cs
  join final_stage fs
    on fs.race_id = cs.race_id
   and (
      cs.after_stage_id = fs.final_stage_id
      or cs.after_stage_id is null
   )
  where cs.team_id = p_team_id
    and coalesce(cs.entity_type::text, 'rider') = 'rider'
    and lower(cs.classification_type::text) in ('general', 'gc', 'overall')
    and cs.rank is not null
  group by cs.race_id
),

best_stage_finish as (
  select
    s.race_id,
    min(sr.rank)::integer as team_position,
    'best_stage_finish'::text as result_source
  from public.race_stage_results sr
  join public.race_stages s
    on s.id = sr.stage_id
  where sr.team_id = p_team_id
    and sr.rank is not null
    and coalesce(lower(to_jsonb(sr)->>'status'), 'finished') not in (
      'dnf',
      'dns',
      'dsq',
      'otl',
      'abandoned',
      'did_not_finish',
      'did_not_start',
      'disqualified'
    )
  group by s.race_id
),

team_position_source as (
  select
    tpr.race_id,
    coalesce(tfc.team_position, brg.team_position, bsf.team_position) as team_position,
    coalesce(tfc.result_source, brg.result_source, bsf.result_source) as result_source
  from team_participated_races tpr
  left join team_final_classification tfc
    on tfc.race_id = tpr.race_id
  left join best_rider_final_gc brg
    on brg.race_id = tpr.race_id
  left join best_stage_finish bsf
    on bsf.race_id = tpr.race_id
)

select
  r.id as race_id,
  r.name::text as race_name,
  r.country_code::text as race_country_code,
  r.category::text as race_category,
  r.start_date::date as race_start_date,
  coalesce(r.end_date, r.start_date)::date as race_end_date,
  coalesce(r.end_date, fs.stage_date, r.start_date)::date as race_date,
  coalesce(rsc.stage_count, 1)::integer as stage_count,
  case
    when nullif(fst.start_city, '') is not null
     and nullif(fs.finish_city, '') is not null
     and fst.start_city <> fs.finish_city
      then concat(fst.start_city, ' → ', fs.finish_city)
    when nullif(fst.start_city, '') is not null
      then fst.start_city
    when nullif(fs.finish_city, '') is not null
      then fs.finish_city
    else null
  end as route_label,
  tps.team_position,
  coalesce(tup.uci_points, 0)::integer as uci_points,
  tps.result_source,
  tt.squad_type,
  tt.parent_club_id
from team_participated_races tpr
join public.races r
  on r.id = tpr.race_id
cross join target_team tt
left join race_stage_counts rsc
  on rsc.race_id = r.id
left join first_stage fst
  on fst.race_id = r.id
left join final_stage fs
  on fs.race_id = r.id
left join team_position_source tps
  on tps.race_id = r.id
left join team_uci_points tup
  on tup.race_id = r.id
where r.status::text in ('completed', 'archived', 'finished', 'race_finished')
order by
  coalesce(r.end_date, fs.stage_date, r.start_date) desc nulls last,
  r.name
limit greatest(coalesce(p_limit, 5), 1);
$function$
;

CREATE OR REPLACE FUNCTION public.is_one_day_race_stage_v1(p_stage_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((
    select
      coalesce(
        rcr.race_format::text,
        case
          when r.category::text like '2.%' then 'stage_race'
          else 'one_day'
        end
      ) = 'one_day'
    from public.race_stages s
    join public.races r
      on r.id = s.race_id
    left join public.race_entry_rules rer
      on rer.race_id = r.id
    left join public.race_category_rules rcr
      on rcr.race_class_code = coalesce(rer.race_class_code::text, r.category::text)
    where s.id = p_stage_id
    limit 1
  ), false);
$function$
;

CREATE OR REPLACE FUNCTION public.get_rider_race_sharpness_ui_v1(p_club_id uuid DEFAULT NULL::uuid, p_rider_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(rider_id uuid, rider_name text, club_id uuid, club_name text, race_sharpness numeric, race_sharpness_percent integer, race_sharpness_label text, race_sharpness_status text, badge_tone text, last_raced_on date, race_days_last_14 integer, race_days_last_30 integer, total_race_days integer, last_stage_sharpness_delta numeric, overload_penalty numeric, overload_warning boolean, race_sharpness_message text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with rider_base as (
    select distinct on (rd.id)
      rd.id as rider_id,

      coalesce(
        nullif(to_jsonb(rd)->>'display_name', ''),
        nullif(to_jsonb(rd)->>'full_name', ''),
        nullif(
          trim(
            concat_ws(
              ' ',
              nullif(to_jsonb(rd)->>'first_name', ''),
              nullif(to_jsonb(rd)->>'last_name', '')
            )
          ),
          ''
        ),
        rd.id::text
      ) as rider_name,

      cr.club_id,
      c.name as club_name,
      cr.created_at as club_rider_created_at
    from public.riders rd
    left join public.club_riders cr
      on cr.rider_id = rd.id
     and (
       p_club_id is null
       or cr.club_id = p_club_id
     )
    left join public.clubs c
      on c.id = cr.club_id
    where
      (
        p_rider_id is null
        or rd.id = p_rider_id
      )
      and (
        p_club_id is null
        or cr.club_id = p_club_id
      )
    order by
      rd.id,
      cr.created_at desc nulls last
  ),

  condition_rows as (
    select
      rb.rider_id,
      rb.rider_name,
      rb.club_id,
      rb.club_name,

      greatest(
        0,
        least(
          100,
          coalesce(rc.race_sharpness, 50)::numeric
        )
      ) as race_sharpness,

      rc.last_raced_on,
      coalesce(rc.race_days_last_14, 0)::integer as race_days_last_14,
      coalesce(rc.race_days_last_30, 0)::integer as race_days_last_30,
      coalesce(rc.total_race_days, 0)::integer as total_race_days,
      coalesce(rc.last_stage_sharpness_delta, 0)::numeric as last_stage_sharpness_delta,

      -- UI-only overload estimate.
      -- No DB column required.
      greatest(
        0,
        (
          greatest(coalesce(rc.race_days_last_14, 0)::numeric - 10, 0)
          * 0.75
        ),
        (
          greatest(coalesce(rc.race_days_last_30, 0)::numeric - 22, 0)
          * 0.25
        )
      ) as overload_penalty

    from rider_base rb
    left join public.rider_race_condition rc
      on rc.rider_id = rb.rider_id
  )

  select
    cr.rider_id,
    cr.rider_name,
    cr.club_id,
    cr.club_name,

    round(cr.race_sharpness, 2) as race_sharpness,
    round(cr.race_sharpness)::integer as race_sharpness_percent,

    case
      when cr.race_sharpness >= 80 then 'Peak Sharpness'
      when cr.race_sharpness >= 65 then 'Sharp'
      when cr.race_sharpness >= 50 then 'Race Ready'
      when cr.race_sharpness >= 40 then 'Slightly Rusty'
      when cr.race_sharpness >= 25 then 'Rusty'
      else 'Very Rusty'
    end as race_sharpness_label,

    case
      when cr.overload_penalty > 0 then 'overloaded'
      when cr.race_sharpness >= 80 then 'peak'
      when cr.race_sharpness >= 65 then 'sharp'
      when cr.race_sharpness >= 50 then 'ready'
      when cr.race_sharpness >= 40 then 'slightly_rusty'
      when cr.race_sharpness >= 25 then 'rusty'
      else 'very_rusty'
    end as race_sharpness_status,

    case
      when cr.overload_penalty > 0 then 'danger'
      when cr.race_sharpness >= 80 then 'success'
      when cr.race_sharpness >= 65 then 'success'
      when cr.race_sharpness >= 50 then 'info'
      when cr.race_sharpness >= 40 then 'warning'
      when cr.race_sharpness >= 25 then 'warning'
      else 'danger'
    end as badge_tone,

    cr.last_raced_on,
    cr.race_days_last_14,
    cr.race_days_last_30,
    cr.total_race_days,
    round(cr.last_stage_sharpness_delta, 3) as last_stage_sharpness_delta,
    round(cr.overload_penalty, 3) as overload_penalty,

    (cr.overload_penalty > 0) as overload_warning,

    case
      when cr.overload_penalty > 0 then
        'Too much racing recently — freshness is dropping.'
      when cr.last_raced_on is null then
        'No recent race data yet. Rider is treated as neutral.'
      when cr.race_sharpness >= 80 then
        'Excellent race rhythm. Rider is very sharp.'
      when cr.race_sharpness >= 65 then
        'Good race rhythm. Rider is sharp.'
      when cr.race_sharpness >= 50 then
        'Solid race rhythm. Rider is race ready.'
      when cr.race_sharpness >= 40 then
        'Rider is slightly rusty and may need racing rhythm.'
      when cr.race_sharpness >= 25 then
        'Rider is rusty after limited recent racing.'
      else
        'Rider is very rusty and needs race rhythm.'
    end as race_sharpness_message

  from condition_rows cr
  order by
    cr.race_sharpness desc,
    cr.last_raced_on desc nulls last,
    cr.rider_name;
$function$
;

CREATE OR REPLACE FUNCTION public._get_club_squad_season_dashboard_v1_internal(p_club_id uuid, p_season_year integer DEFAULT 2000)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with month_labels as (
    select *
    from (values
      (1, 'Jan'), (2, 'Feb'), (3, 'Mar'), (4, 'Apr'),
      (5, 'May'), (6, 'Jun'), (7, 'Jul'), (8, 'Aug'),
      (9, 'Sep'), (10, 'Oct'), (11, 'Nov'), (12, 'Dec')
    ) as m(month_number, month_label)
  ),

  current_game_date as (
    select
      coalesce(
        public.get_current_game_date_date(),
        make_date(p_season_year, 12, 31)
      )::date as game_date
  ),

  club_riders_current as (
    select
      cr.rider_id,
      cr.assigned_role
    from public.club_riders cr
    where cr.club_id = p_club_id
  ),

  stage_results_base as (
    select
      rs.id as result_id,
      nullif(to_jsonb(rs)->>'rider_id', '')::uuid as rider_id,
      nullif(
        coalesce(
          to_jsonb(rs)->>'team_id',
          to_jsonb(rs)->>'club_id',
          to_jsonb(rs)->>'rider_team_id'
        ),
        ''
      )::uuid as result_team_id,
      nullif(to_jsonb(rs)->>'stage_id', '')::uuid as stage_id,
      nullif(
        coalesce(
          to_jsonb(rs)->>'finish_position',
          to_jsonb(rs)->>'position',
          to_jsonb(rs)->>'rank',
          to_jsonb(rs)->>'result_position'
        ),
        ''
      )::integer as finish_position
    from public.race_stage_results rs
  ),

  squad_stage_results as (
    select
      srb.result_id,
      srb.rider_id,
      srb.stage_id,
      srb.finish_position,
      coalesce(crc.assigned_role::text, to_jsonb(rd)->>'role') as role,
      coalesce(
        nullif(to_jsonb(rd)->>'display_name', ''),
        nullif(to_jsonb(rd)->>'full_name', ''),
        nullif(trim(concat_ws(' ', to_jsonb(rd)->>'first_name', to_jsonb(rd)->>'last_name')), ''),
        srb.rider_id::text
      ) as rider_name,
      s.stage_number,
      s.stage_date::date as stage_date,
      coalesce(
        to_jsonb(s)->>'stage_format',
        to_jsonb(s)->>'terrain_type',
        'road_race'
      ) as stage_format,
      coalesce(
        to_jsonb(s)->>'profile_type',
        to_jsonb(s)->>'terrain_type',
        ''
      ) as profile_type,
      r.id as race_id,
      r.name as race_name,
      coalesce(
        to_jsonb(r)->>'race_class',
        to_jsonb(r)->>'class',
        to_jsonb(r)->>'category',
        to_jsonb(r)->>'uci_class',
        to_jsonb(r)->>'race_category',
        ''
      ) as race_category,
      coalesce(
        to_jsonb(r)->>'country_code',
        to_jsonb(r)->>'host_country_code',
        to_jsonb(r)->>'country_iso2',
        to_jsonb(r)->>'country_iso',
        to_jsonb(r)->>'country',
        ''
      ) as race_country_code,
      coalesce(
        to_jsonb(s)->>'route_label',
        to_jsonb(s)->>'name',
        to_jsonb(r)->>'route_label',
        ''
      ) as route_label
    from stage_results_base srb
    join public.race_stages s
      on s.id = srb.stage_id
    join public.races r
      on r.id = s.race_id
    left join club_riders_current crc
      on crc.rider_id = srb.rider_id
    left join public.riders rd
      on rd.id = srb.rider_id
    where extract(year from s.stage_date::date)::integer = p_season_year
      and (
        srb.rider_id in (select rider_id from club_riders_current)
        or srb.result_team_id = p_club_id
      )
      and srb.finish_position is not null
  ),

  award_rows as (
    select
      a.id,
      a.race_id,
      a.stage_id,
      a.rider_id,
      a.team_id,
      coalesce(a.rider_points, 0) as rider_points,
      coalesce(a.team_points, 0) as team_points,
      a.source_type,
      coalesce(
        s.stage_date::date,
        nullif(to_jsonb(r)->>'end_date', '')::date,
        nullif(to_jsonb(r)->>'start_date', '')::date
      ) as award_date
    from public.race_ranking_point_awards a
    join public.races r
      on r.id = a.race_id
    left join public.race_stages s
      on s.id = a.stage_id
    where a.team_id = p_club_id
      and extract(
        year from coalesce(
          s.stage_date::date,
          nullif(to_jsonb(r)->>'end_date', '')::date,
          nullif(to_jsonb(r)->>'start_date', '')::date
        )
      )::integer = p_season_year
  ),

  points_by_month as (
    select
      extract(month from award_date)::integer as month_number,
      sum(team_points)::integer as points
    from award_rows
    where award_date is not null
    group by extract(month from award_date)::integer
  ),

  summary as (
    select
      count(*) filter (where finish_position = 1)::integer as wins,
      count(*) filter (where finish_position between 1 and 3)::integer as podiums,
      count(*) filter (where finish_position between 1 and 10)::integer as top10s,
      coalesce(min(finish_position) filter (
        where profile_type ilike '%gc%'
           or stage_format ilike '%gc%'
      ), 0)::integer as best_gc
    from squad_stage_results
  ),

  race_stage_counts as (
    select
      race_id,
      count(distinct stage_id)::integer as stage_count
    from squad_stage_results
    group by race_id
  ),

  race_type_snapshot as (
    select
      count(distinct ssr.race_id) filter (where coalesce(rsc.stage_count, 0) <= 1)::integer as one_day_classics,
      count(distinct ssr.stage_id)::integer as stage_finishes,
      count(distinct ssr.stage_id) filter (
        where ssr.profile_type ilike '%mountain%'
           or ssr.profile_type ilike '%climb%'
           or ssr.stage_format ilike '%mountain%'
           or ssr.stage_format ilike '%climb%'
      )::integer as mountain_days,
      count(distinct ssr.stage_id) filter (
        where ssr.stage_format ilike '%time_trial%'
           or ssr.stage_format ilike '%prologue%'
           or ssr.profile_type ilike '%time_trial%'
      )::integer as time_trials
    from squad_stage_results ssr
    left join race_stage_counts rsc
      on rsc.race_id = ssr.race_id
  ),

  completed_race_candidates as (
    select distinct
      r.id as race_id,
      r.name as race_name,
      coalesce(
        to_jsonb(r)->>'race_class',
        to_jsonb(r)->>'class',
        to_jsonb(r)->>'category',
        to_jsonb(r)->>'uci_class',
        to_jsonb(r)->>'race_category',
        ''
      ) as race_category,
      coalesce(
        to_jsonb(r)->>'country_code',
        to_jsonb(r)->>'host_country_code',
        to_jsonb(r)->>'country_iso2',
        to_jsonb(r)->>'country_iso',
        to_jsonb(r)->>'country',
        ''
      ) as race_country_code,
      nullif(to_jsonb(r)->>'start_date', '')::date as start_date,
      nullif(to_jsonb(r)->>'end_date', '')::date as end_date,
      lower(coalesce(to_jsonb(r)->>'status', '')) as race_status,
      (
        select count(*)::integer
        from public.race_stages s
        where s.race_id = r.id
      ) as stage_count
    from public.races r
    join squad_stage_results ssr
      on ssr.race_id = r.id
    cross join current_game_date cgd
    where extract(year from coalesce(nullif(to_jsonb(r)->>'end_date', '')::date, ssr.stage_date))::integer = p_season_year
      and (
        lower(coalesce(to_jsonb(r)->>'status', '')) in (
          'completed',
          'archived',
          'finished',
          'race_finished',
          'race_completed'
        )
        or coalesce(nullif(to_jsonb(r)->>'end_date', '')::date, ssr.stage_date) < cgd.game_date
      )
  ),

  last_completed_race as (
    select *
    from completed_race_candidates
    order by
      coalesce(end_date, start_date) desc nulls last,
      race_name
    limit 1
  ),

  last_completed_race_final_stage as (
    select
      s.id as stage_id,
      s.stage_number,
      s.stage_date::date as stage_date
    from public.race_stages s
    join last_completed_race lcr
      on lcr.race_id = s.race_id
    order by s.stage_number desc nulls last, s.stage_date desc
    limit 1
  ),

  final_gc_rows_raw as (
    select
      nullif(to_jsonb(rcs)->>'rider_id', '')::uuid as rider_id,
      nullif(
        coalesce(
          to_jsonb(rcs)->>'team_id',
          to_jsonb(rcs)->>'club_id',
          to_jsonb(rcs)->>'rider_team_id'
        ),
        ''
      )::uuid as team_id,
      nullif(
        coalesce(
          to_jsonb(rcs)->>'position',
          to_jsonb(rcs)->>'rank',
          to_jsonb(rcs)->>'classification_rank',
          to_jsonb(rcs)->>'gc_position',
          to_jsonb(rcs)->>'overall_position'
        ),
        ''
      )::integer as finish_position,
      lower(coalesce(
        to_jsonb(rcs)->>'classification_type',
        to_jsonb(rcs)->>'standing_type',
        to_jsonb(rcs)->>'classification',
        to_jsonb(rcs)->>'type',
        ''
      )) as classification_type,
      lower(coalesce(
        to_jsonb(rcs)->>'classification_code',
        to_jsonb(rcs)->>'standing_code',
        to_jsonb(rcs)->>'code',
        ''
      )) as classification_code
    from public.race_classification_standings rcs
    join last_completed_race lcr
      on nullif(to_jsonb(rcs)->>'race_id', '')::uuid = lcr.race_id
  ),

  final_gc_rows_deduped as (
    select distinct on (fgr.rider_id)
      fgr.rider_id,
      fgr.team_id,
      fgr.finish_position
    from final_gc_rows_raw fgr
    where fgr.rider_id in (select rider_id from club_riders_current)
      and fgr.team_id = p_club_id
      and fgr.finish_position is not null
      and (
        fgr.classification_type in (
          'general',
          'gc',
          'overall',
          'final_gc',
          'race',
          'race_gc'
        )
        or fgr.classification_code in (
          'general',
          'gc',
          'overall',
          'final_gc',
          'race',
          'race_gc'
        )
        or (
          (select coalesce(stage_count, 1) from last_completed_race) <= 1
          and coalesce(fgr.classification_type, '') not in ('points', 'mountain', 'kom', 'sprint', 'youth')
          and coalesce(fgr.classification_code, '') not in ('points', 'mountain', 'kom', 'sprint', 'youth')
        )
      )
    order by
      fgr.rider_id,
      case
        when fgr.classification_type in ('final_gc', 'gc', 'general', 'overall', 'race_gc', 'race') then 0
        when fgr.classification_code in ('final_gc', 'gc', 'general', 'overall', 'race_gc', 'race') then 1
        else 2
      end,
      fgr.finish_position nulls last
  ),

  final_gc_rows as (
    select
      fgr.rider_id,

      max(
        coalesce(
          nullif(to_jsonb(rd)->>'display_name', ''),
          nullif(to_jsonb(rd)->>'full_name', ''),
          nullif(trim(concat_ws(' ', to_jsonb(rd)->>'first_name', to_jsonb(rd)->>'last_name')), ''),
          fgr.rider_id::text
        )
      ) as rider_name,

      max(
        coalesce(
          crc.assigned_role::text,
          to_jsonb(rd)->>'role'
        )
      ) as role,

      fgr.finish_position,
      coalesce(sum(ar.rider_points), 0)::integer as points
    from final_gc_rows_deduped fgr
    left join public.riders rd
      on rd.id = fgr.rider_id
    left join club_riders_current crc
      on crc.rider_id = fgr.rider_id
    left join public.race_ranking_point_awards ar
      on ar.race_id = (select race_id from last_completed_race)
     and ar.rider_id = fgr.rider_id
     and ar.team_id = p_club_id
    group by
      fgr.rider_id,
      fgr.finish_position
  ),

  final_stage_fallback_rows as (
    select
      ssr.rider_id,
      ssr.rider_name,
      ssr.role,
      ssr.finish_position,
      coalesce(sum(ar.rider_points), 0)::integer as points
    from squad_stage_results ssr
    join last_completed_race lcr
      on lcr.race_id = ssr.race_id
    join last_completed_race_final_stage fs
      on fs.stage_id = ssr.stage_id
    left join public.race_ranking_point_awards ar
      on ar.race_id = lcr.race_id
     and ar.rider_id = ssr.rider_id
     and ar.team_id = p_club_id
    group by ssr.rider_id, ssr.rider_name, ssr.role, ssr.finish_position
  ),

  last_race_rows as (
    select *
    from final_gc_rows

    union all

    select *
    from final_stage_fallback_rows
    where not exists (select 1 from final_gc_rows)
  ),

  next_preparation_candidates as (
    select
      rp.id as race_preparation_id,
      rp.race_id,
      r.name as race_name,
      coalesce(
        to_jsonb(r)->>'race_class',
        to_jsonb(r)->>'class',
        to_jsonb(r)->>'category',
        to_jsonb(r)->>'uci_class',
        to_jsonb(r)->>'race_category',
        ''
      ) as race_category,
      coalesce(
        to_jsonb(r)->>'country_code',
        to_jsonb(r)->>'host_country_code',
        to_jsonb(r)->>'country_iso2',
        to_jsonb(r)->>'country_iso',
        to_jsonb(r)->>'country',
        ''
      ) as race_country_code,
      nullif(to_jsonb(r)->>'start_date', '')::date as start_date,
      nullif(to_jsonb(r)->>'end_date', '')::date as end_date,
      (
        select count(*)::integer
        from public.race_stages s
        where s.race_id = r.id
      ) as stage_count,
      coalesce(
        rp.participating_club_id,
        case
          when nullif(
            coalesce(
              to_jsonb(rp)->'engine_payload_json'->>'participating_club_id',
              to_jsonb(rp)->'engine_payload_json'->>'competing_club_id',
              to_jsonb(rp)->'engine_payload_json'->>'selected_club_id',
              to_jsonb(rp)->'engine_payload_json'->>'squad_club_id',
              to_jsonb(rp)->>'competing_club_id',
              to_jsonb(rp)->>'selected_club_id',
              to_jsonb(rp)->>'squad_club_id'
            ),
            ''
          ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then nullif(
            coalesce(
              to_jsonb(rp)->'engine_payload_json'->>'participating_club_id',
              to_jsonb(rp)->'engine_payload_json'->>'competing_club_id',
              to_jsonb(rp)->'engine_payload_json'->>'selected_club_id',
              to_jsonb(rp)->'engine_payload_json'->>'squad_club_id',
              to_jsonb(rp)->>'competing_club_id',
              to_jsonb(rp)->>'selected_club_id',
              to_jsonb(rp)->>'squad_club_id'
            ),
            ''
          )::uuid
          else null
        end,
        rp.club_id
      ) as participating_club_id,
      lower(coalesce(rp.status::text, '')) as preparation_status,
      lower(coalesce(rp.startlist_status::text, '')) as startlist_status,
      rp.updated_at
    from public.race_preparations rp
    join public.races r
      on r.id = rp.race_id
    cross join current_game_date cgd
    where nullif(to_jsonb(r)->>'start_date', '')::date > cgd.game_date
      and lower(coalesce(to_jsonb(r)->>'status', '')) not in (
        'active',
        'running',
        'started',
        'live',
        'completed',
        'archived',
        'finished',
        'race_finished',
        'race_completed',
        'cancelled',
        'canceled'
      )
      and (
        lower(coalesce(rp.status::text, '')) in (
          'submitted',
          'locked',
          'sent_to_engine',
          'finalised',
          'finalized'
        )
        or lower(coalesce(rp.startlist_status::text, '')) in (
          'submitted',
          'locked',
          'sent_to_engine',
          'finalised',
          'finalized'
        )
      )
  ),

  next_preparation as (
    select *
    from next_preparation_candidates npc
    where npc.participating_club_id = p_club_id
    order by npc.start_date, npc.updated_at desc nulls last, npc.race_preparation_id desc
    limit 1
  ),

  next_selection_rows as (
    select
      rpr.rider_id,
      coalesce(
        nullif(to_jsonb(rd)->>'display_name', ''),
        nullif(to_jsonb(rd)->>'full_name', ''),
        nullif(trim(concat_ws(' ', to_jsonb(rd)->>'first_name', to_jsonb(rd)->>'last_name')), ''),
        rpr.rider_id::text
      ) as rider_name,
      coalesce(
        nullif(nullif(rpr.race_role::text, ''), 'selected'),
        nullif(nullif(to_jsonb(rpr)->>'role', ''), 'selected'),
        nullif(nullif(to_jsonb(rpr)->>'assigned_role', ''), 'selected'),
        nullif(nullif(crc.assigned_role::text, ''), 'selected'),
        nullif(nullif(to_jsonb(rd)->>'role', ''), 'selected'),
        'free_role'
      ) as role,
      round(coalesce(rrc.race_sharpness, 50)::numeric, 2) as race_sharpness,
      case
        when coalesce(rrc.race_sharpness, 50) >= 80 then 'Peak Sharpness'
        when coalesce(rrc.race_sharpness, 50) >= 65 then 'Sharp'
        when coalesce(rrc.race_sharpness, 50) >= 50 then 'Race Ready'
        when coalesce(rrc.race_sharpness, 50) >= 40 then 'Slightly Rusty'
        when coalesce(rrc.race_sharpness, 50) >= 25 then 'Rusty'
        else 'Very Rusty'
      end as race_sharpness_label
    from next_preparation np
    join public.race_preparation_riders rpr
      on rpr.race_preparation_id = np.race_preparation_id
    left join public.riders rd
      on rd.id = rpr.rider_id
    left join club_riders_current crc
      on crc.rider_id = rpr.rider_id
    left join public.rider_race_condition rrc
      on rrc.rider_id = rpr.rider_id
    order by rpr.created_at nulls last, rider_name
    limit 12
  )

  select jsonb_build_object(
    'seasonTrend', (
      select jsonb_agg(
        jsonb_build_object(
          'label', ml.month_label,
          'value', coalesce(pbm.points, 0)
        )
        order by ml.month_number
      )
      from month_labels ml
      left join points_by_month pbm
        on pbm.month_number = ml.month_number
    ),

    'podiumChart', (
      select jsonb_build_array(
        jsonb_build_object('label', 'Wins', 'value', coalesce(s.wins, 0)),
        jsonb_build_object('label', '2nd', 'value', (
          select count(*)::integer from squad_stage_results where finish_position = 2
        )),
        jsonb_build_object('label', '3rd', 'value', (
          select count(*)::integer from squad_stage_results where finish_position = 3
        )),
        jsonb_build_object('label', 'Top10', 'value', coalesce(s.top10s, 0)),
        jsonb_build_object('label', 'Top20', 'value', (
          select count(*)::integer from squad_stage_results where finish_position between 1 and 20
        ))
      )
      from summary s
    ),

    'summary', (
      select jsonb_build_object(
        'wins', coalesce(s.wins, 0),
        'podiums', coalesce(s.podiums, 0),
        'top10s', coalesce(s.top10s, 0),
        'bestGC', coalesce(nullif(s.best_gc, 0), 0)
      )
      from summary s
    ),

    'lastTeamRace', jsonb_build_object(
      'raceId', (select race_id from last_completed_race),
      'raceName', (select race_name from last_completed_race),
      'raceCategory', (select nullif(race_category, '') from last_completed_race),
      'raceCountryCode', (select nullif(race_country_code, '') from last_completed_race),
      'stageDate', (select coalesce(end_date, start_date) from last_completed_race),
      'stageLabel', (
        select case
          when coalesce(stage_count, 1) > 1 then 'Final GC'
          else 'Race result'
        end
        from last_completed_race
      ),
      'routeLabel', null,
      'stageCount', (select stage_count from last_completed_race),
      'rows', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'riderId', lrr.rider_id,
            'riderName', lrr.rider_name,
            'role', lrr.role,
            'position', lrr.finish_position,
            'resultLabel', case
              when lrr.finish_position is null then '—'
              when lrr.finish_position % 100 between 11 and 13 then lrr.finish_position::text || 'th'
              when lrr.finish_position % 10 = 1 then lrr.finish_position::text || 'st'
              when lrr.finish_position % 10 = 2 then lrr.finish_position::text || 'nd'
              when lrr.finish_position % 10 = 3 then lrr.finish_position::text || 'rd'
              else lrr.finish_position::text || 'th'
            end,
            'points', lrr.points
          )
          order by lrr.finish_position nulls last, lrr.rider_name
        )
        from (
          select *
          from last_race_rows
          order by finish_position nulls last, rider_name
          limit 8
        ) lrr
      ), '[]'::jsonb)
    ),

    'nextRaceSelection', jsonb_build_object(
      'raceId', (select race_id from next_preparation),
      'raceName', (select race_name from next_preparation),
      'raceCategory', (select nullif(race_category, '') from next_preparation),
      'raceCountryCode', (select nullif(race_country_code, '') from next_preparation),
      'stageDate', (select start_date from next_preparation),
      'stageLabel', (
        select case
          when coalesce(stage_count, 1) > 1 then stage_count::text || ' stages'
          else 'One-day race'
        end
        from next_preparation
      ),
      'routeLabel', case
        when exists (select 1 from next_preparation) then 'Race Plan submitted'
        else null
      end,
      'stageCount', (select stage_count from next_preparation),
      'rows', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'riderId', nsr.rider_id,
            'riderName', nsr.rider_name,
            'role', nsr.role,
            'raceName', (select race_name from next_preparation),
            'stageLabel', (
              select case
                when coalesce(stage_count, 1) > 1 then stage_count::text || ' stages'
                else 'One-day race'
              end
              from next_preparation
            ),
            'raceSharpness', nsr.race_sharpness,
            'raceSharpnessLabel', nsr.race_sharpness_label
          )
          order by nsr.rider_name
        )
        from next_selection_rows nsr
      ), '[]'::jsonb)
    ),

    'raceTypeSnapshot', (
      select jsonb_build_array(
        jsonb_build_object('label', 'One-day classics', 'value', coalesce(rts.one_day_classics, 0)),
        jsonb_build_object('label', 'Stage finishes', 'value', coalesce(rts.stage_finishes, 0)),
        jsonb_build_object('label', 'Mountain days', 'value', coalesce(rts.mountain_days, 0)),
        jsonb_build_object('label', 'Time trials', 'value', coalesce(rts.time_trials, 0))
      )
      from race_type_snapshot rts
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_overview_attention_items_v1(p_club_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  /*
    Overview Attention v13:
    - The Attention warning behaves like before.
    - It is removed from the top Attention area after the user opens/reads the notification.
    - Therefore only unread user_notifications are returned here.
  */
  with resolved_user as (
    select coalesce(
      p_user_id,
      auth.uid(),
      nullif(to_jsonb(c)->>'owner_user_id', '')::uuid
    ) as user_id
    from public.clubs c
    where c.id = p_club_id
    union all
    select coalesce(p_user_id, auth.uid()) as user_id
    where p_club_id is null
    limit 1
  ),
  unread_notifications as (
    select
      n.id as notification_id,
      n.title,
      n.message,
      n.action_url,
      n.payload_json,
      nt.priority,
      nt.code,
      n.created_at,
      case
        when lower(coalesce(n.payload_json->>'severity', '')) in ('danger', 'warning', 'info', 'success')
          then lower(n.payload_json->>'severity')
        when coalesce(nt.priority, 0) >= 4 then 'danger'
        when coalesce(nt.priority, 0) >= 3 then 'warning'
        else 'info'
      end as alert_level
    from resolved_user ru
    join public.user_notifications un
      on un.user_id = ru.user_id
     and un.deleted_at is null
     and lower(coalesce(un.status, 'unread')) = 'unread'
    join public.notifications n
      on n.id = un.notification_id
    join public.notification_types nt
      on nt.id = n.type_id
    where ru.user_id is not null
      and (n.expires_at is null or n.expires_at > now())
      and coalesce(lower(n.payload_json->>'resolved'), 'false') not in ('true', '1', 'yes')
      and n.payload_json->>'resolved_at' is null
      and (
        p_club_id is null
        or n.payload_json->>'club_id' is null
        or n.payload_json->>'club_id' = p_club_id::text
      )
    order by
      case
        when lower(coalesce(n.payload_json->>'severity', '')) = 'danger' then 1
        when lower(coalesce(n.payload_json->>'severity', '')) = 'warning' then 2
        when lower(coalesce(n.payload_json->>'severity', '')) = 'info' then 3
        else 4
      end,
      coalesce(nt.priority, 0) desc,
      n.created_at desc
    limit greatest(1, coalesce(p_limit, 6))
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', 'notification:' || notification_id::text,
        'label', title,
        'level', alert_level,
        'href',
          case
            when coalesce(action_url, '') = '' then '#/dashboard/notifications'
            when action_url like '#/dashboard/%' then action_url
            when action_url like '/dashboard/%' then '#' || action_url
            else '#/dashboard/notifications'
          end
      )
      order by created_at desc
    ),
    '[]'::jsonb
  )
  from unread_notifications;
$function$
;

CREATE OR REPLACE FUNCTION public._clamp_int(p_value integer, p_min integer, p_max integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select least(greatest(p_value, p_min), p_max);
$function$
;

CREATE OR REPLACE FUNCTION public.get_stage_club_family_ids_v1(p_club_id uuid)
 RETURNS TABLE(club_id uuid)
 LANGUAGE sql
 STABLE
AS $function$
  with root as (
    select coalesce(c.parent_club_id, c.id) as main_club_id
    from public.clubs c
    where c.id = p_club_id
    limit 1
  )
  select c.id
  from public.clubs c
  join root r on true
  where c.id = r.main_club_id
     or c.parent_club_id = r.main_club_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_stage_equipment_wear_status_v1(p_stage_id uuid, p_club_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  with candidate_columns as (
    select
      c.table_schema,
      c.table_name,
      c.column_name,
      c.data_type,
      c.udt_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and (
        c.table_name ilike '%asset%'
        or c.table_name ilike '%equipment%'
        or c.table_name ilike '%supply%'
        or c.table_name ilike '%inventory%'
        or c.table_name ilike '%garage%'
        or c.column_name ilike '%condition%'
        or c.column_name ilike '%durability%'
        or c.column_name ilike '%wear%'
      )
  ), candidate_tables as (
    select
      table_name,
      jsonb_agg(jsonb_build_object('column_name', column_name, 'data_type', data_type, 'udt_name', udt_name) order by column_name) as columns
    from candidate_columns
    group by table_name
  ), functions as (
    select
      p.oid::regprocedure::text as function_signature,
      p.proname as function_name
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname ilike '%equipment%'
        or p.proname ilike '%asset%'
        or p.proname ilike '%condition%'
        or p.proname ilike '%wear%'
        or p.proname ilike '%maintenance%'
      )
  )
  select jsonb_build_object(
    'status', 'ok',
    'stage_id', p_stage_id,
    'club_id', p_club_id,
    'important_note', 'This is discovery only. It does not reduce condition. Use it to identify the real inventory/asset tables before implementing wear writes.',
    'candidate_tables', coalesce((select jsonb_agg(jsonb_build_object('table_name', table_name, 'columns', columns) order by table_name) from candidate_tables), '[]'::jsonb),
    'candidate_functions', coalesce((select jsonb_agg(jsonb_build_object('function_signature', function_signature, 'function_name', function_name) order by function_name) from functions), '[]'::jsonb)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_latest_stage_run_id_v1(p_stage_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select sim.id
  from public.race_stage_simulation_runs sim
  where sim.stage_id = p_stage_id
  order by coalesce((to_jsonb(sim)->>'created_at')::timestamptz, now()) desc
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_result_position_v1(p_data jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select public.sponsor_jsonb_int_first_v1(
    p_data,
    array[
      'position',
      'rank',
      'placing',
      'place',
      'finish_position',
      'result_position',
      'stage_position',
      'classification_position',
      'classification_rank',
      'overall_position',
      'overall_rank',
      'gc_position',
      'gc_rank'
    ]
  );
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_deterministic_unit_v1(p_seed text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (
    ('x' || substr(md5(coalesce(p_seed, '')), 1, 8))::bit(32)::bigint::numeric
    / 4294967295.0
  );
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_alive_tactical_events_for_stage_v1(p_stage_id uuid, p_club_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(event_order integer, event_km numeric, rider_name text, interaction_type text, outcome_type text, commentary text, stamina_cost_hint numeric, gap_seconds integer, metadata jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  with scope as (
    select club_id from public.race_engine_club_scope_v1(p_club_id)
  )
  select
    e.event_order,
    e.event_km,
    e.rider_name,
    e.interaction_type,
    e.outcome_type,
    e.commentary,
    e.stamina_cost_hint,
    e.gap_seconds,
    e.metadata
  from public.race_engine_stage_interaction_events e
  where e.stage_id = p_stage_id
    and (
      p_club_id is null
      or e.club_id in (select club_id from scope)
      or e.club_id is null
    )
  order by e.event_order;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_interaction_type_from_report_v1(p_event_type text, p_commentary text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when lower(coalesce(p_event_type, '') || ' ' || coalesce(p_commentary, '')) like '%breakaway%' then 'tactical_breakaway_attempt'
    when lower(coalesce(p_event_type, '') || ' ' || coalesce(p_commentary, '')) like '%attack%' then 'tactical_attack'
    when lower(coalesce(p_event_type, '') || ' ' || coalesce(p_commentary, '')) like '%protect%' then 'tactical_protection'
    when lower(coalesce(p_event_type, '') || ' ' || coalesce(p_commentary, '')) like '%avoid%' or lower(coalesce(p_event_type, '') || ' ' || coalesce(p_commentary, '')) like '%safe%' then 'tactical_safety'
    when lower(coalesce(p_event_type, '') || ' ' || coalesce(p_commentary, '')) like '%sprint%' then 'tactical_sprint'
    when lower(coalesce(p_event_type, '') || ' ' || coalesce(p_commentary, '')) like '%lead%' then 'tactical_leadout'
    when lower(coalesce(p_event_type, '') || ' ' || coalesce(p_commentary, '')) like '%chase%' then 'tactical_chase'
    when lower(coalesce(p_event_type, '') || ' ' || coalesce(p_commentary, '')) like '%tempo%' then 'tactical_tempo'
    else 'tactical_command'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_outcome_type_from_report_v1(p_event_type text, p_commentary text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when lower(coalesce(p_commentary, '')) like '%closed down%' or lower(coalesce(p_commentary, '')) like '%brought back%' then 'closed_down_or_caught'
    when lower(coalesce(p_commentary, '')) like '%joins%' and lower(coalesce(p_commentary, '')) like '%breakaway%' then 'joined_breakaway'
    when lower(coalesce(p_commentary, '')) like '%attacks%' then 'attack_visible'
    when lower(coalesce(p_event_type, '')) like '%protection%' or lower(coalesce(p_commentary, '')) like '%protect%' then 'protection_work_visible'
    when lower(coalesce(p_event_type, '')) like '%safety%' or lower(coalesce(p_commentary, '')) like '%avoid%' then 'risk_reduction_visible'
    when lower(coalesce(p_event_type, '')) like '%sprint%' or lower(coalesce(p_commentary, '')) like '%sprint%' then 'sprint_positioning'
    else 'visible_tactical_command'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_hash_roll_v1(p_seed text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (
    (('x' || substr(md5(coalesce(p_seed, '')), 1, 12))::bit(48)::bigint)::numeric
    / 281474976710655::numeric
  )::numeric(10,6);
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_stage_command_outcomes_for_stage_v1(p_stage_id uuid, p_only_team_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(source_event_order integer, event_km numeric, phase_number integer, rider_name text, command_code text, outcome_type text, tactical_success boolean, stamina_delta numeric, fatigue_delta numeric, attack_attempt_delta integer, breakaway_km_delta numeric, support_work_delta numeric, protection_received_delta numeric, adjusted_incident_risk_pct numeric, incident_triggered boolean, incident_type text, adjusted_mechanical_risk_pct numeric, mechanical_triggered boolean, mechanical_type text, commentary text, metadata jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with scope as (
    select * from public.race_engine_club_scope_v1(p_only_team_id)
  )
  select
    o.source_event_order,
    o.event_km,
    o.phase_number,
    o.rider_name,
    o.command_code,
    o.outcome_type,
    o.tactical_success,
    o.stamina_delta,
    o.fatigue_delta,
    o.attack_attempt_delta,
    o.breakaway_km_delta,
    o.support_work_delta,
    o.protection_received_delta,
    round(o.adjusted_incident_risk * 100, 4) as adjusted_incident_risk_pct,
    o.incident_triggered,
    o.incident_type,
    round(o.adjusted_mechanical_risk * 100, 4) as adjusted_mechanical_risk_pct,
    o.mechanical_triggered,
    o.mechanical_type,
    o.commentary,
    o.metadata
  from public.race_engine_stage_command_outcomes o
  where o.stage_id = p_stage_id
    and (
      p_only_team_id is null
      or exists (select 1 from scope s where s.club_id = o.club_id)
    )
  order by o.source_event_order, o.rider_name;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_stage_command_delta_application_queue_v1(p_stage_id uuid, p_team_id uuid)
 RETURNS TABLE(stage_id uuid, club_id uuid, rider_id uuid, rider_name text, event_count integer, stamina_delta_total numeric, fatigue_delta_total numeric, attack_attempts_added integer, breakaway_km_added numeric, support_work_added numeric, protection_received_added numeric, incident_count integer, mechanical_count integer, application_status text, source_version text, prepared_at timestamp with time zone, consumed_at timestamp with time zone, official_delta_json jsonb, metadata jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    a.stage_id,
    a.club_id,
    a.rider_id,
    a.rider_name,
    a.event_count,
    a.stamina_delta_total,
    a.fatigue_delta_total,
    a.attack_attempts_added,
    a.breakaway_km_added,
    a.support_work_added,
    a.protection_received_added,
    a.incident_count,
    a.mechanical_count,
    a.application_status,
    a.source_version,
    a.prepared_at,
    a.consumed_at,
    a.official_delta_json,
    a.metadata
  from public.race_engine_stage_command_outcome_delta_applications a
  where a.stage_id = p_stage_id
    and a.source_version = 'v12_delta_application_queue'
    and exists (
      select 1
      from public.race_engine_club_scope_v1(p_team_id) s
      where s.club_id = a.club_id
    )
  order by a.rider_name;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_stage_command_delta_queue_for_finalizer_v1(p_stage_id uuid, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(application_id uuid, stage_id uuid, club_id uuid, rider_id uuid, rider_name text, event_count integer, stamina_delta_total numeric, fatigue_delta_total numeric, attack_attempts_added integer, breakaway_km_added numeric, support_work_added numeric, protection_received_added numeric, incident_count integer, mechanical_count integer, application_status text, source_version text, prepared_at timestamp with time zone, consumed_at timestamp with time zone, official_delta_json jsonb, metadata jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  with scope as (
    select s.club_id
    from public.race_engine_club_scope_v1(p_team_id) s
    where p_team_id is not null
    union
    select distinct a.club_id
    from public.race_engine_stage_command_outcome_delta_applications a
    where p_team_id is null
      and a.stage_id = p_stage_id
  )
  select
    a.id as application_id,
    a.stage_id,
    a.club_id,
    a.rider_id,
    a.rider_name,
    a.event_count,
    a.stamina_delta_total,
    a.fatigue_delta_total,
    a.attack_attempts_added,
    a.breakaway_km_added,
    a.support_work_added,
    a.protection_received_added,
    a.incident_count,
    a.mechanical_count,
    a.application_status,
    a.source_version,
    a.prepared_at,
    a.consumed_at,
    a.official_delta_json,
    a.metadata
  from public.race_engine_stage_command_outcome_delta_applications a
  where a.stage_id = p_stage_id
    and exists (select 1 from scope sc where sc.club_id = a.club_id)
  order by a.rider_name;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_stage_command_delta_official_state_verify_v1(p_stage_id uuid, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(stage_id uuid, club_id uuid, rider_id uuid, rider_name text, role_code text, stamina_spent numeric, finish_stamina numeric, fatigue_gain numeric, fatigue_after_stage numeric, attack_attempts integer, breakaway_km numeric, support_work_done_score numeric, protection_received_score numeric, incident_risk_score numeric, mechanical_risk_score numeric, stage_status text, finish_position integer, gap_seconds integer, v15_metadata jsonb, queue_status text, queue_consumed_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    rs.stage_id,
    rs.team_id as club_id,
    rs.rider_id,
    qa.rider_name,
    rs.role_code,
    rs.stamina_spent,
    rs.finish_stamina,
    rs.fatigue_gain,
    rs.fatigue_after_stage,
    rs.attack_attempts,
    rs.breakaway_km,
    rs.support_work_done_score,
    rs.protection_received_score,
    rs.incident_risk_score,
    rs.mechanical_risk_score,
    rs.stage_status,
    rs.finish_position,
    rs.gap_seconds,
    rs.metadata->'v15_command_delta_application' as v15_metadata,
    qa.application_status as queue_status,
    qa.consumed_at as queue_consumed_at
  from public.race_stage_rider_states rs
  left join public.race_engine_stage_command_outcome_delta_applications qa
    on qa.stage_id = rs.stage_id
   and qa.rider_id = rs.rider_id
   and qa.club_id = rs.team_id
  where rs.stage_id = p_stage_id
    and (p_team_id is null or rs.team_id = p_team_id or qa.metadata->>'prepared_for_team_id' = p_team_id::text)
    and qa.id is not null
  order by qa.rider_name;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_display_identities_v1(p_club_ids uuid[])
 RETURNS TABLE(club_id uuid, base_name text, display_name text, season_display_name text, original_club_name text, full_display_name text, locked_by_sponsor boolean, locked_until_game_date date, source_sponsor_id uuid, country_code text, club_type text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select di.*
  from unnest(coalesce(p_club_ids, array[]::uuid[])) as ids(club_id)
  cross join lateral public.get_club_display_identity_v1(ids.club_id) di;
$function$
;

CREATE OR REPLACE FUNCTION public.club_current_display_name_v1(p_club_id uuid, p_fallback_name text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (
      select nullif(di.display_name, '')
      from public.get_club_display_identity_v1(p_club_id) di
      limit 1
    ),
    nullif(p_fallback_name, ''),
    (
      select nullif(c.name, '')
      from public.clubs c
      where c.id = p_club_id
      limit 1
    ),
    'Team'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_display_names_v1(p_club_ids uuid[])
 RETURNS TABLE(club_id uuid, display_name text, original_name text, full_display_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    di.club_id,
    di.display_name,
    di.original_club_name as original_name,
    di.full_display_name
  from unnest(coalesce(p_club_ids, array[]::uuid[])) as ids(club_id)
  cross join lateral public.get_club_display_identity_v1(ids.club_id) di;
$function$
;

CREATE OR REPLACE FUNCTION public.club_history_display_name_v1(p_club_id uuid, p_season_number integer DEFAULT NULL::integer, p_fallback_name text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (
      select nullif(di.full_display_name, '')
      from public.get_club_display_identity_v1(p_club_id) di
      limit 1
    ),
    nullif(p_fallback_name, ''),
    (
      select nullif(c.name, '')
      from public.clubs c
      where c.id = p_club_id
      limit 1
    ),
    'Team'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_club_inactivity_statuses_v1(p_club_ids uuid[])
 RETURNS TABLE(club_id uuid, public_inactivity_status text, inactivity_days_snapshot integer, season_end_transition_pending boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    c.id as club_id,
    case
      when c.inactivity_status in ('inactive', 'season_end_removal_pending')
        then c.inactivity_status
      else null
    end as public_inactivity_status,
    case
      when c.inactivity_status in ('inactive', 'season_end_removal_pending')
        then c.inactivity_days_snapshot
      else null
    end as inactivity_days_snapshot,
    case
      when c.inactivity_status = 'season_end_removal_pending'
        then coalesce(c.season_end_transition_pending, false)
      else false
    end as season_end_transition_pending
  from public.clubs c
  where c.id = any(p_club_ids)
    and c.deleted_at is null;
$function$
;

CREATE OR REPLACE FUNCTION public.jsonb_object_key_count_v1(p_value jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select count(*)::integer
  from jsonb_object_keys(coalesce(p_value, '{}'::jsonb));
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_plan_readiness_v1(p_race_preparation_id uuid DEFAULT NULL::uuid, p_race_id uuid DEFAULT NULL::uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(race_stage_plan_id uuid, race_preparation_id uuid, race_id uuid, stage_id uuid, stage_number integer, stage_date date, status text, last_saved_at timestamp with time zone, submitted_at timestamp with time zone, rider_role_count integer, rider_equipment_count integer, rider_supply_count integer, rider_individual_tactic_count integer, team_tactic_rider_count integer, has_saved_plan boolean, has_core_rider_plan boolean, has_supply_plan boolean, has_tactical_plan boolean, is_placeholder boolean, is_usable_for_engine boolean, readiness_status text, readiness_label text, metadata jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with counted as (
    select
      rsp.id as race_stage_plan_id,
      rsp.race_preparation_id,
      rsp.race_id,
      rsp.stage_id,
      rsp.stage_number,
      rsp.stage_date,
      rsp.status,
      rsp.last_saved_at,
      rsp.submitted_at,

      public.jsonb_object_key_count_v1(rsp.rider_roles_json) as rider_role_count,
      public.jsonb_object_key_count_v1(rsp.rider_equipment_json) as rider_equipment_count,
      public.jsonb_object_key_count_v1(rsp.rider_supplies_json) as rider_supply_count,
      public.jsonb_object_key_count_v1(rsp.rider_individual_tactics_json) as rider_individual_tactic_count,
      public.jsonb_object_key_count_v1(rsp.team_tactic_json -> 'individual_tactics_by_rider') as team_tactic_rider_count,

      rsp.metadata
    from public.race_stage_plans rsp
    where (p_race_preparation_id is null or rsp.race_preparation_id = p_race_preparation_id)
      and (p_race_id is null or rsp.race_id = p_race_id)
      and (p_stage_id is null or rsp.stage_id = p_stage_id)
  )
  select
    c.race_stage_plan_id,
    c.race_preparation_id,
    c.race_id,
    c.stage_id,
    c.stage_number,
    c.stage_date,
    c.status,
    c.last_saved_at,
    c.submitted_at,

    c.rider_role_count,
    c.rider_equipment_count,
    c.rider_supply_count,
    c.rider_individual_tactic_count,
    c.team_tactic_rider_count,

    (c.last_saved_at is not null) as has_saved_plan,

    (
      c.rider_role_count > 0
      and c.rider_equipment_count > 0
    ) as has_core_rider_plan,

    (c.rider_supply_count > 0) as has_supply_plan,

    (
      c.rider_individual_tactic_count > 0
      or c.team_tactic_rider_count > 0
    ) as has_tactical_plan,

    (
      c.last_saved_at is null
      and c.rider_role_count = 0
      and c.rider_equipment_count = 0
      and c.rider_supply_count = 0
      and c.rider_individual_tactic_count = 0
      and c.team_tactic_rider_count = 0
    ) as is_placeholder,

    (
      c.last_saved_at is not null
      and c.rider_role_count > 0
      and c.rider_equipment_count > 0
      and (
        c.rider_individual_tactic_count > 0
        or c.team_tactic_rider_count > 0
      )
    ) as is_usable_for_engine,

    case
      when c.last_saved_at is null
        then 'missing_stage_plan_placeholder'

      when c.rider_role_count = 0
       and c.rider_equipment_count = 0
       and c.rider_supply_count = 0
       and c.rider_individual_tactic_count = 0
       and c.team_tactic_rider_count = 0
        then 'saved_but_empty'

      when c.rider_role_count > 0
       and c.rider_equipment_count > 0
       and c.rider_supply_count = 0
       and (
         c.rider_individual_tactic_count > 0
         or c.team_tactic_rider_count > 0
       )
        then 'saved_with_plan_data_no_supplies'

      when c.rider_role_count > 0
       and c.rider_equipment_count > 0
       and (
         c.rider_individual_tactic_count > 0
         or c.team_tactic_rider_count > 0
       )
        then 'saved_with_plan_data'

      else 'incomplete_stage_plan'
    end as readiness_status,

    case
      when c.last_saved_at is null
        then 'Missing Stage Plan'
      when c.rider_role_count = 0
       and c.rider_equipment_count = 0
       and c.rider_supply_count = 0
       and c.rider_individual_tactic_count = 0
       and c.team_tactic_rider_count = 0
        then 'Saved but empty'
      when c.rider_role_count > 0
       and c.rider_equipment_count > 0
       and c.rider_supply_count = 0
       and (
         c.rider_individual_tactic_count > 0
         or c.team_tactic_rider_count > 0
       )
        then 'Saved, no supplies'
      when c.rider_role_count > 0
       and c.rider_equipment_count > 0
       and (
         c.rider_individual_tactic_count > 0
         or c.team_tactic_rider_count > 0
       )
        then 'Saved'
      else 'Incomplete Stage Plan'
    end as readiness_label,

    c.metadata
  from counted c
  order by c.stage_date, c.stage_number;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_plan_readiness_summary_v1(p_race_preparation_id uuid DEFAULT NULL::uuid, p_race_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(race_preparation_id uuid, race_id uuid, total_stage_plans integer, saved_stage_plans integer, usable_stage_plans integer, missing_stage_plans integer, saved_without_supplies integer, saved_but_empty integer, incomplete_stage_plans integer, all_required_stage_plans_saved boolean, has_missing_stage_plans boolean, has_problem_stage_plans boolean, readiness_status text, readiness_label text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with rows as (
    select *
    from public.race_stage_plan_readiness_v1(
      p_race_preparation_id,
      p_race_id,
      null
    )
  ),
  grouped as (
    select
      r.race_preparation_id,
      r.race_id,
      count(*)::integer as total_stage_plans,

      count(*) filter (
        where r.has_saved_plan
      )::integer as saved_stage_plans,

      count(*) filter (
        where r.is_usable_for_engine
      )::integer as usable_stage_plans,

      count(*) filter (
        where r.readiness_status = 'missing_stage_plan_placeholder'
      )::integer as missing_stage_plans,

      count(*) filter (
        where r.readiness_status = 'saved_with_plan_data_no_supplies'
      )::integer as saved_without_supplies,

      count(*) filter (
        where r.readiness_status = 'saved_but_empty'
      )::integer as saved_but_empty,

      count(*) filter (
        where r.readiness_status = 'incomplete_stage_plan'
      )::integer as incomplete_stage_plans
    from rows r
    group by r.race_preparation_id, r.race_id
  )
  select
    g.race_preparation_id,
    g.race_id,
    g.total_stage_plans,
    g.saved_stage_plans,
    g.usable_stage_plans,
    g.missing_stage_plans,
    g.saved_without_supplies,
    g.saved_but_empty,
    g.incomplete_stage_plans,

    (g.missing_stage_plans = 0 and g.saved_but_empty = 0 and g.incomplete_stage_plans = 0) as all_required_stage_plans_saved,
    (g.missing_stage_plans > 0) as has_missing_stage_plans,
    (g.saved_but_empty > 0 or g.incomplete_stage_plans > 0) as has_problem_stage_plans,

    case
      when g.missing_stage_plans > 0
        then 'missing_stage_plans'
      when g.saved_but_empty > 0 or g.incomplete_stage_plans > 0
        then 'problem_stage_plans'
      when g.saved_without_supplies > 0
        then 'saved_with_supply_warnings'
      else 'all_stage_plans_saved'
    end as readiness_status,

    case
      when g.missing_stage_plans > 0
        then 'Missing Stage Plans'
      when g.saved_but_empty > 0 or g.incomplete_stage_plans > 0
        then 'Problem Stage Plans'
      when g.saved_without_supplies > 0
        then 'Saved, supply warnings'
      else 'All Stage Plans Saved'
    end as readiness_label
  from grouped g
  order by g.race_preparation_id, g.race_id;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_normalize_stage_role_code_v1(p_role text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    case lower(trim(coalesce(p_role, 'free_role')))
      when 'team_leader_gc' then 'team_leader_gc'
      when 'leader' then 'team_leader_gc'
      when 'gc_leader' then 'team_leader_gc'

      when 'sprinter' then 'sprinter'

      when 'lead_out' then 'lead_out'
      when 'leadout' then 'lead_out'
      when 'lead_out_rider' then 'lead_out'

      when 'sprint_train' then 'sprint_train'
      when 'sprint_train_rider' then 'sprint_train'

      when 'climber' then 'climber'

      when 'mountain_domestique' then 'mountain_domestique'

      when 'helper_domestique' then 'helper_domestique'
      when 'domestique' then 'helper_domestique'
      when 'helper' then 'helper_domestique'

      when 'breakaway' then 'breakaway'
      when 'breakaway_rider' then 'breakaway'

      when 'breakaway_chaser' then 'breakaway_chaser'

      when 'rouleur' then 'rouleur'

      when 'protected' then 'protected'
      when 'protected_rider' then 'protected'

      when 'free_role' then 'free_role'
      when 'all-rounder' then 'free_role'
      when 'all_rounder' then 'free_role'

      else 'free_role'
    end;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_rider_start_freshness_v1(p_fatigue numeric, p_race_sharpness numeric)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  select round(
    greatest(
      50,
      least(
        100,
        100
        - (greatest(0, least(100, coalesce(p_fatigue, 0))) * 0.50)
        + ((greatest(0, least(100, coalesce(p_race_sharpness, 50))) - 50) * 0.25)
      )
    ),
    2
  );
$function$
;

CREATE OR REPLACE FUNCTION public.club_has_active_team_doctor_v1(p_club_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1
    from public.club_staff cs
    where cs.club_id = p_club_id
      and cs.is_active = true
      and lower(coalesce(cs.role_type, '')) in (
        'team_doctor',
        'doctor',
        'medical_doctor'
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public._restart_column_exists_v1(p_schema text, p_table text, p_column text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = p_schema
      and table_name = p_table
      and column_name = p_column
  );
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_replay_storage_health_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with table_size as (
    select
      pg_total_relation_size('public.race_stage_replay_frames'::regclass) as total_bytes,
      pg_relation_size('public.race_stage_replay_frames'::regclass) as table_bytes,
      pg_indexes_size('public.race_stage_replay_frames'::regclass) as index_bytes
  ),
  row_counts as (
    select
      count(*)::integer as replay_frame_rows,
      count(distinct stage_id)::integer as stages_with_replay,
      count(distinct simulation_run_id)::integer as simulation_runs_with_replay
    from public.race_stage_replay_frames
  ),
  stage_audit as (
    select
      count(*)::integer as audited_stage_count,
      count(*) filter (where retention_status = 'retention_candidate')::integer as retention_candidate_stage_count,
      count(*) filter (where retention_status = 'manual_review')::integer as manual_review_stage_count,
      count(*) filter (where retention_status = 'review_no_run_timestamp')::integer as no_timestamp_stage_count,
      coalesce(sum(estimated_replay_row_bytes) filter (where retention_status = 'retention_candidate'), 0)::bigint as estimated_candidate_bytes,
      coalesce(sum(estimated_replay_row_bytes) filter (where retention_status = 'manual_review'), 0)::bigint as estimated_manual_review_bytes
    from public.race_engine_replay_storage_by_stage_v1
  )
  select jsonb_build_object(
    'status', 'completed',
    'table', 'race_stage_replay_frames',

    'total_size', pg_size_pretty(table_size.total_bytes),
    'total_bytes', table_size.total_bytes,

    'table_size', pg_size_pretty(table_size.table_bytes),
    'table_bytes', table_size.table_bytes,

    'index_size', pg_size_pretty(table_size.index_bytes),
    'index_bytes', table_size.index_bytes,

    'replay_frame_rows', row_counts.replay_frame_rows,
    'stages_with_replay', row_counts.stages_with_replay,
    'simulation_runs_with_replay', row_counts.simulation_runs_with_replay,

    'audited_stage_count', stage_audit.audited_stage_count,
    'retention_candidate_stage_count', stage_audit.retention_candidate_stage_count,
    'manual_review_stage_count', stage_audit.manual_review_stage_count,
    'no_timestamp_stage_count', stage_audit.no_timestamp_stage_count,

    'estimated_candidate_size', pg_size_pretty(stage_audit.estimated_candidate_bytes),
    'estimated_candidate_bytes', stage_audit.estimated_candidate_bytes,

    'estimated_manual_review_size', pg_size_pretty(stage_audit.estimated_manual_review_bytes),
    'estimated_manual_review_bytes', stage_audit.estimated_manual_review_bytes,

    'recommendation',
      'Do not delete yet. First review candidate stages and confirm UI fallback for archived replay.'
  )
  from table_size, row_counts, stage_audit;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_production_guard_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (
      select jsonb_build_object(
        'status', 'checked',
        'stage_id', i.stage_id,
        'race_id', i.race_id,
        'race_name', i.race_name,
        'race_category', i.race_category,
        'stage_number', i.stage_number,
        'stage_date', i.stage_date,
        'stage_format', i.stage_format,
        'stage_status', i.stage_status,

        'simulation_run_rows', i.simulation_run_rows,
        'completed_simulation_run_rows', i.completed_simulation_run_rows,
        'running_simulation_run_rows', i.running_simulation_run_rows,
        'latest_run_timestamp', i.latest_run_timestamp,

        'stage_result_rows', i.stage_result_rows,
        'stage_point_result_rows', i.stage_point_result_rows,
        'classification_rows', i.classification_rows,
        'ranking_award_rows', i.ranking_award_rows,
        'prize_award_rows', i.prize_award_rows,
        'report_event_rows', i.report_event_rows,
        'replay_frame_rows', i.replay_frame_rows,
        'rider_state_rows', i.rider_state_rows,
        'team_state_rows', i.team_state_rows,

        'has_completed_run', i.has_completed_run,
        'has_official_outputs', i.has_official_outputs,
        'has_report_events', i.has_report_events,
        'has_replay_frames', i.has_replay_frames,
        'has_engine_state_rows', i.has_engine_state_rows,
        'should_block_normal_simulation', i.should_block_normal_simulation,
        'output_integrity_status', i.output_integrity_status,

        'recommendation',
          case
            when i.should_block_normal_simulation = true
            then 'Do not simulate this stage through normal runner. Return saved outputs unless protected admin reset/rebuild is explicitly used.'
            when i.has_report_events = true
            then 'Only static/report events exist. These do not block normal simulation.'
            else 'No simulation run, official outputs, replay, or engine state detected. Stage can be considered for normal backend simulation if schedule/entry rules allow it.'
          end
      )
      from public.race_engine_stage_output_integrity_v1 i
      where i.stage_id = p_stage_id
      limit 1
    ),
    jsonb_build_object(
      'status', 'not_found',
      'stage_id', p_stage_id,
      'should_block_normal_simulation', true,
      'recommendation', 'Stage not found. Block simulation until stage_id is corrected.'
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_homepage_reviews_v1(p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, reviewer_name text, rating smallint, review_text text, approved_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    r.id,
    r.reviewer_name,
    r.rating,
    r.review_text,
    r.approved_at,
    r.created_at
  from public.homepage_player_reviews r
  where r.status = 'approved'
  order by coalesce(r.approved_at, r.created_at) desc, r.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_unsolicited_transfer_bids_v1()
 RETURNS TABLE(id uuid, rider_id uuid, rider_name text, buyer_club_id uuid, seller_club_id uuid, seller_club_name text, offer_amount_cash bigint, status text, ai_decision text, counteroffer_amount_cash bigint, market_value_snapshot bigint, offered_on_game_date date, expires_on_game_date date, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    ub.id,
    ub.rider_id,
    coalesce(
      nullif(trim(concat_ws(' ', nullif(r.first_name, ''), nullif(r.last_name, ''))), ''),
      nullif(r.display_name, ''),
      r.id::text
    ) as rider_name,
    ub.buyer_club_id,
    ub.seller_club_id,
    seller.name as seller_club_name,
    ub.offer_amount_cash,
    ub.status,
    ub.ai_decision,
    ub.counteroffer_amount_cash,
    ub.market_value_snapshot,
    ub.offered_on_game_date,
    ub.expires_on_game_date,
    ub.created_at
  from public.rider_unsolicited_transfer_bids ub
  join public.riders r
    on r.id = ub.rider_id
  join public.clubs buyer
    on buyer.id = ub.buyer_club_id
  join public.clubs seller
    on seller.id = ub.seller_club_id
  where buyer.owner_user_id = auth.uid()
     or exists (
       select 1
       from public.club_memberships cm
       where cm.club_id = ub.buyer_club_id
         and cm.user_id = auth.uid()
     )
  order by ub.created_at desc;
$function$
;

CREATE OR REPLACE FUNCTION public.equipment_get_mechanic_effects_v1(p_club_id uuid, p_staff_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with workshop as (
    select *
    from public.get_mechanics_workshop_effects(p_club_id)
    limit 1
  ),
  selected_mechanics as (
    select
      cs.id,
      cs.staff_name,
      cs.expertise::numeric as expertise,
      cs.experience::numeric as experience,
      cs.potential::numeric as potential,
      cs.leadership::numeric as leadership,
      least(100::numeric, cs.efficiency::numeric + public.team_policy_staff_quality_bonus_v1(p_club_id)) as efficiency,
      cs.loyalty::numeric as loyalty
    from public.club_staff cs
    join workshop w on w.infrastructure_club_id = cs.club_id
    where cs.is_active = true
      and cs.role_type = 'mechanic'
      and (
        p_staff_ids is null
        or cardinality(p_staff_ids) = 0
        or cs.id = any(p_staff_ids)
      )
  ),
  agg as (
    select
      count(*)::integer as mechanic_count,
      coalesce(round(avg(expertise), 2), 0)::numeric as avg_expertise,
      coalesce(round(avg(experience), 2), 0)::numeric as avg_experience,
      coalesce(round(avg(potential), 2), 0)::numeric as avg_potential,
      coalesce(round(avg(leadership), 2), 0)::numeric as avg_leadership,
      coalesce(round(avg(efficiency), 2), 0)::numeric as avg_efficiency,
      coalesce(round(avg(loyalty), 2), 0)::numeric as avg_loyalty
    from selected_mechanics
  ),
  scored as (
    select
      a.*,
      coalesce(w.infrastructure_club_id, p_club_id) as infrastructure_club_id,
      coalesce(w.is_developing_team, false) as is_developing_team,
      coalesce(w.mechanics_workshop_level, 0)::integer as mechanics_workshop_level,
      coalesce(w.workshop_repair_speed_bonus_bps, 0)::numeric / 100.0 as workshop_maintenance_speed_bonus_pct,
      coalesce(w.workshop_repair_cost_discount_bps, 0)::numeric / 100.0 as workshop_maintenance_cost_discount_pct,
      coalesce(w.workshop_condition_loss_reduction_bps, 0)::numeric / 100.0 as workshop_condition_loss_reduction_pct,
      coalesce(w.workshop_mechanical_risk_reduction_bps, 0)::numeric / 100.0 as workshop_mechanical_risk_reduction_pct,
      case
        when a.mechanic_count <= 0 then 0::numeric
        else round(
          a.avg_expertise * 0.35
          + a.avg_efficiency * 0.30
          + a.avg_experience * 0.20
          + a.avg_leadership * 0.10
          + a.avg_loyalty * 0.05,
          2
        )
      end as mechanic_score
    from agg a
    cross join workshop w
  ),
  effects as (
    select
      s.*,
      case when mechanic_count <= 0 then 0
        else least(20, round(greatest(0, mechanic_score - 40) / 3.0 + greatest(mechanic_count - 1, 0) * 1.5, 1))
      end::numeric as staff_maintenance_speed_bonus_pct,
      case when mechanic_count <= 0 then 0
        else least(15, round(greatest(0, mechanic_score - 50) / 4.0 + greatest(mechanic_count - 1, 0) * 0.75, 1))
      end::numeric as staff_maintenance_cost_discount_pct,
      case when mechanic_count <= 0 then 0
        else least(10, round(greatest(0, mechanic_score - 35) / 6.0 + greatest(mechanic_count - 1, 0) * 0.60, 1))
      end::numeric as staff_mechanical_risk_reduction_pct,
      case when mechanic_count <= 0 then 0
        else least(12, round(greatest(0, mechanic_score - 35) / 6.0 + greatest(mechanic_count - 1, 0) * 0.70, 1))
      end::numeric as staff_condition_loss_reduction_pct,
      least(
        12,
        round(
          case
            when mechanic_count <= 0 then mechanics_workshop_level * 0.5
            else mechanic_score / 12.0 + greatest(mechanic_count - 1, 0) * 0.5 + mechanics_workshop_level * 0.5
          end,
          1
        )
      )::numeric as setup_quality_bonus
    from scored s
  )
  select jsonb_build_object(
    'infrastructure_club_id', infrastructure_club_id,
    'is_developing_team', is_developing_team,
    'mechanic_count', mechanic_count,
    'mechanic_score', mechanic_score,
    'avg_expertise', avg_expertise,
    'avg_experience', avg_experience,
    'avg_potential', avg_potential,
    'avg_leadership', avg_leadership,
    'avg_efficiency', avg_efficiency,
    'avg_loyalty', avg_loyalty,
    'mechanics_workshop_level', mechanics_workshop_level,
    'workshop_maintenance_speed_bonus_pct', workshop_maintenance_speed_bonus_pct,
    'workshop_maintenance_cost_discount_pct', workshop_maintenance_cost_discount_pct,
    'workshop_mechanical_risk_reduction_pct', workshop_mechanical_risk_reduction_pct,
    'workshop_condition_loss_reduction_pct', workshop_condition_loss_reduction_pct,
    'staff_maintenance_speed_bonus_pct', staff_maintenance_speed_bonus_pct,
    'staff_maintenance_cost_discount_pct', staff_maintenance_cost_discount_pct,
    'staff_mechanical_risk_reduction_pct', staff_mechanical_risk_reduction_pct,
    'staff_condition_loss_reduction_pct', staff_condition_loss_reduction_pct,
    'maintenance_speed_bonus_pct', least(45, workshop_maintenance_speed_bonus_pct + staff_maintenance_speed_bonus_pct),
    'maintenance_cost_discount_pct', least(40, workshop_maintenance_cost_discount_pct + staff_maintenance_cost_discount_pct),
    'mechanical_risk_reduction_pct', least(15, workshop_mechanical_risk_reduction_pct + staff_mechanical_risk_reduction_pct),
    'condition_loss_reduction_pct', least(18, workshop_condition_loss_reduction_pct + staff_condition_loss_reduction_pct),
    'setup_quality_bonus', setup_quality_bonus,
    'summary', case
      when mechanic_count <= 0 and mechanics_workshop_level <= 0 then 'No active mechanic support.'
      when mechanic_count <= 0 then 'Mechanics Workshop support active, but no active mechanic assigned.'
      else 'Active Mechanics Workshop and mechanic gameplay support is live.'
    end
  )
  from effects;
$function$
;

CREATE OR REPLACE FUNCTION public.team_ranking_get_completed_race_count_v1(p_team_id uuid, p_season_year integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((
    select count(distinct rsr.race_id)::integer
    from public.race_stage_results rsr
    join public.races r on r.id=rsr.race_id
    where rsr.team_id=p_team_id
      and extract(year from r.start_date)::integer=coalesce(p_season_year,public.team_ranking_get_current_season_year_v1())
  ),0);
$function$
;

CREATE OR REPLACE FUNCTION public.team_ranking_get_ordered_standings_v1(p_season_year integer DEFAULT NULL::integer, p_club_tier text DEFAULT NULL::text, p_division text DEFAULT NULL::text)
 RETURNS TABLE(ranking_position integer, season_year integer, team_id uuid, team_name text, club_tier text, division text, international_points numeric, completed_race_count integer, race_reputation_value numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with target_season as (
    select coalesce(
      p_season_year,
      public.team_ranking_get_current_season_year_v1()
    ) as season_year
  ),
  ranking_clubs as (
    select
      c.id as team_id,
      c.name as team_name,
      c.club_tier::text as club_tier,
      case
        when c.club_tier::text = 'worldteam' then 'WORLD'
        when c.club_tier::text = 'proteam' then c.tier2_division::text
        when c.club_tier::text = 'continental' then c.tier3_division::text
        when c.club_tier::text = 'amateur' then c.amateur_division::text
        else null
      end as division,
      coalesce(c.reputation, 0)::numeric as race_reputation_value
    from public.clubs c
    where c.deleted_at is null
      and coalesce(c.club_type, 'main') <> 'developing'
      and c.club_tier::text in ('worldteam', 'proteam', 'continental', 'amateur')
      and (
        p_club_tier is null
        or c.club_tier::text = p_club_tier
      )
      and (
        p_division is null
        or case
            when c.club_tier::text = 'worldteam' then 'WORLD'
            when c.club_tier::text = 'proteam' then c.tier2_division::text
            when c.club_tier::text = 'continental' then c.tier3_division::text
            when c.club_tier::text = 'amateur' then c.amateur_division::text
            else null
          end = p_division
      )
  ),
  points as (
    select
      l.team_id,
      sum(l.team_points)::numeric as international_points
    from public.international_points_awards_ledger_v1 l
    join target_season ts
      on ts.season_year = l.season_year
    where l.team_id is not null
    group by l.team_id
  ),
  completed as (
    select
      rsr.team_id,
      count(distinct rsr.race_id)::integer as completed_race_count
    from public.race_stage_results rsr
    join public.races r
      on r.id = rsr.race_id
    join target_season ts
      on extract(year from r.start_date)::integer = ts.season_year
    group by rsr.team_id
  ),
  base as (
    select
      ts.season_year,
      rc.team_id,
      rc.team_name,
      rc.club_tier,
      rc.division,
      coalesce(p.international_points, 0)::numeric as international_points,
      coalesce(cr.completed_race_count, 0)::integer as completed_race_count,
      rc.race_reputation_value
    from ranking_clubs rc
    cross join target_season ts
    left join points p
      on p.team_id = rc.team_id
    left join completed cr
      on cr.team_id = rc.team_id
  )
  select
    row_number() over (
      order by
        base.international_points desc,
        base.completed_race_count desc,
        base.race_reputation_value desc,
        lower(base.team_name) asc,
        base.team_id asc
    )::integer as ranking_position,
    base.season_year,
    base.team_id,
    base.team_name,
    base.club_tier,
    base.division,
    base.international_points,
    base.completed_race_count,
    base.race_reputation_value
  from base
  order by
    base.international_points desc,
    base.completed_race_count desc,
    base.race_reputation_value desc,
    lower(base.team_name) asc,
    base.team_id asc;
$function$
;

CREATE OR REPLACE FUNCTION public.team_ranking_get_team_international_points_v1(p_team_id uuid, p_season_year integer DEFAULT NULL::integer)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((
    select v.international_points
    from public.team_international_points_by_season_v1 v
    where v.team_id=p_team_id
      and v.season_year=coalesce(p_season_year,public.team_ranking_get_current_season_year_v1())
    limit 1
  ),0)::numeric;
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_favorites_v1(p_race_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(favorite_rank integer, rider_id uuid, rider_name text, team_id uuid, team_name text, country_code text, start_number integer, role_snapshot text, favorite_score numeric, skill_score numeric, season_points numeric, reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with race_profile as (
    select public.race_get_favorites_profile_type_v1(p_race_id) as profile_type
  ),
  scored as (
    select
      pr.rider_id,
      coalesce(
        nullif(pr.rider_name_snapshot, ''),
        'Unknown rider'
      ) as rider_name,
      coalesce(pr.club_id, pr.team_id) as team_id,
      nullif(pr.team_name_snapshot, '') as team_name,
      pr.country_code_snapshot as country_code,
      pr.start_number,
      pr.role_snapshot,
      public.race_calculate_rider_favorite_score_v1(
        pr.rider_id,
        pr.overall_snapshot::numeric,
        pr.role_snapshot,
        rp.profile_type,
        case
          when to_regprocedure('public.team_ranking_get_current_season_year_v1()') is not null
            then public.team_ranking_get_current_season_year_v1()
          else 2000
        end
      ) as score_json
    from public.race_participant_riders_v1 pr
    cross join race_profile rp
    where pr.race_id = p_race_id
      and pr.rider_id is not null
  ),
  ranked as (
    select
      row_number() over (
        order by
          (score_json->>'favorite_score')::numeric desc,
          coalesce(start_number, 999999) asc,
          rider_name asc,
          rider_id asc
      )::integer as favorite_rank,
      rider_id,
      rider_name,
      team_id,
      team_name,
      country_code,
      start_number,
      role_snapshot,
      (score_json->>'favorite_score')::numeric as favorite_score,
      (score_json->>'skill_score')::numeric as skill_score,
      (score_json->>'season_points')::numeric as season_points,
      score_json->>'reason' as reason
    from scored
  )
  select
    favorite_rank,
    rider_id,
    rider_name,
    team_id,
    team_name,
    country_code,
    start_number,
    role_snapshot,
    favorite_score,
    skill_score,
    season_points,
    reason
  from ranked
  order by favorite_rank
  limit greatest(coalesce(p_limit, 5), 1);
$function$
;

CREATE OR REPLACE FUNCTION public.get_current_game_date_timestamp()
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.get_current_game_timestamp();
$function$
;

CREATE OR REPLACE FUNCTION public.health_get_medical_center_level_v1(p_club_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select e.medical_center_level from public.get_medical_center_effects(p_club_id) e limit 1), 0)::integer;
$function$
;

CREATE OR REPLACE FUNCTION public.health_get_medical_center_recovery_bonus_pct_v1(p_medical_center_level integer)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when p_medical_center_level is null then 0::numeric
    when p_medical_center_level >= 5 then 20::numeric
    when p_medical_center_level = 4 then 16::numeric
    when p_medical_center_level = 3 then 12::numeric
    when p_medical_center_level = 2 then 8::numeric
    when p_medical_center_level = 1 then 4::numeric
    else 0::numeric
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_canonical_rider_point_totals_v2(p_race_id uuid, p_through_stage_number integer DEFAULT NULL::integer)
 RETURNS TABLE(rider_id uuid, team_id uuid, rider_name_snapshot text, team_name_snapshot text, finish_points integer, sprint_points integer, mountain_points integer, points_classification_points integer, bonus_seconds integer, point_result_rows integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$

with stage_scope as (
  select
    stage.id as stage_id,
    stage.stage_number
  from public.race_stages stage
  where stage.race_id = p_race_id
    and (
      p_through_stage_number is null
      or stage.stage_number <= p_through_stage_number
    )
),

canonical_point_rows as (
  select
    point_result.rider_id,
    point_result.team_id,
    point_result.rider_name_snapshot,
    point_result.team_name_snapshot,

    point_result.point_id,
    point_result.points_awarded,
    point_result.bonus_seconds_awarded,

    stage_scope.stage_number,

    upper(
      trim(
        coalesce(
          point_definition.point_type,
          ''
        )
      )
    ) as point_type

  from public.race_stage_point_results point_result

  join stage_scope
    on stage_scope.stage_id = point_result.stage_id

  join public.race_stage_points point_definition
    on point_definition.id = point_result.point_id

  where point_result.race_id = p_race_id
),

rider_totals as (
  select
    point_row.rider_id,

    (
      array_agg(
        point_row.team_id
        order by
          point_row.stage_number desc,
          point_row.point_id
      )
    )[1] as team_id,

    (
      array_agg(
        point_row.rider_name_snapshot
        order by
          point_row.stage_number desc,
          point_row.point_id
      )
    )[1] as rider_name_snapshot,

    (
      array_agg(
        point_row.team_name_snapshot
        order by
          point_row.stage_number desc,
          point_row.point_id
      )
    )[1] as team_name_snapshot,

    sum(
      case
        when point_row.point_type = 'FINISH'
          then coalesce(point_row.points_awarded, 0)
        else 0
      end
    )::integer as finish_points,

    sum(
      case
        when point_row.point_type in (
          'INTERMEDIATE_SPRINT',
          'BONUS_SPRINT',
          'SPRINT'
        )
          then coalesce(point_row.points_awarded, 0)
        else 0
      end
    )::integer as sprint_points,

    sum(
      case
        when point_row.point_type in (
          'KOM',
          'MOUNTAIN',
          'MOUNTAIN_SPRINT',
          'CLIMB'
        )
          then coalesce(point_row.points_awarded, 0)
        else 0
      end
    )::integer as mountain_points,

    sum(
      case
        when point_row.point_type in (
          'FINISH',
          'INTERMEDIATE_SPRINT',
          'BONUS_SPRINT',
          'SPRINT'
        )
          then coalesce(point_row.points_awarded, 0)
        else 0
      end
    )::integer as points_classification_points,

    sum(
      coalesce(
        point_row.bonus_seconds_awarded,
        0
      )
    )::integer as bonus_seconds,

    count(*)::integer as point_result_rows

  from canonical_point_rows point_row
  group by point_row.rider_id
)

select
  rider_total.rider_id,
  rider_total.team_id,
  rider_total.rider_name_snapshot,
  rider_total.team_name_snapshot,

  rider_total.finish_points,
  rider_total.sprint_points,
  rider_total.mountain_points,
  rider_total.points_classification_points,

  rider_total.bonus_seconds,
  rider_total.point_result_rows

from rider_totals rider_total

order by
  rider_total.points_classification_points desc,
  rider_total.mountain_points desc,
  rider_total.bonus_seconds desc,
  rider_total.rider_id;

$function$
;

CREATE OR REPLACE FUNCTION public.is_national_team_club_v1(p_club_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
      and (
        c.name ilike '%national%'
        or c.club_type ilike '%national%'
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_rider_current_health_case(p_rider_id uuid)
 RETURNS TABLE(rider_id uuid, availability_status text, fatigue smallint, unavailable_until date, unavailable_reason text, health_case_id uuid, case_type text, case_code text, severity text, source text, case_status text, started_on date, active_until date, recovery_until date, resolved_on date, selection_blocked boolean, training_blocked boolean, development_blocked boolean, expected_full_recovery_on date, source_type text, source_id uuid, body_part text, base_min_days integer, base_max_days integer, selected_base_days integer, medical_staff_reduction_pct numeric, infrastructure_reduction_pct numeric, total_reduction_pct numeric, final_recovery_days integer, context_expected_full_recovery_on date, health_notes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    r.id as rider_id,
    coalesce(r.availability_status, 'fit') as availability_status,
    coalesce(r.fatigue, 0)::smallint as fatigue,
    r.unavailable_until,
    r.unavailable_reason,

    hc.id as health_case_id,
    hc.case_type,
    hc.case_code,
    hc.severity,
    hc.source,
    hc.status as case_status,
    hc.started_on,
    hc.active_until,
    hc.recovery_until,
    hc.resolved_on,
    hc.selection_blocked,
    hc.training_blocked,
    hc.development_blocked,

    coalesce(
      ctx.expected_full_recovery_on,
      hc.recovery_until,
      hc.active_until
    ) as expected_full_recovery_on,

    ctx.source_type,
    ctx.source_id,
    ctx.body_part,
    ctx.base_min_days,
    ctx.base_max_days,
    ctx.selected_base_days,
    ctx.medical_staff_reduction_pct,
    ctx.infrastructure_reduction_pct,
    ctx.total_reduction_pct,
    ctx.final_recovery_days,
    ctx.expected_full_recovery_on as context_expected_full_recovery_on,
    coalesce(ctx.notes, '{}'::jsonb) as health_notes

  from public.riders r
  left join public.rider_health_cases hc
    on hc.rider_id = r.id
   and hc.status in ('active', 'recovering')
  left join public.rider_health_case_context_v1 ctx
    on ctx.health_case_id = hc.id
  where r.id = p_rider_id
  order by hc.created_at desc nulls last
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_preview_cumulative_classifications_v2(p_race_id uuid, p_through_stage_number integer DEFAULT NULL::integer)
 RETURNS TABLE(classification_type text, entity_type text, rider_id uuid, team_id uuid, classification_rank integer, total_time_seconds bigint, gap_seconds bigint, points integer, display_name_snapshot text, team_name_snapshot text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$

with resolved_stage as (
  select
    coalesce(
      p_through_stage_number,
      (
        select max(stage.stage_number)
        from public.race_stages stage
        where stage.race_id = p_race_id
          and exists (
            select 1
            from public.race_stage_results stage_result
            where stage_result.stage_id = stage.id
              and stage_result.race_id = p_race_id
          )
      )
    )::integer as through_stage_number
),

stage_scope as (
  select
    stage.id as stage_id,
    stage.stage_number
  from public.race_stages stage
  cross join resolved_stage
  where stage.race_id = p_race_id
    and stage.stage_number
      <= resolved_stage.through_stage_number
),

stage_count as (
  select count(*)::integer as included_stage_count
  from stage_scope
),

canonical_stage_bonuses as (
  select
    point_result.stage_id,
    point_result.rider_id,

    sum(
      coalesce(
        point_result.bonus_seconds_awarded,
        0
      )
    )::bigint as bonus_seconds

  from public.race_stage_point_results point_result

  join stage_scope
    on stage_scope.stage_id = point_result.stage_id

  where point_result.race_id = p_race_id

  group by
    point_result.stage_id,
    point_result.rider_id
),

canonical_point_totals as (
  select *
  from public.race_engine_get_canonical_rider_point_totals_v2(
    p_race_id,
    (
      select through_stage_number
      from resolved_stage
    )
  )
),

eligible_riders as (
  select
    stage_result.rider_id,

    (
      array_agg(
        stage_result.team_id
        order by
          stage_scope.stage_number desc,
          stage_result.rank nulls last,
          stage_result.rider_id
      )
    )[1] as team_id,

    (
      array_agg(
        stage_result.rider_name_snapshot
        order by
          stage_scope.stage_number desc,
          stage_result.rank nulls last,
          stage_result.rider_id
      )
    )[1] as rider_name_snapshot,

    (
      array_agg(
        stage_result.team_name_snapshot
        order by
          stage_scope.stage_number desc,
          stage_result.rank nulls last,
          stage_result.rider_id
      )
    )[1] as team_name_snapshot,

    sum(
      greatest(
        coalesce(stage_result.elapsed_seconds, 0)
        + coalesce(stage_result.penalty_seconds, 0),
        0
      )
    )::bigint as raw_total_time_seconds,

    sum(
      coalesce(stage_result.rank, 9999)
    )::bigint as stage_rank_tiebreak,

    count(
      distinct stage_result.stage_id
    )::integer as completed_stage_count

  from public.race_stage_results stage_result

  join stage_scope
    on stage_scope.stage_id = stage_result.stage_id

  where stage_result.race_id = p_race_id
    and lower(
      coalesce(
        stage_result.status,
        'finished'
      )
    ) = 'finished'

  group by stage_result.rider_id

  having count(
    distinct stage_result.stage_id
  ) = (
    select included_stage_count
    from stage_count
  )
),

general_totals as (
  select
    eligible.rider_id,
    eligible.team_id,
    eligible.rider_name_snapshot,
    eligible.team_name_snapshot,
    eligible.stage_rank_tiebreak,

    greatest(
      eligible.raw_total_time_seconds
      - coalesce(
          canonical_points.bonus_seconds,
          0
        ),
      0
    )::bigint as total_time_seconds

  from eligible_riders eligible

  left join canonical_point_totals canonical_points
    on canonical_points.rider_id = eligible.rider_id
),

general_ranked as (
  select
    general_total.*,

    row_number() over (
      order by
        general_total.total_time_seconds,
        general_total.stage_rank_tiebreak,
        general_total.rider_id
    )::integer as classification_rank,

    min(
      general_total.total_time_seconds
    ) over () as best_total_time

  from general_totals general_total
),

points_totals as (
  select
    eligible.rider_id,
    eligible.team_id,
    eligible.rider_name_snapshot,
    eligible.team_name_snapshot,

    canonical_points.points_classification_points
      as total_points

  from eligible_riders eligible

  join canonical_point_totals canonical_points
    on canonical_points.rider_id = eligible.rider_id

  where canonical_points.points_classification_points > 0
),

points_ranked as (
  select
    points_total.*,

    row_number() over (
      order by
        points_total.total_points desc,
        points_total.rider_id
    )::integer as classification_rank

  from points_totals points_total
),

mountain_totals as (
  select
    eligible.rider_id,
    eligible.team_id,
    eligible.rider_name_snapshot,
    eligible.team_name_snapshot,

    canonical_points.mountain_points
      as total_points

  from eligible_riders eligible

  join canonical_point_totals canonical_points
    on canonical_points.rider_id = eligible.rider_id

  where canonical_points.mountain_points > 0
),

mountain_ranked as (
  select
    mountain_total.*,

    row_number() over (
      order by
        mountain_total.total_points desc,
        mountain_total.rider_id
    )::integer as classification_rank

  from mountain_totals mountain_total
),

young_ranked as (
  select
    general_ranking.rider_id,
    general_ranking.team_id,
    general_ranking.rider_name_snapshot,
    general_ranking.team_name_snapshot,
    general_ranking.total_time_seconds,

    row_number() over (
      order by
        general_ranking.total_time_seconds,
        general_ranking.classification_rank,
        general_ranking.rider_id
    )::integer as classification_rank,

    min(
      general_ranking.total_time_seconds
    ) over () as best_young_time

  from general_ranked general_ranking

  join public.race_participant_riders participant
    on participant.race_id = p_race_id
   and participant.rider_id = general_ranking.rider_id
   and participant.is_young_rider is true
),

stage_rider_times as (
  select
    stage_result.stage_id,
    stage_scope.stage_number,
    stage_result.rider_id,
    stage_result.team_id,
    stage_result.team_name_snapshot,

    greatest(
      coalesce(stage_result.elapsed_seconds, 0)
      - coalesce(stage_bonus.bonus_seconds, 0)
      + coalesce(stage_result.penalty_seconds, 0),
      0
    )::bigint as adjusted_time_seconds,

    row_number() over (
      partition by
        stage_result.stage_id,
        stage_result.team_id
      order by
        greatest(
          coalesce(stage_result.elapsed_seconds, 0)
          - coalesce(stage_bonus.bonus_seconds, 0)
          + coalesce(stage_result.penalty_seconds, 0),
          0
        ),
        stage_result.rank nulls last,
        stage_result.rider_id
    )::integer as team_rider_rank

  from public.race_stage_results stage_result

  join stage_scope
    on stage_scope.stage_id = stage_result.stage_id

  left join canonical_stage_bonuses stage_bonus
    on stage_bonus.stage_id = stage_result.stage_id
   and stage_bonus.rider_id = stage_result.rider_id

  where stage_result.race_id = p_race_id
    and stage_result.team_id is not null
    and lower(
      coalesce(
        stage_result.status,
        'finished'
      )
    ) = 'finished'
),

stage_team_times as (
  select
    stage_rider_time.stage_id,
    stage_rider_time.stage_number,
    stage_rider_time.team_id,

    (
      array_agg(
        stage_rider_time.team_name_snapshot
        order by stage_rider_time.team_rider_rank
      )
    )[1] as team_name_snapshot,

    sum(
      stage_rider_time.adjusted_time_seconds
    )::bigint as stage_team_time_seconds

  from stage_rider_times stage_rider_time

  where stage_rider_time.team_rider_rank <= 3

  group by
    stage_rider_time.stage_id,
    stage_rider_time.stage_number,
    stage_rider_time.team_id

  having count(*) = 3
),

team_totals as (
  select
    stage_team_time.team_id,

    (
      array_agg(
        stage_team_time.team_name_snapshot
        order by stage_team_time.stage_number desc
      )
    )[1] as team_name_snapshot,

    sum(
      stage_team_time.stage_team_time_seconds
    )::bigint as total_time_seconds,

    count(
      distinct stage_team_time.stage_id
    )::integer as completed_stage_count

  from stage_team_times stage_team_time

  group by stage_team_time.team_id

  having count(
    distinct stage_team_time.stage_id
  ) = (
    select included_stage_count
    from stage_count
  )
),

team_ranked as (
  select
    team_total.*,

    row_number() over (
      order by
        team_total.total_time_seconds,
        team_total.team_id
    )::integer as classification_rank,

    min(
      team_total.total_time_seconds
    ) over () as best_team_time

  from team_totals team_total
),

combined_classifications as (
  select
    'general'::text as classification_type,
    'rider'::text as entity_type,
    general_ranking.rider_id,
    general_ranking.team_id,
    general_ranking.classification_rank,
    general_ranking.total_time_seconds,
    (
      general_ranking.total_time_seconds
      - general_ranking.best_total_time
    )::bigint as gap_seconds,
    null::integer as points,
    general_ranking.rider_name_snapshot
      as display_name_snapshot,
    general_ranking.team_name_snapshot

  from general_ranked general_ranking

  union all

  select
    'points',
    'rider',
    points_ranking.rider_id,
    points_ranking.team_id,
    points_ranking.classification_rank,
    null::bigint,
    null::bigint,
    points_ranking.total_points,
    points_ranking.rider_name_snapshot,
    points_ranking.team_name_snapshot

  from points_ranked points_ranking

  union all

  select
    'mountain',
    'rider',
    mountain_ranking.rider_id,
    mountain_ranking.team_id,
    mountain_ranking.classification_rank,
    null::bigint,
    null::bigint,
    mountain_ranking.total_points,
    mountain_ranking.rider_name_snapshot,
    mountain_ranking.team_name_snapshot

  from mountain_ranked mountain_ranking

  union all

  select
    'young',
    'rider',
    young_ranking.rider_id,
    young_ranking.team_id,
    young_ranking.classification_rank,
    young_ranking.total_time_seconds,
    (
      young_ranking.total_time_seconds
      - young_ranking.best_young_time
    )::bigint,
    null::integer,
    young_ranking.rider_name_snapshot,
    young_ranking.team_name_snapshot

  from young_ranked young_ranking

  union all

  select
    'team',
    'team',
    null::uuid,
    team_ranking.team_id,
    team_ranking.classification_rank,
    team_ranking.total_time_seconds,
    (
      team_ranking.total_time_seconds
      - team_ranking.best_team_time
    )::bigint,
    null::integer,
    team_ranking.team_name_snapshot,
    team_ranking.team_name_snapshot

  from team_ranked team_ranking
)

select
  combined.classification_type,
  combined.entity_type,
  combined.rider_id,
  combined.team_id,
  combined.classification_rank,
  combined.total_time_seconds,
  combined.gap_seconds,
  combined.points,
  combined.display_name_snapshot,
  combined.team_name_snapshot

from combined_classifications combined

order by
  case combined.classification_type
    when 'general' then 1
    when 'points' then 2
    when 'mountain' then 3
    when 'young' then 4
    when 'team' then 5
    else 99
  end,
  combined.classification_rank,
  combined.rider_id,
  combined.team_id;

$function$
;

CREATE OR REPLACE FUNCTION public.health_normalize_case_code_v1(p_case_code text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case lower(trim(coalesce(p_case_code, '')))
    when 'minor_strain' then 'muscle_strain'
    when 'viral_illness' then 'respiratory_infection'
    when 'viral_infection' then 'respiratory_infection'
    when 'illness' then 'flu'
    when 'dehydration' then 'heat_exhaustion'
    else lower(trim(coalesce(p_case_code, '')))
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.health_normalize_source_type_v1(p_source text, p_case_type text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when lower(trim(coalesce(p_source, ''))) in (
      'race',
      'stage',
      'race_crash',
      'crash',
      'race_incident',
      'race_engine',
      'race_simulation'
    ) then 'race'

    when lower(trim(coalesce(p_source, ''))) in (
      'training',
      'regular_training',
      'training_camp',
      'fatigue_training'
    ) then 'training'

    when lower(trim(coalesce(p_source, ''))) = 'fatigue_overload'
      then case
        when lower(trim(coalesce(p_case_type, ''))) = 'sickness'
          then 'daily_life'
        else 'training'
      end

    when lower(trim(coalesce(p_source, ''))) in (
      'travel',
      'team_travel'
    ) then 'travel'

    when lower(trim(coalesce(p_source, ''))) in (
      'weather',
      'heat',
      'cold_weather',
      'heat_wave'
    ) then 'weather'

    when lower(trim(coalesce(p_source, ''))) in (
      'manual',
      'admin',
      'manual_admin'
    ) then 'manual'

    when lower(trim(coalesce(p_source, ''))) in (
      'daily_life',
      'daily',
      'life',
      'random_daily'
    ) then 'daily_life'

    else 'unknown'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_calculate_segment_skill_v2(p_terrain_type text, p_slope_percent numeric, p_sprint numeric, p_climbing numeric, p_flat numeric, p_endurance numeric, p_recovery numeric, p_resistance numeric, p_race_iq numeric, p_teamwork numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$

with normalized as (
  select
    case
      when lower(
        trim(
          coalesce(
            p_terrain_type,
            ''
          )
        )
      ) in (
        'flat',
        'false_flat',
        'climb',
        'steep_climb',
        'descent',
        'technical_descent'
      )
      then lower(
        trim(
          p_terrain_type
        )
      )

      when coalesce(p_slope_percent, 0) <= -5
        then 'technical_descent'

      when coalesce(p_slope_percent, 0) < -1.5
        then 'descent'

      when coalesce(p_slope_percent, 0) <= 0.8
        then 'flat'

      when coalesce(p_slope_percent, 0) <= 2.5
        then 'false_flat'

      when coalesce(p_slope_percent, 0) <= 5.5
        then 'climb'

      else 'steep_climb'
    end as terrain_type,

    greatest(
      1,
      least(100, coalesce(p_sprint, 50))
    )::numeric as sprint_skill,

    greatest(
      1,
      least(100, coalesce(p_climbing, 50))
    )::numeric as climbing_skill,

    greatest(
      1,
      least(100, coalesce(p_flat, 50))
    )::numeric as flat_skill,

    greatest(
      1,
      least(100, coalesce(p_endurance, 50))
    )::numeric as endurance_skill,

    greatest(
      1,
      least(100, coalesce(p_recovery, 50))
    )::numeric as recovery_skill,

    greatest(
      1,
      least(100, coalesce(p_resistance, 50))
    )::numeric as resistance_skill,

    greatest(
      1,
      least(100, coalesce(p_race_iq, 50))
    )::numeric as race_iq_skill,

    greatest(
      1,
      least(100, coalesce(p_teamwork, 50))
    )::numeric as teamwork_skill
),

calculated as (
  select
    case normalized.terrain_type

      /*
       * Ordinary road riding.
       *
       * Sprint is relevant, but it must not dominate ordinary flat-road
       * movement. The separate point-gate and finish models will give sprint
       * a much larger influence during actual sprint contests.
       */
      when 'flat' then
          normalized.flat_skill       * 0.36
        + normalized.endurance_skill  * 0.22
        + normalized.resistance_skill * 0.12
        + normalized.race_iq_skill    * 0.10
        + normalized.teamwork_skill   * 0.08
        + normalized.sprint_skill     * 0.07
        + normalized.recovery_skill   * 0.05

      /*
       * A shallow uphill increasingly rewards climbing and resistance,
       * while flat skill remains important.
       */
      when 'false_flat' then
          normalized.flat_skill       * 0.26
        + normalized.endurance_skill  * 0.22
        + normalized.climbing_skill   * 0.15
        + normalized.resistance_skill * 0.15
        + normalized.race_iq_skill    * 0.09
        + normalized.teamwork_skill   * 0.06
        + normalized.recovery_skill   * 0.05
        + normalized.sprint_skill     * 0.02

      /*
       * Sustained climbing.
       */
      when 'climb' then
          normalized.climbing_skill   * 0.44
        + normalized.endurance_skill  * 0.20
        + normalized.resistance_skill * 0.15
        + normalized.recovery_skill   * 0.08
        + normalized.race_iq_skill    * 0.06
        + normalized.teamwork_skill   * 0.04
        + normalized.flat_skill       * 0.03

      /*
       * Steep climbing gives climbing and resistance the strongest weight.
       */
      when 'steep_climb' then
          normalized.climbing_skill   * 0.52
        + normalized.resistance_skill * 0.18
        + normalized.endurance_skill  * 0.14
        + normalized.recovery_skill   * 0.07
        + normalized.race_iq_skill    * 0.05
        + normalized.teamwork_skill   * 0.04

      /*
       * There is currently no dedicated descending skill.
       * Race IQ, resistance, control-related flat ability and recovery are
       * therefore used as the safest available approximation.
       */
      when 'descent' then
          normalized.race_iq_skill    * 0.26
        + normalized.resistance_skill * 0.20
        + normalized.flat_skill       * 0.16
        + normalized.recovery_skill   * 0.12
        + normalized.endurance_skill  * 0.10
        + normalized.teamwork_skill   * 0.09
        + normalized.climbing_skill   * 0.07

      /*
       * Technical descending places additional emphasis on judgment and
       * coordination.
       */
      when 'technical_descent' then
          normalized.race_iq_skill    * 0.34
        + normalized.resistance_skill * 0.22
        + normalized.teamwork_skill   * 0.14
        + normalized.recovery_skill   * 0.10
        + normalized.flat_skill       * 0.08
        + normalized.endurance_skill  * 0.07
        + normalized.climbing_skill   * 0.05

      /*
       * Defensive fallback. The normalization above should normally prevent
       * this branch from being reached.
       */
      else
          normalized.flat_skill       * 0.20
        + normalized.climbing_skill   * 0.20
        + normalized.endurance_skill  * 0.20
        + normalized.resistance_skill * 0.15
        + normalized.race_iq_skill    * 0.10
        + normalized.teamwork_skill   * 0.08
        + normalized.recovery_skill   * 0.05
        + normalized.sprint_skill     * 0.02
    end as raw_skill_score

  from normalized
)

select round(
  greatest(
    1::numeric,
    least(
      100::numeric,
      calculated.raw_skill_score
    )
  ),
  4
)

from calculated;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_rider_step_capabilities_v2(p_stage_id uuid, p_target_step_km numeric DEFAULT 0.5)
 RETURNS TABLE(race_id uuid, stage_id uuid, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, step_order integer, phase_number integer, km_start numeric, km_end numeric, distance_km numeric, terrain_type text, slope_percent numeric, phase_command text, command_effort_multiplier numeric, command_performance_modifier numeric, terrain_skill_score numeric, pre_race_freshness_pct numeric, fatigue_before_stage numeric, morale numeric, race_sharpness numeric, freshness_capability_modifier numeric, morale_capability_modifier numeric, sharpness_capability_modifier numeric, effective_capability_score numeric, point_gate_count integer, is_finish_step boolean, capability_model_version text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$

with rider_inputs as (
  select *
  from public.race_engine_get_stage_rider_inputs_v1(
    p_stage_id
  )
),

phase_commands as (
  select *
  from public.race_engine_get_stage_phase_commands_v1(
    p_stage_id
  )
),

simulation_steps as (
  select *
  from public.race_engine_get_stage_simulation_steps_v2(
    p_stage_id,
    p_target_step_km
  )
),

expanded as (
  select
    rider_input.race_id,
    rider_input.stage_id,

    rider_input.rider_id,
    rider_input.team_id,
    rider_input.rider_name,
    rider_input.team_name,

    public.race_engine_normalize_stage_role_code_v1(
      coalesce(
        phase_command.role_code,
        rider_input.role_code,
        rider_input.stage_role,
        'free_role'
      )
    ) as resolved_role_code,

    simulation_step.step_order,
    simulation_step.phase_number,

    simulation_step.km_start,
    simulation_step.km_end,
    simulation_step.distance_km,

    simulation_step.terrain_type,
    simulation_step.slope_percent,

    case simulation_step.phase_number
      when 1 then phase_command.phase_1_command
      when 2 then phase_command.phase_2_command
      when 3 then phase_command.phase_3_command
      when 4 then phase_command.phase_4_command
      else 'balanced'
    end as resolved_phase_command,

    rider_input.sprint,
    rider_input.climbing,
    rider_input.flat,
    rider_input.endurance,
    rider_input.recovery,
    rider_input.resistance,
    rider_input.race_iq,
    rider_input.teamwork,

    greatest(
      1::numeric,
      least(
        100::numeric,
        coalesce(
          rider_input.start_stamina,
          100
        )
      )
    ) as pre_race_freshness_pct,

    coalesce(
      rider_input.fatigue_before_stage,
      rider_input.fatigue,
      0
    )::numeric as fatigue_before_stage,

    greatest(
      1::numeric,
      least(
        100::numeric,
        coalesce(
          rider_input.morale,
          65
        )
      )
    ) as morale,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(
          nullif(
            rider_input.bonus_snapshot_json
              ->> 'race_sharpness',
            ''
          )::numeric,
          50
        )
      )
    ) as race_sharpness,

    simulation_step.point_gate_count,
    simulation_step.is_finish_step

  from rider_inputs rider_input

  cross join simulation_steps simulation_step

  left join phase_commands phase_command
    on phase_command.rider_id =
      rider_input.rider_id
),

raw_scores as (
  select
    expanded.*,

    coalesce(
      nullif(
        expanded.resolved_phase_command,
        ''
      ),
      'balanced'
    ) as phase_command,

    public.race_engine_role_command_effort_multiplier_v1(
      coalesce(
        nullif(
          expanded.resolved_phase_command,
          ''
        ),
        'balanced'
      ),
      expanded.resolved_role_code
    )::numeric as command_effort_multiplier,

    public.race_engine_command_performance_modifier_v1(
      coalesce(
        nullif(
          expanded.resolved_phase_command,
          ''
        ),
        'balanced'
      )
    )::numeric as command_performance_modifier,

    public.race_engine_calculate_segment_skill_v2(
      expanded.terrain_type,
      expanded.slope_percent,

      expanded.sprint,
      expanded.climbing,
      expanded.flat,
      expanded.endurance,
      expanded.recovery,
      expanded.resistance,
      expanded.race_iq,
      expanded.teamwork
    ) as terrain_skill_score

  from expanded
),

capability_modifiers as (
  select
    raw_score.*,

    /*
     * start_stamina already includes current fatigue, recovery,
     * availability and race sharpness from the current v1 input layer.
     *
     * Therefore, current fatigue is not subtracted again here.
     */
    round(
      greatest(
        -6::numeric,
        least(
          1.2::numeric,
          (
            raw_score.pre_race_freshness_pct
            - 85
          ) * 0.08
        )
      ),
      4
    ) as freshness_capability_modifier,

    /*
     * Morale has a deliberately limited influence.
     */
    round(
      greatest(
        -1.6::numeric,
        least(
          1.4::numeric,
          (
            raw_score.morale
            - 65
          ) * 0.04
        )
      ),
      4
    ) as morale_capability_modifier,

    /*
     * Race sharpness remains meaningful but small.
     *
     * Part of its effect is already represented in start stamina, so this
     * additional modifier is intentionally capped at +/- 1 point.
     */
    round(
      greatest(
        -1::numeric,
        least(
          1::numeric,
          (
            raw_score.race_sharpness
            - 50
          ) * 0.02
        )
      ),
      4
    ) as sharpness_capability_modifier

  from raw_scores raw_score
)

select
  modifier.race_id,
  modifier.stage_id,

  modifier.rider_id,
  modifier.team_id,
  modifier.rider_name,
  modifier.team_name,

  modifier.resolved_role_code
    as role_code,

  modifier.step_order,
  modifier.phase_number,

  modifier.km_start,
  modifier.km_end,
  modifier.distance_km,

  modifier.terrain_type,
  modifier.slope_percent,

  modifier.phase_command,
  round(
    modifier.command_effort_multiplier,
    4
  ) as command_effort_multiplier,

  round(
    modifier.command_performance_modifier,
    4
  ) as command_performance_modifier,

  round(
    modifier.terrain_skill_score,
    4
  ) as terrain_skill_score,

  round(
    modifier.pre_race_freshness_pct,
    4
  ) as pre_race_freshness_pct,

  round(
    modifier.fatigue_before_stage,
    4
  ) as fatigue_before_stage,

  round(
    modifier.morale,
    4
  ) as morale,

  round(
    modifier.race_sharpness,
    4
  ) as race_sharpness,

  modifier.freshness_capability_modifier,
  modifier.morale_capability_modifier,
  modifier.sharpness_capability_modifier,

  round(
    greatest(
      1::numeric,
      least(
        100::numeric,

        modifier.terrain_skill_score
        + modifier.freshness_capability_modifier
        + modifier.morale_capability_modifier
        + modifier.sharpness_capability_modifier
        + modifier.command_performance_modifier
      )
    ),
    4
  ) as effective_capability_score,

  modifier.point_gate_count,
  modifier.is_finish_step,

  'terrain_capability_v2_2026_07'
    as capability_model_version

from capability_modifiers modifier

order by
  modifier.step_order,
  modifier.team_name,
  modifier.rider_name,
  modifier.rider_id;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_calculate_step_speed_components_v2(p_terrain_type text, p_slope_percent numeric, p_weather_condition text, p_avg_wind_kmh numeric, p_effective_capability_score numeric, p_command_effort_multiplier numeric)
 RETURNS TABLE(reference_speed_kmh numeric, capability_speed_multiplier numeric, command_speed_multiplier numeric, solo_speed_kmh numeric)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$

with normalized as (
  select
    lower(
      trim(
        coalesce(
          p_terrain_type,
          'flat'
        )
      )
    ) as terrain_type,

    greatest(
      -20::numeric,
      least(
        20::numeric,
        coalesce(
          p_slope_percent,
          0
        )
      )
    ) as slope_percent,

    lower(
      trim(
        coalesce(
          p_weather_condition,
          'clear'
        )
      )
    ) as weather_condition,

    greatest(
      0::numeric,
      least(
        80::numeric,
        coalesce(
          p_avg_wind_kmh,
          0
        )
      )
    ) as avg_wind_kmh,

    greatest(
      1::numeric,
      least(
        100::numeric,
        coalesce(
          p_effective_capability_score,
          50
        )
      )
    ) as effective_capability_score,

    greatest(
      0.75::numeric,
      least(
        1.25::numeric,
        coalesce(
          p_command_effort_multiplier,
          1
        )
      )
    ) as command_effort_multiplier
),

reference_components as (
  select
    normalized.*,

    /*
     * Reference speed for a rider with capability 60 under calm, dry
     * conditions on a flat road.
     */
    42::numeric as calm_flat_reference_speed,

    /*
     * Uphill speed decreases non-linearly.
     *
     * Example reference values before weather and capability:
     *  0%  ≈ 42 km/h
     *  3%  ≈ 36 km/h
     *  5%  ≈ 31 km/h
     *  7%  ≈ 25 km/h
     * 10%  ≈ 14 km/h
     */
    case
      when normalized.slope_percent > 0 then
        -(
          1.50 * normalized.slope_percent
          +
          0.13
          * normalized.slope_percent
          * normalized.slope_percent
        )

      /*
       * Descending speed increases non-linearly but is capped later.
       */
      when normalized.slope_percent < 0 then
        least(
          33::numeric,
          2.00 * abs(normalized.slope_percent)
          +
          0.15
          * abs(normalized.slope_percent)
          * abs(normalized.slope_percent)
        )

      else 0::numeric
    end as slope_speed_adjustment,

    /*
     * Surface and technical-route adjustment.
     */
    case normalized.terrain_type
      when 'cobbled' then -3.20
      when 'cobble' then -3.20
      when 'gravel' then -2.20
      when 'technical_descent' then -1.80
      when 'technical' then -1.20
      else 0::numeric
    end as terrain_speed_adjustment,

    /*
     * Rain primarily affects cornering, braking and confidence.
     */
    case
      when normalized.weather_condition in (
        'storm',
        'thunderstorm',
        'heavy_rain',
        'torrential_rain'
      ) then -1.80

      when normalized.weather_condition in (
        'rain',
        'showers',
        'rain_showers'
      ) then -0.90

      when normalized.weather_condition in (
        'drizzle',
        'light_rain'
      ) then -0.40

      when normalized.weather_condition in (
        'snow',
        'sleet',
        'freezing_rain'
      ) then -4.00

      else 0::numeric
    end as precipitation_speed_adjustment,

    /*
     * There is currently no wind direction per route step.
     *
     * Therefore average wind is treated only as a modest exposure penalty,
     * not as a full headwind. Directional wind will belong in a later route
     * and group model.
     */
    -least(
      2.50::numeric,
      greatest(
        0::numeric,
        normalized.avg_wind_kmh - 5
      ) * 0.08
    ) as wind_speed_adjustment

  from normalized
),

reference_speed as (
  select
    reference_component.*,

    greatest(
      8::numeric,
      least(
        82::numeric,

        reference_component.calm_flat_reference_speed
        + reference_component.slope_speed_adjustment
        + reference_component.terrain_speed_adjustment
        + reference_component.precipitation_speed_adjustment
        + reference_component.wind_speed_adjustment
      )
    ) as calculated_reference_speed_kmh

  from reference_components reference_component
),

speed_multipliers as (
  select
    reference_speed.*,

    /*
     * Capability matters more on climbs than on ordinary flat roads.
     */
    case
      when reference_speed.terrain_type = 'steep_climb'
        or reference_speed.slope_percent >= 6
      then 0.0052

      when reference_speed.terrain_type = 'climb'
        or reference_speed.slope_percent >= 2.5
      then 0.0045

      when reference_speed.terrain_type = 'false_flat'
        or reference_speed.slope_percent >= 0.8
      then 0.0038

      when reference_speed.terrain_type in (
        'descent',
        'technical_descent'
      )
        or reference_speed.slope_percent <= -1.5
      then 0.0025

      else 0.0034
    end::numeric as capability_sensitivity,

    greatest(
      0.92::numeric,
      least(
        1.08::numeric,

        1
        +
        (
          reference_speed.command_effort_multiplier
          - 1
        ) * 0.60
      )
    ) as calculated_command_speed_multiplier

  from reference_speed
),

final_components as (
  select
    speed_multiplier.*,

    greatest(
      0.82::numeric,
      least(
        1.16::numeric,

        1
        +
        (
          speed_multiplier.effective_capability_score
          - 60
        )
        * speed_multiplier.capability_sensitivity
      )
    ) as calculated_capability_speed_multiplier

  from speed_multipliers speed_multiplier
)

select
  round(
    final_component.calculated_reference_speed_kmh,
    4
  ) as reference_speed_kmh,

  round(
    final_component.calculated_capability_speed_multiplier,
    6
  ) as capability_speed_multiplier,

  round(
    final_component.calculated_command_speed_multiplier,
    6
  ) as command_speed_multiplier,

  round(
    greatest(
      6::numeric,
      least(
        90::numeric,

        final_component.calculated_reference_speed_kmh
        * final_component.calculated_capability_speed_multiplier
        * final_component.calculated_command_speed_multiplier
      )
    ),
    4
  ) as solo_speed_kmh

from final_components final_component;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_rider_step_speed_preview_v2(p_stage_id uuid, p_target_step_km numeric DEFAULT 0.5)
 RETURNS TABLE(race_id uuid, stage_id uuid, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, step_order integer, phase_number integer, km_start numeric, km_end numeric, distance_km numeric, terrain_type text, slope_percent numeric, weather_condition text, avg_wind_kmh numeric, phase_command text, command_effort_multiplier numeric, effective_capability_score numeric, reference_speed_kmh numeric, capability_speed_multiplier numeric, command_speed_multiplier numeric, solo_speed_kmh numeric, solo_step_seconds numeric, cumulative_solo_seconds numeric, point_gate_count integer, is_finish_step boolean, speed_model_version text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$

with stage_context as (
  select
    stage.id as stage_id,
    stage.race_id,

    lower(
      trim(
        coalesce(
          stage.weather_snapshot ->> 'condition',
          'clear'
        )
      )
    ) as weather_condition,

    greatest(
      0::numeric,
      least(
        80::numeric,
        coalesce(
          nullif(
            stage.weather_snapshot
              ->> 'avg_wind_kmh',
            ''
          )::numeric,
          0
        )
      )
    ) as avg_wind_kmh

  from public.race_stages stage
  where stage.id = p_stage_id
),

capabilities as (
  select *
  from public.race_engine_get_stage_rider_step_capabilities_v2(
    p_stage_id,
    p_target_step_km
  )
),

speed_rows as (
  select
    capability.race_id,
    capability.stage_id,

    capability.rider_id,
    capability.team_id,
    capability.rider_name,
    capability.team_name,
    capability.role_code,

    capability.step_order,
    capability.phase_number,

    capability.km_start,
    capability.km_end,
    capability.distance_km,

    capability.terrain_type,
    capability.slope_percent,

    stage_context.weather_condition,
    stage_context.avg_wind_kmh,

    capability.phase_command,
    capability.command_effort_multiplier,

    capability.effective_capability_score,

    speed_component.reference_speed_kmh,
    speed_component.capability_speed_multiplier,
    speed_component.command_speed_multiplier,
    speed_component.solo_speed_kmh,

    round(
      (
        capability.distance_km
        /
        nullif(
          speed_component.solo_speed_kmh,
          0
        )
        * 3600
      )::numeric,
      6
    ) as solo_step_seconds,

    capability.point_gate_count,
    capability.is_finish_step

  from capabilities capability

  join stage_context
    on stage_context.stage_id =
      capability.stage_id

  cross join lateral
    public.race_engine_calculate_step_speed_components_v2(
      capability.terrain_type,
      capability.slope_percent,
      stage_context.weather_condition,
      stage_context.avg_wind_kmh,
      capability.effective_capability_score,
      capability.command_effort_multiplier
    ) speed_component
),

timed_rows as (
  select
    speed_row.*,

    round(
      sum(
        speed_row.solo_step_seconds
      ) over (
        partition by speed_row.rider_id
        order by speed_row.step_order
        rows between unbounded preceding
          and current row
      ),
      6
    ) as cumulative_solo_seconds

  from speed_rows speed_row
)

select
  timed.race_id,
  timed.stage_id,

  timed.rider_id,
  timed.team_id,
  timed.rider_name,
  timed.team_name,
  timed.role_code,

  timed.step_order,
  timed.phase_number,

  timed.km_start,
  timed.km_end,
  timed.distance_km,

  timed.terrain_type,
  timed.slope_percent,

  timed.weather_condition,
  timed.avg_wind_kmh,

  timed.phase_command,
  timed.command_effort_multiplier,

  timed.effective_capability_score,

  timed.reference_speed_kmh,
  timed.capability_speed_multiplier,
  timed.command_speed_multiplier,

  timed.solo_speed_kmh,
  timed.solo_step_seconds,
  timed.cumulative_solo_seconds,

  timed.point_gate_count,
  timed.is_finish_step,

  'solo_step_speed_v2_2026_07'
    as speed_model_version

from timed_rows timed

order by
  timed.step_order,
  timed.team_name,
  timed.rider_name,
  timed.rider_id;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_calculate_preparation_modifiers_v2(p_race_support numeric, p_fatigue_control numeric, p_recovery_support numeric, p_health_protection numeric, p_mechanical_reliability numeric)
 RETURNS TABLE(race_support numeric, fatigue_control numeric, recovery_support numeric, health_protection numeric, mechanical_reliability numeric, in_stage_energy_cost_multiplier numeric, non_neutral_command_capability_bonus numeric, health_incident_risk_multiplier numeric, mechanical_incident_risk_multiplier numeric, mechanical_time_loss_multiplier numeric, post_stage_fatigue_multiplier numeric, post_stage_recovery_bonus_points numeric)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$

with normalized as (
  select
    greatest(
      0::numeric,
      least(
        30::numeric,
        coalesce(p_race_support, 0::numeric)
      )
    ) as race_support,

    greatest(
      0::numeric,
      least(
        30::numeric,
        coalesce(p_fatigue_control, 0::numeric)
      )
    ) as fatigue_control,

    greatest(
      0::numeric,
      least(
        30::numeric,
        coalesce(p_recovery_support, 0::numeric)
      )
    ) as recovery_support,

    greatest(
      0::numeric,
      least(
        30::numeric,
        coalesce(p_health_protection, 0::numeric)
      )
    ) as health_protection,

    greatest(
      0::numeric,
      least(
        30::numeric,
        coalesce(p_mechanical_reliability, 0::numeric)
      )
    ) as mechanical_reliability
)

select
  normalized.race_support,
  normalized.fatigue_control,
  normalized.recovery_support,
  normalized.health_protection,
  normalized.mechanical_reliability,

  round(
    greatest(
      0.90::numeric,

      1::numeric
      - least(
          0.10::numeric,

          normalized.fatigue_control * 0.003::numeric
          +
          normalized.race_support * 0.0015::numeric
        )
    ),
    6
  ) as in_stage_energy_cost_multiplier,

  round(
    least(
      1.50::numeric,
      normalized.race_support * 0.05::numeric
    ),
    4
  ) as non_neutral_command_capability_bonus,

  round(
    greatest(
      0.78::numeric,

      1::numeric
      - least(
          0.22::numeric,

          normalized.health_protection * 0.012::numeric
          +
          normalized.race_support * 0.002::numeric
        )
    ),
    6
  ) as health_incident_risk_multiplier,

  round(
    greatest(
      0.78::numeric,

      1::numeric
      - least(
          0.22::numeric,

          normalized.mechanical_reliability * 0.025::numeric
          +
          normalized.race_support * 0.002::numeric
        )
    ),
    6
  ) as mechanical_incident_risk_multiplier,

  round(
    greatest(
      0.82::numeric,

      1::numeric
      - least(
          0.18::numeric,

          normalized.mechanical_reliability * 0.020::numeric
          +
          normalized.race_support * 0.0015::numeric
        )
    ),
    6
  ) as mechanical_time_loss_multiplier,

  round(
    greatest(
      0.85::numeric,

      1::numeric
      - least(
          0.15::numeric,

          normalized.fatigue_control * 0.010::numeric
          +
          normalized.recovery_support * 0.005::numeric
        )
    ),
    6
  ) as post_stage_fatigue_multiplier,

  round(
    least(
      8::numeric,

      normalized.recovery_support * 0.20::numeric
      +
      normalized.fatigue_control * 0.10::numeric
    ),
    4
  ) as post_stage_recovery_bonus_points

from normalized;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_rider_preparation_modifiers_v2(p_stage_id uuid)
 RETURNS TABLE(race_id uuid, stage_id uuid, rider_id uuid, team_id uuid, rider_name text, team_name text, preparation_id uuid, preparation_status text, preparation_applied boolean, race_support numeric, fatigue_control numeric, recovery_support numeric, health_protection numeric, mechanical_reliability numeric, in_stage_energy_cost_multiplier numeric, non_neutral_command_capability_bonus numeric, health_incident_risk_multiplier numeric, mechanical_incident_risk_multiplier numeric, mechanical_time_loss_multiplier numeric, post_stage_fatigue_multiplier numeric, post_stage_recovery_bonus_points numeric, preparation_model_version text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with rider_inputs as materialized (
  select * from public.race_engine_get_stage_rider_inputs_v1(p_stage_id)
),
prep_keys as materialized (
  select distinct ri.team_id, ri.preparation_id
  from rider_inputs ri
),
preparation_source as materialized (
  select
    k.team_id,
    k.preparation_id,
    lower(trim(coalesce(p.status,''))) as preparation_status,
    (
      k.preparation_id is not null
      and lower(trim(coalesce(p.status,'')))
          in ('submitted','locked','final','finalized','completed')
    ) as preparation_applied,
    p.validation_snapshot_json
  from prep_keys k
  left join public.race_preparations p on p.id=k.preparation_id
),
u23_staff_bonus as materialized (
  select
    k.team_id,
    k.preparation_id,
    case
      when coalesce(a.is_enabled,false)
       and a.planner_staff_id is not null
       and cs.id is not null
       and coalesce(cs.is_active,false)
      then round(
        greatest(
          0::numeric,
          least(
            6.5::numeric,
            (
              (
                coalesce(cs.expertise,50) * 0.30
                + coalesce(cs.experience,50) * 0.15
                + coalesce(cs.potential,50) * 0.15
                + coalesce(cs.leadership,50) * 0.20
                + coalesce(cs.efficiency,50) * 0.15
                + coalesce(cs.loyalty,50) * 0.05
              ) - 35
            ) * 0.10
          )
        )
        * greatest(
            0::numeric,
            least(
              1::numeric,
              public.get_staff_assignment_availability_factor(
                cs.id,
                public.get_current_game_date_date()
              )
            )
          ),
        4
      )
      else 0::numeric
    end as u23_race_support
  from prep_keys k
  left join public.race_preparation_stage_plan_automation a
    on a.race_preparation_id=k.preparation_id
   and a.planner_role='u23_head_coach'
  left join public.club_staff cs
    on cs.id=a.planner_staff_id
),
raw_bonus_totals as materialized (
  select
    ps.*,
    case when ps.preparation_applied then
      coalesce(
        nullif(ps.validation_snapshot_json->'standardized_bonus_totals'->>'race_support','')::numeric,
        nullif(ps.validation_snapshot_json->'standardized_bonus'->'totals'->>'race_support','')::numeric,
        0
      ) + coalesce(u23.u23_race_support,0)
      else 0 end as race_support,
    case when ps.preparation_applied then
      coalesce(
        nullif(ps.validation_snapshot_json->'standardized_bonus_totals'->>'fatigue_control','')::numeric,
        nullif(ps.validation_snapshot_json->'standardized_bonus'->'totals'->>'fatigue_control','')::numeric,
        0
      ) else 0 end as fatigue_control,
    case when ps.preparation_applied then
      coalesce(
        nullif(ps.validation_snapshot_json->'standardized_bonus_totals'->>'recovery_support','')::numeric,
        nullif(ps.validation_snapshot_json->'standardized_bonus'->'totals'->>'recovery_support','')::numeric,
        0
      ) else 0 end as recovery_support,
    case when ps.preparation_applied then
      coalesce(
        nullif(ps.validation_snapshot_json->'standardized_bonus_totals'->>'health_protection','')::numeric,
        nullif(ps.validation_snapshot_json->'standardized_bonus'->'totals'->>'health_protection','')::numeric,
        0
      ) else 0 end as health_protection,
    case when ps.preparation_applied then
      coalesce(
        nullif(ps.validation_snapshot_json->'standardized_bonus_totals'->>'mechanical_reliability','')::numeric,
        nullif(ps.validation_snapshot_json->'standardized_bonus'->'totals'->>'mechanical_reliability','')::numeric,
        0
      ) else 0 end as mechanical_reliability
  from preparation_source ps
  left join u23_staff_bonus u23
    on u23.team_id=ps.team_id
   and u23.preparation_id is not distinct from ps.preparation_id
),
team_penalties as materialized (
  select
    k.team_id,
    public.race_team_stage_jersey_shortage_penalty_v1(p_stage_id,k.team_id)
      as jersey_penalty
  from (select distinct team_id from prep_keys) k
),
adjusted as materialized (
  select
    rb.*,
    tp.jersey_penalty,
    greatest(
      0::numeric,
      1::numeric
      - coalesce((tp.jersey_penalty->>'preparation_bonus_reduction_pct')::numeric,0)/100
    ) as bonus_factor,
    coalesce((tp.jersey_penalty->>'energy_cost_penalty_pct')::numeric,0)
      as energy_penalty_pct,
    coalesce((tp.jersey_penalty->>'post_stage_fatigue_penalty_pct')::numeric,0)
      as fatigue_penalty_pct
  from raw_bonus_totals rb
  join team_penalties tp on tp.team_id=rb.team_id
),
scaled as materialized (
  select
    a.*,
    case when a.race_support>0
      then a.race_support*a.bonus_factor else a.race_support end as s_race_support,
    case when a.fatigue_control>0
      then a.fatigue_control*a.bonus_factor else a.fatigue_control end as s_fatigue_control,
    case when a.recovery_support>0
      then a.recovery_support*a.bonus_factor else a.recovery_support end as s_recovery_support,
    case when a.health_protection>0
      then a.health_protection*a.bonus_factor else a.health_protection end as s_health_protection,
    case when a.mechanical_reliability>0
      then a.mechanical_reliability*a.bonus_factor else a.mechanical_reliability end as s_mechanical_reliability
  from adjusted a
),
team_modifiers as materialized (
  select
    s.team_id,
    s.preparation_id,
    s.preparation_status,
    s.preparation_applied,
    s.energy_penalty_pct,
    s.fatigue_penalty_pct,
    m.*
  from scaled s
  cross join lateral public.race_engine_calculate_preparation_modifiers_v2(
    s.s_race_support,
    s.s_fatigue_control,
    s.s_recovery_support,
    s.s_health_protection,
    s.s_mechanical_reliability
  ) m
)
select
  ri.race_id,
  ri.stage_id,
  ri.rider_id,
  ri.team_id,
  ri.rider_name,
  ri.team_name,
  ri.preparation_id,
  nullif(tm.preparation_status,'') as preparation_status,
  tm.preparation_applied,
  tm.race_support,
  tm.fatigue_control,
  tm.recovery_support,
  tm.health_protection,
  tm.mechanical_reliability,
  round(
    tm.in_stage_energy_cost_multiplier*(1+tm.energy_penalty_pct/100),
    6
  ) as in_stage_energy_cost_multiplier,
  tm.non_neutral_command_capability_bonus,
  tm.health_incident_risk_multiplier,
  tm.mechanical_incident_risk_multiplier,
  tm.mechanical_time_loss_multiplier,
  round(
    tm.post_stage_fatigue_multiplier*(1+tm.fatigue_penalty_pct/100),
    6
  ) as post_stage_fatigue_multiplier,
  tm.post_stage_recovery_bonus_points,
  'preparation_modifiers_v3_live_staff_2026_09'::text
    as preparation_model_version
from rider_inputs ri
join team_modifiers tm
  on tm.team_id=ri.team_id
 and tm.preparation_id is not distinct from ri.preparation_id
order by ri.team_name,ri.rider_name,ri.rider_id;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_calculate_step_energy_components_v2(p_terrain_type text, p_slope_percent numeric, p_distance_km numeric, p_weather_condition text, p_avg_wind_kmh numeric, p_command_effort_multiplier numeric, p_endurance numeric, p_resistance numeric, p_recovery numeric, p_preparation_energy_cost_multiplier numeric)
 RETURNS TABLE(effective_terrain_type text, base_energy_cost_per_km numeric, slope_energy_multiplier numeric, rider_efficiency_multiplier numeric, command_energy_multiplier numeric, weather_energy_multiplier numeric, preparation_energy_multiplier numeric, gross_energy_cost numeric, recovery_credit numeric, net_energy_cost numeric)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$

with normalized as (
  select
    lower(
      trim(
        coalesce(
          p_terrain_type,
          'flat'
        )
      )
    ) as raw_terrain_type,

    greatest(
      -20::numeric,
      least(
        20::numeric,
        coalesce(p_slope_percent, 0)
      )
    ) as slope_percent,

    greatest(
      0.001::numeric,
      least(
        20::numeric,
        coalesce(p_distance_km, 0.5)
      )
    ) as distance_km,

    lower(
      trim(
        coalesce(
          p_weather_condition,
          'clear'
        )
      )
    ) as weather_condition,

    greatest(
      0::numeric,
      least(
        80::numeric,
        coalesce(p_avg_wind_kmh, 0)
      )
    ) as avg_wind_kmh,

    greatest(
      0.75::numeric,
      least(
        1.25::numeric,
        coalesce(
          p_command_effort_multiplier,
          1
        )
      )
    ) as command_effort_multiplier,

    greatest(
      1::numeric,
      least(
        100::numeric,
        coalesce(p_endurance, 50)
      )
    ) as endurance,

    greatest(
      1::numeric,
      least(
        100::numeric,
        coalesce(p_resistance, 50)
      )
    ) as resistance,

    greatest(
      1::numeric,
      least(
        100::numeric,
        coalesce(p_recovery, 50)
      )
    ) as recovery,

    greatest(
      0.90::numeric,
      least(
        1::numeric,
        coalesce(
          p_preparation_energy_cost_multiplier,
          1
        )
      )
    ) as preparation_energy_multiplier
),

terrain_normalized as (
  select
    normalized.*,

    case
      /*
       * Preserve explicit road-surface or technical labels.
       */
      when normalized.raw_terrain_type in (
        'cobbled',
        'cobble',
        'gravel',
        'technical_descent'
      )
      then normalized.raw_terrain_type

      /*
       * Otherwise use physical slope as the final terrain authority.
       */
      when normalized.slope_percent <= -3
        then 'descent'

      when normalized.slope_percent < -1.5
        then 'descent'

      when normalized.slope_percent >= 6
        then 'steep_climb'

      when normalized.slope_percent >= 2.5
        then 'climb'

      when normalized.slope_percent >= 0.8
        then 'false_flat'

      else 'flat'
    end as effective_terrain_type

  from normalized
),

base_components as (
  select
    terrain.*,

    case terrain.effective_terrain_type
      when 'flat' then 0.280
      when 'false_flat' then 0.320
      when 'climb' then 0.380
      when 'steep_climb' then 0.450
      when 'descent' then 0.120
      when 'technical_descent' then 0.160
      when 'cobbled' then 0.340
      when 'cobble' then 0.340
      when 'gravel' then 0.360
      else 0.300
    end::numeric as base_energy_cost_per_km,

    case terrain.effective_terrain_type
      when 'false_flat' then
        1
        + greatest(
            terrain.slope_percent,
            0
          ) * 0.050

      when 'climb' then
        1
        + greatest(
            terrain.slope_percent,
            0
          ) * 0.080

      when 'steep_climb' then
        1
        + greatest(
            terrain.slope_percent,
            0
          ) * 0.090

      when 'cobbled' then
        1
        + greatest(
            terrain.slope_percent,
            0
          ) * 0.060

      when 'cobble' then
        1
        + greatest(
            terrain.slope_percent,
            0
          ) * 0.060

      when 'gravel' then
        1
        + greatest(
            terrain.slope_percent,
            0
          ) * 0.065

      else
        1
        + greatest(
            terrain.slope_percent,
            0
          ) * 0.020
    end::numeric as slope_energy_multiplier,

    (
      terrain.endurance * 0.50
      + terrain.resistance * 0.30
      + terrain.recovery * 0.20
    )::numeric as energy_efficiency_score

  from terrain_normalized terrain
),

multipliers as (
  select
    base.*,

    /*
     * Better endurance, resistance and recovery reduce the cost of producing
     * the same race effort.
     */
    greatest(
      0.84::numeric,
      least(
        1.18::numeric,

        1
        + (
            60
            - base.energy_efficiency_score
          ) * 0.006
      )
    ) as rider_efficiency_multiplier,

    /*
     * Effort has a stronger energy effect than speed effect:
     *
     * 1.10 effort -> approximately 1.22 energy multiplier
     * 1.00 effort -> 1.00
     * 0.90 effort -> approximately 0.86
     */
    greatest(
      0.75::numeric,
      least(
        1.35::numeric,

        1
        + (
            base.command_effort_multiplier
            - 1
          ) * 1.80

        + abs(
            base.command_effort_multiplier
            - 1
          ) * 0.40
      )
    ) as command_energy_multiplier,

    /*
     * Precipitation and exposed average wind add modest energy pressure.
     * Wind direction is not available yet, so average wind is not treated
     * as a full headwind.
     */
    least(
      1.15::numeric,

      (
        case
          when base.weather_condition in (
            'storm',
            'thunderstorm',
            'heavy_rain',
            'torrential_rain'
          ) then 1.050

          when base.weather_condition in (
            'rain',
            'showers',
            'rain_showers'
          ) then 1.025

          when base.weather_condition in (
            'drizzle',
            'light_rain'
          ) then 1.010

          when base.weather_condition in (
            'snow',
            'sleet',
            'freezing_rain'
          ) then 1.100

          else 1::numeric
        end
      )
      *
      (
        1
        + least(
            0.08::numeric,

            greatest(
              base.avg_wind_kmh - 5,
              0
            ) * 0.002
          )
      )
    ) as weather_energy_multiplier

  from base_components base
),

costs as (
  select
    multiplier.*,

    (
      multiplier.distance_km
      * multiplier.base_energy_cost_per_km
      * multiplier.slope_energy_multiplier
      * multiplier.rider_efficiency_multiplier
      * multiplier.command_energy_multiplier
      * multiplier.weather_energy_multiplier
      * multiplier.preparation_energy_multiplier
    )::numeric as calculated_gross_energy_cost,

    case
      when multiplier.effective_terrain_type in (
        'descent',
        'technical_descent'
      )
      then
        multiplier.distance_km
        * (
            0.030
            + multiplier.recovery
              / 100
              * 0.030
          )

      else 0::numeric
    end as calculated_recovery_credit

  from multipliers multiplier
)

select
  cost.effective_terrain_type,

  round(
    cost.base_energy_cost_per_km,
    6
  ) as base_energy_cost_per_km,

  round(
    cost.slope_energy_multiplier,
    6
  ) as slope_energy_multiplier,

  round(
    cost.rider_efficiency_multiplier,
    6
  ) as rider_efficiency_multiplier,

  round(
    cost.command_energy_multiplier,
    6
  ) as command_energy_multiplier,

  round(
    cost.weather_energy_multiplier,
    6
  ) as weather_energy_multiplier,

  round(
    cost.preparation_energy_multiplier,
    6
  ) as preparation_energy_multiplier,

  round(
    cost.calculated_gross_energy_cost,
    6
  ) as gross_energy_cost,

  round(
    least(
      cost.calculated_gross_energy_cost,
      cost.calculated_recovery_credit
    ),
    6
  ) as recovery_credit,

  round(
    greatest(
      0.001::numeric,

      cost.calculated_gross_energy_cost
      - least(
          cost.calculated_gross_energy_cost,
          cost.calculated_recovery_credit
        )
    ),
    6
  ) as net_energy_cost

from costs cost;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_rider_step_energy_preview_v2(p_stage_id uuid, p_target_step_km numeric DEFAULT 0.5)
 RETURNS TABLE(race_id uuid, stage_id uuid, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, step_order integer, phase_number integer, km_start numeric, km_end numeric, distance_km numeric, terrain_type text, effective_terrain_type text, slope_percent numeric, weather_condition text, avg_wind_kmh numeric, phase_command text, command_effort_multiplier numeric, start_energy numeric, preparation_applied boolean, preparation_energy_multiplier numeric, base_energy_cost_per_km numeric, slope_energy_multiplier numeric, rider_efficiency_multiplier numeric, command_energy_multiplier numeric, weather_energy_multiplier numeric, gross_energy_cost numeric, recovery_credit numeric, net_energy_cost numeric, cumulative_gross_energy_cost numeric, cumulative_recovery_credit numeric, cumulative_net_energy_cost numeric, energy_before_step numeric, energy_after_step numeric, energy_deficit numeric, energy_state text, is_energy_depleted boolean, solo_speed_kmh numeric, solo_step_seconds numeric, point_gate_count integer, is_finish_step boolean, energy_model_version text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$

with speed_rows as (
  select *
  from public.race_engine_get_stage_rider_step_speed_preview_v2(
    p_stage_id,
    p_target_step_km
  )
),

rider_inputs as (
  select *
  from public.race_engine_get_stage_rider_inputs_v1(
    p_stage_id
  )
),

preparation_modifiers as (
  select *
  from public.race_engine_get_stage_rider_preparation_modifiers_v2(
    p_stage_id
  )
),

step_costs as (
  select
    speed.race_id,
    speed.stage_id,

    speed.rider_id,
    speed.team_id,
    speed.rider_name,
    speed.team_name,
    speed.role_code,

    speed.step_order,
    speed.phase_number,

    speed.km_start,
    speed.km_end,
    speed.distance_km,

    speed.terrain_type,
    speed.slope_percent,

    speed.weather_condition,
    speed.avg_wind_kmh,

    speed.phase_command,
    speed.command_effort_multiplier,

    greatest(
      1::numeric,
      least(
        100::numeric,
        coalesce(
          rider_input.start_stamina,
          100
        )
      )
    ) as start_energy,

    preparation.preparation_applied,

    energy_component.effective_terrain_type,
    energy_component.base_energy_cost_per_km,
    energy_component.slope_energy_multiplier,
    energy_component.rider_efficiency_multiplier,
    energy_component.command_energy_multiplier,
    energy_component.weather_energy_multiplier,
    energy_component.preparation_energy_multiplier,

    energy_component.gross_energy_cost,
    energy_component.recovery_credit,
    energy_component.net_energy_cost,

    speed.solo_speed_kmh,
    speed.solo_step_seconds,

    speed.point_gate_count,
    speed.is_finish_step

  from speed_rows speed

  join rider_inputs rider_input
    on rider_input.rider_id = speed.rider_id

  join preparation_modifiers preparation
    on preparation.rider_id = speed.rider_id

  cross join lateral
    public.race_engine_calculate_step_energy_components_v2(
      speed.terrain_type,
      speed.slope_percent,
      speed.distance_km,

      speed.weather_condition,
      speed.avg_wind_kmh,

      speed.command_effort_multiplier,

      rider_input.endurance,
      rider_input.resistance,
      rider_input.recovery,

      preparation.in_stage_energy_cost_multiplier
    ) energy_component
),

cumulative_costs as (
  select
    step_cost.*,

    sum(
      step_cost.gross_energy_cost
    ) over (
      partition by step_cost.rider_id
      order by step_cost.step_order
      rows between unbounded preceding
        and current row
    ) as cumulative_gross_energy_cost,

    sum(
      step_cost.recovery_credit
    ) over (
      partition by step_cost.rider_id
      order by step_cost.step_order
      rows between unbounded preceding
        and current row
    ) as cumulative_recovery_credit,

    sum(
      step_cost.net_energy_cost
    ) over (
      partition by step_cost.rider_id
      order by step_cost.step_order
      rows between unbounded preceding
        and current row
    ) as cumulative_net_energy_cost

  from step_costs step_cost
),

energy_states as (
  select
    cumulative.*,

    greatest(
      0::numeric,

      cumulative.start_energy
      - (
          cumulative.cumulative_net_energy_cost
          - cumulative.net_energy_cost
        )
    ) as calculated_energy_before_step,

    greatest(
      0::numeric,

      cumulative.start_energy
      - cumulative.cumulative_net_energy_cost
    ) as calculated_energy_after_step,

    greatest(
      0::numeric,

      cumulative.cumulative_net_energy_cost
      - cumulative.start_energy
    ) as calculated_energy_deficit

  from cumulative_costs cumulative
)

select
  energy.race_id,
  energy.stage_id,

  energy.rider_id,
  energy.team_id,
  energy.rider_name,
  energy.team_name,
  energy.role_code,

  energy.step_order,
  energy.phase_number,

  energy.km_start,
  energy.km_end,
  energy.distance_km,

  energy.terrain_type,
  energy.effective_terrain_type,
  energy.slope_percent,

  energy.weather_condition,
  energy.avg_wind_kmh,

  energy.phase_command,
  energy.command_effort_multiplier,

  round(
    energy.start_energy,
    6
  ) as start_energy,

  energy.preparation_applied,

  energy.preparation_energy_multiplier,

  energy.base_energy_cost_per_km,
  energy.slope_energy_multiplier,
  energy.rider_efficiency_multiplier,
  energy.command_energy_multiplier,
  energy.weather_energy_multiplier,

  energy.gross_energy_cost,
  energy.recovery_credit,
  energy.net_energy_cost,

  round(
    energy.cumulative_gross_energy_cost,
    6
  ) as cumulative_gross_energy_cost,

  round(
    energy.cumulative_recovery_credit,
    6
  ) as cumulative_recovery_credit,

  round(
    energy.cumulative_net_energy_cost,
    6
  ) as cumulative_net_energy_cost,

  round(
    energy.calculated_energy_before_step,
    6
  ) as energy_before_step,

  round(
    energy.calculated_energy_after_step,
    6
  ) as energy_after_step,

  round(
    energy.calculated_energy_deficit,
    6
  ) as energy_deficit,

  case
    when energy.calculated_energy_after_step <= 0
      then 'depleted'

    when energy.calculated_energy_after_step < 10
      then 'critical'

    when energy.calculated_energy_after_step < 25
      then 'very_tired'

    when energy.calculated_energy_after_step < 45
      then 'tired'

    when energy.calculated_energy_after_step < 70
      then 'stable'

    else 'fresh'
  end as energy_state,

  energy.calculated_energy_after_step <= 0
    as is_energy_depleted,

  energy.solo_speed_kmh,
  energy.solo_step_seconds,

  energy.point_gate_count,
  energy.is_finish_step,

  'step_energy_preview_v2_2026_07'::text
    as energy_model_version

from energy_states energy

order by
  energy.step_order,
  energy.team_name,
  energy.rider_name,
  energy.rider_id;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_calculate_energy_speed_modifier_v2(p_start_energy numeric, p_energy_before_step numeric, p_energy_after_step numeric, p_resistance numeric, p_recovery numeric)
 RETURNS TABLE(average_step_energy numeric, reserve_ratio numeric, resilience_score numeric, reserve_depletion_penalty numeric, absolute_energy_penalty numeric, raw_energy_speed_penalty numeric, resilience_mitigation_fraction numeric, applied_energy_speed_penalty numeric, energy_speed_multiplier numeric)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$

with normalized as (
  select
    greatest(
      1::numeric,
      least(
        100::numeric,
        coalesce(p_start_energy, 100)
      )
    ) as start_energy,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(
          p_energy_before_step,
          p_start_energy,
          100
        )
      )
    ) as energy_before_step,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(
          p_energy_after_step,
          p_energy_before_step,
          p_start_energy,
          100
        )
      )
    ) as energy_after_step,

    greatest(
      1::numeric,
      least(
        100::numeric,
        coalesce(p_resistance, 50)
      )
    ) as resistance,

    greatest(
      1::numeric,
      least(
        100::numeric,
        coalesce(p_recovery, 50)
      )
    ) as recovery
),

derived as (
  select
    normalized.*,

    (
      normalized.energy_before_step
      + normalized.energy_after_step
    ) / 2::numeric as average_step_energy,

    greatest(
      0::numeric,
      least(
        1::numeric,

        (
          normalized.energy_before_step
          + normalized.energy_after_step
        )
        /
        2::numeric
        /
        nullif(normalized.start_energy, 0)
      )
    ) as reserve_ratio,

    (
      normalized.resistance * 0.70
      + normalized.recovery * 0.30
    )::numeric as resilience_score

  from normalized
),

raw_penalties as (
  select
    derived.*,

    /*
     * Reserve-depletion curve:
     *
     * 55–100% reserve: no penalty
     * 40–55% reserve:  0–1%
     * 25–40% reserve:  1–3%
     * 12–25% reserve:  3–8%
     *  0–12% reserve:  8–18%
     */
    case
      when derived.reserve_ratio >= 0.55
        then 0::numeric

      when derived.reserve_ratio >= 0.40
        then
          (
            0.55
            - derived.reserve_ratio
          )
          / 0.15
          * 0.01

      when derived.reserve_ratio >= 0.25
        then
          0.01
          +
          (
            0.40
            - derived.reserve_ratio
          )
          / 0.15
          * 0.02

      when derived.reserve_ratio >= 0.12
        then
          0.03
          +
          (
            0.25
            - derived.reserve_ratio
          )
          / 0.13
          * 0.05

      else
        0.08
        +
        (
          0.12
          - derived.reserve_ratio
        )
        / 0.12
        * 0.10
    end as reserve_depletion_penalty,

    /*
     * Additional absolute-energy protection.
     *
     * This matters when a rider approaches actual exhaustion, even when the
     * rider began the stage with relatively low available energy.
     */
    case
      when derived.average_step_energy >= 15
        then 0::numeric

      when derived.average_step_energy >= 5
        then
          (
            15
            - derived.average_step_energy
          )
          / 10
          * 0.04

      else
        0.04
        +
        (
          5
          - derived.average_step_energy
        )
        / 5
        * 0.06
    end as absolute_energy_penalty,

    /*
     * High resistance and recovery mitigate only part of the penalty.
     * They cannot remove exhaustion.
     */
    greatest(
      -0.10::numeric,
      least(
        0.15::numeric,

        (
          derived.resilience_score
          - 50
        ) * 0.003
      )
    ) as resilience_mitigation_fraction

  from derived
),

applied as (
  select
    raw_penalty.*,

    least(
      0.28::numeric,

      raw_penalty.reserve_depletion_penalty
      + raw_penalty.absolute_energy_penalty
    ) as raw_energy_speed_penalty

  from raw_penalties raw_penalty
),

final_values as (
  select
    applied.*,

    greatest(
      0::numeric,

      applied.raw_energy_speed_penalty
      *
      (
        1
        - applied.resilience_mitigation_fraction
      )
    ) as applied_energy_speed_penalty

  from applied
)

select
  round(
    final_value.average_step_energy,
    6
  ) as average_step_energy,

  round(
    final_value.reserve_ratio,
    6
  ) as reserve_ratio,

  round(
    final_value.resilience_score,
    6
  ) as resilience_score,

  round(
    final_value.reserve_depletion_penalty,
    6
  ) as reserve_depletion_penalty,

  round(
    final_value.absolute_energy_penalty,
    6
  ) as absolute_energy_penalty,

  round(
    final_value.raw_energy_speed_penalty,
    6
  ) as raw_energy_speed_penalty,

  round(
    final_value.resilience_mitigation_fraction,
    6
  ) as resilience_mitigation_fraction,

  round(
    final_value.applied_energy_speed_penalty,
    6
  ) as applied_energy_speed_penalty,

  round(
    greatest(
      0.72::numeric,
      least(
        1::numeric,

        1
        - final_value.applied_energy_speed_penalty
      )
    ),
    6
  ) as energy_speed_multiplier

from final_values final_value;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_rider_energy_adjusted_speed_preview_v2(p_stage_id uuid, p_target_step_km numeric DEFAULT 0.5)
 RETURNS TABLE(race_id uuid, stage_id uuid, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, step_order integer, phase_number integer, km_start numeric, km_end numeric, distance_km numeric, terrain_type text, slope_percent numeric, phase_command text, command_effort_multiplier numeric, start_energy numeric, energy_before_step numeric, energy_after_step numeric, energy_state text, reserve_ratio numeric, resilience_score numeric, reserve_depletion_penalty numeric, absolute_energy_penalty numeric, raw_energy_speed_penalty numeric, resilience_mitigation_fraction numeric, applied_energy_speed_penalty numeric, energy_speed_multiplier numeric, solo_speed_kmh numeric, energy_adjusted_speed_kmh numeric, solo_step_seconds numeric, energy_adjusted_step_seconds numeric, additional_step_seconds_vs_solo numeric, cumulative_solo_seconds numeric, cumulative_energy_adjusted_seconds numeric, cumulative_additional_seconds_vs_solo numeric, point_gate_count integer, is_finish_step boolean, energy_speed_model_version text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$

with energy_rows as (
  select *
  from public.race_engine_get_stage_rider_step_energy_preview_v2(
    p_stage_id,
    p_target_step_km
  )
),

rider_inputs as (
  select *
  from public.race_engine_get_stage_rider_inputs_v1(
    p_stage_id
  )
),

modified_rows as (
  select
    energy.race_id,
    energy.stage_id,

    energy.rider_id,
    energy.team_id,
    energy.rider_name,
    energy.team_name,
    energy.role_code,

    energy.step_order,
    energy.phase_number,

    energy.km_start,
    energy.km_end,
    energy.distance_km,

    energy.terrain_type,
    energy.slope_percent,

    energy.phase_command,
    energy.command_effort_multiplier,

    energy.start_energy,
    energy.energy_before_step,
    energy.energy_after_step,
    energy.energy_state,

    modifier.reserve_ratio,
    modifier.resilience_score,

    modifier.reserve_depletion_penalty,
    modifier.absolute_energy_penalty,
    modifier.raw_energy_speed_penalty,
    modifier.resilience_mitigation_fraction,
    modifier.applied_energy_speed_penalty,
    modifier.energy_speed_multiplier,

    energy.solo_speed_kmh,
    energy.solo_step_seconds,

    round(
      greatest(
        5::numeric,

        energy.solo_speed_kmh
        * modifier.energy_speed_multiplier
      ),
      6
    ) as energy_adjusted_speed_kmh,

    energy.point_gate_count,
    energy.is_finish_step

  from energy_rows energy

  join rider_inputs rider_input
    on rider_input.rider_id = energy.rider_id

  cross join lateral
    public.race_engine_calculate_energy_speed_modifier_v2(
      energy.start_energy,
      energy.energy_before_step,
      energy.energy_after_step,
      rider_input.resistance,
      rider_input.recovery
    ) modifier
),

step_times as (
  select
    modified.*,

    round(
      (
        modified.distance_km
        /
        nullif(
          modified.energy_adjusted_speed_kmh,
          0
        )
        * 3600
      )::numeric,
      6
    ) as energy_adjusted_step_seconds

  from modified_rows modified
),

timed_rows as (
  select
    step_time.*,

    round(
      greatest(
        0::numeric,

        step_time.energy_adjusted_step_seconds
        - step_time.solo_step_seconds
      ),
      6
    ) as additional_step_seconds_vs_solo,

    round(
      sum(
        step_time.solo_step_seconds
      ) over (
        partition by step_time.rider_id
        order by step_time.step_order
        rows between unbounded preceding
          and current row
      ),
      6
    ) as cumulative_solo_seconds,

    round(
      sum(
        step_time.energy_adjusted_step_seconds
      ) over (
        partition by step_time.rider_id
        order by step_time.step_order
        rows between unbounded preceding
          and current row
      ),
      6
    ) as cumulative_energy_adjusted_seconds

  from step_times step_time
)

select
  timed.race_id,
  timed.stage_id,

  timed.rider_id,
  timed.team_id,
  timed.rider_name,
  timed.team_name,
  timed.role_code,

  timed.step_order,
  timed.phase_number,

  timed.km_start,
  timed.km_end,
  timed.distance_km,

  timed.terrain_type,
  timed.slope_percent,

  timed.phase_command,
  timed.command_effort_multiplier,

  timed.start_energy,
  timed.energy_before_step,
  timed.energy_after_step,
  timed.energy_state,

  timed.reserve_ratio,
  timed.resilience_score,

  timed.reserve_depletion_penalty,
  timed.absolute_energy_penalty,
  timed.raw_energy_speed_penalty,
  timed.resilience_mitigation_fraction,
  timed.applied_energy_speed_penalty,
  timed.energy_speed_multiplier,

  timed.solo_speed_kmh,
  timed.energy_adjusted_speed_kmh,

  timed.solo_step_seconds,
  timed.energy_adjusted_step_seconds,
  timed.additional_step_seconds_vs_solo,

  timed.cumulative_solo_seconds,
  timed.cumulative_energy_adjusted_seconds,

  round(
    greatest(
      0::numeric,

      timed.cumulative_energy_adjusted_seconds
      - timed.cumulative_solo_seconds
    ),
    6
  ) as cumulative_additional_seconds_vs_solo,

  timed.point_gate_count,
  timed.is_finish_step,

  'energy_speed_coupling_v2_2026_07'::text
    as energy_speed_model_version

from timed_rows timed

order by
  timed.step_order,
  timed.team_name,
  timed.rider_name,
  timed.rider_id;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_calculate_group_attachment_components_v2(p_terrain_type text, p_slope_percent numeric, p_group_size integer, p_group_speed_kmh numeric, p_rider_free_speed_kmh numeric, p_exposure_fraction numeric)
 RETURNS TABLE(effective_terrain_type text, group_size integer, assumed_exposure_fraction numeric, base_max_drafting_gain_fraction numeric, group_size_drafting_factor numeric, applied_drafting_gain_fraction numeric, drafting_speed_multiplier numeric, required_free_speed_kmh numeric, attachment_margin_kmh numeric, attachment_capacity_ratio numeric, attachment_pressure_fraction numeric, attachment_state text)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$

with normalized as (
  select
    lower(
      trim(
        coalesce(
          p_terrain_type,
          'flat'
        )
      )
    ) as raw_terrain_type,

    greatest(
      -20::numeric,
      least(
        20::numeric,
        coalesce(p_slope_percent, 0)
      )
    ) as slope_percent,

    greatest(
      1,
      least(
        500,
        coalesce(p_group_size, 1)
      )
    )::integer as group_size,

    greatest(
      5::numeric,
      least(
        100::numeric,
        coalesce(p_group_speed_kmh, 30)
      )
    ) as group_speed_kmh,

    greatest(
      5::numeric,
      least(
        100::numeric,
        coalesce(
          p_rider_free_speed_kmh,
          30
        )
      )
    ) as rider_free_speed_kmh,

    greatest(
      0::numeric,
      least(
        1::numeric,
        coalesce(p_exposure_fraction, 0.25)
      )
    ) as exposure_fraction
),

terrain_resolved as (
  select
    normalized.*,

    case
      when normalized.raw_terrain_type in (
        'cobbled',
        'cobble',
        'gravel',
        'technical_descent'
      )
      then normalized.raw_terrain_type

      when normalized.slope_percent <= -3
        then 'descent'

      when normalized.slope_percent < -1.5
        then 'descent'

      when normalized.slope_percent >= 6
        then 'steep_climb'

      when normalized.slope_percent >= 2.5
        then 'climb'

      when normalized.slope_percent >= 0.8
        then 'false_flat'

      else 'flat'
    end as effective_terrain_type

  from normalized
),

drafting_base as (
  select
    terrain.*,

    /*
     * Speed-equivalent drafting benefit.
     *
     * These are intentionally much smaller than aerodynamic power savings.
     * They represent how much lower a rider's free-speed capacity may be
     * while still holding the same group speed.
     */
    case terrain.effective_terrain_type
      when 'flat' then 0.065
      when 'false_flat' then 0.050
      when 'climb' then 0.028
      when 'steep_climb' then 0.015
      when 'descent' then 0.025
      when 'technical_descent' then 0.015
      when 'cobbled' then 0.040
      when 'cobble' then 0.040
      when 'gravel' then 0.035
      else 0.045
    end::numeric
      as base_max_drafting_gain_fraction,

    /*
     * One rider receives no group-size benefit.
     * The value approaches 1 for a large peloton.
     */
    (
      1
      - exp(
          -greatest(
            terrain.group_size - 1,
            0
          )::numeric
          / 12::numeric
        )
    )::numeric as group_size_drafting_factor

  from terrain_resolved terrain
),

drafting_applied as (
  select
    drafting.*,

    greatest(
      0::numeric,
      least(
        0.08::numeric,

        drafting.base_max_drafting_gain_fraction
        * drafting.group_size_drafting_factor
        * (
            1
            - drafting.exposure_fraction
          )
      )
    ) as applied_drafting_gain_fraction

  from drafting_base drafting
),

required_capacity as (
  select
    drafting.*,

    (
      1
      + drafting.applied_drafting_gain_fraction
    ) as drafting_speed_multiplier,

    drafting.group_speed_kmh
    /
    nullif(
      1
      + drafting.applied_drafting_gain_fraction,
      0
    ) as required_free_speed_kmh

  from drafting_applied drafting
),

attachment as (
  select
    required.*,

    (
      required.rider_free_speed_kmh
      - required.required_free_speed_kmh
    ) as attachment_margin_kmh,

    required.rider_free_speed_kmh
    /
    nullif(
      required.required_free_speed_kmh,
      0
    ) as attachment_capacity_ratio

  from required_capacity required
),

final_values as (
  select
    attachment.*,

    greatest(
      0::numeric,

      1
      - attachment.attachment_capacity_ratio
    ) as attachment_pressure_fraction

  from attachment
)

select
  final_value.effective_terrain_type,
  final_value.group_size,

  round(
    final_value.exposure_fraction,
    6
  ) as assumed_exposure_fraction,

  round(
    final_value.base_max_drafting_gain_fraction,
    6
  ) as base_max_drafting_gain_fraction,

  round(
    final_value.group_size_drafting_factor,
    6
  ) as group_size_drafting_factor,

  round(
    final_value.applied_drafting_gain_fraction,
    6
  ) as applied_drafting_gain_fraction,

  round(
    final_value.drafting_speed_multiplier,
    6
  ) as drafting_speed_multiplier,

  round(
    final_value.required_free_speed_kmh,
    6
  ) as required_free_speed_kmh,

  round(
    final_value.attachment_margin_kmh,
    6
  ) as attachment_margin_kmh,

  round(
    final_value.attachment_capacity_ratio,
    6
  ) as attachment_capacity_ratio,

  round(
    final_value.attachment_pressure_fraction,
    6
  ) as attachment_pressure_fraction,

  case
    when final_value.attachment_capacity_ratio >= 1.040
      then 'comfortable'

    when final_value.attachment_capacity_ratio >= 1.015
      then 'stable'

    when final_value.attachment_capacity_ratio >= 1.000
      then 'holding'

    when final_value.attachment_capacity_ratio >= 0.985
      then 'strained'

    when final_value.attachment_capacity_ratio >= 0.960
      then 'cracking'

    else 'detached'
  end as attachment_state

from final_values final_value;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_peloton_attachment_preview_v2(p_stage_id uuid, p_target_step_km numeric DEFAULT 0.5, p_assumed_exposure_fraction numeric DEFAULT 0.25)
 RETURNS TABLE(race_id uuid, stage_id uuid, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, step_order integer, phase_number integer, km_start numeric, km_end numeric, distance_km numeric, terrain_type text, effective_terrain_type text, slope_percent numeric, assumed_group_size integer, assumed_exposure_fraction numeric, median_rider_speed_kmh numeric, pace_anchor_speed_kmh numeric, front_speed_cap_kmh numeric, group_cooperation_factor numeric, group_cooperation_speed_multiplier numeric, peloton_reference_speed_kmh numeric, rider_free_speed_kmh numeric, base_max_drafting_gain_fraction numeric, group_size_drafting_factor numeric, applied_drafting_gain_fraction numeric, drafting_speed_multiplier numeric, required_free_speed_kmh numeric, attachment_margin_kmh numeric, attachment_capacity_ratio numeric, attachment_pressure_fraction numeric, attachment_pressure_seconds_equivalent numeric, rolling_10_step_margin_kmh numeric, cumulative_attachment_pressure_seconds numeric, attachment_state text, energy_before_step numeric, energy_after_step numeric, energy_state text, point_gate_count integer, is_finish_step boolean, peloton_attachment_model_version text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$

with rider_steps as (
  select *
  from public.race_engine_get_stage_rider_energy_adjusted_speed_preview_v2(
    p_stage_id,
    p_target_step_km
  )
),

step_statistics as (
  select
    rider_step.race_id,
    rider_step.stage_id,

    rider_step.step_order,
    rider_step.phase_number,

    rider_step.km_start,
    rider_step.km_end,
    rider_step.distance_km,

    rider_step.terrain_type,
    rider_step.slope_percent,

    rider_step.point_gate_count,
    rider_step.is_finish_step,

    count(*)::integer as rider_count,

    (
      percentile_cont(0.50)
      within group (
        order by rider_step.energy_adjusted_speed_kmh
      )
    )::numeric as median_rider_speed_kmh,

    (
      percentile_cont(0.75)
      within group (
        order by rider_step.energy_adjusted_speed_kmh
      )
    )::numeric as pace_anchor_speed_kmh,

    (
      percentile_cont(0.90)
      within group (
        order by rider_step.energy_adjusted_speed_kmh
      )
    )::numeric as front_speed_cap_kmh

  from rider_steps rider_step

  group by
    rider_step.race_id,
    rider_step.stage_id,
    rider_step.step_order,
    rider_step.phase_number,
    rider_step.km_start,
    rider_step.km_end,
    rider_step.distance_km,
    rider_step.terrain_type,
    rider_step.slope_percent,
    rider_step.point_gate_count,
    rider_step.is_finish_step
),

resolved_step_statistics as (
  select
    step_statistic.*,

    case
      when lower(
        coalesce(
          step_statistic.terrain_type,
          ''
        )
      ) in (
        'cobbled',
        'cobble',
        'gravel',
        'technical_descent'
      )
      then lower(step_statistic.terrain_type)

      when step_statistic.slope_percent <= -3
        then 'descent'

      when step_statistic.slope_percent < -1.5
        then 'descent'

      when step_statistic.slope_percent >= 6
        then 'steep_climb'

      when step_statistic.slope_percent >= 2.5
        then 'climb'

      when step_statistic.slope_percent >= 0.8
        then 'false_flat'

      else 'flat'
    end as effective_terrain_type,

    (
      1
      - exp(
          -greatest(
            step_statistic.rider_count - 1,
            0
          )::numeric
          / 20::numeric
        )
    )::numeric as group_cooperation_factor

  from step_statistics step_statistic
),

peloton_pace as (
  select
    resolved.*,

    (
      1
      +
      resolved.group_cooperation_factor
      *
      case resolved.effective_terrain_type
        when 'flat' then 0.015
        when 'false_flat' then 0.012
        when 'climb' then 0.005
        when 'steep_climb' then 0.002
        when 'descent' then 0.003
        when 'technical_descent' then 0
        when 'cobbled' then 0.008
        when 'cobble' then 0.008
        when 'gravel' then 0.006
        else 0.008
      end
    )::numeric
      as group_cooperation_speed_multiplier

  from resolved_step_statistics resolved
),

final_peloton_pace as (
  select
    peloton.*,

    least(
      peloton.front_speed_cap_kmh,

      greatest(
        peloton.median_rider_speed_kmh,

        peloton.pace_anchor_speed_kmh
        * peloton.group_cooperation_speed_multiplier
      )
    )::numeric as peloton_reference_speed_kmh

  from peloton_pace peloton
),

rider_attachment as (
  select
    rider_step.race_id,
    rider_step.stage_id,

    rider_step.rider_id,
    rider_step.team_id,
    rider_step.rider_name,
    rider_step.team_name,
    rider_step.role_code,

    rider_step.step_order,
    rider_step.phase_number,

    rider_step.km_start,
    rider_step.km_end,
    rider_step.distance_km,

    rider_step.terrain_type,
    pace.effective_terrain_type,
    rider_step.slope_percent,

    pace.rider_count as assumed_group_size,

    attachment.assumed_exposure_fraction,

    pace.median_rider_speed_kmh,
    pace.pace_anchor_speed_kmh,
    pace.front_speed_cap_kmh,

    pace.group_cooperation_factor,
    pace.group_cooperation_speed_multiplier,
    pace.peloton_reference_speed_kmh,

    rider_step.energy_adjusted_speed_kmh
      as rider_free_speed_kmh,

    attachment.base_max_drafting_gain_fraction,
    attachment.group_size_drafting_factor,
    attachment.applied_drafting_gain_fraction,
    attachment.drafting_speed_multiplier,

    attachment.required_free_speed_kmh,
    attachment.attachment_margin_kmh,
    attachment.attachment_capacity_ratio,
    attachment.attachment_pressure_fraction,

    (
      attachment.attachment_pressure_fraction
      * rider_step.energy_adjusted_step_seconds
    )::numeric
      as attachment_pressure_seconds_equivalent,

    attachment.attachment_state,

    rider_step.energy_before_step,
    rider_step.energy_after_step,
    rider_step.energy_state,

    rider_step.point_gate_count,
    rider_step.is_finish_step

  from rider_steps rider_step

  join final_peloton_pace pace
    on pace.step_order = rider_step.step_order
   and pace.stage_id = rider_step.stage_id

  cross join lateral
    public.race_engine_calculate_group_attachment_components_v2(
      rider_step.terrain_type,
      rider_step.slope_percent,

      pace.rider_count,
      pace.peloton_reference_speed_kmh,
      rider_step.energy_adjusted_speed_kmh,

      p_assumed_exposure_fraction
    ) attachment
),

windowed as (
  select
    rider_attachment.*,

    avg(
      rider_attachment.attachment_margin_kmh
    ) over (
      partition by rider_attachment.rider_id
      order by rider_attachment.step_order
      rows between 9 preceding
        and current row
    ) as rolling_10_step_margin_kmh,

    sum(
      rider_attachment.attachment_pressure_seconds_equivalent
    ) over (
      partition by rider_attachment.rider_id
      order by rider_attachment.step_order
      rows between unbounded preceding
        and current row
    ) as cumulative_attachment_pressure_seconds

  from rider_attachment
)

select
  windowed.race_id,
  windowed.stage_id,

  windowed.rider_id,
  windowed.team_id,
  windowed.rider_name,
  windowed.team_name,
  windowed.role_code,

  windowed.step_order,
  windowed.phase_number,

  windowed.km_start,
  windowed.km_end,
  windowed.distance_km,

  windowed.terrain_type,
  windowed.effective_terrain_type,
  windowed.slope_percent,

  windowed.assumed_group_size,
  windowed.assumed_exposure_fraction,

  round(
    windowed.median_rider_speed_kmh,
    6
  ) as median_rider_speed_kmh,

  round(
    windowed.pace_anchor_speed_kmh,
    6
  ) as pace_anchor_speed_kmh,

  round(
    windowed.front_speed_cap_kmh,
    6
  ) as front_speed_cap_kmh,

  round(
    windowed.group_cooperation_factor,
    6
  ) as group_cooperation_factor,

  round(
    windowed.group_cooperation_speed_multiplier,
    6
  ) as group_cooperation_speed_multiplier,

  round(
    windowed.peloton_reference_speed_kmh,
    6
  ) as peloton_reference_speed_kmh,

  round(
    windowed.rider_free_speed_kmh,
    6
  ) as rider_free_speed_kmh,

  windowed.base_max_drafting_gain_fraction,
  windowed.group_size_drafting_factor,
  windowed.applied_drafting_gain_fraction,
  windowed.drafting_speed_multiplier,

  windowed.required_free_speed_kmh,
  windowed.attachment_margin_kmh,
  windowed.attachment_capacity_ratio,
  windowed.attachment_pressure_fraction,

  round(
    windowed.attachment_pressure_seconds_equivalent,
    6
  ) as attachment_pressure_seconds_equivalent,

  round(
    windowed.rolling_10_step_margin_kmh,
    6
  ) as rolling_10_step_margin_kmh,

  round(
    windowed.cumulative_attachment_pressure_seconds,
    6
  ) as cumulative_attachment_pressure_seconds,

  windowed.attachment_state,

  windowed.energy_before_step,
  windowed.energy_after_step,
  windowed.energy_state,

  windowed.point_gate_count,
  windowed.is_finish_step,

  'peloton_attachment_preview_v2_2026_07'::text
    as peloton_attachment_model_version

from windowed

order by
  windowed.step_order,
  windowed.team_name,
  windowed.rider_name,
  windowed.rider_id;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_natural_split_preview_v2(p_stage_id uuid, p_target_step_km numeric DEFAULT 0.5, p_assumed_exposure_fraction numeric DEFAULT 0.25, p_neutral_km numeric DEFAULT 12)
 RETURNS TABLE(race_id uuid, stage_id uuid, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, step_order integer, phase_number integer, km_start numeric, km_end numeric, distance_km numeric, terrain_type text, slope_percent numeric, peloton_reference_speed_kmh numeric, rider_free_speed_kmh numeric, peloton_step_seconds numeric, rider_free_step_seconds numeric, attachment_capacity_ratio numeric, attachment_margin_kmh numeric, rolling_10_step_margin_kmh numeric, attachment_state text, rolling_8_step_cracking_count integer, rolling_12_step_pressure_seconds numeric, rolling_20_step_margin_kmh numeric, cumulative_pressure_after_neutral numeric, split_trigger_reason text, split_trigger_step_order integer, split_trigger_km numeric, natural_split_state text, provisional_group_code text, provisional_group_short_label text, provisional_group_rank integer, peloton_size integer, dropped_rider_count integer, rider_live_speed_kmh numeric, rider_live_step_seconds numeric, cumulative_peloton_seconds numeric, cumulative_rider_seconds numeric, live_gap_seconds numeric, energy_before_step numeric, energy_after_step numeric, energy_state text, point_gate_count integer, is_finish_step boolean, natural_split_model_version text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$

with parameters as (
  select
    greatest(
      0::numeric,
      coalesce(
        p_neutral_km,
        12::numeric
      )
    ) as neutral_km
),

attachment_rows as (
  select *
  from public.race_engine_get_stage_peloton_attachment_preview_v2(
    p_stage_id,
    p_target_step_km,
    p_assumed_exposure_fraction
  )
),

step_metrics as (
  select
    attachment.*,

    round(
      (
        attachment.distance_km
        /
        nullif(
          attachment.peloton_reference_speed_kmh,
          0
        )
        * 3600
      )::numeric,
      6
    ) as peloton_step_seconds,

    round(
      (
        attachment.distance_km
        /
        nullif(
          attachment.rider_free_speed_kmh,
          0
        )
        * 3600
      )::numeric,
      6
    ) as rider_free_step_seconds

  from attachment_rows attachment
),

rolling_metrics as (
  select
    metric.*,

    count(*) filter (
      where metric.attachment_state in (
        'cracking',
        'detached'
      )
    ) over (
      partition by metric.rider_id
      order by metric.step_order
      rows between 7 preceding
        and current row
    )::integer as rolling_8_step_cracking_count,

    sum(
      metric.attachment_pressure_seconds_equivalent
    ) over (
      partition by metric.rider_id
      order by metric.step_order
      rows between 11 preceding
        and current row
    ) as rolling_12_step_pressure_seconds,

    avg(
      metric.attachment_margin_kmh
    ) over (
      partition by metric.rider_id
      order by metric.step_order
      rows between 19 preceding
        and current row
    ) as rolling_20_step_margin_kmh,

    sum(
      case
        when metric.km_end >
          parameters.neutral_km
        then
          metric.attachment_pressure_seconds_equivalent

        else 0::numeric
      end
    ) over (
      partition by metric.rider_id
      order by metric.step_order
      rows between unbounded preceding
        and current row
    ) as cumulative_pressure_after_neutral

  from step_metrics metric

  cross join parameters
),

trigger_candidates as (
  select
    rolling.*,

    case
      /*
       * No physical separation during the neutralized opening.
       */
      when rolling.km_end <=
        parameters.neutral_km
      then null::text

      /*
       * A split cannot become physical at the finish because there is no
       * subsequent route step during which a measurable gap can form.
       */
      when rolling.is_finish_step
      then null::text

      /*
       * Acute failure:
       * repeated cracking, meaningful recent pressure and a significant
       * sustained speed deficit.
       */
      when rolling.rolling_8_step_cracking_count >= 4

       and rolling.rolling_12_step_pressure_seconds
          >= 2::numeric

       and rolling.rolling_10_step_margin_kmh
          <= -0.35::numeric

      then 'acute_cracking'

      /*
       * Sustained failure:
       * sufficient cumulative pressure and a consistently negative margin.
       */
      when rolling.cumulative_pressure_after_neutral
          >= 60::numeric

       and rolling.rolling_20_step_margin_kmh
          <= -0.35::numeric

      then 'sustained_attachment_overload'

      /*
       * Very long smaller deficit.
       */
      when rolling.cumulative_pressure_after_neutral
          >= 100::numeric

       and rolling.rolling_20_step_margin_kmh
          < -0.10::numeric

      then 'long_duration_attachment_overload'

      else null::text
    end as candidate_split_trigger_reason

  from rolling_metrics rolling

  cross join parameters
),

first_trigger as (
  select
    candidate.rider_id,

    min(
      candidate.step_order
    ) filter (
      where candidate.candidate_split_trigger_reason
        is not null
    )::integer as split_trigger_step_order

  from trigger_candidates candidate

  group by candidate.rider_id
),

trigger_details as (
  select
    first_trigger.rider_id,
    first_trigger.split_trigger_step_order,

    trigger_row.km_end
      as split_trigger_km,

    trigger_row.candidate_split_trigger_reason
      as split_trigger_reason

  from first_trigger

  left join trigger_candidates trigger_row
    on trigger_row.rider_id =
      first_trigger.rider_id

   and trigger_row.step_order =
      first_trigger.split_trigger_step_order
),

state_rows as (
  select
    candidate.*,

    trigger_detail.split_trigger_reason,
    trigger_detail.split_trigger_step_order,
    trigger_detail.split_trigger_km,

    case
      when candidate.km_end <=
        parameters.neutral_km
      then 'neutralized'

      when trigger_detail.split_trigger_step_order
        is not null

       and candidate.step_order >
          trigger_detail.split_trigger_step_order
      then 'dropped'

      when trigger_detail.split_trigger_step_order
        is not null

       and candidate.step_order =
          trigger_detail.split_trigger_step_order
      then 'split_trigger'

      when candidate.attachment_state in (
        'strained',
        'cracking',
        'detached'
      )
      then 'peloton_at_risk'

      else 'peloton'
    end::text as natural_split_state,

    case
      when trigger_detail.split_trigger_step_order
        is not null

       and candidate.step_order >
          trigger_detail.split_trigger_step_order
      then 'dropped_group_01'

      else 'main_peloton'
    end::text as provisional_group_code

  from trigger_candidates candidate

  join trigger_details trigger_detail
    on trigger_detail.rider_id =
      candidate.rider_id

  cross join parameters
),

live_step_rows as (
  select
    state.*,

    case
      when state.provisional_group_code =
        'main_peloton'
      then state.peloton_step_seconds

      else greatest(
        state.peloton_step_seconds,
        state.rider_free_step_seconds
      )
    end::numeric as rider_live_step_seconds

  from state_rows state
),

cumulative_rows as (
  select
    live_step.*,

    sum(
      live_step.peloton_step_seconds
    ) over (
      partition by live_step.rider_id
      order by live_step.step_order
      rows between unbounded preceding
        and current row
    ) as cumulative_peloton_seconds,

    sum(
      live_step.rider_live_step_seconds
    ) over (
      partition by live_step.rider_id
      order by live_step.step_order
      rows between unbounded preceding
        and current row
    ) as cumulative_rider_seconds

  from live_step_rows live_step
),

group_sized_rows as (
  select
    cumulative.*,

    count(*) filter (
      where cumulative.provisional_group_code =
        'main_peloton'
    ) over (
      partition by cumulative.step_order
    )::integer as peloton_size,

    count(*) filter (
      where cumulative.provisional_group_code =
        'dropped_group_01'
    ) over (
      partition by cumulative.step_order
    )::integer as dropped_rider_count

  from cumulative_rows cumulative
)

select
  grouped.race_id,
  grouped.stage_id,

  grouped.rider_id,
  grouped.team_id,
  grouped.rider_name,
  grouped.team_name,
  grouped.role_code,

  grouped.step_order,
  grouped.phase_number,

  grouped.km_start,
  grouped.km_end,
  grouped.distance_km,

  grouped.terrain_type,
  grouped.slope_percent,

  round(
    grouped.peloton_reference_speed_kmh,
    6
  ) as peloton_reference_speed_kmh,

  round(
    grouped.rider_free_speed_kmh,
    6
  ) as rider_free_speed_kmh,

  round(
    grouped.peloton_step_seconds,
    6
  ) as peloton_step_seconds,

  round(
    grouped.rider_free_step_seconds,
    6
  ) as rider_free_step_seconds,

  grouped.attachment_capacity_ratio,
  grouped.attachment_margin_kmh,
  grouped.rolling_10_step_margin_kmh,
  grouped.attachment_state,

  grouped.rolling_8_step_cracking_count,

  round(
    grouped.rolling_12_step_pressure_seconds,
    6
  ) as rolling_12_step_pressure_seconds,

  round(
    grouped.rolling_20_step_margin_kmh,
    6
  ) as rolling_20_step_margin_kmh,

  round(
    grouped.cumulative_pressure_after_neutral,
    6
  ) as cumulative_pressure_after_neutral,

  grouped.split_trigger_reason,
  grouped.split_trigger_step_order,

  round(
    grouped.split_trigger_km,
    6
  ) as split_trigger_km,

  grouped.natural_split_state,

  grouped.provisional_group_code,

  case grouped.provisional_group_code
    when 'main_peloton' then 'P'
    when 'dropped_group_01' then 'B1'
    else '?'
  end::text as provisional_group_short_label,

  case grouped.provisional_group_code
    when 'main_peloton' then 1
    when 'dropped_group_01' then 2
    else 99
  end::integer as provisional_group_rank,

  grouped.peloton_size,
  grouped.dropped_rider_count,

  round(
    grouped.distance_km
    /
    nullif(
      grouped.rider_live_step_seconds / 3600,
      0
    ),
    6
  ) as rider_live_speed_kmh,

  round(
    grouped.rider_live_step_seconds,
    6
  ) as rider_live_step_seconds,

  round(
    grouped.cumulative_peloton_seconds,
    6
  ) as cumulative_peloton_seconds,

  round(
    grouped.cumulative_rider_seconds,
    6
  ) as cumulative_rider_seconds,

  round(
    greatest(
      0::numeric,

      grouped.cumulative_rider_seconds
      - grouped.cumulative_peloton_seconds
    ),
    6
  ) as live_gap_seconds,

  grouped.energy_before_step,
  grouped.energy_after_step,
  grouped.energy_state,

  grouped.point_gate_count,
  grouped.is_finish_step,

  'natural_split_preview_v2_2026_07_finish_guard'::text
    as natural_split_model_version

from group_sized_rows grouped

order by
  grouped.step_order,

  case grouped.provisional_group_code
    when 'main_peloton' then 1
    when 'dropped_group_01' then 2
    else 99
  end,

  grouped.team_name,
  grouped.rider_name,
  grouped.rider_id;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_clustered_group_preview_v2(p_stage_id uuid, p_target_step_km numeric DEFAULT 0.5, p_assumed_exposure_fraction numeric DEFAULT 0.25, p_neutral_km numeric DEFAULT 12, p_group_gap_threshold_seconds numeric DEFAULT 9)
 RETURNS TABLE(race_id uuid, stage_id uuid, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, step_order integer, phase_number integer, km_start numeric, km_end numeric, distance_km numeric, terrain_type text, slope_percent numeric, natural_split_state text, split_trigger_reason text, split_trigger_step_order integer, split_trigger_km numeric, rider_live_speed_kmh numeric, rider_live_step_seconds numeric, cumulative_peloton_seconds numeric, cumulative_rider_seconds numeric, rider_live_gap_seconds numeric, group_gap_threshold_seconds numeric, live_group_code text, live_group_short_label text, live_group_rank integer, live_group_cluster_number integer, live_group_size integer, live_group_gap_seconds numeric, live_group_max_gap_seconds numeric, live_group_spread_seconds numeric, rider_gap_from_group_front_seconds numeric, live_group_elapsed_seconds numeric, peloton_size integer, total_dropped_riders integer, distinct_live_groups integer, energy_before_step numeric, energy_after_step numeric, energy_state text, point_gate_count integer, is_finish_step boolean, clustered_group_model_version text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$

with recursive

parameters as (
  select
    greatest(
      0.1::numeric,
      coalesce(
        p_group_gap_threshold_seconds,
        9::numeric
      )
    ) as group_gap_threshold_seconds
),

natural_rows as (
  select *
  from public.race_engine_get_stage_natural_split_preview_v2(
    p_stage_id,
    p_target_step_km,
    p_assumed_exposure_fraction,
    p_neutral_km
  )
),

/*
 * Number dropped riders at every route step from the closest rider behind
 * the peloton to the rider furthest behind.
 */
dropped_ordered as (
  select
    split_row.step_order,
    split_row.rider_id,
    split_row.live_gap_seconds,

    row_number() over (
      partition by split_row.step_order
      order by
        split_row.live_gap_seconds,
        split_row.rider_id
    ) as dropped_position

  from natural_rows split_row

  where split_row.provisional_group_code =
    'dropped_group_01'
),

/*
 * Recursively cluster dropped riders.
 *
 * The first rider of a group becomes that group's gap anchor.
 * Other riders may join the group only when they are no more than the
 * configured threshold behind the group's front rider.
 */
dropped_clustered (
  step_order,
  rider_id,
  dropped_position,
  live_gap_seconds,
  cluster_number,
  cluster_anchor_gap_seconds
) as (
  /*
   * The first dropped rider at each step starts cluster 1.
   */
  select
    ordered.step_order,
    ordered.rider_id,
    ordered.dropped_position,
    ordered.live_gap_seconds,

    1::integer as cluster_number,

    ordered.live_gap_seconds
      as cluster_anchor_gap_seconds

  from dropped_ordered ordered

  where ordered.dropped_position = 1

  union all

  /*
   * Process the next dropped rider at the same route step.
   */
  select
    next_rider.step_order,
    next_rider.rider_id,
    next_rider.dropped_position,
    next_rider.live_gap_seconds,

    case
      when
        next_rider.live_gap_seconds
        - current_group.cluster_anchor_gap_seconds
        >
        parameters.group_gap_threshold_seconds

      then current_group.cluster_number + 1

      else current_group.cluster_number
    end::integer as cluster_number,

    case
      when
        next_rider.live_gap_seconds
        - current_group.cluster_anchor_gap_seconds
        >
        parameters.group_gap_threshold_seconds

      then next_rider.live_gap_seconds

      else current_group.cluster_anchor_gap_seconds
    end as cluster_anchor_gap_seconds

  from dropped_clustered current_group

  join dropped_ordered next_rider
    on next_rider.step_order =
      current_group.step_order

   and next_rider.dropped_position =
      current_group.dropped_position + 1

  cross join parameters
),

/*
 * Assign cluster zero to peloton riders and the recursively calculated
 * cluster number to dropped riders.
 */
assigned_rows as (
  select
    split_row.race_id,
    split_row.stage_id,

    split_row.rider_id,
    split_row.team_id,
    split_row.rider_name,
    split_row.team_name,
    split_row.role_code,

    split_row.step_order,
    split_row.phase_number,

    split_row.km_start,
    split_row.km_end,
    split_row.distance_km,

    split_row.terrain_type,
    split_row.slope_percent,

    split_row.natural_split_state,

    split_row.split_trigger_reason,
    split_row.split_trigger_step_order,
    split_row.split_trigger_km,

    split_row.rider_live_speed_kmh,
    split_row.rider_live_step_seconds,

    split_row.cumulative_peloton_seconds,
    split_row.cumulative_rider_seconds,
    split_row.live_gap_seconds,

    split_row.energy_before_step,
    split_row.energy_after_step,
    split_row.energy_state,

    split_row.point_gate_count,
    split_row.is_finish_step,

    0::integer as live_group_cluster_number

  from natural_rows split_row

  where split_row.provisional_group_code =
    'main_peloton'

  union all

  select
    split_row.race_id,
    split_row.stage_id,

    split_row.rider_id,
    split_row.team_id,
    split_row.rider_name,
    split_row.team_name,
    split_row.role_code,

    split_row.step_order,
    split_row.phase_number,

    split_row.km_start,
    split_row.km_end,
    split_row.distance_km,

    split_row.terrain_type,
    split_row.slope_percent,

    split_row.natural_split_state,

    split_row.split_trigger_reason,
    split_row.split_trigger_step_order,
    split_row.split_trigger_km,

    split_row.rider_live_speed_kmh,
    split_row.rider_live_step_seconds,

    split_row.cumulative_peloton_seconds,
    split_row.cumulative_rider_seconds,
    split_row.live_gap_seconds,

    split_row.energy_before_step,
    split_row.energy_after_step,
    split_row.energy_state,

    split_row.point_gate_count,
    split_row.is_finish_step,

    clustered.cluster_number
      as live_group_cluster_number

  from natural_rows split_row

  join dropped_clustered clustered
    on clustered.step_order =
      split_row.step_order

   and clustered.rider_id =
      split_row.rider_id

  where split_row.provisional_group_code =
    'dropped_group_01'
),

named_rows as (
  select
    assigned.*,

    case
      when assigned.live_group_cluster_number = 0
      then 'main_peloton'

      else
        'dropped_group_'
        ||
        lpad(
          assigned.live_group_cluster_number::text,
          2,
          '0'
        )
    end::text as live_group_code,

    case
      when assigned.live_group_cluster_number = 0
      then 'P'

      else
        'B'
        ||
        assigned.live_group_cluster_number::text
    end::text as live_group_short_label,

    (
      assigned.live_group_cluster_number + 1
    )::integer as live_group_rank

  from assigned_rows assigned
),

group_metrics as (
  select
    named.*,

    count(*) over (
      partition by
        named.step_order,
        named.live_group_code
    )::integer as live_group_size,

    min(
      named.live_gap_seconds
    ) over (
      partition by
        named.step_order,
        named.live_group_code
    ) as live_group_gap_seconds,

    max(
      named.live_gap_seconds
    ) over (
      partition by
        named.step_order,
        named.live_group_code
    ) as live_group_max_gap_seconds

  from named_rows named
),

group_spreads as (
  select
    metric.*,

    (
      metric.live_group_max_gap_seconds
      - metric.live_group_gap_seconds
    ) as live_group_spread_seconds,

    greatest(
      0::numeric,

      metric.live_gap_seconds
      - metric.live_group_gap_seconds
    ) as rider_gap_from_group_front_seconds,

    (
      metric.cumulative_peloton_seconds
      + metric.live_group_gap_seconds
    ) as live_group_elapsed_seconds

  from group_metrics metric
),

step_summaries as (
  select
    spread.step_order,

    count(*) filter (
      where spread.live_group_code =
        'main_peloton'
    )::integer as peloton_size,

    count(*) filter (
      where spread.live_group_code <>
        'main_peloton'
    )::integer as total_dropped_riders,

    count(
      distinct spread.live_group_code
    )::integer as distinct_live_groups

  from group_spreads spread

  group by spread.step_order
)

select
  spread.race_id,
  spread.stage_id,

  spread.rider_id,
  spread.team_id,
  spread.rider_name,
  spread.team_name,
  spread.role_code,

  spread.step_order,
  spread.phase_number,

  spread.km_start,
  spread.km_end,
  spread.distance_km,

  spread.terrain_type,
  spread.slope_percent,

  spread.natural_split_state,

  spread.split_trigger_reason,
  spread.split_trigger_step_order,
  spread.split_trigger_km,

  spread.rider_live_speed_kmh,
  spread.rider_live_step_seconds,

  spread.cumulative_peloton_seconds,
  spread.cumulative_rider_seconds,

  round(
    spread.live_gap_seconds,
    6
  ) as rider_live_gap_seconds,

  parameters.group_gap_threshold_seconds,

  spread.live_group_code,
  spread.live_group_short_label,
  spread.live_group_rank,
  spread.live_group_cluster_number,

  spread.live_group_size,

  round(
    spread.live_group_gap_seconds,
    6
  ) as live_group_gap_seconds,

  round(
    spread.live_group_max_gap_seconds,
    6
  ) as live_group_max_gap_seconds,

  round(
    spread.live_group_spread_seconds,
    6
  ) as live_group_spread_seconds,

  round(
    spread.rider_gap_from_group_front_seconds,
    6
  ) as rider_gap_from_group_front_seconds,

  round(
    spread.live_group_elapsed_seconds,
    6
  ) as live_group_elapsed_seconds,

  step_summary.peloton_size,
  step_summary.total_dropped_riders,
  step_summary.distinct_live_groups,

  spread.energy_before_step,
  spread.energy_after_step,
  spread.energy_state,

  spread.point_gate_count,
  spread.is_finish_step,

  'clustered_live_groups_v2_2026_07'::text
    as clustered_group_model_version

from group_spreads spread

join step_summaries step_summary
  on step_summary.step_order =
    spread.step_order

cross join parameters

order by
  spread.step_order,
  spread.live_group_rank,
  spread.live_group_gap_seconds,
  spread.rider_name,
  spread.rider_id;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_calculate_live_group_pace_components_v2(p_group_code text, p_terrain_type text, p_slope_percent numeric, p_group_size integer, p_median_member_speed_kmh numeric, p_anchor_member_speed_kmh numeric, p_front_cap_member_speed_kmh numeric)
 RETURNS TABLE(effective_terrain_type text, live_group_type text, normalized_group_size integer, group_cooperation_factor numeric, group_cooperation_speed_multiplier numeric, raw_group_pace_kmh numeric, live_group_pace_kmh numeric)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$

with normalized as (
  select
    lower(
      trim(
        coalesce(
          p_group_code,
          'main_peloton'
        )
      )
    ) as group_code,

    lower(
      trim(
        coalesce(
          p_terrain_type,
          'flat'
        )
      )
    ) as raw_terrain_type,

    greatest(
      -20::numeric,
      least(
        20::numeric,
        coalesce(p_slope_percent, 0)
      )
    ) as slope_percent,

    greatest(
      1,
      least(
        500,
        coalesce(p_group_size, 1)
      )
    )::integer as group_size,

    greatest(
      5::numeric,
      least(
        100::numeric,
        coalesce(
          p_median_member_speed_kmh,
          30
        )
      )
    ) as median_member_speed_kmh,

    greatest(
      5::numeric,
      least(
        100::numeric,
        coalesce(
          p_anchor_member_speed_kmh,
          p_median_member_speed_kmh,
          30
        )
      )
    ) as anchor_member_speed_kmh,

    greatest(
      5::numeric,
      least(
        100::numeric,
        coalesce(
          p_front_cap_member_speed_kmh,
          p_anchor_member_speed_kmh,
          p_median_member_speed_kmh,
          30
        )
      )
    ) as front_cap_member_speed_kmh
),

resolved as (
  select
    normalized.*,

    case
      when normalized.raw_terrain_type in (
        'cobbled',
        'cobble',
        'gravel',
        'technical_descent'
      )
      then normalized.raw_terrain_type

      when normalized.slope_percent <= -3
        then 'descent'

      when normalized.slope_percent < -1.5
        then 'descent'

      when normalized.slope_percent >= 6
        then 'steep_climb'

      when normalized.slope_percent >= 2.5
        then 'climb'

      when normalized.slope_percent >= 0.8
        then 'false_flat'

      else 'flat'
    end as effective_terrain_type,

    case
      when normalized.group_code =
        'main_peloton'
      then 'peloton'

      when normalized.group_code like
        'dropped_group_%'
      then 'dropped_group'

      else 'other_group'
    end as live_group_type

  from normalized
),

cooperation as (
  select
    resolved.*,

    case
      when resolved.group_size <= 1
      then 0::numeric

      when resolved.live_group_type =
        'peloton'
      then
        1
        - exp(
            -greatest(
              resolved.group_size - 1,
              0
            )::numeric
            / 20::numeric
          )

      else
        1
        - exp(
            -greatest(
              resolved.group_size - 1,
              0
            )::numeric
            / 6::numeric
          )
    end::numeric as group_cooperation_factor

  from resolved
),

multipliers as (
  select
    cooperation.*,

    case
      when cooperation.group_size <= 1
      then 1::numeric

      when cooperation.live_group_type =
        'peloton'
      then
        1
        +
        cooperation.group_cooperation_factor
        *
        case cooperation.effective_terrain_type
          when 'flat' then 0.015
          when 'false_flat' then 0.012
          when 'climb' then 0.005
          when 'steep_climb' then 0.002
          when 'descent' then 0.003
          when 'technical_descent' then 0
          when 'cobbled' then 0.008
          when 'cobble' then 0.008
          when 'gravel' then 0.006
          else 0.008
        end

      else
        1
        +
        cooperation.group_cooperation_factor
        *
        case cooperation.effective_terrain_type
          when 'flat' then 0.010
          when 'false_flat' then 0.008
          when 'climb' then 0.003
          when 'steep_climb' then 0.001
          when 'descent' then 0.002
          when 'technical_descent' then 0
          when 'cobbled' then 0.005
          when 'cobble' then 0.005
          when 'gravel' then 0.004
          else 0.005
        end
    end::numeric as group_cooperation_speed_multiplier

  from cooperation
),

raw_pace as (
  select
    multiplier.*,

    case
      /*
       * A singleton group is simply that rider.
       */
      when multiplier.group_size <= 1
      then multiplier.median_member_speed_kmh

      else greatest(
        multiplier.median_member_speed_kmh,

        multiplier.anchor_member_speed_kmh
        * multiplier.group_cooperation_speed_multiplier
      )
    end::numeric as calculated_raw_group_pace_kmh

  from multipliers multiplier
)

select
  raw.effective_terrain_type,
  raw.live_group_type,
  raw.group_size as normalized_group_size,

  round(
    raw.group_cooperation_factor,
    6
  ) as group_cooperation_factor,

  round(
    raw.group_cooperation_speed_multiplier,
    6
  ) as group_cooperation_speed_multiplier,

  round(
    raw.calculated_raw_group_pace_kmh,
    6
  ) as raw_group_pace_kmh,

  round(
    case
      when raw.group_size <= 1
      then raw.median_member_speed_kmh

      else least(
        raw.front_cap_member_speed_kmh,
        raw.calculated_raw_group_pace_kmh
      )
    end,
    6
  ) as live_group_pace_kmh

from raw_pace raw;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_live_group_pace_preview_v2(p_stage_id uuid, p_target_step_km numeric DEFAULT 0.5, p_assumed_peloton_exposure_fraction numeric DEFAULT 0.25, p_neutral_km numeric DEFAULT 12, p_group_gap_threshold_seconds numeric DEFAULT 9)
 RETURNS TABLE(race_id uuid, stage_id uuid, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, step_order integer, phase_number integer, km_start numeric, km_end numeric, distance_km numeric, terrain_type text, effective_terrain_type text, slope_percent numeric, live_group_code text, live_group_short_label text, live_group_rank integer, live_group_size integer, existing_group_gap_seconds numeric, existing_group_spread_seconds numeric, rider_free_speed_kmh numeric, minimum_member_speed_kmh numeric, median_member_speed_kmh numeric, anchor_member_speed_kmh numeric, front_cap_member_speed_kmh numeric, maximum_member_speed_kmh numeric, group_cooperation_factor numeric, group_cooperation_speed_multiplier numeric, live_group_pace_kmh numeric, live_group_step_seconds numeric, assumed_exposure_fraction numeric, applied_drafting_gain_fraction numeric, drafting_speed_multiplier numeric, required_free_speed_kmh numeric, attachment_margin_kmh numeric, attachment_capacity_ratio numeric, attachment_pressure_fraction numeric, group_attachment_state text, previous_rider_live_speed_kmh numeric, group_pace_delta_vs_previous_kmh numeric, energy_before_step numeric, energy_after_step numeric, energy_state text, point_gate_count integer, is_finish_step boolean, live_group_pace_model_version text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$

with recursive

parameters as (
  select
    greatest(
      0.1::numeric,
      coalesce(
        p_group_gap_threshold_seconds,
        9::numeric
      )
    ) as group_gap_threshold_seconds,

    greatest(
      0::numeric,
      least(
        1::numeric,
        coalesce(
          p_assumed_peloton_exposure_fraction,
          0.25::numeric
        )
      )
    ) as peloton_exposure_fraction
),

/*
 * This is the expensive physical pipeline.
 *
 * MATERIALIZED ensures that PostgreSQL executes it only once, even though
 * several later CTEs use these rows.
 */
natural_rows as materialized (
  select *
  from public.race_engine_get_stage_natural_split_preview_v2(
    p_stage_id,
    p_target_step_km,
    p_assumed_peloton_exposure_fraction,
    p_neutral_km
  )
),

/*
 * Order dropped riders by their current live gap at every step.
 */
dropped_ordered as (
  select
    split_row.step_order,
    split_row.rider_id,
    split_row.live_gap_seconds,

    row_number() over (
      partition by split_row.step_order
      order by
        split_row.live_gap_seconds,
        split_row.rider_id
    ) as dropped_position

  from natural_rows split_row

  where split_row.provisional_group_code =
    'dropped_group_01'
),

/*
 * Cluster dropped riders using the configured maximum group spread.
 */
dropped_clustered (
  step_order,
  rider_id,
  dropped_position,
  live_gap_seconds,
  cluster_number,
  cluster_anchor_gap_seconds
) as (
  select
    ordered.step_order,
    ordered.rider_id,
    ordered.dropped_position,
    ordered.live_gap_seconds,

    1::integer as cluster_number,

    ordered.live_gap_seconds
      as cluster_anchor_gap_seconds

  from dropped_ordered ordered

  where ordered.dropped_position = 1

  union all

  select
    next_rider.step_order,
    next_rider.rider_id,
    next_rider.dropped_position,
    next_rider.live_gap_seconds,

    case
      when
        next_rider.live_gap_seconds
        - current_cluster.cluster_anchor_gap_seconds
        >
        parameters.group_gap_threshold_seconds

      then current_cluster.cluster_number + 1

      else current_cluster.cluster_number
    end::integer as cluster_number,

    case
      when
        next_rider.live_gap_seconds
        - current_cluster.cluster_anchor_gap_seconds
        >
        parameters.group_gap_threshold_seconds

      then next_rider.live_gap_seconds

      else current_cluster.cluster_anchor_gap_seconds
    end as cluster_anchor_gap_seconds

  from dropped_clustered current_cluster

  join dropped_ordered next_rider
    on next_rider.step_order =
      current_cluster.step_order

   and next_rider.dropped_position =
      current_cluster.dropped_position + 1

  cross join parameters
),

/*
 * Assign cluster zero to the peloton.
 */
assigned_rows as (
  select
    split_row.race_id,
    split_row.stage_id,

    split_row.rider_id,
    split_row.team_id,
    split_row.rider_name,
    split_row.team_name,
    split_row.role_code,

    split_row.step_order,
    split_row.phase_number,

    split_row.km_start,
    split_row.km_end,
    split_row.distance_km,

    split_row.terrain_type,
    split_row.slope_percent,

    split_row.live_gap_seconds,

    split_row.rider_free_speed_kmh,

    split_row.rider_live_speed_kmh
      as previous_rider_live_speed_kmh,

    split_row.energy_before_step,
    split_row.energy_after_step,
    split_row.energy_state,

    split_row.point_gate_count,
    split_row.is_finish_step,

    0::integer as live_group_cluster_number

  from natural_rows split_row

  where split_row.provisional_group_code =
    'main_peloton'

  union all

  select
    split_row.race_id,
    split_row.stage_id,

    split_row.rider_id,
    split_row.team_id,
    split_row.rider_name,
    split_row.team_name,
    split_row.role_code,

    split_row.step_order,
    split_row.phase_number,

    split_row.km_start,
    split_row.km_end,
    split_row.distance_km,

    split_row.terrain_type,
    split_row.slope_percent,

    split_row.live_gap_seconds,

    split_row.rider_free_speed_kmh,

    split_row.rider_live_speed_kmh
      as previous_rider_live_speed_kmh,

    split_row.energy_before_step,
    split_row.energy_after_step,
    split_row.energy_state,

    split_row.point_gate_count,
    split_row.is_finish_step,

    clustered.cluster_number
      as live_group_cluster_number

  from natural_rows split_row

  join dropped_clustered clustered
    on clustered.step_order =
      split_row.step_order

   and clustered.rider_id =
      split_row.rider_id

  where split_row.provisional_group_code =
    'dropped_group_01'
),

named_rows as (
  select
    assigned.*,

    case
      when assigned.live_group_cluster_number = 0
      then 'main_peloton'

      else
        'dropped_group_'
        ||
        lpad(
          assigned.live_group_cluster_number::text,
          2,
          '0'
        )
    end::text as live_group_code,

    case
      when assigned.live_group_cluster_number = 0
      then 'P'

      else
        'B'
        ||
        assigned.live_group_cluster_number::text
    end::text as live_group_short_label,

    (
      assigned.live_group_cluster_number + 1
    )::integer as live_group_rank

  from assigned_rows assigned
),

grouped_rows as (
  select
    named.*,

    count(*) over (
      partition by
        named.step_order,
        named.live_group_code
    )::integer as live_group_size,

    min(
      named.live_gap_seconds
    ) over (
      partition by
        named.step_order,
        named.live_group_code
    ) as existing_group_gap_seconds,

    max(
      named.live_gap_seconds
    ) over (
      partition by
        named.step_order,
        named.live_group_code
    )
    -
    min(
      named.live_gap_seconds
    ) over (
      partition by
        named.step_order,
        named.live_group_code
    ) as existing_group_spread_seconds

  from named_rows named
),

/*
 * Calculate physical member-speed distributions for every current group.
 */
group_statistics as (
  select
    grouped.stage_id,
    grouped.step_order,

    grouped.live_group_code,
    grouped.live_group_short_label,
    grouped.live_group_rank,

    min(grouped.terrain_type)
      as terrain_type,

    min(grouped.slope_percent)
      as slope_percent,

    count(*)::integer
      as live_group_size,

    min(
      grouped.rider_free_speed_kmh
    )::numeric as minimum_member_speed_kmh,

    (
      percentile_cont(0.50)
      within group (
        order by grouped.rider_free_speed_kmh
      )
    )::numeric as median_member_speed_kmh,

    (
      percentile_cont(0.60)
      within group (
        order by grouped.rider_free_speed_kmh
      )
    )::numeric as percentile_60_speed_kmh,

    (
      percentile_cont(0.75)
      within group (
        order by grouped.rider_free_speed_kmh
      )
    )::numeric as percentile_75_speed_kmh,

    (
      percentile_cont(0.85)
      within group (
        order by grouped.rider_free_speed_kmh
      )
    )::numeric as percentile_85_speed_kmh,

    (
      percentile_cont(0.90)
      within group (
        order by grouped.rider_free_speed_kmh
      )
    )::numeric as percentile_90_speed_kmh,

    max(
      grouped.rider_free_speed_kmh
    )::numeric as maximum_member_speed_kmh

  from grouped_rows grouped

  group by
    grouped.stage_id,
    grouped.step_order,
    grouped.live_group_code,
    grouped.live_group_short_label,
    grouped.live_group_rank
),

selected_statistics as (
  select
    statistic.*,

    case
      when statistic.live_group_code =
        'main_peloton'
      then statistic.percentile_75_speed_kmh

      else statistic.percentile_60_speed_kmh
    end::numeric as anchor_member_speed_kmh,

    case
      when statistic.live_group_code =
        'main_peloton'
      then statistic.percentile_90_speed_kmh

      else statistic.percentile_85_speed_kmh
    end::numeric as front_cap_member_speed_kmh

  from group_statistics statistic
),

group_paces as (
  select
    selected.*,

    pace.effective_terrain_type,
    pace.group_cooperation_factor,
    pace.group_cooperation_speed_multiplier,
    pace.live_group_pace_kmh

  from selected_statistics selected

  cross join lateral
    public.race_engine_calculate_live_group_pace_components_v2(
      selected.live_group_code,
      selected.terrain_type,
      selected.slope_percent,
      selected.live_group_size,

      selected.median_member_speed_kmh,
      selected.anchor_member_speed_kmh,
      selected.front_cap_member_speed_kmh
    ) pace
),

rows_with_group_pace as (
  select
    grouped.*,

    group_pace.effective_terrain_type,

    group_pace.minimum_member_speed_kmh,
    group_pace.median_member_speed_kmh,
    group_pace.anchor_member_speed_kmh,
    group_pace.front_cap_member_speed_kmh,
    group_pace.maximum_member_speed_kmh,

    group_pace.group_cooperation_factor,
    group_pace.group_cooperation_speed_multiplier,
    group_pace.live_group_pace_kmh

  from grouped_rows grouped

  join group_paces group_pace
    on group_pace.stage_id =
      grouped.stage_id

   and group_pace.step_order =
      grouped.step_order

   and group_pace.live_group_code =
      grouped.live_group_code
),

exposure_rows as (
  select
    group_row.*,

    case
      /*
       * Singleton riders receive no drafting.
       */
      when group_row.live_group_size <= 1
      then 1::numeric

      when group_row.live_group_code =
        'main_peloton'
      then parameters.peloton_exposure_fraction

      when group_row.live_group_size = 2
      then 0.55::numeric

      when group_row.live_group_size <= 5
      then 0.40::numeric

      when group_row.live_group_size <= 15
      then 0.30::numeric

      else 0.25::numeric
    end as assumed_exposure_fraction

  from rows_with_group_pace group_row

  cross join parameters
),

attachment_rows as (
  select
    exposure.*,

    attachment.applied_drafting_gain_fraction,
    attachment.drafting_speed_multiplier,

    attachment.required_free_speed_kmh,
    attachment.attachment_margin_kmh,
    attachment.attachment_capacity_ratio,
    attachment.attachment_pressure_fraction,

    attachment.attachment_state
      as group_attachment_state

  from exposure_rows exposure

  cross join lateral
    public.race_engine_calculate_group_attachment_components_v2(
      exposure.terrain_type,
      exposure.slope_percent,

      exposure.live_group_size,
      exposure.live_group_pace_kmh,
      exposure.rider_free_speed_kmh,

      exposure.assumed_exposure_fraction
    ) attachment
)

select
  attachment.race_id,
  attachment.stage_id,

  attachment.rider_id,
  attachment.team_id,
  attachment.rider_name,
  attachment.team_name,
  attachment.role_code,

  attachment.step_order,
  attachment.phase_number,

  attachment.km_start,
  attachment.km_end,
  attachment.distance_km,

  attachment.terrain_type,
  attachment.effective_terrain_type,
  attachment.slope_percent,

  attachment.live_group_code,
  attachment.live_group_short_label,
  attachment.live_group_rank,
  attachment.live_group_size,

  round(
    attachment.existing_group_gap_seconds,
    6
  ) as existing_group_gap_seconds,

  round(
    attachment.existing_group_spread_seconds,
    6
  ) as existing_group_spread_seconds,

  round(
    attachment.rider_free_speed_kmh,
    6
  ) as rider_free_speed_kmh,

  round(
    attachment.minimum_member_speed_kmh,
    6
  ) as minimum_member_speed_kmh,

  round(
    attachment.median_member_speed_kmh,
    6
  ) as median_member_speed_kmh,

  round(
    attachment.anchor_member_speed_kmh,
    6
  ) as anchor_member_speed_kmh,

  round(
    attachment.front_cap_member_speed_kmh,
    6
  ) as front_cap_member_speed_kmh,

  round(
    attachment.maximum_member_speed_kmh,
    6
  ) as maximum_member_speed_kmh,

  round(
    attachment.group_cooperation_factor,
    6
  ) as group_cooperation_factor,

  round(
    attachment.group_cooperation_speed_multiplier,
    6
  ) as group_cooperation_speed_multiplier,

  round(
    attachment.live_group_pace_kmh,
    6
  ) as live_group_pace_kmh,

  round(
    (
      attachment.distance_km
      /
      nullif(
        attachment.live_group_pace_kmh,
        0
      )
      * 3600
    )::numeric,
    6
  ) as live_group_step_seconds,

  round(
    attachment.assumed_exposure_fraction,
    6
  ) as assumed_exposure_fraction,

  attachment.applied_drafting_gain_fraction,
  attachment.drafting_speed_multiplier,

  attachment.required_free_speed_kmh,
  attachment.attachment_margin_kmh,
  attachment.attachment_capacity_ratio,
  attachment.attachment_pressure_fraction,
  attachment.group_attachment_state,

  round(
    attachment.previous_rider_live_speed_kmh,
    6
  ) as previous_rider_live_speed_kmh,

  round(
    attachment.live_group_pace_kmh
    - attachment.previous_rider_live_speed_kmh,
    6
  ) as group_pace_delta_vs_previous_kmh,

  attachment.energy_before_step,
  attachment.energy_after_step,
  attachment.energy_state,

  attachment.point_gate_count,
  attachment.is_finish_step,

  'live_group_pace_preview_v2_2026_07_single_pass'::text
    as live_group_pace_model_version

from attachment_rows attachment

order by
  attachment.step_order,
  attachment.live_group_rank,
  attachment.live_group_code,
  attachment.rider_name,
  attachment.rider_id;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_group_pace_clock_preview_v2(p_stage_id uuid, p_target_step_km numeric DEFAULT 0.5, p_assumed_peloton_exposure_fraction numeric DEFAULT 0.25, p_neutral_km numeric DEFAULT 12, p_group_gap_threshold_seconds numeric DEFAULT 9)
 RETURNS TABLE(race_id uuid, stage_id uuid, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, step_order integer, phase_number integer, km_start numeric, km_end numeric, distance_km numeric, terrain_type text, slope_percent numeric, previous_live_group_code text, previous_live_group_short_label text, previous_live_group_rank integer, previous_live_group_size integer, previous_group_gap_seconds numeric, live_group_pace_kmh numeric, live_group_step_seconds numeric, recomputed_cumulative_peloton_seconds numeric, recomputed_cumulative_rider_seconds numeric, recomputed_rider_gap_seconds numeric, group_gap_threshold_seconds numeric, reclustered_group_code text, reclustered_group_short_label text, reclustered_group_rank integer, reclustered_group_cluster_number integer, reclustered_group_size integer, reclustered_group_gap_seconds numeric, reclustered_group_max_gap_seconds numeric, reclustered_group_spread_seconds numeric, rider_gap_from_group_front_seconds numeric, reclustered_group_elapsed_seconds numeric, group_identity_changed boolean, energy_before_step numeric, energy_after_step numeric, energy_state text, point_gate_count integer, is_finish_step boolean, group_pace_clock_model_version text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$

with recursive

parameters as (
  select
    greatest(
      0.1::numeric,
      coalesce(
        p_group_gap_threshold_seconds,
        9::numeric
      )
    ) as group_gap_threshold_seconds
),

/*
 * Execute the expensive group-pace pipeline once.
 */
pace_rows as materialized (
  select *
  from public.race_engine_get_stage_live_group_pace_preview_v2(
    p_stage_id,
    p_target_step_km,
    p_assumed_peloton_exposure_fraction,
    p_neutral_km,
    p_group_gap_threshold_seconds
  )
),

/*
 * There is one peloton step time per physical route step.
 */
peloton_step_rows as (
  select
    pace.step_order,

    min(
      pace.live_group_step_seconds
    )::numeric as peloton_step_seconds

  from pace_rows pace

  where pace.live_group_code =
    'main_peloton'

  group by pace.step_order
),

/*
 * Build the cumulative peloton clock.
 */
peloton_clock_rows as (
  select
    peloton_step.step_order,

    peloton_step.peloton_step_seconds,

    sum(
      peloton_step.peloton_step_seconds
    ) over (
      order by peloton_step.step_order
      rows between unbounded preceding
        and current row
    ) as recomputed_cumulative_peloton_seconds

  from peloton_step_rows peloton_step
),

/*
 * Every rider now travels each step at their current live group's physical
 * pace rather than at the earlier provisional individual pace.
 */
rider_clock_rows as (
  select
    pace.*,

    sum(
      pace.live_group_step_seconds
    ) over (
      partition by pace.rider_id
      order by pace.step_order
      rows between unbounded preceding
        and current row
    ) as recomputed_cumulative_rider_seconds

  from pace_rows pace
),

gap_rows as (
  select
    rider_clock.*,

    peloton_clock.recomputed_cumulative_peloton_seconds,

    greatest(
      0::numeric,

      rider_clock.recomputed_cumulative_rider_seconds
      - peloton_clock.recomputed_cumulative_peloton_seconds
    ) as recomputed_rider_gap_seconds

  from rider_clock_rows rider_clock

  join peloton_clock_rows peloton_clock
    on peloton_clock.step_order =
      rider_clock.step_order
),

/*
 * Preserve the physical split decision from Phase 3H.
 *
 * This phase recalculates the time gaps and group clustering of riders who
 * are already physically detached. Reattachment is intentionally deferred.
 */
dropped_ordered as (
  select
    gap_row.step_order,
    gap_row.rider_id,
    gap_row.recomputed_rider_gap_seconds,

    row_number() over (
      partition by gap_row.step_order
      order by
        gap_row.recomputed_rider_gap_seconds,
        gap_row.rider_id
    ) as dropped_position

  from gap_rows gap_row

  where gap_row.live_group_code <>
    'main_peloton'
),

/*
 * Recluster dropped riders from the recomputed physical gaps.
 */
dropped_clustered (
  step_order,
  rider_id,
  dropped_position,
  recomputed_rider_gap_seconds,
  cluster_number,
  cluster_anchor_gap_seconds
) as (
  select
    ordered.step_order,
    ordered.rider_id,
    ordered.dropped_position,
    ordered.recomputed_rider_gap_seconds,

    1::integer as cluster_number,

    ordered.recomputed_rider_gap_seconds
      as cluster_anchor_gap_seconds

  from dropped_ordered ordered

  where ordered.dropped_position = 1

  union all

  select
    next_rider.step_order,
    next_rider.rider_id,
    next_rider.dropped_position,
    next_rider.recomputed_rider_gap_seconds,

    case
      when
        next_rider.recomputed_rider_gap_seconds
        - current_cluster.cluster_anchor_gap_seconds
        >
        parameters.group_gap_threshold_seconds

      then current_cluster.cluster_number + 1

      else current_cluster.cluster_number
    end::integer as cluster_number,

    case
      when
        next_rider.recomputed_rider_gap_seconds
        - current_cluster.cluster_anchor_gap_seconds
        >
        parameters.group_gap_threshold_seconds

      then next_rider.recomputed_rider_gap_seconds

      else current_cluster.cluster_anchor_gap_seconds
    end as cluster_anchor_gap_seconds

  from dropped_clustered current_cluster

  join dropped_ordered next_rider
    on next_rider.step_order =
      current_cluster.step_order

   and next_rider.dropped_position =
      current_cluster.dropped_position + 1

  cross join parameters
),

assigned_rows as (
  /*
   * Peloton riders remain cluster zero.
   */
  select
    gap_row.*,

    0::integer
      as reclustered_group_cluster_number

  from gap_rows gap_row

  where gap_row.live_group_code =
    'main_peloton'

  union all

  /*
   * Detached riders receive their recomputed cluster number.
   */
  select
    gap_row.*,

    clustered.cluster_number
      as reclustered_group_cluster_number

  from gap_rows gap_row

  join dropped_clustered clustered
    on clustered.step_order =
      gap_row.step_order

   and clustered.rider_id =
      gap_row.rider_id

  where gap_row.live_group_code <>
    'main_peloton'
),

named_rows as (
  select
    assigned.*,

    case
      when assigned.reclustered_group_cluster_number = 0
      then 'main_peloton'

      else
        'dropped_group_'
        ||
        lpad(
          assigned.reclustered_group_cluster_number::text,
          2,
          '0'
        )
    end::text as reclustered_group_code,

    case
      when assigned.reclustered_group_cluster_number = 0
      then 'P'

      else
        'B'
        ||
        assigned.reclustered_group_cluster_number::text
    end::text as reclustered_group_short_label,

    (
      assigned.reclustered_group_cluster_number + 1
    )::integer as reclustered_group_rank

  from assigned_rows assigned
),

group_metrics as (
  select
    named.*,

    count(*) over (
      partition by
        named.step_order,
        named.reclustered_group_code
    )::integer as reclustered_group_size,

    min(
      named.recomputed_rider_gap_seconds
    ) over (
      partition by
        named.step_order,
        named.reclustered_group_code
    ) as reclustered_group_gap_seconds,

    max(
      named.recomputed_rider_gap_seconds
    ) over (
      partition by
        named.step_order,
        named.reclustered_group_code
    ) as reclustered_group_max_gap_seconds

  from named_rows named
),

final_rows as (
  select
    metric.*,

    (
      metric.reclustered_group_max_gap_seconds
      - metric.reclustered_group_gap_seconds
    ) as reclustered_group_spread_seconds,

    greatest(
      0::numeric,

      metric.recomputed_rider_gap_seconds
      - metric.reclustered_group_gap_seconds
    ) as rider_gap_from_group_front_seconds,

    (
      metric.recomputed_cumulative_peloton_seconds
      + metric.reclustered_group_gap_seconds
    ) as reclustered_group_elapsed_seconds

  from group_metrics metric
)

select
  final_row.race_id,
  final_row.stage_id,

  final_row.rider_id,
  final_row.team_id,
  final_row.rider_name,
  final_row.team_name,
  final_row.role_code,

  final_row.step_order,
  final_row.phase_number,

  final_row.km_start,
  final_row.km_end,
  final_row.distance_km,

  final_row.terrain_type,
  final_row.slope_percent,

  final_row.live_group_code
    as previous_live_group_code,

  final_row.live_group_short_label
    as previous_live_group_short_label,

  final_row.live_group_rank
    as previous_live_group_rank,

  final_row.live_group_size
    as previous_live_group_size,

  round(
    final_row.existing_group_gap_seconds,
    6
  ) as previous_group_gap_seconds,

  round(
    final_row.live_group_pace_kmh,
    6
  ) as live_group_pace_kmh,

  round(
    final_row.live_group_step_seconds,
    6
  ) as live_group_step_seconds,

  round(
    final_row.recomputed_cumulative_peloton_seconds,
    6
  ) as recomputed_cumulative_peloton_seconds,

  round(
    final_row.recomputed_cumulative_rider_seconds,
    6
  ) as recomputed_cumulative_rider_seconds,

  round(
    final_row.recomputed_rider_gap_seconds,
    6
  ) as recomputed_rider_gap_seconds,

  parameters.group_gap_threshold_seconds,

  final_row.reclustered_group_code,
  final_row.reclustered_group_short_label,
  final_row.reclustered_group_rank,
  final_row.reclustered_group_cluster_number,

  final_row.reclustered_group_size,

  round(
    final_row.reclustered_group_gap_seconds,
    6
  ) as reclustered_group_gap_seconds,

  round(
    final_row.reclustered_group_max_gap_seconds,
    6
  ) as reclustered_group_max_gap_seconds,

  round(
    final_row.reclustered_group_spread_seconds,
    6
  ) as reclustered_group_spread_seconds,

  round(
    final_row.rider_gap_from_group_front_seconds,
    6
  ) as rider_gap_from_group_front_seconds,

  round(
    final_row.reclustered_group_elapsed_seconds,
    6
  ) as reclustered_group_elapsed_seconds,

  (
    final_row.live_group_code
    is distinct from
    final_row.reclustered_group_code
  ) as group_identity_changed,

  final_row.energy_before_step,
  final_row.energy_after_step,
  final_row.energy_state,

  final_row.point_gate_count,
  final_row.is_finish_step,

  'group_pace_clock_feedback_v2_2026_07'::text
    as group_pace_clock_model_version

from final_rows final_row

cross join parameters

order by
  final_row.step_order,
  final_row.reclustered_group_rank,
  final_row.reclustered_group_gap_seconds,
  final_row.rider_name,
  final_row.rider_id;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_live_state_preview_v2(p_stage_id uuid, p_target_step_km numeric DEFAULT 0.5, p_assumed_peloton_exposure_fraction numeric DEFAULT 0.25, p_neutral_km numeric DEFAULT 12, p_group_gap_threshold_seconds numeric DEFAULT 9)
 RETURNS TABLE(race_id uuid, stage_id uuid, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, step_order integer, phase_number integer, km_start numeric, km_end numeric, distance_km numeric, terrain_type text, slope_percent numeric, leader_elapsed_seconds numeric, rider_elapsed_seconds numeric, time_from_leader_seconds numeric, live_group_code text, live_group_short_label text, live_group_rank integer, live_group_size integer, live_group_gap_seconds numeric, live_group_max_gap_seconds numeric, live_group_spread_seconds numeric, live_group_elapsed_seconds numeric, rider_gap_from_group_front_seconds numeric, group_member_order integer, group_membership_signature text, previous_live_group_code text, previous_live_group_short_label text, previous_live_group_rank integer, previous_group_membership_signature text, rider_group_label_changed boolean, group_composition_changed boolean, is_physical_rider_transition boolean, rider_transition_code text, energy_before_step numeric, energy_after_step numeric, energy_state text, point_gate_count integer, is_finish_step boolean, live_state_model_version text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$

with

/*
 * Execute the complete authoritative group-clock pipeline once.
 */
clock_rows as materialized (
  select *
  from public.race_engine_get_stage_group_pace_clock_preview_v2(
    p_stage_id,
    p_target_step_km,
    p_assumed_peloton_exposure_fraction,
    p_neutral_km,
    p_group_gap_threshold_seconds
  )
),

/*
 * Build one physical group summary per route step.
 */
group_state_rows as (
  select
    clock_row.step_order,

    clock_row.reclustered_group_code,
    clock_row.reclustered_group_short_label,
    clock_row.reclustered_group_rank,

    count(*)::integer
      as actual_group_size,

    min(
      clock_row.reclustered_group_gap_seconds
    ) as live_group_gap_seconds,

    max(
      clock_row.reclustered_group_max_gap_seconds
    ) as live_group_max_gap_seconds,

    max(
      clock_row.reclustered_group_spread_seconds
    ) as live_group_spread_seconds,

    min(
      clock_row.reclustered_group_elapsed_seconds
    ) as live_group_elapsed_seconds,

    md5(
      string_agg(
        clock_row.rider_id::text,
        ','
        order by clock_row.rider_id::text
      )
    ) as group_membership_signature

  from clock_rows clock_row

  group by
    clock_row.step_order,
    clock_row.reclustered_group_code,
    clock_row.reclustered_group_short_label,
    clock_row.reclustered_group_rank
),

/*
 * Import only the Phase 3K columns needed by the canonical live state.
 *
 * The older Phase 3K "previous_live_group_*" fields are deliberately not
 * imported because Phase 3L calculates its own true previous-step values.
 */
joined_rows as (
  select
    clock_row.race_id,
    clock_row.stage_id,

    clock_row.rider_id,
    clock_row.team_id,
    clock_row.rider_name,
    clock_row.team_name,
    clock_row.role_code,

    clock_row.step_order,
    clock_row.phase_number,

    clock_row.km_start,
    clock_row.km_end,
    clock_row.distance_km,

    clock_row.terrain_type,
    clock_row.slope_percent,

    clock_row.recomputed_cumulative_peloton_seconds
      as leader_elapsed_seconds,

    clock_row.recomputed_cumulative_rider_seconds
      as rider_elapsed_seconds,

    clock_row.recomputed_rider_gap_seconds
      as time_from_leader_seconds,

    clock_row.reclustered_group_code
      as current_live_group_code,

    clock_row.reclustered_group_short_label
      as current_live_group_short_label,

    clock_row.reclustered_group_rank
      as current_live_group_rank,

    group_state.actual_group_size
      as current_live_group_size,

    group_state.live_group_gap_seconds,
    group_state.live_group_max_gap_seconds,
    group_state.live_group_spread_seconds,
    group_state.live_group_elapsed_seconds,

    clock_row.rider_gap_from_group_front_seconds,

    row_number() over (
      partition by
        clock_row.step_order,
        clock_row.reclustered_group_code

      order by
        clock_row.recomputed_rider_gap_seconds,
        clock_row.rider_id
    )::integer as group_member_order,

    group_state.group_membership_signature,

    clock_row.energy_before_step,
    clock_row.energy_after_step,
    clock_row.energy_state,

    clock_row.point_gate_count,
    clock_row.is_finish_step

  from clock_rows clock_row

  join group_state_rows group_state
    on group_state.step_order =
      clock_row.step_order

   and group_state.reclustered_group_code =
      clock_row.reclustered_group_code
),

/*
 * Calculate the rider's group state from the immediately preceding route
 * step using uniquely named internal columns.
 */
previous_state_rows as (
  select
    joined.*,

    lag(
      joined.current_live_group_code
    ) over (
      partition by joined.rider_id
      order by joined.step_order
    ) as prior_step_live_group_code,

    lag(
      joined.current_live_group_short_label
    ) over (
      partition by joined.rider_id
      order by joined.step_order
    ) as prior_step_live_group_short_label,

    lag(
      joined.current_live_group_rank
    ) over (
      partition by joined.rider_id
      order by joined.step_order
    ) as prior_step_live_group_rank,

    lag(
      joined.group_membership_signature
    ) over (
      partition by joined.rider_id
      order by joined.step_order
    ) as prior_step_group_membership_signature

  from joined_rows joined
),

transition_rows as (
  select
    previous_state.*,

    (
      previous_state.prior_step_live_group_code
        is not null

      and previous_state.prior_step_live_group_code
        is distinct from
          previous_state.current_live_group_code
    ) as rider_group_label_changed,

    (
      previous_state.prior_step_group_membership_signature
        is not null

      and previous_state.prior_step_group_membership_signature
        is distinct from
          previous_state.group_membership_signature
    ) as group_composition_changed,

    case
      when previous_state.prior_step_live_group_code
        is null
      then false

      when previous_state.prior_step_live_group_code =
        'main_peloton'

       and previous_state.current_live_group_code <>
        'main_peloton'
      then true

      when previous_state.prior_step_live_group_code <>
        'main_peloton'

       and previous_state.current_live_group_code =
        'main_peloton'
      then true

      else false
    end as is_physical_rider_transition,

    case
      when previous_state.prior_step_live_group_code
        is null
      then 'race_start'

      when previous_state.prior_step_live_group_code =
        'main_peloton'

       and previous_state.current_live_group_code <>
        'main_peloton'
      then 'split_from_peloton'

      when previous_state.prior_step_live_group_code <>
        'main_peloton'

       and previous_state.current_live_group_code =
        'main_peloton'
      then 'rejoined_peloton'

      /*
       * The physical group is unchanged, but its display code changed.
       *
       * Example:
       * Bautista remains alone but changes from B1 to B2 when Joao becomes
       * the closest dropped rider.
       */
      when previous_state.prior_step_live_group_code
        is distinct from
          previous_state.current_live_group_code
      then 'dropped_group_label_changed'

      /*
       * The rider remains under the same group label, but another rider
       * entered or left that physical group.
       */
      when previous_state.prior_step_group_membership_signature
        is distinct from
          previous_state.group_membership_signature
      then 'group_composition_changed'

      else 'stable'
    end::text as rider_transition_code

  from previous_state_rows previous_state
)

select
  transition.race_id,
  transition.stage_id,

  transition.rider_id,
  transition.team_id,
  transition.rider_name,
  transition.team_name,
  transition.role_code,

  transition.step_order,
  transition.phase_number,

  transition.km_start,
  transition.km_end,
  transition.distance_km,

  transition.terrain_type,
  transition.slope_percent,

  round(
    transition.leader_elapsed_seconds,
    6
  ) as leader_elapsed_seconds,

  round(
    transition.rider_elapsed_seconds,
    6
  ) as rider_elapsed_seconds,

  round(
    transition.time_from_leader_seconds,
    6
  ) as time_from_leader_seconds,

  transition.current_live_group_code
    as live_group_code,

  transition.current_live_group_short_label
    as live_group_short_label,

  transition.current_live_group_rank
    as live_group_rank,

  transition.current_live_group_size
    as live_group_size,

  round(
    transition.live_group_gap_seconds,
    6
  ) as live_group_gap_seconds,

  round(
    transition.live_group_max_gap_seconds,
    6
  ) as live_group_max_gap_seconds,

  round(
    transition.live_group_spread_seconds,
    6
  ) as live_group_spread_seconds,

  round(
    transition.live_group_elapsed_seconds,
    6
  ) as live_group_elapsed_seconds,

  round(
    transition.rider_gap_from_group_front_seconds,
    6
  ) as rider_gap_from_group_front_seconds,

  transition.group_member_order,

  transition.group_membership_signature,

  transition.prior_step_live_group_code
    as previous_live_group_code,

  transition.prior_step_live_group_short_label
    as previous_live_group_short_label,

  transition.prior_step_live_group_rank
    as previous_live_group_rank,

  transition.prior_step_group_membership_signature
    as previous_group_membership_signature,

  transition.rider_group_label_changed,
  transition.group_composition_changed,
  transition.is_physical_rider_transition,

  transition.rider_transition_code,

  transition.energy_before_step,
  transition.energy_after_step,
  transition.energy_state,

  transition.point_gate_count,
  transition.is_finish_step,

  'canonical_live_state_v2_2026_07_corrected'::text
    as live_state_model_version

from transition_rows transition

order by
  transition.step_order,
  transition.current_live_group_rank,
  transition.live_group_gap_seconds,
  transition.group_member_order,
  transition.rider_id;

$function$
;

CREATE OR REPLACE FUNCTION public.get_club_competition_standing_canonical_v1(p_club_id uuid)
 RETURNS TABLE(competition_label text, rank_position integer, total_teams integer, international_points numeric, scoring_races integer, season_year integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with current_season as materialized (
    select
      public.team_ranking_get_current_season_year_v1()::integer
        as season_year
  ),

  ranking_source as (
    select
      trv.id as club_id,
      trv.name as club_name,
      trv.club_tier::text as club_tier,

      trv.tier2_division::text as tier2_division,
      trv.tier3_division::text as tier3_division,
      trv.amateur_division::text as amateur_division,

      case
        when trv.club_tier::text = 'worldteam' then
          'WORLD'
        when trv.club_tier::text = 'proteam' then
          trv.tier2_division::text
        when trv.club_tier::text = 'continental' then
          trv.tier3_division::text
        when trv.club_tier::text = 'amateur' then
          trv.amateur_division::text
        else null
      end as division_key,

      coalesce(
        ip.international_points,
        0
      )::numeric as international_points,

      coalesce(
        ip.scoring_races,
        0
      )::integer as scoring_races,

      cs.season_year

    from public.team_rankings_view trv
    cross join current_season cs

    left join public.team_international_points_by_season_v1 ip
      on ip.team_id = trv.id
     and ip.season_year::integer = cs.season_year

    where coalesce(trv.is_active, true) = true
      and trv.club_tier::text in (
        'worldteam',
        'proteam',
        'continental',
        'amateur'
      )
  ),

  ranked as (
    select
      rs.*,

      row_number() over (
        partition by
          rs.club_tier,
          rs.division_key

        order by
          rs.international_points desc,
          rs.scoring_races desc,
          lower(rs.club_name) asc,
          rs.club_id asc
      )::integer as calculated_rank_position,

      count(*) over (
        partition by
          rs.club_tier,
          rs.division_key
      )::integer as calculated_total_teams

    from ranking_source rs
    where rs.division_key is not null
  ),

  labelled as (
    select
      r.*,

      case
        when r.division_key = 'SOUTHERN_BALKAN_EUROPE' then
          'Southern & Balkan Europe'
        when r.division_key = 'EAST_SOUTHEAST_ASIA' then
          'East & Southeast Asia'
        when r.division_key = 'NORTH_CENTRAL_AMERICA' then
          'North & Central America'
        when r.division_key = 'CENTRAL_EASTERN_EUROPE' then
          'Central & Eastern Europe'
        when r.division_key = 'NORTH_WESTERN_EUROPE' then
          'North & Western Europe'
        when r.division_key = 'PRO_WEST' then
          'West'
        when r.division_key = 'PRO_EAST' then
          'East'
        else
          initcap(
            replace(
              regexp_replace(
                r.division_key,
                '^(PRO_|CONTINENTAL_)',
                ''
              ),
              '_',
              ' '
            )
          )
      end as division_label

    from ranked r
  )

  select
    case
      when l.club_tier = 'worldteam' then
        'WorldTeam'
      when l.club_tier = 'proteam' then
        'ProTeam: ' || l.division_label
      when l.club_tier = 'continental' then
        'Continental: ' || l.division_label
      when l.club_tier = 'amateur' then
        'Amateur: ' || l.division_label
      else
        initcap(l.club_tier)
    end as competition_label,

    l.calculated_rank_position as rank_position,
    l.calculated_total_teams as total_teams,
    l.international_points,
    l.scoring_races,
    l.season_year

  from labelled l
  where l.club_id = p_club_id
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_calculate_attack_intent_components_v2(p_role_code text, p_team_plan text, p_phase_command text, p_phase_number integer, p_km_end numeric, p_stage_distance_km numeric, p_neutral_km numeric, p_terrain_type text, p_slope_percent numeric, p_live_group_code text, p_energy_before_step numeric, p_energy_after_step numeric, p_flat numeric, p_climbing numeric, p_endurance numeric, p_resistance numeric, p_race_iq numeric, p_morale numeric, p_point_gate_count integer, p_is_finish_step boolean)
 RETURNS TABLE(normalized_role_code text, normalized_team_plan text, normalized_phase_command text, effective_terrain_type text, stage_progress_fraction numeric, explicit_attack_instruction boolean, attack_window_open boolean, is_attack_eligible boolean, attack_block_reason text, attack_skill_score numeric, role_attack_points numeric, command_attack_points numeric, team_plan_attack_points numeric, terrain_attack_points numeric, timing_attack_points numeric, energy_attack_points numeric, skill_attack_points numeric, raw_attack_intent_score numeric, attack_intent_score numeric, attack_intent_band text)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$

with normalized as (
  select
    case lower(trim(coalesce(p_role_code, 'free_role')))
      when 'leader' then 'team_leader_gc'
      when 'team_leader' then 'team_leader_gc'
      when 'gc_leader' then 'team_leader_gc'

      when 'protected_rider' then 'protected'

      when 'domestique' then 'helper_domestique'
      when 'helper' then 'helper_domestique'

      when 'mountain_helper' then 'mountain_domestique'

      when 'leadout' then 'lead_out'
      when 'lead-out' then 'lead_out'

      when 'sprint_train_rider' then 'sprint_train'

      when 'breakaway_rider' then 'breakaway'

      when 'rouleur_role' then 'rouleur'

      else lower(
        trim(
          coalesce(
            p_role_code,
            'free_role'
          )
        )
      )
    end as role_code,

    lower(
      trim(
        coalesce(
          p_team_plan,
          'balanced'
        )
      )
    ) as team_plan,

    lower(
      trim(
        coalesce(
          p_phase_command,
          'balanced'
        )
      )
    ) as phase_command,

    greatest(
      1,
      least(
        4,
        coalesce(p_phase_number, 1)
      )
    )::integer as phase_number,

    greatest(
      0::numeric,
      coalesce(p_km_end, 0)
    ) as km_end,

    greatest(
      0.1::numeric,
      coalesce(
        p_stage_distance_km,
        p_km_end,
        1
      )
    ) as stage_distance_km,

    greatest(
      0::numeric,
      coalesce(p_neutral_km, 12)
    ) as neutral_km,

    lower(
      trim(
        coalesce(
          p_terrain_type,
          'flat'
        )
      )
    ) as raw_terrain_type,

    greatest(
      -20::numeric,
      least(
        20::numeric,
        coalesce(p_slope_percent, 0)
      )
    ) as slope_percent,

    lower(
      trim(
        coalesce(
          p_live_group_code,
          'main_peloton'
        )
      )
    ) as live_group_code,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(
          p_energy_before_step,
          50
        )
      )
    ) as energy_before_step,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(
          p_energy_after_step,
          p_energy_before_step,
          50
        )
      )
    ) as energy_after_step,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(p_flat, 50)
      )
    ) as flat_skill,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(p_climbing, 50)
      )
    ) as climbing_skill,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(p_endurance, 50)
      )
    ) as endurance_skill,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(p_resistance, 50)
      )
    ) as resistance_skill,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(p_race_iq, 50)
      )
    ) as race_iq_skill,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(p_morale, 50)
      )
    ) as morale_value,

    greatest(
      0,
      coalesce(p_point_gate_count, 0)
    )::integer as point_gate_count,

    coalesce(
      p_is_finish_step,
      false
    ) as is_finish_step
),

resolved as (
  select
    normalized.*,

    case
      when normalized.raw_terrain_type in (
        'technical_descent',
        'cobbled',
        'cobble',
        'gravel'
      )
      then normalized.raw_terrain_type

      when normalized.slope_percent <= -3
      then 'descent'

      when normalized.slope_percent >= 6
      then 'steep_climb'

      when normalized.slope_percent >= 2.5
      then 'climb'

      when normalized.slope_percent >= 0.8
      then 'false_flat'

      else 'flat'
    end as effective_terrain_type,

    greatest(
      0::numeric,
      least(
        1::numeric,

        normalized.km_end
        /
        nullif(
          normalized.stage_distance_km,
          0
        )
      )
    ) as stage_progress_fraction,

    (
      normalized.phase_command in (
        'attack',
        'join_breakaway'
      )
    ) as explicit_attack_instruction

  from normalized
),

skills as (
  select
    resolved.*,

    case
      when resolved.effective_terrain_type in (
        'climb',
        'steep_climb'
      )
      then
        resolved.climbing_skill * 0.30
        + resolved.endurance_skill * 0.25
        + resolved.resistance_skill * 0.20
        + resolved.race_iq_skill * 0.15
        + resolved.morale_value * 0.10

      else
        resolved.flat_skill * 0.25
        + resolved.endurance_skill * 0.25
        + resolved.resistance_skill * 0.20
        + resolved.race_iq_skill * 0.20
        + resolved.morale_value * 0.10
    end::numeric as attack_skill_score

  from resolved
),

component_rows as (
  select
    skill.*,

    /*
     * Role is the rider's normal tactical job.
     */
    case skill.role_code
      when 'breakaway' then 30
      when 'rouleur' then 22
      when 'free_role' then 15
      when 'climber' then
        case
          when skill.effective_terrain_type in (
            'climb',
            'steep_climb'
          )
          then 18
          else 8
        end

      when 'mountain_domestique' then
        case
          when skill.effective_terrain_type in (
            'climb',
            'steep_climb'
          )
          then 10
          else 5
        end

      when 'team_leader_gc' then
        case
          when skill.stage_progress_fraction >= 0.65
           and skill.effective_terrain_type in (
             'climb',
             'steep_climb'
           )
          then 14
          else 5
        end

      when 'helper_domestique' then 5
      when 'breakaway_chaser' then 4
      when 'sprinter' then 2
      when 'lead_out' then 1
      when 'sprint_train' then 1
      when 'protected' then 1
      else 8
    end::numeric as role_attack_points,

    /*
     * Only actual action commands count here.
     *
     * Team-plan values such as balanced, aggressive and breakaway are handled
     * separately to avoid counting the same plan twice.
     */
    case skill.phase_command
      when 'attack' then 35
      when 'join_breakaway' then 30

      when 'climb_hard' then
        case
          when skill.effective_terrain_type in (
            'climb',
            'steep_climb'
          )
          then 10
          else 3
        end

      when 'stay_near_front' then 4

      when 'conserve_energy' then -20
      when 'protect_leader' then -18
      when 'avoid_risks' then -18
      when 'lead_out' then -16
      when 'sprint' then -16
      when 'chase_breakaway' then -14
      when 'control_tempo' then -12

      else 0
    end::numeric as command_attack_points,

    /*
     * Team plan defines the team's general willingness to attack.
     */
    case skill.team_plan
      when 'breakaway' then 18
      when 'aggressive' then 12
      when 'balanced' then 4

      when 'climber_support' then
        case
          when skill.effective_terrain_type in (
            'climb',
            'steep_climb'
          )
          then 7
          else 2
        end

      when 'sprint_control' then -8
      when 'gc_protection' then -6
      else 0
    end::numeric as team_plan_attack_points,

    case skill.effective_terrain_type
      when 'flat' then 6
      when 'false_flat' then 10
      when 'climb' then 12
      when 'steep_climb' then 9
      when 'descent' then 2
      when 'technical_descent' then -3
      when 'cobbled' then 8
      when 'cobble' then 8
      when 'gravel' then 9
      else 4
    end::numeric as terrain_attack_points,

    /*
     * Early and middle-stage attacks receive the strongest opportunity.
     * Late attacks remain possible, particularly when explicitly ordered.
     */
    case
      when skill.km_end <= skill.neutral_km
      then -30

      when skill.stage_progress_fraction < 0.25
      then 14

      when skill.stage_progress_fraction < 0.50
      then 10

      when skill.stage_progress_fraction < 0.70
      then 6

      when skill.stage_progress_fraction < 0.88
      then 3

      when skill.stage_progress_fraction < 0.95
      then
        case
          when skill.explicit_attack_instruction
          then 3
          else -4
        end

      else -15
    end::numeric as timing_attack_points,

    round(
      (
        greatest(
          0::numeric,

          least(
            1::numeric,

            (
              skill.energy_after_step
              - 30
            )
            / 70::numeric
          )
        )
        * 12
      )::numeric,
      6
    ) as energy_attack_points,

    round(
      (
        skill.attack_skill_score
        / 100::numeric
        * 15
      )::numeric,
      6
    ) as skill_attack_points

  from skills skill
),

eligibility_rows as (
  select
    component.*,

    (
      component.live_group_code =
        'main_peloton'

      and component.km_end >
        component.neutral_km

      and not component.is_finish_step

      and component.point_gate_count = 0

      and component.energy_after_step >= 30

      and component.stage_progress_fraction < 0.95

      and not (
        component.phase_command in (
          'conserve_energy',
          'protect_leader',
          'avoid_risks',
          'lead_out',
          'sprint',
          'chase_breakaway',
          'control_tempo'
        )
      )

      and not (
        component.role_code in (
          'protected',
          'sprinter',
          'lead_out',
          'sprint_train'
        )

        and not component.explicit_attack_instruction
      )
    ) as is_attack_eligible,

    (
      component.km_end >
        component.neutral_km

      and not component.is_finish_step

      and component.point_gate_count = 0

      and component.stage_progress_fraction < 0.95
    ) as attack_window_open,

    case
      when component.live_group_code <>
        'main_peloton'
      then 'not_in_main_peloton'

      when component.km_end <=
        component.neutral_km
      then 'neutralized_opening'

      when component.is_finish_step
      then 'finish_step'

      when component.point_gate_count > 0
      then 'point_gate_step'

      when component.energy_after_step < 30
      then 'insufficient_energy'

      when component.stage_progress_fraction >= 0.95
      then 'too_close_to_finish'

      when component.phase_command in (
        'conserve_energy',
        'protect_leader',
        'avoid_risks',
        'lead_out',
        'sprint',
        'chase_breakaway',
        'control_tempo'
      )
      then 'command_blocks_attack'

      when component.role_code in (
        'protected',
        'sprinter',
        'lead_out',
        'sprint_train'
      )

       and not component.explicit_attack_instruction
      then 'role_blocks_unordered_attack'

      else null::text
    end as attack_block_reason,

    (
      component.role_attack_points
      + component.command_attack_points
      + component.team_plan_attack_points
      + component.terrain_attack_points
      + component.timing_attack_points
      + component.energy_attack_points
      + component.skill_attack_points
    )::numeric as raw_attack_intent_score

  from component_rows component
),

scored_rows as (
  select
    eligibility.*,

    round(
      case
        when eligibility.is_attack_eligible
        then greatest(
          0::numeric,
          least(
            100::numeric,
            eligibility.raw_attack_intent_score
          )
        )

        else 0::numeric
      end,
      6
    ) as attack_intent_score

  from eligibility_rows eligibility
)

select
  scored.role_code
    as normalized_role_code,

  scored.team_plan
    as normalized_team_plan,

  scored.phase_command
    as normalized_phase_command,

  scored.effective_terrain_type,

  round(
    scored.stage_progress_fraction,
    6
  ) as stage_progress_fraction,

  scored.explicit_attack_instruction,
  scored.attack_window_open,
  scored.is_attack_eligible,
  scored.attack_block_reason,

  round(
    scored.attack_skill_score,
    6
  ) as attack_skill_score,

  scored.role_attack_points,
  scored.command_attack_points,
  scored.team_plan_attack_points,
  scored.terrain_attack_points,
  scored.timing_attack_points,
  scored.energy_attack_points,
  scored.skill_attack_points,

  round(
    scored.raw_attack_intent_score,
    6
  ) as raw_attack_intent_score,

  scored.attack_intent_score,

  case
    when not scored.is_attack_eligible
    then 'blocked'

    when scored.attack_intent_score >= 80
    then 'very_high'

    when scored.attack_intent_score >= 65
    then 'high'

    when scored.attack_intent_score >= 50
    then 'medium'

    when scored.attack_intent_score >= 35
    then 'low'

    else 'very_low'
  end::text as attack_intent_band

from scored_rows scored;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_attack_intent_preview_v2(p_stage_id uuid, p_target_step_km numeric DEFAULT 0.5, p_assumed_peloton_exposure_fraction numeric DEFAULT 0.25, p_neutral_km numeric DEFAULT 12, p_group_gap_threshold_seconds numeric DEFAULT 9, p_candidate_score_threshold numeric DEFAULT 60, p_max_candidates_per_step integer DEFAULT 12)
 RETURNS TABLE(race_id uuid, stage_id uuid, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, step_order integer, phase_number integer, km_start numeric, km_end numeric, distance_km numeric, terrain_type text, effective_terrain_type text, slope_percent numeric, stage_progress_fraction numeric, live_group_code text, live_group_short_label text, live_group_rank integer, live_group_size integer, energy_before_step numeric, energy_after_step numeric, energy_state text, team_plan text, current_phase_command text, explicit_attack_instruction boolean, flat_skill numeric, climbing_skill numeric, endurance_skill numeric, resistance_skill numeric, race_iq_skill numeric, morale_value numeric, attack_window_open boolean, is_attack_eligible boolean, attack_block_reason text, attack_skill_score numeric, role_attack_points numeric, command_attack_points numeric, team_plan_attack_points numeric, terrain_attack_points numeric, timing_attack_points numeric, energy_attack_points numeric, skill_attack_points numeric, raw_attack_intent_score numeric, attack_intent_score numeric, attack_intent_band text, candidate_rank_within_team integer, candidate_rank_within_step integer, candidate_score_threshold numeric, max_candidates_per_step integer, is_preliminary_attack_candidate boolean, preliminary_action_code text, point_gate_count integer, is_finish_step boolean, attack_intent_model_version text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$

with

parameters as (
  select
    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(
          p_candidate_score_threshold,
          60
        )
      )
    ) as candidate_score_threshold,

    greatest(
      1,
      least(
        30,
        coalesce(
          p_max_candidates_per_step,
          12
        )
      )
    )::integer as max_candidates_per_step
),

live_rows as materialized (
  select *
  from public.race_engine_get_stage_live_state_preview_v2(
    p_stage_id,
    p_target_step_km,
    p_assumed_peloton_exposure_fraction,
    p_neutral_km,
    p_group_gap_threshold_seconds
  )
),

stage_context as (
  select
    max(live_row.km_end)::numeric
      as stage_distance_km

  from live_rows live_row
),

command_rows as materialized (
  select *
  from public.race_engine_get_stage_phase_commands_v1(
    p_stage_id
  )
),

rider_input_rows as materialized (
  select
    input_row.rider_id,

    coalesce(
      nullif(
        to_jsonb(input_row) ->> 'flat',
        ''
      )::numeric,
      50
    ) as flat_skill,

    coalesce(
      nullif(
        to_jsonb(input_row) ->> 'climbing',
        ''
      )::numeric,
      50
    ) as climbing_skill,

    coalesce(
      nullif(
        to_jsonb(input_row) ->> 'endurance',
        ''
      )::numeric,
      50
    ) as endurance_skill,

    coalesce(
      nullif(
        to_jsonb(input_row) ->> 'resistance',
        ''
      )::numeric,
      50
    ) as resistance_skill,

    coalesce(
      nullif(
        to_jsonb(input_row) ->> 'race_iq',
        ''
      )::numeric,
      50
    ) as race_iq_skill,

    coalesce(
      nullif(
        to_jsonb(input_row) ->> 'morale',
        ''
      )::numeric,
      50
    ) as morale_value

  from public.race_engine_get_stage_rider_inputs_v1(
    p_stage_id
  ) input_row
),

joined_rows as (
  select
    live_row.*,

    coalesce(
      command_row.team_plan,
      'balanced'
    ) as team_plan,

    coalesce(
      case live_row.phase_number
        when 1 then command_row.phase_1_command
        when 2 then command_row.phase_2_command
        when 3 then command_row.phase_3_command
        when 4 then command_row.phase_4_command
      end,
      command_row.team_plan,
      'balanced'
    ) as current_phase_command,

    coalesce(
      rider_input.flat_skill,
      50
    ) as flat_skill,

    coalesce(
      rider_input.climbing_skill,
      50
    ) as climbing_skill,

    coalesce(
      rider_input.endurance_skill,
      50
    ) as endurance_skill,

    coalesce(
      rider_input.resistance_skill,
      50
    ) as resistance_skill,

    coalesce(
      rider_input.race_iq_skill,
      50
    ) as race_iq_skill,

    coalesce(
      rider_input.morale_value,
      50
    ) as morale_value,

    stage_context.stage_distance_km

  from live_rows live_row

  cross join stage_context

  left join command_rows command_row
    on command_row.rider_id =
      live_row.rider_id

  left join rider_input_rows rider_input
    on rider_input.rider_id =
      live_row.rider_id
),

scored_rows as (
  select
    joined.*,

    intent.effective_terrain_type,
    intent.stage_progress_fraction,

    intent.explicit_attack_instruction,
    intent.attack_window_open,
    intent.is_attack_eligible,
    intent.attack_block_reason,

    intent.attack_skill_score,

    intent.role_attack_points,
    intent.command_attack_points,
    intent.team_plan_attack_points,
    intent.terrain_attack_points,
    intent.timing_attack_points,
    intent.energy_attack_points,
    intent.skill_attack_points,

    intent.raw_attack_intent_score,
    intent.attack_intent_score,
    intent.attack_intent_band

  from joined_rows joined

  cross join lateral
    public.race_engine_calculate_attack_intent_components_v2(
      joined.role_code,
      joined.team_plan,
      joined.current_phase_command,

      joined.phase_number,

      joined.km_end,
      joined.stage_distance_km,
      p_neutral_km,

      joined.terrain_type,
      joined.slope_percent,

      joined.live_group_code,

      joined.energy_before_step,
      joined.energy_after_step,

      joined.flat_skill,
      joined.climbing_skill,
      joined.endurance_skill,
      joined.resistance_skill,
      joined.race_iq_skill,
      joined.morale_value,

      joined.point_gate_count,
      joined.is_finish_step
    ) intent
),

ranked_rows as (
  select
    scored.*,

    row_number() over (
      partition by
        scored.step_order,
        scored.team_id

      order by
        case
          when scored.is_attack_eligible
          then 0
          else 1
        end,

        scored.attack_intent_score desc,
        scored.explicit_attack_instruction desc,
        scored.rider_id
    )::integer as candidate_rank_within_team,

    row_number() over (
      partition by scored.step_order

      order by
        case
          when scored.is_attack_eligible
          then 0
          else 1
        end,

        scored.attack_intent_score desc,
        scored.explicit_attack_instruction desc,
        scored.team_id,
        scored.rider_id
    )::integer as candidate_rank_within_step

  from scored_rows scored
),

selected_rows as (
  select
    ranked.*,

    (
      ranked.is_attack_eligible

      and ranked.attack_intent_score >=
        parameters.candidate_score_threshold

      and ranked.candidate_rank_within_team = 1

      and ranked.candidate_rank_within_step <=
        parameters.max_candidates_per_step
    ) as is_preliminary_attack_candidate

  from ranked_rows ranked

  cross join parameters
)

select
  selected.race_id,
  selected.stage_id,

  selected.rider_id,
  selected.team_id,
  selected.rider_name,
  selected.team_name,
  selected.role_code,

  selected.step_order,
  selected.phase_number,

  selected.km_start,
  selected.km_end,
  selected.distance_km,

  selected.terrain_type,
  selected.effective_terrain_type,
  selected.slope_percent,
  selected.stage_progress_fraction,

  selected.live_group_code,
  selected.live_group_short_label,
  selected.live_group_rank,
  selected.live_group_size,

  selected.energy_before_step,
  selected.energy_after_step,
  selected.energy_state,

  selected.team_plan,
  selected.current_phase_command,
  selected.explicit_attack_instruction,

  selected.flat_skill,
  selected.climbing_skill,
  selected.endurance_skill,
  selected.resistance_skill,
  selected.race_iq_skill,
  selected.morale_value,

  selected.attack_window_open,
  selected.is_attack_eligible,
  selected.attack_block_reason,

  selected.attack_skill_score,

  selected.role_attack_points,
  selected.command_attack_points,
  selected.team_plan_attack_points,
  selected.terrain_attack_points,
  selected.timing_attack_points,
  selected.energy_attack_points,
  selected.skill_attack_points,

  selected.raw_attack_intent_score,
  selected.attack_intent_score,
  selected.attack_intent_band,

  selected.candidate_rank_within_team,
  selected.candidate_rank_within_step,

  parameters.candidate_score_threshold,
  parameters.max_candidates_per_step,

  selected.is_preliminary_attack_candidate,

  case
    when selected.is_preliminary_attack_candidate
    then 'attack_candidate'

    when selected.is_attack_eligible
     and selected.attack_intent_score >=
       parameters.candidate_score_threshold
    then 'candidate_rejected_by_rank_limit'

    when selected.is_attack_eligible
    then 'eligible_below_threshold'

    else 'no_attack'
  end::text as preliminary_action_code,

  selected.point_gate_count,
  selected.is_finish_step,

  'attack_intent_preview_v2_2026_07'::text
    as attack_intent_model_version

from selected_rows selected

cross join parameters

order by
  selected.step_order,
  selected.candidate_rank_within_step,
  selected.team_name,
  selected.rider_name,
  selected.rider_id;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_deterministic_unit_roll_v2(p_seed text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$

with hash_bytes as (
  select
    decode(
      substr(
        md5(
          coalesce(
            p_seed,
            ''
          )
        ),
        1,
        8
      ),
      'hex'
    ) as value_bytes
),

unsigned_value as (
  select
    (
      get_byte(value_bytes, 0)::numeric
        * 16777216::numeric

      + get_byte(value_bytes, 1)::numeric
        * 65536::numeric

      + get_byte(value_bytes, 2)::numeric
        * 256::numeric

      + get_byte(value_bytes, 3)::numeric
    ) as value_32_bit

  from hash_bytes
)

select
  round(
    value_32_bit
    / 4294967295::numeric,
    9
  )

from unsigned_value;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_attack_attempt_preview_v2(p_stage_id uuid, p_target_step_km numeric DEFAULT 0.5, p_assumed_peloton_exposure_fraction numeric DEFAULT 0.25, p_neutral_km numeric DEFAULT 12, p_group_gap_threshold_seconds numeric DEFAULT 9, p_candidate_score_threshold numeric DEFAULT 60, p_max_candidates_per_step integer DEFAULT 12, p_opportunity_window_km numeric DEFAULT 5, p_rider_cooldown_km numeric DEFAULT 20, p_team_cooldown_km numeric DEFAULT 12, p_max_stage_attempts integer DEFAULT 6, p_max_team_attempts integer DEFAULT 2, p_max_attempts_per_window integer DEFAULT 3)
 RETURNS TABLE(race_id uuid, stage_id uuid, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, opportunity_window_number integer, opportunity_window_start_km numeric, opportunity_window_end_km numeric, selected_step_order integer, selected_phase_number integer, selected_km_end numeric, terrain_type text, effective_terrain_type text, slope_percent numeric, stage_progress_fraction numeric, team_plan text, current_phase_command text, explicit_attack_instruction boolean, energy_before_step numeric, energy_after_step numeric, attack_intent_score numeric, attack_intent_band text, candidate_rank_within_team integer, candidate_rank_within_step integer, attack_attempt_probability numeric, deterministic_opportunity_roll numeric, passed_deterministic_roll boolean, rider_cooldown_passed boolean, team_cooldown_passed boolean, team_attempt_sequence integer, window_attempt_rank integer, stage_attempt_rank integer, opportunity_window_km numeric, rider_cooldown_km numeric, team_cooldown_km numeric, max_stage_attempts integer, max_team_attempts integer, max_attempts_per_window integer, is_selected_attack_attempt boolean, attack_attempt_selection_reason text, attack_attempt_model_version text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$

with recursive

parameters as (
  select
    greatest(
      0.5::numeric,
      coalesce(
        p_opportunity_window_km,
        5::numeric
      )
    ) as opportunity_window_km,

    greatest(
      0::numeric,
      coalesce(
        p_rider_cooldown_km,
        20::numeric
      )
    ) as rider_cooldown_km,

    greatest(
      0::numeric,
      coalesce(
        p_team_cooldown_km,
        12::numeric
      )
    ) as team_cooldown_km,

    greatest(
      1,
      least(
        30,
        coalesce(
          p_max_stage_attempts,
          6
        )
      )
    )::integer as max_stage_attempts,

    greatest(
      1,
      least(
        10,
        coalesce(
          p_max_team_attempts,
          2
        )
      )
    )::integer as max_team_attempts,

    greatest(
      1,
      least(
        10,
        coalesce(
          p_max_attempts_per_window,
          3
        )
      )
    )::integer as max_attempts_per_window
),

intent_rows as materialized (
  select *
  from public.race_engine_get_stage_attack_intent_preview_v2(
    p_stage_id,
    p_target_step_km,
    p_assumed_peloton_exposure_fraction,
    p_neutral_km,
    p_group_gap_threshold_seconds,
    p_candidate_score_threshold,
    p_max_candidates_per_step
  )
),

candidate_rows as (
  select
    intent.*,

    (
      floor(
        greatest(
          0::numeric,
          intent.km_end - p_neutral_km
        )
        /
        parameters.opportunity_window_km
      )::integer
      + 1
    ) as opportunity_window_number

  from intent_rows intent

  cross join parameters

  where intent.is_preliminary_attack_candidate
),

/*
 * Keep the strongest candidate row for each rider inside each distance
 * opportunity window.
 */
rider_window_ranked as (
  select
    candidate.*,

    row_number() over (
      partition by
        candidate.rider_id,
        candidate.opportunity_window_number

      order by
        candidate.attack_intent_score desc,
        candidate.explicit_attack_instruction desc,
        candidate.energy_after_step desc,
        candidate.step_order,
        candidate.rider_id
    )::integer as rider_window_rank

  from candidate_rows candidate
),

best_rider_window_rows as (
  select *
  from rider_window_ranked
  where rider_window_rank = 1
),

/*
 * A team may present only its strongest rider in one opportunity window.
 */
team_window_ranked as (
  select
    candidate.*,

    row_number() over (
      partition by
        candidate.team_id,
        candidate.opportunity_window_number

      order by
        candidate.attack_intent_score desc,
        candidate.explicit_attack_instruction desc,
        candidate.energy_after_step desc,
        candidate.rider_id
    )::integer as team_window_rank

  from best_rider_window_rows candidate
),

opportunity_rows as (
  select
    candidate.*,

    (
      p_neutral_km
      +
      (
        candidate.opportunity_window_number - 1
      )
      * parameters.opportunity_window_km
    )::numeric as opportunity_window_start_km,

    (
      p_neutral_km
      +
      candidate.opportunity_window_number
      * parameters.opportunity_window_km
    )::numeric as opportunity_window_end_km,

    md5(
      candidate.stage_id::text
      || '|'
      || candidate.rider_id::text
      || '|'
      || candidate.opportunity_window_number::text
      || '|'
      || candidate.step_order::text
      || '|attack_attempt_v2'
    ) as opportunity_key

  from team_window_ranked candidate

  cross join parameters

  where candidate.team_window_rank = 1
),

/*
 * Calculate the probability that tactical intent becomes an actual attempt.
 *
 * Breakaway riders receive a meaningful advantage, but no rider is
 * guaranteed to attack unless later phases explicitly introduce a forced
 * command policy.
 */
probability_rows as (
  select
    opportunity.*,

    round(
      least(
        0.90::numeric,

        greatest(
          0.02::numeric,

          0.08::numeric

          +
          (
            greatest(
              0::numeric,

              opportunity.attack_intent_score
              - p_candidate_score_threshold
            )
            /
            nullif(
              greatest(
                1::numeric,
                100::numeric
                - p_candidate_score_threshold
              ),
              0
            )
            * 0.30::numeric
          )

          +
          case opportunity.role_code
            when 'breakaway' then 0.16
            when 'rouleur' then 0.10
            when 'free_role' then 0.05
            when 'climber' then 0.04
            else 0
          end

          +
          case opportunity.team_plan
            when 'breakaway' then 0.12
            when 'aggressive' then 0.06
            else 0
          end

          +
          case
            when opportunity.explicit_attack_instruction
            then 0.35::numeric
            else 0::numeric
          end

          +
          case
            when opportunity.stage_progress_fraction < 0.35
            then 0.08::numeric

            when opportunity.stage_progress_fraction < 0.65
            then 0.04::numeric

            else 0::numeric
          end
        )
      ),
      6
    ) as attack_attempt_probability

  from opportunity_rows opportunity
),

roll_rows as (
  select
    probability.*,

    public.race_engine_deterministic_unit_roll_v2(
      probability.stage_id::text
      || '|'
      || probability.rider_id::text
      || '|'
      || probability.opportunity_window_number::text
      || '|'
      || probability.selected_phase_number::text
      || '|attack_attempt_roll_v2'
    ) as deterministic_opportunity_roll

  from (
    select
      probability.*,

      probability.step_order
        as selected_step_order,

      probability.phase_number
        as selected_phase_number,

      probability.km_end
        as selected_km_end

    from probability_rows probability
  ) probability
),

evaluated_roll_rows as (
  select
    roll_row.*,

    (
      roll_row.deterministic_opportunity_roll
      <= roll_row.attack_attempt_probability
    ) as passed_deterministic_roll

  from roll_rows roll_row
),

roll_passed_rows as (
  select *
  from evaluated_roll_rows
  where passed_deterministic_roll
),

/*
 * Greedily enforce rider cooldown.
 *
 * The first passed opportunity is selected. The next opportunity for the
 * same rider must be at least p_rider_cooldown_km later.
 */
rider_cooldown_selected as (
  (
    select distinct on (
      passed.rider_id
    )
      passed.*

    from roll_passed_rows passed

    order by
      passed.rider_id,
      passed.selected_km_end,
      passed.selected_step_order,
      passed.opportunity_key
  )

  union all

  select
    next_opportunity.*

  from rider_cooldown_selected accepted

  cross join lateral (
    select
      possible.*

    from roll_passed_rows possible

    cross join parameters

    where possible.rider_id =
      accepted.rider_id

      and possible.selected_km_end >=
        accepted.selected_km_end
        + parameters.rider_cooldown_km

    order by
      possible.selected_km_end,
      possible.selected_step_order,
      possible.opportunity_key

    limit 1
  ) next_opportunity
),

/*
 * Greedily enforce team cooldown after rider cooldown.
 */
team_cooldown_selected as (
  (
    select distinct on (
      rider_selected.team_id
    )
      rider_selected.*

    from rider_cooldown_selected rider_selected

    order by
      rider_selected.team_id,
      rider_selected.selected_km_end,
      rider_selected.selected_step_order,
      rider_selected.opportunity_key
  )

  union all

  select
    next_opportunity.*

  from team_cooldown_selected accepted

  cross join lateral (
    select
      possible.*

    from rider_cooldown_selected possible

    cross join parameters

    where possible.team_id =
      accepted.team_id

      and possible.selected_km_end >=
        accepted.selected_km_end
        + parameters.team_cooldown_km

    order by
      possible.selected_km_end,
      possible.selected_step_order,
      possible.attack_intent_score desc,
      possible.opportunity_key

    limit 1
  ) next_opportunity
),

team_sequence_rows as (
  select
    team_selected.*,

    row_number() over (
      partition by team_selected.team_id

      order by
        team_selected.selected_km_end,
        team_selected.selected_step_order,
        team_selected.attack_intent_score desc,
        team_selected.opportunity_key
    )::integer as team_attempt_sequence

  from team_cooldown_selected team_selected
),

team_capped_rows as (
  select
    team_sequence.*

  from team_sequence_rows team_sequence

  cross join parameters

  where team_sequence.team_attempt_sequence <=
    parameters.max_team_attempts
),

window_ranked_rows as (
  select
    team_capped.*,

    row_number() over (
      partition by
        team_capped.opportunity_window_number

      order by
        team_capped.explicit_attack_instruction desc,
        team_capped.attack_intent_score desc,
        team_capped.deterministic_opportunity_roll,
        team_capped.team_id,
        team_capped.rider_id
    )::integer as window_attempt_rank

  from team_capped_rows team_capped
),

window_capped_rows as (
  select
    window_ranked.*

  from window_ranked_rows window_ranked

  cross join parameters

  where window_ranked.window_attempt_rank <=
    parameters.max_attempts_per_window
),

stage_ranked_rows as (
  select
    window_capped.*,

    row_number() over (
      order by
        window_capped.selected_step_order,
        window_capped.explicit_attack_instruction desc,
        window_capped.attack_intent_score desc,
        window_capped.deterministic_opportunity_roll,
        window_capped.team_id,
        window_capped.rider_id
    )::integer as stage_attempt_rank

  from window_capped_rows window_capped
),

selected_attempt_rows as (
  select
    stage_ranked.*

  from stage_ranked_rows stage_ranked

  cross join parameters

  where stage_ranked.stage_attempt_rank <=
    parameters.max_stage_attempts
),

result_rows as (
  select
    opportunity.*,

    (
      rider_selected.opportunity_key is not null
    ) as rider_cooldown_passed,

    (
      team_selected.opportunity_key is not null
    ) as team_cooldown_passed,

    team_sequence.team_attempt_sequence,
    window_ranked.window_attempt_rank,
    stage_ranked.stage_attempt_rank,

    (
      selected_attempt.opportunity_key is not null
    ) as is_selected_attack_attempt

  from evaluated_roll_rows opportunity

  left join rider_cooldown_selected rider_selected
    on rider_selected.opportunity_key =
      opportunity.opportunity_key

  left join team_cooldown_selected team_selected
    on team_selected.opportunity_key =
      opportunity.opportunity_key

  left join team_sequence_rows team_sequence
    on team_sequence.opportunity_key =
      opportunity.opportunity_key

  left join window_ranked_rows window_ranked
    on window_ranked.opportunity_key =
      opportunity.opportunity_key

  left join stage_ranked_rows stage_ranked
    on stage_ranked.opportunity_key =
      opportunity.opportunity_key

  left join selected_attempt_rows selected_attempt
    on selected_attempt.opportunity_key =
      opportunity.opportunity_key
)

select
  result.race_id,
  result.stage_id,

  result.rider_id,
  result.team_id,
  result.rider_name,
  result.team_name,
  result.role_code,

  result.opportunity_window_number,

  round(
    result.opportunity_window_start_km,
    6
  ) as opportunity_window_start_km,

  round(
    result.opportunity_window_end_km,
    6
  ) as opportunity_window_end_km,

  result.selected_step_order,
  result.selected_phase_number,

  round(
    result.selected_km_end,
    6
  ) as selected_km_end,

  result.terrain_type,
  result.effective_terrain_type,
  result.slope_percent,
  result.stage_progress_fraction,

  result.team_plan,
  result.current_phase_command,
  result.explicit_attack_instruction,

  result.energy_before_step,
  result.energy_after_step,

  result.attack_intent_score,
  result.attack_intent_band,

  result.candidate_rank_within_team,
  result.candidate_rank_within_step,

  result.attack_attempt_probability,
  result.deterministic_opportunity_roll,
  result.passed_deterministic_roll,

  result.rider_cooldown_passed,
  result.team_cooldown_passed,

  result.team_attempt_sequence,
  result.window_attempt_rank,
  result.stage_attempt_rank,

  parameters.opportunity_window_km,
  parameters.rider_cooldown_km,
  parameters.team_cooldown_km,

  parameters.max_stage_attempts,
  parameters.max_team_attempts,
  parameters.max_attempts_per_window,

  result.is_selected_attack_attempt,

  case
    when result.is_selected_attack_attempt
    then 'selected_attack_attempt'

    when not result.passed_deterministic_roll
    then 'deterministic_roll_failed'

    when not result.rider_cooldown_passed
    then 'rider_cooldown'

    when not result.team_cooldown_passed
    then 'team_cooldown'

    when result.team_attempt_sequence >
      parameters.max_team_attempts
    then 'team_attempt_cap'

    when result.window_attempt_rank >
      parameters.max_attempts_per_window
    then 'window_attempt_cap'

    when result.stage_attempt_rank >
      parameters.max_stage_attempts
    then 'stage_attempt_cap'

    else 'not_selected'
  end::text as attack_attempt_selection_reason,

  'deterministic_attack_attempts_v2_2026_07'::text
    as attack_attempt_model_version

from result_rows result

cross join parameters

order by
  result.selected_step_order,
  result.is_selected_attack_attempt desc,
  result.attack_intent_score desc,
  result.team_name,
  result.rider_name,
  result.opportunity_window_number;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_calculate_attack_outcome_components_v2(p_role_code text, p_effective_terrain_type text, p_slope_percent numeric, p_stage_progress_fraction numeric, p_attack_intent_score numeric, p_energy_before_step numeric, p_energy_after_step numeric, p_flat numeric, p_climbing numeric, p_endurance numeric, p_resistance numeric, p_race_iq numeric, p_morale numeric, p_explicit_attack_instruction boolean, p_attack_wave_size integer, p_rider_attempt_sequence integer, p_team_attempt_sequence integer)
 RETURNS TABLE(normalized_role_code text, normalized_terrain_type text, attack_execution_skill_score numeric, energy_readiness_fraction numeric, base_success_probability numeric, intent_probability_points numeric, skill_probability_points numeric, energy_probability_points numeric, role_probability_points numeric, terrain_probability_points numeric, timing_probability_points numeric, explicit_instruction_probability_points numeric, wave_cooperation_probability_points numeric, repeated_rider_attempt_penalty_points numeric, repeated_team_attempt_penalty_points numeric, raw_attack_success_probability numeric, attack_success_probability numeric, attack_success_probability_band text, projected_burst_speed_multiplier numeric, projected_burst_duration_seconds numeric, projected_attack_energy_cost_pct numeric)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$

with normalized as (
  select
    case lower(
      trim(
        coalesce(
          p_role_code,
          'free_role'
        )
      )
    )
      when 'leader' then 'team_leader_gc'
      when 'team_leader' then 'team_leader_gc'
      when 'gc_leader' then 'team_leader_gc'

      when 'protected_rider' then 'protected'

      when 'domestique' then 'helper_domestique'
      when 'helper' then 'helper_domestique'

      when 'mountain_helper' then 'mountain_domestique'

      when 'leadout' then 'lead_out'
      when 'lead-out' then 'lead_out'

      when 'breakaway_rider' then 'breakaway'
      when 'rouleur_role' then 'rouleur'

      else lower(
        trim(
          coalesce(
            p_role_code,
            'free_role'
          )
        )
      )
    end as role_code,

    lower(
      trim(
        coalesce(
          p_effective_terrain_type,
          'flat'
        )
      )
    ) as terrain_type,

    greatest(
      -20::numeric,
      least(
        20::numeric,
        coalesce(p_slope_percent, 0)
      )
    ) as slope_percent,

    greatest(
      0::numeric,
      least(
        1::numeric,
        coalesce(
          p_stage_progress_fraction,
          0
        )
      )
    ) as stage_progress_fraction,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(
          p_attack_intent_score,
          0
        )
      )
    ) as attack_intent_score,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(
          p_energy_before_step,
          50
        )
      )
    ) as energy_before_step,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(
          p_energy_after_step,
          p_energy_before_step,
          50
        )
      )
    ) as energy_after_step,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(p_flat, 50)
      )
    ) as flat_skill,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(p_climbing, 50)
      )
    ) as climbing_skill,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(p_endurance, 50)
      )
    ) as endurance_skill,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(p_resistance, 50)
      )
    ) as resistance_skill,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(p_race_iq, 50)
      )
    ) as race_iq_skill,

    greatest(
      0::numeric,
      least(
        100::numeric,
        coalesce(p_morale, 50)
      )
    ) as morale_value,

    coalesce(
      p_explicit_attack_instruction,
      false
    ) as explicit_attack_instruction,

    greatest(
      1,
      least(
        20,
        coalesce(
          p_attack_wave_size,
          1
        )
      )
    )::integer as attack_wave_size,

    greatest(
      1,
      coalesce(
        p_rider_attempt_sequence,
        1
      )
    )::integer as rider_attempt_sequence,

    greatest(
      1,
      coalesce(
        p_team_attempt_sequence,
        1
      )
    )::integer as team_attempt_sequence
),

skill_rows as (
  select
    normalized.*,

    case
      when normalized.terrain_type in (
        'climb',
        'steep_climb'
      )
      then
        normalized.climbing_skill * 0.32
        + normalized.endurance_skill * 0.20
        + normalized.resistance_skill * 0.20
        + normalized.race_iq_skill * 0.18
        + normalized.morale_value * 0.10

      when normalized.terrain_type in (
        'cobbled',
        'cobble',
        'gravel'
      )
      then
        normalized.flat_skill * 0.20
        + normalized.endurance_skill * 0.22
        + normalized.resistance_skill * 0.28
        + normalized.race_iq_skill * 0.20
        + normalized.morale_value * 0.10

      else
        normalized.flat_skill * 0.30
        + normalized.endurance_skill * 0.20
        + normalized.resistance_skill * 0.20
        + normalized.race_iq_skill * 0.20
        + normalized.morale_value * 0.10
    end::numeric as attack_execution_skill_score,

    greatest(
      0::numeric,
      least(
        1::numeric,

        (
          normalized.energy_after_step
          - 20::numeric
        )
        / 80::numeric
      )
    ) as energy_readiness_fraction

  from normalized
),

component_rows as (
  select
    skill.*,

    0.08::numeric
      as base_success_probability,

    (
      skill.attack_intent_score
      / 100::numeric
      * 0.25::numeric
    ) as intent_probability_points,

    (
      skill.attack_execution_skill_score
      / 100::numeric
      * 0.20::numeric
    ) as skill_probability_points,

    (
      skill.energy_readiness_fraction
      * 0.15::numeric
    ) as energy_probability_points,

    case skill.role_code
      when 'breakaway' then 0.12
      when 'rouleur' then 0.09
      when 'free_role' then 0.05

      when 'climber' then
        case
          when skill.terrain_type in (
            'climb',
            'steep_climb'
          )
          then 0.08
          else 0.03
        end

      when 'team_leader_gc' then
        case
          when skill.terrain_type in (
            'climb',
            'steep_climb'
          )
          then 0.06
          else 0.02
        end

      else 0
    end::numeric as role_probability_points,

    case skill.terrain_type
      when 'flat' then 0.02
      when 'false_flat' then 0.04
      when 'climb' then 0.04
      when 'steep_climb' then 0.02
      when 'descent' then -0.01
      when 'technical_descent' then -0.05
      when 'cobbled' then 0.03
      when 'cobble' then 0.03
      when 'gravel' then 0.04
      else 0
    end::numeric as terrain_probability_points,

    case
      when skill.stage_progress_fraction < 0.25
      then 0.10

      when skill.stage_progress_fraction < 0.55
      then 0.06

      when skill.stage_progress_fraction < 0.75
      then 0.02

      when skill.stage_progress_fraction < 0.90
      then -0.03

      else -0.08
    end::numeric as timing_probability_points,

    case
      when skill.explicit_attack_instruction
      then 0.18::numeric
      else 0::numeric
    end as explicit_instruction_probability_points,

    least(
      0.12::numeric,

      greatest(
        0,
        skill.attack_wave_size - 1
      )::numeric
      * 0.04::numeric
    ) as wave_cooperation_probability_points,

    least(
      0.24::numeric,

      greatest(
        0,
        skill.rider_attempt_sequence - 1
      )::numeric
      * 0.10::numeric
    ) as repeated_rider_attempt_penalty_points,

    least(
      0.09::numeric,

      greatest(
        0,
        skill.team_attempt_sequence - 1
      )::numeric
      * 0.03::numeric
    ) as repeated_team_attempt_penalty_points

  from skill_rows skill
),

probability_rows as (
  select
    component.*,

    (
      component.base_success_probability
      + component.intent_probability_points
      + component.skill_probability_points
      + component.energy_probability_points
      + component.role_probability_points
      + component.terrain_probability_points
      + component.timing_probability_points
      + component.explicit_instruction_probability_points
      + component.wave_cooperation_probability_points
      - component.repeated_rider_attempt_penalty_points
      - component.repeated_team_attempt_penalty_points
    )::numeric as raw_attack_success_probability

  from component_rows component
),

final_rows as (
  select
    probability.*,

    greatest(
      0.03::numeric,

      least(
        0.92::numeric,
        probability.raw_attack_success_probability
      )
    ) as attack_success_probability

  from probability_rows probability
)

select
  final_row.role_code
    as normalized_role_code,

  final_row.terrain_type
    as normalized_terrain_type,

  round(
    final_row.attack_execution_skill_score,
    6
  ) as attack_execution_skill_score,

  round(
    final_row.energy_readiness_fraction,
    6
  ) as energy_readiness_fraction,

  round(
    final_row.base_success_probability,
    6
  ) as base_success_probability,

  round(
    final_row.intent_probability_points,
    6
  ) as intent_probability_points,

  round(
    final_row.skill_probability_points,
    6
  ) as skill_probability_points,

  round(
    final_row.energy_probability_points,
    6
  ) as energy_probability_points,

  round(
    final_row.role_probability_points,
    6
  ) as role_probability_points,

  round(
    final_row.terrain_probability_points,
    6
  ) as terrain_probability_points,

  round(
    final_row.timing_probability_points,
    6
  ) as timing_probability_points,

  round(
    final_row.explicit_instruction_probability_points,
    6
  ) as explicit_instruction_probability_points,

  round(
    final_row.wave_cooperation_probability_points,
    6
  ) as wave_cooperation_probability_points,

  round(
    final_row.repeated_rider_attempt_penalty_points,
    6
  ) as repeated_rider_attempt_penalty_points,

  round(
    final_row.repeated_team_attempt_penalty_points,
    6
  ) as repeated_team_attempt_penalty_points,

  round(
    final_row.raw_attack_success_probability,
    6
  ) as raw_attack_success_probability,

  round(
    final_row.attack_success_probability,
    6
  ) as attack_success_probability,

  case
    when final_row.attack_success_probability >= 0.80
    then 'very_high'

    when final_row.attack_success_probability >= 0.65
    then 'high'

    when final_row.attack_success_probability >= 0.50
    then 'medium'

    when final_row.attack_success_probability >= 0.30
    then 'low'

    else 'very_low'
  end::text as attack_success_probability_band,

  round(
    least(
      1.14::numeric,

      1::numeric
      + 0.015::numeric
      + (
          final_row.attack_execution_skill_score
          / 100::numeric
          * 0.045::numeric
        )
      + (
          final_row.energy_readiness_fraction
          * 0.025::numeric
        )
      + case final_row.role_code
          when 'breakaway' then 0.010
          when 'rouleur' then 0.008
          when 'climber' then 0.006
          else 0.003
        end
      + least(
          0.015::numeric,

          greatest(
            0,
            final_row.attack_wave_size - 1
          )::numeric
          * 0.005::numeric
        )
      + case
          when final_row.explicit_attack_instruction
          then 0.010::numeric
          else 0::numeric
        end
    ),
    6
  ) as projected_burst_speed_multiplier,

  round(
    least(
      45::numeric,

      18::numeric
      + (
          final_row.attack_execution_skill_score
          / 100::numeric
          * 10::numeric
        )
      + (
          final_row.energy_readiness_fraction
          * 7::numeric
        )
      + case
          when final_row.explicit_attack_instruction
          then 4::numeric
          else 0::numeric
        end
    ),
    6
  ) as projected_burst_duration_seconds,

  round(
    least(
      12::numeric,

      1.5::numeric
      + (
          final_row.attack_intent_score
          / 100::numeric
          * 2.5::numeric
        )
      + (
          abs(
            greatest(
              0::numeric,
              final_row.slope_percent
            )
          )
          * 0.15::numeric
        )
      + (
          greatest(
            0,
            final_row.rider_attempt_sequence - 1
          )::numeric
          * 0.50::numeric
        )
    ),
    6
  ) as projected_attack_energy_cost_pct

from final_rows final_row;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_attack_outcome_preview_v2(p_stage_id uuid, p_target_step_km numeric DEFAULT 0.5, p_assumed_peloton_exposure_fraction numeric DEFAULT 0.25, p_neutral_km numeric DEFAULT 12, p_group_gap_threshold_seconds numeric DEFAULT 9, p_candidate_score_threshold numeric DEFAULT 60, p_max_candidates_per_step integer DEFAULT 12, p_opportunity_window_km numeric DEFAULT 5, p_rider_cooldown_km numeric DEFAULT 20, p_team_cooldown_km numeric DEFAULT 12, p_max_stage_attempts integer DEFAULT 6, p_max_team_attempts integer DEFAULT 2, p_max_attempts_per_window integer DEFAULT 3)
 RETURNS TABLE(race_id uuid, stage_id uuid, attack_attempt_event_key text, attack_wave_number integer, attack_wave_size integer, attack_wave_team_count integer, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, rider_attempt_sequence integer, team_attempt_sequence integer, stage_attempt_rank integer, selected_step_order integer, selected_phase_number integer, selected_km_end numeric, terrain_type text, effective_terrain_type text, slope_percent numeric, stage_progress_fraction numeric, team_plan text, current_phase_command text, explicit_attack_instruction boolean, energy_before_step numeric, energy_after_step numeric, flat_skill numeric, climbing_skill numeric, endurance_skill numeric, resistance_skill numeric, race_iq_skill numeric, morale_value numeric, attack_intent_score numeric, attack_intent_band text, attack_execution_skill_score numeric, energy_readiness_fraction numeric, base_success_probability numeric, intent_probability_points numeric, skill_probability_points numeric, energy_probability_points numeric, role_probability_points numeric, terrain_probability_points numeric, timing_probability_points numeric, explicit_instruction_probability_points numeric, wave_cooperation_probability_points numeric, repeated_rider_attempt_penalty_points numeric, repeated_team_attempt_penalty_points numeric, raw_attack_success_probability numeric, attack_success_probability numeric, attack_success_probability_band text, deterministic_outcome_roll numeric, attack_succeeded boolean, successful_riders_in_wave integer, attack_wave_outcome_code text, rider_attack_outcome_code text, projected_burst_speed_multiplier numeric, projected_burst_duration_seconds numeric, projected_attack_energy_cost_pct numeric, projected_energy_after_attack numeric, attack_outcome_model_version text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$

with

attempt_rows as materialized (
  select *
  from public.race_engine_get_stage_attack_attempt_preview_v2(
    p_stage_id,

    p_target_step_km,
    p_assumed_peloton_exposure_fraction,
    p_neutral_km,
    p_group_gap_threshold_seconds,

    p_candidate_score_threshold,
    p_max_candidates_per_step,

    p_opportunity_window_km,
    p_rider_cooldown_km,
    p_team_cooldown_km,

    p_max_stage_attempts,
    p_max_team_attempts,
    p_max_attempts_per_window
  )
),

selected_attempts as (
  select *
  from attempt_rows
  where is_selected_attack_attempt
),

rider_input_rows as materialized (
  select
    input_row.rider_id,

    coalesce(
      nullif(
        to_jsonb(input_row) ->> 'flat',
        ''
      )::numeric,
      50
    ) as flat_skill,

    coalesce(
      nullif(
        to_jsonb(input_row) ->> 'climbing',
        ''
      )::numeric,
      50
    ) as climbing_skill,

    coalesce(
      nullif(
        to_jsonb(input_row) ->> 'endurance',
        ''
      )::numeric,
      50
    ) as endurance_skill,

    coalesce(
      nullif(
        to_jsonb(input_row) ->> 'resistance',
        ''
      )::numeric,
      50
    ) as resistance_skill,

    coalesce(
      nullif(
        to_jsonb(input_row) ->> 'race_iq',
        ''
      )::numeric,
      50
    ) as race_iq_skill,

    coalesce(
      nullif(
        to_jsonb(input_row) ->> 'morale',
        ''
      )::numeric,
      50
    ) as morale_value

  from public.race_engine_get_stage_rider_inputs_v1(
    p_stage_id
  ) input_row
),

sequenced_attempts as (
  select
    selected.*,

    row_number() over (
      partition by selected.rider_id

      order by
        selected.selected_step_order,
        selected.stage_attempt_rank,
        selected.rider_id
    )::integer as rider_attempt_sequence

  from selected_attempts selected
),

wave_summary as (
  select
    sequenced.selected_step_order,

    dense_rank() over (
      order by sequenced.selected_step_order
    )::integer as attack_wave_number,

    count(*)::integer
      as attack_wave_size,

    count(
      distinct sequenced.team_id
    )::integer as attack_wave_team_count

  from sequenced_attempts sequenced

  group by sequenced.selected_step_order
),

joined_rows as (
  select
    sequenced.*,

    wave.attack_wave_number,
    wave.attack_wave_size,
    wave.attack_wave_team_count,

    coalesce(
      rider_input.flat_skill,
      50
    ) as flat_skill,

    coalesce(
      rider_input.climbing_skill,
      50
    ) as climbing_skill,

    coalesce(
      rider_input.endurance_skill,
      50
    ) as endurance_skill,

    coalesce(
      rider_input.resistance_skill,
      50
    ) as resistance_skill,

    coalesce(
      rider_input.race_iq_skill,
      50
    ) as race_iq_skill,

    coalesce(
      rider_input.morale_value,
      50
    ) as morale_value,

    md5(
      sequenced.stage_id::text
      || '|'
      || sequenced.rider_id::text
      || '|'
      || sequenced.selected_step_order::text
      || '|'
      || sequenced.stage_attempt_rank::text
      || '|attack_outcome_v2'
    ) as attack_attempt_event_key

  from sequenced_attempts sequenced

  join wave_summary wave
    on wave.selected_step_order =
      sequenced.selected_step_order

  left join rider_input_rows rider_input
    on rider_input.rider_id =
      sequenced.rider_id
),

component_rows as (
  select
    joined.*,

    component.attack_execution_skill_score,
    component.energy_readiness_fraction,

    component.base_success_probability,
    component.intent_probability_points,
    component.skill_probability_points,
    component.energy_probability_points,
    component.role_probability_points,
    component.terrain_probability_points,
    component.timing_probability_points,
    component.explicit_instruction_probability_points,
    component.wave_cooperation_probability_points,

    component.repeated_rider_attempt_penalty_points,
    component.repeated_team_attempt_penalty_points,

    component.raw_attack_success_probability,
    component.attack_success_probability,
    component.attack_success_probability_band,

    component.projected_burst_speed_multiplier,
    component.projected_burst_duration_seconds,
    component.projected_attack_energy_cost_pct

  from joined_rows joined

  cross join lateral
    public.race_engine_calculate_attack_outcome_components_v2(
      joined.role_code,
      joined.effective_terrain_type,
      joined.slope_percent,
      joined.stage_progress_fraction,

      joined.attack_intent_score,

      joined.energy_before_step,
      joined.energy_after_step,

      joined.flat_skill,
      joined.climbing_skill,
      joined.endurance_skill,
      joined.resistance_skill,
      joined.race_iq_skill,
      joined.morale_value,

      joined.explicit_attack_instruction,

      joined.attack_wave_size,
      joined.rider_attempt_sequence,
      joined.team_attempt_sequence
    ) component
),

roll_rows as (
  select
    component.*,

    public.race_engine_deterministic_unit_roll_v2(
      component.attack_attempt_event_key
      || '|success_roll'
    ) as deterministic_outcome_roll

  from component_rows component
),

outcome_rows as (
  select
    roll_row.*,

    (
      roll_row.deterministic_outcome_roll
      <= roll_row.attack_success_probability
    ) as attack_succeeded

  from roll_rows roll_row
),

wave_outcome_rows as (
  select
    outcome.*,

    count(*) filter (
      where outcome.attack_succeeded
    ) over (
      partition by outcome.selected_step_order
    )::integer as successful_riders_in_wave

  from outcome_rows outcome
)

select
  wave_outcome.race_id,
  wave_outcome.stage_id,

  wave_outcome.attack_attempt_event_key,

  wave_outcome.attack_wave_number,
  wave_outcome.attack_wave_size,
  wave_outcome.attack_wave_team_count,

  wave_outcome.rider_id,
  wave_outcome.team_id,
  wave_outcome.rider_name,
  wave_outcome.team_name,
  wave_outcome.role_code,

  wave_outcome.rider_attempt_sequence,
  wave_outcome.team_attempt_sequence,
  wave_outcome.stage_attempt_rank,

  wave_outcome.selected_step_order,
  wave_outcome.selected_phase_number,
  wave_outcome.selected_km_end,

  wave_outcome.terrain_type,
  wave_outcome.effective_terrain_type,
  wave_outcome.slope_percent,
  wave_outcome.stage_progress_fraction,

  wave_outcome.team_plan,
  wave_outcome.current_phase_command,
  wave_outcome.explicit_attack_instruction,

  wave_outcome.energy_before_step,
  wave_outcome.energy_after_step,

  wave_outcome.flat_skill,
  wave_outcome.climbing_skill,
  wave_outcome.endurance_skill,
  wave_outcome.resistance_skill,
  wave_outcome.race_iq_skill,
  wave_outcome.morale_value,

  wave_outcome.attack_intent_score,
  wave_outcome.attack_intent_band,

  wave_outcome.attack_execution_skill_score,
  wave_outcome.energy_readiness_fraction,

  wave_outcome.base_success_probability,
  wave_outcome.intent_probability_points,
  wave_outcome.skill_probability_points,
  wave_outcome.energy_probability_points,
  wave_outcome.role_probability_points,
  wave_outcome.terrain_probability_points,
  wave_outcome.timing_probability_points,
  wave_outcome.explicit_instruction_probability_points,
  wave_outcome.wave_cooperation_probability_points,

  wave_outcome.repeated_rider_attempt_penalty_points,
  wave_outcome.repeated_team_attempt_penalty_points,

  wave_outcome.raw_attack_success_probability,
  wave_outcome.attack_success_probability,
  wave_outcome.attack_success_probability_band,

  wave_outcome.deterministic_outcome_roll,
  wave_outcome.attack_succeeded,

  wave_outcome.successful_riders_in_wave,

  case
    when wave_outcome.successful_riders_in_wave = 0
    then 'wave_failed'

    when wave_outcome.successful_riders_in_wave =
      wave_outcome.attack_wave_size
     and wave_outcome.attack_wave_size > 1
    then 'full_wave_success'

    when wave_outcome.successful_riders_in_wave > 0
     and wave_outcome.successful_riders_in_wave <
       wave_outcome.attack_wave_size
    then 'partial_wave_success'

    when wave_outcome.attack_wave_size = 1
     and wave_outcome.successful_riders_in_wave = 1
    then 'solo_wave_success'

    else 'wave_success'
  end::text as attack_wave_outcome_code,

  case
    when not wave_outcome.attack_succeeded
    then 'attack_failed'

    when wave_outcome.successful_riders_in_wave > 1
    then 'attack_succeeded_with_wave'

    else 'attack_succeeded_solo'
  end::text as rider_attack_outcome_code,

  wave_outcome.projected_burst_speed_multiplier,
  wave_outcome.projected_burst_duration_seconds,
  wave_outcome.projected_attack_energy_cost_pct,

  round(
    greatest(
      0::numeric,

      wave_outcome.energy_after_step
      - wave_outcome.projected_attack_energy_cost_pct
    ),
    6
  ) as projected_energy_after_attack,

  'attack_outcome_wave_preview_v2_2026_07'::text
    as attack_outcome_model_version

from wave_outcome_rows wave_outcome

order by
  wave_outcome.attack_wave_number,
  wave_outcome.attack_succeeded desc,
  wave_outcome.attack_success_probability desc,
  wave_outcome.team_name,
  wave_outcome.rider_name;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_calculate_attack_launch_components_v2(p_is_physically_valid_attempt boolean, p_attack_succeeded boolean, p_is_accepted_escape_launch boolean, p_projected_burst_speed_multiplier numeric, p_projected_burst_duration_seconds numeric, p_projected_attack_energy_cost_pct numeric, p_energy_after_step numeric)
 RETURNS TABLE(normalized_burst_speed_multiplier numeric, normalized_burst_duration_seconds numeric, projected_speed_advantage_fraction numeric, raw_projected_initial_gap_seconds numeric, effective_projected_initial_gap_seconds numeric, raw_projected_energy_after_attempt numeric, effective_projected_energy_after_attempt numeric, attack_effort_applied boolean, initial_separation_band text)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$

with normalized as (
  select
    coalesce(
      p_is_physically_valid_attempt,
      false
    ) as is_physically_valid_attempt,

    coalesce(
      p_attack_succeeded,
      false
    ) as attack_succeeded,

    coalesce(
      p_is_accepted_escape_launch,
      false
    ) as is_accepted_escape_launch,

    greatest(
      1::numeric,

      least(
        1.25::numeric,

        coalesce(
          p_projected_burst_speed_multiplier,
          1
        )
      )
    ) as burst_speed_multiplier,

    greatest(
      0::numeric,

      least(
        120::numeric,

        coalesce(
          p_projected_burst_duration_seconds,
          0
        )
      )
    ) as burst_duration_seconds,

    greatest(
      0::numeric,

      least(
        30::numeric,

        coalesce(
          p_projected_attack_energy_cost_pct,
          0
        )
      )
    ) as attack_energy_cost_pct,

    greatest(
      0::numeric,

      least(
        100::numeric,

        coalesce(
          p_energy_after_step,
          0
        )
      )
    ) as energy_after_step
),

calculated as (
  select
    normalized.*,

    greatest(
      0::numeric,

      normalized.burst_speed_multiplier
      - 1::numeric
    ) as speed_advantage_fraction,

    case
      when normalized.attack_succeeded
      then greatest(
        0.5::numeric,

        normalized.burst_duration_seconds
        *
        greatest(
          0::numeric,

          normalized.burst_speed_multiplier
          - 1::numeric
        )
      )

      else 0::numeric
    end as raw_initial_gap_seconds,

    greatest(
      0::numeric,

      normalized.energy_after_step
      - normalized.attack_energy_cost_pct
    ) as raw_energy_after_attempt

  from normalized
)

select
  round(
    calculated.burst_speed_multiplier,
    6
  ) as normalized_burst_speed_multiplier,

  round(
    calculated.burst_duration_seconds,
    6
  ) as normalized_burst_duration_seconds,

  round(
    calculated.speed_advantage_fraction,
    6
  ) as projected_speed_advantage_fraction,

  round(
    calculated.raw_initial_gap_seconds,
    6
  ) as raw_projected_initial_gap_seconds,

  round(
    case
      when calculated.is_physically_valid_attempt
       and calculated.is_accepted_escape_launch
      then calculated.raw_initial_gap_seconds

      else 0::numeric
    end,
    6
  ) as effective_projected_initial_gap_seconds,

  round(
    calculated.raw_energy_after_attempt,
    6
  ) as raw_projected_energy_after_attempt,

  round(
    case
      when calculated.is_physically_valid_attempt
      then calculated.raw_energy_after_attempt

      else calculated.energy_after_step
    end,
    6
  ) as effective_projected_energy_after_attempt,

  calculated.is_physically_valid_attempt
    as attack_effort_applied,

  case
    when not calculated.is_physically_valid_attempt
    then 'suppressed'

    when not calculated.attack_succeeded
    then 'no_separation'

    when calculated.raw_initial_gap_seconds < 1.5
    then 'marginal_separation'

    when calculated.raw_initial_gap_seconds < 3
    then 'clear_initial_separation'

    when calculated.raw_initial_gap_seconds < 6
    then 'strong_initial_separation'

    else 'very_strong_initial_separation'
  end::text as initial_separation_band

from calculated;

$function$
;

