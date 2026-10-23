-- Optimize the existing Squad season dashboard read path. No race results,
-- points rules, permissions, or premium access semantics are changed.
-- Filter stage results by the selected club before joining metadata; use
-- indexed typed race identifiers rather than JSON conversion for GC rows.
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
      rs.rider_id,
      rs.team_id as result_team_id,
      rs.stage_id,
      rs.rank as finish_position
    from public.race_stage_results rs
    where rs.team_id = p_club_id
       or rs.rider_id in (select rider_id from club_riders_current)
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
      on rcs.race_id = lcr.race_id
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
