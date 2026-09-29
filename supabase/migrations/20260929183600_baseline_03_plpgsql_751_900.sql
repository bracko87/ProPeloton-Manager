CREATE OR REPLACE FUNCTION public.race_engine_generate_tactical_report_events_v1(p_simulation_run_id uuid, p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_id uuid;
  v_inserted_count integer := 0;
begin
  select run.race_id
  into v_race_id
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id
    and run.stage_id = p_stage_id;

  if v_race_id is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'simulation_run_not_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', p_stage_id
    );
  end if;

  delete from public.race_stage_report_events
  where stage_id = p_stage_id
    and metadata ->> 'source' = 'race_engine_tactical_report_events_v1';

  with tactical_commands as (
    select
      rstate.race_id,
      rstate.stage_id,
      rstate.rider_id,
      rstate.team_id,
      rstate.finish_position,
      rstate.metadata ->> 'rider_name' as rider_name,
      rstate.metadata ->> 'team_name' as team_name,

      coalesce(
        pcm.role_code,
        rstate.metadata ->> 'stage_role',
        rstate.role_code,
        'free_role'
      ) as stage_role,

      coalesce(
        pcm.team_plan,
        rstate.metadata ->> 'stage_tactic',
        'balanced'
      ) as stage_tactic,

      phase_data.phase_number,
      phase_data.command_code,

      case phase_data.phase_number
        when 1 then 25::numeric
        when 2 then 50::numeric
        when 3 then 75::numeric
        when 4 then 95::numeric
        else null::numeric
      end as km_marker_hint

    from public.race_stage_rider_states rstate
    left join public.race_engine_get_stage_phase_commands_v1(p_stage_id) pcm
      on pcm.rider_id = rstate.rider_id
    cross join lateral (
      values
        (1, coalesce(pcm.phase_1_command, rstate.metadata ->> 'phase_1_command')),
        (2, coalesce(pcm.phase_2_command, rstate.metadata ->> 'phase_2_command')),
        (3, coalesce(pcm.phase_3_command, rstate.metadata ->> 'phase_3_command')),
        (4, coalesce(pcm.phase_4_command, rstate.metadata ->> 'phase_4_command'))
    ) as phase_data(phase_number, command_code)
    where rstate.simulation_run_id = p_simulation_run_id
      and phase_data.command_code in (
        'attack',
        'join_breakaway',
        'chase_breakaway',
        'climb_hard',
        'sprint'
      )
  ),

  scored_commands as (
    select
      tc.*,
      case tc.command_code
        when 'attack' then 100
        when 'sprint' then 95
        when 'join_breakaway' then 90
        when 'chase_breakaway' then 86
        when 'climb_hard' then 82
        else 40
      end as importance_score
    from tactical_commands tc
  ),

  deduped as (
    select distinct on (
      rider_id,
      command_code
    )
      *
    from scored_commands
    order by
      rider_id,
      command_code,
      importance_score desc,
      phase_number desc
  ),

  ranked as (
    select
      d.*,
      row_number() over (
        order by
          d.importance_score desc,
          d.finish_position nulls last,
          d.phase_number desc,
          d.rider_name
      ) as tactical_event_number
    from deduped d
  ),

  selected_events as (
    select *
    from ranked
    where tactical_event_number <= 8
  ),

  prepared_events as (
    select
      race_id,
      stage_id,
      rider_id,
      team_id,
      rider_name,
      team_name,
      stage_role,
      stage_tactic,
      phase_number,
      command_code,
      tactical_event_number,
      km_marker_hint,

      case command_code
        when 'attack' then 'Attack launched'
        when 'sprint' then 'Sprint launched'
        when 'join_breakaway' then 'Breakaway move'
        when 'chase_breakaway' then 'Chase organized'
        when 'climb_hard' then 'Attack on the climb'
        else 'Race move'
      end as title,

      case command_code
        when 'attack' then concat(rider_name, ' attacks for ', team_name, '.')
        when 'sprint' then concat(rider_name, ' launches the sprint for ', team_name, '.')
        when 'join_breakaway' then concat(rider_name, ' tries to join the breakaway for ', team_name, '.')
        when 'chase_breakaway' then concat(rider_name, ' helps chase the breakaway for ', team_name, '.')
        when 'climb_hard' then concat(rider_name, ' attacks on the climb for ', team_name, '.')
        else concat(rider_name, ' makes a race move for ', team_name, '.')
      end as description

    from selected_events
  )

  insert into public.race_stage_report_events (
    race_id,
    stage_id,
    event_order,
    km_marker,
    race_time_label,
    event_type,
    title,
    description,
    rider_id,
    team_id,
    rider_name_snapshot,
    team_name_snapshot,
    metadata
  )
  select
    race_id,
    stage_id,
    601000 + tactical_event_number,
    km_marker_hint,
    null::text,
    'summary'::text,
    title,
    description,
    rider_id,
    team_id,
    rider_name,
    team_name,
    jsonb_build_object(
      'source', 'race_engine_tactical_report_events_v1',
      'display_event_type', 'tactical',
      'simulation_run_id', p_simulation_run_id,
      'phase_number', phase_number,
      'command_code', command_code,
      'stage_role', stage_role,
      'stage_tactic', stage_tactic,
      'tactical_event_number', tactical_event_number,
      'noise_filtered', true
    )
  from prepared_events
  order by tactical_event_number;

  get diagnostics v_inserted_count = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', p_stage_id,
    'race_id', v_race_id,
    'inserted_count', v_inserted_count,
    'mode', 'important_race_actions_only'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rebalance_top3_overflow_ai_to_pool_v1(p_reason text DEFAULT 'top3_overflow_guard'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_overflow_count integer := 0;
  v_selected_count integer := 0;
  v_moved_count integer := 0;
  v_moved_teams jsonb := '[]'::jsonb;
begin
  with top3_standings as (
    select
      'worldteam'::text as tier_key,
      'WORLDTEAM'::text as standing_key,
      count(*) as visible_team_count
    from public.clubs
    where deleted_at is null
      and club_type = 'main'
      and club_tier = 'worldteam'

    union all

    select
      'proteam'::text,
      tier2_division::text,
      count(*)
    from public.clubs
    where deleted_at is null
      and club_type = 'main'
      and club_tier = 'proteam'
      and tier2_division is not null
    group by tier2_division

    union all

    select
      'continental'::text,
      tier3_division::text,
      count(*)
    from public.clubs
    where deleted_at is null
      and club_type = 'main'
      and club_tier = 'continental'
      and tier3_division is not null
      and tier3_division <> 'ai_pool'
    group by tier3_division
  )
  select coalesce(sum(greatest(visible_team_count - 25, 0)), 0)::int
  into v_overflow_count
  from top3_standings
  where visible_team_count > 25;

  with top3_standings as (
    select
      'worldteam'::text as tier_key,
      'WORLDTEAM'::text as standing_key,
      count(*) as visible_team_count
    from public.clubs
    where deleted_at is null
      and club_type = 'main'
      and club_tier = 'worldteam'

    union all

    select
      'proteam'::text,
      tier2_division::text,
      count(*)
    from public.clubs
    where deleted_at is null
      and club_type = 'main'
      and club_tier = 'proteam'
      and tier2_division is not null
    group by tier2_division

    union all

    select
      'continental'::text,
      tier3_division::text,
      count(*)
    from public.clubs
    where deleted_at is null
      and club_type = 'main'
      and club_tier = 'continental'
      and tier3_division is not null
      and tier3_division <> 'ai_pool'
    group by tier3_division
  ),
  overflow_standings as (
    select
      tier_key,
      standing_key,
      visible_team_count,
      greatest(visible_team_count - 25, 0)::int as over_max_by
    from top3_standings
    where visible_team_count > 25
  ),
  overflow_slots as (
    select
      os.*,
      generate_series(1, os.over_max_by) as slot_no
    from overflow_standings os
  ),
  ai_candidates as (
    select
      c.id as club_id,
      c.name as club_name,
      c.country_code,
      case
        when c.club_tier = 'worldteam' then 'worldteam'
        when c.club_tier = 'proteam' then 'proteam'
        when c.club_tier = 'continental' then 'continental'
      end as tier_key,
      case
        when c.club_tier = 'worldteam' then 'WORLDTEAM'
        when c.club_tier = 'proteam' then c.tier2_division::text
        when c.club_tier = 'continental' then c.tier3_division::text
      end as standing_key,
      coalesce(c.season_points, 0) as season_points,
      c.logo_path,
      row_number() over (
        partition by
          case
            when c.club_tier = 'worldteam' then 'worldteam'
            when c.club_tier = 'proteam' then 'proteam'
            when c.club_tier = 'continental' then 'continental'
          end,
          case
            when c.club_tier = 'worldteam' then 'WORLDTEAM'
            when c.club_tier = 'proteam' then c.tier2_division::text
            when c.club_tier = 'continental' then c.tier3_division::text
          end
        order by
          coalesce(c.season_points, 0) asc,
          case when nullif(btrim(c.logo_path), '') is null then 0 else 1 end asc,
          lower(c.name) asc,
          c.id asc
      ) as candidate_rank
    from public.clubs c
    where c.deleted_at is null
      and c.club_type = 'main'
      and c.is_ai = true
      and c.club_tier in ('worldteam', 'proteam', 'continental')
      and not (
        c.club_tier = 'continental'
        and c.tier3_division = 'ai_pool'
      )
  ),
  selected_ai as (
    select
      ac.club_id,
      ac.club_name,
      ac.country_code,
      ac.tier_key,
      ac.standing_key,
      os.visible_team_count,
      os.over_max_by,
      ac.season_points,
      ac.logo_path
    from overflow_slots os
    join ai_candidates ac
      on ac.tier_key = os.tier_key
     and ac.standing_key = os.standing_key
     and ac.candidate_rank = os.slot_no
  )
  select count(*)
  into v_selected_count
  from selected_ai;

  if v_selected_count <> v_overflow_count then
    raise exception
      'Top-3 overflow found %, but only % AI teams could be selected for ai_pool. Manual review needed.',
      v_overflow_count,
      v_selected_count;
  end if;

  with top3_standings as (
    select
      'worldteam'::text as tier_key,
      'WORLDTEAM'::text as standing_key,
      count(*) as visible_team_count
    from public.clubs
    where deleted_at is null
      and club_type = 'main'
      and club_tier = 'worldteam'

    union all

    select
      'proteam'::text,
      tier2_division::text,
      count(*)
    from public.clubs
    where deleted_at is null
      and club_type = 'main'
      and club_tier = 'proteam'
      and tier2_division is not null
    group by tier2_division

    union all

    select
      'continental'::text,
      tier3_division::text,
      count(*)
    from public.clubs
    where deleted_at is null
      and club_type = 'main'
      and club_tier = 'continental'
      and tier3_division is not null
      and tier3_division <> 'ai_pool'
    group by tier3_division
  ),
  overflow_standings as (
    select
      tier_key,
      standing_key,
      visible_team_count,
      greatest(visible_team_count - 25, 0)::int as over_max_by
    from top3_standings
    where visible_team_count > 25
  ),
  overflow_slots as (
    select
      os.*,
      generate_series(1, os.over_max_by) as slot_no
    from overflow_standings os
  ),
  ai_candidates as (
    select
      c.id as club_id,
      c.name as club_name,
      c.country_code,
      case
        when c.club_tier = 'worldteam' then 'worldteam'
        when c.club_tier = 'proteam' then 'proteam'
        when c.club_tier = 'continental' then 'continental'
      end as tier_key,
      case
        when c.club_tier = 'worldteam' then 'WORLDTEAM'
        when c.club_tier = 'proteam' then c.tier2_division::text
        when c.club_tier = 'continental' then c.tier3_division::text
      end as standing_key,
      coalesce(c.season_points, 0) as season_points,
      c.logo_path,
      row_number() over (
        partition by
          case
            when c.club_tier = 'worldteam' then 'worldteam'
            when c.club_tier = 'proteam' then 'proteam'
            when c.club_tier = 'continental' then 'continental'
          end,
          case
            when c.club_tier = 'worldteam' then 'WORLDTEAM'
            when c.club_tier = 'proteam' then c.tier2_division::text
            when c.club_tier = 'continental' then c.tier3_division::text
          end
        order by
          coalesce(c.season_points, 0) asc,
          case when nullif(btrim(c.logo_path), '') is null then 0 else 1 end asc,
          lower(c.name) asc,
          c.id asc
      ) as candidate_rank
    from public.clubs c
    where c.deleted_at is null
      and c.club_type = 'main'
      and c.is_ai = true
      and c.club_tier in ('worldteam', 'proteam', 'continental')
      and not (
        c.club_tier = 'continental'
        and c.tier3_division = 'ai_pool'
      )
  ),
  selected_ai as (
    select
      ac.club_id,
      ac.club_name,
      ac.country_code,
      ac.tier_key,
      ac.standing_key,
      os.visible_team_count,
      os.over_max_by,
      ac.season_points,
      ac.logo_path
    from overflow_slots os
    join ai_candidates ac
      on ac.tier_key = os.tier_key
     and ac.standing_key = os.standing_key
     and ac.candidate_rank = os.slot_no
  ),
  moved as (
    update public.clubs c
    set
      club_tier = 'continental'::club_tier,
      world_tier = 3,
      tier2_division = null,
      tier3_division = 'ai_pool',
      amateur_division = null,
      season_points = 0,
      updated_at = now()
    from selected_ai s
    where c.id = s.club_id
      and c.deleted_at is null
      and c.club_type = 'main'
      and c.is_ai = true
    returning
      s.club_id,
      s.club_name,
      s.country_code,
      s.tier_key,
      s.standing_key,
      s.season_points
  )
  select
    count(*),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'club_id', club_id,
          'club_name', club_name,
          'country_code', country_code,
          'from_tier', tier_key,
          'from_standing', standing_key,
          'season_points_before_move', season_points
        )
        order by tier_key, standing_key, season_points, club_name
      ),
      '[]'::jsonb
    )
  into
    v_moved_count,
    v_moved_teams
  from moved;

  if v_moved_count <> v_selected_count then
    raise exception
      'Expected to move % AI teams to ai_pool, but moved %.',
      v_selected_count,
      v_moved_count;
  end if;

  return jsonb_build_object(
    'reason', p_reason,
    'overflow_slots_found', v_overflow_count,
    'ai_teams_moved_to_pool', v_moved_count,
    'moved_teams', v_moved_teams
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_rebalance_top3_overflow_ai_to_pool_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Only real/user club changes should force an AI slot out.
  -- AI updates are ignored to prevent recursion.
  if new.club_type = 'main'
     and coalesce(new.is_ai, false) = false
     and new.deleted_at is null
     and new.club_tier in ('worldteam', 'proteam', 'continental') then
    perform public.rebalance_top3_overflow_ai_to_pool_v1(
      'real_club_top3_trigger_guard'
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_generate_point_battle_report_events_v1(p_simulation_run_id uuid, p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_id uuid;
  v_inserted_count integer := 0;
begin
  select run.race_id
  into v_race_id
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id
    and run.stage_id = p_stage_id;

  if v_race_id is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'simulation_run_not_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', p_stage_id
    );
  end if;

  delete from public.race_stage_report_events
  where stage_id = p_stage_id
    and metadata ->> 'source' = 'race_engine_point_battle_report_events_v1';

  with point_rows as (
    select
      pr.point_id,
      pr.point_type,
      pr.point_name,
      pr.km_from_start,
      pr.kom_category,
      pr.sort_order,
      pr.rank,
      pr.rider_id,
      pr.team_id,
      pr.rider_name_snapshot,
      pr.team_name_snapshot,
      pr.points_awarded,
      pr.bonus_seconds_awarded
    from public.get_race_stage_point_results_v1(p_stage_id) pr
    where pr.rank is not null
      and pr.rank <= 5
      and coalesce(pr.points_awarded, 0) > 0
      and pr.point_type in (
        'INTERMEDIATE_SPRINT',
        'BONUS_SPRINT',
        'KOM',
        'FINISH'
      )
  ),

  point_groups as (
    select
      point_id,
      max(point_type) as point_type,
      max(point_name) as point_name,
      max(km_from_start::numeric) as km_from_start,
      max(kom_category) as kom_category,
      max(sort_order) as sort_order,

      count(*) as contenders_count,

      (array_agg(rider_id order by rank) filter (where rank = 1))[1]
        as winner_rider_id,
      (array_agg(team_id order by rank) filter (where rank = 1))[1]
        as winner_team_id,
      (array_agg(rider_name_snapshot order by rank) filter (where rank = 1))[1]
        as winner_rider_name,
      (array_agg(team_name_snapshot order by rank) filter (where rank = 1))[1]
        as winner_team_name,
      (array_agg(points_awarded order by rank) filter (where rank = 1))[1]
        as winner_points,
      (array_agg(bonus_seconds_awarded order by rank) filter (where rank = 1))[1]
        as winner_bonus_seconds,

      string_agg(
        case
          when rank <= 3 then
            concat(
              rank::text,
              '. ',
              rider_name_snapshot,
              ' (',
              team_name_snapshot,
              ')'
            )
          else null
        end,
        ', '
        order by rank
      ) as podium_text,

      jsonb_agg(
        jsonb_build_object(
          'rank', rank,
          'rider_id', rider_id,
          'team_id', team_id,
          'rider_name', rider_name_snapshot,
          'team_name', team_name_snapshot,
          'points_awarded', points_awarded,
          'bonus_seconds_awarded', bonus_seconds_awarded
        )
        order by rank
      ) as contenders_json
    from point_rows
    group by point_id
  ),

  prepared_events as (
    select
      point_id,
      point_type,
      coalesce(point_name, replace(initcap(point_type), '_', ' ')) as point_name,
      km_from_start,
      kom_category,
      sort_order,
      contenders_count,
      winner_rider_id,
      winner_team_id,
      winner_rider_name,
      winner_team_name,
      winner_points,
      winner_bonus_seconds,
      podium_text,
      contenders_json,

      case point_type
        when 'INTERMEDIATE_SPRINT' then 'Intermediate sprint contested'
        when 'BONUS_SPRINT' then 'Bonus sprint contested'
        when 'KOM' then
          case
            when kom_category is not null then concat('KOM ', kom_category, ' contested')
            else 'KOM contested'
          end
        when 'FINISH' then 'Final sprint contested'
        else 'Point battle'
      end as title,

      case point_type
        when 'INTERMEDIATE_SPRINT' then
          concat(
            contenders_count,
            ' riders contest the intermediate sprint at ',
            km_from_start::numeric(10,1),
            ' km. ',
            winner_rider_name,
            ' wins for ',
            winner_team_name,
            '. Top riders: ',
            podium_text,
            '.'
          )

        when 'BONUS_SPRINT' then
          concat(
            contenders_count,
            ' riders fight for bonus seconds at ',
            km_from_start::numeric(10,1),
            ' km. ',
            winner_rider_name,
            ' takes the bonus sprint for ',
            winner_team_name,
            case
              when coalesce(winner_bonus_seconds, 0) > 0
                then concat(' and earns ', winner_bonus_seconds, ' bonus seconds.')
              else '.'
            end,
            ' Top riders: ',
            podium_text,
            '.'
          )

        when 'KOM' then
          concat(
            contenders_count,
            ' riders fight for mountain points at ',
            km_from_start::numeric(10,1),
            ' km. ',
            winner_rider_name,
            ' takes maximum points for ',
            winner_team_name,
            '. Top climbers: ',
            podium_text,
            '.'
          )

        when 'FINISH' then
          concat(
            contenders_count,
            ' riders open the final sprint. ',
            winner_rider_name,
            ' wins the finish for ',
            winner_team_name,
            '. Top finishers: ',
            podium_text,
            '.'
          )

        else
          concat(
            winner_rider_name,
            ' wins the point battle for ',
            winner_team_name,
            '.'
          )
      end as description

    from point_groups
    where winner_rider_id is not null
  )

  insert into public.race_stage_report_events (
    race_id,
    stage_id,
    event_order,
    km_marker,
    race_time_label,
    event_type,
    title,
    description,
    rider_id,
    team_id,
    rider_name_snapshot,
    team_name_snapshot,
    metadata
  )
  select
    v_race_id,
    p_stage_id,
    602000 + coalesce(sort_order, 0),
    km_from_start,
    null::text,
    'summary'::text,
    title,
    description,
    winner_rider_id,
    winner_team_id,
    winner_rider_name,
    winner_team_name,
    jsonb_build_object(
      'source', 'race_engine_point_battle_report_events_v1',
      'display_event_type', 'point_battle',
      'simulation_run_id', p_simulation_run_id,
      'point_id', point_id,
      'point_type', point_type,
      'point_name', point_name,
      'km_from_start', km_from_start,
      'kom_category', kom_category,
      'contenders_count', contenders_count,
      'winner_points', winner_points,
      'winner_bonus_seconds', winner_bonus_seconds,
      'contenders', contenders_json
    )
  from prepared_events
  order by sort_order nulls last, km_from_start;

  get diagnostics v_inserted_count = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'mode', 'point_battle_events',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', p_stage_id,
    'race_id', v_race_id,
    'inserted_count', v_inserted_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_late_chase_replay_realism_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_distance_km numeric;
  v_updated_count integer := 0;
  v_event_count integer := 0;
begin
  select
    run.race_id,
    run.stage_id,
    rs.distance_km::numeric
  into
    v_race_id,
    v_stage_id,
    v_distance_km
  from public.race_stage_simulation_runs run
  join public.race_stages rs
    on rs.id = run.stage_id
  where run.id = p_simulation_run_id
    and (p_stage_id is null or run.stage_id = p_stage_id);

  if v_race_id is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'simulation_run_not_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', p_stage_id
    );
  end if;

  delete from public.race_stage_report_events
  where stage_id = v_stage_id
    and metadata ->> 'source' = 'race_engine_late_chase_replay_realism_v1';

  with frame_groups as (
    select
      frame.id,
      frame.simulation_run_id,
      frame.race_id,
      frame.stage_id,
      frame.frame_number,
      frame.race_seconds,
      frame.km_marker::numeric as km_marker,
      frame.group_code,
      frame.group_label,
      frame.group_order,
      frame.gap_seconds,
      frame.avg_speed_kmh::numeric as avg_speed_kmh,
      frame.rider_ids,
      frame.rider_names,
      frame.team_names,
      coalesce(frame.metadata, '{}'::jsonb) as metadata,

      coalesce(
        nullif(frame.metadata ->> 'base_group_code', ''),
        frame.group_code
      ) as base_group_code,

      coalesce(
        nullif(frame.metadata ->> 'group_size', '')::integer,
        cardinality(frame.rider_ids),
        0
      ) as group_size,

      coalesce(
        nullif(frame.metadata ->> 'peloton_rider_count', '')::integer,
        0
      ) as peloton_rider_count
    from public.race_stage_replay_frames frame
    where frame.simulation_run_id = p_simulation_run_id
  ),

  frame_context as (
    select
      fg.frame_number,

      max(fg.km_marker) filter (
        where fg.group_order = 1
      ) as leader_km,

      max(fg.group_size) filter (
        where fg.group_order = 1
      ) as front_group_size,

      max(fg.gap_seconds) filter (
        where fg.base_group_code = 'main_peloton'
      ) as peloton_gap_seconds,

      max(fg.group_size) filter (
        where fg.base_group_code = 'main_peloton'
      ) as peloton_group_size,

      max(fg.group_order) filter (
        where fg.base_group_code = 'main_peloton'
      ) as peloton_group_order
    from frame_groups fg
    group by fg.frame_number
  ),

  adjustments as (
    select
      fg.id,

      fg.gap_seconds as original_gap_seconds,
      fg.avg_speed_kmh as original_avg_speed_kmh,

      greatest(
        0,
        least(
          1,
          (
            coalesce(ctx.leader_km, fg.km_marker) -
            greatest(v_distance_km - 30, 0)
          ) / 30.0
        )
      ) as late_progress,

      coalesce(ctx.front_group_size, fg.group_size, 1) as front_group_size,
      coalesce(ctx.peloton_group_size, fg.peloton_rider_count, 0) as peloton_group_size,
      coalesce(ctx.peloton_gap_seconds, 0) as peloton_gap_seconds,

      case
        when coalesce(ctx.front_group_size, fg.group_size, 99) <= 2 then 1.35
        when coalesce(ctx.front_group_size, fg.group_size, 99) <= 5 then 1.00
        when coalesce(ctx.front_group_size, fg.group_size, 99) <= 8 then 0.65
        else 0.25
      end as small_group_pressure,

      case
        when coalesce(ctx.peloton_group_size, fg.peloton_rider_count, 0) >= 35 then 1.20
        when coalesce(ctx.peloton_group_size, fg.peloton_rider_count, 0) >= 20 then 1.00
        when coalesce(ctx.peloton_group_size, fg.peloton_rider_count, 0) >= 10 then 0.70
        else 0.35
      end as peloton_pressure,

      case
        when fg.base_group_code in ('main_peloton', 'chase_group', 'dropped_group', 'outside_group')
          and coalesce(ctx.peloton_gap_seconds, 0) > 9
          and coalesce(ctx.leader_km, fg.km_marker) >= greatest(v_distance_km - 30, 0)
        then
          round(
            greatest(
              0,
              least(
                90,
                greatest(
                  0,
                  least(
                    1,
                    (
                      coalesce(ctx.leader_km, fg.km_marker) -
                      greatest(v_distance_km - 30, 0)
                    ) / 30.0
                  )
                )
                *
                case
                  when coalesce(ctx.front_group_size, fg.group_size, 99) <= 2 then 1.35
                  when coalesce(ctx.front_group_size, fg.group_size, 99) <= 5 then 1.00
                  when coalesce(ctx.front_group_size, fg.group_size, 99) <= 8 then 0.65
                  else 0.25
                end
                *
                case
                  when coalesce(ctx.peloton_group_size, fg.peloton_rider_count, 0) >= 35 then 1.20
                  when coalesce(ctx.peloton_group_size, fg.peloton_rider_count, 0) >= 20 then 1.00
                  when coalesce(ctx.peloton_group_size, fg.peloton_rider_count, 0) >= 10 then 0.70
                  else 0.35
                end
                * 65
              )
            )
          )::integer
        else 0
      end as chase_gap_reduction_seconds,

      case
        when fg.base_group_code = 'front_group'
          and coalesce(ctx.front_group_size, fg.group_size, 99) <= 8
          and coalesce(ctx.leader_km, fg.km_marker) >= greatest(v_distance_km - 30, 0)
        then
          greatest(
            20,
            fg.avg_speed_kmh -
            (
              greatest(
                0,
                least(
                  1,
                  (
                    coalesce(ctx.leader_km, fg.km_marker) -
                    greatest(v_distance_km - 30, 0)
                  ) / 30.0
                )
              )
              *
              case
                when coalesce(ctx.front_group_size, fg.group_size, 99) <= 2 then 2.4
                when coalesce(ctx.front_group_size, fg.group_size, 99) <= 5 then 1.5
                when coalesce(ctx.front_group_size, fg.group_size, 99) <= 8 then 0.8
                else 0.3
              end
            )
          )

        when fg.base_group_code in ('main_peloton', 'chase_group')
          and coalesce(ctx.peloton_gap_seconds, 0) > 9
          and coalesce(ctx.leader_km, fg.km_marker) >= greatest(v_distance_km - 30, 0)
        then
          least(
            62,
            fg.avg_speed_kmh +
            (
              greatest(
                0,
                least(
                  1,
                  (
                    coalesce(ctx.leader_km, fg.km_marker) -
                    greatest(v_distance_km - 30, 0)
                  ) / 30.0
                )
              )
              *
              case
                when coalesce(ctx.peloton_group_size, fg.peloton_rider_count, 0) >= 35 then 2.2
                when coalesce(ctx.peloton_group_size, fg.peloton_rider_count, 0) >= 20 then 1.6
                when coalesce(ctx.peloton_group_size, fg.peloton_rider_count, 0) >= 10 then 1.0
                else 0.4
              end
            )
          )

        else fg.avg_speed_kmh
      end as adjusted_avg_speed_kmh,

      case
        when fg.group_order = 1 then 0
        else greatest(
          0,
          fg.gap_seconds -
          case
            when fg.base_group_code in ('main_peloton', 'chase_group', 'dropped_group', 'outside_group')
              and coalesce(ctx.peloton_gap_seconds, 0) > 9
              and coalesce(ctx.leader_km, fg.km_marker) >= greatest(v_distance_km - 30, 0)
            then
              round(
                greatest(
                  0,
                  least(
                    90,
                    greatest(
                      0,
                      least(
                        1,
                        (
                          coalesce(ctx.leader_km, fg.km_marker) -
                          greatest(v_distance_km - 30, 0)
                        ) / 30.0
                      )
                    )
                    *
                    case
                      when coalesce(ctx.front_group_size, fg.group_size, 99) <= 2 then 1.35
                      when coalesce(ctx.front_group_size, fg.group_size, 99) <= 5 then 1.00
                      when coalesce(ctx.front_group_size, fg.group_size, 99) <= 8 then 0.65
                      else 0.25
                    end
                    *
                    case
                      when coalesce(ctx.peloton_group_size, fg.peloton_rider_count, 0) >= 35 then 1.20
                      when coalesce(ctx.peloton_group_size, fg.peloton_rider_count, 0) >= 20 then 1.00
                      when coalesce(ctx.peloton_group_size, fg.peloton_rider_count, 0) >= 10 then 0.70
                      else 0.35
                    end
                    * 65
                  )
                )
              )::integer
            else 0
          end
        )
      end::integer as adjusted_gap_seconds

    from frame_groups fg
    join frame_context ctx
      on ctx.frame_number = fg.frame_number
  )

  update public.race_stage_replay_frames frame
  set
    gap_seconds = adjustments.adjusted_gap_seconds,
    avg_speed_kmh = round(adjustments.adjusted_avg_speed_kmh, 2),
    metadata =
      coalesce(frame.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'late_chase_realism_applied', true,
        'late_chase_model', 'small_breakaway_vs_peloton_chase_v1',
        'late_chase_original_gap_seconds', adjustments.original_gap_seconds,
        'late_chase_adjusted_gap_seconds', adjustments.adjusted_gap_seconds,
        'late_chase_gap_reduction_seconds', adjustments.chase_gap_reduction_seconds,
        'late_chase_original_avg_speed_kmh', round(adjustments.original_avg_speed_kmh, 2),
        'late_chase_adjusted_avg_speed_kmh', round(adjustments.adjusted_avg_speed_kmh, 2),
        'late_chase_late_progress', round(adjustments.late_progress, 3),
        'late_chase_front_group_size', adjustments.front_group_size,
        'late_chase_peloton_group_size', adjustments.peloton_group_size,
        'late_chase_peloton_gap_seconds', adjustments.peloton_gap_seconds
      )
  from adjustments
  where adjustments.id = frame.id;

  get diagnostics v_updated_count = row_count;

  with replay as (
    select
      frame.*,
      coalesce(frame.metadata, '{}'::jsonb) as meta,
      coalesce(nullif(frame.metadata ->> 'base_group_code', ''), frame.group_code) as base_group_code,
      coalesce(nullif(frame.metadata ->> 'group_size', '')::integer, cardinality(frame.rider_ids), 0) as group_size,
      coalesce(nullif(frame.metadata ->> 'late_chase_original_gap_seconds', '')::integer, frame.gap_seconds) as original_gap_seconds,
      coalesce(nullif(frame.metadata ->> 'late_chase_gap_reduction_seconds', '')::integer, 0) as gap_reduction_seconds,
      coalesce(nullif(frame.metadata ->> 'late_chase_front_group_size', '')::integer, 0) as front_group_size,
      coalesce(nullif(frame.metadata ->> 'late_chase_peloton_group_size', '')::integer, 0) as peloton_group_size
    from public.race_stage_replay_frames frame
    where frame.simulation_run_id = p_simulation_run_id
  ),

  chase_intensifies as (
    select
      603010 as event_order,
      r.km_marker::numeric as km_marker,
      'Chase intensifies'::text as title,
      concat(
        'The peloton increases the pace behind the breakaway with ',
        greatest(0, round(v_distance_km - r.km_marker::numeric, 1)),
        ' km remaining.'
      ) as description,
      r.meta
    from replay r
    where r.base_group_code = 'main_peloton'
      and r.km_marker::numeric >= greatest(v_distance_km - 30, 0)
      and r.original_gap_seconds > 20
      and r.gap_reduction_seconds > 0
    order by r.km_marker::numeric asc
    limit 1
  ),

  breakaway_caught as (
    select
      603020 as event_order,
      r.km_marker::numeric as km_marker,
      'Breakaway caught'::text as title,
      concat(
        'The chase brings the front group back with ',
        greatest(0, round(v_distance_km - r.km_marker::numeric, 1)),
        ' km remaining.'
      ) as description,
      r.meta
    from replay r
    where r.base_group_code = 'main_peloton'
      and r.km_marker::numeric >= greatest(v_distance_km - 30, 0)
      and r.original_gap_seconds > 9
      and r.gap_seconds <= 9
      and r.front_group_size between 1 and 8
    order by r.km_marker::numeric asc
    limit 1
  ),

  breakaway_survives as (
    select
      603030 as event_order,
      r.km_marker::numeric as km_marker,
      'Breakaway survives'::text as title,
      concat(
        'The front group holds off the chase into the final kilometres.'
      ) as description,
      r.meta
    from replay r
    where r.base_group_code = 'main_peloton'
      and r.frame_number = (
        select max(frame_number)
        from public.race_stage_replay_frames
        where simulation_run_id = p_simulation_run_id
      )
      and r.gap_seconds > 9
      and r.front_group_size between 1 and 8
    limit 1
  ),

  event_rows as (
    select * from chase_intensifies
    union all
    select * from breakaway_caught
    union all
    select * from breakaway_survives
  )

  insert into public.race_stage_report_events (
    race_id,
    stage_id,
    event_order,
    km_marker,
    race_time_label,
    event_type,
    title,
    description,
    rider_id,
    team_id,
    rider_name_snapshot,
    team_name_snapshot,
    metadata
  )
  select
    v_race_id,
    v_stage_id,
    event_order,
    km_marker,
    null::text,
    'summary'::text,
    title,
    description,
    null::uuid,
    null::uuid,
    null::text,
    null::text,
    jsonb_build_object(
      'source', 'race_engine_late_chase_replay_realism_v1',
      'display_event_type', 'race_dynamics',
      'simulation_run_id', p_simulation_run_id,
      'model', 'small_breakaway_vs_peloton_chase_v1',
      'frame_metadata', meta
    )
  from event_rows
  order by event_order;

  get diagnostics v_event_count = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'mode', 'late_chase_replay_realism',
    'simulation_run_id', p_simulation_run_id,
    'race_id', v_race_id,
    'stage_id', v_stage_id,
    'distance_km', v_distance_km,
    'updated_replay_frame_count', v_updated_count,
    'inserted_event_count', v_event_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_finish_sprint_micro_battle_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_distance_km numeric;
  v_terrain_type text;
  v_finish_type text;
  v_is_summit_finish boolean;
  v_old_winner text;
  v_new_winner text;
  v_updated_count integer := 0;
begin
  select
    run.race_id,
    run.stage_id,
    rs.distance_km::numeric,
    rs.terrain_type,
    rs.finish_type,
    coalesce(rs.is_summit_finish, false)
  into
    v_race_id,
    v_stage_id,
    v_distance_km,
    v_terrain_type,
    v_finish_type,
    v_is_summit_finish
  from public.race_stage_simulation_runs run
  join public.race_stages rs
    on rs.id = run.stage_id
  where run.id = p_simulation_run_id
    and run.status = 'completed'
    and (p_stage_id is null or run.stage_id = p_stage_id);

  if v_stage_id is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'simulation_run_not_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', p_stage_id
    );
  end if;

  if lower(coalesce(v_terrain_type, '')) in (
    'individual_time_trial',
    'team_time_trial',
    'prologue'
  ) then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'time_trial_stage',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id
    );
  end if;

  if v_is_summit_finish then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'summit_finish',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id
    );
  end if;

  select state.metadata ->> 'rider_name'
  into v_old_winner
  from public.race_stage_rider_states state
  where state.simulation_run_id = p_simulation_run_id
    and state.finish_position = 1
  limit 1;

  with final_frame as (
    select max(frame_number) as frame_number
    from public.race_stage_replay_frames
    where simulation_run_id = p_simulation_run_id
  ),

  front_finish_group as (
    select
      frame.id,
      frame.frame_number,
      frame.group_order,
      frame.group_code,
      frame.rider_ids,
      frame.rider_names,
      frame.team_names,
      coalesce(
        nullif(frame.metadata ->> 'group_size', '')::integer,
        cardinality(frame.rider_ids),
        0
      ) as group_size
    from public.race_stage_replay_frames frame
    join final_frame ff
      on ff.frame_number = frame.frame_number
    where frame.simulation_run_id = p_simulation_run_id
    order by frame.group_order asc
    limit 1
  ),

  front_riders_raw as (
    select
      rider_index.array_index,
      fg.group_order,
      fg.group_code,
      fg.group_size,
      fg.rider_ids[rider_index.array_index] as rider_id,
      fg.rider_names[rider_index.array_index] as replay_rider_name,
      fg.team_names[rider_index.array_index] as replay_team_name
    from front_finish_group fg
    cross join lateral generate_subscripts(
      fg.rider_ids,
      1
    ) as rider_index(array_index)
  ),

  front_riders as (
    select
      raw.*,
      state.team_id,
      state.finish_position as old_finish_position,
      coalesce(state.gap_seconds, 0) as old_gap_seconds,
      coalesce(state.finish_time_seconds, 0) as old_finish_time_seconds,

      coalesce(
        nullif(
          trim(
            concat_ws(
              ' ',
              nullif(rider.first_name, ''),
              nullif(rider.last_name, '')
            )
          ),
          ''
        ),
        nullif(rider.display_name, ''),
        raw.replay_rider_name,
        state.metadata ->> 'rider_name',
        'Rider'
      ) as rider_name,

      coalesce(
        raw.replay_team_name,
        state.metadata ->> 'team_name',
        ''
      ) as team_name,

      coalesce(rider.sprint, 65)::numeric as sprint_skill,
      coalesce(rider.flat, 65)::numeric as flat_skill,
      coalesce(rider.endurance, 65)::numeric as endurance_skill,
      coalesce(rider.resistance, 65)::numeric as resistance_skill,
      coalesce(rider.race_iq, 65)::numeric as race_iq_skill,
      coalesce(rider.teamwork, 65)::numeric as teamwork_skill,
      coalesce(rider.morale, 65)::numeric as morale_skill,

      greatest(
        0,
        coalesce(state.start_stamina, 100)::numeric
        - coalesce(state.stamina_spent, 0)::numeric
      ) as estimated_finish_stamina,

      coalesce(state.fatigue_before_stage, 0)::numeric as fatigue_before_stage,

      coalesce(
        nullif(state.metadata ->> 'stage_role', ''),
        lower(replace(coalesce(state.role_code, ''), ' ', '_')),
        'free_role'
      ) as stage_role,

      coalesce(
        nullif(state.metadata ->> 'stage_tactic', ''),
        'balanced'
      ) as stage_tactic,

      coalesce(
        nullif(state.metadata ->> 'phase_4_command', ''),
        'follow_team_plan'
      ) as command_code,

      coalesce(
        nullif(state.metadata ->> 'performance_score', '')::numeric,
        70
      ) as performance_score

    from front_riders_raw raw
    join public.race_stage_rider_states state
      on state.simulation_run_id = p_simulation_run_id
     and state.rider_id = raw.rider_id
     and state.finish_position is not null
    join public.riders rider
      on rider.id = state.rider_id
  ),

  front_gap_context as (
    select min(old_gap_seconds) as front_min_gap_seconds
    from front_riders
  ),

  eligible_front_sprint_riders as (
    select fr.*
    from front_riders fr
    cross join front_gap_context ctx
    where fr.old_gap_seconds <= ctx.front_min_gap_seconds + 3
  ),

  scored_front_sprint as (
    select
      rider.*,

      count(*) filter (
        where lower(coalesce(rider.stage_role, '')) in (
          'lead_out',
          'sprint_train',
          'helper',
          'helper_domestique',
          'rouleur'
        )
        or lower(coalesce(rider.command_code, '')) in (
          'lead_out',
          'control_tempo',
          'protect_leader'
        )
      ) over (
        partition by rider.team_id
      ) as same_team_support_count,

      (
        rider.sprint_skill * 0.46
        + rider.flat_skill * 0.14
        + rider.race_iq_skill * 0.12
        + rider.endurance_skill * 0.08
        + rider.resistance_skill * 0.06
        + rider.morale_skill * 0.06
        + rider.estimated_finish_stamina * 0.08
      )
      - rider.fatigue_before_stage * 0.07

      + case
          when lower(coalesce(rider.stage_role, '')) = 'sprinter' then 6.0
          when lower(coalesce(rider.stage_role, '')) = 'team_leader' then 2.5
          when lower(coalesce(rider.stage_role, '')) = 'protected' then 2.0
          when lower(coalesce(rider.stage_role, '')) = 'lead_out' then 1.5
          else 0
        end

      + case
          when lower(coalesce(rider.command_code, '')) = 'sprint' then 7.0
          when lower(coalesce(rider.command_code, '')) = 'lead_out' then 2.0
          when lower(coalesce(rider.command_code, '')) = 'stay_near_front' then 1.0
          else 0
        end

      + case
          when lower(coalesce(rider.stage_tactic, '')) = 'sprint_control' then 2.5
          when lower(coalesce(rider.stage_tactic, '')) = 'balanced' then 0.5
          else 0
        end

      + case
          when lower(coalesce(rider.stage_role, '')) in ('sprinter', 'team_leader', 'protected') then
            least(
              6.0,
              greatest(
                0,
                (
                  count(*) filter (
                    where lower(coalesce(rider.stage_role, '')) in (
                      'lead_out',
                      'sprint_train',
                      'helper',
                      'helper_domestique',
                      'rouleur'
                    )
                    or lower(coalesce(rider.command_code, '')) in (
                      'lead_out',
                      'control_tempo',
                      'protect_leader'
                    )
                  ) over (
                    partition by rider.team_id
                  )
                )::numeric * 1.35
              )
            )
          else 0
        end

      + case
          when rider.group_size >= 20
            then rider.performance_score * 0.025
          else rider.performance_score * 0.015
        end as finish_sprint_score

    from eligible_front_sprint_riders rider
  ),

  ranked_front_sprint as (
    select
      scored.*,
      row_number() over (
        order by
          finish_sprint_score desc,
          sprint_skill desc,
          estimated_finish_stamina desc,
          old_finish_position,
          rider_id
      )::integer as new_front_rank
    from scored_front_sprint scored
  ),

  unaffected_riders as (
    select
      state.rider_id,
      state.finish_position as old_finish_position,
      row_number() over (
        order by
          state.finish_position nulls last,
          state.rider_id
      )::integer as unaffected_rank
    from public.race_stage_rider_states state
    where state.simulation_run_id = p_simulation_run_id
      and state.finish_position is not null
      and not exists (
        select 1
        from ranked_front_sprint sprint
        where sprint.rider_id = state.rider_id
      )
  ),

  final_order as (
    select
      sprint.rider_id,
      sprint.new_front_rank as new_finish_position,
      sprint.finish_sprint_score,
      sprint.stage_role,
      sprint.stage_tactic,
      sprint.command_code,
      sprint.same_team_support_count,
      sprint.group_size,
      true as finish_sprint_reordered
    from ranked_front_sprint sprint

    union all

    select
      unaffected.rider_id,
      (
        (select count(*) from ranked_front_sprint)
        + unaffected.unaffected_rank
      )::integer as new_finish_position,
      null::numeric as finish_sprint_score,
      null::text as stage_role,
      null::text as stage_tactic,
      null::text as command_code,
      null::bigint as same_team_support_count,
      null::integer as group_size,
      false as finish_sprint_reordered
    from unaffected_riders unaffected
  )

  update public.race_stage_rider_states state
  set
    finish_position = final_order.new_finish_position,
    metadata =
      coalesce(state.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'finish_sprint_micro_battle_applied', true,
        'finish_sprint_model', 'front_group_sprint_score_v1',
        'finish_sprint_reordered', final_order.finish_sprint_reordered,
        'finish_sprint_score', final_order.finish_sprint_score,
        'finish_sprint_stage_role', final_order.stage_role,
        'finish_sprint_stage_tactic', final_order.stage_tactic,
        'finish_sprint_command_code', final_order.command_code,
        'finish_sprint_same_team_support_count', final_order.same_team_support_count,
        'finish_sprint_front_group_size', final_order.group_size,
        'finish_sprint_old_position', state.finish_position,
        'finish_sprint_new_position', final_order.new_finish_position
      )
  from final_order
  where state.simulation_run_id = p_simulation_run_id
    and state.rider_id = final_order.rider_id;

  get diagnostics v_updated_count = row_count;

  select state.metadata ->> 'rider_name'
  into v_new_winner
  from public.race_stage_rider_states state
  where state.simulation_run_id = p_simulation_run_id
    and state.finish_position = 1
  limit 1;

  delete from public.race_stage_report_events
  where stage_id = v_stage_id
    and metadata ->> 'source' = 'race_engine_finish_sprint_micro_battle_v1';

  insert into public.race_stage_report_events (
    race_id,
    stage_id,
    event_order,
    km_marker,
    race_time_label,
    event_type,
    title,
    description,
    rider_id,
    team_id,
    rider_name_snapshot,
    team_name_snapshot,
    metadata
  )
  select
    v_race_id,
    v_stage_id,
    603900,
    v_distance_km,
    null::text,
    'summary'::text,
    'Final sprint decided',
    concat(
      'The front group launches the final sprint. ',
      coalesce(state.metadata ->> 'rider_name', 'The winner'),
      ' wins after the final-kilometre sprint battle.'
    ),
    state.rider_id,
    state.team_id,
    state.metadata ->> 'rider_name',
    state.metadata ->> 'team_name',
    jsonb_build_object(
      'source', 'race_engine_finish_sprint_micro_battle_v1',
      'display_event_type', 'race_dynamics',
      'simulation_run_id', p_simulation_run_id,
      'model', 'front_group_sprint_score_v1',
      'old_winner', v_old_winner,
      'new_winner', v_new_winner,
      'front_group_size', state.metadata ->> 'finish_sprint_front_group_size',
      'finish_sprint_score', state.metadata ->> 'finish_sprint_score',
      'stage_role', state.metadata ->> 'finish_sprint_stage_role',
      'stage_tactic', state.metadata ->> 'finish_sprint_stage_tactic',
      'command_code', state.metadata ->> 'finish_sprint_command_code',
      'same_team_support_count', state.metadata ->> 'finish_sprint_same_team_support_count'
    )
  from public.race_stage_rider_states state
  where state.simulation_run_id = p_simulation_run_id
    and state.finish_position = 1
  limit 1;

  return jsonb_build_object(
    'status', 'completed',
    'mode', 'finish_sprint_micro_battle',
    'simulation_run_id', p_simulation_run_id,
    'race_id', v_race_id,
    'stage_id', v_stage_id,
    'terrain_type', v_terrain_type,
    'finish_type', v_finish_type,
    'old_winner', v_old_winner,
    'new_winner', v_new_winner,
    'updated_rider_state_rows', v_updated_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_missed_startlist_race_notifications_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_updated_count integer := 0;
begin
  /*
   * Hide/expire noisy race-preparation and stage-plan notifications
   * after a team has missed the startlist.
   *
   * We keep the actual missed-startlist notification.
   */
  update public.notifications n
  set
    expires_at = least(coalesce(n.expires_at, now()), now()),
    payload_json =
      coalesce(n.payload_json, '{}'::jsonb)
      || jsonb_build_object(
        'superseded_by_missed_startlist', true,
        'cleanup_source', 'cleanup_missed_startlist_race_notifications_v1',
        'cleaned_up_at', now()
      )
  where exists (
    select 1
    from public.race_preparations rp
    where rp.race_id = nullif(n.payload_json ->> 'race_id', '')::uuid
      and (
        rp.club_id = nullif(n.payload_json ->> 'club_id', '')::uuid
        or rp.participating_club_id = nullif(n.payload_json ->> 'club_id', '')::uuid
      )
      and (
        rp.status = 'missed_startlist'
        or rp.startlist_status = 'missed_startlist'
        or rp.metadata ->> 'missed_startlist' = 'true'
      )
  )
  and coalesce(n.payload_json ->> 'event_type', '') <> 'missed_startlist'
  and coalesce(n.payload_json ->> 'type_code', '') not in (
    'RACE_MISSED_STARTLIST',
    'MISSED_STARTLIST'
  )
  and (
    n.title ilike '%stage plan%'
    or n.title ilike '%race results%'
    or n.title ilike '%race plan%'
    or n.message ilike '%stage plan%'
    or n.message ilike '%race results%'
    or n.message ilike '%race plan%'
    or coalesce(n.payload_json ->> 'target_tab', '') in ('racePlan', 'stagePlans')
    or coalesce(n.payload_json ->> 'type_code', '') in (
      'RACE_PLAN_OPEN',
      'RACE_PLAN_DEADLINE_REMINDER',
      'STAGE_PLANS_OPEN',
      'STAGE_PLAN_LOCK_REMINDER',
      'STAGE_PLAN_MISSING_AT_LOCK'
    )
  );

  get diagnostics v_updated_count = row_count;

  return v_updated_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_stage_rain_jacket_requirement_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage record;
  v_weather jsonb := '{}'::jsonb;
  v_temperature numeric := null;
  v_rain_chance numeric := null;
  v_precip_mm numeric := null;
  v_condition text := '';
  v_is_rain boolean := false;
  v_is_cold boolean := false;
  v_required boolean := false;
  v_reason text := 'not required';
begin
  select
    rs.id,
    rs.weather_snapshot,
    rs.weather_summary,
    rs.metadata
  into v_stage
  from public.race_stages rs
  where rs.id = p_stage_id;

  if v_stage.id is null then
    raise exception 'Stage % not found.', p_stage_id;
  end if;

  v_weather := coalesce(
    v_stage.weather_snapshot,
    v_stage.metadata -> 'weather_snapshot',
    v_stage.metadata -> 'weather',
    '{}'::jsonb
  );

  /* Canonical route correction: no duplicated temperature-key parsing. */
  v_temperature :=
    public.race_stage_weather_avg_temp_c_v1(p_stage_id);

  v_rain_chance := coalesce(
    nullif(v_weather ->> 'rain_chance_pct', '')::numeric,
    nullif(v_weather ->> 'rain_probability_pct', '')::numeric,
    nullif(v_weather ->> 'precipitation_chance_pct', '')::numeric,
    nullif(v_weather ->> 'precipitation_probability_pct', '')::numeric,
    nullif(v_weather ->> 'chance_of_rain_pct', '')::numeric,
    nullif(v_weather ->> 'rain', '')::numeric
  );

  v_precip_mm := coalesce(
    nullif(v_weather ->> 'avg_precip_mm', '')::numeric,
    nullif(v_weather ->> 'precip_mm', '')::numeric,
    nullif(v_weather ->> 'precipitation_mm', '')::numeric,
    nullif(v_weather ->> 'rain_mm', '')::numeric,
    nullif(v_weather ->> 'avg_rain_mm', '')::numeric
  );

  /* Canonical route correction: no duplicated condition/summary parsing. */
  v_condition := lower(coalesce(
    public.race_stage_weather_condition_text_v2(p_stage_id),
    ''
  ));

  v_is_rain :=
    coalesce(v_rain_chance, 0) >= 40
    or coalesce(v_precip_mm, 0) >= 2
    or v_condition like '%rain%'
    or v_condition like '%shower%'
    or v_condition like '%storm%'
    or v_condition like '%drizzle%';

  v_is_cold := v_temperature is not null and v_temperature < 15;
  v_required := v_is_rain or v_is_cold;

  v_reason := case
    when v_is_rain and v_is_cold then 'rain and temperature below 15°C'
    when v_is_rain then 'rain'
    when v_is_cold then 'temperature below 15°C'
    else 'not required'
  end;

  return jsonb_build_object(
    'stage_id', p_stage_id,
    'rain_jacket_required', v_required,
    'is_rain', v_is_rain,
    'is_cold', v_is_cold,
    'temperature_c', v_temperature,
    'rain_chance_pct', v_rain_chance,
    'precip_mm', v_precip_mm,
    'reason', v_reason,
    'weather', v_weather
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_rain_jacket_weather_exposure_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_stage_date date;
  v_weather jsonb;
  v_required boolean;
  v_reason text;
  v_inserted_count integer := 0;
  v_updated_state_count integer := 0;
  v_illness_count integer := 0;
  v_row record;
  v_recent_exposure_count integer := 0;
  v_roll integer := 0;
  v_health_result jsonb := '{}'::jsonb;
begin
  select
    run.race_id,
    run.stage_id,
    rs.stage_date::date
  into v_race_id, v_stage_id, v_stage_date
  from public.race_stage_simulation_runs run
  join public.race_stages rs
    on rs.id = run.stage_id
  where run.id = p_simulation_run_id
    and run.status = 'completed'
    and (p_stage_id is null or run.stage_id = p_stage_id);

  if v_stage_id is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'completed_simulation_run_not_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', p_stage_id
    );
  end if;

  v_weather := public.race_engine_stage_rain_jacket_requirement_v1(v_stage_id);
  v_required := coalesce((v_weather ->> 'rain_jacket_required')::boolean, false);
  v_reason := coalesce(v_weather ->> 'reason', 'not required');

  if not v_required then
    update public.race_stage_rider_states rs
    set metadata = coalesce(rs.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'rain_jacket_required', false,
        'rain_jacket_weather_reason', v_reason,
        'rain_jacket_model', 'rain_or_below_15c_v1'
      )
    where rs.simulation_run_id = p_simulation_run_id;

    get diagnostics v_updated_state_count = row_count;

    return jsonb_build_object(
      'status', 'skipped_not_required',
      'simulation_run_id', p_simulation_run_id,
      'race_id', v_race_id,
      'stage_id', v_stage_id,
      'weather', v_weather,
      'updated_state_rows', v_updated_state_count
    );
  end if;

  insert into public.race_stage_weather_exposure_events (
    simulation_run_id,
    race_id,
    stage_id,
    rider_id,
    team_id,
    stage_date,
    rain_jacket_required,
    rain_jacket_used,
    weather_reason,
    illness_risk_score,
    metadata
  )
  select
    state.simulation_run_id,
    state.race_id,
    state.stage_id,
    state.rider_id,
    state.team_id,
    v_stage_date,
    true,
    coalesce((plan.rider_supplies_json -> state.rider_id::text ->> 'rain_jacket')::boolean, false),
    v_reason,
    case
      when coalesce((plan.rider_supplies_json -> state.rider_id::text ->> 'rain_jacket')::boolean, false) then 10
      else 60
    end,
    jsonb_build_object(
      'source', 'race_engine_apply_rain_jacket_weather_exposure_v1',
      'weather', v_weather,
      'race_preparation_id', prep.id,
      'race_stage_plan_id', plan.id
    )
  from public.race_stage_rider_states state
  left join public.race_preparations prep
    on prep.race_id = state.race_id
   and (
      prep.club_id = state.team_id
      or prep.participating_club_id = state.team_id
   )
  left join public.race_stage_plans plan
    on plan.race_preparation_id = prep.id
   and plan.stage_id = state.stage_id
  where state.simulation_run_id = p_simulation_run_id
    and state.stage_status = 'finished'
  on conflict (simulation_run_id, stage_id, rider_id)
  do update set
    rain_jacket_required = excluded.rain_jacket_required,
    rain_jacket_used = excluded.rain_jacket_used,
    weather_reason = excluded.weather_reason,
    illness_risk_score = excluded.illness_risk_score,
    metadata = race_stage_weather_exposure_events.metadata || excluded.metadata,
    updated_at = now();

  get diagnostics v_inserted_count = row_count;

  update public.race_stage_rider_states state
  set metadata = coalesce(state.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'rain_jacket_required', true,
      'rain_jacket_used', exposure.rain_jacket_used,
      'rain_jacket_weather_reason', v_reason,
      'rain_jacket_illness_risk_score', exposure.illness_risk_score,
      'rain_jacket_model', 'rain_or_below_15c_v1',
      'weather_exposure_event_id', exposure.id
    )
  from public.race_stage_weather_exposure_events exposure
  where exposure.simulation_run_id = p_simulation_run_id
    and exposure.stage_id = state.stage_id
    and exposure.rider_id = state.rider_id
    and state.simulation_run_id = p_simulation_run_id;

  get diagnostics v_updated_state_count = row_count;

  for v_row in
    select *
    from public.race_stage_weather_exposure_events exposure
    where exposure.simulation_run_id = p_simulation_run_id
      and exposure.stage_id = v_stage_id
      and exposure.rain_jacket_required is true
      and exposure.rain_jacket_used is false
  loop
    select count(*)
    into v_recent_exposure_count
    from public.race_stage_weather_exposure_events previous
    where previous.rider_id = v_row.rider_id
      and previous.rain_jacket_required is true
      and previous.rain_jacket_used is false
      and previous.stage_date >= v_stage_date - interval '14 days';

    v_roll := abs(hashtext(v_row.rider_id::text || '-' || v_stage_id::text || '-weather-illness')) % 100;

    if v_recent_exposure_count >= 2
       and v_roll < (45 * public.health_get_medical_center_risk_multiplier_v1(v_row.team_id)) then
      begin
        v_health_result := public.create_rider_health_case(
          v_row.rider_id,
          'illness',
          'Cold / rain exposure illness',
          'Rider became ill after repeated cold or rainy stages without rain jackets.',
          'active',
          v_stage_date + 1,
          3,
          10,
          2::smallint
        );

        update public.race_stage_weather_exposure_events
        set illness_case_created = true,
            illness_case_result = v_health_result,
            updated_at = now()
        where id = v_row.id;

        v_illness_count := v_illness_count + 1;
      exception when others then
        update public.race_stage_weather_exposure_events
        set illness_case_result = jsonb_build_object(
              'success', false,
              'error', sqlerrm,
              'note', 'Exposure was recorded, but health-case creation failed.'
            ),
            updated_at = now()
        where id = v_row.id;
      end;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'mode', 'rain_jacket_weather_exposure',
    'simulation_run_id', p_simulation_run_id,
    'race_id', v_race_id,
    'stage_id', v_stage_id,
    'weather', v_weather,
    'exposure_rows_upserted', v_inserted_count,
    'updated_state_rows', v_updated_state_count,
    'illness_cases_created', v_illness_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_sprint_zone_replay_motion_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_race_id uuid;
  v_distance_km numeric;
  v_updated_frames integer := 0;
begin
  select
    run.stage_id,
    run.race_id
  into
    v_stage_id,
    v_race_id
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id;

  v_stage_id := coalesce(p_stage_id, v_stage_id);

  if v_stage_id is null then
    raise exception 'Stage not found for simulation run %.', p_simulation_run_id;
  end if;

  select coalesce(distance_km, 0)
  into v_distance_km
  from public.race_stages
  where id = v_stage_id;

  if coalesce(v_distance_km, 0) <= 0 then
    return jsonb_build_object(
      'status', 'skipped_no_stage_distance',
      'mode', 'sprint_zone_replay_motion',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id
    );
  end if;

  /*
   * Replay-only sprint motion.
   *
   * Important:
   * - Updates only frames BEFORE the exact finish line.
   * - Leaves the final finish-line frame untouched.
   * - Uses race_stage_points.km_from_start for intermediate sprint zones.
   * - Does not change official results.
   */
  with sprint_targets as (
    select
      sp.km_from_start::numeric as target_km,
      case
        when lower(coalesce(sp.point_type, '')) like '%sprint%'
          or lower(coalesce(sp.point_type, '')) like '%bonus%'
        then 'intermediate_sprint'
        else 'point'
      end as zone_type
    from public.race_stage_points sp
    where sp.stage_id = v_stage_id
      and coalesce(sp.is_finish_point, false) is false
      and (
        lower(coalesce(sp.point_type, '')) like '%sprint%'
        or lower(coalesce(sp.point_type, '')) like '%bonus%'
      )

    union all

    select
      v_distance_km as target_km,
      'finish'::text as zone_type
  ),
  candidate_frames as (
    select
      f.id,
      f.frame_number,
      f.km_marker,
      f.rider_ids,
      f.rider_names,
      f.team_names,
      f.metadata,
      f.group_code,
      f.group_order,
      z.zone_type,
      z.target_km,
      greatest(
        0::numeric,
        least(
          1::numeric,
          1 - ((z.target_km - f.km_marker) / 2.0)
        )
      ) as zone_progress
    from public.race_stage_replay_frames f
    join lateral (
      select
        st.zone_type,
        st.target_km
      from sprint_targets st
      where f.km_marker >= greatest(0, st.target_km - 2.0)
        and f.km_marker < st.target_km
      order by abs(st.target_km - f.km_marker)
      limit 1
    ) z on true
    where f.simulation_run_id = p_simulation_run_id
      and f.replay_mode = 'road_race'
      and f.entity_type = 'group'
      and f.group_order <= 2
      and cardinality(f.rider_ids) >= 3
  ),
  expanded as (
    select
      cf.*,
      s.idx,
      cf.rider_ids[s.idx] as rider_id,
      cf.rider_names[s.idx] as rider_name,
      cf.team_names[s.idx] as team_name
    from candidate_frames cf
    cross join lateral generate_subscripts(cf.rider_ids, 1) as s(idx)
  ),
  scored as (
    select
      e.*,

      coalesce(
        array_position(ff.rider_ids, e.rider_id),
        st.finish_position,
        e.idx
      )::numeric as target_finish_order,

      coalesce(ri.sprint, 50)::numeric as sprint_skill,
      coalesce(ri.flat, 50)::numeric as flat_skill,
      coalesce(ri.race_iq, 50)::numeric as race_iq_skill,
      coalesce(ri.endurance, 50)::numeric as endurance_skill,
      coalesce(ri.morale, 50)::numeric as morale_value,

      (
        coalesce(ri.sprint, 50)::numeric * 1.20
        + coalesce(ri.flat, 50)::numeric * 0.25
        + coalesce(ri.race_iq, 50)::numeric * 0.25
        + coalesce(ri.endurance, 50)::numeric * 0.10
        + coalesce(ri.morale, 50)::numeric * 0.05
        + case
            when lower(coalesce(st.role_code, ri.role_code, '')) like '%sprinter%' then 8
            when lower(coalesce(st.role_code, ri.role_code, '')) like '%lead%' then 5
            when lower(coalesce(st.role_code, ri.role_code, '')) like '%leader%' then 3
            else 0
          end
        + (
          (
            ('x' || substr(md5(e.rider_id::text || ':' || e.frame_number::text), 1, 8))::bit(32)::bigint
          ) % 11
        )::numeric / 10.0
      ) as sprint_battle_score
    from expanded e
    left join public.race_engine_get_stage_rider_inputs_v1(v_stage_id) ri
      on ri.rider_id = e.rider_id
    left join public.race_stage_rider_states st
      on st.simulation_run_id = p_simulation_run_id
     and st.rider_id = e.rider_id
    left join lateral (
      select
        f2.rider_ids
      from public.race_stage_replay_frames f2
      where f2.simulation_run_id = p_simulation_run_id
        and f2.group_code = e.group_code
        and f2.entity_type = 'group'
        and f2.replay_mode = 'road_race'
        and f2.km_marker <= v_distance_km
      order by f2.km_marker desc, f2.frame_number desc
      limit 1
    ) ff on true
  ),
  motion as (
    select
      s.*,
      case
        when s.zone_type = 'finish' then
          (
            ((10000 - s.idx * 20)::numeric * greatest(0, 1 - (s.zone_progress * 1.35)))
            +
            ((10000 - s.target_finish_order * 60)::numeric * least(1, s.zone_progress * 1.35))
            +
            (s.sprint_battle_score * 4 * case
              when s.zone_progress between 0.25 and 0.90 then 1
              else 0
            end)
            +
            case
              when s.zone_progress between 0.30 and 0.85 then
                sin((s.idx + s.frame_number) * 1.7)::numeric * 18
              else 0
            end
          )

        else
          (
            ((10000 - s.idx * 20)::numeric * greatest(0, 1 - (s.zone_progress * 1.25)))
            +
            (s.sprint_battle_score * 90 * least(1, s.zone_progress * 1.25))
            +
            case
              when s.zone_progress between 0.25 and 0.90 then
                sin((s.idx + s.frame_number) * 1.9)::numeric * 22
              else 0
            end
          )
      end as replay_motion_score
    from scored s
  ),
  rebuilt as (
    select
      m.id,
      array_agg(m.rider_id order by m.replay_motion_score desc, m.idx asc) as new_rider_ids,
      array_agg(m.rider_name order by m.replay_motion_score desc, m.idx asc) as new_rider_names,
      array_agg(m.team_name order by m.replay_motion_score desc, m.idx asc) as new_team_names,
      jsonb_build_object(
        'sprint_zone_replay_motion_applied', true,
        'sprint_zone_replay_motion_model', 'last_2km_sprint_and_finish_array_reorder_v3',
        'sprint_zone_type', max(m.zone_type),
        'sprint_zone_target_km', max(m.target_km),
        'sprint_zone_progress', max(m.zone_progress),
        'sprint_zone_updated_at', now()
      ) as patch_metadata
    from motion m
    group by m.id
  )
  update public.race_stage_replay_frames f
  set
    rider_ids = r.new_rider_ids,
    rider_names = r.new_rider_names,
    team_names = r.new_team_names,
    metadata = coalesce(f.metadata, '{}'::jsonb) || r.patch_metadata
  from rebuilt r
  where f.id = r.id;

  get diagnostics v_updated_frames = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'mode', 'sprint_zone_replay_motion',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'updated_frames', v_updated_frames
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_breakaway_attack_realism_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_race_id uuid;
  v_distance_km numeric;
  v_previous_stage_id uuid;

  v_existing_first_front_km numeric;
  v_attack_start_km numeric;
  v_attack_established_km numeric;
  v_attack_end_km numeric;

  v_synthetic_front_rows integer := 0;
  v_peloton_split_rows integer := 0;
  v_updated_frames integer := 0;
  v_event_rows integer := 0;
begin
  select
    run.stage_id,
    run.race_id
  into
    v_stage_id,
    v_race_id
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id;

  v_stage_id := coalesce(p_stage_id, v_stage_id);

  if v_stage_id is null then
    raise exception 'Stage not found for simulation run %.', p_simulation_run_id;
  end if;

  select coalesce(distance_km, 0)
  into v_distance_km
  from public.race_stages
  where id = v_stage_id;

  select prev.id
  into v_previous_stage_id
  from public.race_stages cur
  join public.race_stages prev
    on prev.race_id = cur.race_id
   and prev.stage_number < cur.stage_number
  where cur.id = v_stage_id
  order by prev.stage_number desc
  limit 1;

  if coalesce(v_distance_km, 0) <= 0 then
    return jsonb_build_object(
      'status', 'skipped_no_stage_distance',
      'mode', 'breakaway_attack_realism_v1_2_2',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id
    );
  end if;

  /*
   * v1.2 breakaway realism.
   *
   * Adds:
   * - Synthetic early attacks if replay starts as one peloton.
   * - Pulls 4-6 selected riders from main_peloton into front_group.
   * - Creates small early gap around km 8-20.
   *
   * Keeps:
   * - v1.1 GC/points danger logic.
   * - No official result rewrite.
   * - No finish-frame rewrite.
   */

  select min(f.km_marker)
  into v_existing_first_front_km
  from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.replay_mode = 'road_race'
    and f.entity_type = 'group'
    and f.group_code = 'front_group'
    and f.group_order = 1
    and coalesce(f.metadata ->> 'early_attack_created_from_peloton', 'false') <> 'true'
    and coalesce(f.metadata ->> 'breakaway_attack_realism_model', '') not in (
      'early_breakaway_created_from_peloton_v1_2',
      'early_breakaway_created_from_peloton_v1_2_2',
      'early_breakaway_created_from_peloton_v1_2_2'
    )
    and f.km_marker > 5
    and f.km_marker < least(v_distance_km * 0.35, 60);

  /*
   * Deterministic attack timing.
   * Produces realistic early attack attempts without being identical for every stage.
   */
  v_attack_start_km :=
    least(
      greatest(5.0, round((6.0 + ((abs(hashtext(p_simulation_run_id::text)) % 7)::numeric)), 1)),
      greatest(5.0, v_distance_km * 0.12)
    );

  v_attack_established_km := v_attack_start_km + 3.5;

  v_attack_end_km :=
    least(
      coalesce(v_existing_first_front_km - 0.2, v_attack_start_km + 12.0),
      v_attack_start_km + 14.0,
      greatest(v_attack_start_km + 5.0, v_distance_km * 0.23)
    );

  /*
   * Remove previous synthetic v1.2 front rows if function is rerun.
   */
  delete from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and (
      f.metadata ->> 'early_attack_created_from_peloton' = 'true'
      or f.metadata ->> 'breakaway_attack_realism_model' in (
        'early_breakaway_created_from_peloton_v1_2',
        'early_breakaway_created_from_peloton_v1_2_2',
        'early_breakaway_created_from_peloton_v1_2_2'
      )
    );

  /*
   * Restore peloton rows previously split by v1.2 before rebuilding.
   * This makes reruns much safer.
   */
  update public.race_stage_replay_frames f
  set
    group_order = coalesce(nullif(f.metadata ->> 'early_attack_original_group_order', '')::integer, f.group_order),
    gap_seconds = coalesce(nullif(f.metadata ->> 'early_attack_original_gap_seconds', '')::integer, f.gap_seconds),
    avg_speed_kmh = coalesce(nullif(f.metadata ->> 'early_attack_original_avg_speed_kmh', '')::numeric, f.avg_speed_kmh),
    rider_ids = coalesce(
      (
        select array_agg(value::uuid order by ord)
        from jsonb_array_elements_text(f.metadata -> 'early_attack_original_rider_ids') with ordinality as x(value, ord)
      ),
      f.rider_ids
    ),
    rider_names = coalesce(
      (
        select array_agg(value order by ord)
        from jsonb_array_elements_text(f.metadata -> 'early_attack_original_rider_names') with ordinality as x(value, ord)
      ),
      f.rider_names
    ),
    team_names = coalesce(
      (
        select array_agg(value order by ord)
        from jsonb_array_elements_text(f.metadata -> 'early_attack_original_team_names') with ordinality as x(value, ord)
      ),
      f.team_names
    ),
    metadata =
      coalesce(f.metadata, '{}'::jsonb)
      - 'early_attack_peloton_split_applied'
      - 'early_attack_original_group_order'
      - 'early_attack_original_gap_seconds'
      - 'early_attack_original_avg_speed_kmh'
      - 'early_attack_original_rider_ids'
      - 'early_attack_original_rider_names'
      - 'early_attack_original_team_names'
      - 'early_attack_selected_rider_ids'
      - 'early_attack_gap_seconds'
      - 'early_attack_phase'
      - 'early_attack_created_at'
  where f.simulation_run_id = p_simulation_run_id
    and f.metadata ->> 'early_attack_peloton_split_applied' = 'true';

  /*
   * Create synthetic early front_group rows from main_peloton frames.
   */
  with seed_frame as (
    select f.*
    from public.race_stage_replay_frames f
    where f.simulation_run_id = p_simulation_run_id
      and f.replay_mode = 'road_race'
      and f.entity_type = 'group'
      and f.group_code = 'main_peloton'
      and f.group_order = 1
      and f.km_marker >= v_attack_start_km
      and f.km_marker < v_attack_end_km
      and cardinality(f.rider_ids) >= 20
    order by f.km_marker
    limit 1
  ),
  seed_riders as (
    select
      sf.id as seed_frame_id,
      u.rider_id,
      u.ordinality::integer as original_position,
      sf.rider_names[u.ordinality] as rider_name,
      sf.team_names[u.ordinality] as team_name,
      coalesce(ri.endurance, 50)::numeric as endurance_skill,
      coalesce(ri.flat, 50)::numeric as flat_skill,
      coalesce(ri.climbing, 50)::numeric as climbing_skill,
      coalesce(ri.race_iq, 50)::numeric as race_iq_skill,
      coalesce(ri.sprint, 50)::numeric as sprint_skill,
      coalesce(ri.morale, 50)::numeric as morale_value,
      coalesce(ri.role_code, '') as role_code
    from seed_frame sf
    cross join lateral unnest(sf.rider_ids) with ordinality as u(rider_id, ordinality)
    left join public.race_engine_get_stage_rider_inputs_v1(v_stage_id) ri
      on ri.rider_id = u.rider_id
  ),
  selected_attackers as (
    select
      sr.*
    from seed_riders sr
    order by
      /*
       * Prefer breakaway / rouleur / helper style riders.
       * Avoid making pure GC leader selection too dominant.
       */
      (
        sr.endurance_skill * 0.34
        + sr.flat_skill * 0.24
        + sr.race_iq_skill * 0.20
        + sr.climbing_skill * 0.10
        + sr.morale_value * 0.08
        + case
            when lower(sr.role_code) like '%break%' then 14
            when lower(sr.role_code) like '%rouleur%' then 8
            when lower(sr.role_code) like '%helper%' then 5
            when lower(sr.role_code) like '%free%' then 4
            when lower(sr.role_code) like '%leader%' then -8
            when lower(sr.role_code) like '%sprinter%' then -3
            else 0
          end
        + ((abs(hashtext(sr.rider_id::text || ':' || p_simulation_run_id::text)) % 100)::numeric / 20.0)
      ) desc,
      sr.original_position asc
    limit (4 + (abs(hashtext(p_simulation_run_id::text || ':attack_count')) % 3))
  ),
  attacker_arrays as (
    select
      array_agg(sa.rider_id order by sa.original_position) as rider_ids,
      array_agg(sa.rider_name order by sa.original_position) as rider_names,
      array_agg(sa.team_name order by sa.original_position) as team_names,
      jsonb_agg(sa.rider_id order by sa.original_position) as rider_ids_json
    from selected_attackers sa
  ),
  peloton_frames as (
    select
      f.*,
      greatest(
        0::numeric,
        least(1::numeric, (f.km_marker - v_attack_start_km) / greatest(1.0, (v_attack_end_km - v_attack_start_km)))
      ) as attack_progress
    from public.race_stage_replay_frames f
    where f.simulation_run_id = p_simulation_run_id
      and f.replay_mode = 'road_race'
      and f.entity_type = 'group'
      and f.group_code = 'main_peloton'
      and f.group_order = 1
      and f.km_marker >= v_attack_start_km
      and f.km_marker < v_attack_end_km
      and cardinality(f.rider_ids) >= 20
      and exists (select 1 from attacker_arrays aa where cardinality(aa.rider_ids) >= 2)
  ),
  inserted_front as (
    insert into public.race_stage_replay_frames (
      simulation_run_id,
      race_id,
      stage_id,
      frame_number,
      race_seconds,
      km_marker,
      group_code,
      group_label,
      group_order,
      gap_seconds,
      avg_speed_kmh,
      rider_ids,
      rider_names,
      team_names,
      metadata,
      replay_mode,
      entity_type,
      entity_key,
      entity_label
    )
    select
      pf.simulation_run_id,
      pf.race_id,
      pf.stage_id,
      pf.frame_number,
      greatest(0, pf.race_seconds - greatest(3, floor(8 + pf.attack_progress * 35)::integer)) as race_seconds,
      round((pf.km_marker + least(0.85, 0.12 + pf.attack_progress * 0.85))::numeric, 3) as km_marker,
      'front_group'::text as group_code,
      'Front group'::text as group_label,
      1 as group_order,
      0 as gap_seconds,
      round((pf.avg_speed_kmh + 1.20 - (pf.attack_progress * 0.35))::numeric, 2) as avg_speed_kmh,
      aa.rider_ids,
      aa.rider_names,
      aa.team_names,
      coalesce(pf.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'breakaway_attack_realism_applied', true,
        'breakaway_attack_realism_model', 'early_breakaway_created_from_peloton_v1_2_2',
        'early_attack_created_from_peloton', true,
        'early_attack_phase',
          case
            when pf.km_marker < v_attack_established_km then 'attack_attempts'
            else 'early_breakaway_forming'
          end,
        'early_attack_start_km', v_attack_start_km,
        'early_attack_established_km', v_attack_established_km,
        'early_attack_end_km', v_attack_end_km,
        'early_attack_progress', pf.attack_progress,
        'early_attack_selected_rider_ids', aa.rider_ids_json,
        'early_attack_gap_seconds', greatest(3, floor(8 + pf.attack_progress * 35)::integer),
        'early_attack_created_at', now()
      ) as metadata,
      'road_race'::text as replay_mode,
      'group'::text as entity_type,
      'front_group'::text as entity_key,
      'Front group'::text as entity_label
    from peloton_frames pf
    cross join attacker_arrays aa
    returning id
  )
  select count(*) into v_synthetic_front_rows from inserted_front;

  /*
   * Update the original main_peloton rows into group_order 2 and remove attackers.
   */
  with attacker_arrays as (
    select
      array_agg(sa.rider_id order by sa.original_position) as rider_ids,
      jsonb_agg(sa.rider_id order by sa.original_position) as rider_ids_json
    from (
      select
        sr.*
      from (
        select
          sf.id as seed_frame_id,
          u.rider_id,
          u.ordinality::integer as original_position,
          coalesce(ri.endurance, 50)::numeric as endurance_skill,
          coalesce(ri.flat, 50)::numeric as flat_skill,
          coalesce(ri.climbing, 50)::numeric as climbing_skill,
          coalesce(ri.race_iq, 50)::numeric as race_iq_skill,
          coalesce(ri.morale, 50)::numeric as morale_value,
          coalesce(ri.role_code, '') as role_code
        from (
          select f.*
          from public.race_stage_replay_frames f
          where f.simulation_run_id = p_simulation_run_id
            and f.replay_mode = 'road_race'
            and f.entity_type = 'group'
            and f.group_code = 'main_peloton'
            and f.group_order = 1
            and f.km_marker >= v_attack_start_km
            and f.km_marker < v_attack_end_km
            and cardinality(f.rider_ids) >= 20
          order by f.km_marker
          limit 1
        ) sf
        cross join lateral unnest(sf.rider_ids) with ordinality as u(rider_id, ordinality)
        left join public.race_engine_get_stage_rider_inputs_v1(v_stage_id) ri
          on ri.rider_id = u.rider_id
      ) sr
      order by
        (
          sr.endurance_skill * 0.34
          + sr.flat_skill * 0.24
          + sr.race_iq_skill * 0.20
          + sr.climbing_skill * 0.10
          + sr.morale_value * 0.08
          + case
              when lower(sr.role_code) like '%break%' then 14
              when lower(sr.role_code) like '%rouleur%' then 8
              when lower(sr.role_code) like '%helper%' then 5
              when lower(sr.role_code) like '%free%' then 4
              when lower(sr.role_code) like '%leader%' then -8
              when lower(sr.role_code) like '%sprinter%' then -3
              else 0
            end
          + ((abs(hashtext(sr.rider_id::text || ':' || p_simulation_run_id::text)) % 100)::numeric / 20.0)
        ) desc,
        sr.original_position asc
      limit (4 + (abs(hashtext(p_simulation_run_id::text || ':attack_count')) % 3))
    ) sa
  ),
  peloton_frames as (
    select
      f.*,
      greatest(
        0::numeric,
        least(1::numeric, (f.km_marker - v_attack_start_km) / greatest(1.0, (v_attack_end_km - v_attack_start_km)))
      ) as attack_progress
    from public.race_stage_replay_frames f
    where f.simulation_run_id = p_simulation_run_id
      and f.replay_mode = 'road_race'
      and f.entity_type = 'group'
      and f.group_code = 'main_peloton'
      and f.group_order = 1
      and f.km_marker >= v_attack_start_km
      and f.km_marker < v_attack_end_km
      and cardinality(f.rider_ids) >= 20
      and exists (select 1 from attacker_arrays aa where cardinality(aa.rider_ids) >= 2)
  ),
  rebuilt_peloton as (
    select
      pf.id,
      array_agg(x.rider_id order by x.ord) filter (where x.rider_id <> all(aa.rider_ids)) as new_rider_ids,
      array_agg(x.rider_name order by x.ord) filter (where x.rider_id <> all(aa.rider_ids)) as new_rider_names,
      array_agg(x.team_name order by x.ord) filter (where x.rider_id <> all(aa.rider_ids)) as new_team_names,
      pf.attack_progress,
      aa.rider_ids_json
    from peloton_frames pf
    cross join attacker_arrays aa
    cross join lateral unnest(pf.rider_ids, pf.rider_names, pf.team_names)
      with ordinality as x(rider_id, rider_name, team_name, ord)
    group by pf.id, pf.attack_progress, aa.rider_ids_json
  ),
  updated_peloton as (
    update public.race_stage_replay_frames f
    set
      group_order = 2,
      gap_seconds = greatest(3, floor(8 + rp.attack_progress * 35)::integer),
      avg_speed_kmh = round((f.avg_speed_kmh - 0.15)::numeric, 2),
      rider_ids = rp.new_rider_ids,
      rider_names = rp.new_rider_names,
      team_names = rp.new_team_names,
      metadata =
        coalesce(f.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'early_attack_peloton_split_applied', true,
          'early_attack_original_group_order', f.group_order,
          'early_attack_original_gap_seconds', f.gap_seconds,
          'early_attack_original_avg_speed_kmh', f.avg_speed_kmh,
          'early_attack_original_rider_ids', to_jsonb(f.rider_ids),
          'early_attack_original_rider_names', to_jsonb(f.rider_names),
          'early_attack_original_team_names', to_jsonb(f.team_names),
          'early_attack_selected_rider_ids', rp.rider_ids_json,
          'early_attack_gap_seconds', greatest(3, floor(8 + rp.attack_progress * 35)::integer),
          'early_attack_phase',
            case
              when f.km_marker < v_attack_established_km then 'peloton_reacts_to_attacks'
              else 'peloton_controls_early_breakaway'
            end,
          'early_attack_created_at', now()
        )
    from rebuilt_peloton rp
    where f.id = rp.id
      and cardinality(rp.new_rider_ids) >= 10
    returning f.id
  )
  select count(*) into v_peloton_split_rows from updated_peloton;

  /*
   * v1.1 gap/chase logic on top of the new early split.
   */
  with dangerous_riders as (
    select distinct cs.rider_id
    from public.race_classification_standings cs
    where cs.race_id = v_race_id
      and cs.after_stage_id = v_previous_stage_id
      and cs.entity_type = 'rider'
      and cs.rider_id is not null
      and (
        (
          lower(coalesce(cs.classification_type, '')) in (
            'gc',
            'general',
            'general_classification',
            'overall',
            'time'
          )
          and cs.rank <= 10
        )
        or (
          lower(coalesce(cs.classification_type, '')) in (
            'points',
            'sprint',
            'green',
            'points_classification'
          )
          and cs.rank <= 3
        )
      )
  ),
  frames as (
    select
      f.id,
      f.frame_number,
      f.km_marker,
      f.group_code,
      f.group_label,
      f.group_order,
      coalesce(
        nullif(f.metadata ->> 'early_attack_gap_seconds', '')::integer,
        nullif(f.metadata ->> 'breakaway_original_gap_seconds', '')::integer,
        nullif(f.metadata ->> 'late_chase_original_gap_seconds', '')::integer,
        nullif(f.metadata ->> 'late_chase_adjusted_gap_seconds', '')::integer,
        f.gap_seconds,
        0
      ) as base_gap_seconds,
      coalesce(
        nullif(f.metadata ->> 'breakaway_original_avg_speed_kmh', '')::numeric,
        nullif(f.metadata ->> 'late_chase_original_avg_speed_kmh', '')::numeric,
        f.avg_speed_kmh,
        42
      ) as base_avg_speed_kmh,
      f.gap_seconds,
      f.avg_speed_kmh,
      f.rider_ids,
      f.rider_names,
      f.team_names,
      f.metadata,
      greatest(0::numeric, least(1::numeric, f.km_marker / nullif(v_distance_km, 0))) as race_progress
    from public.race_stage_replay_frames f
    where f.simulation_run_id = p_simulation_run_id
      and f.replay_mode = 'road_race'
      and f.entity_type = 'group'
      and f.group_order is not null
      and f.km_marker < v_distance_km
  ),
  front_profile as (
    select
      fr.*,
      (
        select count(*)
        from unnest(fr.rider_ids) as u(rider_id)
        join dangerous_riders dr
          on dr.rider_id = u.rider_id
      ) as dangerous_rider_count,
      cardinality(fr.rider_ids) as group_size
    from frames fr
    where fr.group_order = 1
      and lower(coalesce(fr.group_code, '')) not like '%peloton%'
  ),
  front_adjusted as (
    select
      fp.*,
      case
        when fp.km_marker <= 3 then 'peloton_controlled_start'
        when fp.race_progress <= 0.18 then 'early_attack_attempts'
        when fp.race_progress <= 0.60 then 'breakaway_established'
        when fp.race_progress <= 0.75 then 'peloton_increases_chase'
        else 'late_chase'
      end as breakaway_phase,
      case
        when fp.group_size between 2 and 18 then true
        else false
      end as looks_like_breakaway,
      case
        when fp.dangerous_rider_count > 0 then true
        else false
      end as has_dangerous_rider
    from front_profile fp
  ),
  update_front as (
    update public.race_stage_replay_frames f
    set
      avg_speed_kmh =
        case
          when fa.looks_like_breakaway is false then f.avg_speed_kmh
          when fa.breakaway_phase = 'early_attack_attempts' then round((fa.base_avg_speed_kmh + 0.70)::numeric, 2)
          when fa.breakaway_phase = 'breakaway_established' and fa.has_dangerous_rider is false then round((fa.base_avg_speed_kmh + 0.45)::numeric, 2)
          when fa.breakaway_phase = 'breakaway_established' and fa.has_dangerous_rider is true then round((fa.base_avg_speed_kmh + 0.15)::numeric, 2)
          when fa.breakaway_phase in ('peloton_increases_chase', 'late_chase') then round((fa.base_avg_speed_kmh + 0.10)::numeric, 2)
          else f.avg_speed_kmh
        end,
      metadata =
        (
          coalesce(f.metadata, '{}'::jsonb)
          - 'breakaway_attack_realism_applied'
          - 'breakaway_attack_realism_model'
          - 'breakaway_phase'
          - 'breakaway_group_size'
          - 'breakaway_has_dangerous_rider'
          - 'breakaway_dangerous_rider_count'
          - 'breakaway_effort_hint'
          - 'breakaway_chase_phase'
        )
        || jsonb_build_object(
          'breakaway_attack_realism_applied', true,
          'breakaway_attack_realism_model',
            case
              when f.metadata ->> 'early_attack_created_from_peloton' = 'true'
              then 'early_breakaway_created_from_peloton_v1_2_2'
              else 'early_breakaway_peloton_chase_v1_2_2'
            end,
          'breakaway_original_gap_seconds', fa.base_gap_seconds,
          'breakaway_original_avg_speed_kmh', fa.base_avg_speed_kmh,
          'breakaway_phase', fa.breakaway_phase,
          'breakaway_group_size', fa.group_size,
          'breakaway_has_dangerous_rider', fa.has_dangerous_rider,
          'breakaway_dangerous_rider_count', fa.dangerous_rider_count,
          'breakaway_effort_hint',
            case
              when fa.looks_like_breakaway is false then 'peloton_group'
              when fa.has_dangerous_rider is true then 'peloton_chases_gc_or_points_threat'
              when fa.race_progress <= 0.60 then 'breakaway_works_hard_peloton_controls'
              when fa.race_progress <= 0.75 then 'peloton_begins_chase'
              else 'late_chase'
            end,
          'breakaway_updated_at', now()
        )
    from front_adjusted fa
    where f.id = fa.id
      and fa.looks_like_breakaway is true
    returning f.id
  ),
  chase_groups as (
    select fr.*
    from frames fr
    where fr.group_order between 2 and 4
      and lower(coalesce(fr.group_code, '')) not like '%dropped%'
      and lower(coalesce(fr.group_code, '')) not like '%outside%'
  ),
  update_chasers as (
    update public.race_stage_replay_frames f
    set
      gap_seconds =
        greatest(
          0,
          case
            when cg.metadata ->> 'early_attack_peloton_split_applied' = 'true' then
              cg.base_gap_seconds
            when cg.race_progress <= 0.60 and coalesce(fp.has_dangerous_rider, false) is false then
              cg.base_gap_seconds + least(90, floor(cg.race_progress * 120)::integer)
            when cg.race_progress <= 0.60 and coalesce(fp.has_dangerous_rider, false) is true then
              greatest(1, cg.base_gap_seconds - 5)
            when cg.race_progress > 0.60 and cg.race_progress <= 0.80 then
              greatest(1, cg.base_gap_seconds - floor((cg.race_progress - 0.60) * 80)::integer)
            else
              cg.base_gap_seconds
          end
        ),
      avg_speed_kmh =
        case
          when cg.race_progress > 0.60 and cg.group_order in (2, 3) then round((cg.base_avg_speed_kmh + 0.55)::numeric, 2)
          when cg.race_progress <= 0.60 and cg.group_order in (2, 3) then round((cg.base_avg_speed_kmh - 0.15)::numeric, 2)
          else f.avg_speed_kmh
        end,
      metadata =
        (
          coalesce(f.metadata, '{}'::jsonb)
          - 'breakaway_attack_realism_applied'
          - 'breakaway_attack_realism_model'
          - 'breakaway_phase'
          - 'breakaway_group_size'
          - 'breakaway_has_dangerous_rider'
          - 'breakaway_dangerous_rider_count'
          - 'breakaway_effort_hint'
          - 'breakaway_chase_phase'
        )
        || jsonb_build_object(
          'breakaway_attack_realism_applied', true,
          'breakaway_attack_realism_model', 'early_breakaway_peloton_chase_v1_2_2',
          'breakaway_original_gap_seconds', cg.base_gap_seconds,
          'breakaway_original_avg_speed_kmh', cg.base_avg_speed_kmh,
          'breakaway_chase_phase',
            case
              when cg.race_progress <= 0.60 and coalesce(fp.has_dangerous_rider, false) is false then 'peloton_controls_not_full_chase'
              when cg.race_progress <= 0.60 and coalesce(fp.has_dangerous_rider, false) is true then 'peloton_chases_gc_or_points_threat'
              when cg.race_progress <= 0.80 then 'peloton_increases_chase'
              else 'late_chase'
            end,
          'breakaway_front_group_size', coalesce(fp.group_size, 0),
          'breakaway_has_dangerous_rider', coalesce(fp.has_dangerous_rider, false),
          'breakaway_updated_at', now()
        )
    from chase_groups cg
    left join front_adjusted fp
      on fp.frame_number = cg.frame_number
    where f.id = cg.id
    returning f.id
  )
  select
    (select count(*) from update_front)
    + (select count(*) from update_chasers)
  into v_updated_frames;

  delete from public.race_stage_report_events e
  where e.stage_id = v_stage_id
    and e.metadata ->> 'source' = 'race_engine_apply_breakaway_attack_realism_v1';

  insert into public.race_stage_report_events (
    race_id,
    stage_id,
    event_order,
    km_marker,
    race_time_label,
    event_type,
    title,
    description,
    rider_id,
    team_id,
    rider_name_snapshot,
    team_name_snapshot,
    metadata
  )
  select
    v_race_id,
    v_stage_id,
    610000 + row_number() over (order by x.km_marker)::integer,
    x.km_marker,
    null::text,
    x.event_type,
    x.title,
    x.description,
    null::uuid,
    null::uuid,
    null::text,
    null::text,
    jsonb_build_object(
      'source', 'race_engine_apply_breakaway_attack_realism_v1',
      'simulation_run_id', p_simulation_run_id,
      'model', 'early_breakaway_peloton_chase_v1_2_2',
      'previous_stage_id', v_previous_stage_id
    )
  from (
    select distinct on (bucket)
      bucket,
      km_marker,
      event_type,
      title,
      description
    from (
      select
        1 as bucket,
        f.km_marker,
        'tactical_attack'::text as event_type,
        'Early attacks'::text as title,
        'Several riders attack from the peloton and try to form the day''s breakaway.'::text as description
      from public.race_stage_replay_frames f
      where f.simulation_run_id = p_simulation_run_id
        and (
          f.metadata ->> 'early_attack_created_from_peloton' = 'true'
          or f.metadata ->> 'breakaway_phase' = 'early_attack_attempts'
        )
      order by f.km_marker
      limit 1
    ) a

    union all

    select distinct on (bucket)
      bucket,
      km_marker,
      event_type,
      title,
      description
    from (
      select
        2 as bucket,
        f.km_marker,
        'tactical_breakaway_attempt'::text as event_type,
        'Breakaway established'::text as title,
        case
          when f.metadata ->> 'breakaway_has_dangerous_rider' = 'true'
          then 'The move contains a GC or points threat, so the peloton refuses to give it too much freedom.'
          else 'The breakaway starts working together while the peloton controls the gap without a full chase.'
        end::text as description
      from public.race_stage_replay_frames f
      where f.simulation_run_id = p_simulation_run_id
        and f.metadata ->> 'breakaway_phase' = 'breakaway_established'
      order by f.km_marker
      limit 1
    ) b

    union all

    select distinct on (bucket)
      bucket,
      km_marker,
      event_type,
      title,
      description
    from (
      select
        3 as bucket,
        f.km_marker,
        'tactical_chase'::text as event_type,
        'Peloton increases the chase'::text as title,
        'The bunch begins to lift the pace as the race enters the decisive phase.'::text as description
      from public.race_stage_replay_frames f
      where f.simulation_run_id = p_simulation_run_id
        and f.metadata ->> 'breakaway_chase_phase' = 'peloton_increases_chase'
      order by f.km_marker
      limit 1
    ) c
  ) x;

  get diagnostics v_event_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'mode', 'breakaway_attack_realism_v1_2_2',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'previous_stage_id', v_previous_stage_id,
    'attack_start_km', v_attack_start_km,
    'attack_established_km', v_attack_established_km,
    'attack_end_km', v_attack_end_km,
    'synthetic_front_rows_created', v_synthetic_front_rows,
    'peloton_split_rows_updated', v_peloton_split_rows,
    'updated_frames', v_updated_frames,
    'event_rows_created', v_event_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_normalize_physical_groups_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_merged_frames integer := 0;
  v_deleted_rows integer := 0;
begin
  select coalesce(p_stage_id, run.stage_id)
  into v_stage_id
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id;

  if v_stage_id is null then
    raise exception 'Stage not found for simulation run %.', p_simulation_run_id;
  end if;

  create temp table if not exists pg_temp.physical_group_merge_payload_v4 (
    frame_number integer primary key,
    target_id uuid not null,
    rider_ids uuid[] not null,
    rider_names text[] not null,
    team_names text[] not null,
    deleted_row_ids uuid[] not null
  ) on commit drop;

  truncate table pg_temp.physical_group_merge_payload_v4;

  insert into pg_temp.physical_group_merge_payload_v4 (
    frame_number,
    target_id,
    rider_ids,
    rider_names,
    team_names,
    deleted_row_ids
  )
  with candidate_frames as (
    select
      f.frame_number,

      /*
       * Prefer an existing main_peloton row as the target.
       * If not available, use the first front_group row.
       *
       * No min(uuid), because PostgreSQL does not support it.
       */
      coalesce(
        (
          array_agg(f.id order by f.group_order, f.km_marker desc)
          filter (where f.group_code = 'main_peloton')
        )[1],
        (
          array_agg(f.id order by f.group_order, f.km_marker desc)
          filter (where f.group_code in ('front_group', 'front_group_01'))
        )[1]
      ) as target_id
    from public.race_stage_replay_frames f
    where f.simulation_run_id = p_simulation_run_id
      and f.stage_id = v_stage_id
      and f.replay_mode = 'road_race'
      and f.entity_type = 'group'
    group by f.frame_number
    having
      bool_or(f.group_code in ('front_group', 'front_group_01'))
      and bool_or(
        f.group_code in ('main_peloton', 'chase_group', 'chase_group_02')
        and coalesce(f.gap_seconds, 0) <= 1
      )
  ),
  merge_rows as (
    select
      f.frame_number,
      cf.target_id,
      f.id as merge_row_id,
      f.group_order,
      case
        when f.group_code in ('front_group', 'front_group_01') then 1
        when f.group_code = 'main_peloton' then 2
        when f.group_code in ('chase_group', 'chase_group_02') then 3
        else 9
      end as source_rank
    from candidate_frames cf
    join public.race_stage_replay_frames f
      on f.frame_number = cf.frame_number
     and f.simulation_run_id = p_simulation_run_id
     and f.stage_id = v_stage_id
     and f.replay_mode = 'road_race'
     and f.entity_type = 'group'
    where cf.target_id is not null
      and f.group_code in (
        'front_group',
        'front_group_01',
        'main_peloton',
        'chase_group',
        'chase_group_02'
      )
      and (
        f.group_code in ('front_group', 'front_group_01')
        or coalesce(f.gap_seconds, 0) <= 1
      )
  ),
  raw_members as (
    select
      mr.frame_number,
      mr.target_id,
      mr.merge_row_id,
      mr.group_order,
      mr.source_rank,
      u.rider_id,
      u.ord,
      f.rider_names[u.ord] as rider_name,
      f.team_names[u.ord] as team_name
    from merge_rows mr
    join public.race_stage_replay_frames f
      on f.id = mr.merge_row_id
    cross join lateral unnest(f.rider_ids) with ordinality as u(rider_id, ord)
  ),
  deduped_members as (
    select distinct on (frame_number, rider_id)
      frame_number,
      target_id,
      rider_id,
      rider_name,
      team_name,
      group_order,
      source_rank,
      ord
    from raw_members
    order by
      frame_number,
      rider_id,
      source_rank,
      group_order,
      ord
  ),
  member_payload as (
    select
      frame_number,
      target_id,
      array_agg(rider_id order by source_rank, group_order, ord) as rider_ids,
      array_agg(rider_name order by source_rank, group_order, ord) as rider_names,
      array_agg(team_name order by source_rank, group_order, ord) as team_names
    from deduped_members
    group by frame_number, target_id
  ),
  delete_payload as (
    select
      frame_number,
      target_id,
      coalesce(
        array_agg(distinct merge_row_id) filter (where merge_row_id <> target_id),
        array[]::uuid[]
      ) as deleted_row_ids
    from merge_rows
    group by frame_number, target_id
  )
  select
    mp.frame_number,
    mp.target_id,
    mp.rider_ids,
    mp.rider_names,
    mp.team_names,
    dp.deleted_row_ids
  from member_payload mp
  join delete_payload dp
    on dp.frame_number = mp.frame_number
   and dp.target_id = mp.target_id;

  /*
   * Delete duplicates first, then update target row.
   * This avoids the unique constraint:
   * simulation_run_id + frame_number + group_code.
   */
  delete from public.race_stage_replay_frames f
  using pg_temp.physical_group_merge_payload_v4 payload
  where f.id = any(payload.deleted_row_ids);

  get diagnostics v_deleted_rows = row_count;

  update public.race_stage_replay_frames f
  set
    group_code = 'main_peloton',
    group_label = 'Peloton',
    group_order = 1,
    gap_seconds = 0,
    rider_ids = payload.rider_ids,
    rider_names = payload.rider_names,
    team_names = payload.team_names,
    metadata =
      coalesce(f.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'physical_group_normalized', true,
        'physical_group_normalization_model', 'merge_same_time_front_peloton_v4_no_min_uuid_unique_safe',
        'physical_group_deleted_duplicate_rows', payload.deleted_row_ids,
        'physical_group_normalized_at', now()
      )
  from pg_temp.physical_group_merge_payload_v4 payload
  where f.id = payload.target_id;

  get diagnostics v_merged_frames = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'mode', 'physical_group_normalizer_v4_no_min_uuid_unique_safe',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'merged_frames', v_merged_frames,
    'deleted_duplicate_rows', v_deleted_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_replay_rider_energy_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_distance_km numeric;
  v_fatigue_column text;
  v_updated_frames integer := 0;
begin
  select coalesce(p_stage_id, run.stage_id)
  into v_stage_id
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id;

  if v_stage_id is null then
    raise exception 'Stage not found for simulation run %.', p_simulation_run_id;
  end if;

  select coalesce(nullif(distance_km, 0), 1)
  into v_distance_km
  from public.race_stages
  where id = v_stage_id;

  create temp table if not exists pg_temp.replay_rider_energy_base_v1 (
    rider_id uuid primary key,
    pre_stage_freshness_pct numeric not null
  ) on commit drop;

  truncate table pg_temp.replay_rider_energy_base_v1;

  /*
   * Optional freshness source.
   * This function is safe even if your rider-state table has not yet stored
   * a pre-stage fatigue column: it then falls back to 100% freshness.
   */
  select c.column_name
  into v_fatigue_column
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'race_stage_rider_states'
    and c.column_name in (
      'pre_stage_fatigue',
      'pre_stage_fatigue_pct',
      'starting_fatigue',
      'fatigue_before_stage',
      'fatigue'
    )
  order by array_position(
    array[
      'pre_stage_fatigue',
      'pre_stage_fatigue_pct',
      'starting_fatigue',
      'fatigue_before_stage',
      'fatigue'
    ],
    c.column_name
  )
  limit 1;

  if v_fatigue_column is not null then
    execute format(
      'insert into pg_temp.replay_rider_energy_base_v1 (rider_id, pre_stage_freshness_pct)
       select
         rider_id,
         greatest(0, least(100, 100 - coalesce(%I, 0)::numeric)) as pre_stage_freshness_pct
       from public.race_stage_rider_states
       where stage_id = $1
         and rider_id is not null
       on conflict (rider_id) do update
       set pre_stage_freshness_pct = excluded.pre_stage_freshness_pct',
      v_fatigue_column
    ) using v_stage_id;
  end if;

  with frame_riders as (
    select
      f.id as frame_id,
      f.km_marker::numeric as km_marker,
      f.group_code,
      f.group_order,
      coalesce(f.gap_seconds, 0) as gap_seconds,
      cardinality(f.rider_ids) as group_size,
      u.rider_id,
      u.ordinality::integer as rider_index,
      greatest(
        0::numeric,
        least(1::numeric, f.km_marker::numeric / nullif(v_distance_km, 0))
      ) as stage_progress,
      coalesce(b.pre_stage_freshness_pct, 100) as pre_stage_freshness_pct
    from public.race_stage_replay_frames f
    cross join lateral unnest(f.rider_ids) with ordinality as u(rider_id, ordinality)
    left join pg_temp.replay_rider_energy_base_v1 b
      on b.rider_id = u.rider_id
    where f.simulation_run_id = p_simulation_run_id
      and f.stage_id = v_stage_id
      and f.replay_mode = 'road_race'
      and f.entity_type = 'group'
  ),
  energy_rows as (
    select
      fr.frame_id,
      fr.rider_id,
      fr.pre_stage_freshness_pct,
      greatest(
        0::numeric,
        least(
          100::numeric,
          round(
            fr.stage_progress
            * 52
            * case
                when fr.group_code in ('front_group', 'front_group_01')
                  and fr.group_size between 2 and 18
                  then 1.95
                when fr.group_code like 'chase_group%'
                  then 1.55
                when fr.group_code like 'dropped_group%'
                  then 1.20
                when fr.group_code like 'outside_group%'
                  then 1.25
                else 1.00
              end
            * case
                when fr.rider_index <= 3 then 1.12
                when fr.rider_index <= 7 then 1.05
                else 1.00
              end
          )
        )
      ) as stage_energy_used_pct
    from frame_riders fr
  ),
  frame_energy as (
    select
      er.frame_id,
      jsonb_object_agg(
        er.rider_id::text,
        jsonb_build_object(
          'pre_stage_freshness_pct', er.pre_stage_freshness_pct,
          'live_energy_pct', greatest(
            0::numeric,
            least(
              er.pre_stage_freshness_pct,
              er.pre_stage_freshness_pct - er.stage_energy_used_pct
            )
          ),
          'stage_energy_used_pct', er.stage_energy_used_pct
        )
      ) as rider_energy_v1
    from energy_rows er
    group by er.frame_id
  ),
  updated as (
    update public.race_stage_replay_frames f
    set metadata =
      coalesce(f.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'rider_energy_v1', fe.rider_energy_v1,
        'rider_energy_model', 'replay_rider_energy_v1',
        'rider_energy_updated_at', now()
      )
    from frame_energy fe
    where f.id = fe.frame_id
    returning f.id
  )
  select count(*)
  into v_updated_frames
  from updated;

  return jsonb_build_object(
    'status', 'completed',
    'mode', 'replay_rider_energy_v1',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'fatigue_source_column', v_fatigue_column,
    'updated_frames', v_updated_frames
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_energy_exhaustion_group_drops_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_distance_km numeric;
  v_source_rows_updated integer := 0;
  v_dropped_rows_updated integer := 0;
  v_dropped_rows_inserted integer := 0;
  v_exhausted_rider_frame_rows integer := 0;
begin
  select coalesce(p_stage_id, run.stage_id)
  into v_stage_id
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id;

  if v_stage_id is null then
    raise exception 'Stage not found for simulation run %.', p_simulation_run_id;
  end if;

  
  /*
   * energy_exhaustion_normalizes_green_red_bars_v4
   *
   * Important:
   * - Red bar = pre-stage freshness/readiness, never 0 for race starters.
   * - Green bar = stage-local energy, starts at 100 for every stage.
   * - Exhaustion drops must use corrected stage-local green energy,
   *   not the red pre-stage freshness value.
   */
  
  /*
   * Apply official race-start red freshness:
   * fatigue + race sharpness, clamped 50–100.
   */
  PERFORM public.race_engine_apply_start_freshness_formula_v1(
    p_simulation_run_id,
    v_stage_id
  );

PERFORM public.race_engine_normalize_replay_energy_bars_v1(
    p_simulation_run_id,
    v_stage_id
  );

select coalesce(nullif(distance_km, 0), 1)
  into v_distance_km
  from public.race_stages
  where id = v_stage_id;

  create temp table if not exists pg_temp.energy_exhaustion_rider_moves_v3 (
    source_frame_id uuid not null,
    frame_number integer not null,
    simulation_run_id uuid not null,
    race_id uuid not null,
    stage_id uuid not null,
    race_seconds integer not null,
    source_km_marker numeric not null,
    source_group_order integer not null,
    source_gap_seconds integer not null,
    source_avg_speed_kmh numeric not null,
    rider_id uuid not null,
    rider_name text not null,
    team_name text not null,
    original_position integer not null,
    live_energy_pct numeric not null,
    pre_stage_freshness_pct numeric,
    stage_energy_used_pct numeric,
    target_gap_seconds integer not null,
    target_km_marker numeric not null
  ) on commit drop;

  truncate table pg_temp.energy_exhaustion_rider_moves_v3;

  insert into pg_temp.energy_exhaustion_rider_moves_v3 (
    source_frame_id,
    frame_number,
    simulation_run_id,
    race_id,
    stage_id,
    race_seconds,
    source_km_marker,
    source_group_order,
    source_gap_seconds,
    source_avg_speed_kmh,
    rider_id,
    rider_name,
    team_name,
    original_position,
    live_energy_pct,
    pre_stage_freshness_pct,
    stage_energy_used_pct,
    target_gap_seconds,
    target_km_marker
  )
  with candidate_exhausted_riders as (
    select
      f.id as source_frame_id,
      f.frame_number,
      f.simulation_run_id,
      f.race_id,
      f.stage_id,
      f.race_seconds,
      f.km_marker::numeric as source_km_marker,
      f.group_order as source_group_order,
      coalesce(f.gap_seconds, 0) as source_gap_seconds,
      coalesce(f.avg_speed_kmh, 40)::numeric as source_avg_speed_kmh,
      cardinality(f.rider_ids) as source_group_size,
      rider.rider_id,
      coalesce(f.rider_names[rider.ordinality], 'Rider') as rider_name,
      coalesce(f.team_names[rider.ordinality], '') as team_name,
      rider.ordinality::integer as original_position,
      greatest(
        0,
        least(
          100,
          coalesce(nullif(energy.energy_record ->> 'live_energy_pct', '')::numeric, 100)
        )
      ) as live_energy_pct,
      greatest(
        0,
        least(
          100,
          nullif(energy.energy_record ->> 'pre_stage_freshness_pct', '')::numeric
        )
      ) as pre_stage_freshness_pct,
      greatest(
        0,
        least(
          100,
          nullif(energy.energy_record ->> 'stage_energy_used_pct', '')::numeric
        )
      ) as stage_energy_used_pct
    from public.race_stage_replay_frames f
    cross join lateral unnest(f.rider_ids) with ordinality as rider(rider_id, ordinality)
    cross join lateral (
      select f.metadata -> 'rider_energy_v1' -> rider.rider_id::text as energy_record
    ) energy
    where f.simulation_run_id = p_simulation_run_id
      and f.stage_id = v_stage_id
      and f.replay_mode = 'road_race'
      and f.entity_type = 'group'
      and f.group_order is not null
      and coalesce(f.group_code, '') not like 'dropped_group%'
      and coalesce(f.group_code, '') not like 'outside_group%'
      and f.metadata ? 'rider_energy_v1'
      and energy.energy_record is not null
      and cardinality(f.rider_ids) >= 4
      and f.km_marker::numeric >= 35
      and (v_distance_km - f.km_marker::numeric) > 3
  ),
  ranked_candidates as (
    select
      c.*,
      row_number() over (
        partition by c.source_frame_id
        order by c.live_energy_pct asc, c.original_position asc
      ) as exhaustion_rank
    from candidate_exhausted_riders c
    where (
        c.source_km_marker >= 35
        and c.source_km_marker < 70
        and c.live_energy_pct <= 3
      )
      or (
        c.source_km_marker >= 70
        and c.source_km_marker < 110
        and c.live_energy_pct <= 7
      )
      or (
        c.source_km_marker >= 110
        and c.live_energy_pct <= 12
      )
  ),
  capped_candidates as (
    select *
    from ranked_candidates
    where (
        source_km_marker >= 35
        and source_km_marker < 70
        and exhaustion_rank <= 3
      )
      or (
        source_km_marker >= 70
        and source_km_marker < 110
        and exhaustion_rank <= 6
      )
      or (
        source_km_marker >= 110
        and exhaustion_rank <= 10
      )
  ),
  frame_move_counts as (
    select
      source_frame_id,
      count(*) as exhausted_count,
      max(source_group_size) as source_group_size
    from capped_candidates
    group by source_frame_id
  ),
  eligible_moves as (
    select c.*
    from capped_candidates c
    join frame_move_counts fc
      on fc.source_frame_id = c.source_frame_id
    where fc.source_group_size - fc.exhausted_count >= 2
  )
  select
    source_frame_id,
    frame_number,
    simulation_run_id,
    race_id,
    stage_id,
    race_seconds,
    source_km_marker,
    source_group_order,
    source_gap_seconds,
    source_avg_speed_kmh,
    rider_id,
    rider_name,
    team_name,
    original_position,
    live_energy_pct,
    pre_stage_freshness_pct,
    stage_energy_used_pct,
    greatest(
      source_gap_seconds + 20,
      source_gap_seconds + 20 + floor((10 - greatest(0, least(10, live_energy_pct))) * 6)::integer
    ) as target_gap_seconds,
    greatest(
      0,
      round(
        (
          source_km_marker
          - least(
              2.8,
              greatest(
                0.35,
                (
                  greatest(
                    source_gap_seconds + 20,
                    source_gap_seconds + 20 + floor((10 - greatest(0, least(10, live_energy_pct))) * 6)::integer
                  )::numeric / 75.0
                )
              )
            )
        )::numeric,
        3
      )
    ) as target_km_marker
  from eligible_moves;

  get diagnostics v_exhausted_rider_frame_rows = row_count;

  with rebuilt_source_groups as (
    select
      f.id,
      array_agg(member.rider_id order by member.ordinality)
        filter (where move.rider_id is null) as kept_rider_ids,
      array_agg(member.rider_name order by member.ordinality)
        filter (where move.rider_id is null) as kept_rider_names,
      array_agg(member.team_name order by member.ordinality)
        filter (where move.rider_id is null) as kept_team_names,
      count(move.rider_id) as moved_count,
      min(move.live_energy_pct) as min_live_energy_pct
    from public.race_stage_replay_frames f
    cross join lateral unnest(f.rider_ids, f.rider_names, f.team_names)
      with ordinality as member(rider_id, rider_name, team_name, ordinality)
    left join pg_temp.energy_exhaustion_rider_moves_v3 move
      on move.source_frame_id = f.id
     and move.rider_id = member.rider_id
    where f.simulation_run_id = p_simulation_run_id
      and f.stage_id = v_stage_id
      and exists (
        select 1
        from pg_temp.energy_exhaustion_rider_moves_v3 m
        where m.source_frame_id = f.id
      )
    group by f.id
  ),
  updated_source_groups as (
    update public.race_stage_replay_frames f
    set
      rider_ids = rebuilt.kept_rider_ids,
      rider_names = rebuilt.kept_rider_names,
      team_names = rebuilt.kept_team_names,
      metadata =
        coalesce(f.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'energy_exhaustion_drop_applied', true,
          'energy_exhaustion_drop_model', 'low_energy_riders_fall_behind_v3_progressive_capped',
          'energy_exhaustion_moved_count', rebuilt.moved_count,
          'energy_exhaustion_min_live_energy_pct', rebuilt.min_live_energy_pct,
          'energy_exhaustion_updated_at', now()
        )
    from rebuilt_source_groups rebuilt
    where f.id = rebuilt.id
      and rebuilt.moved_count > 0
      and cardinality(rebuilt.kept_rider_ids) >= 2
    returning f.id
  )
  select count(*)
  into v_source_rows_updated
  from updated_source_groups;

  with target_groups as (
    select distinct on (f.frame_number)
      f.id,
      f.frame_number,
      f.rider_ids
    from public.race_stage_replay_frames f
    where f.simulation_run_id = p_simulation_run_id
      and f.stage_id = v_stage_id
      and f.replay_mode = 'road_race'
      and f.entity_type = 'group'
      and (
        f.group_code like 'dropped_group%'
        or f.group_code like 'outside_group%'
      )
    order by f.frame_number, f.group_order desc, f.gap_seconds desc
  ),
  riders_to_append as (
    select
      tg.id as target_frame_id,
      array_agg(move.rider_id order by move.source_group_order, move.original_position)
        filter (where not move.rider_id = any(tg.rider_ids)) as add_rider_ids,
      array_agg(move.rider_name order by move.source_group_order, move.original_position)
        filter (where not move.rider_id = any(tg.rider_ids)) as add_rider_names,
      array_agg(move.team_name order by move.source_group_order, move.original_position)
        filter (where not move.rider_id = any(tg.rider_ids)) as add_team_names,
      max(move.target_gap_seconds) as target_gap_seconds,
      min(move.target_km_marker) as target_km_marker,
      count(*) filter (where not move.rider_id = any(tg.rider_ids)) as add_count
    from target_groups tg
    join pg_temp.energy_exhaustion_rider_moves_v3 move
      on move.frame_number = tg.frame_number
    group by tg.id, tg.rider_ids
  ),
  updated_drop_groups as (
    update public.race_stage_replay_frames f
    set
      rider_ids = f.rider_ids || append.add_rider_ids,
      rider_names = f.rider_names || append.add_rider_names,
      team_names = f.team_names || append.add_team_names,
      gap_seconds = greatest(f.gap_seconds, append.target_gap_seconds),
      km_marker = least(f.km_marker::numeric, append.target_km_marker),
      avg_speed_kmh = round(greatest(18, coalesce(f.avg_speed_kmh, 40)::numeric * 0.72), 2),
      metadata =
        coalesce(f.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'energy_exhaustion_drop_group', true,
          'energy_exhaustion_drop_model', 'low_energy_riders_fall_behind_v3_progressive_capped',
          'energy_exhaustion_appended_count', append.add_count,
          'energy_exhaustion_updated_at', now()
        )
    from riders_to_append append
    where f.id = append.target_frame_id
      and append.add_count > 0
    returning f.id
  )
  select count(*)
  into v_dropped_rows_updated
  from updated_drop_groups;

  with move_groups as (
    select
      move.frame_number,
      move.simulation_run_id,
      move.race_id,
      move.stage_id,
      max(move.race_seconds) as race_seconds,
      min(move.target_km_marker) as km_marker,
      max(move.target_gap_seconds) as gap_seconds,
      round(greatest(18, avg(move.source_avg_speed_kmh) * 0.70), 2) as avg_speed_kmh,
      array_agg(move.rider_id order by move.source_group_order, move.original_position) as rider_ids,
      array_agg(move.rider_name order by move.source_group_order, move.original_position) as rider_names,
      array_agg(move.team_name order by move.source_group_order, move.original_position) as team_names,
      count(*) as rider_count,
      min(move.live_energy_pct) as min_live_energy_pct
    from pg_temp.energy_exhaustion_rider_moves_v3 move
    where not exists (
      select 1
      from public.race_stage_replay_frames existing
      where existing.simulation_run_id = p_simulation_run_id
        and existing.stage_id = v_stage_id
        and existing.frame_number = move.frame_number
        and existing.replay_mode = 'road_race'
        and existing.entity_type = 'group'
        and (
          existing.group_code like 'dropped_group%'
          or existing.group_code like 'outside_group%'
        )
    )
    group by
      move.frame_number,
      move.simulation_run_id,
      move.race_id,
      move.stage_id
  ),
  max_orders as (
    select
      f.frame_number,
      max(f.group_order) as max_group_order
    from public.race_stage_replay_frames f
    where f.simulation_run_id = p_simulation_run_id
      and f.stage_id = v_stage_id
      and exists (
        select 1
        from move_groups mg
        where mg.frame_number = f.frame_number
      )
    group by f.frame_number
  ),
  inserted_drop_groups as (
    insert into public.race_stage_replay_frames (
      simulation_run_id,
      race_id,
      stage_id,
      frame_number,
      race_seconds,
      km_marker,
      group_code,
      group_label,
      group_order,
      gap_seconds,
      avg_speed_kmh,
      rider_ids,
      rider_names,
      team_names,
      metadata,
      replay_mode,
      entity_type,
      entity_key,
      entity_label
    )
    select
      mg.simulation_run_id,
      mg.race_id,
      mg.stage_id,
      mg.frame_number,
      mg.race_seconds,
      mg.km_marker,
      'dropped_group_energy'::text,
      'Behind group'::text,
      coalesce(mo.max_group_order, 1) + 1,
      mg.gap_seconds,
      mg.avg_speed_kmh,
      mg.rider_ids,
      mg.rider_names,
      mg.team_names,
      jsonb_build_object(
        'energy_exhaustion_drop_group', true,
        'energy_exhaustion_drop_model', 'low_energy_riders_fall_behind_v3_progressive_capped',
        'energy_exhaustion_created_group', true,
        'energy_exhaustion_rider_count', mg.rider_count,
        'energy_exhaustion_min_live_energy_pct', mg.min_live_energy_pct,
        'energy_exhaustion_created_at', now()
      ),
      'road_race'::text,
      'group'::text,
      'dropped_group_energy'::text,
      'Behind group'::text
    from move_groups mg
    left join max_orders mo
      on mo.frame_number = mg.frame_number
    on conflict (simulation_run_id, frame_number, group_code) do nothing
    returning id
  )
  select count(*)
  into v_dropped_rows_inserted
  from inserted_drop_groups;

  
  /*
   * energy_exhaustion_final_energy_metadata_sync_v5
   *
   * After B/dropped groups are created, copy correct rider energy metadata
   * into those rows and normalize red/green again.
   */
  PERFORM public.race_engine_fill_replay_group_energy_metadata_v1(
    p_simulation_run_id,
    v_stage_id
  );

  PERFORM public.race_engine_normalize_replay_energy_bars_v1(
    p_simulation_run_id,
    v_stage_id
  );


  /*
   * Ensure separate physical road groups never display the same time.
   * Different groups must have at least 9 seconds between them.
   */
  PERFORM public.race_engine_enforce_replay_distinct_group_gaps_v1(
    p_simulation_run_id,
    v_stage_id
  );


  /*
   * Sync rider rows from corrected group rows so Stage Standing and profile
   * replay use the same live gaps.
   */
  PERFORM public.race_engine_sync_replay_rider_gaps_from_groups_v1(
    p_simulation_run_id,
    v_stage_id
  );


  /*
   * Empty green-energy riders crack and drop.
   * Riders with live_energy <= 5 cannot remain in active racing groups.
   */
  
  /*
   * Race Preparation supply effect:
   * power gels give limited green-energy support before low-energy crack.
   */
  PERFORM public.race_engine_apply_power_gel_energy_boost_v1(
    p_simulation_run_id,
    v_stage_id
  );


  /*
   * Prevent impossible opening-kilometre green-energy collapse in active road groups.
   * Low red freshness still matters, but it should drain green faster instead of
   * instantly creating early B1 cracks after only a few kilometres.
   */
  PERFORM public.race_engine_apply_early_active_live_energy_floor_v1(
    p_simulation_run_id,
    v_stage_id
  );

PERFORM public.race_engine_apply_low_energy_crack_v1(
    p_simulation_run_id,
    v_stage_id
  );

  /*
   * Created/updated B1 and dropped groups must carry rider-specific energy
   * metadata. The frontend should display real rider energy, not a shared fallback.
   */
  PERFORM public.race_engine_hydrate_dropped_group_energy_metadata_v1(
    p_simulation_run_id,
    v_stage_id
  );

  /*
   * Keep B1/dropped physical km_marker behind the previous road group.
   * A behind group with a larger gap must never render ahead of the peloton.
   */
  PERFORM public.race_engine_normalize_dropped_group_km_marker_v1(
    p_simulation_run_id,
    v_stage_id
  );

  /*
   * Final replay smoothing:
   * green starts at 100 and drains smoothly by stage progress,
   * red freshness, group effort, and behind-group pressure.
   */
  PERFORM public.race_engine_apply_stage_live_energy_smooth_v2(
    p_simulation_run_id,
    v_stage_id
  );

  /*
   * Prevent unrealistic gap bouncing in the replay UI.
   */
  PERFORM public.race_engine_smooth_group_gap_seconds_v1(
    p_simulation_run_id,
    v_stage_id
  );

return jsonb_build_object(
    'status', 'completed',
    'mode', 'energy_exhaustion_group_drops_v3_progressive_capped',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'exhausted_rider_frame_rows', v_exhausted_rider_frame_rows,
    'source_rows_updated', v_source_rows_updated,
    'dropped_rows_updated', v_dropped_rows_updated,
    'dropped_rows_inserted', v_dropped_rows_inserted
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_normalize_replay_energy_bars_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_updated_rows integer := 0;
begin
  /*
   * Energy model v6.1:
   *
   * red   = fixed pre-stage freshness/readiness.
   * green = effective live stage energy.
   *
   * Important:
   * - frame 0 green is always 100.
   * - low red does not reduce green before the race starts.
   * - after effort begins, low red makes green drain faster.
   * - low-red riders in G/breakaway/chase groups are punished more.
   */
  with normalized_frames as (
    select
      rf.id,
      jsonb_object_agg(
        rider_energy.key,
        rider_energy.value
        || jsonb_build_object(
          'pre_stage_freshness_pct', calc.red_freshness,
          'live_energy_pct', calc.effective_green,
          'stage_energy_used_pct', greatest(0, least(100, 100 - calc.effective_green)),
          'energy_model', 'red_weighted_effective_green_v6_1'
        )
      ) as normalized_energy
    from public.race_stage_replay_frames rf
    cross join lateral jsonb_each(coalesce(rf.metadata -> 'rider_energy_v1', '{}'::jsonb)) rider_energy
    cross join lateral (
      select
        case
          when coalesce(rider_energy.value ->> 'pre_stage_freshness_pct', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then (rider_energy.value ->> 'pre_stage_freshness_pct')::numeric
          when coalesce(rider_energy.value ->> 'freshness_pct', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then (rider_energy.value ->> 'freshness_pct')::numeric
          when coalesce(rider_energy.value ->> 'red_pct', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then (rider_energy.value ->> 'red_pct')::numeric
          else 100::numeric
        end as raw_red,

        case
          when coalesce(rider_energy.value ->> 'live_energy_pct', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then (rider_energy.value ->> 'live_energy_pct')::numeric
          when coalesce(rider_energy.value ->> 'green_pct', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then (rider_energy.value ->> 'green_pct')::numeric
          else 100::numeric
        end as raw_green
    ) parsed
    cross join lateral (
      select
        greatest(20, least(100, parsed.raw_red)) as red_freshness,
        greatest(0, least(100, parsed.raw_green)) as green_before_red_weight,

        case
          when lower(coalesce(rf.group_code, '')) = 'main_peloton'
            or lower(coalesce(rf.group_label, '')) in ('p', 'peloton', 'main peloton')
            then 'peloton'

          when lower(coalesce(rf.group_code, '')) like '%dropped%'
            or lower(coalesce(rf.group_code, '')) like '%outside%'
            or lower(coalesce(rf.group_label, '')) ~ '^b[0-9]*$'
            then 'behind'

          when lower(coalesce(rf.group_code, '')) like '%front%'
            or lower(coalesce(rf.group_code, '')) like '%chase%'
            or lower(coalesce(rf.group_label, '')) ~ '^g[0-9]*$'
            then 'front'

          else 'other'
        end as group_energy_role
    ) base
    cross join lateral (
      select
        case
          /*
           * Race start rule:
           * every rider begins the stage with green = 100.
           */
          when rf.frame_number = 0 then 100::numeric

          /*
           * If no stage energy has been used yet, keep green at 100.
           */
          when base.green_before_red_weight >= 99.5 then 100::numeric

          else greatest(
            0,
            least(
              100,
              /*
               * Cap effective green after the race starts.
               * Tired riders cannot look fully powerful after effort begins.
               */
              least(
                base.green_before_red_weight,
                case
                  when base.group_energy_role = 'front'
                    then 20 + (base.red_freshness * 0.62)
                  when base.group_energy_role = 'behind'
                    then 25 + (base.red_freshness * 0.58)
                  when base.group_energy_role = 'peloton'
                    then 45 + (base.red_freshness * 0.55)
                  else 35 + (base.red_freshness * 0.55)
                end
              )
              -
              /*
               * Extra tiredness penalty:
               * Low-red riders in G/front/chase groups pay more.
               */
              case
                when base.group_energy_role = 'front'
                  then greatest(0, (60 - base.red_freshness) / 8)
                when base.group_energy_role = 'behind'
                  then greatest(0, (55 - base.red_freshness) / 10)
                when base.group_energy_role = 'peloton'
                  then greatest(0, (45 - base.red_freshness) / 14)
                else greatest(0, (50 - base.red_freshness) / 12)
              end
            )
          )
        end as effective_green,
        base.red_freshness
    ) calc
    where rf.simulation_run_id = p_simulation_run_id
      and (p_stage_id is null or rf.stage_id = p_stage_id)
      and rf.metadata ? 'rider_energy_v1'
    group by rf.id
  )
  update public.race_stage_replay_frames rf
  set metadata =
    jsonb_set(
      coalesce(rf.metadata, '{}'::jsonb),
      '{rider_energy_v1}',
      nf.normalized_energy,
      true
    )
  from normalized_frames nf
  where rf.id = nf.id
    and nf.normalized_energy is not null;

  get diagnostics v_updated_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'mode', 'red_weighted_effective_green_v6_1',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', p_stage_id,
    'updated_rows', v_updated_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_fill_replay_group_energy_metadata_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_updated_frames integer := 0;
begin
  select coalesce(p_stage_id, run.stage_id)
  into v_stage_id
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id;

  if v_stage_id is null then
    raise exception 'Stage not found for simulation run %.', p_simulation_run_id;
  end if;

  with frame_rider_energy_source as (
    select
      f.frame_number,
      e.key as rider_id_text,
      e.value as energy_record
    from public.race_stage_replay_frames f
    cross join lateral jsonb_each(f.metadata -> 'rider_energy_v1') e
    where f.simulation_run_id = p_simulation_run_id
      and f.stage_id = v_stage_id
      and f.replay_mode = 'road_race'
      and f.entity_type = 'group'
      and f.metadata ? 'rider_energy_v1'
  ),
  target_frame_riders as (
    select
      f.id as frame_id,
      f.frame_number,
      rider.rider_id::text as rider_id_text
    from public.race_stage_replay_frames f
    cross join lateral unnest(f.rider_ids) as rider(rider_id)
    where f.simulation_run_id = p_simulation_run_id
      and f.stage_id = v_stage_id
      and f.replay_mode = 'road_race'
      and f.entity_type = 'group'
  ),
  rebuilt_energy as (
    select
      t.frame_id,
      jsonb_object_agg(
        t.rider_id_text,
        coalesce(
          existing.energy_record,
          source.energy_record,
          jsonb_build_object(
            'pre_stage_freshness_pct', 20,
            'live_energy_pct', 100,
            'stage_energy_used_pct', 0
          )
        )
      ) as rider_energy_v1
    from target_frame_riders t
    join public.race_stage_replay_frames f
      on f.id = t.frame_id
    left join lateral (
      select f.metadata -> 'rider_energy_v1' -> t.rider_id_text as energy_record
    ) existing on true
    left join frame_rider_energy_source source
      on source.frame_number = t.frame_number
     and source.rider_id_text = t.rider_id_text
    group by t.frame_id
  ),
  updated_frames as (
    update public.race_stage_replay_frames f
    set metadata =
      coalesce(f.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'rider_energy_v1', rebuilt.rider_energy_v1,
        'rider_energy_metadata_filled', true,
        'rider_energy_metadata_fill_model', 'fill_missing_group_energy_v1',
        'rider_energy_metadata_filled_at', now()
      )
    from rebuilt_energy rebuilt
    where f.id = rebuilt.frame_id
    returning f.id
  )
  select count(*)
  into v_updated_frames
  from updated_frames;

  return jsonb_build_object(
    'status', 'completed',
    'mode', 'fill_missing_group_energy_v1',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'updated_frames', v_updated_frames
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_rewarded_ad_status_v1()
 RETURNS TABLE(reward_date date, provider text, completed_ads_today integer, daily_ad_limit integer, reward_bundle_size integer, reward_coins_per_bundle integer, coins_granted_today integer, progress_ads_in_current_bundle integer, ads_needed_for_next_coin integer, can_watch boolean, cooldown_seconds integer, wait_seconds integer, next_ad_unlock_at timestamp with time zone, remaining_ads_today integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_reward_date date := ((now() at time zone 'utc')::date);
  v_cfg public.rewarded_ad_settings%rowtype;

  v_completed integer := 0;
  v_coins_granted integer := 0;
  v_last_completed_at timestamptz := null;
  v_unlock_at timestamptz := null;
  v_wait_seconds integer := 0;
  v_progress integer := 0;
  v_needed integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select *
  into v_cfg
  from public.rewarded_ad_settings
  where setting_key = 'google_rewarded_v1'
    and active = true;

  if not found then
    raise exception 'Rewarded ad settings are not active';
  end if;

  insert into public.user_rewarded_ad_daily_progress (
    user_id,
    reward_date,
    completed_ads,
    coins_granted
  )
  values (
    v_user_id,
    v_reward_date,
    0,
    0
  )
  on conflict (user_id, reward_date) do nothing;

  select
    p.completed_ads,
    p.coins_granted,
    p.last_ad_completed_at
  into
    v_completed,
    v_coins_granted,
    v_last_completed_at
  from public.user_rewarded_ad_daily_progress p
  where p.user_id = v_user_id
    and p.reward_date = v_reward_date;

  if v_last_completed_at is not null then
    v_unlock_at := v_last_completed_at + make_interval(secs => v_cfg.cooldown_seconds);

    if v_unlock_at > now() then
      v_wait_seconds := greatest(ceil(extract(epoch from (v_unlock_at - now())))::integer, 0);
    end if;
  end if;

  v_progress := v_completed % v_cfg.reward_bundle_size;

  if v_completed >= v_cfg.daily_ad_limit then
    v_needed := 0;
  elsif v_progress = 0 then
    v_needed := v_cfg.reward_bundle_size;
  else
    v_needed := v_cfg.reward_bundle_size - v_progress;
  end if;

  return query
  select
    v_reward_date,
    v_cfg.provider::text,
    v_completed,
    v_cfg.daily_ad_limit,
    v_cfg.reward_bundle_size,
    v_cfg.reward_coins_per_bundle,
    v_coins_granted,
    v_progress,
    v_needed,
    (v_completed < v_cfg.daily_ad_limit and v_wait_seconds = 0),
    v_cfg.cooldown_seconds,
    v_wait_seconds,
    v_unlock_at,
    greatest(v_cfg.daily_ad_limit - v_completed, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_enforce_replay_distinct_group_gaps_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_updated_group_rows integer := 0;
  v_synced_rider_rows integer := 0;
  v_sync_result jsonb;
begin
  /*
   * Semantic road group ordering:
   *
   * G/front/chase groups = ahead of peloton
   * P/main_peloton      = peloton
   * B/dropped/outside   = behind peloton
   *
   * This fixes cases where B1 and P visually separate on the profile
   * but still show the same time in Stage Standing.
   */
  with recursive ordered_groups as (
    select
      rf.id,
      rf.frame_number,
      rf.group_code,
      rf.group_label,
      coalesce(rf.group_order, 999) as old_group_order,
      coalesce(rf.gap_seconds, 0) as old_gap_seconds,
      row_number() over (
        partition by rf.frame_number
        order by
          case
            when lower(coalesce(rf.group_code, '')) = 'main_peloton'
              or lower(coalesce(rf.group_label, '')) in ('p', 'peloton', 'main peloton')
              then 500

            when lower(coalesce(rf.group_code, '')) like '%dropped%'
              or lower(coalesce(rf.group_code, '')) like '%outside%'
              or lower(coalesce(rf.group_label, '')) ~ '^b[0-9]*$'
              then 700 + coalesce(rf.group_order, 999)

            when lower(coalesce(rf.group_code, '')) like '%front%'
              or lower(coalesce(rf.group_code, '')) like '%chase%'
              or lower(coalesce(rf.group_label, '')) ~ '^g[0-9]*$'
              then 100 + coalesce(rf.group_order, 999)

            else 400 + coalesce(rf.group_order, 999)
          end,
          coalesce(rf.gap_seconds, 0),
          rf.id
      ) as semantic_rank
    from public.race_stage_replay_frames rf
    where rf.simulation_run_id = p_simulation_run_id
      and (p_stage_id is null or rf.stage_id = p_stage_id)
      and rf.replay_mode = 'road_race'
      and rf.entity_type = 'group'
  ),
  enforced_groups as (
    select
      og.id,
      og.frame_number,
      og.semantic_rank,
      0::integer as enforced_gap_seconds
    from ordered_groups og
    where og.semantic_rank = 1

    union all

    select
      og.id,
      og.frame_number,
      og.semantic_rank,
      greatest(
        og.old_gap_seconds,
        eg.enforced_gap_seconds + 9
      )::integer as enforced_gap_seconds
    from ordered_groups og
    join enforced_groups eg
      on eg.frame_number = og.frame_number
     and eg.semantic_rank = og.semantic_rank - 1
  )
  update public.race_stage_replay_frames rf
  set
    group_order = eg.semantic_rank,
    gap_seconds = eg.enforced_gap_seconds,
    metadata = coalesce(rf.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'semantic_group_gap_enforced_v2', true,
        'semantic_group_order', eg.semantic_rank,
        'semantic_group_gap_seconds', eg.enforced_gap_seconds
      )
  from enforced_groups eg
  where rf.id = eg.id
    and (
      rf.group_order is distinct from eg.semantic_rank
      or rf.gap_seconds is distinct from eg.enforced_gap_seconds
    );

  get diagnostics v_updated_group_rows = row_count;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'race_engine_sync_replay_rider_gaps_from_groups_v1'
  ) then
    select public.race_engine_sync_replay_rider_gaps_from_groups_v1(
      p_simulation_run_id,
      p_stage_id
    )
    into v_sync_result;

    v_synced_rider_rows :=
      coalesce((v_sync_result ->> 'updated_rows')::integer, 0);
  end if;

  return jsonb_build_object(
    'status', 'completed',
    'mode', 'semantic_group_gap_order_v2',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', p_stage_id,
    'updated_group_rows', v_updated_group_rows,
    'synced_rider_rows', v_synced_rider_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rotate_rewarded_ad_edge_token_v1()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_token text;
begin
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.rewarded_ad_private_settings (
    setting_key,
    edge_token_hash,
    updated_at
  )
  values (
    'google_rewarded_v1',
    extensions.crypt(v_token, extensions.gen_salt('bf')),
    now()
  )
  on conflict (setting_key) do update
  set
    edge_token_hash = excluded.edge_token_hash,
    updated_at = now();

  return v_token;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rewarded_ad_assert_edge_token_v1(p_edge_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_hash text;
  v_token text;
begin
  v_token := trim(coalesce(p_edge_token, ''));

  if length(v_token) < 20 then
    raise exception 'Forbidden rewarded ad edge token' using errcode = '28000';
  end if;

  select edge_token_hash
  into v_hash
  from public.rewarded_ad_private_settings
  where setting_key = 'google_rewarded_v1';

  if v_hash is null or v_hash <> extensions.crypt(v_token, v_hash) then
    raise exception 'Forbidden rewarded ad edge token' using errcode = '28000';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_rewarded_ad_session_v1(p_user_id uuid, p_edge_token text, p_ad_unit_code text DEFAULT 'rewarded_header_v1'::text, p_ip_hash text DEFAULT NULL::text, p_user_agent_hash text DEFAULT NULL::text)
 RETURNS TABLE(can_start boolean, session_key text, reason text, wait_seconds integer, completed_ads_today integer, daily_ad_limit integer, ads_needed_for_next_coin integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_user_id uuid := p_user_id;
  v_reward_date date := ((now() at time zone 'utc')::date);
  v_cfg public.rewarded_ad_settings%rowtype;

  v_completed integer := 0;
  v_last_completed_at timestamptz := null;
  v_unlock_at timestamptz := null;
  v_wait_seconds integer := 0;
  v_needed integer := 0;
  v_session_key text;
  v_ip_completed integer := 0;
  v_active_started integer := 0;
begin
  perform public.rewarded_ad_assert_edge_token_v1(p_edge_token);

  if v_user_id is null then
    raise exception 'Missing user_id' using errcode = '28000';
  end if;

  if not exists (select 1 from auth.users u where u.id = v_user_id) then
    raise exception 'Invalid user_id' using errcode = '28000';
  end if;

  select *
  into v_cfg
  from public.rewarded_ad_settings
  where setting_key = 'google_rewarded_v1'
    and active = true;

  if not found then
    raise exception 'Rewarded ad settings are not active';
  end if;

  insert into public.user_rewarded_ad_daily_progress (
    user_id,
    reward_date,
    completed_ads,
    coins_granted
  )
  values (
    v_user_id,
    v_reward_date,
    0,
    0
  )
  on conflict (user_id, reward_date) do nothing;

  select
    p.completed_ads,
    p.last_ad_completed_at
  into
    v_completed,
    v_last_completed_at
  from public.user_rewarded_ad_daily_progress p
  where p.user_id = v_user_id
    and p.reward_date = v_reward_date
  for update;

  if v_completed >= v_cfg.daily_ad_limit then
    return query
    select false, null::text, 'daily_limit_reached'::text, 0, v_completed, v_cfg.daily_ad_limit, 0;
    return;
  end if;

  if v_last_completed_at is not null then
    v_unlock_at := v_last_completed_at + make_interval(secs => v_cfg.cooldown_seconds);

    if v_unlock_at > now() then
      v_wait_seconds := greatest(ceil(extract(epoch from (v_unlock_at - now())))::integer, 0);

      v_needed :=
        case
          when (v_completed % v_cfg.reward_bundle_size) = 0 then v_cfg.reward_bundle_size
          else v_cfg.reward_bundle_size - (v_completed % v_cfg.reward_bundle_size)
        end;

      return query
      select false, null::text, 'cooldown_active'::text, v_wait_seconds, v_completed, v_cfg.daily_ad_limit, v_needed;
      return;
    end if;
  end if;

  select count(*)
  into v_active_started
  from public.user_rewarded_ad_events e
  where e.user_id = v_user_id
    and e.reward_date = v_reward_date
    and e.status = 'started'
    and e.created_at >= now() - make_interval(mins => v_cfg.session_ttl_minutes);

  if v_active_started > 0 then
    v_needed :=
      case
        when (v_completed % v_cfg.reward_bundle_size) = 0 then v_cfg.reward_bundle_size
        else v_cfg.reward_bundle_size - (v_completed % v_cfg.reward_bundle_size)
      end;

    return query
    select false, null::text, 'active_session_exists'::text, 0, v_completed, v_cfg.daily_ad_limit, v_needed;
    return;
  end if;

  if p_ip_hash is not null and length(trim(p_ip_hash)) > 0 then
    select count(*)
    into v_ip_completed
    from public.user_rewarded_ad_events e
    where e.provider = v_cfg.provider
      and e.reward_date = v_reward_date
      and e.ip_hash = trim(p_ip_hash)
      and e.status in ('completed', 'rewarded');

    if v_ip_completed >= v_cfg.daily_ip_limit then
      v_needed :=
        case
          when (v_completed % v_cfg.reward_bundle_size) = 0 then v_cfg.reward_bundle_size
          else v_cfg.reward_bundle_size - (v_completed % v_cfg.reward_bundle_size)
        end;

      return query
      select false, null::text, 'ip_daily_limit_reached'::text, 0, v_completed, v_cfg.daily_ad_limit, v_needed;
      return;
    end if;
  end if;

  v_session_key := 'gam_' || replace(gen_random_uuid()::text, '-', '');

  insert into public.user_rewarded_ad_events (
    user_id,
    provider,
    reward_date,
    status,
    ad_unit_code,
    session_key,
    ip_hash,
    user_agent_hash,
    reward_bundle_size,
    reward_coins_per_bundle,
    payload_json
  )
  values (
    v_user_id,
    v_cfg.provider,
    v_reward_date,
    'started',
    coalesce(nullif(trim(p_ad_unit_code), ''), 'rewarded_header_v1'),
    v_session_key,
    nullif(trim(coalesce(p_ip_hash, '')), ''),
    nullif(trim(coalesce(p_user_agent_hash, '')), ''),
    v_cfg.reward_bundle_size,
    v_cfg.reward_coins_per_bundle,
    jsonb_build_object(
      'source', 'start_rewarded_ad_session_v1_edge',
      'setting_key', v_cfg.setting_key
    )
  );

  v_needed :=
    case
      when (v_completed % v_cfg.reward_bundle_size) = 0 then v_cfg.reward_bundle_size
      else v_cfg.reward_bundle_size - (v_completed % v_cfg.reward_bundle_size)
    end;

  return query
  select true, v_session_key, 'ok'::text, 0, v_completed, v_cfg.daily_ad_limit, v_needed;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_rewarded_ad_session_v1(p_user_id uuid, p_edge_token text, p_session_key text, p_provider_event_id text DEFAULT NULL::text, p_payload_json jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(success boolean, reason text, coin_delta integer, completed_ads_today integer, coins_granted_today integer, ads_needed_for_next_coin integer, balance integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
declare
  v_user_id uuid := p_user_id;
  v_cfg public.rewarded_ad_settings%rowtype;
  v_event public.user_rewarded_ad_events%rowtype;

  v_completed integer := 0;
  v_coins_granted integer := 0;
  v_new_completed integer := 0;
  v_bundle_index integer := 0;
  v_coin_delta integer := 0;
  v_final_coin_delta integer := 0;
  v_balance integer := 0;
  v_needed integer := 0;
  v_status text := 'completed';
begin
  perform public.rewarded_ad_assert_edge_token_v1(p_edge_token);

  if v_user_id is null then
    raise exception 'Missing user_id' using errcode = '28000';
  end if;

  if p_session_key is null or length(trim(p_session_key)) = 0 then
    return query select false, 'missing_session_key'::text, 0, 0, 0, 0, 0;
    return;
  end if;

  select *
  into v_cfg
  from public.rewarded_ad_settings
  where setting_key = 'google_rewarded_v1'
    and active = true;

  if not found then
    raise exception 'Rewarded ad settings are not active';
  end if;

  select *
  into v_event
  from public.user_rewarded_ad_events e
  where e.session_key = trim(p_session_key)
    and e.user_id = v_user_id
  for update;

  if not found then
    return query select false, 'invalid_session'::text, 0, 0, 0, 0, 0;
    return;
  end if;

  if v_event.status <> 'started' then
    select coalesce(w.balance, 0)
    into v_balance
    from public.user_wallets w
    where w.user_id = v_user_id;

    return query
    select false, 'already_processed'::text, 0,
      coalesce((select p.completed_ads from public.user_rewarded_ad_daily_progress p where p.user_id = v_user_id and p.reward_date = v_event.reward_date), 0),
      coalesce((select p.coins_granted from public.user_rewarded_ad_daily_progress p where p.user_id = v_user_id and p.reward_date = v_event.reward_date), 0),
      0,
      coalesce(v_balance, 0);
    return;
  end if;

  if v_event.created_at < now() - make_interval(mins => v_cfg.session_ttl_minutes) then
    update public.user_rewarded_ad_events
    set
      status = 'failed',
      failed_at = now(),
      payload_json = coalesce(payload_json, '{}'::jsonb)
        || jsonb_build_object('failure_reason', 'session_expired')
    where id = v_event.id;

    return query select false, 'session_expired'::text, 0, 0, 0, 0, 0;
    return;
  end if;

  if p_provider_event_id is not null
     and length(trim(p_provider_event_id)) > 0
     and exists (
       select 1
       from public.user_rewarded_ad_events e
       where e.provider = v_cfg.provider
         and e.provider_event_id = trim(p_provider_event_id)
         and e.id <> v_event.id
     ) then
    update public.user_rewarded_ad_events
    set
      status = 'failed',
      failed_at = now(),
      provider_event_id = trim(p_provider_event_id),
      payload_json = coalesce(payload_json, '{}'::jsonb)
        || jsonb_build_object('failure_reason', 'duplicate_provider_event_id')
    where id = v_event.id;

    return query select false, 'duplicate_provider_event_id'::text, 0, 0, 0, 0, 0;
    return;
  end if;

  insert into public.user_rewarded_ad_daily_progress (
    user_id,
    reward_date,
    completed_ads,
    coins_granted
  )
  values (
    v_user_id,
    v_event.reward_date,
    0,
    0
  )
  on conflict (user_id, reward_date) do nothing;

  select
    p.completed_ads,
    p.coins_granted
  into
    v_completed,
    v_coins_granted
  from public.user_rewarded_ad_daily_progress p
  where p.user_id = v_user_id
    and p.reward_date = v_event.reward_date
  for update;

  if v_completed >= v_cfg.daily_ad_limit then
    update public.user_rewarded_ad_events
    set
      status = 'failed',
      failed_at = now(),
      provider_event_id = nullif(trim(coalesce(p_provider_event_id, '')), ''),
      payload_json = coalesce(payload_json, '{}'::jsonb)
        || jsonb_build_object('failure_reason', 'daily_limit_reached_on_complete')
    where id = v_event.id;

    select coalesce(w.balance, 0)
    into v_balance
    from public.user_wallets w
    where w.user_id = v_user_id;

    return query
    select false, 'daily_limit_reached'::text, 0, v_completed, v_coins_granted, 0, coalesce(v_balance, 0);
    return;
  end if;

  v_new_completed := v_completed + 1;

  if (v_new_completed % v_cfg.reward_bundle_size) = 0 then
    v_bundle_index := v_new_completed / v_cfg.reward_bundle_size;
    v_coin_delta := v_cfg.reward_coins_per_bundle;

    insert into public.user_rewarded_ad_coin_grants (
      user_id,
      reward_date,
      bundle_index,
      coins,
      event_id
    )
    values (
      v_user_id,
      v_event.reward_date,
      v_bundle_index,
      v_coin_delta,
      v_event.id
    )
    on conflict (user_id, reward_date, bundle_index) do nothing
    returning coins into v_final_coin_delta;

    v_final_coin_delta := coalesce(v_final_coin_delta, 0);
  else
    v_final_coin_delta := 0;
  end if;

  insert into public.user_wallets (
    user_id,
    balance
  )
  values (
    v_user_id,
    0
  )
  on conflict (user_id) do nothing;

  if v_final_coin_delta > 0 then
    insert into public.user_coin_ledger (
      user_id,
      delta,
      reason,
      payload_json
    )
    values (
      v_user_id,
      v_final_coin_delta,
      'rewarded_ad',
      jsonb_build_object(
        'system_key',
        'rewarded_ad_' || v_event.reward_date::text || '_bundle_' || v_bundle_index::text,
        'provider',
        v_cfg.provider,
        'event_id',
        v_event.id,
        'session_key',
        v_event.session_key,
        'completed_ads_today',
        v_new_completed,
        'bundle_index',
        v_bundle_index,
        'bundle_size',
        v_cfg.reward_bundle_size,
        'reward_coins_per_bundle',
        v_cfg.reward_coins_per_bundle
      )
    );

    update public.user_wallets w
    set balance = w.balance + v_final_coin_delta
    where w.user_id = v_user_id;

    v_status := 'rewarded';
  else
    v_status := 'completed';
  end if;

  update public.user_rewarded_ad_daily_progress
  set
    completed_ads = v_new_completed,
    coins_granted = coins_granted + v_final_coin_delta,
    last_ad_completed_at = now(),
    updated_at = now()
  where user_id = v_user_id
    and reward_date = v_event.reward_date
  returning coins_granted into v_coins_granted;

  update public.user_rewarded_ad_events
  set
    status = v_status,
    completed_at = now(),
    rewarded_at = case when v_final_coin_delta > 0 then now() else rewarded_at end,
    provider_event_id = nullif(trim(coalesce(p_provider_event_id, '')), ''),
    payload_json = coalesce(payload_json, '{}'::jsonb)
      || coalesce(p_payload_json, '{}'::jsonb)
      || jsonb_build_object(
        'source', 'complete_rewarded_ad_session_v1_edge',
        'coin_delta', v_final_coin_delta,
        'completed_ads_today', v_new_completed
      )
  where id = v_event.id;

  select coalesce(w.balance, 0)
  into v_balance
  from public.user_wallets w
  where w.user_id = v_user_id;

  if v_new_completed >= v_cfg.daily_ad_limit then
    v_needed := 0;
  elsif (v_new_completed % v_cfg.reward_bundle_size) = 0 then
    v_needed := v_cfg.reward_bundle_size;
  else
    v_needed := v_cfg.reward_bundle_size - (v_new_completed % v_cfg.reward_bundle_size);
  end if;

  return query
  select true, 'ok'::text, v_final_coin_delta, v_new_completed, v_coins_granted, v_needed, coalesce(v_balance, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_sync_replay_rider_gaps_from_groups_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_updated_rows integer := 0;
begin
  /*
   * After group-gap enforcement, rider rows must inherit the corrected
   * group gap/order. Otherwise the profile marker can show B1 behind P,
   * while the Stage Standing still shows B1 with the same time as P.
   */
  with group_rows as (
    select
      rf.simulation_run_id,
      rf.stage_id,
      rf.frame_number,
      rf.group_code,
      rf.group_label,
      rf.group_order,
      rf.gap_seconds
    from public.race_stage_replay_frames rf
    where rf.simulation_run_id = p_simulation_run_id
      and (p_stage_id is null or rf.stage_id = p_stage_id)
      and rf.replay_mode = 'road_race'
      and rf.entity_type = 'group'
      and rf.group_code is not null
  )
  update public.race_stage_replay_frames rider_rf
  set
    group_order = gr.group_order,
    group_label = coalesce(gr.group_label, rider_rf.group_label),
    gap_seconds = gr.gap_seconds,
    metadata = coalesce(rider_rf.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'rider_gap_synced_from_group_v1', true,
        'synced_group_code', gr.group_code,
        'synced_group_order', gr.group_order,
        'synced_group_gap_seconds', gr.gap_seconds
      )
  from group_rows gr
  where rider_rf.simulation_run_id = gr.simulation_run_id
    and rider_rf.stage_id = gr.stage_id
    and rider_rf.frame_number = gr.frame_number
    and rider_rf.group_code = gr.group_code
    and rider_rf.replay_mode = 'road_race'
    and rider_rf.entity_type <> 'group'
    and (
      rider_rf.gap_seconds is distinct from gr.gap_seconds
      or rider_rf.group_order is distinct from gr.group_order
    );

  get diagnostics v_updated_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'mode', 'sync_rider_gaps_from_group_rows_v1',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', p_stage_id,
    'updated_rows', v_updated_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_low_energy_crack_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_low_energy_members integer := 0;
  v_source_rows_updated integer := 0;
  v_empty_groups_deleted integer := 0;
  v_dropped_groups_created integer := 0;
  v_dropped_groups_updated integer := 0;
  v_gap_result jsonb;
begin
  /*
   * Low-energy crack rule v1:
   *
   * If live green energy <= 5%, rider is empty.
   * Empty riders cannot stay in front/chase/peloton groups.
   * They are moved into a dropped-energy group behind the peloton.
   */

  drop table if exists pg_temp.low_energy_crack_members; create temp table pg_temp.low_energy_crack_members on commit drop as
  select distinct
    rf.id as source_row_id,
    rf.race_id,
    rf.stage_id,
    rf.simulation_run_id,
    rf.replay_mode,
    rf.frame_number,
    rf.km_marker,
    rf.group_code as source_group_code,
    rf.group_label as source_group_label,
    coalesce(rf.group_order, 999) as source_group_order,
    coalesce(rf.gap_seconds, 0) as source_gap_seconds,
    member.rider_id,
    member.rider_name,
    energy.live_energy_pct
  from public.race_stage_replay_frames rf
  cross join lateral unnest(rf.rider_ids, rf.rider_names) with ordinality
    as member(rider_id, rider_name, rider_position)
  cross join lateral (
    select
      case
        when coalesce(
          rf.metadata -> 'rider_energy_v1' -> member.rider_id::text ->> 'live_energy_pct',
          ''
        ) ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (
            rf.metadata -> 'rider_energy_v1' -> member.rider_id::text ->> 'live_energy_pct'
          )::numeric
        else null::numeric
      end as live_energy_pct
  ) energy
  where rf.simulation_run_id = p_simulation_run_id
    and (p_stage_id is null or rf.stage_id = p_stage_id)
    and rf.replay_mode = 'road_race'
    and rf.entity_type = 'group'
    and rf.frame_number > 0
    and energy.live_energy_pct is not null
    and energy.live_energy_pct <= 5
    and not (
      lower(coalesce(rf.group_code, '')) like '%dropped%'
      or lower(coalesce(rf.group_code, '')) like '%outside%'
      or lower(coalesce(rf.group_label, '')) ~ '^b[0-9]*$'
    );

  select count(*)
  into v_low_energy_members
  from pg_temp.low_energy_crack_members;

  if v_low_energy_members = 0 then
    return jsonb_build_object(
      'status', 'completed',
      'mode', 'low_energy_crack_v1',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', p_stage_id,
      'low_energy_members', 0,
      'source_rows_updated', 0,
      'empty_groups_deleted', 0,
      'dropped_groups_created', 0,
      'dropped_groups_updated', 0
    );
  end if;

  /*
   * Remove empty riders from their original active groups.
   */
  with source_rows as (
    select distinct source_row_id
    from pg_temp.low_energy_crack_members
  )
  update public.race_stage_replay_frames rf
  set
    rider_ids = coalesce(
      (
        select array_agg(member.rider_id order by member.rider_position)
        from unnest(rf.rider_ids, rf.rider_names) with ordinality
          as member(rider_id, rider_name, rider_position)
        where not exists (
          select 1
          from pg_temp.low_energy_crack_members lem
          where lem.source_row_id = rf.id
            and lem.rider_id = member.rider_id
        )
      ),
      array[]::uuid[]
    ),
    rider_names = coalesce(
      (
        select array_agg(member.rider_name order by member.rider_position)
        from unnest(rf.rider_ids, rf.rider_names) with ordinality
          as member(rider_id, rider_name, rider_position)
        where not exists (
          select 1
          from pg_temp.low_energy_crack_members lem
          where lem.source_row_id = rf.id
            and lem.rider_id = member.rider_id
        )
      ),
      array[]::text[]
    ),
    metadata = coalesce(rf.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'low_energy_crack_source_group_v1', true
      )
  from source_rows sr
  where rf.id = sr.source_row_id;

  get diagnostics v_source_rows_updated = row_count;

  /*
   * Delete now-empty non-dropped groups.
   * This also prevents phantom G/P/P2/B labels with no riders.
   */
  delete from public.race_stage_replay_frames rf
  using (
    select distinct source_row_id
    from pg_temp.low_energy_crack_members
  ) sr
  where rf.id = sr.source_row_id
    and coalesce(array_length(rf.rider_ids, 1), 0) = 0;

  get diagnostics v_empty_groups_deleted = row_count;

  /*
   * Create dropped group rows where no dropped group exists yet.
   */
  with frame_targets as (
    select
      lem.race_id,
      lem.stage_id,
      lem.simulation_run_id,
      lem.replay_mode,
      lem.frame_number,
      max(lem.km_marker) as km_marker,
      greatest(
        max(lem.source_gap_seconds) + 30,
        coalesce((
          select max(coalesce(peloton.gap_seconds, 0)) + 20
          from public.race_stage_replay_frames peloton
          where peloton.simulation_run_id = lem.simulation_run_id
            and peloton.stage_id = lem.stage_id
            and peloton.frame_number = lem.frame_number
            and peloton.replay_mode = 'road_race'
            and peloton.entity_type = 'group'
            and (
              lower(coalesce(peloton.group_code, '')) = 'main_peloton'
              or lower(coalesce(peloton.group_label, '')) in ('p', 'peloton', 'main peloton')
            )
        ), 0),
        coalesce((
          select max(coalesce(any_group.gap_seconds, 0)) + 9
          from public.race_stage_replay_frames any_group
          where any_group.simulation_run_id = lem.simulation_run_id
            and any_group.stage_id = lem.stage_id
            and any_group.frame_number = lem.frame_number
            and any_group.replay_mode = 'road_race'
            and any_group.entity_type = 'group'
        ), 0)
      )::integer as target_gap_seconds
    from pg_temp.low_energy_crack_members lem
    group by
      lem.race_id,
      lem.stage_id,
      lem.simulation_run_id,
      lem.replay_mode,
      lem.frame_number
  )
  insert into public.race_stage_replay_frames (
    id,
    race_id,
    stage_id,
    simulation_run_id,
    replay_mode,
    entity_type,
    frame_number,
    race_seconds,
    km_marker,
    group_code,
    group_label,
    group_order,
    gap_seconds,
    rider_ids,
    rider_names,
    metadata
  )
  select
    gen_random_uuid(),
    ft.race_id,
    ft.stage_id,
    ft.simulation_run_id,
    ft.replay_mode,
    'group',
    ft.frame_number,
    coalesce((
      select max(src.race_seconds)
      from public.race_stage_replay_frames src
      where src.simulation_run_id = ft.simulation_run_id
        and src.stage_id = ft.stage_id
        and src.frame_number = ft.frame_number
        and src.replay_mode = 'road_race'
        and src.entity_type = 'group'
    ), ft.frame_number * 30, 0)::integer,
    ft.km_marker,
    'dropped_group_energy',
    'Dropped group',
    900,
    ft.target_gap_seconds,
    array[]::uuid[],
    array[]::text[],
    jsonb_build_object(
      'low_energy_crack_group_v1', true,
      'created_from_empty_green_energy', true,
      'created_dropped_group_race_seconds_fix_v1', true
    )
  from frame_targets ft
  where not exists (
    select 1
    from public.race_stage_replay_frames dropped
    where dropped.simulation_run_id = ft.simulation_run_id
      and dropped.stage_id = ft.stage_id
      and dropped.frame_number = ft.frame_number
      and dropped.replay_mode = 'road_race'
      and dropped.entity_type = 'group'
      and (
        lower(coalesce(dropped.group_code, '')) like '%dropped%'
        or lower(coalesce(dropped.group_code, '')) like '%outside%'
        or lower(coalesce(dropped.group_label, '')) ~ '^b[0-9]*$'
      )
  );

  get diagnostics v_dropped_groups_created = row_count;

  /*
   * Merge empty riders into the dropped group for that frame.
   */
  with dropped_targets as (
    select distinct on (rf.frame_number)
      rf.id,
      rf.frame_number
    from public.race_stage_replay_frames rf
    where rf.simulation_run_id = p_simulation_run_id
      and (p_stage_id is null or rf.stage_id = p_stage_id)
      and rf.replay_mode = 'road_race'
      and rf.entity_type = 'group'
      and (
        lower(coalesce(rf.group_code, '')) like '%dropped%'
        or lower(coalesce(rf.group_code, '')) like '%outside%'
        or lower(coalesce(rf.group_label, '')) ~ '^b[0-9]*$'
      )
    order by rf.frame_number, coalesce(rf.group_order, 999), rf.id
  ),
  merged_members as (
    select
      dt.id as dropped_row_id,
      member.rider_id,
      member.rider_name,
      1 as source_priority
    from dropped_targets dt
    join public.race_stage_replay_frames dropped
      on dropped.id = dt.id
    cross join lateral unnest(dropped.rider_ids, dropped.rider_names) with ordinality
      as member(rider_id, rider_name, rider_position)

    union all

    select
      dt.id as dropped_row_id,
      lem.rider_id,
      lem.rider_name,
      2 as source_priority
    from dropped_targets dt
    join pg_temp.low_energy_crack_members lem
      on lem.frame_number = dt.frame_number
  ),
  deduped_members as (
    select distinct on (dropped_row_id, rider_id)
      dropped_row_id,
      rider_id,
      rider_name,
      source_priority
    from merged_members
    order by dropped_row_id, rider_id, source_priority
  ),
  grouped_members as (
    select
      dropped_row_id,
      array_agg(rider_id order by source_priority, rider_name, rider_id) as rider_ids,
      array_agg(rider_name order by source_priority, rider_name, rider_id) as rider_names
    from deduped_members
    group by dropped_row_id
  ),
  frame_target_gaps as (
    select
      lem.frame_number,
      greatest(
        max(lem.source_gap_seconds) + 30,
        coalesce((
          select max(coalesce(peloton.gap_seconds, 0)) + 20
          from public.race_stage_replay_frames peloton
          where peloton.simulation_run_id = p_simulation_run_id
            and (p_stage_id is null or peloton.stage_id = p_stage_id)
            and peloton.frame_number = lem.frame_number
            and peloton.replay_mode = 'road_race'
            and peloton.entity_type = 'group'
            and (
              lower(coalesce(peloton.group_code, '')) = 'main_peloton'
              or lower(coalesce(peloton.group_label, '')) in ('p', 'peloton', 'main peloton')
            )
        ), 0),
        coalesce((
          select max(coalesce(any_group.gap_seconds, 0)) + 9
          from public.race_stage_replay_frames any_group
          where any_group.simulation_run_id = p_simulation_run_id
            and (p_stage_id is null or any_group.stage_id = p_stage_id)
            and any_group.frame_number = lem.frame_number
            and any_group.replay_mode = 'road_race'
            and any_group.entity_type = 'group'
        ), 0)
      )::integer as target_gap_seconds
    from pg_temp.low_energy_crack_members lem
    group by lem.frame_number
  )
  update public.race_stage_replay_frames dropped
  set
    rider_ids = gm.rider_ids,
    rider_names = gm.rider_names,
    group_code = coalesce(nullif(dropped.group_code, ''), 'dropped_group_energy'),
    group_label = 'Dropped group',
    group_order = greatest(coalesce(dropped.group_order, 900), 900),
    gap_seconds = greatest(coalesce(dropped.gap_seconds, 0), ftg.target_gap_seconds),
    metadata = coalesce(dropped.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'low_energy_crack_group_v1', true,
        'green_energy_empty_threshold_pct', 5,
        'speed_power_state', 'cracked_survival_mode'
      )
  from grouped_members gm
  join frame_target_gaps ftg
    on ftg.frame_number = (
      select rf.frame_number
      from public.race_stage_replay_frames rf
      where rf.id = gm.dropped_row_id
    )
  where dropped.id = gm.dropped_row_id;

  get diagnostics v_dropped_groups_updated = row_count;

  /*
   * Re-apply semantic group order/gaps after moving riders.
   */
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'race_engine_enforce_replay_distinct_group_gaps_v1'
  ) then
    select public.race_engine_enforce_replay_distinct_group_gaps_v1(
      p_simulation_run_id,
      p_stage_id
    )
    into v_gap_result;
  end if;

  return jsonb_build_object(
    'status', 'completed',
    'mode', 'low_energy_crack_v1',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', p_stage_id,
    'low_energy_members', v_low_energy_members,
    'source_rows_updated', v_source_rows_updated,
    'empty_groups_deleted', v_empty_groups_deleted,
    'dropped_groups_created', v_dropped_groups_created,
    'dropped_groups_updated', v_dropped_groups_updated,
    'gap_result', coalesce(v_gap_result, '{}'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_power_gel_energy_boost_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_stage_id uuid;
  v_race_id uuid;
  v_distance_km numeric;
  v_rows_updated integer := 0;
  v_riders_boosted integer := 0;
  v_total_gel_applications integer := 0;
begin
  /*
   * Power gel boost v2:
   *
   * Source of truth is Stage Plan rider_supplies_json, because RacePreparation.tsx
   * stores Stage Race Supplies per rider on the stage plan.
   *
   * Rules:
   * - user/stage-plan rider gels: use saved gels / energy_gels, clamped 0–2
   * - no saved stage supply for rider: fallback 1 gel
   * - 1 gel: active from 75% race distance
   * - 2 gels: first active from 50%, second active from 75%
   * - each gel gives +5 live green
   * - cannot rescue already-cracked rider at <=5 green
   * - cannot boost above 45 green
   */

  select
    coalesce(p_stage_id, run.stage_id),
    run.race_id
  into
    v_stage_id,
    v_race_id
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id
  limit 1;

  if v_stage_id is null then
    select rf.stage_id, rf.race_id
    into v_stage_id, v_race_id
    from public.race_stage_replay_frames rf
    where rf.simulation_run_id = p_simulation_run_id
    limit 1;
  end if;

  if v_stage_id is null then
    raise exception 'Could not resolve stage for simulation_run_id %', p_simulation_run_id;
  end if;

  select coalesce(rs.distance_km, 0)
  into v_distance_km
  from public.race_stages rs
  where rs.id = v_stage_id;

  if coalesce(v_distance_km, 0) <= 0 then
    raise exception 'Stage distance is missing or invalid for stage %', v_stage_id;
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'race_stage_plans'
  ) then
    raise exception 'race_stage_plans table not found. Cannot read stage supply plan.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_plans'
      and column_name = 'rider_supplies_json'
  ) then
    raise exception 'race_stage_plans.rider_supplies_json column not found. Cannot read stage supply plan.';
  end if;

  drop table if exists pg_temp.rider_gel_allowance; create temp table pg_temp.rider_gel_allowance on commit drop as
  with replay_riders as (
    select distinct
      member.rider_id
    from public.race_stage_replay_frames rf
    cross join lateral unnest(rf.rider_ids) as member(rider_id)
    where rf.simulation_run_id = p_simulation_run_id
      and rf.stage_id = v_stage_id
      and rf.replay_mode = 'road_race'
      and rf.entity_type = 'group'
  ),
  stage_plan as (
    select
      rsp.id,
      rsp.rider_supplies_json
    from public.race_stage_plans rsp
    where rsp.stage_id = v_stage_id
      and rsp.race_id = v_race_id
    order by
      rsp.submitted_at desc nulls last,
      rsp.last_saved_at desc nulls last,
      rsp.updated_at desc nulls last,
      rsp.created_at desc nulls last,
      rsp.id
    limit 1
  )
  select
    rr.rider_id,
    case
      when sp.id is null then 1

      when (sp.rider_supplies_json -> rr.rider_id::text) is null then 1

      else greatest(
        0,
        least(
          2,
          coalesce(
            nullif(sp.rider_supplies_json -> rr.rider_id::text ->> 'gels', '')::integer,
            nullif(sp.rider_supplies_json -> rr.rider_id::text ->> 'energy_gels', '')::integer,
            1
          )
        )
      )
    end::integer as gel_allowance,
    sp.id as race_stage_plan_id
  from replay_riders rr
  left join stage_plan sp
    on true;

  drop table if exists pg_temp.power_gel_frame_boosts; create temp table pg_temp.power_gel_frame_boosts on commit drop as
  select
    rf.id as replay_frame_id,
    rf.frame_number,
    rf.km_marker,
    member.rider_id,
    member.rider_name,
    rga.gel_allowance,
    rga.race_stage_plan_id,
    case
      when rga.gel_allowance >= 2 and (rf.km_marker / v_distance_km) >= 0.75 then 2
      when rga.gel_allowance >= 2 and (rf.km_marker / v_distance_km) >= 0.50 then 1
      when rga.gel_allowance = 1 and (rf.km_marker / v_distance_km) >= 0.75 then 1
      else 0
    end as gels_active,
    case
      when coalesce(
        rf.metadata -> 'rider_energy_v1' -> member.rider_id::text ->> 'gel_energy_base_live_pct',
        ''
      ) ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (
          rf.metadata -> 'rider_energy_v1' -> member.rider_id::text ->> 'gel_energy_base_live_pct'
        )::numeric

      when coalesce(
        rf.metadata -> 'rider_energy_v1' -> member.rider_id::text ->> 'live_energy_pct',
        ''
      ) ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (
          rf.metadata -> 'rider_energy_v1' -> member.rider_id::text ->> 'live_energy_pct'
        )::numeric

      else null::numeric
    end as base_live_energy
  from public.race_stage_replay_frames rf
  cross join lateral unnest(rf.rider_ids, rf.rider_names) with ordinality
    as member(rider_id, rider_name, rider_position)
  join pg_temp.rider_gel_allowance rga
    on rga.rider_id = member.rider_id
  where rf.simulation_run_id = p_simulation_run_id
    and rf.stage_id = v_stage_id
    and rf.replay_mode = 'road_race'
    and rf.entity_type = 'group'
    and rf.frame_number > 0
    and rf.metadata ? 'rider_energy_v1';

  delete from pg_temp.power_gel_frame_boosts
  where gels_active <= 0
     or base_live_energy is null
     or base_live_energy <= 5
     or base_live_energy >= 45;

  with boosted_energy as (
    select
      replay_frame_id,
      rider_id,
      rider_name,
      race_stage_plan_id,
      gel_allowance,
      gels_active,
      base_live_energy,
      least(45, base_live_energy + (gels_active * 5)) as boosted_live_energy
    from pg_temp.power_gel_frame_boosts
  ),
  rows_to_update as (
    select
      rf.id,
      jsonb_object_agg(
        energy_entry.key,
        case
          when be.rider_id is not null then
            energy_entry.value
            || jsonb_build_object(
              'gel_energy_base_live_pct', be.base_live_energy,
              'live_energy_pct', be.boosted_live_energy,
              'stage_energy_used_pct', greatest(0, least(100, 100 - be.boosted_live_energy)),
              'power_gel_boost_v2', true,
              'power_gel_source', 'race_stage_plans.rider_supplies_json',
              'race_stage_plan_id', be.race_stage_plan_id,
              'power_gels_available', be.gel_allowance,
              'power_gels_active_by_distance', be.gels_active,
              'power_gel_bonus_pct', be.boosted_live_energy - be.base_live_energy,
              'power_gel_value_green_pct', 5,
              'power_gel_schedule', case
                when be.gel_allowance >= 2 then '50_percent_and_75_percent'
                when be.gel_allowance = 1 then '75_percent_only'
                else 'none'
              end
            )
          else energy_entry.value
        end
      ) as new_rider_energy
    from public.race_stage_replay_frames rf
    cross join lateral jsonb_each(rf.metadata -> 'rider_energy_v1') energy_entry
    left join boosted_energy be
      on be.replay_frame_id = rf.id
     and be.rider_id::text = energy_entry.key
    where rf.simulation_run_id = p_simulation_run_id
      and rf.stage_id = v_stage_id
      and rf.replay_mode = 'road_race'
      and rf.entity_type = 'group'
      and rf.metadata ? 'rider_energy_v1'
    group by rf.id
  )
  update public.race_stage_replay_frames rf
  set metadata =
    jsonb_set(
      coalesce(rf.metadata, '{}'::jsonb),
      '{rider_energy_v1}',
      rtu.new_rider_energy,
      true
    )
  from rows_to_update rtu
  where rf.id = rtu.id;

  get diagnostics v_rows_updated = row_count;

  select
    count(distinct rider_id),
    coalesce(sum(gels_active), 0)
  into
    v_riders_boosted,
    v_total_gel_applications
  from pg_temp.power_gel_frame_boosts;

  return jsonb_build_object(
    'status', 'completed',
    'mode', 'power_gel_energy_boost_v2_stage_plan_supplies',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'race_id', v_race_id,
    'source', 'race_stage_plans.rider_supplies_json',
    'gel_value_green_pct', 5,
    'max_gels_per_rider_stage', 2,
    'max_boost_per_rider_stage_pct', 10,
    'green_cap_after_gel_pct', 45,
    'rows_updated', v_rows_updated,
    'riders_boosted', v_riders_boosted,
    'total_gel_applications_across_frames', v_total_gel_applications
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_rider_not_fully_fit_without_doctor_v1()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_type_code text;
  v_club_id uuid;
begin
  select nt.code
  into v_type_code
  from public.notification_types nt
  where nt.id = new.type_id;

  if v_type_code <> 'RIDER_NOT_FULLY_FIT' then
    return new;
  end if;

  v_club_id := nullif(new.payload_json ->> 'club_id', '')::uuid;

  /*
   * If the notification has no club_id, keep it.
   * We only block clearly club-linked rider fitness notifications
   * where the club has no active Team Doctor.
   */
  if v_club_id is null then
    return new;
  end if;

  if public.club_has_active_team_doctor_v1(v_club_id) then
    return new;
  end if;

  /*
   * Doctor-only rule:
   * no Team Doctor = no RIDER_NOT_FULLY_FIT notification.
   */
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_start_freshness_formula_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_stage_id uuid;
  v_rows_updated integer := 0;
  v_energy_entries_updated integer := 0;
begin
  select coalesce(p_stage_id, run.stage_id)
  into v_stage_id
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id
  limit 1;

  if v_stage_id is null then
    select rf.stage_id
    into v_stage_id
    from public.race_stage_replay_frames rf
    where rf.simulation_run_id = p_simulation_run_id
    limit 1;
  end if;

  if v_stage_id is null then
    raise exception 'Could not resolve stage for simulation_run_id %', p_simulation_run_id;
  end if;

  drop table if exists pg_temp.start_freshness_row_energy;

  create temp table pg_temp.start_freshness_row_energy on commit drop as
  with frame_members as (
    select
      rf.id as replay_frame_id,
      member.rider_id,
      coalesce(r.fatigue, cr.fatigue, 0)::numeric as fatigue,
      coalesce(rrc.race_sharpness, 50)::numeric as race_sharpness,
      public.calculate_rider_start_freshness_v1(
        coalesce(r.fatigue, cr.fatigue, 0)::numeric,
        coalesce(rrc.race_sharpness, 50)::numeric
      ) as calculated_start_freshness
    from public.race_stage_replay_frames rf
    cross join lateral unnest(rf.rider_ids) as member(rider_id)
    left join public.riders r
      on r.id = member.rider_id
    left join public.club_roster cr
      on cr.rider_id = member.rider_id
    left join public.rider_race_condition rrc
      on rrc.rider_id = member.rider_id
    where rf.simulation_run_id = p_simulation_run_id
      and rf.stage_id = v_stage_id
      and rf.replay_mode = 'road_race'
      and rf.entity_type = 'group'
      and rf.metadata ? 'rider_energy_v1'
  )
  select
    rf.id as replay_frame_id,
    jsonb_object_agg(
      energy_entry.key,
      case
        when fm.rider_id is not null then
          energy_entry.value
          || jsonb_build_object(
            'pre_stage_freshness_pct', fm.calculated_start_freshness,
            'start_freshness_pct', fm.calculated_start_freshness,
            'red_energy_pct', fm.calculated_start_freshness,
            'red_bar_pct', fm.calculated_start_freshness,
            'fatigue_for_start_freshness', fm.fatigue,
            'race_sharpness_for_start_freshness', fm.race_sharpness,
            'start_freshness_formula_v1', true,
            'start_freshness_formula', 'max(50,min(100,100-(fatigue*0.50)+((sharpness-50)*0.25)))'
          )
        else energy_entry.value
      end
    ) as new_rider_energy,
    count(*) filter (where fm.rider_id is not null) as updated_entries
  from public.race_stage_replay_frames rf
  cross join lateral jsonb_each(rf.metadata -> 'rider_energy_v1') energy_entry
  left join frame_members fm
    on fm.replay_frame_id = rf.id
   and fm.rider_id::text = energy_entry.key
  where rf.simulation_run_id = p_simulation_run_id
    and rf.stage_id = v_stage_id
    and rf.replay_mode = 'road_race'
    and rf.entity_type = 'group'
    and rf.metadata ? 'rider_energy_v1'
  group by rf.id;

  update public.race_stage_replay_frames rf
  set metadata =
    jsonb_set(
      coalesce(rf.metadata, '{}'::jsonb),
      '{rider_energy_v1}',
      sfre.new_rider_energy,
      true
    )
  from pg_temp.start_freshness_row_energy sfre
  where rf.id = sfre.replay_frame_id;

  get diagnostics v_rows_updated = row_count;

  select coalesce(sum(updated_entries), 0)
  into v_energy_entries_updated
  from pg_temp.start_freshness_row_energy;

  return jsonb_build_object(
    'status', 'completed',
    'mode', 'start_freshness_formula_v1',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'min_start_freshness', 50,
    'max_start_freshness', 100,
    'rows_updated', v_rows_updated,
    'energy_entries_updated', v_energy_entries_updated
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_early_active_live_energy_floor_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_stage_id uuid;
  v_distance_km numeric;
  v_rows_updated integer := 0;
  v_entries_checked integer := 0;
begin
  select coalesce(p_stage_id, run.stage_id)
  into v_stage_id
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id
  limit 1;

  if v_stage_id is null then
    select rf.stage_id
    into v_stage_id
    from public.race_stage_replay_frames rf
    where rf.simulation_run_id = p_simulation_run_id
    limit 1;
  end if;

  if v_stage_id is null then
    raise exception 'Could not resolve stage for simulation_run_id %', p_simulation_run_id;
  end if;

  select coalesce(rs.distance_km, 0)::numeric
  into v_distance_km
  from public.race_stages rs
  where rs.id = v_stage_id;

  if coalesce(v_distance_km, 0) <= 0 then
    raise exception 'Invalid distance for stage %', v_stage_id;
  end if;

  drop table if exists pg_temp.early_energy_floor_rows; create temp table pg_temp.early_energy_floor_rows on commit drop as
  with candidate_rows as (
    select
      rf.id as replay_frame_id,
      rf.km_marker::numeric as km_marker,
      greatest(0, least(1, rf.km_marker::numeric / greatest(v_distance_km, 1))) as progress,
      case
        when rf.km_marker::numeric / greatest(v_distance_km, 1) <= 0.05 then 98
        when rf.km_marker::numeric / greatest(v_distance_km, 1) <= 0.10 then 95
        when rf.km_marker::numeric / greatest(v_distance_km, 1) <= 0.25 then 91
        when rf.km_marker::numeric / greatest(v_distance_km, 1) <= 0.40 then 86
        else null
      end as live_energy_floor,
      rf.metadata
    from public.race_stage_replay_frames rf
    where rf.simulation_run_id = p_simulation_run_id
      and rf.stage_id = v_stage_id
      and rf.replay_mode = 'road_race'
      and rf.entity_type = 'group'
      and rf.metadata ? 'rider_energy_v1'
      and lower(coalesce(rf.group_code, '')) not like '%dropped%'
      and lower(coalesce(rf.group_code, '')) not like '%outside%'
  ),
  rebuilt_energy as (
    select
      cr.replay_frame_id,
      jsonb_object_agg(
        energy_entry.key,
        case
          when cr.live_energy_floor is not null
            and coalesce(nullif(energy_entry.value ->> 'live_energy_pct', '')::numeric, 100) < cr.live_energy_floor
          then
            energy_entry.value
            || jsonb_build_object(
              'live_energy_pct', cr.live_energy_floor,
              'stage_energy_used_pct', greatest(0, 100 - cr.live_energy_floor),
              'early_active_live_energy_floor_v1', true,
              'early_active_live_energy_floor_pct', cr.live_energy_floor,
              'early_active_live_energy_floor_reason', 'Opening race active-group protection before crack rule'
            )
          else energy_entry.value
        end
      ) as new_rider_energy,
      count(*) as checked_entries
    from candidate_rows cr
    cross join lateral jsonb_each(cr.metadata -> 'rider_energy_v1') energy_entry
    where cr.live_energy_floor is not null
    group by cr.replay_frame_id
  )
  select *
  from rebuilt_energy;

  update public.race_stage_replay_frames rf
  set metadata =
    jsonb_set(
      coalesce(rf.metadata, '{}'::jsonb),
      '{rider_energy_v1}',
      floor_rows.new_rider_energy,
      true
    )
  from pg_temp.early_energy_floor_rows floor_rows
  where rf.id = floor_rows.replay_frame_id;

  get diagnostics v_rows_updated = row_count;

  select coalesce(sum(checked_entries), 0)
  into v_entries_checked
  from pg_temp.early_energy_floor_rows;

  return jsonb_build_object(
    'status', 'completed',
    'mode', 'early_active_live_energy_floor_v1',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'rows_updated', v_rows_updated,
    'entries_checked', v_entries_checked
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_hydrate_dropped_group_energy_metadata_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '30s'
AS $function$
begin
  return jsonb_build_object(
    'status', 'skipped_temporary_emergency_reactivation',
    'helper_version', 'phase_3c_01_skip_dropped_group_energy_hydration',
    'reason', 'Skipped heavy dropped-group replay metadata hydration to prevent scheduler timeouts. This does not block core race outputs.',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', p_stage_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_normalize_dropped_group_km_marker_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return public.race_engine_normalize_group_km_marker_from_gap_v3(
    p_simulation_run_id,
    p_stage_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_stage_live_energy_smooth_v2(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return public.race_engine_apply_stage_live_energy_smooth_v12(
    p_simulation_run_id,
    p_stage_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_smooth_group_gap_seconds_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '300s'
AS $function$
begin
  return jsonb_build_object(
    'status', 'skipped',
    'mode', 'temporary_skip_heavy_gap_continuity_v12',
    'reason', 'race_engine_enforce_replay_rider_gap_continuity_v12 is temporarily disabled because it timed out during official road-stage execution.',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', p_stage_id,
    'skipped_function', 'race_engine_enforce_replay_rider_gap_continuity_v12',
    'next_step', 'Optimize or replace v12 continuity smoothing before re-enabling.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_stage_points_from_profile_json_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_inserted integer := 0;
begin
  with stage_data as (
    select
      rs.id as stage_id,
      rs.distance_km::numeric as distance_km,
      coalesce(to_jsonb(rs.intermediate_sprints_json), '[]'::jsonb) as sprint_json,
      coalesce(to_jsonb(rs.mountain_climbs_json), '[]'::jsonb) as climb_json,
      coalesce(
        rs.metadata #> '{route_profile_v1,route_markers}',
        rs.metadata -> 'route_markers',
        '[]'::jsonb
      ) as marker_json
    from public.race_stages rs
    where rs.id = p_stage_id
  ),
  sprint_points as (
    select
      sd.stage_id,
      'INTERMEDIATE_SPRINT'::text as point_type,
      coalesce(
        nullif(item.value ->> 'km', '')::numeric,
        nullif(item.value ->> 'km_from_start', '')::numeric
      ) as km_from_start,
      coalesce(
        nullif(item.value ->> 'name', ''),
        'Intermediate sprint'
      ) as name,
      null::text as kom_category,
      false as is_finish_point
    from stage_data sd
    cross join lateral jsonb_array_elements(sd.sprint_json) item(value)

    union all

    select
      sd.stage_id,
      'INTERMEDIATE_SPRINT'::text as point_type,
      coalesce(
        nullif(item.value ->> 'km', '')::numeric,
        nullif(item.value ->> 'km_from_start', '')::numeric
      ) as km_from_start,
      coalesce(
        nullif(item.value ->> 'label', ''),
        nullif(item.value ->> 'name', ''),
        'Intermediate sprint'
      ) as name,
      null::text as kom_category,
      false as is_finish_point
    from stage_data sd
    cross join lateral jsonb_array_elements(sd.marker_json) item(value)
    where lower(coalesce(item.value ->> 'type', item.value ->> 'point_type', '')) in
      ('sprint', 'intermediate_sprint')
  ),
  kom_points as (
    select
      sd.stage_id,
      'KOM'::text as point_type,
      coalesce(
        nullif(item.value ->> 'km', '')::numeric,
        nullif(item.value ->> 'km_from_start', '')::numeric
      ) as km_from_start,
      coalesce(
        nullif(item.value ->> 'name', ''),
        'KOM'
      ) as name,
      nullif(coalesce(item.value ->> 'category', item.value ->> 'kom_category'), '') as kom_category,
      false as is_finish_point
    from stage_data sd
    cross join lateral jsonb_array_elements(sd.climb_json) item(value)

    union all

    select
      sd.stage_id,
      'KOM'::text as point_type,
      coalesce(
        nullif(item.value ->> 'km', '')::numeric,
        nullif(item.value ->> 'km_from_start', '')::numeric
      ) as km_from_start,
      coalesce(
        nullif(item.value ->> 'label', ''),
        nullif(item.value ->> 'name', ''),
        'KOM'
      ) as name,
      nullif(coalesce(item.value ->> 'category', item.value ->> 'kom_category'), '') as kom_category,
      false as is_finish_point
    from stage_data sd
    cross join lateral jsonb_array_elements(sd.marker_json) item(value)
    where lower(coalesce(item.value ->> 'type', item.value ->> 'point_type', '')) in
      ('kom', 'climb', 'mountain_climb')
  ),
  finish_points as (
    select
      sd.stage_id,
      'FINISH'::text as point_type,
      sd.distance_km as km_from_start,
      'Finish sprint'::text as name,
      null::text as kom_category,
      true as is_finish_point
    from stage_data sd
  ),
  all_points as (
    select * from sprint_points
    union all
    select * from kom_points
    union all
    select * from finish_points
  ),
  clean_points as (
    select distinct on (stage_id, point_type, round(km_from_start::numeric, 1))
      stage_id,
      point_type,
      km_from_start,
      name,
      kom_category,
      is_finish_point
    from all_points
    where km_from_start is not null
      and km_from_start >= 0
    order by stage_id, point_type, round(km_from_start::numeric, 1), name
  ),
  inserted as (
    insert into public.race_stage_points (
      id,
      stage_id,
      point_type,
      km_from_start,
      name,
      kom_category,
      points_scheme,
      time_bonus_seconds,
      is_finish_point,
      sort_order,
      metadata
    )
    select
      gen_random_uuid(),
      cp.stage_id,
      cp.point_type,
      cp.km_from_start,
      cp.name,
      cp.kom_category,
      case
        when cp.point_type = 'INTERMEDIATE_SPRINT' then '[20,17,15,13,11,10,9,8,7,6]'::jsonb
        when cp.point_type = 'KOM' then '[5,3,2,1]'::jsonb
        when cp.point_type = 'FINISH' then '[25,20,16,14,12,10,8,6,4,2]'::jsonb
        else '[]'::jsonb
      end,
      case
        when cp.point_type = 'FINISH' then '[10,6,4]'::jsonb
        else '[]'::jsonb
      end,
      cp.is_finish_point,
      row_number() over (order by cp.km_from_start, cp.point_type),
      jsonb_build_object(
        'created_by', 'sync_stage_points_from_profile_json_v1',
        'synced_at', now()
      )
    from clean_points cp
    where not exists (
      select 1
      from public.race_stage_points existing
      where existing.stage_id = cp.stage_id
        and existing.point_type = cp.point_type
        and abs(existing.km_from_start::numeric - cp.km_from_start::numeric) < 0.05
    )
    returning 1
  )
  select count(*)
  into v_inserted
  from inserted;

  return jsonb_build_object(
    'status', 'completed',
    'mode', 'sync_stage_points_from_profile_json_v1',
    'stage_id', p_stage_id,
    'inserted_points', v_inserted
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_stage_live_energy_smooth_v3(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_updated_rows integer := 0;
begin
  select coalesce(
    p_stage_id,
    (
      select (to_jsonb(s)->>'stage_id')::uuid
      from public.race_stage_simulation_runs s
      where (to_jsonb(s)->>'id')::uuid = p_simulation_run_id
      limit 1
    )
  )
  into v_stage_id;

  if v_stage_id is null then
    raise exception 'Could not resolve stage_id for simulation_run_id %', p_simulation_run_id;
  end if;

  with base as (
    select
      f.ctid as row_ctid,
      f.metadata,
      f.frame_number,
      coalesce(f.km_marker, 0)::numeric as km_marker,
      coalesce(f.group_code, '') as group_code,
      coalesce(f.group_order, 1)::integer as group_order,

      case
        when jsonb_typeof(f.metadata->'rider_energy_v1') = 'object'
          then f.metadata->'rider_energy_v1'
        else '{}'::jsonb
      end as energy_obj,

      (
        select count(*)::integer
        from jsonb_each(
          case
            when jsonb_typeof(f.metadata->'rider_energy_v1') = 'object'
              then f.metadata->'rider_energy_v1'
            else '{}'::jsonb
          end
        )
      ) as riders_in_group

    from public.race_stage_replay_frames f
    where f.stage_id = v_stage_id
      and f.simulation_run_id = p_simulation_run_id
      and f.entity_type = 'group'
  ),

  context as (
    select
      b.*,
      count(*) over (partition by b.frame_number) as groups_in_frame,
      max(b.riders_in_group) over (partition by b.frame_number) as largest_group_size
    from base b
  ),

  rebuilt as (
    select
      c.row_ctid,
      jsonb_object_agg(
        e.key,
        e.value
        || jsonb_build_object(
          'live_energy_pct', round(calc.new_live_energy_pct, 2),
          'green_energy_pct', round(calc.new_live_energy_pct, 2),
          'green_bar_pct', round(calc.new_live_energy_pct, 2),
          'stage_energy_used_pct', round(greatest(0::numeric, 100::numeric - calc.new_live_energy_pct), 2),
          'stage_energy_model', 'stage_live_energy_smooth_v3_minimum_drain',
          'minimum_live_energy_drain_v3', round(calc.minimum_required_used_pct, 2),
          'energy_group_rate_v3', model.group_rate,
          'energy_freshness_factor_v3', round(model.freshness_factor, 3)
        )
      ) as new_energy_obj
    from context c
    cross join lateral jsonb_each(c.energy_obj) e

    cross join lateral (
      select
        coalesce(
          case when (e.value->>'live_energy_pct') ~ '^[0-9]+(\.[0-9]+)?$'
            then (e.value->>'live_energy_pct')::numeric end,
          case when (e.value->>'green_energy_pct') ~ '^[0-9]+(\.[0-9]+)?$'
            then (e.value->>'green_energy_pct')::numeric end,
          case when (e.value->>'green_bar_pct') ~ '^[0-9]+(\.[0-9]+)?$'
            then (e.value->>'green_bar_pct')::numeric end,
          100::numeric
        ) as current_green_energy_pct,

        coalesce(
          case when (e.value->>'red_energy_pct') ~ '^[0-9]+(\.[0-9]+)?$'
            then (e.value->>'red_energy_pct')::numeric end,
          case when (e.value->>'red_bar_pct') ~ '^[0-9]+(\.[0-9]+)?$'
            then (e.value->>'red_bar_pct')::numeric end,
          case when (e.value->>'start_freshness_pct') ~ '^[0-9]+(\.[0-9]+)?$'
            then (e.value->>'start_freshness_pct')::numeric end,
          case when (e.value->>'pre_stage_freshness_pct') ~ '^[0-9]+(\.[0-9]+)?$'
            then (e.value->>'pre_stage_freshness_pct')::numeric end,
          75::numeric
        ) as red_energy_pct
    ) parsed

    cross join lateral (
      select
        greatest(
          0.85::numeric,
          least(
            1.35::numeric,
            1::numeric + ((72::numeric - parsed.red_energy_pct) / 120::numeric)
          )
        ) as freshness_factor,

        case
          when c.frame_number = 0 or c.km_marker <= 0 then 0::numeric

          -- Single peloton still spends minimum live energy.
          when c.groups_in_frame <= 1 then 0.20::numeric

          -- Small front/breakaway group.
          when c.group_order = 1
            and c.riders_in_group < c.largest_group_size
            then 0.40::numeric

          -- Main peloton / largest group.
          when c.riders_in_group >= c.largest_group_size
            then 0.18::numeric

          -- Chase groups.
          when lower(c.group_code) like '%chase%'
            then 0.32::numeric

          -- Dropped / outside groups.
          when lower(c.group_code) like '%dropped%'
            or lower(c.group_code) like '%outside%'
            then 0.36::numeric

          else 0.26::numeric
        end as group_rate
    ) model

    cross join lateral (
      select
        case
          when c.frame_number = 0 or c.km_marker <= 0 then 0::numeric
          else least(
            65::numeric,
            c.km_marker * model.group_rate * model.freshness_factor
          )
        end as minimum_required_used_pct
    ) required

    cross join lateral (
      select
        greatest(
          0::numeric,
          least(
            parsed.current_green_energy_pct,
            100::numeric - required.minimum_required_used_pct
          )
        ) as new_live_energy_pct,
        required.minimum_required_used_pct
    ) calc

    where c.riders_in_group > 0
    group by c.row_ctid
  )

  update public.race_stage_replay_frames f
  set metadata =
    jsonb_set(
      coalesce(f.metadata, '{}'::jsonb),
      '{rider_energy_v1}',
      r.new_energy_obj,
      true
    )
    || jsonb_build_object(
      'stage_live_energy_smooth_v3', true,
      'stage_live_energy_smooth_v3_reason', 'minimum realistic live-energy drain by distance, group effort, and red freshness',
      'stage_live_energy_smooth_v3_applied_at', now()
    )
  from rebuilt r
  where f.ctid = r.row_ctid;

  get diagnostics v_updated_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_apply_stage_live_energy_smooth_v3',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'updated_group_frame_rows', v_updated_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_smooth_group_gap_seconds_v2(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_gap_col text;
  v_gap_data_type text;
  v_gap_set_expr text;
  v_updated_rows integer := 0;
begin
  select coalesce(
    p_stage_id,
    (
      select (to_jsonb(s)->>'stage_id')::uuid
      from public.race_stage_simulation_runs s
      where (to_jsonb(s)->>'id')::uuid = p_simulation_run_id
      limit 1
    )
  )
  into v_stage_id;

  if v_stage_id is null then
    raise exception 'Could not resolve stage_id for simulation_run_id %', p_simulation_run_id;
  end if;

  select c.column_name, c.data_type
  into v_gap_col, v_gap_data_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'race_stage_replay_frames'
    and c.column_name in ('gap_seconds', 'live_gap_seconds', 'time_gap_seconds')
  order by
    case c.column_name
      when 'gap_seconds' then 1
      when 'live_gap_seconds' then 2
      when 'time_gap_seconds' then 3
      else 9
    end
  limit 1;

  if v_gap_col is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'No gap_seconds/live_gap_seconds/time_gap_seconds column found on race_stage_replay_frames'
    );
  end if;

  v_gap_set_expr :=
    case
      when v_gap_data_type in ('integer', 'bigint', 'smallint')
        then 'round(s.smoothed_gap)::integer'
      else 'round(s.smoothed_gap, 2)'
    end;

  execute format($sql$
    with recursive raw as (
      select
        f.ctid as row_ctid,
        f.frame_number,
        coalesce(f.km_marker, 0)::numeric as km_marker,
        coalesce(f.group_order, 1)::integer as group_order,
        coalesce(f.%1$I, 0)::numeric as gap_seconds
      from public.race_stage_replay_frames f
      where f.stage_id = $2
        and f.simulation_run_id = $1
        and f.entity_type = 'group'
    ),

    ordered as (
      select
        r.*,
        row_number() over (
          partition by r.group_order
          order by r.frame_number, r.km_marker, r.row_ctid::text
        ) as rn
      from raw r
    ),

    smoothed as (
      select
        o.rn,
        o.row_ctid,
        o.frame_number,
        o.km_marker,
        o.group_order,
        o.gap_seconds as old_gap,
        case
          when o.group_order = 1 then 0::numeric
          else greatest(0::numeric, o.gap_seconds)
        end as smoothed_gap
      from ordered o
      where o.rn = 1

      union all

      select
        o.rn,
        o.row_ctid,
        o.frame_number,
        o.km_marker,
        o.group_order,
        o.gap_seconds as old_gap,
        case
          when o.group_order = 1 then 0::numeric

          -- Gap can close immediately.
          when o.gap_seconds <= s.smoothed_gap then greatest(0::numeric, o.gap_seconds)

          -- Gap cannot explode unrealistically in one short distance step.
          when o.gap_seconds > s.smoothed_gap + (
            8::numeric + greatest(o.km_marker - s.km_marker, 0.10::numeric) * 18::numeric
          )
          then s.smoothed_gap + (
            8::numeric + greatest(o.km_marker - s.km_marker, 0.10::numeric) * 18::numeric
          )

          else greatest(0::numeric, o.gap_seconds)
        end as smoothed_gap
      from smoothed s
      join ordered o
        on o.group_order = s.group_order
       and o.rn = s.rn + 1
    ),

    to_update as (
      select
        row_ctid,
        old_gap,
        smoothed_gap
      from smoothed
      where abs(old_gap - smoothed_gap) > 0.01
    )

    update public.race_stage_replay_frames f
    set
      %1$I = %2$s,
      metadata =
        coalesce(f.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'gap_seconds_smoothed_v2', true,
          'gap_seconds_smoothed_v2_old_gap_seconds', round(s.old_gap, 2),
          'gap_seconds_smoothed_v2_new_gap_seconds', round(s.smoothed_gap, 2),
          'gap_seconds_smoothed_v2_rule', 'max growth = 8 seconds + 18 seconds per km between frames',
          'gap_seconds', round(s.smoothed_gap, 2),
          'live_gap_seconds', round(s.smoothed_gap, 2)
        )
    from to_update s
    where f.ctid = s.row_ctid
  $sql$, v_gap_col, v_gap_set_expr)
  using p_simulation_run_id, v_stage_id;

  get diagnostics v_updated_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_smooth_group_gap_seconds_v2',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'gap_column_used', v_gap_col,
    'gap_column_type', v_gap_data_type,
    'updated_gap_rows', v_updated_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_smooth_group_gap_seconds_v3(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_gap_col text;
  v_gap_data_type text;
  v_gap_set_expr text;
  v_updated_rows integer := 0;
begin
  select coalesce(
    p_stage_id,
    (
      select (to_jsonb(s)->>'stage_id')::uuid
      from public.race_stage_simulation_runs s
      where (to_jsonb(s)->>'id')::uuid = p_simulation_run_id
      limit 1
    )
  )
  into v_stage_id;

  if v_stage_id is null then
    raise exception 'Could not resolve stage_id for simulation_run_id %', p_simulation_run_id;
  end if;

  select c.column_name, c.data_type
  into v_gap_col, v_gap_data_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'race_stage_replay_frames'
    and c.column_name in ('gap_seconds', 'live_gap_seconds', 'time_gap_seconds')
  order by
    case c.column_name
      when 'gap_seconds' then 1
      when 'live_gap_seconds' then 2
      when 'time_gap_seconds' then 3
      else 9
    end
  limit 1;

  if v_gap_col is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'No gap column found on race_stage_replay_frames'
    );
  end if;

  v_gap_set_expr :=
    case
      when v_gap_data_type in ('integer', 'bigint', 'smallint')
        then 'round(s.smoothed_gap)::integer'
      else 'round(s.smoothed_gap, 2)'
    end;

  execute format($sql$
    with recursive raw as (
      select
        f.ctid as row_ctid,
        f.frame_number,
        coalesce(f.km_marker, 0)::numeric as km_marker,
        coalesce(f.group_order, 1)::integer as group_order,
        coalesce(f.group_code, '') as group_code,
        coalesce(f.%1$I, 0)::numeric as old_gap
      from public.race_stage_replay_frames f
      where f.stage_id = $2
        and f.simulation_run_id = $1
        and f.entity_type = 'group'
    ),

    frame_prev_group as (
      select
        r.*,
        coalesce(pg.old_gap, 0)::numeric as previous_group_gap_same_frame
      from raw r
      left join raw pg
        on pg.frame_number = r.frame_number
       and pg.group_order = r.group_order - 1
    ),

    ordered as (
      select
        r.*,
        row_number() over (
          partition by r.group_order
          order by r.frame_number, r.km_marker, r.row_ctid::text
        ) as rn
      from frame_prev_group r
    ),

    smoothed as (
      -- First row for each group_order.
      -- Important: when a new group appears, it cannot instantly appear 47s/80s behind.
      -- It starts max 12s behind the previous visible group in the same frame.
      select
        o.rn,
        o.row_ctid,
        o.frame_number,
        o.km_marker,
        o.group_order,
        o.group_code,
        o.old_gap,
        o.previous_group_gap_same_frame,
        case
          when o.group_order = 1 then 0::numeric
          else least(
            greatest(0::numeric, o.old_gap),
            greatest(0::numeric, o.previous_group_gap_same_frame) + 12::numeric
          )
        end as smoothed_gap
      from ordered o
      where o.rn = 1

      union all

      select
        o.rn,
        o.row_ctid,
        o.frame_number,
        o.km_marker,
        o.group_order,
        o.group_code,
        o.old_gap,
        o.previous_group_gap_same_frame,
        case
          when o.group_order = 1 then 0::numeric

          -- Gaps may close quickly.
          when o.old_gap <= s.smoothed_gap then greatest(0::numeric, o.old_gap)

          -- But gaps cannot grow too quickly.
          -- Max growth is about 5–9 seconds per frame at this frame density.
          when o.old_gap > s.smoothed_gap + (
            4::numeric + greatest(o.km_marker - s.km_marker, 0.10::numeric) * 3.5::numeric
          )
          then s.smoothed_gap + (
            4::numeric + greatest(o.km_marker - s.km_marker, 0.10::numeric) * 3.5::numeric
          )

          else greatest(0::numeric, o.old_gap)
        end as smoothed_gap
      from smoothed s
      join ordered o
        on o.group_order = s.group_order
       and o.rn = s.rn + 1
    ),

    -- Final pass: keep group order logical inside the same frame.
    -- Group 3 must be behind group 2, etc., but only by a small minimum.
    ordered_frame as (
      select
        s.*,
        max(s.smoothed_gap) over (
          partition by s.frame_number
          order by s.group_order
          rows between unbounded preceding and 1 preceding
        ) as previous_smoothed_gap_same_frame
      from smoothed s
    ),

    final_smoothed as (
      select
        row_ctid,
        old_gap,
        case
          when group_order = 1 then 0::numeric
          when previous_smoothed_gap_same_frame is null then smoothed_gap
          else greatest(smoothed_gap, previous_smoothed_gap_same_frame + 4::numeric)
        end as smoothed_gap
      from ordered_frame
    ),

    to_update as (
      select
        row_ctid,
        old_gap,
        smoothed_gap
      from final_smoothed
      where abs(old_gap - smoothed_gap) > 0.01
    )

    update public.race_stage_replay_frames f
    set
      %1$I = %2$s,
      metadata =
        coalesce(f.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'gap_seconds_smoothed_v3', true,
          'gap_seconds_smoothed_v3_old_gap_seconds', round(s.old_gap, 2),
          'gap_seconds_smoothed_v3_new_gap_seconds', round(s.smoothed_gap, 2),
          'gap_seconds_smoothed_v3_rule', 'new group max 12s behind previous group; growth cap 4s + 3.5s per km',
          'gap_seconds', round(s.smoothed_gap, 2),
          'live_gap_seconds', round(s.smoothed_gap, 2)
        )
    from to_update s
    where f.ctid = s.row_ctid
  $sql$, v_gap_col, v_gap_set_expr)
  using p_simulation_run_id, v_stage_id;

  get diagnostics v_updated_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_smooth_group_gap_seconds_v3',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'gap_column_used', v_gap_col,
    'gap_column_type', v_gap_data_type,
    'updated_gap_rows', v_updated_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_smooth_group_gap_seconds_v4(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_gap_col text;
  v_gap_data_type text;
  v_gap_set_expr text;
  v_updated_rows integer := 0;
begin
  select coalesce(
    p_stage_id,
    (
      select (to_jsonb(s)->>'stage_id')::uuid
      from public.race_stage_simulation_runs s
      where (to_jsonb(s)->>'id')::uuid = p_simulation_run_id
      limit 1
    )
  )
  into v_stage_id;

  if v_stage_id is null then
    raise exception 'Could not resolve stage_id for simulation_run_id %', p_simulation_run_id;
  end if;

  select c.column_name, c.data_type
  into v_gap_col, v_gap_data_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'race_stage_replay_frames'
    and c.column_name in ('gap_seconds', 'live_gap_seconds', 'time_gap_seconds')
  order by
    case c.column_name
      when 'gap_seconds' then 1
      when 'live_gap_seconds' then 2
      when 'time_gap_seconds' then 3
      else 9
    end
  limit 1;

  if v_gap_col is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'No gap column found on race_stage_replay_frames'
    );
  end if;

  v_gap_set_expr :=
    case
      when v_gap_data_type in ('integer', 'bigint', 'smallint')
        then 'round(s.final_gap)::integer'
      else 'round(s.final_gap, 2)'
    end;

  execute format($sql$
    with recursive raw as (
      select
        f.ctid as row_ctid,
        f.frame_number,
        coalesce(f.km_marker, 0)::numeric as km_marker,
        coalesce(f.group_order, 1)::integer as group_order,
        coalesce(f.group_code, '') as group_code,
        coalesce(f.%1$I, 0)::numeric as old_gap
      from public.race_stage_replay_frames f
      where f.stage_id = $2
        and f.simulation_run_id = $1
        and f.entity_type = 'group'
    ),

    marked as (
      select
        r.*,
        lag(r.frame_number) over (
          partition by r.group_order
          order by r.frame_number, r.km_marker, r.row_ctid::text
        ) as prev_frame_number
      from raw r
    ),

    segmented as (
      select
        m.*,
        sum(
          case
            when m.prev_frame_number is null then 1
            when m.frame_number > m.prev_frame_number + 1 then 1
            else 0
          end
        ) over (
          partition by m.group_order
          order by m.frame_number, m.km_marker, m.row_ctid::text
        ) as visible_segment_id
      from marked m
    ),

    ordered as (
      select
        s.*,
        row_number() over (
          partition by s.group_order, s.visible_segment_id
          order by s.frame_number, s.km_marker, s.row_ctid::text
        ) as segment_rn
      from segmented s
    ),

    base_smoothed as (
      -- First row of each visible segment:
      -- a newly appearing non-leader group cannot instantly be +47s or +80s.
      select
        o.segment_rn,
        o.visible_segment_id,
        o.row_ctid,
        o.frame_number,
        o.km_marker,
        o.group_order,
        o.group_code,
        o.old_gap,
        case
          when o.group_order = 1 then 0::numeric
          else least(greatest(0::numeric, o.old_gap), 12::numeric)
        end as base_gap
      from ordered o
      where o.segment_rn = 1

      union all

      select
        o.segment_rn,
        o.visible_segment_id,
        o.row_ctid,
        o.frame_number,
        o.km_marker,
        o.group_order,
        o.group_code,
        o.old_gap,
        case
          when o.group_order = 1 then 0::numeric

          -- Gaps can close quickly.
          when o.old_gap <= b.base_gap then greatest(0::numeric, o.old_gap)

          -- But positive growth is capped tightly.
          -- Around this frame density, this gives about +7 to +9 seconds max.
          when o.old_gap > b.base_gap + (
            4::numeric + greatest(abs(o.km_marker - b.km_marker), 0.75::numeric) * 3.5::numeric
          )
          then b.base_gap + (
            4::numeric + greatest(abs(o.km_marker - b.km_marker), 0.75::numeric) * 3.5::numeric
          )

          else greatest(0::numeric, o.old_gap)
        end as base_gap
      from base_smoothed b
      join ordered o
        on o.group_order = b.group_order
       and o.visible_segment_id = b.visible_segment_id
       and o.segment_rn = b.segment_rn + 1
    ),

    frame_ordered as (
      select
        b.*,
        row_number() over (
          partition by b.frame_number
          order by b.group_order, b.row_ctid::text
        ) as frame_rn
      from base_smoothed b
    ),

    frame_final as (
      -- First visible group in a frame.
      select
        fo.frame_rn,
        fo.row_ctid,
        fo.frame_number,
        fo.km_marker,
        fo.group_order,
        fo.group_code,
        fo.old_gap,
        case
          when fo.group_order = 1 then 0::numeric
          else fo.base_gap
        end as final_gap
      from frame_ordered fo
      where fo.frame_rn = 1

      union all

      -- Later groups must stay behind previous group,
      -- but not explode away just because raw data had a huge jump.
      select
        fo.frame_rn,
        fo.row_ctid,
        fo.frame_number,
        fo.km_marker,
        fo.group_order,
        fo.group_code,
        fo.old_gap,
        case
          when fo.group_order = 1 then 0::numeric
          else greatest(
            fo.base_gap,
            ff.final_gap + 4::numeric
          )
        end as final_gap
      from frame_final ff
      join frame_ordered fo
        on fo.frame_number = ff.frame_number
       and fo.frame_rn = ff.frame_rn + 1
    ),

    to_update as (
      select
        row_ctid,
        old_gap,
        final_gap
      from frame_final
      where abs(old_gap - final_gap) > 0.01
    )

    update public.race_stage_replay_frames f
    set
      %1$I = %2$s,
      metadata =
        coalesce(f.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'gap_seconds_smoothed_v4', true,
          'gap_seconds_smoothed_v4_old_gap_seconds', round(s.old_gap, 2),
          'gap_seconds_smoothed_v4_new_gap_seconds', round(s.final_gap, 2),
          'gap_seconds_smoothed_v4_rule', 'new visible group segment starts max 12s; growth capped per frame; frame group order kept logical',
          'gap_seconds', round(s.final_gap, 2),
          'live_gap_seconds', round(s.final_gap, 2)
        )
    from to_update s
    where f.ctid = s.row_ctid
  $sql$, v_gap_col, v_gap_set_expr)
  using p_simulation_run_id, v_stage_id;

  get diagnostics v_updated_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_smooth_group_gap_seconds_v4',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'gap_column_used', v_gap_col,
    'gap_column_type', v_gap_data_type,
    'updated_gap_rows', v_updated_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_smooth_group_gap_seconds_v5(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_gap_col text;
  v_gap_data_type text;
  v_gap_set_expr text;
  v_updated_rows integer := 0;
begin
  select coalesce(
    p_stage_id,
    (
      select (to_jsonb(s)->>'stage_id')::uuid
      from public.race_stage_simulation_runs s
      where (to_jsonb(s)->>'id')::uuid = p_simulation_run_id
      limit 1
    )
  )
  into v_stage_id;

  if v_stage_id is null then
    raise exception 'Could not resolve stage_id for simulation_run_id %', p_simulation_run_id;
  end if;

  select c.column_name, c.data_type
  into v_gap_col, v_gap_data_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'race_stage_replay_frames'
    and c.column_name in ('gap_seconds', 'live_gap_seconds', 'time_gap_seconds')
  order by
    case c.column_name
      when 'gap_seconds' then 1
      when 'live_gap_seconds' then 2
      when 'time_gap_seconds' then 3
      else 9
    end
  limit 1;

  if v_gap_col is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'no gap column found'
    );
  end if;

  v_gap_set_expr :=
    case
      when v_gap_data_type in ('integer', 'bigint', 'smallint')
        then 'round(u.final_gap)::integer'
      else 'round(u.final_gap, 2)'
    end;

  execute format($sql$
    with recursive
    raw as (
      select
        f.ctid as row_ctid,
        f.frame_number,
        coalesce(f.km_marker, 0)::numeric as km_marker,
        coalesce(f.group_order, 1)::integer as group_order,
        coalesce(f.group_code, '') as group_code,
        coalesce(f.%1$I, 0)::numeric as old_gap
      from public.race_stage_replay_frames f
      where f.stage_id = $2
        and f.simulation_run_id = $1
        and f.entity_type = 'group'
    ),

    ordered as (
      select
        r.*,
        lag(r.frame_number) over (
          partition by r.group_order
          order by r.frame_number, r.km_marker, r.row_ctid::text
        ) as prev_frame
      from raw r
    ),

    segmented as (
      select
        o.*,
        sum(
          case
            when o.prev_frame is null then 1
            when o.frame_number > o.prev_frame + 1 then 1
            else 0
          end
        ) over (
          partition by o.group_order
          order by o.frame_number, o.km_marker, o.row_ctid::text
        ) as segment_id
      from ordered o
    ),

    segment_stats as (
      select
        group_order,
        segment_id,
        min(frame_number) as first_frame,
        max(frame_number) as last_frame,
        count(*) as segment_frames
      from segmented
      group by group_order, segment_id
    ),

    with_segment as (
      select
        s.*,
        ss.first_frame,
        ss.last_frame,
        ss.segment_frames,
        (ss.last_frame - s.frame_number) as frames_until_segment_end
      from segmented s
      join segment_stats ss
        on ss.group_order = s.group_order
       and ss.segment_id = s.segment_id
    ),

    base as (
      select
        ws.*,
        case
          when ws.group_order = 1 then 0::numeric

          -- new visible group segment cannot instantly appear far behind
          when ws.frame_number = ws.first_frame then least(greatest(ws.old_gap, 0), 12::numeric)

          else greatest(ws.old_gap, 0)
        end as start_limited_gap
      from with_segment ws
    ),

    recursive_ordered as (
      select
        b.*,
        row_number() over (
          partition by b.group_order, b.segment_id
          order by b.frame_number, b.km_marker, b.row_ctid::text
        ) as rn
      from base b
    ),

    recursive_smooth as (
      select
        ro.rn,
        ro.row_ctid,
        ro.frame_number,
        ro.km_marker,
        ro.group_order,
        ro.group_code,
        ro.old_gap,
        ro.segment_id,
        ro.segment_frames,
        ro.frames_until_segment_end,
        ro.start_limited_gap as smoothed_gap
      from recursive_ordered ro
      where ro.rn = 1

      union all

      select
        ro.rn,
        ro.row_ctid,
        ro.frame_number,
        ro.km_marker,
        ro.group_order,
        ro.group_code,
        ro.old_gap,
        ro.segment_id,
        ro.segment_frames,
        ro.frames_until_segment_end,
        case
          when ro.group_order = 1 then 0::numeric

          -- Closing can happen, but not from +180s to 0s in one frame.
          when ro.old_gap < rs.smoothed_gap - (
            5::numeric + greatest(abs(ro.km_marker - rs.km_marker), 0.75::numeric) * 4::numeric
          )
          then rs.smoothed_gap - (
            5::numeric + greatest(abs(ro.km_marker - rs.km_marker), 0.75::numeric) * 4::numeric
          )

          -- Opening also capped.
          when ro.old_gap > rs.smoothed_gap + (
            5::numeric + greatest(abs(ro.km_marker - rs.km_marker), 0.75::numeric) * 4::numeric
          )
          then rs.smoothed_gap + (
            5::numeric + greatest(abs(ro.km_marker - rs.km_marker), 0.75::numeric) * 4::numeric
          )

          else greatest(ro.old_gap, 0)
        end as smoothed_gap
      from recursive_smooth rs
      join recursive_ordered ro
        on ro.group_order = rs.group_order
       and ro.segment_id = rs.segment_id
       and ro.rn = rs.rn + 1
    ),

    merge_guarded as (
      select
        rs.*,
        case
          when rs.group_order = 1 then 0::numeric

          -- If a group is going to disappear/merge, force believable approach.
          when rs.frames_until_segment_end = 0 and rs.smoothed_gap > 12
            then 12::numeric
          when rs.frames_until_segment_end = 1 and rs.smoothed_gap > 22
            then 22::numeric
          when rs.frames_until_segment_end = 2 and rs.smoothed_gap > 34
            then 34::numeric
          when rs.frames_until_segment_end = 3 and rs.smoothed_gap > 48
            then 48::numeric
          when rs.frames_until_segment_end = 4 and rs.smoothed_gap > 64
            then 64::numeric

          else rs.smoothed_gap
        end as final_gap
      from recursive_smooth rs
    ),

    to_update as (
      select row_ctid, old_gap, final_gap
      from merge_guarded
      where abs(old_gap - final_gap) > 0.01
    )

    update public.race_stage_replay_frames f
    set
      %1$I = %2$s,
      metadata =
        coalesce(f.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'gap_seconds_smoothed_v5', true,
          'gap_seconds_smoothed_v5_old_gap_seconds', round(u.old_gap, 2),
          'gap_seconds_smoothed_v5_new_gap_seconds', round(u.final_gap, 2),
          'gap_seconds_smoothed_v5_rule', 'caps opening, closing, and large-gap merge collapse',
          'gap_seconds', round(u.final_gap, 2),
          'live_gap_seconds', round(u.final_gap, 2)
        )
    from to_update u
    where f.ctid = u.row_ctid
  $sql$, v_gap_col, v_gap_set_expr)
  using p_simulation_run_id, v_stage_id;

  get diagnostics v_updated_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_smooth_group_gap_seconds_v5',
    'updated_gap_rows', v_updated_rows,
    'gap_column_used', v_gap_col,
    'gap_column_type', v_gap_data_type,
    'stage_id', v_stage_id,
    'simulation_run_id', p_simulation_run_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_stage_live_energy_smooth_v4(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_updated_rows integer := 0;
begin
  select coalesce(
    p_stage_id,
    (
      select (to_jsonb(s)->>'stage_id')::uuid
      from public.race_stage_simulation_runs s
      where (to_jsonb(s)->>'id')::uuid = p_simulation_run_id
      limit 1
    )
  )
  into v_stage_id;

  if v_stage_id is null then
    raise exception 'Could not resolve stage_id for simulation_run_id %', p_simulation_run_id;
  end if;

  with base_frames as (
    select
      f.ctid as row_ctid,
      f.frame_number,
      coalesce(f.km_marker, 0)::numeric as km_marker,
      coalesce(f.group_order, 1)::integer as group_order,
      coalesce(f.group_code, '') as group_code,

      coalesce(
        case
          when (f.metadata->>'slope_percent') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then (f.metadata->>'slope_percent')::numeric
        end,
        0::numeric
      ) as slope_percent,

      lower(coalesce(f.metadata->>'terrain_type', '')) as terrain_type,

      coalesce(f.metadata, '{}'::jsonb) as metadata,

      case
        when jsonb_typeof(f.metadata->'rider_energy_v1') = 'object'
          then f.metadata->'rider_energy_v1'
        else '{}'::jsonb
      end as energy_obj
    from public.race_stage_replay_frames f
    where f.stage_id = v_stage_id
      and f.simulation_run_id = p_simulation_run_id
      and f.entity_type = 'group'
  ),

  with_prev as (
    select
      bf.*,
      greatest(
        0::numeric,
        coalesce(
          bf.km_marker - lag(bf.km_marker) over (
            partition by bf.group_order
            order by bf.frame_number, bf.km_marker
          ),
          0::numeric
        )
      ) as km_delta
    from base_frames bf
  ),

  energy_rows as (
    select
      wp.row_ctid,
      wp.frame_number,
      wp.km_marker,
      wp.group_order,
      wp.group_code,
      wp.slope_percent,
      wp.terrain_type,
      wp.km_delta,
      e.key as rider_id,
      e.value as old_energy_json,

      coalesce(
        case when (e.value->>'live_energy_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'live_energy_pct')::numeric end,
        case when (e.value->>'green_energy_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'green_energy_pct')::numeric end,
        case when (e.value->>'green_bar_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'green_bar_pct')::numeric end,
        100::numeric
      ) as current_green,

      coalesce(
        case when (e.value->>'red_energy_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'red_energy_pct')::numeric end,
        case when (e.value->>'red_bar_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'red_bar_pct')::numeric end,
        case when (e.value->>'start_freshness_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'start_freshness_pct')::numeric end,
        75::numeric
      ) as red_energy,

      coalesce(
        case when (to_jsonb(r)->>'climbing') ~ '^[0-9]+(\.[0-9]+)?$'
          then (to_jsonb(r)->>'climbing')::numeric end,
        case when (to_jsonb(r)->>'climb') ~ '^[0-9]+(\.[0-9]+)?$'
          then (to_jsonb(r)->>'climb')::numeric end,
        case when (to_jsonb(r)->>'climber') ~ '^[0-9]+(\.[0-9]+)?$'
          then (to_jsonb(r)->>'climber')::numeric end,
        62::numeric
      ) as climbing_skill

    from with_prev wp
    cross join lateral jsonb_each(wp.energy_obj) e
    left join public.riders r
      on to_jsonb(r)->>'id' = e.key
  ),

  calculated as (
    select
      er.*,

      case
        when er.frame_number = 0 or er.km_marker <= 0 then 0::numeric

        -- Strong climb or explicit climb terrain.
        when er.slope_percent >= 7
          or er.terrain_type like '%climb%'
          or er.terrain_type like '%mountain%'
          then 1.70::numeric

        -- Medium climb.
        when er.slope_percent >= 4
          then 1.25::numeric

        -- False-flat / smaller climb.
        when er.slope_percent >= 2
          then 0.70::numeric

        -- Descent: little recovery / no drain.
        when er.slope_percent <= -5
          then -0.10::numeric

        when er.slope_percent <= -2
          then -0.04::numeric

        -- Flat still costs a tiny amount.
        else 0.04::numeric
      end as terrain_cost_per_km,

      greatest(
        0.85::numeric,
        least(
          1.75::numeric,
          1::numeric + ((72::numeric - er.red_energy) / 70::numeric)
        )
      ) as red_factor,

      greatest(
        0.75::numeric,
        least(
          1.85::numeric,
          1::numeric + ((68::numeric - er.climbing_skill) / 45::numeric)
        )
      ) as climbing_factor,

      case
        when er.group_order = 1 and lower(er.group_code) like '%front%' then 1.20::numeric
        when lower(er.group_code) like '%dropped%' or lower(er.group_code) like '%outside%' then 1.35::numeric
        when lower(er.group_code) like '%chase%' then 1.18::numeric
        else 0.92::numeric
      end as group_factor

    from energy_rows er
  ),

  frame_cost as (
    select
      c.*,

      greatest(
        -0.40::numeric,
        least(
          4.00::numeric,
          c.km_delta
          * c.terrain_cost_per_km
          * c.red_factor
          * c.climbing_factor
          * c.group_factor
        )
      ) as frame_terrain_energy_cost

    from calculated c
  ),

  cumulative as (
    select
      fc.*,

      sum(fc.frame_terrain_energy_cost) over (
        partition by fc.rider_id
        order by fc.frame_number, fc.km_marker
        rows between unbounded preceding and current row
      ) as cumulative_terrain_energy_cost

    from frame_cost fc
  ),

  final_energy as (
    select
      c.*,

      greatest(
        0::numeric,
        least(
          100::numeric,
          c.current_green - c.cumulative_terrain_energy_cost
        )
      ) as new_green,

      case
        when greatest(0::numeric, least(100::numeric, c.current_green - c.cumulative_terrain_energy_cost)) <= 10
          then 'empty'
        when greatest(0::numeric, least(100::numeric, c.current_green - c.cumulative_terrain_energy_cost)) <= 20
          then 'critical'
        when greatest(0::numeric, least(100::numeric, c.current_green - c.cumulative_terrain_energy_cost)) <= 35
          then 'low'
        else 'normal'
      end as energy_crack_state

    from cumulative c
  ),

  rebuilt as (
    select
      row_ctid,
      jsonb_object_agg(
        rider_id,
        old_energy_json
        || jsonb_build_object(
          'live_energy_pct', round(new_green, 2),
          'green_energy_pct', round(new_green, 2),
          'green_bar_pct', round(new_green, 2),
          'stage_energy_used_pct', round(100::numeric - new_green, 2),

          'stage_energy_model', 'stage_live_energy_smooth_v4_terrain_aware',
          'terrain_energy_v4', true,
          'terrain_energy_v4_slope_percent', round(slope_percent, 3),
          'terrain_energy_v4_terrain_type', terrain_type,
          'terrain_energy_v4_climbing_skill', round(climbing_skill, 2),
          'terrain_energy_v4_red_factor', round(red_factor, 3),
          'terrain_energy_v4_climbing_factor', round(climbing_factor, 3),
          'terrain_energy_v4_group_factor', round(group_factor, 3),
          'terrain_energy_v4_frame_cost', round(frame_terrain_energy_cost, 2),
          'terrain_energy_v4_cumulative_cost', round(cumulative_terrain_energy_cost, 2),
          'energy_crack_state_v4', energy_crack_state
        )
      ) as new_energy_obj
    from final_energy
    group by row_ctid
  )

  update public.race_stage_replay_frames f
  set metadata =
    jsonb_set(
      coalesce(f.metadata, '{}'::jsonb),
      '{rider_energy_v1}',
      r.new_energy_obj,
      true
    )
    || jsonb_build_object(
      'stage_live_energy_smooth_v4', true,
      'stage_live_energy_smooth_v4_reason', 'terrain-aware climb/descent energy by slope, climbing skill, red freshness, and group role',
      'stage_live_energy_smooth_v4_applied_at', now()
    )
  from rebuilt r
  where f.ctid = r.row_ctid;

  get diagnostics v_updated_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_apply_stage_live_energy_smooth_v4',
    'updated_group_frame_rows', v_updated_rows,
    'stage_id', v_stage_id,
    'simulation_run_id', p_simulation_run_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_normalize_group_km_marker_from_gap_v2(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_updated_rows integer := 0;
begin
  select coalesce(
    p_stage_id,
    (
      select (to_jsonb(s)->>'stage_id')::uuid
      from public.race_stage_simulation_runs s
      where (to_jsonb(s)->>'id')::uuid = p_simulation_run_id
      limit 1
    )
  )
  into v_stage_id;

  if v_stage_id is null then
    raise exception 'Could not resolve stage_id for simulation_run_id %', p_simulation_run_id;
  end if;

  with frame_groups as (
    select
      f.ctid as row_ctid,
      f.frame_number,
      coalesce(f.km_marker, 0)::numeric as km_marker,
      coalesce(f.group_order, 1)::integer as group_order,
      coalesce(f.group_code, '') as group_code,
      coalesce(f.gap_seconds, 0)::numeric as gap_seconds,
      f.metadata
    from public.race_stage_replay_frames f
    where f.stage_id = v_stage_id
      and f.simulation_run_id = p_simulation_run_id
      and f.entity_type = 'group'
  ),

  leader as (
    select distinct on (frame_number)
      frame_number,
      km_marker as leader_km_marker
    from frame_groups
    order by frame_number, group_order, km_marker desc
  ),

  calculated as (
    select
      fg.row_ctid,
      fg.frame_number,
      fg.group_order,
      fg.group_code,
      fg.km_marker as old_km_marker,
      fg.gap_seconds,
      l.leader_km_marker,

      case
        when fg.group_order = 1 then fg.km_marker

        -- Approx 36 km/h: 1 second = 0.010 km.
        -- Minimum visible separation = 0.10 km for non-leader groups.
        else greatest(
          0::numeric,
          least(
            fg.km_marker,
            l.leader_km_marker - greatest(0.10::numeric, fg.gap_seconds * 0.010::numeric)
          )
        )
      end as new_km_marker

    from frame_groups fg
    join leader l
      on l.frame_number = fg.frame_number
  )

  update public.race_stage_replay_frames f
  set
    km_marker = round(c.new_km_marker, 3),
    metadata =
      coalesce(f.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'km_marker_normalized_from_gap_v2', true,
        'km_marker_normalized_from_gap_v2_old_km_marker', round(c.old_km_marker, 3),
        'km_marker_normalized_from_gap_v2_new_km_marker', round(c.new_km_marker, 3),
        'km_marker_normalized_from_gap_v2_gap_seconds', round(c.gap_seconds, 2),
        'km_marker_normalized_from_gap_v2_leader_km_marker', round(c.leader_km_marker, 3),
        'km_marker_normalized_from_gap_v2_rule', 'non-leader marker placed behind leader according to gap_seconds at approx 36kph'
      )
  from calculated c
  where f.ctid = c.row_ctid
    and c.group_order > 1
    and abs(c.old_km_marker - c.new_km_marker) > 0.02;

  get diagnostics v_updated_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_normalize_group_km_marker_from_gap_v2',
    'updated_km_marker_rows', v_updated_rows,
    'stage_id', v_stage_id,
    'simulation_run_id', p_simulation_run_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_enforce_same_frame_group_gap_order_v6(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_gap_col text;
  v_gap_data_type text;
  v_gap_set_expr text;
  v_updated_rows integer := 0;
begin
  select coalesce(
    p_stage_id,
    (
      select (to_jsonb(s)->>'stage_id')::uuid
      from public.race_stage_simulation_runs s
      where (to_jsonb(s)->>'id')::uuid = p_simulation_run_id
      limit 1
    )
  )
  into v_stage_id;

  if v_stage_id is null then
    raise exception 'Could not resolve stage_id for simulation_run_id %', p_simulation_run_id;
  end if;

  select c.column_name, c.data_type
  into v_gap_col, v_gap_data_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'race_stage_replay_frames'
    and c.column_name in ('gap_seconds', 'live_gap_seconds', 'time_gap_seconds')
  order by
    case c.column_name
      when 'gap_seconds' then 1
      when 'live_gap_seconds' then 2
      when 'time_gap_seconds' then 3
      else 9
    end
  limit 1;

  if v_gap_col is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'no gap column found');
  end if;

  v_gap_set_expr :=
    case
      when v_gap_data_type in ('integer', 'bigint', 'smallint')
        then 'round(fx.fixed_gap)::integer'
      else 'round(fx.fixed_gap, 2)'
    end;

  execute format($sql$
    with recursive
    raw as (
      select
        f.ctid as row_ctid,
        f.frame_number,
        coalesce(f.km_marker, 0)::numeric as km_marker,
        coalesce(f.group_order, 1)::integer as group_order,
        coalesce(f.group_code, '') as group_code,
        coalesce(f.%1$I, 0)::numeric as old_gap
      from public.race_stage_replay_frames f
      where f.stage_id = $2
        and f.simulation_run_id = $1
        and f.entity_type = 'group'
    ),

    ordered as (
      select
        r.*,
        row_number() over (
          partition by r.frame_number
          order by r.group_order, r.km_marker desc, r.row_ctid::text
        ) as frame_rn
      from raw r
    ),

    fixed as (
      select
        o.frame_rn,
        o.row_ctid,
        o.frame_number,
        o.km_marker,
        o.group_order,
        o.group_code,
        o.old_gap,
        case
          when o.group_order = 1 then 0::numeric
          else greatest(0::numeric, o.old_gap)
        end as fixed_gap
      from ordered o
      where o.frame_rn = 1

      union all

      select
        o.frame_rn,
        o.row_ctid,
        o.frame_number,
        o.km_marker,
        o.group_order,
        o.group_code,
        o.old_gap,
        case
          when o.group_order = 1 then 0::numeric
          else greatest(
            greatest(0::numeric, o.old_gap),
            fx.fixed_gap + 8::numeric
          )
        end as fixed_gap
      from fixed fx
      join ordered o
        on o.frame_number = fx.frame_number
       and o.frame_rn = fx.frame_rn + 1
    ),

    to_update as (
      select
        row_ctid,
        old_gap,
        fixed_gap
      from fixed
      where abs(old_gap - fixed_gap) > 0.01
    )

    update public.race_stage_replay_frames f
    set
      %1$I = %2$s,
      metadata =
        coalesce(f.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'gap_order_enforced_v6', true,
          'gap_order_enforced_v6_old_gap_seconds', round(fx.old_gap, 2),
          'gap_order_enforced_v6_new_gap_seconds', round(fx.fixed_gap, 2),
          'gap_order_enforced_v6_rule', 'same-frame group gaps must be non-decreasing by group_order with minimum 8s separation',
          'gap_seconds', round(fx.fixed_gap, 2),
          'live_gap_seconds', round(fx.fixed_gap, 2)
        )
    from to_update fx
    where f.ctid = fx.row_ctid
  $sql$, v_gap_col, v_gap_set_expr)
  using p_simulation_run_id, v_stage_id;

  get diagnostics v_updated_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_enforce_same_frame_group_gap_order_v6',
    'updated_gap_rows', v_updated_rows,
    'gap_column_used', v_gap_col,
    'gap_column_type', v_gap_data_type,
    'stage_id', v_stage_id,
    'simulation_run_id', p_simulation_run_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_stage_live_energy_smooth_v5(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_updated_rows integer := 0;
begin
  select coalesce(
    p_stage_id,
    (
      select (to_jsonb(s)->>'stage_id')::uuid
      from public.race_stage_simulation_runs s
      where (to_jsonb(s)->>'id')::uuid = p_simulation_run_id
      limit 1
    )
  )
  into v_stage_id;

  if v_stage_id is null then
    raise exception 'Could not resolve stage_id for simulation_run_id %', p_simulation_run_id;
  end if;

  -- keep the minimum-distance energy drain from v3 first
  perform public.race_engine_apply_stage_live_energy_smooth_v3(
    p_simulation_run_id,
    v_stage_id
  );

  with base_frames as (
    select
      f.ctid as row_ctid,
      f.frame_number,
      coalesce(f.km_marker, 0)::numeric as km_marker,
      coalesce(f.group_order, 1)::integer as group_order,
      coalesce(f.group_code, '') as group_code,

      coalesce(
        case when (f.metadata->>'slope_percent') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (f.metadata->>'slope_percent')::numeric end,
        0::numeric
      ) as slope_percent,

      lower(coalesce(f.metadata->>'terrain_type', '')) as terrain_type,
      coalesce(f.metadata, '{}'::jsonb) as metadata,

      case
        when exists (
          select 1
          from public.race_stage_points rsp
          where rsp.stage_id = v_stage_id
            and rsp.point_type = 'KOM'
            and rsp.km_from_start::numeric between greatest(0::numeric, coalesce(f.km_marker, 0)::numeric - 2::numeric)
                                              and coalesce(f.km_marker, 0)::numeric + 12::numeric
        )
        then true
        else false
      end as near_kom_zone,

      case
        when jsonb_typeof(f.metadata->'rider_energy_v1') = 'object'
          then f.metadata->'rider_energy_v1'
        else '{}'::jsonb
      end as energy_obj

    from public.race_stage_replay_frames f
    where f.stage_id = v_stage_id
      and f.simulation_run_id = p_simulation_run_id
      and f.entity_type = 'group'
      and not (coalesce(f.metadata, '{}'::jsonb) ? 'stage_live_energy_smooth_v5')
  ),

  with_prev as (
    select
      bf.*,
      greatest(
        0::numeric,
        coalesce(
          bf.km_marker - lag(bf.km_marker) over (
            partition by bf.group_order
            order by bf.frame_number, bf.km_marker
          ),
          0::numeric
        )
      ) as km_delta
    from base_frames bf
  ),

  energy_rows as (
    select
      wp.row_ctid,
      wp.frame_number,
      wp.km_marker,
      wp.group_order,
      wp.group_code,
      wp.slope_percent,
      wp.terrain_type,
      wp.near_kom_zone,
      wp.km_delta,
      e.key as rider_id,
      e.value as old_energy_json,

      coalesce(
        case when (e.value->>'live_energy_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'live_energy_pct')::numeric end,
        case when (e.value->>'green_energy_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'green_energy_pct')::numeric end,
        case when (e.value->>'green_bar_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'green_bar_pct')::numeric end,
        100::numeric
      ) as current_green,

      coalesce(
        case when (e.value->>'red_energy_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'red_energy_pct')::numeric end,
        case when (e.value->>'red_bar_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'red_bar_pct')::numeric end,
        case when (e.value->>'start_freshness_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'start_freshness_pct')::numeric end,
        75::numeric
      ) as red_energy,

      coalesce(
        case when (to_jsonb(r)->>'climbing') ~ '^[0-9]+(\.[0-9]+)?$'
          then (to_jsonb(r)->>'climbing')::numeric end,
        case when (to_jsonb(r)->>'climb') ~ '^[0-9]+(\.[0-9]+)?$'
          then (to_jsonb(r)->>'climb')::numeric end,
        case when (to_jsonb(r)->>'climber') ~ '^[0-9]+(\.[0-9]+)?$'
          then (to_jsonb(r)->>'climber')::numeric end,
        62::numeric
      ) as climbing_skill

    from with_prev wp
    cross join lateral jsonb_each(wp.energy_obj) e
    left join public.riders r
      on to_jsonb(r)->>'id' = e.key
  ),

  calculated as (
    select
      er.*,

      case
        when er.frame_number = 0 or er.km_marker <= 0 then 0::numeric

        -- KOM approach is treated as real climbing pressure even if slope data is soft.
        when er.near_kom_zone and er.slope_percent >= 4 then 1.95::numeric
        when er.near_kom_zone and er.slope_percent >= 2 then 1.45::numeric
        when er.near_kom_zone then 1.10::numeric

        when er.slope_percent >= 7
          or er.terrain_type like '%climb%'
          or er.terrain_type like '%mountain%'
          then 1.80::numeric

        when er.slope_percent >= 4 then 1.35::numeric
        when er.slope_percent >= 2 then 0.85::numeric

        -- Descents: small recovery / no extra drain.
        when er.slope_percent <= -5 then -0.15::numeric
        when er.slope_percent <= -2 then -0.05::numeric

        else 0.00::numeric
      end as terrain_cost_per_km,

      greatest(
        0.85::numeric,
        least(
          1.85::numeric,
          1::numeric + ((72::numeric - er.red_energy) / 65::numeric)
        )
      ) as red_factor,

      greatest(
        0.70::numeric,
        least(
          2.00::numeric,
          1::numeric + ((70::numeric - er.climbing_skill) / 40::numeric)
        )
      ) as climbing_factor,

      case
        when er.group_order = 1 and lower(er.group_code) like '%front%' then 1.22::numeric
        when lower(er.group_code) like '%dropped%' or lower(er.group_code) like '%outside%' then 1.40::numeric
        when lower(er.group_code) like '%chase%' then 1.18::numeric
        else 0.95::numeric
      end as group_factor

    from energy_rows er
  ),

  frame_cost as (
    select
      c.*,
      greatest(
        -0.35::numeric,
        least(
          4.50::numeric,
          c.km_delta
          * c.terrain_cost_per_km
          * c.red_factor
          * c.climbing_factor
          * c.group_factor
        )
      ) as frame_terrain_energy_cost
    from calculated c
  ),

  cumulative as (
    select
      fc.*,
      sum(fc.frame_terrain_energy_cost) over (
        partition by fc.rider_id
        order by fc.frame_number, fc.km_marker
        rows between unbounded preceding and current row
      ) as cumulative_terrain_energy_cost
    from frame_cost fc
  ),

  final_energy as (
    select
      c.*,

      greatest(
        0::numeric,
        least(
          100::numeric,
          c.current_green - c.cumulative_terrain_energy_cost
        )
      ) as new_green,

      case
        when greatest(0::numeric, least(100::numeric, c.current_green - c.cumulative_terrain_energy_cost)) <= 10
          then 'empty'
        when greatest(0::numeric, least(100::numeric, c.current_green - c.cumulative_terrain_energy_cost)) <= 20
          then 'critical'
        when greatest(0::numeric, least(100::numeric, c.current_green - c.cumulative_terrain_energy_cost)) <= 35
          then 'low'
        else 'normal'
      end as energy_crack_state

    from cumulative c
  ),

  rebuilt as (
    select
      row_ctid,
      jsonb_object_agg(
        rider_id,
        old_energy_json
        || jsonb_build_object(
          'live_energy_pct', round(new_green, 2),
          'green_energy_pct', round(new_green, 2),
          'green_bar_pct', round(new_green, 2),
          'stage_energy_used_pct', round(100::numeric - new_green, 2),

          'stage_energy_model', 'stage_live_energy_smooth_v5_kom_terrain_aware',
          'terrain_energy_v5', true,
          'terrain_energy_v5_slope_percent', round(slope_percent, 3),
          'terrain_energy_v5_terrain_type', terrain_type,
          'terrain_energy_v5_near_kom_zone', near_kom_zone,
          'terrain_energy_v5_climbing_skill', round(climbing_skill, 2),
          'terrain_energy_v5_red_factor', round(red_factor, 3),
          'terrain_energy_v5_climbing_factor', round(climbing_factor, 3),
          'terrain_energy_v5_group_factor', round(group_factor, 3),
          'terrain_energy_v5_frame_cost', round(frame_terrain_energy_cost, 2),
          'terrain_energy_v5_cumulative_cost', round(cumulative_terrain_energy_cost, 2),
          'energy_crack_state_v5', energy_crack_state
        )
      ) as new_energy_obj
    from final_energy
    group by row_ctid
  )

  update public.race_stage_replay_frames f
  set metadata =
    jsonb_set(
      coalesce(f.metadata, '{}'::jsonb),
      '{rider_energy_v1}',
      r.new_energy_obj,
      true
    )
    || jsonb_build_object(
      'stage_live_energy_smooth_v5', true,
      'stage_live_energy_smooth_v5_reason', 'stronger KOM/climb energy drain by slope, KOM proximity, climbing skill, red freshness, and group role',
      'stage_live_energy_smooth_v5_applied_at', now()
    )
  from rebuilt r
  where f.ctid = r.row_ctid;

  get diagnostics v_updated_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_apply_stage_live_energy_smooth_v5',
    'updated_group_frame_rows', v_updated_rows,
    'stage_id', v_stage_id,
    'simulation_run_id', p_simulation_run_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_normalize_group_km_marker_from_gap_v3(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_updated_rows integer := 0;
begin
  select coalesce(
    p_stage_id,
    (
      select (to_jsonb(s)->>'stage_id')::uuid
      from public.race_stage_simulation_runs s
      where (to_jsonb(s)->>'id')::uuid = p_simulation_run_id
      limit 1
    )
  )
  into v_stage_id;

  if v_stage_id is null then
    raise exception 'Could not resolve stage_id for simulation_run_id %', p_simulation_run_id;
  end if;

  with recursive
  raw as (
    select
      f.ctid as row_ctid,
      f.frame_number,
      coalesce(f.km_marker, 0)::numeric as old_km_marker,
      coalesce(f.group_order, 1)::integer as group_order,
      coalesce(f.group_code, '') as group_code,
      coalesce(f.gap_seconds, 0)::numeric as gap_seconds,
      row_number() over (
        partition by f.frame_number
        order by coalesce(f.group_order, 1), coalesce(f.km_marker, 0)::numeric desc, f.ctid::text
      ) as frame_rn
    from public.race_stage_replay_frames f
    where f.stage_id = v_stage_id
      and f.simulation_run_id = p_simulation_run_id
      and f.entity_type = 'group'
  ),

  leader as (
    select
      frame_number,
      max(old_km_marker) filter (where group_order = 1) as leader_km_marker
    from raw
    group by frame_number
  ),

  target as (
    select
      r.*,
      coalesce(l.leader_km_marker, r.old_km_marker) as leader_km_marker,
      case
        when r.group_order = 1 then r.old_km_marker
        else greatest(
          0::numeric,
          coalesce(l.leader_km_marker, r.old_km_marker)
          - greatest(0.10::numeric, r.gap_seconds * 0.010::numeric)
        )
      end as target_km_marker
    from raw r
    join leader l
      on l.frame_number = r.frame_number
  ),

  fixed as (
    select
      t.frame_rn,
      t.row_ctid,
      t.frame_number,
      t.group_order,
      t.group_code,
      t.old_km_marker,
      t.gap_seconds,
      t.leader_km_marker,
      t.target_km_marker,
      t.target_km_marker as fixed_km_marker
    from target t
    where t.frame_rn = 1

    union all

    select
      t.frame_rn,
      t.row_ctid,
      t.frame_number,
      t.group_order,
      t.group_code,
      t.old_km_marker,
      t.gap_seconds,
      t.leader_km_marker,
      t.target_km_marker,
      case
        when t.group_order = 1 then t.target_km_marker
        else least(
          t.target_km_marker,
          fx.fixed_km_marker - 0.12::numeric
        )
      end as fixed_km_marker
    from fixed fx
    join target t
      on t.frame_number = fx.frame_number
     and t.frame_rn = fx.frame_rn + 1
  )

  update public.race_stage_replay_frames f
  set
    km_marker = round(fx.fixed_km_marker, 3),
    metadata =
      coalesce(f.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'km_marker_normalized_from_gap_v3', true,
        'km_marker_normalized_from_gap_v3_old_km_marker', round(fx.old_km_marker, 3),
        'km_marker_normalized_from_gap_v3_new_km_marker', round(fx.fixed_km_marker, 3),
        'km_marker_normalized_from_gap_v3_gap_seconds', round(fx.gap_seconds, 2),
        'km_marker_normalized_from_gap_v3_leader_km_marker', round(fx.leader_km_marker, 3),
        'km_marker_normalized_from_gap_v3_rule', 'position from leader gap at 36kph plus minimum 0.12km visual separation between visible groups'
      )
  from fixed fx
  where f.ctid = fx.row_ctid
    and fx.group_order > 1
    and abs(fx.old_km_marker - fx.fixed_km_marker) > 0.02;

  get diagnostics v_updated_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_normalize_group_km_marker_from_gap_v3',
    'updated_km_marker_rows', v_updated_rows,
    'stage_id', v_stage_id,
    'simulation_run_id', p_simulation_run_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_stage_live_energy_smooth_v6(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_updated_rows integer := 0;
begin
  select coalesce(
    p_stage_id,
    (
      select (to_jsonb(s)->>'stage_id')::uuid
      from public.race_stage_simulation_runs s
      where (to_jsonb(s)->>'id')::uuid = p_simulation_run_id
      limit 1
    )
  )
  into v_stage_id;

  if v_stage_id is null then
    raise exception 'Could not resolve stage_id for simulation_run_id %', p_simulation_run_id;
  end if;

  -- Important:
  -- Reset to v3 baseline first, then apply calibrated terrain drain.
  -- This prevents v5-overdepletion from stacking.
  perform public.race_engine_apply_stage_live_energy_smooth_v3(
    p_simulation_run_id,
    v_stage_id
  );

  with base_frames as (
    select
      f.ctid as row_ctid,
      f.frame_number,
      coalesce(f.km_marker, 0)::numeric as km_marker,
      coalesce(f.group_order, 1)::integer as group_order,
      coalesce(f.group_code, '') as group_code,

      coalesce(
        case when (f.metadata->>'slope_percent') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (f.metadata->>'slope_percent')::numeric end,
        0::numeric
      ) as slope_percent,

      lower(coalesce(f.metadata->>'terrain_type', '')) as terrain_type,
      coalesce(f.metadata, '{}'::jsonb) as metadata,

      case
        when exists (
          select 1
          from public.race_stage_points rsp
          where rsp.stage_id = v_stage_id
            and rsp.point_type = 'KOM'
            and rsp.km_from_start::numeric between greatest(0::numeric, coalesce(f.km_marker, 0)::numeric - 2::numeric)
                                              and coalesce(f.km_marker, 0)::numeric + 12::numeric
        )
        then true
        else false
      end as near_kom_zone,

      case
        when jsonb_typeof(f.metadata->'rider_energy_v1') = 'object'
          then f.metadata->'rider_energy_v1'
        else '{}'::jsonb
      end as energy_obj

    from public.race_stage_replay_frames f
    where f.stage_id = v_stage_id
      and f.simulation_run_id = p_simulation_run_id
      and f.entity_type = 'group'
  ),

  with_prev as (
    select
      bf.*,
      greatest(
        0::numeric,
        coalesce(
          bf.km_marker - lag(bf.km_marker) over (
            partition by bf.group_order
            order by bf.frame_number, bf.km_marker
          ),
          0::numeric
        )
      ) as km_delta
    from base_frames bf
  ),

  energy_rows as (
    select
      wp.row_ctid,
      wp.frame_number,
      wp.km_marker,
      wp.group_order,
      wp.group_code,
      wp.slope_percent,
      wp.terrain_type,
      wp.near_kom_zone,
      wp.km_delta,
      e.key as rider_id,
      e.value as old_energy_json,

      coalesce(
        case when (e.value->>'minimum_live_energy_drain_v3') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'minimum_live_energy_drain_v3')::numeric end,
        case when (e.value->>'stage_energy_used_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then least((e.value->>'stage_energy_used_pct')::numeric, 40::numeric) end,
        0::numeric
      ) as base_v3_energy_used,

      coalesce(
        case when (e.value->>'red_energy_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'red_energy_pct')::numeric end,
        case when (e.value->>'red_bar_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'red_bar_pct')::numeric end,
        case when (e.value->>'start_freshness_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'start_freshness_pct')::numeric end,
        75::numeric
      ) as red_energy,

      coalesce(
        case when (to_jsonb(r)->>'climbing') ~ '^[0-9]+(\.[0-9]+)?$'
          then (to_jsonb(r)->>'climbing')::numeric end,
        case when (to_jsonb(r)->>'climb') ~ '^[0-9]+(\.[0-9]+)?$'
          then (to_jsonb(r)->>'climb')::numeric end,
        case when (to_jsonb(r)->>'climber') ~ '^[0-9]+(\.[0-9]+)?$'
          then (to_jsonb(r)->>'climber')::numeric end,
        62::numeric
      ) as climbing_skill

    from with_prev wp
    cross join lateral jsonb_each(wp.energy_obj) e
    left join public.riders r
      on to_jsonb(r)->>'id' = e.key
  ),

  calculated as (
    select
      er.*,

      case
        when er.frame_number = 0 or er.km_marker <= 0 then 0::numeric

        -- KOM pressure, but calibrated lower than v5.
        when er.near_kom_zone and er.slope_percent >= 4 then 1.20::numeric
        when er.near_kom_zone and er.slope_percent >= 2 then 0.85::numeric
        when er.near_kom_zone then 0.55::numeric

        when er.slope_percent >= 7
          or er.terrain_type like '%climb%'
          or er.terrain_type like '%mountain%'
          then 1.30::numeric

        when er.slope_percent >= 4 then 0.95::numeric
        when er.slope_percent >= 2 then 0.55::numeric

        -- Descents: very small recovery / no drain.
        when er.slope_percent <= -5 then -0.10::numeric
        when er.slope_percent <= -2 then -0.04::numeric

        else 0.00::numeric
      end as terrain_cost_per_km,

      greatest(
        0.88::numeric,
        least(
          1.45::numeric,
          1::numeric + ((72::numeric - er.red_energy) / 95::numeric)
        )
      ) as red_factor,

      greatest(
        0.72::numeric,
        least(
          1.55::numeric,
          1::numeric + ((68::numeric - er.climbing_skill) / 70::numeric)
        )
      ) as climbing_factor,

      case
        when er.group_order = 1 and lower(er.group_code) like '%front%' then 1.14::numeric
        when lower(er.group_code) like '%dropped%' or lower(er.group_code) like '%outside%' then 1.22::numeric
        when lower(er.group_code) like '%chase%' then 1.10::numeric
        else 0.82::numeric
      end as group_factor

    from energy_rows er
  ),

  frame_cost as (
    select
      c.*,
      greatest(
        -0.25::numeric,
        least(
          2.20::numeric,
          c.km_delta
          * c.terrain_cost_per_km
          * c.red_factor
          * c.climbing_factor
          * c.group_factor
        )
      ) as frame_terrain_energy_cost
    from calculated c
  ),

  cumulative as (
    select
      fc.*,
      sum(fc.frame_terrain_energy_cost) over (
        partition by fc.rider_id
        order by fc.frame_number, fc.km_marker
        rows between unbounded preceding and current row
      ) as cumulative_terrain_energy_cost
    from frame_cost fc
  ),

  final_energy as (
    select
      c.*,

      greatest(
        0::numeric,
        least(
          100::numeric,
          100::numeric
          - c.base_v3_energy_used
          - c.cumulative_terrain_energy_cost
        )
      ) as new_green,

      case
        when greatest(0::numeric, least(100::numeric, 100::numeric - c.base_v3_energy_used - c.cumulative_terrain_energy_cost)) <= 10
          then 'empty'
        when greatest(0::numeric, least(100::numeric, 100::numeric - c.base_v3_energy_used - c.cumulative_terrain_energy_cost)) <= 20
          then 'critical'
        when greatest(0::numeric, least(100::numeric, 100::numeric - c.base_v3_energy_used - c.cumulative_terrain_energy_cost)) <= 35
          then 'low'
        else 'normal'
      end as energy_crack_state

    from cumulative c
  ),

  rebuilt as (
    select
      row_ctid,
      jsonb_object_agg(
        rider_id,
        old_energy_json
        || jsonb_build_object(
          'live_energy_pct', round(new_green, 2),
          'green_energy_pct', round(new_green, 2),
          'green_bar_pct', round(new_green, 2),
          'stage_energy_used_pct', round(100::numeric - new_green, 2),

          'stage_energy_model', 'stage_live_energy_smooth_v6_calibrated_kom_terrain',
          'terrain_energy_v6', true,
          'terrain_energy_v6_slope_percent', round(slope_percent, 3),
          'terrain_energy_v6_terrain_type', terrain_type,
          'terrain_energy_v6_near_kom_zone', near_kom_zone,
          'terrain_energy_v6_base_v3_energy_used', round(base_v3_energy_used, 2),
          'terrain_energy_v6_climbing_skill', round(climbing_skill, 2),
          'terrain_energy_v6_red_factor', round(red_factor, 3),
          'terrain_energy_v6_climbing_factor', round(climbing_factor, 3),
          'terrain_energy_v6_group_factor', round(group_factor, 3),
          'terrain_energy_v6_frame_cost', round(frame_terrain_energy_cost, 2),
          'terrain_energy_v6_cumulative_cost', round(cumulative_terrain_energy_cost, 2),
          'energy_crack_state_v6', energy_crack_state
        )
      ) as new_energy_obj
    from final_energy
    group by row_ctid
  )

  update public.race_stage_replay_frames f
  set metadata =
    jsonb_set(
      coalesce(f.metadata, '{}'::jsonb),
      '{rider_energy_v1}',
      r.new_energy_obj,
      true
    )
    || jsonb_build_object(
      'stage_live_energy_smooth_v6', true,
      'stage_live_energy_smooth_v6_reason', 'calibrated climb/KOM energy drain rebased from v3 baseline to avoid v5 overdepletion',
      'stage_live_energy_smooth_v6_applied_at', now()
    )
  from rebuilt r
  where f.ctid = r.row_ctid;

  get diagnostics v_updated_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_apply_stage_live_energy_smooth_v6',
    'updated_group_frame_rows', v_updated_rows,
    'stage_id', v_stage_id,
    'simulation_run_id', p_simulation_run_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_stage_live_energy_smooth_v7(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_updated_rows integer := 0;
begin
  select coalesce(
    p_stage_id,
    (
      select (to_jsonb(s)->>'stage_id')::uuid
      from public.race_stage_simulation_runs s
      where (to_jsonb(s)->>'id')::uuid = p_simulation_run_id
      limit 1
    )
  )
  into v_stage_id;

  if v_stage_id is null then
    raise exception 'Could not resolve stage_id for simulation_run_id %', p_simulation_run_id;
  end if;

  -- Reset to stable v3 baseline first.
  -- This prevents v5/v6/v7 stacking.
  perform public.race_engine_apply_stage_live_energy_smooth_v3(
    p_simulation_run_id,
    v_stage_id
  );

  with base_frames as (
    select
      f.ctid as row_ctid,
      f.frame_number,
      coalesce(f.km_marker, 0)::numeric as km_marker,
      coalesce(f.group_order, 1)::integer as group_order,
      coalesce(f.group_code, '') as group_code,

      coalesce(
        case when (f.metadata->>'slope_percent') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (f.metadata->>'slope_percent')::numeric end,
        0::numeric
      ) as slope_percent,

      lower(coalesce(f.metadata->>'terrain_type', '')) as terrain_type,
      coalesce(f.metadata, '{}'::jsonb) as metadata,

      case
        when exists (
          select 1
          from public.race_stage_points rsp
          where rsp.stage_id = v_stage_id
            and rsp.point_type = 'KOM'
            and rsp.km_from_start::numeric
              between greatest(0::numeric, coalesce(f.km_marker, 0)::numeric - 2::numeric)
                  and coalesce(f.km_marker, 0)::numeric + 12::numeric
        )
        then true
        else false
      end as near_kom_zone,

      case
        when jsonb_typeof(f.metadata->'rider_energy_v1') = 'object'
          then f.metadata->'rider_energy_v1'
        else '{}'::jsonb
      end as energy_obj

    from public.race_stage_replay_frames f
    where f.stage_id = v_stage_id
      and f.simulation_run_id = p_simulation_run_id
      and f.entity_type = 'group'
  ),

  with_prev as (
    select
      bf.*,
      greatest(
        0::numeric,
        coalesce(
          bf.km_marker - lag(bf.km_marker) over (
            partition by bf.group_order
            order by bf.frame_number, bf.km_marker
          ),
          0::numeric
        )
      ) as km_delta
    from base_frames bf
  ),

  energy_rows as (
    select
      wp.row_ctid,
      wp.frame_number,
      wp.km_marker,
      wp.group_order,
      wp.group_code,
      wp.slope_percent,
      wp.terrain_type,
      wp.near_kom_zone,
      wp.km_delta,
      e.key as rider_id,
      e.value as old_energy_json,

      coalesce(
        case when (e.value->>'minimum_live_energy_drain_v3') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'minimum_live_energy_drain_v3')::numeric end,
        case when (e.value->>'stage_energy_used_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then least((e.value->>'stage_energy_used_pct')::numeric, 40::numeric) end,
        0::numeric
      ) as base_v3_energy_used,

      coalesce(
        case when (e.value->>'red_energy_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'red_energy_pct')::numeric end,
        case when (e.value->>'red_bar_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'red_bar_pct')::numeric end,
        case when (e.value->>'start_freshness_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'start_freshness_pct')::numeric end,
        75::numeric
      ) as red_energy,

      coalesce(
        case when (to_jsonb(r)->>'climbing') ~ '^[0-9]+(\.[0-9]+)?$'
          then (to_jsonb(r)->>'climbing')::numeric end,
        case when (to_jsonb(r)->>'climb') ~ '^[0-9]+(\.[0-9]+)?$'
          then (to_jsonb(r)->>'climb')::numeric end,
        case when (to_jsonb(r)->>'climber') ~ '^[0-9]+(\.[0-9]+)?$'
          then (to_jsonb(r)->>'climber')::numeric end,
        62::numeric
      ) as climbing_skill

    from with_prev wp
    cross join lateral jsonb_each(wp.energy_obj) e
    left join public.riders r
      on to_jsonb(r)->>'id' = e.key
  ),

  calculated as (
    select
      er.*,

      case
        when er.frame_number = 0 or er.km_marker <= 0 then 0::numeric

        -- v7: stronger than v6, much softer than v5.
        when er.near_kom_zone and er.slope_percent >= 4 then 1.55::numeric
        when er.near_kom_zone and er.slope_percent >= 2 then 1.15::numeric
        when er.near_kom_zone then 0.78::numeric

        when er.slope_percent >= 7
          or er.terrain_type like '%climb%'
          or er.terrain_type like '%mountain%'
          then 1.55::numeric

        when er.slope_percent >= 4 then 1.15::numeric
        when er.slope_percent >= 2 then 0.72::numeric

        -- Descent / downhill: small recovery or no extra drain.
        when er.slope_percent <= -5 then -0.10::numeric
        when er.slope_percent <= -2 then -0.04::numeric

        else 0.02::numeric
      end as terrain_cost_per_km,

      greatest(
        0.86::numeric,
        least(
          1.60::numeric,
          1::numeric + ((72::numeric - er.red_energy) / 80::numeric)
        )
      ) as red_factor,

      greatest(
        0.70::numeric,
        least(
          1.80::numeric,
          1::numeric + ((70::numeric - er.climbing_skill) / 55::numeric)
        )
      ) as climbing_factor,

      case
        when er.group_order = 1 and lower(er.group_code) like '%front%' then 1.18::numeric
        when lower(er.group_code) like '%dropped%' or lower(er.group_code) like '%outside%' then 1.30::numeric
        when lower(er.group_code) like '%chase%' then 1.14::numeric
        else 0.88::numeric
      end as group_factor

    from energy_rows er
  ),

  frame_cost as (
    select
      c.*,
      greatest(
        -0.25::numeric,
        least(
          3.10::numeric,
          c.km_delta
          * c.terrain_cost_per_km
          * c.red_factor
          * c.climbing_factor
          * c.group_factor
        )
      ) as frame_terrain_energy_cost
    from calculated c
  ),

  cumulative as (
    select
      fc.*,
      sum(fc.frame_terrain_energy_cost) over (
        partition by fc.rider_id
        order by fc.frame_number, fc.km_marker
        rows between unbounded preceding and current row
      ) as cumulative_terrain_energy_cost
    from frame_cost fc
  ),

  final_energy as (
    select
      c.*,

      greatest(
        0::numeric,
        least(
          100::numeric,
          100::numeric
          - c.base_v3_energy_used
          - c.cumulative_terrain_energy_cost
        )
      ) as new_green,

      case
        when greatest(0::numeric, least(100::numeric, 100::numeric - c.base_v3_energy_used - c.cumulative_terrain_energy_cost)) <= 10
          then 'empty'
        when greatest(0::numeric, least(100::numeric, 100::numeric - c.base_v3_energy_used - c.cumulative_terrain_energy_cost)) <= 20
          then 'critical'
        when greatest(0::numeric, least(100::numeric, 100::numeric - c.base_v3_energy_used - c.cumulative_terrain_energy_cost)) <= 35
          then 'low'
        else 'normal'
      end as energy_crack_state

    from cumulative c
  ),

  rebuilt as (
    select
      row_ctid,
      jsonb_object_agg(
        rider_id,
        old_energy_json
        || jsonb_build_object(
          'live_energy_pct', round(new_green, 2),
          'green_energy_pct', round(new_green, 2),
          'green_bar_pct', round(new_green, 2),
          'stage_energy_used_pct', round(100::numeric - new_green, 2),

          'stage_energy_model', 'stage_live_energy_smooth_v7_balanced_kom_terrain',
          'terrain_energy_v7', true,
          'terrain_energy_v7_slope_percent', round(slope_percent, 3),
          'terrain_energy_v7_terrain_type', terrain_type,
          'terrain_energy_v7_near_kom_zone', near_kom_zone,
          'terrain_energy_v7_base_v3_energy_used', round(base_v3_energy_used, 2),
          'terrain_energy_v7_climbing_skill', round(climbing_skill, 2),
          'terrain_energy_v7_red_factor', round(red_factor, 3),
          'terrain_energy_v7_climbing_factor', round(climbing_factor, 3),
          'terrain_energy_v7_group_factor', round(group_factor, 3),
          'terrain_energy_v7_frame_cost', round(frame_terrain_energy_cost, 2),
          'terrain_energy_v7_cumulative_cost', round(cumulative_terrain_energy_cost, 2),
          'energy_crack_state_v7', energy_crack_state
        )
      ) as new_energy_obj
    from final_energy
    group by row_ctid
  )

  update public.race_stage_replay_frames f
  set metadata =
    jsonb_set(
      coalesce(f.metadata, '{}'::jsonb),
      '{rider_energy_v1}',
      r.new_energy_obj,
      true
    )
    || jsonb_build_object(
      'stage_live_energy_smooth_v7', true,
      'stage_live_energy_smooth_v7_reason', 'balanced climb/KOM energy drain between v5 overdepletion and v6 underdepletion',
      'stage_live_energy_smooth_v7_applied_at', now()
    )
  from rebuilt r
  where f.ctid = r.row_ctid;

  get diagnostics v_updated_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_apply_stage_live_energy_smooth_v7',
    'updated_group_frame_rows', v_updated_rows,
    'stage_id', v_stage_id,
    'simulation_run_id', p_simulation_run_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_normalize_road_group_display_semantics_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
begin
  select coalesce(
    p_stage_id,
    (
      select (to_jsonb(s)->>'stage_id')::uuid
      from public.race_stage_simulation_runs s
      where (to_jsonb(s)->>'id')::uuid = p_simulation_run_id
      limit 1
    )
  )
  into v_stage_id;

  return jsonb_build_object(
    'status', 'skipped',
    'function', 'race_engine_normalize_road_group_display_semantics_v1',
    'reason', 'backend group relabeling is suspended; frontend canonical road groups own G/P/B labels',
    'stage_id', v_stage_id,
    'simulation_run_id', p_simulation_run_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_stage_live_energy_smooth_v8(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_updated_rows integer := 0;
begin
  select coalesce(
    p_stage_id,
    (
      select (to_jsonb(s)->>'stage_id')::uuid
      from public.race_stage_simulation_runs s
      where (to_jsonb(s)->>'id')::uuid = p_simulation_run_id
      limit 1
    )
  )
  into v_stage_id;

  if v_stage_id is null then
    raise exception 'Could not resolve stage_id for simulation_run_id %', p_simulation_run_id;
  end if;

  -- Rebase from the current balanced v7 model first if available.
  if to_regprocedure('public.race_engine_apply_stage_live_energy_smooth_v7(uuid,uuid)') is not null then
    perform public.race_engine_apply_stage_live_energy_smooth_v7(
      p_simulation_run_id,
      v_stage_id
    );
  end if;

  with recursive
  base_frames as (
    select
      f.ctid as row_ctid,
      f.frame_number::integer as frame_number,
      coalesce(f.km_marker, 0)::numeric as km_marker,
      coalesce(f.group_order, 1)::integer as group_order,
      coalesce(f.group_code, '') as group_code,
      coalesce(f.metadata, '{}'::jsonb) as metadata,
      coalesce(
        case when (coalesce(f.metadata, '{}'::jsonb)->>'slope_percent') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (coalesce(f.metadata, '{}'::jsonb)->>'slope_percent')::numeric end,
        0::numeric
      ) as slope_percent,
      lower(coalesce(coalesce(f.metadata, '{}'::jsonb)->>'terrain_type', '')) as terrain_type,
      case
        when jsonb_typeof(coalesce(f.metadata, '{}'::jsonb)->'rider_energy_v1') = 'object'
          then coalesce(f.metadata, '{}'::jsonb)->'rider_energy_v1'
        else '{}'::jsonb
      end as energy_obj
    from public.race_stage_replay_frames f
    where f.stage_id = v_stage_id
      and f.simulation_run_id = p_simulation_run_id
      and f.entity_type = 'group'
  ),

  energy_entries as (
    select
      bf.row_ctid,
      bf.frame_number,
      bf.km_marker,
      bf.group_order,
      bf.group_code,
      bf.slope_percent,
      bf.terrain_type,
      e.key as rider_id,
      e.value as old_energy_json,
      coalesce(
        case when (e.value->>'live_energy_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'live_energy_pct')::numeric end,
        case when (e.value->>'green_energy_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'green_energy_pct')::numeric end,
        case when (e.value->>'green_bar_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'green_bar_pct')::numeric end,
        100::numeric
      ) as raw_green,
      coalesce(
        case when (e.value->>'red_energy_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'red_energy_pct')::numeric end,
        case when (e.value->>'red_bar_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'red_bar_pct')::numeric end,
        case when (e.value->>'start_freshness_pct') ~ '^[0-9]+(\.[0-9]+)?$'
          then (e.value->>'start_freshness_pct')::numeric end,
        75::numeric
      ) as red_freshness,
      coalesce(
        case when (to_jsonb(r)->>'climbing') ~ '^[0-9]+(\.[0-9]+)?$'
          then (to_jsonb(r)->>'climbing')::numeric end,
        case when (to_jsonb(r)->>'climb') ~ '^[0-9]+(\.[0-9]+)?$'
          then (to_jsonb(r)->>'climb')::numeric end,
        case when (to_jsonb(r)->>'climber') ~ '^[0-9]+(\.[0-9]+)?$'
          then (to_jsonb(r)->>'climber')::numeric end,
        62::numeric
      ) as climbing_skill
    from base_frames bf
    cross join lateral jsonb_each(bf.energy_obj) e
    left join public.riders r
      on to_jsonb(r)->>'id' = e.key
  ),

  ordered as (
    select
      ee.*,
      row_number() over (
        partition by ee.rider_id
        order by ee.frame_number, ee.km_marker, ee.row_ctid::text
      ) as rn,
      lag(ee.km_marker) over (
        partition by ee.rider_id
        order by ee.frame_number, ee.km_marker, ee.row_ctid::text
      ) as previous_km_marker,
      lag(ee.slope_percent) over (
        partition by ee.rider_id
        order by ee.frame_number, ee.km_marker, ee.row_ctid::text
      ) as previous_slope_percent
    from energy_entries ee
  ),

  adjusted as (
    select
      o.*,
      greatest(0::numeric, least(100::numeric, o.raw_green)) as adjusted_green,
      false as v8_climb_clamped,
      0::numeric as v8_minimum_climb_drain,
      0::numeric as v8_allowed_recovery
    from ordered o
    where o.rn = 1

    union all

    select
      o.*,
      case
        when (
          o.slope_percent >= 1.5
          or coalesce(o.previous_slope_percent, 0) >= 1.5
          or o.terrain_type like '%climb%'
          or o.terrain_type like '%mountain%'
        ) then
          least(
            greatest(0::numeric, least(100::numeric, o.raw_green)),
            greatest(
              0::numeric,
              a.adjusted_green -
              greatest(
                0.05::numeric,
                least(
                  1.80::numeric,
                  greatest(0::numeric, o.km_marker - coalesce(o.previous_km_marker, o.km_marker))
                  * greatest(0.25::numeric, least(1.45::numeric, 0.35::numeric + greatest(o.slope_percent, coalesce(o.previous_slope_percent, 0), 1.5::numeric) / 5::numeric))
                  * greatest(0.75::numeric, least(1.65::numeric, 1::numeric + ((70::numeric - o.climbing_skill) / 70::numeric)))
                  * greatest(0.85::numeric, least(1.45::numeric, 1::numeric + ((72::numeric - o.red_freshness) / 95::numeric)))
                )
              )
            )
          )

        when o.slope_percent <= -2 then
          least(
            greatest(0::numeric, least(100::numeric, o.raw_green)),
            least(100::numeric, a.adjusted_green + 5::numeric)
          )

        else
          least(
            greatest(0::numeric, least(100::numeric, o.raw_green)),
            least(100::numeric, a.adjusted_green + 2::numeric)
          )
      end as adjusted_green,

      (
        (
          o.slope_percent >= 1.5
          or coalesce(o.previous_slope_percent, 0) >= 1.5
          or o.terrain_type like '%climb%'
          or o.terrain_type like '%mountain%'
        )
        and greatest(0::numeric, least(100::numeric, o.raw_green)) > a.adjusted_green
      ) as v8_climb_clamped,

      case
        when (
          o.slope_percent >= 1.5
          or coalesce(o.previous_slope_percent, 0) >= 1.5
          or o.terrain_type like '%climb%'
          or o.terrain_type like '%mountain%'
        ) then
          greatest(
            0.05::numeric,
            least(
              1.80::numeric,
              greatest(0::numeric, o.km_marker - coalesce(o.previous_km_marker, o.km_marker))
              * greatest(0.25::numeric, least(1.45::numeric, 0.35::numeric + greatest(o.slope_percent, coalesce(o.previous_slope_percent, 0), 1.5::numeric) / 5::numeric))
              * greatest(0.75::numeric, least(1.65::numeric, 1::numeric + ((70::numeric - o.climbing_skill) / 70::numeric)))
              * greatest(0.85::numeric, least(1.45::numeric, 1::numeric + ((72::numeric - o.red_freshness) / 95::numeric)))
            )
          )
        else 0::numeric
      end as v8_minimum_climb_drain,

      case
        when o.slope_percent <= -2 then 5::numeric
        else 2::numeric
      end as v8_allowed_recovery

    from adjusted a
    join ordered o
      on o.rider_id = a.rider_id
     and o.rn = a.rn + 1
  ),

  rebuilt as (
    select
      row_ctid,
      jsonb_object_agg(
        rider_id,
        old_energy_json
        || jsonb_build_object(
          'live_energy_pct', round(adjusted_green, 2),
          'green_energy_pct', round(adjusted_green, 2),
          'green_bar_pct', round(adjusted_green, 2),
          'stage_energy_used_pct', round(100::numeric - adjusted_green, 2),
          'stage_energy_model', 'stage_live_energy_smooth_v8_climb_monotonic',
          'terrain_energy_v8', true,
          'terrain_energy_v8_rule', 'green cannot recover on climbs; descent recovery is capped',
          'terrain_energy_v8_raw_green_before_clamp', round(raw_green, 2),
          'terrain_energy_v8_adjusted_green', round(adjusted_green, 2),
          'terrain_energy_v8_slope_percent', round(slope_percent, 3),
          'terrain_energy_v8_terrain_type', terrain_type,
          'terrain_energy_v8_climbing_skill', round(climbing_skill, 2),
          'terrain_energy_v8_red_freshness', round(red_freshness, 2),
          'terrain_energy_v8_minimum_climb_drain', round(v8_minimum_climb_drain, 2),
          'terrain_energy_v8_allowed_recovery', round(v8_allowed_recovery, 2),
          'terrain_energy_v8_climb_clamped', v8_climb_clamped
        )
      ) as new_energy_obj
    from adjusted
    group by row_ctid
  )

  update public.race_stage_replay_frames f
  set metadata =
    jsonb_set(
      coalesce(f.metadata, '{}'::jsonb),
      '{rider_energy_v1}',
      r.new_energy_obj,
      true
    )
    || jsonb_build_object(
      'stage_live_energy_smooth_v8', true,
      'stage_live_energy_smooth_v8_reason', 'climb-monotonic live green energy; no climb recovery; descent recovery capped',
      'stage_live_energy_smooth_v8_applied_at', now()
    )
  from rebuilt r
  where f.ctid = r.row_ctid;

  get diagnostics v_updated_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_apply_stage_live_energy_smooth_v8',
    'updated_group_frame_rows', v_updated_rows,
    'stage_id', v_stage_id,
    'simulation_run_id', p_simulation_run_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_enforce_replay_gap_continuity_v1(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid, p_max_gap_closure_seconds_per_frame numeric DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_distance_km numeric;
  v_source_group_rows integer := 0;
  v_source_rider_rows integer := 0;
  v_deleted_group_rows integer := 0;
  v_inserted_group_rows integer := 0;
  v_frame_count integer := 0;
  v_max_groups_in_frame integer := 0;
begin
  select
    sr.race_id,
    sr.stage_id,
    rs.distance_km
  into
    v_race_id,
    v_stage_id,
    v_distance_km
  from public.race_stage_simulation_runs sr
  join public.race_stages rs
    on rs.id = sr.stage_id
  where sr.id = p_simulation_run_id
    and (p_stage_id is null or sr.stage_id = p_stage_id)
    and sr.status = 'completed';

  if v_race_id is null or v_stage_id is null then
    raise exception
      'Completed simulation run % was not found for stage %.',
      p_simulation_run_id,
      p_stage_id;
  end if;

  drop table if exists pg_temp.tmp_replay_gap_source_frames;
  drop table if exists pg_temp.tmp_replay_gap_source_riders;
  drop table if exists pg_temp.tmp_replay_gap_safe_riders;
  drop table if exists pg_temp.tmp_replay_gap_regrouped;

  create temporary table tmp_replay_gap_source_frames on commit drop as
  select
    f.id,
    f.frame_number::integer as frame_number,
    coalesce(f.race_seconds, 0)::integer as race_seconds,
    coalesce(f.km_marker, 0)::numeric as km_marker,
    coalesce(f.group_order, 1)::integer as group_order,
    coalesce(f.group_code, '')::text as group_code,
    coalesce(f.group_label, '')::text as group_label,
    greatest(0, coalesce(f.gap_seconds, 0))::numeric as gap_seconds,
    greatest(1, coalesce(f.avg_speed_kmh, 38))::numeric as avg_speed_kmh,
    coalesce(f.rider_ids, array[]::uuid[]) as rider_ids,
    coalesce(f.rider_names, array[]::text[]) as rider_names,
    coalesce(f.team_names, array[]::text[]) as team_names,
    coalesce(f.metadata, '{}'::jsonb) as metadata
  from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group'
  order by f.frame_number, f.group_order, f.group_code;

  get diagnostics v_source_group_rows = row_count;

  if v_source_group_rows = 0 then
    return jsonb_build_object(
      'status', 'skipped',
      'function', 'race_engine_enforce_replay_gap_continuity_v1',
      'reason', 'no_group_replay_frames_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id
    );
  end if;

  create temporary table tmp_replay_gap_source_riders on commit drop as
  with frame_context as (
    select
      frame_number,
      min(race_seconds)::integer as race_seconds,
      max(km_marker)::numeric as leader_km,
      max(avg_speed_kmh)::numeric as leader_speed_kmh,
      (array_agg(metadata order by group_order, group_code))[1] as frame_metadata,
      coalesce(
        (array_agg(nullif(metadata->>'terrain_type', '') order by group_order, group_code))[1],
        (array_agg(nullif(metadata->>'current_terrain_type', '') order by group_order, group_code))[1],
        ''
      ) as frame_terrain_type,
      coalesce(
        nullif((array_agg(metadata->>'slope_percent' order by group_order, group_code))[1], '')::numeric,
        nullif((array_agg(metadata->>'current_slope_percent' order by group_order, group_code))[1], '')::numeric,
        0
      ) as frame_slope_percent
    from tmp_replay_gap_source_frames
    group by frame_number
  )
  select
    sf.frame_number,
    fc.race_seconds,
    fc.leader_km,
    fc.leader_speed_kmh,
    fc.frame_metadata,
    fc.frame_terrain_type,
    fc.frame_slope_percent,
    sf.group_order as source_group_order,
    sf.group_code as source_group_code,
    sf.group_label as source_group_label,
    sf.km_marker as source_km_marker,
    sf.gap_seconds as raw_gap_seconds,
    sf.avg_speed_kmh,
    rider.rider_id,
    rider.rider_ordinal::integer as rider_ordinal,
    coalesce(sf.rider_names[rider.rider_ordinal::integer], 'Rider') as rider_name,
    coalesce(sf.team_names[rider.rider_ordinal::integer], '') as team_name,
    row_number() over (
      partition by sf.frame_number
      order by sf.gap_seconds, sf.group_order, rider.rider_ordinal, rider.rider_id
    )::integer as live_rank_hint
  from tmp_replay_gap_source_frames sf
  join frame_context fc
    on fc.frame_number = sf.frame_number
  cross join lateral unnest(sf.rider_ids) with ordinality as rider(rider_id, rider_ordinal)
  where array_length(sf.rider_ids, 1) is not null;

  get diagnostics v_source_rider_rows = row_count;

  if v_source_rider_rows = 0 then
    return jsonb_build_object(
      'status', 'skipped',
      'function', 'race_engine_enforce_replay_gap_continuity_v1',
      'reason', 'no_rider_arrays_found_in_group_frames',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id,
      'source_group_rows', v_source_group_rows
    );
  end if;

  /*
   * Rider-level gap continuity.
   * A rider/group may lose time quickly, but cannot close a big gap instantly.
   * This is the backend expression of the strict visual/physics rule:
   *   - merge only below 10 seconds,
   *   - big gaps need many frames / many kilometres to close.
   */
  create temporary table tmp_replay_gap_safe_riders on commit drop as
  with recursive ordered_rows as (
    select
      source.*,
      row_number() over (
        partition by source.rider_id
        order by source.frame_number
      )::integer as rider_frame_index
    from tmp_replay_gap_source_riders source
  ),
  safe_rows as (
    select
      ordered_rows.*,
      ordered_rows.raw_gap_seconds::numeric as safe_gap_seconds
    from ordered_rows
    where ordered_rows.rider_frame_index = 1

    union all

    select
      next_row.*,
      case
        when next_row.raw_gap_seconds < previous.safe_gap_seconds then
          greatest(
            next_row.raw_gap_seconds,
            previous.safe_gap_seconds - greatest(
              2::numeric,
              least(
                8::numeric,
                p_max_gap_closure_seconds_per_frame
                * greatest(
                    0.50::numeric,
                    least(
                      1.50::numeric,
                      abs(next_row.leader_km - previous.leader_km) / 0.50
                    )
                  )
              )
            )
          )
        else
          next_row.raw_gap_seconds
      end::numeric as safe_gap_seconds
    from safe_rows previous
    join ordered_rows next_row
      on next_row.rider_id = previous.rider_id
     and next_row.rider_frame_index = previous.rider_frame_index + 1
  )
  select *
  from safe_rows;

  create index on tmp_replay_gap_safe_riders(frame_number, safe_gap_seconds);
  create index on tmp_replay_gap_safe_riders(rider_id, frame_number);

  /*
   * Rebuild road groups from continuity-protected rider gaps.
   * New group boundary is strict: adjacent gap >= 10 seconds starts a new group.
   */
  create temporary table tmp_replay_gap_regrouped on commit drop as
  with ranked_riders as (
    select
      safe.*,
      row_number() over (
        partition by safe.frame_number
        order by safe.safe_gap_seconds, safe.live_rank_hint, safe.rider_id
      )::integer as live_rank,
      lag(safe.safe_gap_seconds) over (
        partition by safe.frame_number
        order by safe.safe_gap_seconds, safe.live_rank_hint, safe.rider_id
      ) as previous_safe_gap_seconds
    from tmp_replay_gap_safe_riders safe
  ),
  group_boundaries as (
    select
      ranked.*,
      case
        when ranked.live_rank = 1 then 1
        when ranked.leader_km <= 12 then 0
        when greatest(
          0,
          ranked.safe_gap_seconds - coalesce(
            ranked.previous_safe_gap_seconds,
            ranked.safe_gap_seconds
          )
        ) >= 10
        then 1
        else 0
      end::integer as starts_new_group
    from ranked_riders ranked
  ),
  physical_groups as (
    select
      boundary.*,
      sum(boundary.starts_new_group) over (
        partition by boundary.frame_number
        order by boundary.live_rank
        rows between unbounded preceding and current row
      )::integer as physical_group_index
    from group_boundaries boundary
  ),
  physical_group_summary as (
    select
      group_row.frame_number,
      min(group_row.race_seconds)::integer as race_seconds,
      group_row.physical_group_index,
      count(*)::integer as rider_count,
      min(group_row.live_rank)::integer as first_live_rank,
      min(group_row.safe_gap_seconds)::numeric as minimum_gap_seconds,
      round(avg(group_row.safe_gap_seconds), 3)::numeric as average_gap_seconds,
      round(avg(group_row.avg_speed_kmh), 2)::numeric as avg_speed_kmh,
      max(group_row.leader_km)::numeric as leader_km,
      max(group_row.leader_speed_kmh)::numeric as leader_speed_kmh,
      (array_agg(group_row.frame_metadata order by group_row.live_rank))[1] as frame_metadata,
      (array_agg(group_row.frame_terrain_type order by group_row.live_rank))[1] as current_terrain_type,
      (array_agg(group_row.frame_slope_percent order by group_row.live_rank))[1] as current_slope_percent,
      array_agg(group_row.rider_id order by group_row.live_rank) as rider_ids,
      array_agg(group_row.rider_name order by group_row.live_rank) as rider_names,
      array_agg(group_row.team_name order by group_row.live_rank) as team_names
    from physical_groups group_row
    group by group_row.frame_number, group_row.physical_group_index
  ),
  peloton_group_by_frame as (
    select distinct on (summary.frame_number)
      summary.frame_number,
      summary.physical_group_index as peloton_group_index,
      summary.rider_count as peloton_rider_count
    from physical_group_summary summary
    order by
      summary.frame_number,
      summary.rider_count desc,
      summary.average_gap_seconds asc,
      summary.first_live_rank asc
  ),
  mapped_groups as (
    select
      summary.*,
      peloton.peloton_group_index,
      peloton.peloton_rider_count,
      case
        when summary.physical_group_index = peloton.peloton_group_index then 'main_peloton'
        when summary.physical_group_index < peloton.peloton_group_index then
          case when summary.physical_group_index = 1 then 'front_group' else 'chase_group' end
        when summary.physical_group_index = peloton.peloton_group_index + 1 then 'dropped_group'
        else 'outside_group'
      end as base_group_code,
      case
        when summary.physical_group_index = peloton.peloton_group_index then 'main_peloton'
        when summary.physical_group_index = 1 and summary.physical_group_index < peloton.peloton_group_index then 'front_group'
        when summary.physical_group_index < peloton.peloton_group_index then
          'chase_group_' || lpad(summary.physical_group_index::text, 2, '0')
        when summary.physical_group_index = peloton.peloton_group_index + 1 then 'dropped_group'
        else
          'outside_group_' || lpad(
            (summary.physical_group_index - peloton.peloton_group_index - 1)::text,
            2,
            '0'
          )
      end as group_code,
      case
        when summary.physical_group_index = peloton.peloton_group_index then 'Peloton'
        when summary.physical_group_index = 1 and summary.physical_group_index < peloton.peloton_group_index then 'Front group'
        when summary.physical_group_index < peloton.peloton_group_index then
          'Chasing group ' || summary.physical_group_index::text
        when summary.physical_group_index = peloton.peloton_group_index + 1 then 'Dropped group'
        else
          'Outside group ' || (summary.physical_group_index - peloton.peloton_group_index - 1)::text
      end as group_label
    from physical_group_summary summary
    join peloton_group_by_frame peloton
      on peloton.frame_number = summary.frame_number
  ),
  monotone_gaps as (
    select
      mapped.*,
      case
        when mapped.physical_group_index = 1 then 0
        else max(round(mapped.minimum_gap_seconds)::integer) over (
          partition by mapped.frame_number
          order by mapped.physical_group_index
          rows between unbounded preceding and current row
        )
      end::integer as gap_seconds
    from mapped_groups mapped
  )
  select
    monotone.*,
    greatest(
      0,
      least(
        v_distance_km,
        round(
          (
            monotone.leader_km -
            (
              monotone.gap_seconds::numeric *
              greatest(monotone.avg_speed_kmh, 8)::numeric /
              3600.0
            )
          ),
          3
        )
      )
    )::numeric as km_marker
  from monotone_gaps monotone;

  select count(*), coalesce(max(groups_per_frame), 0)
  into v_frame_count, v_max_groups_in_frame
  from (
    select frame_number, count(*) as groups_per_frame
    from tmp_replay_gap_regrouped
    group by frame_number
  ) x;

  delete from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group';

  get diagnostics v_deleted_group_rows = row_count;

  insert into public.race_stage_replay_frames (
    simulation_run_id,
    race_id,
    stage_id,
    frame_number,
    race_seconds,
    km_marker,
    group_code,
    group_label,
    group_order,
    gap_seconds,
    avg_speed_kmh,
    rider_ids,
    rider_names,
    team_names,
    entity_type,
    metadata
  )
  select
    p_simulation_run_id,
    v_race_id,
    v_stage_id,
    replay.frame_number,
    replay.race_seconds,
    replay.km_marker,
    replay.group_code,
    replay.group_label,
    replay.physical_group_index as group_order,
    replay.gap_seconds,
    replay.avg_speed_kmh,
    replay.rider_ids,
    replay.rider_names,
    replay.team_names,
    'group' as entity_type,
    coalesce(replay.frame_metadata, '{}'::jsonb) ||
      jsonb_build_object(
        'source', 'race_engine_v2_segment_replay_gap_continuity_v1',
        'model', 'strict_10s_merge_with_temporal_gap_continuity',
        'strict_merge_threshold_seconds', 10,
        'max_gap_closure_seconds_per_frame', p_max_gap_closure_seconds_per_frame,
        'base_group_code', replay.base_group_code,
        'physical_group_index', replay.physical_group_index,
        'peloton_group_index', replay.peloton_group_index,
        'peloton_rider_count', replay.peloton_rider_count,
        'group_size', replay.rider_count,
        'average_safe_gap_seconds', replay.average_gap_seconds,
        'minimum_safe_gap_seconds', replay.minimum_gap_seconds,
        'terrain_type', replay.current_terrain_type,
        'slope_percent', replay.current_slope_percent,
        'gap_continuity_patch_applied', true
      ) as metadata
  from tmp_replay_gap_regrouped replay
  order by replay.frame_number, replay.physical_group_index;

  get diagnostics v_inserted_group_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_enforce_replay_gap_continuity_v1',
    'simulation_run_id', p_simulation_run_id,
    'race_id', v_race_id,
    'stage_id', v_stage_id,
    'source_group_rows', v_source_group_rows,
    'source_rider_rows', v_source_rider_rows,
    'deleted_group_rows', v_deleted_group_rows,
    'inserted_group_rows', v_inserted_group_rows,
    'distinct_frame_numbers', v_frame_count,
    'max_groups_in_one_frame', v_max_groups_in_frame,
    'strict_merge_threshold_seconds', 10,
    'max_gap_closure_seconds_per_frame', p_max_gap_closure_seconds_per_frame
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_enforce_replay_gap_continuity_v2(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid, p_max_gap_closure_seconds_per_frame numeric DEFAULT 6, p_group_span_limit_seconds numeric DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_distance_km numeric;
  v_source_group_rows integer := 0;
  v_source_rider_rows integer := 0;
  v_deleted_group_rows integer := 0;
  v_inserted_group_rows integer := 0;
  v_distinct_frames integer := 0;
  v_max_groups_in_frame integer := 0;
begin
  select
    sr.race_id,
    sr.stage_id,
    rs.distance_km
  into
    v_race_id,
    v_stage_id,
    v_distance_km
  from public.race_stage_simulation_runs sr
  join public.race_stages rs
    on rs.id = sr.stage_id
  where sr.id = p_simulation_run_id
    and (p_stage_id is null or sr.stage_id = p_stage_id)
    and sr.status = 'completed';

  if v_race_id is null or v_stage_id is null then
    raise exception
      'Completed simulation run % was not found for stage %.',
      p_simulation_run_id,
      p_stage_id;
  end if;

  drop table if exists pg_temp.tmp_replay_gap_v2_source_frames;
  drop table if exists pg_temp.tmp_replay_gap_v2_source_riders;
  drop table if exists pg_temp.tmp_replay_gap_v2_safe_riders;
  drop table if exists pg_temp.tmp_replay_gap_v2_regrouped;

  create temporary table tmp_replay_gap_v2_source_frames on commit drop as
  select
    f.id,
    f.frame_number::integer as frame_number,
    coalesce(f.race_seconds, 0)::integer as race_seconds,
    coalesce(f.km_marker, 0)::numeric as km_marker,
    coalesce(f.group_order, 1)::integer as group_order,
    coalesce(f.group_code, '')::text as group_code,
    coalesce(f.group_label, '')::text as group_label,
    greatest(0, coalesce(f.gap_seconds, 0))::numeric as gap_seconds,
    greatest(1, coalesce(f.avg_speed_kmh, 38))::numeric as avg_speed_kmh,
    coalesce(f.rider_ids, array[]::uuid[]) as rider_ids,
    coalesce(f.rider_names, array[]::text[]) as rider_names,
    coalesce(f.team_names, array[]::text[]) as team_names,
    coalesce(f.metadata, '{}'::jsonb) as metadata
  from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group'
  order by f.frame_number, f.group_order, f.group_code;

  get diagnostics v_source_group_rows = row_count;

  if v_source_group_rows = 0 then
    return jsonb_build_object(
      'status', 'skipped',
      'function', 'race_engine_enforce_replay_gap_continuity_v2',
      'reason', 'no_group_replay_frames_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id
    );
  end if;

  create temporary table tmp_replay_gap_v2_source_riders on commit drop as
  with frame_context as (
    select
      frame_number,
      min(race_seconds)::integer as race_seconds,
      max(km_marker)::numeric as leader_km,
      max(avg_speed_kmh)::numeric as leader_speed_kmh,
      (array_agg(metadata order by group_order, group_code))[1] as frame_metadata,
      coalesce(
        (array_agg(nullif(metadata->>'terrain_type', '') order by group_order, group_code))[1],
        (array_agg(nullif(metadata->>'current_terrain_type', '') order by group_order, group_code))[1],
        ''
      ) as frame_terrain_type,
      coalesce(
        nullif((array_agg(metadata->>'slope_percent' order by group_order, group_code))[1], '')::numeric,
        nullif((array_agg(metadata->>'current_slope_percent' order by group_order, group_code))[1], '')::numeric,
        0
      ) as frame_slope_percent
    from tmp_replay_gap_v2_source_frames
    group by frame_number
  )
  select
    sf.frame_number,
    fc.race_seconds,
    fc.leader_km,
    fc.leader_speed_kmh,
    fc.frame_metadata,
    fc.frame_terrain_type,
    fc.frame_slope_percent,
    sf.group_order as source_group_order,
    sf.group_code as source_group_code,
    sf.group_label as source_group_label,
    sf.km_marker as source_km_marker,
    sf.gap_seconds as raw_gap_seconds,
    sf.avg_speed_kmh,
    rider.rider_id,
    rider.rider_ordinal::integer as rider_ordinal,
    coalesce(sf.rider_names[rider.rider_ordinal::integer], 'Rider') as rider_name,
    coalesce(sf.team_names[rider.rider_ordinal::integer], '') as team_name,
    row_number() over (
      partition by sf.frame_number
      order by sf.gap_seconds, sf.group_order, rider.rider_ordinal, rider.rider_id
    )::integer as live_rank_hint
  from tmp_replay_gap_v2_source_frames sf
  join frame_context fc
    on fc.frame_number = sf.frame_number
  cross join lateral unnest(sf.rider_ids) with ordinality as rider(rider_id, rider_ordinal)
  where array_length(sf.rider_ids, 1) is not null;

  get diagnostics v_source_rider_rows = row_count;

  if v_source_rider_rows = 0 then
    return jsonb_build_object(
      'status', 'skipped',
      'function', 'race_engine_enforce_replay_gap_continuity_v2',
      'reason', 'no_rider_arrays_found_in_group_frames',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id,
      'source_group_rows', v_source_group_rows
    );
  end if;

  create temporary table tmp_replay_gap_v2_safe_riders on commit drop as
  with recursive ordered_rows as (
    select
      source.*,
      row_number() over (
        partition by source.rider_id
        order by source.frame_number
      )::integer as rider_frame_index
    from tmp_replay_gap_v2_source_riders source
  ),
  safe_rows as (
    select
      ordered_rows.*,
      ordered_rows.raw_gap_seconds::numeric as safe_gap_seconds
    from ordered_rows
    where ordered_rows.rider_frame_index = 1

    union all

    select
      next_row.*,
      case
        when next_row.raw_gap_seconds < previous.safe_gap_seconds then
          greatest(
            next_row.raw_gap_seconds,
            previous.safe_gap_seconds - greatest(
              2::numeric,
              least(
                8::numeric,
                p_max_gap_closure_seconds_per_frame
                * greatest(
                    0.50::numeric,
                    least(
                      1.50::numeric,
                      abs(next_row.leader_km - previous.leader_km) / 0.50
                    )
                  )
              )
            )
          )
        else
          next_row.raw_gap_seconds
      end::numeric as safe_gap_seconds
    from safe_rows previous
    join ordered_rows next_row
      on next_row.rider_id = previous.rider_id
     and next_row.rider_frame_index = previous.rider_frame_index + 1
  )
  select *
  from safe_rows;

  create index on tmp_replay_gap_v2_safe_riders(frame_number, safe_gap_seconds);
  create index on tmp_replay_gap_v2_safe_riders(rider_id, frame_number);

  create temporary table tmp_replay_gap_v2_regrouped on commit drop as
  with recursive
  ranked_riders as (
    select
      safe.*,
      row_number() over (
        partition by safe.frame_number
        order by safe.safe_gap_seconds, safe.live_rank_hint, safe.rider_id
      )::integer as live_rank
    from tmp_replay_gap_v2_safe_riders safe
  ),
  grouped_riders as (
    select
      ranked.*,
      1::integer as physical_group_index,
      ranked.safe_gap_seconds::numeric as group_start_gap_seconds,
      ranked.safe_gap_seconds::numeric as previous_safe_gap_seconds
    from ranked_riders ranked
    where ranked.live_rank = 1

    union all

    select
      next_rider.*,
      case
        when next_rider.leader_km <= 12 then
          previous.physical_group_index
        when greatest(0, next_rider.safe_gap_seconds - previous.safe_gap_seconds) < p_group_span_limit_seconds
         and greatest(0, next_rider.safe_gap_seconds - previous.group_start_gap_seconds) < p_group_span_limit_seconds
        then
          previous.physical_group_index
        else
          previous.physical_group_index + 1
      end::integer as physical_group_index,
      case
        when next_rider.leader_km <= 12 then
          previous.group_start_gap_seconds
        when greatest(0, next_rider.safe_gap_seconds - previous.safe_gap_seconds) < p_group_span_limit_seconds
         and greatest(0, next_rider.safe_gap_seconds - previous.group_start_gap_seconds) < p_group_span_limit_seconds
        then
          previous.group_start_gap_seconds
        else
          next_rider.safe_gap_seconds
      end::numeric as group_start_gap_seconds,
      next_rider.safe_gap_seconds::numeric as previous_safe_gap_seconds
    from grouped_riders previous
    join ranked_riders next_rider
      on next_rider.frame_number = previous.frame_number
     and next_rider.live_rank = previous.live_rank + 1
  ),
  physical_group_summary as (
    select
      group_row.frame_number,
      min(group_row.race_seconds)::integer as race_seconds,
      group_row.physical_group_index,
      count(*)::integer as rider_count,
      min(group_row.live_rank)::integer as first_live_rank,
      min(group_row.safe_gap_seconds)::numeric as minimum_gap_seconds,
      max(group_row.safe_gap_seconds)::numeric as maximum_gap_seconds,
      round(avg(group_row.safe_gap_seconds), 3)::numeric as average_gap_seconds,
      round(avg(group_row.avg_speed_kmh), 2)::numeric as avg_speed_kmh,
      max(group_row.leader_km)::numeric as leader_km,
      max(group_row.leader_speed_kmh)::numeric as leader_speed_kmh,
      (array_agg(group_row.frame_metadata order by group_row.live_rank))[1] as frame_metadata,
      (array_agg(group_row.frame_terrain_type order by group_row.live_rank))[1] as current_terrain_type,
      (array_agg(group_row.frame_slope_percent order by group_row.live_rank))[1] as current_slope_percent,
      array_agg(group_row.rider_id order by group_row.live_rank) as rider_ids,
      array_agg(group_row.rider_name order by group_row.live_rank) as rider_names,
      array_agg(group_row.team_name order by group_row.live_rank) as team_names
    from grouped_riders group_row
    group by group_row.frame_number, group_row.physical_group_index
  ),
  peloton_group_by_frame as (
    select distinct on (summary.frame_number)
      summary.frame_number,
      summary.physical_group_index as peloton_group_index,
      summary.rider_count as peloton_rider_count
    from physical_group_summary summary
    order by
      summary.frame_number,
      summary.rider_count desc,
      summary.average_gap_seconds asc,
      summary.first_live_rank asc
  ),
  mapped_groups as (
    select
      summary.*,
      peloton.peloton_group_index,
      peloton.peloton_rider_count,
      case
        when summary.physical_group_index = peloton.peloton_group_index then 'main_peloton'
        when summary.physical_group_index < peloton.peloton_group_index then
          case when summary.physical_group_index = 1 then 'front_group' else 'chase_group' end
        when summary.physical_group_index = peloton.peloton_group_index + 1 then 'dropped_group'
        else 'outside_group'
      end as base_group_code,
      case
        when summary.physical_group_index = peloton.peloton_group_index then 'main_peloton'
        when summary.physical_group_index = 1 and summary.physical_group_index < peloton.peloton_group_index then 'front_group'
        when summary.physical_group_index < peloton.peloton_group_index then
          'chase_group_' || lpad(summary.physical_group_index::text, 2, '0')
        when summary.physical_group_index = peloton.peloton_group_index + 1 then 'dropped_group'
        else
          'outside_group_' || lpad(
            (summary.physical_group_index - peloton.peloton_group_index - 1)::text,
            2,
            '0'
          )
      end as group_code,
      case
        when summary.physical_group_index = peloton.peloton_group_index then 'Peloton'
        when summary.physical_group_index = 1 and summary.physical_group_index < peloton.peloton_group_index then 'Front group'
        when summary.physical_group_index < peloton.peloton_group_index then
          'Chasing group ' || summary.physical_group_index::text
        when summary.physical_group_index = peloton.peloton_group_index + 1 then 'Dropped group'
        else
          'Outside group ' || (summary.physical_group_index - peloton.peloton_group_index - 1)::text
      end as group_label
    from physical_group_summary summary
    join peloton_group_by_frame peloton
      on peloton.frame_number = summary.frame_number
  ),
  monotone_gaps as (
    select
      mapped.*,
      case
        when mapped.physical_group_index = 1 then 0
        else max(floor(mapped.minimum_gap_seconds)::integer) over (
          partition by mapped.frame_number
          order by mapped.physical_group_index
          rows between unbounded preceding and current row
        )
      end::integer as gap_seconds
    from mapped_groups mapped
  )
  select
    monotone.*,
    greatest(
      0,
      least(
        v_distance_km,
        round(
          (
            monotone.leader_km -
            (
              monotone.gap_seconds::numeric *
              greatest(monotone.avg_speed_kmh, 8)::numeric /
              3600.0
            )
          ),
          3
        )
      )
    )::numeric as km_marker
  from monotone_gaps monotone;

  select count(*), coalesce(max(groups_per_frame), 0)
  into v_distinct_frames, v_max_groups_in_frame
  from (
    select frame_number, count(*) as groups_per_frame
    from tmp_replay_gap_v2_regrouped
    group by frame_number
  ) x;

  delete from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group';

  get diagnostics v_deleted_group_rows = row_count;

  insert into public.race_stage_replay_frames (
    simulation_run_id,
    race_id,
    stage_id,
    frame_number,
    race_seconds,
    km_marker,
    group_code,
    group_label,
    group_order,
    gap_seconds,
    avg_speed_kmh,
    rider_ids,
    rider_names,
    team_names,
    entity_type,
    metadata
  )
  select
    p_simulation_run_id,
    v_race_id,
    v_stage_id,
    replay.frame_number,
    replay.race_seconds,
    replay.km_marker,
    replay.group_code,
    replay.group_label,
    replay.physical_group_index as group_order,
    replay.gap_seconds,
    replay.avg_speed_kmh,
    replay.rider_ids,
    replay.rider_names,
    replay.team_names,
    'group' as entity_type,
    coalesce(replay.frame_metadata, '{}'::jsonb) ||
      jsonb_build_object(
        'source', 'race_engine_v2_segment_replay_gap_continuity_v2',
        'model', 'strict_10s_merge_with_temporal_gap_continuity_and_group_span_cap',
        'strict_merge_threshold_seconds', p_group_span_limit_seconds,
        'group_span_limit_seconds', p_group_span_limit_seconds,
        'max_gap_closure_seconds_per_frame', p_max_gap_closure_seconds_per_frame,
        'base_group_code', replay.base_group_code,
        'physical_group_index', replay.physical_group_index,
        'peloton_group_index', replay.peloton_group_index,
        'peloton_rider_count', replay.peloton_rider_count,
        'group_size', replay.rider_count,
        'minimum_safe_gap_seconds', replay.minimum_gap_seconds,
        'maximum_safe_gap_seconds', replay.maximum_gap_seconds,
        'group_gap_span_seconds', replay.maximum_gap_seconds - replay.minimum_gap_seconds,
        'average_safe_gap_seconds', replay.average_gap_seconds,
        'terrain_type', replay.current_terrain_type,
        'slope_percent', replay.current_slope_percent,
        'gap_continuity_patch_applied', true,
        'gap_continuity_patch_version', 'v2'
      ) as metadata
  from tmp_replay_gap_v2_regrouped replay
  order by replay.frame_number, replay.physical_group_index;

  get diagnostics v_inserted_group_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_enforce_replay_gap_continuity_v2',
    'simulation_run_id', p_simulation_run_id,
    'race_id', v_race_id,
    'stage_id', v_stage_id,
    'source_group_rows', v_source_group_rows,
    'source_rider_rows', v_source_rider_rows,
    'deleted_group_rows', v_deleted_group_rows,
    'inserted_group_rows', v_inserted_group_rows,
    'distinct_frame_numbers', v_distinct_frames,
    'max_groups_in_one_frame', v_max_groups_in_frame,
    'strict_merge_threshold_seconds', p_group_span_limit_seconds,
    'group_span_limit_seconds', p_group_span_limit_seconds,
    'max_gap_closure_seconds_per_frame', p_max_gap_closure_seconds_per_frame
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_stage_live_energy_smooth_v9(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_stage_distance_km numeric := 1;
  v_updated_rows integer := 0;
begin
  select sr.stage_id
  into v_stage_id
  from public.race_stage_simulation_runs sr
  where sr.id = p_simulation_run_id;

  v_stage_id := coalesce(p_stage_id, v_stage_id);

  if v_stage_id is null then
    raise exception 'Simulation run % not found or has no stage_id.', p_simulation_run_id;
  end if;

  select greatest(coalesce(s.distance_km, 1), 1)
  into v_stage_distance_km
  from public.race_stages s
  where s.id = v_stage_id;

  if v_stage_distance_km is null then
    v_stage_distance_km := 1;
  end if;

  with
  group_frames as (
    select
      f.id,
      f.frame_number,
      greatest(0, least(v_stage_distance_km, coalesce(f.km_marker, 0)::numeric)) as km_marker,
      coalesce(f.group_code, '') as group_code,
      coalesce(f.group_order, 1) as group_order,
      greatest(1, coalesce(jsonb_array_length(to_jsonb(f.rider_ids)), 0)) as group_size,
      greatest(0, least(1,
        coalesce(
          case when (f.metadata->>'frame_progress') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then (f.metadata->>'frame_progress')::numeric end,
          greatest(0, least(v_stage_distance_km, coalesce(f.km_marker, 0)::numeric)) / greatest(v_stage_distance_km, 1)
        )
      )) as frame_progress,
      lower(coalesce(f.metadata->>'terrain_type', 'flat')) as terrain_type,
      coalesce(
        case when (f.metadata->>'slope_percent') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (f.metadata->>'slope_percent')::numeric end,
        0
      ) as slope_percent,
      coalesce(f.metadata, '{}'::jsonb) as metadata,
      f.rider_ids
    from public.race_stage_replay_frames f
    where f.simulation_run_id = p_simulation_run_id
      and f.stage_id = v_stage_id
      and coalesce(f.entity_type, 'group') = 'group'
      and jsonb_typeof(to_jsonb(f.rider_ids)) = 'array'
      and jsonb_array_length(to_jsonb(f.rider_ids)) > 0
  ),

  rider_frame_rows as (
    select
      gf.id as frame_id,
      gf.frame_number,
      gf.km_marker,
      gf.group_code,
      gf.group_order,
      gf.group_size,
      gf.frame_progress,
      gf.terrain_type,
      gf.slope_percent,
      rider_item.rider_id::uuid as rider_id,
      rider_item.rider_position,
      coalesce(r.climbing, 60)::numeric as climbing,
      coalesce(r.endurance, 60)::numeric as endurance,
      coalesce(r.flat, 60)::numeric as flat,
      coalesce(r.resistance, 60)::numeric as resistance,
      coalesce(r.recovery, 60)::numeric as recovery,
      coalesce(r.race_iq, 60)::numeric as race_iq,
      greatest(
        15,
        least(
          100,
          100 - coalesce(rs.fatigue_before_stage, 0)::numeric
        )
      ) as pre_stage_freshness_pct
    from group_frames gf
    cross join lateral unnest(gf.rider_ids) with ordinality as rider_item(rider_id, rider_position)
    left join public.riders r
      on r.id = rider_item.rider_id::uuid
    left join public.race_stage_rider_states rs
      on rs.simulation_run_id = p_simulation_run_id
     and rs.stage_id = v_stage_id
     and rs.rider_id = rider_item.rider_id::uuid
  ),

  rider_frame_with_previous as (
    select
      rfr.*,
      lag(rfr.km_marker) over (
        partition by rfr.rider_id
        order by rfr.frame_number
      ) as previous_km_marker,
      lag(rfr.frame_progress) over (
        partition by rfr.rider_id
        order by rfr.frame_number
      ) as previous_frame_progress
    from rider_frame_rows rfr
  ),

  rider_frame_energy_input as (
    select
      rfp.*,
      greatest(0, rfp.km_marker - coalesce(rfp.previous_km_marker, rfp.km_marker)) as km_delta,
      greatest(0, rfp.frame_progress - coalesce(rfp.previous_frame_progress, rfp.frame_progress)) as progress_delta,

      case
        when rfp.terrain_type in ('steep_climb') then
          0.34 + greatest(0, rfp.slope_percent) * 0.035
        when rfp.terrain_type in ('climb') then
          0.20 + greatest(0, rfp.slope_percent) * 0.022
        when rfp.terrain_type in ('false_flat') then
          0.105 + greatest(0, rfp.slope_percent) * 0.010
        when rfp.terrain_type in ('technical_descent') then
          0.026
        when rfp.terrain_type in ('descent') then
          0.018
        else
          0.065
      end as base_drain_per_km,

      case
        when rfp.terrain_type in ('steep_climb', 'climb', 'false_flat') then
          greatest(0.72, least(1.55, 1 + (68 - rfp.climbing) / 85.0))
        when rfp.terrain_type in ('descent', 'technical_descent') then
          greatest(0.82, least(1.22, 1 + (64 - ((rfp.race_iq * 0.55) + (rfp.resistance * 0.45))) / 120.0))
        else
          greatest(0.78, least(1.35, 1 + (66 - rfp.flat) / 95.0))
      end as skill_drain_factor,

      case
        when rfp.group_code = 'front_group' then
          case when rfp.group_size <= 3 then 1.55 when rfp.group_size <= 8 then 1.35 else 1.18 end
        when rfp.group_code like 'chase_group%' then
          case when rfp.group_size <= 3 then 1.45 when rfp.group_size <= 8 then 1.28 else 1.12 end
        when rfp.group_code = 'main_peloton' then
          case when rfp.group_size >= 40 then 0.74 when rfp.group_size >= 20 then 0.84 else 0.96 end
        when rfp.group_code like 'dropped_group%' or rfp.group_code like 'outside_group%' then
          1.10
        else
          1.00
      end as group_drain_factor,

      greatest(1.00, least(1.45, 1 + (100 - rfp.pre_stage_freshness_pct) / 155.0)) as freshness_drain_factor,

      case
        when rfp.terrain_type = 'descent' then
          0.028 * greatest(0.65, least(1.35, rfp.recovery / 65.0))
        when rfp.terrain_type = 'technical_descent' then
          0.018 * greatest(0.65, least(1.20, rfp.recovery / 70.0))
        when rfp.terrain_type = 'flat' and rfp.slope_percent < -0.4 then
          0.010 * greatest(0.65, least(1.15, rfp.recovery / 75.0))
        else
          0
      end as recovery_per_km
    from rider_frame_with_previous rfp
  ),

  rider_frame_energy_delta as (
    select
      rfei.*,

      greatest(
        0,
        rfei.km_delta * rfei.base_drain_per_km * rfei.skill_drain_factor * rfei.group_drain_factor * rfei.freshness_drain_factor
      ) as energy_drain_delta,

      case
        when rfei.terrain_type in ('climb', 'steep_climb', 'false_flat')
          or rfei.slope_percent >= 1.5
        then 0
        else greatest(0, rfei.km_delta * rfei.recovery_per_km)
      end as energy_recovery_delta
    from rider_frame_energy_input rfei
  ),

  rider_frame_cumulative as (
    select
      rfed.*,
      sum(rfed.energy_drain_delta - rfed.energy_recovery_delta) over (
        partition by rfed.rider_id
        order by rfed.frame_number
        rows between unbounded preceding and current row
      ) as raw_energy_used_pct
    from rider_frame_energy_delta rfed
  ),

  rider_frame_energy as (
    select
      rfc.*,
      greatest(
        0,
        least(
          100,
          round((100 - greatest(0, rfc.raw_energy_used_pct))::numeric, 2)
        )
      ) as live_energy_pct,
      greatest(
        0,
        least(
          100,
          round(greatest(0, rfc.raw_energy_used_pct)::numeric, 2)
        )
      ) as stage_energy_used_pct
    from rider_frame_cumulative rfc
  ),

  frame_energy_json as (
    select
      rfe.frame_id,
      jsonb_object_agg(
        rfe.rider_id::text,
        jsonb_build_object(
          'pre_stage_freshness_pct', round(rfe.pre_stage_freshness_pct, 2),
          'live_energy_pct', rfe.live_energy_pct,
          'stage_energy_used_pct', rfe.stage_energy_used_pct,
          'source', 'race_engine_apply_stage_live_energy_smooth_v9',
          'terrain_type', rfe.terrain_type,
          'slope_percent', round(rfe.slope_percent, 2)
        )
        order by rfe.rider_position
      ) as rider_energy_v1,
      round(avg(rfe.live_energy_pct), 2) as average_live_energy_pct,
      round(min(rfe.live_energy_pct), 2) as minimum_live_energy_pct,
      round(max(rfe.live_energy_pct), 2) as maximum_live_energy_pct
    from rider_frame_energy rfe
    group by rfe.frame_id
  )

  update public.race_stage_replay_frames f
  set metadata =
    coalesce(f.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'rider_energy_v1', fej.rider_energy_v1,
      'stage_live_energy_smooth_v9', true,
      'stage_live_energy_smooth_v8_compat', true,
      'average_live_energy_pct', fej.average_live_energy_pct,
      'minimum_live_energy_pct', fej.minimum_live_energy_pct,
      'maximum_live_energy_pct', fej.maximum_live_energy_pct
    )
  from frame_energy_json fej
  where f.id = fej.frame_id;

  get diagnostics v_updated_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_apply_stage_live_energy_smooth_v9',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'updated_group_frame_rows', v_updated_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_enforce_group_km_marker_physical_continuity_v3(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_distance_km numeric;
  v_source_group_rows integer := 0;
  v_source_rider_rows integer := 0;
  v_deleted_rows integer := 0;
  v_inserted_rows integer := 0;
  v_distinct_frames integer := 0;
  v_backward_rider_jumps integer := 0;
begin
  select
    sr.race_id,
    sr.stage_id,
    greatest(coalesce(s.distance_km, 1), 1)
  into
    v_race_id,
    v_stage_id,
    v_distance_km
  from public.race_stage_simulation_runs sr
  join public.race_stages s
    on s.id = sr.stage_id
  where sr.id = p_simulation_run_id
    and (p_stage_id is null or sr.stage_id = p_stage_id)
    and sr.status = 'completed';

  if v_race_id is null or v_stage_id is null then
    raise exception 'Completed simulation run % was not found for stage %.', p_simulation_run_id, p_stage_id;
  end if;

  drop table if exists pg_temp.tmp_replay_km_v3_groups;
  drop table if exists pg_temp.tmp_replay_km_v3_riders;
  drop table if exists pg_temp.tmp_replay_km_v3_safe_riders;
  drop table if exists pg_temp.tmp_replay_km_v3_rebuilt_groups;

  create temporary table tmp_replay_km_v3_groups on commit drop as
  select
    f.id as source_frame_id,
    f.frame_number::integer as frame_number,
    coalesce(f.race_seconds, 0)::integer as race_seconds,
    greatest(0, least(v_distance_km, coalesce(f.km_marker, 0)::numeric)) as raw_km_marker,
    coalesce(f.group_order, 1)::integer as source_group_order,
    coalesce(f.group_code, '')::text as source_group_code,
    coalesce(f.group_label, '')::text as source_group_label,
    greatest(0, coalesce(f.gap_seconds, 0)::numeric) as source_gap_seconds,
    greatest(1, coalesce(f.avg_speed_kmh, 38)::numeric) as avg_speed_kmh,
    coalesce(f.rider_ids, array[]::uuid[]) as rider_ids,
    coalesce(f.rider_names, array[]::text[]) as rider_names,
    coalesce(f.team_names, array[]::text[]) as team_names,
    coalesce(f.metadata, '{}'::jsonb) as metadata,
    lower(coalesce(nullif(f.metadata->>'terrain_type', ''), 'flat')) as terrain_type,
    coalesce(
      case when (f.metadata->>'slope_percent') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (f.metadata->>'slope_percent')::numeric end,
      0
    ) as slope_percent
  from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group'
    and array_length(f.rider_ids, 1) is not null
    and array_length(f.rider_ids, 1) > 0
  order by f.frame_number, f.group_order, f.group_code;

  get diagnostics v_source_group_rows = row_count;

  if v_source_group_rows = 0 then
    return jsonb_build_object(
      'status', 'skipped',
      'function', 'race_engine_enforce_group_km_marker_physical_continuity_v3',
      'reason', 'no_group_frames_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id
    );
  end if;

  create temporary table tmp_replay_km_v3_riders on commit drop as
  select
    g.source_frame_id,
    g.frame_number,
    g.race_seconds,
    g.raw_km_marker,
    g.source_group_order,
    g.source_group_code,
    g.source_group_label,
    g.source_gap_seconds,
    g.avg_speed_kmh,
    g.metadata,
    g.terrain_type,
    g.slope_percent,
    rider.rider_id::uuid as rider_id,
    rider.rider_ordinal::integer as rider_ordinal,
    coalesce(g.rider_names[rider.rider_ordinal::integer], 'Rider') as rider_name,
    coalesce(g.team_names[rider.rider_ordinal::integer], '') as team_name,
    row_number() over (
      partition by rider.rider_id::uuid
      order by g.frame_number, g.race_seconds, g.source_group_order, rider.rider_ordinal
    )::integer as rider_frame_index
  from tmp_replay_km_v3_groups g
  cross join lateral unnest(g.rider_ids) with ordinality as rider(rider_id, rider_ordinal);

  get diagnostics v_source_rider_rows = row_count;

  create index on tmp_replay_km_v3_riders(rider_id, rider_frame_index);
  create index on tmp_replay_km_v3_riders(frame_number, source_group_order);

  create temporary table tmp_replay_km_v3_safe_riders on commit drop as
  with recursive safe_rows as (
    select
      r.*,
      r.raw_km_marker::numeric as safe_km_marker
    from tmp_replay_km_v3_riders r
    where r.rider_frame_index = 1

    union all

    select
      next_row.*,
      least(
        v_distance_km,
        greatest(
          0::numeric,
          least(
            -- do not allow impossible forward jumps either
            previous.safe_km_marker + (
              case
                when next_row.terrain_type = 'steep_climb' then 22
                when next_row.terrain_type = 'climb' then 32
                when next_row.terrain_type = 'false_flat' then 42
                when next_row.terrain_type = 'technical_descent' then 66
                when next_row.terrain_type = 'descent' then 78
                else 56
              end::numeric
              * greatest(0, next_row.race_seconds - previous.race_seconds)::numeric / 3600.0
            ),
            greatest(
              -- if raw replay tries to push the rider backwards, keep him moving forward slowly
              previous.safe_km_marker + (
                case
                  when next_row.terrain_type = 'steep_climb' then 4.0
                  when next_row.terrain_type = 'climb' then 5.0
                  when next_row.terrain_type = 'false_flat' then 7.0
                  when next_row.terrain_type = 'technical_descent' then 15.0
                  when next_row.terrain_type = 'descent' then 18.0
                  else 9.0
                end::numeric
                * greatest(0, next_row.race_seconds - previous.race_seconds)::numeric / 3600.0
              ),
              next_row.raw_km_marker
            )
          )
        )
      )::numeric as safe_km_marker
    from safe_rows previous
    join tmp_replay_km_v3_riders next_row
      on next_row.rider_id = previous.rider_id
     and next_row.rider_frame_index = previous.rider_frame_index + 1
  )
  select *
  from safe_rows;

  create index on tmp_replay_km_v3_safe_riders(frame_number, source_frame_id);
  create index on tmp_replay_km_v3_safe_riders(rider_id, frame_number);

  select count(*)
  into v_backward_rider_jumps
  from (
    select
      rider_id,
      frame_number,
      safe_km_marker,
      lag(safe_km_marker) over (partition by rider_id order by frame_number) as previous_safe_km_marker
    from tmp_replay_km_v3_safe_riders
  ) x
  where previous_safe_km_marker is not null
    and safe_km_marker < previous_safe_km_marker - 0.05;

  create temporary table tmp_replay_km_v3_rebuilt_groups on commit drop as
  with group_base as (
    select
      sr.source_frame_id,
      sr.frame_number,
      min(sr.race_seconds)::integer as race_seconds,
      round(avg(sr.safe_km_marker), 3)::numeric as safe_km_marker,
      min(sr.source_group_order)::integer as source_group_order,
      (array_agg(sr.source_group_code order by sr.rider_ordinal))[1] as old_group_code,
      (array_agg(sr.source_group_label order by sr.rider_ordinal))[1] as old_group_label,
      round(avg(sr.avg_speed_kmh), 2)::numeric as avg_speed_kmh,
      (array_agg(sr.metadata order by sr.rider_ordinal))[1] as source_metadata,
      (array_agg(sr.terrain_type order by sr.rider_ordinal))[1] as terrain_type,
      (array_agg(sr.slope_percent order by sr.rider_ordinal))[1] as slope_percent,
      array_agg(sr.rider_id order by sr.rider_ordinal) as rider_ids,
      array_agg(sr.rider_name order by sr.rider_ordinal) as rider_names,
      array_agg(sr.team_name order by sr.rider_ordinal) as team_names,
      count(*)::integer as rider_count
    from tmp_replay_km_v3_safe_riders sr
    group by sr.source_frame_id, sr.frame_number
  ),
  ordered as (
    select
      gb.*,
      row_number() over (
        partition by gb.frame_number
        order by gb.safe_km_marker desc, gb.rider_count desc, gb.source_group_order, gb.old_group_code
      )::integer as physical_group_index,
      max(gb.safe_km_marker) over (partition by gb.frame_number) as leader_km
    from group_base gb
  ),
  peloton as (
    select distinct on (frame_number)
      frame_number,
      physical_group_index as peloton_group_index,
      rider_count as peloton_rider_count
    from ordered
    order by frame_number, rider_count desc, safe_km_marker desc, physical_group_index
  ),
  mapped as (
    select
      o.*,
      p.peloton_group_index,
      p.peloton_rider_count,
      case
        when o.physical_group_index = p.peloton_group_index then 'main_peloton'
        when o.physical_group_index < p.peloton_group_index then
          case when o.physical_group_index = 1 then 'front_group' else 'chase_group' end
        when o.physical_group_index = p.peloton_group_index + 1 then 'dropped_group'
        else 'outside_group'
      end as base_group_code,
      case
        when o.physical_group_index = p.peloton_group_index then 'main_peloton'
        when o.physical_group_index = 1 and o.physical_group_index < p.peloton_group_index then 'front_group'
        when o.physical_group_index < p.peloton_group_index then 'chase_group_' || lpad(o.physical_group_index::text, 2, '0')
        when o.physical_group_index = p.peloton_group_index + 1 then 'dropped_group'
        else 'outside_group_' || lpad((o.physical_group_index - p.peloton_group_index - 1)::text, 2, '0')
      end as group_code,
      case
        when o.physical_group_index = p.peloton_group_index then 'Peloton'
        when o.physical_group_index = 1 and o.physical_group_index < p.peloton_group_index then 'Front group'
        when o.physical_group_index < p.peloton_group_index then 'Chasing group ' || o.physical_group_index::text
        when o.physical_group_index = p.peloton_group_index + 1 then 'Dropped group'
        else 'Outside group ' || (o.physical_group_index - p.peloton_group_index - 1)::text
      end as group_label
    from ordered o
    join peloton p
      on p.frame_number = o.frame_number
  ),
  physical_gaps as (
    select
      m.*,
      greatest(
        0,
        round(((m.leader_km - m.safe_km_marker) / greatest(m.avg_speed_kmh, 8)) * 3600)
      )::integer as physical_gap_seconds
    from mapped m
  ),
  monotone_gaps as (
    select
      pg.*,
      case
        when pg.physical_group_index = 1 then 0
        else max(pg.physical_gap_seconds) over (
          partition by pg.frame_number
          order by pg.physical_group_index
          rows between unbounded preceding and current row
        )
      end::integer as gap_seconds
    from physical_gaps pg
  )
  select * from monotone_gaps;

  select count(distinct frame_number)
  into v_distinct_frames
  from tmp_replay_km_v3_rebuilt_groups;

  delete from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group';

  get diagnostics v_deleted_rows = row_count;

  insert into public.race_stage_replay_frames (
    simulation_run_id,
    race_id,
    stage_id,
    frame_number,
    race_seconds,
    km_marker,
    group_code,
    group_label,
    group_order,
    gap_seconds,
    avg_speed_kmh,
    rider_ids,
    rider_names,
    team_names,
    entity_type,
    metadata
  )
  select
    p_simulation_run_id,
    v_race_id,
    v_stage_id,
    g.frame_number,
    g.race_seconds,
    g.safe_km_marker,
    g.group_code,
    g.group_label,
    g.physical_group_index as group_order,
    g.gap_seconds,
    g.avg_speed_kmh,
    g.rider_ids,
    g.rider_names,
    g.team_names,
    'group' as entity_type,
    (
      coalesce(g.source_metadata, '{}'::jsonb)
      - 'rider_energy_v1'
      - 'stage_live_energy_smooth_v8'
      - 'stage_live_energy_smooth_v8_compat'
      - 'stage_live_energy_smooth_v9'
      - 'stage_live_energy_smooth_v10'
      - 'average_live_energy_pct'
      - 'minimum_live_energy_pct'
      - 'maximum_live_energy_pct'
    ) || jsonb_build_object(
      'source', 'race_engine_v2_segment_replay_gap_continuity_v2_physical_km_v3',
      'model', 'strict_10s_merge_with_physical_monotonic_road_km',
      'base_group_code', g.base_group_code,
      'physical_group_index', g.physical_group_index,
      'peloton_group_index', g.peloton_group_index,
      'peloton_rider_count', g.peloton_rider_count,
      'group_size', g.rider_count,
      'terrain_type', g.terrain_type,
      'slope_percent', g.slope_percent,
      'physical_km_continuity_v3', true,
      'old_group_code_before_physical_km_v3', g.old_group_code,
      'raw_safe_km_marker_v3', g.safe_km_marker
    ) as metadata
  from tmp_replay_km_v3_rebuilt_groups g
  order by g.frame_number, g.physical_group_index;

  get diagnostics v_inserted_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_enforce_group_km_marker_physical_continuity_v3',
    'simulation_run_id', p_simulation_run_id,
    'race_id', v_race_id,
    'stage_id', v_stage_id,
    'source_group_rows', v_source_group_rows,
    'source_rider_rows', v_source_rider_rows,
    'deleted_group_rows', v_deleted_rows,
    'inserted_group_rows', v_inserted_rows,
    'distinct_frame_numbers', v_distinct_frames,
    'backward_rider_jumps_after_v3_internal', v_backward_rider_jumps
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_stage_live_energy_smooth_v10(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_stage_distance_km numeric := 1;
  v_updated_rows integer := 0;
begin
  select sr.stage_id
  into v_stage_id
  from public.race_stage_simulation_runs sr
  where sr.id = p_simulation_run_id;

  v_stage_id := coalesce(p_stage_id, v_stage_id);

  if v_stage_id is null then
    raise exception 'Simulation run % not found or has no stage_id.', p_simulation_run_id;
  end if;

  select greatest(coalesce(s.distance_km, 1), 1)
  into v_stage_distance_km
  from public.race_stages s
  where s.id = v_stage_id;

  with
  group_frames as (
    select
      f.id,
      f.frame_number,
      greatest(0, least(v_stage_distance_km, coalesce(f.km_marker, 0)::numeric)) as km_marker,
      coalesce(f.group_code, '') as group_code,
      coalesce(f.group_order, 1) as group_order,
      greatest(1, coalesce(array_length(f.rider_ids, 1), 0)) as group_size,
      greatest(0, least(1,
        coalesce(
          case when (f.metadata->>'frame_progress') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then (f.metadata->>'frame_progress')::numeric end,
          greatest(0, least(v_stage_distance_km, coalesce(f.km_marker, 0)::numeric)) / greatest(v_stage_distance_km, 1)
        )
      )) as frame_progress,
      lower(coalesce(nullif(f.metadata->>'terrain_type', ''), 'flat')) as terrain_type,
      coalesce(
        case when (f.metadata->>'slope_percent') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (f.metadata->>'slope_percent')::numeric end,
        0
      ) as slope_percent,
      coalesce(f.metadata, '{}'::jsonb) as metadata,
      f.rider_ids
    from public.race_stage_replay_frames f
    where f.simulation_run_id = p_simulation_run_id
      and f.stage_id = v_stage_id
      and coalesce(f.entity_type, 'group') = 'group'
      and array_length(f.rider_ids, 1) is not null
      and array_length(f.rider_ids, 1) > 0
  ),
  rider_frame_rows as (
    select
      gf.id as frame_id,
      gf.frame_number,
      gf.km_marker,
      gf.group_code,
      gf.group_order,
      gf.group_size,
      gf.frame_progress,
      gf.terrain_type,
      gf.slope_percent,
      rider_item.rider_id::uuid as rider_id,
      rider_item.rider_position,
      coalesce(r.climbing, 60)::numeric as climbing,
      coalesce(r.endurance, 60)::numeric as endurance,
      coalesce(r.flat, 60)::numeric as flat,
      coalesce(r.resistance, 60)::numeric as resistance,
      coalesce(r.recovery, 60)::numeric as recovery,
      coalesce(r.race_iq, 60)::numeric as race_iq,
      -- Red bar: fixed pre-stage freshness. Clamp to 50..100 for now.
      greatest(
        50,
        least(
          100,
          100 - coalesce(rs.fatigue_before_stage, 0)::numeric
        )
      ) as pre_stage_freshness_pct
    from group_frames gf
    cross join lateral unnest(gf.rider_ids) with ordinality as rider_item(rider_id, rider_position)
    left join public.riders r
      on r.id = rider_item.rider_id::uuid
    left join public.race_stage_rider_states rs
      on rs.simulation_run_id = p_simulation_run_id
     and rs.stage_id = v_stage_id
     and rs.rider_id = rider_item.rider_id::uuid
  ),
  rider_frame_with_previous as (
    select
      rfr.*,
      lag(rfr.km_marker) over (partition by rfr.rider_id order by rfr.frame_number) as previous_km_marker,
      lag(rfr.frame_progress) over (partition by rfr.rider_id order by rfr.frame_number) as previous_frame_progress
    from rider_frame_rows rfr
  ),
  rider_frame_energy_input as (
    select
      rfp.*,
      greatest(0, rfp.km_marker - coalesce(rfp.previous_km_marker, rfp.km_marker)) as km_delta,
      greatest(0, rfp.frame_progress - coalesce(rfp.previous_frame_progress, rfp.frame_progress)) as progress_delta,

      case
        when rfp.terrain_type = 'steep_climb' then 1.10 + greatest(0, rfp.slope_percent) * 0.095
        when rfp.terrain_type = 'climb' then 0.62 + greatest(0, rfp.slope_percent) * 0.060
        when rfp.terrain_type = 'false_flat' then 0.26 + greatest(0, rfp.slope_percent) * 0.025
        when rfp.terrain_type = 'technical_descent' then 0.060
        when rfp.terrain_type = 'descent' then 0.040
        else 0.145 + greatest(0, rfp.slope_percent) * 0.018
      end as base_drain_per_km,

      case
        when rfp.terrain_type in ('steep_climb', 'climb', 'false_flat') then
          greatest(0.62, least(1.95, 1 + (72 - rfp.climbing) / 55.0))
        when rfp.terrain_type in ('descent', 'technical_descent') then
          greatest(0.80, least(1.25, 1 + (65 - ((rfp.race_iq * 0.55) + (rfp.resistance * 0.45))) / 110.0))
        else
          greatest(0.74, least(1.48, 1 + (68 - rfp.flat) / 78.0))
      end as skill_drain_factor,

      case
        when rfp.group_code = 'front_group' then
          case when rfp.group_size <= 3 then 1.85 when rfp.group_size <= 8 then 1.55 else 1.28 end
        when rfp.group_code like 'chase_group%' then
          case when rfp.group_size <= 3 then 1.65 when rfp.group_size <= 8 then 1.42 else 1.20 end
        when rfp.group_code = 'main_peloton' then
          case when rfp.group_size >= 60 then 0.66 when rfp.group_size >= 35 then 0.74 when rfp.group_size >= 20 then 0.84 else 0.98 end
        when rfp.group_code like 'dropped_group%' or rfp.group_code like 'outside_group%' then
          1.16
        else
          1.00
      end as group_drain_factor,

      greatest(1.00, least(1.58, 1 + (100 - rfp.pre_stage_freshness_pct) / 110.0)) as freshness_drain_factor,
      greatest(1.00, least(1.36, 1 + rfp.frame_progress * 0.36)) as late_race_drain_factor,

      case
        when rfp.terrain_type = 'descent' then 0.035 * greatest(0.65, least(1.25, rfp.recovery / 70.0))
        when rfp.terrain_type = 'technical_descent' then 0.025 * greatest(0.65, least(1.18, rfp.recovery / 75.0))
        else 0
      end as recovery_per_km
    from rider_frame_with_previous rfp
  ),
  rider_frame_energy_delta as (
    select
      rfei.*,
      greatest(
        0,
        rfei.km_delta
          * rfei.base_drain_per_km
          * rfei.skill_drain_factor
          * rfei.group_drain_factor
          * rfei.freshness_drain_factor
          * rfei.late_race_drain_factor
      ) as energy_drain_delta,
      case
        when rfei.terrain_type in ('climb', 'steep_climb', 'false_flat')
          or rfei.slope_percent >= 1.5
        then 0
        else greatest(0, rfei.km_delta * rfei.recovery_per_km)
      end as energy_recovery_delta
    from rider_frame_energy_input rfei
  ),
  rider_frame_cumulative as (
    select
      rfed.*,
      sum(rfed.energy_drain_delta - rfed.energy_recovery_delta) over (
        partition by rfed.rider_id
        order by rfed.frame_number
        rows between unbounded preceding and current row
      ) as raw_energy_used_pct
    from rider_frame_energy_delta rfed
  ),
  rider_frame_energy as (
    select
      rfc.*,
      greatest(0, least(100, round((100 - greatest(0, rfc.raw_energy_used_pct))::numeric, 2))) as live_energy_pct,
      greatest(0, least(100, round(greatest(0, rfc.raw_energy_used_pct)::numeric, 2))) as stage_energy_used_pct
    from rider_frame_cumulative rfc
  ),
  frame_energy_json as (
    select
      rfe.frame_id,
      jsonb_object_agg(
        rfe.rider_id::text,
        jsonb_build_object(
          'pre_stage_freshness_pct', round(rfe.pre_stage_freshness_pct, 2),
          'live_energy_pct', rfe.live_energy_pct,
          'stage_energy_used_pct', rfe.stage_energy_used_pct,
          'source', 'race_engine_apply_stage_live_energy_smooth_v10',
          'terrain_type', rfe.terrain_type,
          'slope_percent', round(rfe.slope_percent, 2)
        )
        order by rfe.rider_position
      ) as rider_energy_v1,
      round(avg(rfe.live_energy_pct), 2) as average_live_energy_pct,
      round(min(rfe.live_energy_pct), 2) as minimum_live_energy_pct,
      round(max(rfe.live_energy_pct), 2) as maximum_live_energy_pct,
      round(avg(rfe.pre_stage_freshness_pct), 2) as average_pre_stage_freshness_pct,
      round(min(rfe.pre_stage_freshness_pct), 2) as minimum_pre_stage_freshness_pct,
      round(max(rfe.pre_stage_freshness_pct), 2) as maximum_pre_stage_freshness_pct
    from rider_frame_energy rfe
    group by rfe.frame_id
  )
  update public.race_stage_replay_frames f
  set metadata =
    coalesce(f.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'rider_energy_v1', fej.rider_energy_v1,
      'stage_live_energy_smooth_v10', true,
      'stage_live_energy_smooth_v9_compat', true,
      'average_live_energy_pct', fej.average_live_energy_pct,
      'minimum_live_energy_pct', fej.minimum_live_energy_pct,
      'maximum_live_energy_pct', fej.maximum_live_energy_pct,
      'average_pre_stage_freshness_pct', fej.average_pre_stage_freshness_pct,
      'minimum_pre_stage_freshness_pct', fej.minimum_pre_stage_freshness_pct,
      'maximum_pre_stage_freshness_pct', fej.maximum_pre_stage_freshness_pct
    )
  from frame_energy_json fej
  where f.id = fej.frame_id;

  get diagnostics v_updated_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_apply_stage_live_energy_smooth_v10',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'updated_group_frame_rows', v_updated_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_enforce_replay_physical_rider_continuity_v4(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_distance_km numeric;
  v_source_group_rows integer := 0;
  v_source_rider_rows integer := 0;
  v_deleted_rows integer := 0;
  v_inserted_rows integer := 0;
  v_distinct_frames integer := 0;
begin
  select
    sr.race_id,
    sr.stage_id,
    greatest(coalesce(s.distance_km, 1), 1)
  into v_race_id, v_stage_id, v_distance_km
  from public.race_stage_simulation_runs sr
  join public.race_stages s
    on s.id = sr.stage_id
  where sr.id = p_simulation_run_id
    and (p_stage_id is null or sr.stage_id = p_stage_id)
    and sr.status = 'completed';

  if v_race_id is null or v_stage_id is null then
    raise exception 'Completed simulation run % was not found for stage %.', p_simulation_run_id, p_stage_id;
  end if;

  drop table if exists pg_temp.tmp_v4_source_groups;
  drop table if exists pg_temp.tmp_v4_rider_raw;
  drop table if exists pg_temp.tmp_v4_rider_safe;
  drop table if exists pg_temp.tmp_v4_ordered_riders;
  drop table if exists pg_temp.tmp_v4_grouped_riders;
  drop table if exists pg_temp.tmp_v4_rebuilt_groups;

  create temporary table tmp_v4_source_groups on commit drop as
  select
    f.id as source_frame_id,
    f.frame_number::integer as frame_number,
    coalesce(f.race_seconds, 0)::integer as race_seconds,
    greatest(0, least(v_distance_km, coalesce(f.km_marker, 0)::numeric)) as raw_km_marker,
    coalesce(f.group_order, 1)::integer as source_group_order,
    coalesce(f.group_code, '')::text as source_group_code,
    coalesce(f.group_label, '')::text as source_group_label,
    greatest(0, coalesce(f.gap_seconds, 0)::numeric) as source_gap_seconds,
    greatest(1, coalesce(f.avg_speed_kmh, 38)::numeric) as avg_speed_kmh,
    coalesce(f.rider_ids, array[]::uuid[]) as rider_ids,
    coalesce(f.rider_names, array[]::text[]) as rider_names,
    coalesce(f.team_names, array[]::text[]) as team_names,
    coalesce(f.metadata, '{}'::jsonb) as metadata,
    lower(coalesce(nullif(f.metadata->>'terrain_type', ''), 'flat')) as terrain_type,
    coalesce(
      case when (f.metadata->>'slope_percent') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (f.metadata->>'slope_percent')::numeric end,
      0
    ) as slope_percent
  from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group'
    and array_length(f.rider_ids, 1) is not null
    and array_length(f.rider_ids, 1) > 0
  order by f.frame_number, f.group_order, f.group_code;

  get diagnostics v_source_group_rows = row_count;

  if v_source_group_rows = 0 then
    return jsonb_build_object(
      'status', 'skipped',
      'function', 'race_engine_enforce_replay_physical_rider_continuity_v4',
      'reason', 'no_group_frames_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id
    );
  end if;

  create temporary table tmp_v4_rider_raw on commit drop as
  select
    g.source_frame_id,
    g.frame_number,
    g.race_seconds,
    g.raw_km_marker,
    g.source_group_order,
    g.source_group_code,
    g.source_group_label,
    g.source_gap_seconds,
    g.avg_speed_kmh,
    g.metadata,
    g.terrain_type,
    g.slope_percent,
    rider.rider_id::uuid as rider_id,
    rider.rider_ordinal::integer as rider_ordinal,
    coalesce(g.rider_names[rider.rider_ordinal::integer], 'Rider') as rider_name,
    coalesce(g.team_names[rider.rider_ordinal::integer], '') as team_name,
    row_number() over (
      partition by rider.rider_id::uuid
      order by g.frame_number, g.race_seconds, g.source_group_order, rider.rider_ordinal
    )::integer as rider_frame_index
  from tmp_v4_source_groups g
  cross join lateral unnest(g.rider_ids) with ordinality as rider(rider_id, rider_ordinal);

  get diagnostics v_source_rider_rows = row_count;

  create index on tmp_v4_rider_raw(rider_id, rider_frame_index);
  create index on tmp_v4_rider_raw(frame_number, source_group_order);

  create temporary table tmp_v4_rider_safe on commit drop as
  with recursive safe_rows as (
    select
      r.*,
      r.raw_km_marker::numeric as safe_km_marker,
      (r.race_seconds::numeric + r.source_gap_seconds)::numeric as safe_elapsed_seconds
    from tmp_v4_rider_raw r
    where r.rider_frame_index = 1

    union all

    select
      next_row.*,
      least(
        v_distance_km,
        least(
          previous.safe_km_marker + (
            case
              when next_row.terrain_type = 'steep_climb' then 18
              when next_row.terrain_type = 'climb' then 26
              when next_row.terrain_type = 'false_flat' then 38
              when next_row.terrain_type = 'technical_descent' then 64
              when next_row.terrain_type = 'descent' then 74
              else 54
            end::numeric
            * greatest(0, next_row.race_seconds - previous.race_seconds)::numeric / 3600.0
          ),
          greatest(
            next_row.raw_km_marker,
            previous.safe_km_marker + (
              case
                when next_row.terrain_type = 'steep_climb' then 3.5
                when next_row.terrain_type = 'climb' then 5.0
                when next_row.terrain_type = 'false_flat' then 6.5
                when next_row.terrain_type = 'technical_descent' then 13.0
                when next_row.terrain_type = 'descent' then 16.0
                else 8.0
              end::numeric
              * greatest(0, next_row.race_seconds - previous.race_seconds)::numeric / 3600.0
            )
          )
        )
      )::numeric as safe_km_marker,
      greatest(
        next_row.race_seconds::numeric + next_row.source_gap_seconds,
        previous.safe_elapsed_seconds + greatest(
          1::numeric,
          greatest(0, next_row.race_seconds - previous.race_seconds)::numeric - 6::numeric
        )
      )::numeric as safe_elapsed_seconds
    from safe_rows previous
    join tmp_v4_rider_raw next_row
      on next_row.rider_id = previous.rider_id
     and next_row.rider_frame_index = previous.rider_frame_index + 1
  )
  select
    safe_rows.*,
    greatest(0, round(safe_rows.safe_elapsed_seconds - safe_rows.race_seconds::numeric))::integer
      as safe_gap_seconds
  from safe_rows;

  create index on tmp_v4_rider_safe(frame_number, rider_id);
  create index on tmp_v4_rider_safe(rider_id, frame_number);

  create temporary table tmp_v4_ordered_riders on commit drop as
  with leader_rows as (
    select
      frame_number,
      max(safe_km_marker) as leader_km
    from tmp_v4_rider_safe
    group by frame_number
  )
  select
    sr.*,
    leader.leader_km,
    row_number() over (
      partition by sr.frame_number
      order by sr.safe_km_marker desc, sr.safe_gap_seconds asc, sr.source_group_order, sr.rider_ordinal, sr.rider_id
    )::integer as live_rank
  from tmp_v4_rider_safe sr
  join leader_rows leader
    on leader.frame_number = sr.frame_number;

  create index on tmp_v4_ordered_riders(frame_number, live_rank);

  create temporary table tmp_v4_grouped_riders on commit drop as
  with recursive grouped as (
    select
      o.*,
      1::integer as physical_group_index,
      o.safe_gap_seconds::numeric as group_start_gap_seconds
    from tmp_v4_ordered_riders o
    where o.live_rank = 1

    union all

    select
      next_row.*,
      case
        when next_row.safe_gap_seconds::numeric - previous.group_start_gap_seconds < 10
          then previous.physical_group_index
        else previous.physical_group_index + 1
      end as physical_group_index,
      case
        when next_row.safe_gap_seconds::numeric - previous.group_start_gap_seconds < 10
          then previous.group_start_gap_seconds
        else next_row.safe_gap_seconds::numeric
      end as group_start_gap_seconds
    from grouped previous
    join tmp_v4_ordered_riders next_row
      on next_row.frame_number = previous.frame_number
     and next_row.live_rank = previous.live_rank + 1
  )
  select * from grouped;

  create index on tmp_v4_grouped_riders(frame_number, physical_group_index);

  create temporary table tmp_v4_rebuilt_groups on commit drop as
  with group_base as (
    select
      gr.frame_number,
      min(gr.race_seconds)::integer as race_seconds,
      gr.physical_group_index,
      max(gr.safe_km_marker)::numeric as group_front_km,
      round(avg(gr.avg_speed_kmh), 2)::numeric as avg_speed_kmh,
      min(gr.safe_gap_seconds)::integer as minimum_safe_gap_seconds,
      max(gr.safe_gap_seconds)::integer as maximum_safe_gap_seconds,
      round(max(gr.safe_gap_seconds) - min(gr.safe_gap_seconds), 2)::numeric as group_gap_span_seconds,
      count(*)::integer as rider_count,
      (array_agg(gr.metadata order by gr.safe_km_marker desc, gr.live_rank))[1] as source_metadata,
      (array_agg(gr.terrain_type order by gr.safe_km_marker desc, gr.live_rank))[1] as terrain_type,
      (array_agg(gr.slope_percent order by gr.safe_km_marker desc, gr.live_rank))[1] as slope_percent,
      array_agg(gr.rider_id order by gr.safe_km_marker desc, gr.live_rank) as rider_ids,
      array_agg(gr.rider_name order by gr.safe_km_marker desc, gr.live_rank) as rider_names,
      array_agg(gr.team_name order by gr.safe_km_marker desc, gr.live_rank) as team_names
    from tmp_v4_grouped_riders gr
    group by gr.frame_number, gr.physical_group_index
  ),
  peloton as (
    select distinct on (frame_number)
      frame_number,
      physical_group_index as peloton_group_index,
      rider_count as peloton_rider_count
    from group_base
    order by frame_number, rider_count desc, physical_group_index asc
  ),
  mapped as (
    select
      gb.*,
      p.peloton_group_index,
      p.peloton_rider_count,
      case
        when gb.physical_group_index = p.peloton_group_index then 'main_peloton'
        when gb.physical_group_index < p.peloton_group_index then
          case when gb.physical_group_index = 1 then 'front_group' else 'chase_group' end
        when gb.physical_group_index = p.peloton_group_index + 1 then 'dropped_group'
        else 'outside_group'
      end as base_group_code,
      case
        when gb.physical_group_index = p.peloton_group_index then 'main_peloton'
        when gb.physical_group_index = 1 and gb.physical_group_index < p.peloton_group_index then 'front_group'
        when gb.physical_group_index < p.peloton_group_index then 'chase_group_' || lpad(gb.physical_group_index::text, 2, '0')
        when gb.physical_group_index = p.peloton_group_index + 1 then 'dropped_group'
        else 'outside_group_' || lpad((gb.physical_group_index - p.peloton_group_index - 1)::text, 2, '0')
      end as group_code,
      case
        when gb.physical_group_index = p.peloton_group_index then 'Peloton'
        when gb.physical_group_index = 1 and gb.physical_group_index < p.peloton_group_index then 'Front group'
        when gb.physical_group_index < p.peloton_group_index then 'Chasing group ' || gb.physical_group_index::text
        when gb.physical_group_index = p.peloton_group_index + 1 then 'Dropped group'
        else 'Outside group ' || (gb.physical_group_index - p.peloton_group_index - 1)::text
      end as group_label
    from group_base gb
    join peloton p
      on p.frame_number = gb.frame_number
  )
  select
    mapped.*,
    -- Use the slowest member's safe gap for the stored group gap. This avoids
    -- displayed rider elapsed time going backwards when a rider joins a group.
    mapped.maximum_safe_gap_seconds::integer as gap_seconds
  from mapped;

  select count(distinct frame_number)
  into v_distinct_frames
  from tmp_v4_rebuilt_groups;

  delete from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group';

  get diagnostics v_deleted_rows = row_count;

  insert into public.race_stage_replay_frames (
    simulation_run_id,
    race_id,
    stage_id,
    frame_number,
    race_seconds,
    km_marker,
    group_code,
    group_label,
    group_order,
    gap_seconds,
    avg_speed_kmh,
    rider_ids,
    rider_names,
    team_names,
    entity_type,
    metadata
  )
  select
    p_simulation_run_id,
    v_race_id,
    v_stage_id,
    g.frame_number,
    g.race_seconds,
    g.group_front_km,
    g.group_code,
    g.group_label,
    g.physical_group_index as group_order,
    g.gap_seconds,
    g.avg_speed_kmh,
    g.rider_ids,
    g.rider_names,
    g.team_names,
    'group' as entity_type,
    (
      coalesce(g.source_metadata, '{}'::jsonb)
      - 'rider_energy_v1'
      - 'stage_live_energy_smooth_v8'
      - 'stage_live_energy_smooth_v9'
      - 'stage_live_energy_smooth_v10'
      - 'stage_live_energy_smooth_v11'
      - 'average_live_energy_pct'
      - 'minimum_live_energy_pct'
      - 'maximum_live_energy_pct'
    ) || jsonb_build_object(
      'source', 'race_engine_v2_segment_replay_gap_continuity_v2_physical_rider_continuity_v4',
      'model', 'strict_10s_merge_with_monotonic_rider_km_and_elapsed_time',
      'base_group_code', g.base_group_code,
      'physical_group_index', g.physical_group_index,
      'peloton_group_index', g.peloton_group_index,
      'peloton_rider_count', g.peloton_rider_count,
      'group_size', g.rider_count,
      'terrain_type', g.terrain_type,
      'slope_percent', g.slope_percent,
      'physical_rider_km_continuity_v4', true,
      'group_span_limit_seconds', 10,
      'group_gap_span_seconds', g.group_gap_span_seconds,
      'minimum_safe_gap_seconds', g.minimum_safe_gap_seconds,
      'maximum_safe_gap_seconds', g.maximum_safe_gap_seconds,
      'raw_group_front_km_v4', g.group_front_km
    ) as metadata
  from tmp_v4_rebuilt_groups g
  order by g.frame_number, g.physical_group_index;

  get diagnostics v_inserted_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_enforce_replay_physical_rider_continuity_v4',
    'simulation_run_id', p_simulation_run_id,
    'race_id', v_race_id,
    'stage_id', v_stage_id,
    'source_group_rows', v_source_group_rows,
    'source_rider_rows', v_source_rider_rows,
    'deleted_group_rows', v_deleted_rows,
    'inserted_group_rows', v_inserted_rows,
    'distinct_frame_numbers', v_distinct_frames
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_stage_live_energy_smooth_v11(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_stage_distance_km numeric := 1;
  v_updated_rows integer := 0;
begin
  select sr.stage_id
  into v_stage_id
  from public.race_stage_simulation_runs sr
  where sr.id = p_simulation_run_id;

  v_stage_id := coalesce(p_stage_id, v_stage_id);

  if v_stage_id is null then
    raise exception 'Simulation run % not found or has no stage_id.', p_simulation_run_id;
  end if;

  select greatest(coalesce(s.distance_km, 1), 1)
  into v_stage_distance_km
  from public.race_stages s
  where s.id = v_stage_id;

  with
  group_frames as (
    select
      f.id,
      f.frame_number,
      greatest(0, least(v_stage_distance_km, coalesce(f.km_marker, 0)::numeric)) as km_marker,
      coalesce(f.group_code, '') as group_code,
      coalesce(f.group_order, 1) as group_order,
      greatest(1, coalesce(array_length(f.rider_ids, 1), 0)) as group_size,
      greatest(0, least(1,
        coalesce(
          case when (f.metadata->>'frame_progress') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then (f.metadata->>'frame_progress')::numeric end,
          greatest(0, least(v_stage_distance_km, coalesce(f.km_marker, 0)::numeric)) / greatest(v_stage_distance_km, 1)
        )
      )) as frame_progress,
      lower(coalesce(nullif(f.metadata->>'terrain_type', ''), 'flat')) as terrain_type,
      coalesce(
        case when (f.metadata->>'slope_percent') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (f.metadata->>'slope_percent')::numeric end,
        0
      ) as slope_percent,
      coalesce(f.metadata, '{}'::jsonb) as metadata,
      f.rider_ids
    from public.race_stage_replay_frames f
    where f.simulation_run_id = p_simulation_run_id
      and f.stage_id = v_stage_id
      and coalesce(f.entity_type, 'group') = 'group'
      and array_length(f.rider_ids, 1) is not null
      and array_length(f.rider_ids, 1) > 0
  ),
  rider_frame_rows as (
    select
      gf.id as frame_id,
      gf.frame_number,
      gf.km_marker,
      gf.group_code,
      gf.group_order,
      gf.group_size,
      gf.frame_progress,
      gf.terrain_type,
      gf.slope_percent,
      rider_item.rider_id::uuid as rider_id,
      rider_item.rider_position,
      coalesce(r.climbing, 60)::numeric as climbing,
      coalesce(r.endurance, 60)::numeric as endurance,
      coalesce(r.flat, 60)::numeric as flat,
      coalesce(r.resistance, 60)::numeric as resistance,
      coalesce(r.recovery, 60)::numeric as recovery,
      coalesce(r.race_iq, 60)::numeric as race_iq,
      greatest(50, least(100, 100 - coalesce(rs.fatigue_before_stage, 0)::numeric))
        as pre_stage_freshness_pct
    from group_frames gf
    cross join lateral unnest(gf.rider_ids) with ordinality as rider_item(rider_id, rider_position)
    left join public.riders r
      on r.id = rider_item.rider_id::uuid
    left join public.race_stage_rider_states rs
      on rs.simulation_run_id = p_simulation_run_id
     and rs.stage_id = v_stage_id
     and rs.rider_id = rider_item.rider_id::uuid
  ),
  rider_frame_with_previous as (
    select
      rfr.*,
      lag(rfr.km_marker) over (partition by rfr.rider_id order by rfr.frame_number) as previous_km_marker,
      lag(rfr.frame_progress) over (partition by rfr.rider_id order by rfr.frame_number) as previous_frame_progress
    from rider_frame_rows rfr
  ),
  rider_frame_energy_input as (
    select
      rfp.*,
      greatest(0, rfp.km_marker - coalesce(rfp.previous_km_marker, rfp.km_marker)) as km_delta,
      greatest(0, rfp.frame_progress - coalesce(rfp.previous_frame_progress, rfp.frame_progress)) as progress_delta,

      case
        when rfp.terrain_type = 'steep_climb' then 1.55 + greatest(0, rfp.slope_percent) * 0.145
        when rfp.terrain_type = 'climb' then 0.92 + greatest(0, rfp.slope_percent) * 0.095
        when rfp.terrain_type = 'false_flat' then 0.40 + greatest(0, rfp.slope_percent) * 0.040
        when rfp.terrain_type = 'technical_descent' then 0.085
        when rfp.terrain_type = 'descent' then 0.060
        else 0.215 + greatest(0, rfp.slope_percent) * 0.025
      end as base_drain_per_km,

      case
        when rfp.terrain_type in ('steep_climb', 'climb', 'false_flat') then
          greatest(0.58, least(2.30, 1 + (74 - rfp.climbing) / 45.0))
        when rfp.terrain_type in ('descent', 'technical_descent') then
          greatest(0.82, least(1.30, 1 + (65 - ((rfp.race_iq * 0.55) + (rfp.resistance * 0.45))) / 105.0))
        else
          greatest(0.76, least(1.55, 1 + (68 - rfp.flat) / 70.0))
      end as skill_drain_factor,

      case
        when rfp.terrain_type in ('climb', 'steep_climb', 'false_flat') then
          case
            when rfp.group_code = 'front_group' then
              case when rfp.group_size <= 3 then 2.05 when rfp.group_size <= 8 then 1.72 else 1.42 end
            when rfp.group_code like 'chase_group%' then
              case when rfp.group_size <= 3 then 1.88 when rfp.group_size <= 8 then 1.58 else 1.34 end
            when rfp.group_code = 'main_peloton' then
              case when rfp.group_size >= 60 then 0.94 when rfp.group_size >= 35 then 1.00 when rfp.group_size >= 20 then 1.08 else 1.18 end
            when rfp.group_code like 'dropped_group%' or rfp.group_code like 'outside_group%' then
              1.28
            else 1.10
          end
        else
          case
            when rfp.group_code = 'front_group' then
              case when rfp.group_size <= 3 then 1.88 when rfp.group_size <= 8 then 1.58 else 1.30 end
            when rfp.group_code like 'chase_group%' then
              case when rfp.group_size <= 3 then 1.68 when rfp.group_size <= 8 then 1.44 else 1.22 end
            when rfp.group_code = 'main_peloton' then
              case when rfp.group_size >= 60 then 0.68 when rfp.group_size >= 35 then 0.76 when rfp.group_size >= 20 then 0.86 else 1.00 end
            when rfp.group_code like 'dropped_group%' or rfp.group_code like 'outside_group%' then
              1.18
            else 1.00
          end
      end as group_drain_factor,

      greatest(1.00, least(1.72, 1 + (100 - rfp.pre_stage_freshness_pct) / 95.0)) as freshness_drain_factor,
      greatest(1.00, least(1.48, 1 + rfp.frame_progress * 0.48)) as late_race_drain_factor,

      case
        when rfp.terrain_type = 'descent' then 0.030 * greatest(0.60, least(1.18, rfp.recovery / 75.0))
        when rfp.terrain_type = 'technical_descent' then 0.020 * greatest(0.60, least(1.12, rfp.recovery / 80.0))
        else 0
      end as recovery_per_km
    from rider_frame_with_previous rfp
  ),
  rider_frame_energy_delta as (
    select
      rfei.*,
      greatest(0,
        rfei.km_delta
        * rfei.base_drain_per_km
        * rfei.skill_drain_factor
        * rfei.group_drain_factor
        * rfei.freshness_drain_factor
        * rfei.late_race_drain_factor
      ) as energy_drain_delta,
      case
        when rfei.terrain_type in ('climb', 'steep_climb', 'false_flat')
          or rfei.slope_percent >= 1.5
        then 0
        else greatest(0, rfei.km_delta * rfei.recovery_per_km)
      end as energy_recovery_delta
    from rider_frame_energy_input rfei
  ),
  rider_frame_cumulative as (
    select
      rfed.*,
      sum(rfed.energy_drain_delta - rfed.energy_recovery_delta) over (
        partition by rfed.rider_id
        order by rfed.frame_number
        rows between unbounded preceding and current row
      ) as raw_energy_used_pct
    from rider_frame_energy_delta rfed
  ),
  rider_frame_energy as (
    select
      rfc.*,
      greatest(0, least(100, round((100 - greatest(0, rfc.raw_energy_used_pct))::numeric, 2))) as live_energy_pct,
      greatest(0, least(100, round(greatest(0, rfc.raw_energy_used_pct)::numeric, 2))) as stage_energy_used_pct
    from rider_frame_cumulative rfc
  ),
  frame_energy_json as (
    select
      rfe.frame_id,
      jsonb_object_agg(
        rfe.rider_id::text,
        jsonb_build_object(
          'pre_stage_freshness_pct', round(rfe.pre_stage_freshness_pct, 2),
          'live_energy_pct', rfe.live_energy_pct,
          'stage_energy_used_pct', rfe.stage_energy_used_pct,
          'source', 'race_engine_apply_stage_live_energy_smooth_v11',
          'terrain_type', rfe.terrain_type,
          'slope_percent', round(rfe.slope_percent, 2)
        )
        order by rfe.rider_position
      ) as rider_energy_v1,
      round(avg(rfe.live_energy_pct), 2) as average_live_energy_pct,
      round(min(rfe.live_energy_pct), 2) as minimum_live_energy_pct,
      round(max(rfe.live_energy_pct), 2) as maximum_live_energy_pct,
      round(avg(rfe.pre_stage_freshness_pct), 2) as average_pre_stage_freshness_pct,
      round(min(rfe.pre_stage_freshness_pct), 2) as minimum_pre_stage_freshness_pct,
      round(max(rfe.pre_stage_freshness_pct), 2) as maximum_pre_stage_freshness_pct
    from rider_frame_energy rfe
    group by rfe.frame_id
  )
  update public.race_stage_replay_frames f
  set metadata =
    coalesce(f.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'rider_energy_v1', fej.rider_energy_v1,
      'stage_live_energy_smooth_v11', true,
      'stage_live_energy_smooth_v10_compat', true,
      'average_live_energy_pct', fej.average_live_energy_pct,
      'minimum_live_energy_pct', fej.minimum_live_energy_pct,
      'maximum_live_energy_pct', fej.maximum_live_energy_pct,
      'average_pre_stage_freshness_pct', fej.average_pre_stage_freshness_pct,
      'minimum_pre_stage_freshness_pct', fej.minimum_pre_stage_freshness_pct,
      'maximum_pre_stage_freshness_pct', fej.maximum_pre_stage_freshness_pct
    )
  from frame_energy_json fej
  where f.id = fej.frame_id;

  get diagnostics v_updated_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_apply_stage_live_energy_smooth_v11',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'updated_group_frame_rows', v_updated_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_enforce_replay_gap_continuity_v3_road_km_safe(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid, p_max_gap_closure_seconds_per_frame numeric DEFAULT 6, p_group_span_limit_seconds numeric DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_distance_km numeric;
  v_source_group_rows integer := 0;
  v_source_rider_rows integer := 0;
  v_deleted_group_rows integer := 0;
  v_inserted_group_rows integer := 0;
  v_distinct_frames integer := 0;
  v_max_groups_in_frame integer := 0;
begin
  select
    sr.race_id,
    sr.stage_id,
    rs.distance_km
  into
    v_race_id,
    v_stage_id,
    v_distance_km
  from public.race_stage_simulation_runs sr
  join public.race_stages rs
    on rs.id = sr.stage_id
  where sr.id = p_simulation_run_id
    and (p_stage_id is null or sr.stage_id = p_stage_id)
    and sr.status = 'completed';

  if v_race_id is null or v_stage_id is null then
    raise exception
      'Completed simulation run % was not found for stage %.',
      p_simulation_run_id,
      p_stage_id;
  end if;

  drop table if exists pg_temp.tmp_replay_gap_v2_source_frames;
  drop table if exists pg_temp.tmp_replay_gap_v2_source_riders;
  drop table if exists pg_temp.tmp_replay_gap_v2_safe_riders;
  drop table if exists pg_temp.tmp_replay_gap_v2_regrouped;

  create temporary table tmp_replay_gap_v2_source_frames on commit drop as
  select
    f.id,
    f.frame_number::integer as frame_number,
    coalesce(f.race_seconds, 0)::integer as race_seconds,
    coalesce(f.km_marker, 0)::numeric as km_marker,
    coalesce(f.group_order, 1)::integer as group_order,
    coalesce(f.group_code, '')::text as group_code,
    coalesce(f.group_label, '')::text as group_label,
    greatest(0, coalesce(f.gap_seconds, 0))::numeric as gap_seconds,
    greatest(1, coalesce(f.avg_speed_kmh, 38))::numeric as avg_speed_kmh,
    coalesce(f.rider_ids, array[]::uuid[]) as rider_ids,
    coalesce(f.rider_names, array[]::text[]) as rider_names,
    coalesce(f.team_names, array[]::text[]) as team_names,
    coalesce(f.metadata, '{}'::jsonb) as metadata
  from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group'
  order by f.frame_number, f.group_order, f.group_code;

  get diagnostics v_source_group_rows = row_count;

  if v_source_group_rows = 0 then
    return jsonb_build_object(
      'status', 'skipped',
      'function', 'race_engine_enforce_replay_gap_continuity_v3_road_km_safe',
      'reason', 'no_group_replay_frames_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id
    );
  end if;

  create temporary table tmp_replay_gap_v2_source_riders on commit drop as
  with frame_context as (
    select
      frame_number,
      min(race_seconds)::integer as race_seconds,
      max(km_marker)::numeric as leader_km,
      max(avg_speed_kmh)::numeric as leader_speed_kmh,
      (array_agg(metadata order by group_order, group_code))[1] as frame_metadata,
      coalesce(
        (array_agg(nullif(metadata->>'terrain_type', '') order by group_order, group_code))[1],
        (array_agg(nullif(metadata->>'current_terrain_type', '') order by group_order, group_code))[1],
        ''
      ) as frame_terrain_type,
      coalesce(
        nullif((array_agg(metadata->>'slope_percent' order by group_order, group_code))[1], '')::numeric,
        nullif((array_agg(metadata->>'current_slope_percent' order by group_order, group_code))[1], '')::numeric,
        0
      ) as frame_slope_percent
    from tmp_replay_gap_v2_source_frames
    group by frame_number
  )
  select
    sf.frame_number,
    fc.race_seconds,
    fc.leader_km,
    fc.leader_speed_kmh,
    fc.frame_metadata,
    fc.frame_terrain_type,
    fc.frame_slope_percent,
    sf.group_order as source_group_order,
    sf.group_code as source_group_code,
    sf.group_label as source_group_label,
    sf.km_marker as source_km_marker,
    sf.gap_seconds as raw_gap_seconds,
    sf.avg_speed_kmh,
    rider.rider_id,
    rider.rider_ordinal::integer as rider_ordinal,
    coalesce(sf.rider_names[rider.rider_ordinal::integer], 'Rider') as rider_name,
    coalesce(sf.team_names[rider.rider_ordinal::integer], '') as team_name,
    row_number() over (
      partition by sf.frame_number
      order by sf.gap_seconds, sf.group_order, rider.rider_ordinal, rider.rider_id
    )::integer as live_rank_hint
  from tmp_replay_gap_v2_source_frames sf
  join frame_context fc
    on fc.frame_number = sf.frame_number
  cross join lateral unnest(sf.rider_ids) with ordinality as rider(rider_id, rider_ordinal)
  where array_length(sf.rider_ids, 1) is not null;

  get diagnostics v_source_rider_rows = row_count;

  if v_source_rider_rows = 0 then
    return jsonb_build_object(
      'status', 'skipped',
      'function', 'race_engine_enforce_replay_gap_continuity_v3_road_km_safe',
      'reason', 'no_rider_arrays_found_in_group_frames',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id,
      'source_group_rows', v_source_group_rows
    );
  end if;

  create temporary table tmp_replay_gap_v2_safe_riders on commit drop as
  with recursive ordered_rows as (
    select
      source.*,
      row_number() over (
        partition by source.rider_id
        order by source.frame_number
      )::integer as rider_frame_index
    from tmp_replay_gap_v2_source_riders source
  ),
  safe_rows as (
    select
      ordered_rows.*,
      ordered_rows.raw_gap_seconds::numeric as safe_gap_seconds
    from ordered_rows
    where ordered_rows.rider_frame_index = 1

    union all

    select
      next_row.*,
      case
        when next_row.raw_gap_seconds < previous.safe_gap_seconds then
          greatest(
            next_row.raw_gap_seconds,
            previous.safe_gap_seconds - greatest(
              2::numeric,
              least(
                8::numeric,
                p_max_gap_closure_seconds_per_frame
                * greatest(
                    0.50::numeric,
                    least(
                      1.50::numeric,
                      abs(next_row.leader_km - previous.leader_km) / 0.50
                    )
                  )
              )
            )
          )
        else
          next_row.raw_gap_seconds
      end::numeric as safe_gap_seconds
    from safe_rows previous
    join ordered_rows next_row
      on next_row.rider_id = previous.rider_id
     and next_row.rider_frame_index = previous.rider_frame_index + 1
  )
  select *
  from safe_rows;

  create index on tmp_replay_gap_v2_safe_riders(frame_number, safe_gap_seconds);
  create index on tmp_replay_gap_v2_safe_riders(rider_id, frame_number);

  create temporary table tmp_replay_gap_v2_regrouped on commit drop as
  with recursive
  ranked_riders as (
    select
      safe.*,
      row_number() over (
        partition by safe.frame_number
        order by safe.safe_gap_seconds, safe.live_rank_hint, safe.rider_id
      )::integer as live_rank
    from tmp_replay_gap_v2_safe_riders safe
  ),
  grouped_riders as (
    select
      ranked.*,
      1::integer as physical_group_index,
      ranked.safe_gap_seconds::numeric as group_start_gap_seconds,
      ranked.safe_gap_seconds::numeric as previous_safe_gap_seconds
    from ranked_riders ranked
    where ranked.live_rank = 1

    union all

    select
      next_rider.*,
      case
        when next_rider.leader_km <= 12 then
          previous.physical_group_index
        when greatest(0, next_rider.safe_gap_seconds - previous.safe_gap_seconds) < p_group_span_limit_seconds
         and greatest(0, next_rider.safe_gap_seconds - previous.group_start_gap_seconds) < p_group_span_limit_seconds
        then
          previous.physical_group_index
        else
          previous.physical_group_index + 1
      end::integer as physical_group_index,
      case
        when next_rider.leader_km <= 12 then
          previous.group_start_gap_seconds
        when greatest(0, next_rider.safe_gap_seconds - previous.safe_gap_seconds) < p_group_span_limit_seconds
         and greatest(0, next_rider.safe_gap_seconds - previous.group_start_gap_seconds) < p_group_span_limit_seconds
        then
          previous.group_start_gap_seconds
        else
          next_rider.safe_gap_seconds
      end::numeric as group_start_gap_seconds,
      next_rider.safe_gap_seconds::numeric as previous_safe_gap_seconds
    from grouped_riders previous
    join ranked_riders next_rider
      on next_rider.frame_number = previous.frame_number
     and next_rider.live_rank = previous.live_rank + 1
  ),
  physical_group_summary as (
    select
      group_row.frame_number,
      min(group_row.race_seconds)::integer as race_seconds,
      group_row.physical_group_index,
      count(*)::integer as rider_count,
      min(group_row.live_rank)::integer as first_live_rank,
      min(group_row.safe_gap_seconds)::numeric as minimum_gap_seconds,
      max(group_row.safe_gap_seconds)::numeric as maximum_gap_seconds,
      round(avg(group_row.safe_gap_seconds), 3)::numeric as average_gap_seconds,
      round(avg(group_row.avg_speed_kmh), 2)::numeric as avg_speed_kmh,
      max(group_row.leader_km)::numeric as leader_km,
      max(group_row.source_km_marker)::numeric as source_front_km_marker,
      round(avg(group_row.source_km_marker), 3)::numeric as average_source_km_marker,
      max(group_row.leader_speed_kmh)::numeric as leader_speed_kmh,
      (array_agg(group_row.frame_metadata order by group_row.live_rank))[1] as frame_metadata,
      (array_agg(group_row.frame_terrain_type order by group_row.live_rank))[1] as current_terrain_type,
      (array_agg(group_row.frame_slope_percent order by group_row.live_rank))[1] as current_slope_percent,
      array_agg(group_row.rider_id order by group_row.live_rank) as rider_ids,
      array_agg(group_row.rider_name order by group_row.live_rank) as rider_names,
      array_agg(group_row.team_name order by group_row.live_rank) as team_names
    from grouped_riders group_row
    group by group_row.frame_number, group_row.physical_group_index
  ),
  peloton_group_by_frame as (
    select distinct on (summary.frame_number)
      summary.frame_number,
      summary.physical_group_index as peloton_group_index,
      summary.rider_count as peloton_rider_count
    from physical_group_summary summary
    order by
      summary.frame_number,
      summary.rider_count desc,
      summary.average_gap_seconds asc,
      summary.first_live_rank asc
  ),
  mapped_groups as (
    select
      summary.*,
      peloton.peloton_group_index,
      peloton.peloton_rider_count,
      case
        when summary.physical_group_index = peloton.peloton_group_index then 'main_peloton'
        when summary.physical_group_index < peloton.peloton_group_index then
          case when summary.physical_group_index = 1 then 'front_group' else 'chase_group' end
        when summary.physical_group_index = peloton.peloton_group_index + 1 then 'dropped_group'
        else 'outside_group'
      end as base_group_code,
      case
        when summary.physical_group_index = peloton.peloton_group_index then 'main_peloton'
        when summary.physical_group_index = 1 and summary.physical_group_index < peloton.peloton_group_index then 'front_group'
        when summary.physical_group_index < peloton.peloton_group_index then
          'chase_group_' || lpad(summary.physical_group_index::text, 2, '0')
        when summary.physical_group_index = peloton.peloton_group_index + 1 then 'dropped_group'
        else
          'outside_group_' || lpad(
            (summary.physical_group_index - peloton.peloton_group_index - 1)::text,
            2,
            '0'
          )
      end as group_code,
      case
        when summary.physical_group_index = peloton.peloton_group_index then 'Peloton'
        when summary.physical_group_index = 1 and summary.physical_group_index < peloton.peloton_group_index then 'Front group'
        when summary.physical_group_index < peloton.peloton_group_index then
          'Chasing group ' || summary.physical_group_index::text
        when summary.physical_group_index = peloton.peloton_group_index + 1 then 'Dropped group'
        else
          'Outside group ' || (summary.physical_group_index - peloton.peloton_group_index - 1)::text
      end as group_label
    from physical_group_summary summary
    join peloton_group_by_frame peloton
      on peloton.frame_number = summary.frame_number
  ),
  monotone_gaps as (
    select
      mapped.*,
      case
        when mapped.physical_group_index = 1 then 0
        else max(floor(mapped.minimum_gap_seconds)::integer) over (
          partition by mapped.frame_number
          order by mapped.physical_group_index
          rows between unbounded preceding and current row
        )
      end::integer as gap_seconds
    from mapped_groups mapped
  )
  select
    monotone.*,
    greatest(
      0,
      least(
        v_distance_km,
        round(monotone.source_front_km_marker, 3)
      )
    )::numeric as km_marker
  from monotone_gaps monotone;

  select count(*), coalesce(max(groups_per_frame), 0)
  into v_distinct_frames, v_max_groups_in_frame
  from (
    select frame_number, count(*) as groups_per_frame
    from tmp_replay_gap_v2_regrouped
    group by frame_number
  ) x;

  delete from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group';

  get diagnostics v_deleted_group_rows = row_count;

  insert into public.race_stage_replay_frames (
    simulation_run_id,
    race_id,
    stage_id,
    frame_number,
    race_seconds,
    km_marker,
    group_code,
    group_label,
    group_order,
    gap_seconds,
    avg_speed_kmh,
    rider_ids,
    rider_names,
    team_names,
    entity_type,
    metadata
  )
  select
    p_simulation_run_id,
    v_race_id,
    v_stage_id,
    replay.frame_number,
    replay.race_seconds,
    replay.km_marker,
    replay.group_code,
    replay.group_label,
    replay.physical_group_index as group_order,
    replay.gap_seconds,
    replay.avg_speed_kmh,
    replay.rider_ids,
    replay.rider_names,
    replay.team_names,
    'group' as entity_type,
    coalesce(replay.frame_metadata, '{}'::jsonb) ||
      jsonb_build_object(
        'source', 'race_engine_v2_segment_replay_gap_continuity_v3_road_km_safe',
        'model', 'strict_10s_merge_with_temporal_gap_continuity_and_group_span_cap',
        'strict_merge_threshold_seconds', p_group_span_limit_seconds,
        'group_span_limit_seconds', p_group_span_limit_seconds,
        'max_gap_closure_seconds_per_frame', p_max_gap_closure_seconds_per_frame,
        'base_group_code', replay.base_group_code,
        'physical_group_index', replay.physical_group_index,
        'peloton_group_index', replay.peloton_group_index,
        'peloton_rider_count', replay.peloton_rider_count,
        'group_size', replay.rider_count,
        'minimum_safe_gap_seconds', replay.minimum_gap_seconds,
        'maximum_safe_gap_seconds', replay.maximum_gap_seconds,
        'group_gap_span_seconds', replay.maximum_gap_seconds - replay.minimum_gap_seconds,
        'average_safe_gap_seconds', replay.average_gap_seconds,
        'terrain_type', replay.current_terrain_type,
        'slope_percent', replay.current_slope_percent,
        'gap_continuity_patch_applied', true,
        'gap_continuity_patch_version', 'v2'
      ) as metadata
  from tmp_replay_gap_v2_regrouped replay
  order by replay.frame_number, replay.physical_group_index;

  get diagnostics v_inserted_group_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_enforce_replay_gap_continuity_v3_road_km_safe',
    'simulation_run_id', p_simulation_run_id,
    'race_id', v_race_id,
    'stage_id', v_stage_id,
    'source_group_rows', v_source_group_rows,
    'source_rider_rows', v_source_rider_rows,
    'deleted_group_rows', v_deleted_group_rows,
    'inserted_group_rows', v_inserted_group_rows,
    'distinct_frame_numbers', v_distinct_frames,
    'max_groups_in_one_frame', v_max_groups_in_frame,
    'strict_merge_threshold_seconds', p_group_span_limit_seconds,
    'group_span_limit_seconds', p_group_span_limit_seconds,
    'max_gap_closure_seconds_per_frame', p_max_gap_closure_seconds_per_frame
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_stage_live_energy_smooth_v12(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_stage_distance_km numeric := 1;
  v_updated_rows integer := 0;
begin
  select sr.stage_id
  into v_stage_id
  from public.race_stage_simulation_runs sr
  where sr.id = p_simulation_run_id;

  v_stage_id := coalesce(p_stage_id, v_stage_id);

  if v_stage_id is null then
    raise exception 'Simulation run % not found or has no stage_id.', p_simulation_run_id;
  end if;

  select greatest(coalesce(s.distance_km, 1), 1)
  into v_stage_distance_km
  from public.race_stages s
  where s.id = v_stage_id;

  with
  group_frames as (
    select
      f.id,
      f.frame_number,
      greatest(0, least(v_stage_distance_km, coalesce(f.km_marker, 0)::numeric)) as km_marker,
      coalesce(f.group_code, '') as group_code,
      coalesce(f.group_order, 1) as group_order,
      greatest(1, coalesce(array_length(f.rider_ids, 1), 0)) as group_size,
      greatest(0, least(1,
        coalesce(
          case when (f.metadata->>'frame_progress') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then (f.metadata->>'frame_progress')::numeric end,
          greatest(0, least(v_stage_distance_km, coalesce(f.km_marker, 0)::numeric)) / greatest(v_stage_distance_km, 1)
        )
      )) as frame_progress,
      lower(coalesce(nullif(f.metadata->>'terrain_type', ''), 'flat')) as terrain_type,
      coalesce(
        case when (f.metadata->>'slope_percent') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (f.metadata->>'slope_percent')::numeric end,
        0
      ) as slope_percent,
      coalesce(f.metadata, '{}'::jsonb) as metadata,
      f.rider_ids
    from public.race_stage_replay_frames f
    where f.simulation_run_id = p_simulation_run_id
      and f.stage_id = v_stage_id
      and coalesce(f.entity_type, 'group') = 'group'
      and array_length(f.rider_ids, 1) is not null
      and array_length(f.rider_ids, 1) > 0
  ),
  rider_frame_rows as (
    select
      gf.id as frame_id,
      gf.frame_number,
      gf.km_marker,
      gf.group_code,
      gf.group_order,
      gf.group_size,
      gf.frame_progress,
      gf.terrain_type,
      gf.slope_percent,
      rider_item.rider_id::uuid as rider_id,
      rider_item.rider_position,
      coalesce(r.climbing, 60)::numeric as climbing,
      coalesce(r.endurance, 60)::numeric as endurance,
      coalesce(r.flat, 60)::numeric as flat,
      coalesce(r.resistance, 60)::numeric as resistance,
      coalesce(r.recovery, 60)::numeric as recovery,
      coalesce(r.race_iq, 60)::numeric as race_iq,
      greatest(50, least(100, 100 - coalesce(rs.fatigue_before_stage, 0)::numeric))
        as pre_stage_freshness_pct
    from group_frames gf
    cross join lateral unnest(gf.rider_ids) with ordinality as rider_item(rider_id, rider_position)
    left join public.riders r
      on r.id = rider_item.rider_id::uuid
    left join public.race_stage_rider_states rs
      on rs.simulation_run_id = p_simulation_run_id
     and rs.stage_id = v_stage_id
     and rs.rider_id = rider_item.rider_id::uuid
  ),
  rider_frame_with_previous as (
    select
      rfr.*,
      lag(rfr.km_marker) over (partition by rfr.rider_id order by rfr.frame_number) as previous_km_marker,
      lag(rfr.frame_progress) over (partition by rfr.rider_id order by rfr.frame_number) as previous_frame_progress
    from rider_frame_rows rfr
  ),
  rider_frame_energy_input as (
    select
      rfp.*,
      greatest(0, rfp.km_marker - coalesce(rfp.previous_km_marker, rfp.km_marker)) as km_delta,
      greatest(0, rfp.frame_progress - coalesce(rfp.previous_frame_progress, rfp.frame_progress)) as progress_delta,

      /*
       * v12 sits between v9 and v11:
       * - less punishing than v11 in the first third
       * - still terrain/skill/freshness/group-size aware
       * - climbs drain, descents may recover slightly
       */
      case
        when rfp.terrain_type = 'steep_climb' then 1.05 + greatest(0, rfp.slope_percent) * 0.105
        when rfp.terrain_type = 'climb' then 0.62 + greatest(0, rfp.slope_percent) * 0.065
        when rfp.terrain_type = 'false_flat' then 0.28 + greatest(0, rfp.slope_percent) * 0.030
        when rfp.terrain_type = 'technical_descent' then 0.060
        when rfp.terrain_type = 'descent' then 0.040
        else 0.150 + greatest(0, rfp.slope_percent) * 0.015
      end as base_drain_per_km,

      case
        when rfp.terrain_type in ('steep_climb', 'climb', 'false_flat') then
          greatest(0.62, least(1.90, 1 + (72 - rfp.climbing) / 58.0))
        when rfp.terrain_type in ('descent', 'technical_descent') then
          greatest(0.84, least(1.22, 1 + (65 - ((rfp.race_iq * 0.55) + (rfp.resistance * 0.45))) / 125.0))
        else
          greatest(0.72, least(1.35, 1 + (67 - rfp.flat) / 90.0))
      end as skill_drain_factor,

      case
        when rfp.terrain_type in ('climb', 'steep_climb', 'false_flat') then
          case
            when rfp.group_code = 'front_group' then
              case when rfp.group_size <= 3 then 1.65 when rfp.group_size <= 8 then 1.45 else 1.25 end
            when rfp.group_code like 'chase_group%' then
              case when rfp.group_size <= 3 then 1.52 when rfp.group_size <= 8 then 1.34 else 1.18 end
            when rfp.group_code = 'main_peloton' then
              case when rfp.group_size >= 60 then 0.82 when rfp.group_size >= 35 then 0.90 when rfp.group_size >= 20 then 1.00 else 1.08 end
            when rfp.group_code like 'dropped_group%' or rfp.group_code like 'outside_group%' then
              1.12
            else 1.04
          end
        else
          case
            when rfp.group_code = 'front_group' then
              case when rfp.group_size <= 3 then 1.52 when rfp.group_size <= 8 then 1.32 else 1.15 end
            when rfp.group_code like 'chase_group%' then
              case when rfp.group_size <= 3 then 1.38 when rfp.group_size <= 8 then 1.22 else 1.10 end
            when rfp.group_code = 'main_peloton' then
              case when rfp.group_size >= 60 then 0.58 when rfp.group_size >= 35 then 0.66 when rfp.group_size >= 20 then 0.76 else 0.90 end
            when rfp.group_code like 'dropped_group%' or rfp.group_code like 'outside_group%' then
              1.08
            else 0.96
          end
      end as group_drain_factor,

      greatest(1.00, least(1.36, 1 + (100 - rfp.pre_stage_freshness_pct) / 140.0)) as freshness_drain_factor,

      /* Early race is protected. Drain ramps up later. */
      greatest(0.82, least(1.24, 0.86 + rfp.frame_progress * 0.38)) as stage_progress_drain_factor,

      case
        when rfp.terrain_type = 'descent' then 0.035 * greatest(0.60, least(1.18, rfp.recovery / 75.0))
        when rfp.terrain_type = 'technical_descent' then 0.024 * greatest(0.60, least(1.12, rfp.recovery / 80.0))
        else 0
      end as recovery_per_km
    from rider_frame_with_previous rfp
  ),
  rider_frame_energy_delta as (
    select
      rfei.*,
      greatest(0,
        rfei.km_delta
        * rfei.base_drain_per_km
        * rfei.skill_drain_factor
        * rfei.group_drain_factor
        * rfei.freshness_drain_factor
        * rfei.stage_progress_drain_factor
      ) as energy_drain_delta,
      case
        when rfei.terrain_type in ('climb', 'steep_climb', 'false_flat')
          or rfei.slope_percent >= 1.5
        then 0
        else greatest(0, rfei.km_delta * rfei.recovery_per_km)
      end as energy_recovery_delta
    from rider_frame_energy_input rfei
  ),
  rider_frame_cumulative as (
    select
      rfed.*,
      sum(rfed.energy_drain_delta - rfed.energy_recovery_delta) over (
        partition by rfed.rider_id
        order by rfed.frame_number
        rows between unbounded preceding and current row
      ) as raw_energy_used_pct
    from rider_frame_energy_delta rfed
  ),
  rider_frame_energy as (
    select
      rfc.*,
      greatest(0, least(100, round((100 - greatest(0, rfc.raw_energy_used_pct))::numeric, 2))) as live_energy_pct,
      greatest(0, least(100, round(greatest(0, rfc.raw_energy_used_pct)::numeric, 2))) as stage_energy_used_pct
    from rider_frame_cumulative rfc
  ),
  frame_energy_json as (
    select
      rfe.frame_id,
      jsonb_object_agg(
        rfe.rider_id::text,
        jsonb_build_object(
          'pre_stage_freshness_pct', round(rfe.pre_stage_freshness_pct, 2),
          'live_energy_pct', rfe.live_energy_pct,
          'stage_energy_used_pct', rfe.stage_energy_used_pct,
          'source', 'race_engine_apply_stage_live_energy_smooth_v12',
          'terrain_type', rfe.terrain_type,
          'slope_percent', round(rfe.slope_percent, 2),
          'climbing_skill', round(rfe.climbing, 2),
          'flat_skill', round(rfe.flat, 2),
          'endurance_skill', round(rfe.endurance, 2)
        )
        order by rfe.rider_position
      ) as rider_energy_v1,
      round(avg(rfe.live_energy_pct), 2) as average_live_energy_pct,
      round(min(rfe.live_energy_pct), 2) as minimum_live_energy_pct,
      round(max(rfe.live_energy_pct), 2) as maximum_live_energy_pct,
      round(avg(rfe.pre_stage_freshness_pct), 2) as average_pre_stage_freshness_pct,
      round(min(rfe.pre_stage_freshness_pct), 2) as minimum_pre_stage_freshness_pct,
      round(max(rfe.pre_stage_freshness_pct), 2) as maximum_pre_stage_freshness_pct
    from rider_frame_energy rfe
    group by rfe.frame_id
  )
  update public.race_stage_replay_frames f
  set metadata =
    coalesce(f.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'rider_energy_v1', fej.rider_energy_v1,
      'stage_live_energy_smooth_v12', true,
      'stage_live_energy_smooth_v11_compat', true,
      'average_live_energy_pct', fej.average_live_energy_pct,
      'minimum_live_energy_pct', fej.minimum_live_energy_pct,
      'maximum_live_energy_pct', fej.maximum_live_energy_pct,
      'average_pre_stage_freshness_pct', fej.average_pre_stage_freshness_pct,
      'minimum_pre_stage_freshness_pct', fej.minimum_pre_stage_freshness_pct,
      'maximum_pre_stage_freshness_pct', fej.maximum_pre_stage_freshness_pct
    )
  from frame_energy_json fej
  where f.id = fej.frame_id;

  get diagnostics v_updated_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_apply_stage_live_energy_smooth_v12',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'updated_group_frame_rows', v_updated_rows,
    'mode', 'moderate_between_v9_and_v11_skill_terrain_freshness_aware'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_email_registered_v1(p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email text;
begin
  v_email := lower(btrim(coalesce(p_email, '')));

  if v_email = '' then
    return false;
  end if;

  return exists (
    select 1
    from auth.users u
    where lower(btrim(coalesce(u.email, ''))) = v_email
  )
  or exists (
    select 1
    from public.profiles p
    where lower(btrim(coalesce(p.email, ''))) = v_email
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_enforce_replay_v4_no_backward_less_microgroups(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid, p_max_gap_closure_seconds_per_frame numeric DEFAULT 6, p_display_group_span_limit_seconds numeric DEFAULT 18, p_major_separator_seconds numeric DEFAULT 45)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_distance_km numeric;
  v_source_group_rows integer := 0;
  v_source_rider_rows integer := 0;
  v_deleted_group_rows integer := 0;
  v_inserted_group_rows integer := 0;
  v_distinct_frames integer := 0;
  v_max_groups_in_frame integer := 0;
begin
  select
    sr.race_id,
    sr.stage_id,
    greatest(coalesce(rs.distance_km, 1), 1)
  into v_race_id, v_stage_id, v_distance_km
  from public.race_stage_simulation_runs sr
  join public.race_stages rs on rs.id = sr.stage_id
  where sr.id = p_simulation_run_id
    and (p_stage_id is null or sr.stage_id = p_stage_id)
    and sr.status = 'completed';

  if v_race_id is null or v_stage_id is null then
    raise exception 'Completed simulation run % was not found for stage %.', p_simulation_run_id, p_stage_id;
  end if;

  drop table if exists pg_temp.tmp_v4nb_source_frames;
  drop table if exists pg_temp.tmp_v4nb_source_riders;
  drop table if exists pg_temp.tmp_v4nb_gap_safe_riders;
  drop table if exists pg_temp.tmp_v4nb_km_safe_riders;
  drop table if exists pg_temp.tmp_v4nb_ranked_riders;
  drop table if exists pg_temp.tmp_v4nb_grouped_riders;
  drop table if exists pg_temp.tmp_v4nb_rebuilt_groups;

  create temporary table tmp_v4nb_source_frames on commit drop as
  select
    f.id,
    f.frame_number::integer as frame_number,
    coalesce(f.race_seconds, 0)::integer as race_seconds,
    greatest(0, least(v_distance_km, coalesce(f.km_marker, 0)::numeric)) as km_marker,
    coalesce(f.group_order, 1)::integer as group_order,
    coalesce(f.group_code, '')::text as group_code,
    coalesce(f.group_label, '')::text as group_label,
    greatest(0, coalesce(f.gap_seconds, 0)::numeric) as gap_seconds,
    greatest(1, coalesce(f.avg_speed_kmh, 38)::numeric) as avg_speed_kmh,
    coalesce(f.rider_ids, array[]::uuid[]) as rider_ids,
    coalesce(f.rider_names, array[]::text[]) as rider_names,
    coalesce(f.team_names, array[]::text[]) as team_names,
    coalesce(f.metadata, '{}'::jsonb) as metadata,
    lower(coalesce(nullif(f.metadata->>'terrain_type', ''), 'flat')) as terrain_type,
    coalesce(
      case when (f.metadata->>'slope_percent') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (f.metadata->>'slope_percent')::numeric end,
      0
    ) as slope_percent
  from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group'
    and array_length(f.rider_ids, 1) is not null
    and array_length(f.rider_ids, 1) > 0
  order by f.frame_number, f.group_order, f.group_code;

  get diagnostics v_source_group_rows = row_count;

  if v_source_group_rows = 0 then
    return jsonb_build_object(
      'status', 'skipped',
      'function', 'race_engine_enforce_replay_v4_no_backward_less_microgroups',
      'reason', 'no_group_replay_frames_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id
    );
  end if;

  create temporary table tmp_v4nb_source_riders on commit drop as
  select
    sf.frame_number,
    sf.race_seconds,
    sf.km_marker as raw_group_km_marker,
    sf.group_order as raw_group_order,
    sf.group_code as raw_group_code,
    sf.group_label as raw_group_label,
    sf.gap_seconds as raw_gap_seconds,
    sf.avg_speed_kmh,
    sf.metadata,
    sf.terrain_type,
    sf.slope_percent,
    rider.rider_id::uuid as rider_id,
    rider.rider_ordinal::integer as rider_ordinal,
    coalesce(sf.rider_names[rider.rider_ordinal::integer], 'Rider') as rider_name,
    coalesce(sf.team_names[rider.rider_ordinal::integer], '') as team_name,
    row_number() over (
      partition by rider.rider_id::uuid
      order by sf.frame_number, sf.race_seconds, sf.group_order, rider.rider_ordinal
    )::integer as rider_frame_index
  from tmp_v4nb_source_frames sf
  cross join lateral unnest(sf.rider_ids) with ordinality as rider(rider_id, rider_ordinal);

  get diagnostics v_source_rider_rows = row_count;

  create index on tmp_v4nb_source_riders(rider_id, rider_frame_index);
  create index on tmp_v4nb_source_riders(frame_number, raw_gap_seconds, raw_group_order);

  -- First protect time gaps. A rider may lose time quickly, but cannot close
  -- a big gap faster than p_max_gap_closure_seconds_per_frame.
  create temporary table tmp_v4nb_gap_safe_riders on commit drop as
  with recursive gap_rows as (
    select
      r.*,
      r.raw_gap_seconds::numeric as temporal_safe_gap_seconds
    from tmp_v4nb_source_riders r
    where r.rider_frame_index = 1

    union all

    select
      next_row.*,
      case
        when next_row.raw_gap_seconds < previous.temporal_safe_gap_seconds then
          greatest(
            next_row.raw_gap_seconds,
            previous.temporal_safe_gap_seconds - greatest(2::numeric, p_max_gap_closure_seconds_per_frame)
          )
        else next_row.raw_gap_seconds
      end::numeric as temporal_safe_gap_seconds
    from gap_rows previous
    join tmp_v4nb_source_riders next_row
      on next_row.rider_id = previous.rider_id
     and next_row.rider_frame_index = previous.rider_frame_index + 1
  )
  select * from gap_rows;

  create index on tmp_v4nb_gap_safe_riders(rider_id, rider_frame_index);
  create index on tmp_v4nb_gap_safe_riders(frame_number, temporal_safe_gap_seconds);

  -- Then protect displayed road km. If a rider drops on a climb, he continues
  -- forward slowly; he is not placed 1–3 km back on the profile.
  create temporary table tmp_v4nb_km_safe_riders on commit drop as
  with recursive km_rows as (
    select
      r.*,
      r.raw_group_km_marker::numeric as display_safe_km_marker
    from tmp_v4nb_gap_safe_riders r
    where r.rider_frame_index = 1

    union all

    select
      next_row.*,
      least(
        v_distance_km,
        greatest(
          next_row.raw_group_km_marker,
          previous.display_safe_km_marker + (
            case
              when next_row.terrain_type = 'steep_climb' then 3.0
              when next_row.terrain_type = 'climb' then 4.5
              when next_row.terrain_type = 'false_flat' then 6.0
              when next_row.terrain_type = 'technical_descent' then 10.0
              when next_row.terrain_type = 'descent' then 12.0
              else 7.0
            end::numeric
            * greatest(0, next_row.race_seconds - previous.race_seconds)::numeric
            / 3600.0
          )
        )
      )::numeric as display_safe_km_marker
    from km_rows previous
    join tmp_v4nb_gap_safe_riders next_row
      on next_row.rider_id = previous.rider_id
     and next_row.rider_frame_index = previous.rider_frame_index + 1
  )
  select * from km_rows;

  create index on tmp_v4nb_km_safe_riders(rider_id, frame_number);
  create index on tmp_v4nb_km_safe_riders(frame_number, display_safe_km_marker);

  -- Combine temporal gap continuity and physical displayed-km continuity.
  -- The grouping basis must stay monotone and road-order friendly.
  create temporary table tmp_v4nb_ranked_riders on commit drop as
  with frame_leaders as (
    select
      frame_number,
      max(display_safe_km_marker) as leader_display_km,
      max(avg_speed_kmh) as leader_speed_kmh
    from tmp_v4nb_km_safe_riders
    group by frame_number
  ),
  ranked_base as (
    select
      r.*,
      fl.leader_display_km,
      greatest(
        r.temporal_safe_gap_seconds,
        round(
          greatest(0, fl.leader_display_km - r.display_safe_km_marker)
          / greatest(8, r.avg_speed_kmh)
          * 3600
        )::numeric
      ) as grouping_gap_seconds
    from tmp_v4nb_km_safe_riders r
    join frame_leaders fl on fl.frame_number = r.frame_number
  )
  select
    rb.*,
    row_number() over (
      partition by rb.frame_number
      order by rb.grouping_gap_seconds, rb.display_safe_km_marker desc, rb.raw_group_order, rb.rider_ordinal, rb.rider_id
    )::integer as live_rank
  from ranked_base rb;

  create index on tmp_v4nb_ranked_riders(frame_number, live_rank);

  -- Practical grouping: keep big gaps separate, but do not make a new displayed
  -- group for every 10–12 second micro-split. This is display consolidation,
  -- not old catch teleporting: a 45s+ separator always starts a new group.
  create temporary table tmp_v4nb_grouped_riders on commit drop as
  with recursive grouped as (
    select
      r.*,
      1::integer as physical_group_index,
      r.grouping_gap_seconds::numeric as group_start_gap_seconds,
      r.grouping_gap_seconds::numeric as previous_grouping_gap_seconds
    from tmp_v4nb_ranked_riders r
    where r.live_rank = 1

    union all

    select
      next_rider.*,
      case
        when next_rider.leader_display_km <= 12 then previous.physical_group_index
        when greatest(0, next_rider.grouping_gap_seconds - previous.previous_grouping_gap_seconds) >= p_major_separator_seconds then previous.physical_group_index + 1
        when greatest(0, next_rider.grouping_gap_seconds - previous.group_start_gap_seconds) < p_display_group_span_limit_seconds then previous.physical_group_index
        else previous.physical_group_index + 1
      end::integer as physical_group_index,
      case
        when next_rider.leader_display_km <= 12 then previous.group_start_gap_seconds
        when greatest(0, next_rider.grouping_gap_seconds - previous.previous_grouping_gap_seconds) >= p_major_separator_seconds then next_rider.grouping_gap_seconds
        when greatest(0, next_rider.grouping_gap_seconds - previous.group_start_gap_seconds) < p_display_group_span_limit_seconds then previous.group_start_gap_seconds
        else next_rider.grouping_gap_seconds
      end::numeric as group_start_gap_seconds,
      next_rider.grouping_gap_seconds::numeric as previous_grouping_gap_seconds
    from grouped previous
    join tmp_v4nb_ranked_riders next_rider
      on next_rider.frame_number = previous.frame_number
     and next_rider.live_rank = previous.live_rank + 1
  )
  select * from grouped;

  create index on tmp_v4nb_grouped_riders(frame_number, physical_group_index);

  create temporary table tmp_v4nb_rebuilt_groups on commit drop as
  with group_summary as (
    select
      gr.frame_number,
      min(gr.race_seconds)::integer as race_seconds,
      gr.physical_group_index,
      count(*)::integer as rider_count,
      min(gr.live_rank)::integer as first_live_rank,
      round(max(gr.display_safe_km_marker), 3)::numeric as km_marker,
      round(avg(gr.avg_speed_kmh), 2)::numeric as avg_speed_kmh,
      floor(min(gr.grouping_gap_seconds))::integer as minimum_gap_seconds,
      ceil(max(gr.grouping_gap_seconds))::integer as maximum_gap_seconds,
      round(max(gr.grouping_gap_seconds) - min(gr.grouping_gap_seconds), 2)::numeric as group_gap_span_seconds,
      (array_agg(gr.metadata order by gr.live_rank))[1] as source_metadata,
      (array_agg(gr.terrain_type order by gr.live_rank))[1] as terrain_type,
      (array_agg(gr.slope_percent order by gr.live_rank))[1] as slope_percent,
      array_agg(gr.rider_id order by gr.live_rank) as rider_ids,
      array_agg(gr.rider_name order by gr.live_rank) as rider_names,
      array_agg(gr.team_name order by gr.live_rank) as team_names
    from tmp_v4nb_grouped_riders gr
    group by gr.frame_number, gr.physical_group_index
  ),
  peloton_by_frame as (
    select distinct on (gs.frame_number)
      gs.frame_number,
      gs.physical_group_index as peloton_group_index,
      gs.rider_count as peloton_rider_count
    from group_summary gs
    order by gs.frame_number, gs.rider_count desc, gs.minimum_gap_seconds asc, gs.first_live_rank asc
  ),
  mapped as (
    select
      gs.*,
      p.peloton_group_index,
      p.peloton_rider_count,
      case
        when gs.physical_group_index = p.peloton_group_index then 'main_peloton'
        when gs.physical_group_index < p.peloton_group_index then
          case when gs.physical_group_index = 1 then 'front_group' else 'chase_group' end
        when gs.physical_group_index = p.peloton_group_index + 1 then 'dropped_group'
        else 'outside_group'
      end as base_group_code,
      case
        when gs.physical_group_index = p.peloton_group_index then 'main_peloton'
        when gs.physical_group_index = 1 and gs.physical_group_index < p.peloton_group_index then 'front_group'
        when gs.physical_group_index < p.peloton_group_index then 'chase_group_' || lpad(gs.physical_group_index::text, 2, '0')
        when gs.physical_group_index = p.peloton_group_index + 1 then 'dropped_group'
        else 'outside_group_' || lpad((gs.physical_group_index - p.peloton_group_index - 1)::text, 2, '0')
      end as group_code,
      case
        when gs.physical_group_index = p.peloton_group_index then 'Peloton'
        when gs.physical_group_index = 1 and gs.physical_group_index < p.peloton_group_index then 'Front group'
        when gs.physical_group_index < p.peloton_group_index then 'Chasing group ' || gs.physical_group_index::text
        when gs.physical_group_index = p.peloton_group_index + 1 then 'Dropped group'
        else 'Outside group ' || (gs.physical_group_index - p.peloton_group_index - 1)::text
      end as group_label
    from group_summary gs
    join peloton_by_frame p on p.frame_number = gs.frame_number
  )
  select
    mapped.*,
    case
      when mapped.physical_group_index = 1 then 0
      else max(mapped.maximum_gap_seconds) over (
        partition by mapped.frame_number
        order by mapped.physical_group_index
        rows between unbounded preceding and current row
      )
    end::integer as gap_seconds
  from mapped;

  select count(distinct frame_number), coalesce(max(groups_per_frame), 0)
  into v_distinct_frames, v_max_groups_in_frame
  from (
    select frame_number, count(*) as groups_per_frame
    from tmp_v4nb_rebuilt_groups
    group by frame_number
  ) x;

  delete from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group';

  get diagnostics v_deleted_group_rows = row_count;

  insert into public.race_stage_replay_frames (
    simulation_run_id,
    race_id,
    stage_id,
    frame_number,
    race_seconds,
    km_marker,
    group_code,
    group_label,
    group_order,
    gap_seconds,
    avg_speed_kmh,
    rider_ids,
    rider_names,
    team_names,
    entity_type,
    metadata
  )
  select
    p_simulation_run_id,
    v_race_id,
    v_stage_id,
    g.frame_number,
    g.race_seconds,
    greatest(0, least(v_distance_km, g.km_marker)) as km_marker,
    g.group_code,
    g.group_label,
    g.physical_group_index as group_order,
    g.gap_seconds,
    g.avg_speed_kmh,
    g.rider_ids,
    g.rider_names,
    g.team_names,
    'group' as entity_type,
    (
      coalesce(g.source_metadata, '{}'::jsonb)
      - 'rider_energy_v1'
      - 'stage_live_energy_smooth_v8'
      - 'stage_live_energy_smooth_v9'
      - 'stage_live_energy_smooth_v10'
      - 'stage_live_energy_smooth_v11'
      - 'stage_live_energy_smooth_v12'
      - 'average_live_energy_pct'
      - 'minimum_live_energy_pct'
      - 'maximum_live_energy_pct'
      - 'average_pre_stage_freshness_pct'
      - 'minimum_pre_stage_freshness_pct'
      - 'maximum_pre_stage_freshness_pct'
    ) || jsonb_build_object(
      'source', 'race_engine_v2_segment_replay_v4_no_backward_less_microgroups',
      'model', 'no_backward_display_km_with_practical_microgroup_control',
      'base_group_code', g.base_group_code,
      'physical_group_index', g.physical_group_index,
      'peloton_group_index', g.peloton_group_index,
      'peloton_rider_count', g.peloton_rider_count,
      'group_size', g.rider_count,
      'terrain_type', g.terrain_type,
      'slope_percent', g.slope_percent,
      'no_backward_display_km_v4', true,
      'less_microgroups_v4', true,
      'display_group_span_limit_seconds', p_display_group_span_limit_seconds,
      'major_separator_seconds', p_major_separator_seconds,
      'group_gap_span_seconds', g.group_gap_span_seconds,
      'minimum_safe_gap_seconds', g.minimum_gap_seconds,
      'maximum_safe_gap_seconds', g.maximum_gap_seconds
    ) as metadata
  from tmp_v4nb_rebuilt_groups g
  order by g.frame_number, g.physical_group_index;

  get diagnostics v_inserted_group_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_enforce_replay_v4_no_backward_less_microgroups',
    'simulation_run_id', p_simulation_run_id,
    'race_id', v_race_id,
    'stage_id', v_stage_id,
    'source_group_rows', v_source_group_rows,
    'source_rider_rows', v_source_rider_rows,
    'deleted_group_rows', v_deleted_group_rows,
    'inserted_group_rows', v_inserted_group_rows,
    'distinct_frame_numbers', v_distinct_frames,
    'max_groups_in_one_frame', v_max_groups_in_frame,
    'max_gap_closure_seconds_per_frame', p_max_gap_closure_seconds_per_frame,
    'display_group_span_limit_seconds', p_display_group_span_limit_seconds,
    'major_separator_seconds', p_major_separator_seconds
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_enforce_replay_display_continuity_v5(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid, p_min_forward_km numeric DEFAULT 0.000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_distance_km numeric;
  v_frame record;
  v_group record;
  v_required_km numeric;
  v_new_km numeric;
  v_required_elapsed numeric;
  v_new_gap integer;
  v_km_updates integer := 0;
  v_elapsed_gap_updates integer := 0;
  v_rows integer := 0;
  v_frames integer := 0;
begin
  select
    sr.race_id,
    sr.stage_id,
    greatest(coalesce(rs.distance_km, 1), 1)
  into v_race_id, v_stage_id, v_distance_km
  from public.race_stage_simulation_runs sr
  join public.race_stages rs on rs.id = sr.stage_id
  where sr.id = p_simulation_run_id
    and (p_stage_id is null or sr.stage_id = p_stage_id)
    and sr.status = 'completed';

  if v_race_id is null or v_stage_id is null then
    raise exception 'Completed simulation run % was not found for stage %.', p_simulation_run_id, p_stage_id;
  end if;

  drop table if exists pg_temp.tmp_v5_display_frames;
  drop table if exists pg_temp.tmp_v5_rider_km;
  drop table if exists pg_temp.tmp_v5_rider_elapsed;

  create temporary table tmp_v5_display_frames on commit drop as
  select
    f.id,
    f.frame_number::integer as frame_number,
    coalesce(f.race_seconds, 0)::integer as race_seconds,
    greatest(0, least(v_distance_km, coalesce(f.km_marker, 0)::numeric)) as km_marker,
    coalesce(f.group_order, 999)::integer as group_order,
    coalesce(f.group_code, '')::text as group_code,
    coalesce(f.group_label, '')::text as group_label,
    greatest(0, coalesce(f.gap_seconds, 0)::integer) as gap_seconds,
    greatest(8, coalesce(f.avg_speed_kmh, 38)::numeric) as avg_speed_kmh,
    coalesce(f.rider_ids, array[]::uuid[]) as rider_ids
  from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group';

  get diagnostics v_rows = row_count;

  create index on tmp_v5_display_frames(frame_number);
  create index on tmp_v5_display_frames(id);

  create temporary table tmp_v5_rider_km (
    rider_id uuid primary key,
    km_marker numeric not null,
    frame_number integer not null
  ) on commit drop;

  create temporary table tmp_v5_rider_elapsed (
    rider_id uuid primary key,
    elapsed_seconds numeric not null,
    frame_number integer not null
  ) on commit drop;

  -- First pass: ensure any rider carried from one visible group to another
  -- never appears farther back on the route than where he was last displayed.
  for v_frame in
    select distinct frame_number
    from tmp_v5_display_frames
    order by frame_number
  loop
    for v_group in
      select *
      from tmp_v5_display_frames
      where frame_number = v_frame.frame_number
      order by group_order, gap_seconds, group_code
    loop
      select max(rk.km_marker + p_min_forward_km)
      into v_required_km
      from unnest(v_group.rider_ids) as rid(rider_id)
      join tmp_v5_rider_km rk
        on rk.rider_id = rid.rider_id;

      v_new_km := greatest(
        v_group.km_marker,
        coalesce(v_required_km, v_group.km_marker)
      );

      v_new_km := greatest(0, least(v_distance_km, v_new_km));

      if v_new_km > v_group.km_marker + 0.0005 then
        update tmp_v5_display_frames
        set km_marker = v_new_km
        where id = v_group.id;

        v_km_updates := v_km_updates + 1;
      end if;
    end loop;

    insert into tmp_v5_rider_km (rider_id, km_marker, frame_number)
    select
      rid.rider_id,
      max(t.km_marker) as km_marker,
      v_frame.frame_number
    from tmp_v5_display_frames t
    cross join lateral unnest(t.rider_ids) as rid(rider_id)
    where t.frame_number = v_frame.frame_number
    group by rid.rider_id
    on conflict (rider_id) do update
    set
      km_marker = greatest(tmp_v5_rider_km.km_marker, excluded.km_marker),
      frame_number = excluded.frame_number;
  end loop;

  -- Rebuild physical order and an initial gap from safe road km.
  with ordered as (
    select
      t.id,
      row_number() over (
        partition by t.frame_number
        order by t.km_marker desc, t.gap_seconds asc, t.group_order asc, t.group_code asc
      )::integer as new_group_order,
      max(t.km_marker) over (partition by t.frame_number) as leader_km
    from tmp_v5_display_frames t
  ), recalculated as (
    select
      o.id,
      o.new_group_order,
      greatest(
        0,
        round(((o.leader_km - t.km_marker) / greatest(t.avg_speed_kmh, 8)) * 3600)
      )::integer as road_gap_seconds
    from ordered o
    join tmp_v5_display_frames t on t.id = o.id
  )
  update tmp_v5_display_frames t
  set
    group_order = r.new_group_order,
    gap_seconds = r.road_gap_seconds
  from recalculated r
  where r.id = t.id;

  -- Second pass: displayed elapsed time for any rider must be monotonic.
  -- If a rider's new group would show 1h23 -> 1h16, increase that group's
  -- displayed gap just enough to keep the rider's elapsed clock stable.
  for v_frame in
    select distinct frame_number
    from tmp_v5_display_frames
    order by frame_number
  loop
    for v_group in
      select *
      from tmp_v5_display_frames
      where frame_number = v_frame.frame_number
      order by group_order, gap_seconds, group_code
    loop
      select max(re.elapsed_seconds)
      into v_required_elapsed
      from unnest(v_group.rider_ids) as rid(rider_id)
      join tmp_v5_rider_elapsed re
        on re.rider_id = rid.rider_id;

      if v_required_elapsed is not null
         and (v_group.race_seconds + v_group.gap_seconds)::numeric < v_required_elapsed then
        v_new_gap := greatest(0, ceil(v_required_elapsed - v_group.race_seconds)::integer);

        update tmp_v5_display_frames
        set gap_seconds = greatest(gap_seconds, v_new_gap)
        where id = v_group.id;

        v_elapsed_gap_updates := v_elapsed_gap_updates + 1;
      end if;
    end loop;

    -- Same-frame physical order must still have non-decreasing gaps.
    with ordered as (
      select
        t.id,
        max(t.gap_seconds) over (
          partition by t.frame_number
          order by t.group_order
          rows between unbounded preceding and current row
        )::integer as ordered_gap_seconds
      from tmp_v5_display_frames t
      where t.frame_number = v_frame.frame_number
    )
    update tmp_v5_display_frames t
    set gap_seconds = ordered.ordered_gap_seconds
    from ordered
    where ordered.id = t.id;

    insert into tmp_v5_rider_elapsed (rider_id, elapsed_seconds, frame_number)
    select
      rid.rider_id,
      max((t.race_seconds + t.gap_seconds)::numeric) as elapsed_seconds,
      v_frame.frame_number
    from tmp_v5_display_frames t
    cross join lateral unnest(t.rider_ids) as rid(rider_id)
    where t.frame_number = v_frame.frame_number
    group by rid.rider_id
    on conflict (rider_id) do update
    set
      elapsed_seconds = greatest(tmp_v5_rider_elapsed.elapsed_seconds, excluded.elapsed_seconds),
      frame_number = excluded.frame_number;
  end loop;

  -- Final same-frame gap ordering after all elapsed guards.
  with ordered as (
    select
      t.id,
      max(t.gap_seconds) over (
        partition by t.frame_number
        order by t.group_order
        rows between unbounded preceding and current row
      )::integer as ordered_gap_seconds
    from tmp_v5_display_frames t
  )
  update tmp_v5_display_frames t
  set gap_seconds = ordered.ordered_gap_seconds
  from ordered
  where ordered.id = t.id;

  update public.race_stage_replay_frames f
  set
    km_marker = t.km_marker,
    group_order = t.group_order,
    gap_seconds = t.gap_seconds,
    metadata = coalesce(f.metadata, '{}'::jsonb) || jsonb_build_object(
      'display_continuity_v5', true,
      'no_backward_profile_km_v5', true,
      'elapsed_time_monotonic_v5', true,
      'display_continuity_v5_applied_at', now(),
      'display_continuity_v5_min_forward_km', p_min_forward_km
    )
  from tmp_v5_display_frames t
  where t.id = f.id;

  select count(distinct frame_number) into v_frames from tmp_v5_display_frames;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_enforce_replay_display_continuity_v5',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'group_frame_rows', v_rows,
    'distinct_frame_numbers', v_frames,
    'km_marker_updates', v_km_updates,
    'elapsed_gap_updates', v_elapsed_gap_updates
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_enforce_replay_tail_gap_continuity_v6(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid, p_max_gap_closure_seconds integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_frame record;
  v_group record;
  v_previous_max_gap numeric := null;
  v_allowed_min_max_gap numeric;
  v_required_elapsed numeric;
  v_new_gap integer;
  v_tail_gap_updates integer := 0;
  v_elapsed_gap_updates integer := 0;
  v_rows integer := 0;
  v_frames integer := 0;
begin
  select sr.race_id, sr.stage_id
  into v_race_id, v_stage_id
  from public.race_stage_simulation_runs sr
  where sr.id = p_simulation_run_id
    and (p_stage_id is null or sr.stage_id = p_stage_id)
    and sr.status = 'completed';

  if v_race_id is null or v_stage_id is null then
    raise exception 'Completed simulation run % was not found for stage %.', p_simulation_run_id, p_stage_id;
  end if;

  drop table if exists pg_temp.tmp_v6_gap_frames;
  drop table if exists pg_temp.tmp_v6_rider_elapsed;

  create temporary table tmp_v6_gap_frames on commit drop as
  select
    f.id,
    coalesce(f.frame_number, 0)::integer as frame_number,
    coalesce(f.race_seconds, 0)::integer as race_seconds,
    coalesce(f.group_order, 999)::integer as group_order,
    coalesce(f.group_code, '')::text as group_code,
    greatest(0, coalesce(f.gap_seconds, 0)::integer) as gap_seconds,
    coalesce(f.rider_ids, array[]::uuid[]) as rider_ids
  from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group';

  get diagnostics v_rows = row_count;

  create index on tmp_v6_gap_frames(frame_number);
  create index on tmp_v6_gap_frames(id);

  create temporary table tmp_v6_rider_elapsed (
    rider_id uuid primary key,
    elapsed_seconds numeric not null,
    frame_number integer not null
  ) on commit drop;

  -- First pass: the largest displayed gap in the race cannot collapse by
  -- huge amounts in one replay frame. We only increase the tail/last group gap.
  -- This avoids changing road km positions while stopping visible time teleports.
  for v_frame in
    select
      frame_number,
      max(gap_seconds)::numeric as current_max_gap_seconds,
      max(group_order)::integer as last_group_order
    from tmp_v6_gap_frames
    group by frame_number
    order by frame_number
  loop
    if v_previous_max_gap is not null then
      v_allowed_min_max_gap := greatest(
        0,
        v_previous_max_gap - greatest(0, p_max_gap_closure_seconds)
      );

      if v_frame.current_max_gap_seconds < v_allowed_min_max_gap then
        update tmp_v6_gap_frames t
        set gap_seconds = greatest(t.gap_seconds, ceil(v_allowed_min_max_gap)::integer)
        where t.frame_number = v_frame.frame_number
          and t.group_order = v_frame.last_group_order;

        v_tail_gap_updates := v_tail_gap_updates + 1;
        v_previous_max_gap := v_allowed_min_max_gap;
      else
        v_previous_max_gap := v_frame.current_max_gap_seconds;
      end if;
    else
      v_previous_max_gap := v_frame.current_max_gap_seconds;
    end if;

    -- Keep same-frame gaps non-decreasing after tail update.
    with ordered as (
      select
        t.id,
        max(t.gap_seconds) over (
          partition by t.frame_number
          order by t.group_order
          rows between unbounded preceding and current row
        )::integer as ordered_gap_seconds
      from tmp_v6_gap_frames t
      where t.frame_number = v_frame.frame_number
    )
    update tmp_v6_gap_frames t
    set gap_seconds = ordered.ordered_gap_seconds
    from ordered
    where ordered.id = t.id;
  end loop;

  -- Second pass: rider displayed elapsed time also cannot go backwards.
  -- This protects against 1h23 -> 1h16 -> 1h23 when a rider changes groups.
  for v_frame in
    select distinct frame_number
    from tmp_v6_gap_frames
    order by frame_number
  loop
    for v_group in
      select *
      from tmp_v6_gap_frames
      where frame_number = v_frame.frame_number
      order by group_order, gap_seconds, group_code
    loop
      select max(re.elapsed_seconds)
      into v_required_elapsed
      from unnest(v_group.rider_ids) as rid(rider_id)
      join tmp_v6_rider_elapsed re
        on re.rider_id = rid.rider_id;

      if v_required_elapsed is not null
         and (v_group.race_seconds + v_group.gap_seconds)::numeric < v_required_elapsed then
        v_new_gap := greatest(0, ceil(v_required_elapsed - v_group.race_seconds)::integer);

        update tmp_v6_gap_frames
        set gap_seconds = greatest(gap_seconds, v_new_gap)
        where id = v_group.id;

        v_elapsed_gap_updates := v_elapsed_gap_updates + 1;
      end if;
    end loop;

    -- Enforce same-frame non-decreasing gaps after elapsed guard.
    with ordered as (
      select
        t.id,
        max(t.gap_seconds) over (
          partition by t.frame_number
          order by t.group_order
          rows between unbounded preceding and current row
        )::integer as ordered_gap_seconds
      from tmp_v6_gap_frames t
      where t.frame_number = v_frame.frame_number
    )
    update tmp_v6_gap_frames t
    set gap_seconds = ordered.ordered_gap_seconds
    from ordered
    where ordered.id = t.id;

    insert into tmp_v6_rider_elapsed (rider_id, elapsed_seconds, frame_number)
    select
      rid.rider_id,
      max((t.race_seconds + t.gap_seconds)::numeric) as elapsed_seconds,
      v_frame.frame_number
    from tmp_v6_gap_frames t
    cross join lateral unnest(t.rider_ids) as rid(rider_id)
    where t.frame_number = v_frame.frame_number
    group by rid.rider_id
    on conflict (rider_id) do update
    set
      elapsed_seconds = greatest(tmp_v6_rider_elapsed.elapsed_seconds, excluded.elapsed_seconds),
      frame_number = excluded.frame_number;
  end loop;

  -- Final same-frame non-decreasing gaps.
  with ordered as (
    select
      t.id,
      max(t.gap_seconds) over (
        partition by t.frame_number
        order by t.group_order
        rows between unbounded preceding and current row
      )::integer as ordered_gap_seconds
    from tmp_v6_gap_frames t
  )
  update tmp_v6_gap_frames t
  set gap_seconds = ordered.ordered_gap_seconds
  from ordered
  where ordered.id = t.id;

  update public.race_stage_replay_frames f
  set
    gap_seconds = t.gap_seconds,
    metadata = coalesce(f.metadata, '{}'::jsonb) || jsonb_build_object(
      'display_tail_gap_continuity_v6', true,
      'tail_gap_continuity_v6_applied_at', now(),
      'tail_gap_continuity_v6_max_gap_closure_seconds', p_max_gap_closure_seconds,
      'elapsed_time_monotonic_v6', true
    )
  from tmp_v6_gap_frames t
  where t.id = f.id;

  select count(distinct frame_number) into v_frames from tmp_v6_gap_frames;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_enforce_replay_tail_gap_continuity_v6',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'group_frame_rows', v_rows,
    'distinct_frame_numbers', v_frames,
    'tail_gap_updates', v_tail_gap_updates,
    'elapsed_gap_updates', v_elapsed_gap_updates,
    'max_gap_closure_seconds', p_max_gap_closure_seconds
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_national_team_rider_country_lock_v1(p_club_id uuid, p_rider_id uuid, p_context text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_allowed_country_code text;
  v_rider_country_code text;
  v_club_name text;
begin
  if p_club_id is null or p_rider_id is null then
    return;
  end if;

  select
    r.allowed_country_code,
    c.name
  into
    v_allowed_country_code,
    v_club_name
  from public.club_roster_country_rules r
  join public.clubs c
    on c.id = r.club_id
  where r.club_id = p_club_id
    and r.rule_key = 'national_team_country_lock_v1'
    and r.is_active = true
    and c.deleted_at is null
  limit 1;

  -- Normal club, no national-team restriction.
  if v_allowed_country_code is null then
    return;
  end if;

  select rp.country_code
  into v_rider_country_code
  from public.rider_profiles rp
  where rp.id = p_rider_id
  limit 1;

  if not found then
    raise exception
      'National team country lock blocked %. Rider % was not found in rider_profiles.',
      coalesce(p_context, 'operation'),
      p_rider_id;
  end if;

  if v_rider_country_code is distinct from v_allowed_country_code then
    raise exception
      'National team country lock violation in %. Club "%" only allows riders from %, but rider % has country_code %.',
      coalesce(p_context, 'operation'),
      v_club_name,
      v_allowed_country_code,
      p_rider_id,
      coalesce(v_rider_country_code, '<null>');
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_national_team_country_lock_club_rider_pair_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.validate_national_team_rider_country_lock_v1(
    new.club_id,
    new.rider_id,
    tg_table_name
  );

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._restart_delete_by_uuid_if_exists_v1(p_schema text, p_table text, p_column text, p_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_table regclass;
  v_deleted integer := 0;
  v_child_deleted integer := 0;
  v_total_deleted integer := 0;
  v_fk record;
begin
  select to_regclass(format('%I.%I', p_schema, p_table)) into v_table;

  if v_table is null then
    return 0;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = p_schema
      and table_name = p_table
      and column_name = p_column
  ) then
    return 0;
  end if;

  /*
    Restart-safe dependency cleanup.

    Example fixed by this:
    public.rider_scout_reports.scout_staff_id references public.club_staff.id.
    When restart deletes old club_staff rows, dependent scout reports must be deleted first.

    This helper is used only by the restart flow, so deleting dependent rows is expected:
    Restart Team means a fresh team state with old scouting/staff history removed.
  */
  for v_fk in
    select
      child_ns.nspname as child_schema,
      child.relname as child_table,
      child_att.attname as child_column,
      parent_att.attname as parent_column,
      con.conname as constraint_name
    from pg_constraint con
    join pg_class child
      on child.oid = con.conrelid
    join pg_namespace child_ns
      on child_ns.oid = child.relnamespace
    join pg_attribute child_att
      on child_att.attrelid = con.conrelid
     and child_att.attnum = con.conkey[1]
    join pg_attribute parent_att
      on parent_att.attrelid = con.confrelid
     and parent_att.attnum = con.confkey[1]
    where con.contype = 'f'
      and con.confrelid = v_table
      and array_length(con.conkey, 1) = 1
      and array_length(con.confkey, 1) = 1
      and child_ns.nspname not in ('pg_catalog', 'information_schema')
      and not (child_ns.nspname = 'finance' and child.relname = 'entries')
  loop
    begin
      execute format(
        'delete from %I.%I child_rows
         where child_rows.%I in (
           select parent_rows.%I
           from %I.%I parent_rows
           where parent_rows.%I = $1
         )',
        v_fk.child_schema,
        v_fk.child_table,
        v_fk.child_column,
        v_fk.parent_column,
        p_schema,
        p_table,
        p_column
      )
      using p_id;

      get diagnostics v_child_deleted = row_count;
      v_total_deleted := v_total_deleted + coalesce(v_child_deleted, 0);
    exception
      when foreign_key_violation then
        raise exception
          'Restart cleanup could not delete dependent rows first. Parent %.%, child %.%, FK %, detail: %',
          p_schema,
          p_table,
          v_fk.child_schema,
          v_fk.child_table,
          v_fk.constraint_name,
          SQLERRM;
    end;
  end loop;

  execute format(
    'delete from %I.%I where %I = $1',
    p_schema,
    p_table,
    p_column
  )
  using p_id;

  get diagnostics v_deleted = row_count;
  v_total_deleted := v_total_deleted + coalesce(v_deleted, 0);

  return coalesce(v_total_deleted, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public._restart_null_uuid_column_if_exists_v1(p_schema text, p_table text, p_column text, p_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_table regclass;
  v_updated integer := 0;
begin
  select to_regclass(format('%I.%I', p_schema, p_table)) into v_table;

  if v_table is null then
    return 0;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = p_schema
      and table_name = p_table
      and column_name = p_column
  ) then
    return 0;
  end if;

  execute format(
    'update %I.%I set %I = null where %I = $1',
    p_schema,
    p_table,
    p_column,
    p_column
  )
  using p_id;

  get diagnostics v_updated = row_count;
  return coalesce(v_updated, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.restart_my_team_core_v1(p_confirm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_club record;
  v_released_riders integer := 0;
  v_deleted_total integer := 0;
  v_balance_result jsonb := '{}'::jsonb;
  v_equipment_result jsonb := '{}'::jsonb;
  v_preserved_slot jsonb;
  v_restart_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be authenticated to restart your team.';
  end if;

  if btrim(coalesce(p_confirm, '')) <> 'RESTART' then
    raise exception 'Restart confirmation is invalid. Type RESTART to confirm.';
  end if;

  select
    c.id,
    c.owner_user_id,
    c.name,
    c.country_code,
    c.logo_path,
    c.primary_color,
    c.secondary_color,
    c.motto,
    c.world_tier,
    c.club_tier,
    c.tier2_division,
    c.tier3_division,
    c.amateur_division,
    c.club_type
  into v_club
  from public.clubs c
  where c.owner_user_id = v_user_id
    and coalesce(c.club_type::text, 'main') = 'main'
  order by c.created_at asc
  limit 1
  for update;

  if v_club.id is null then
    raise exception 'No main club found for this user.';
  end if;

  v_preserved_slot := jsonb_build_object(
    'club_id', v_club.id,
    'club_name', v_club.name,
    'country_code', v_club.country_code,
    'world_tier', v_club.world_tier,
    'club_tier', v_club.club_tier,
    'tier2_division', v_club.tier2_division,
    'tier3_division', v_club.tier3_division,
    'amateur_division', v_club.amateur_division
  );

  /*
    1. Release old riders.
    Do not delete public.riders rows. Historical race/result/preparation tables may reference them.
    Removing the club link makes them free agents under the normal "no club link" model.
  */
  if to_regclass('public.club_riders') is not null then
    select count(*)
    into v_released_riders
    from public.club_riders
    where club_id = v_club.id;

    delete from public.club_riders
    where club_id = v_club.id;
  end if;

  perform public._restart_null_uuid_column_if_exists_v1('public', 'riders', 'club_id', v_club.id);
  perform public._restart_null_uuid_column_if_exists_v1('public', 'riders', 'current_club_id', v_club.id);

  /*
    2. Clear active club gameplay state.
    These calls are guarded: if a table or column does not exist, the helper returns 0.
  */
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'race_preparation_riders', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'race_preparation_staff', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'race_preparation_assets', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'race_preparation_supplies', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'race_preparations', 'club_id', v_club.id);

  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_staff', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'staff', 'club_id', v_club.id);

  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_assets', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_vehicles', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_supplies', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_race_supplies', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_supply_inventory', 'club_id', v_club.id);

  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'training_plans', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'rider_training_plans', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'scouting_reports', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'scout_assignments', 'club_id', v_club.id);

  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'transfer_offers', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'transfer_listings', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'rider_transfer_listings', 'club_id', v_club.id);

  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_sponsor_objectives', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_sponsor_contracts', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'sponsor_contracts', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'sponsorships', 'club_id', v_club.id);

  /*
    3. Force equipment restart.
    Do not delete team_kits. Jersey must stay preserved.
  */
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_equipment_default_setup', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_equipment_inventory', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_equipment_starter_seed_log', 'club_id', v_club.id);

  /*
    4. Clear liquidation / insolvency lock.
  */
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('finance', 'club_insolvency_state', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_liquidation_state', 'club_id', v_club.id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_liquidations', 'club_id', v_club.id);

  /*
    5. Reset club sporting state but preserve identity and competition slot.
    Do not change name, logo, jersey, country, tier, division, owner, or club id.
  */
  update public.clubs
  set
    season_points = 0,
    reputation = 0,
    is_active = true,
    deleted_at = null,
    is_ai = false,
    world_tier = v_club.world_tier,
    club_tier = v_club.club_tier,
    tier2_division = v_club.tier2_division,
    tier3_division = v_club.tier3_division,
    amateur_division = v_club.amateur_division
  where id = v_club.id;

  /*
    6. Rebuild the starter team state.
    This uses your existing new-team balance system:
    - new 10-rider domestic squad
    - role mix
    - minimum policies
    - HQ 1 only
    - no staff/assets/race supplies
    - market-value rebalance
    - starter cash top-up if below tier starter amount
  */
  select to_jsonb(public.apply_new_club_creation_balance_v1(v_club.id, true))
  into v_balance_result;

  /*
    7. Re-seed starter equipment.
    This gives the restarted team the same 60 starter equipment items as a new team.
  */
  select to_jsonb(public.equipment_seed_starter_inventory_for_club_safe(v_club.id))
  into v_equipment_result;

  /*
    8. Ensure points are still zero after helper calls.
  */
  update public.clubs
  set
    season_points = 0,
    is_active = true,
    deleted_at = null
  where id = v_club.id;

  insert into public.club_restart_history (
    user_id,
    club_id,
    club_name,
    preserved_slot,
    released_rider_count,
    reset_summary
  )
  values (
    v_user_id,
    v_club.id,
    v_club.name,
    v_preserved_slot,
    coalesce(v_released_riders, 0),
    jsonb_build_object(
      'deleted_reset_rows', coalesce(v_deleted_total, 0),
      'balance_result', coalesce(v_balance_result, '{}'::jsonb),
      'equipment_result', coalesce(v_equipment_result, '{}'::jsonb),
      'note', 'Club identity, jersey, logo, country, tier and division slot preserved. Season points reset to zero. Old riders released from club links.'
    )
  )
  returning id into v_restart_id;

  return jsonb_build_object(
    'status', 'restarted',
    'restart_id', v_restart_id,
    'club_id', v_club.id,
    'club_name', v_club.name,
    'released_rider_count', coalesce(v_released_riders, 0),
    'preserved_slot', v_preserved_slot,
    'balance_result', coalesce(v_balance_result, '{}'::jsonb),
    'equipment_result', coalesce(v_equipment_result, '{}'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_national_team_country_lock_team_rider_pair_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.validate_national_team_rider_country_lock_v1(
    new.team_id,
    new.rider_id,
    tg_table_name
  );

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.restart_force_starter_role_mix_v1(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_rider_count integer := 0;
  v_role_type text;
  v_result jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be authenticated to fix restart starter role mix.';
  end if;

  if not exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
      and c.owner_user_id = v_user_id
      and coalesce(c.club_type::text, 'main') = 'main'
  ) then
    raise exception 'You can only fix role mix for your own main club.';
  end if;

  select count(*)
  into v_rider_count
  from public.club_riders cr
  where cr.club_id = p_club_id;

  if v_rider_count <> 10 then
    raise exception 'Restart role mix requires exactly 10 linked riders, found %.', v_rider_count;
  end if;

  select format_type(a.atttypid, a.atttypmod)
  into v_role_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'riders'
    and a.attname = 'role'
    and a.attnum > 0
    and not a.attisdropped;

  if v_role_type is null then
    raise exception 'Could not resolve public.riders.role type.';
  end if;

  execute format(
    $sql$
    with ranked as (
      select
        r.id as rider_id,
        row_number() over (
          order by
            case r.role::text
              when 'Leader' then 1
              when 'Sprinter' then 2
              when 'Climber' then 3
              when 'All-rounder' then 4
              when 'Domestique' then 5
              when 'Breakaway' then 6
              when 'TT' then 7
              else 99
            end,
            r.created_at desc nulls last,
            r.id
        ) as rn
      from public.club_riders cr
      join public.riders r on r.id = cr.rider_id
      where cr.club_id = $1
    ),
    mapped as (
      select
        rider_id,
        case rn
          when 1 then 'Leader'::%s
          when 2 then 'Sprinter'::%s
          when 3 then 'Climber'::%s
          when 4 then 'All-rounder'::%s
          when 5 then 'All-rounder'::%s
          when 6 then 'Domestique'::%s
          when 7 then 'Domestique'::%s
          when 8 then 'Domestique'::%s
          when 9 then 'Breakaway'::%s
          when 10 then 'All-rounder'::%s
        end as new_role
      from ranked
    )
    update public.riders r
    set role = m.new_role
    from mapped m
    where r.id = m.rider_id
    $sql$,
    v_role_type,
    v_role_type,
    v_role_type,
    v_role_type,
    v_role_type,
    v_role_type,
    v_role_type,
    v_role_type,
    v_role_type,
    v_role_type
  )
  using p_club_id;

  select jsonb_object_agg(role, riders order by role)
  into v_result
  from (
    select
      r.role::text as role,
      count(*) as riders
    from public.club_riders cr
    join public.riders r on r.id = cr.rider_id
    where cr.club_id = p_club_id
    group by r.role::text
  ) x;

  return jsonb_build_object(
    'status', 'fixed',
    'club_id', p_club_id,
    'rider_count', v_rider_count,
    'role_mix', coalesce(v_result, '{}'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.restart_my_team_v1(p_confirm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_club_id uuid;
  v_old_rider_ids uuid[] := array[]::uuid[];
  v_result jsonb;
  v_restart_id uuid;
  v_precleanup_result jsonb := '{}'::jsonb;
  v_released_riders_result jsonb := '{}'::jsonb;
  v_role_fix_result jsonb := '{}'::jsonb;
  v_visible_cleanup_result jsonb := '{}'::jsonb;
  v_finance_sponsor_cleanup_result jsonb := '{}'::jsonb;
  v_active_commitments_cleanup_result jsonb := '{}'::jsonb;
  v_remaining_active_commitments_cleanup_result jsonb := '{}'::jsonb;
  v_final_visible_sources_cleanup_result jsonb := '{}'::jsonb;
  v_finance_overview_summary_cleanup_result jsonb := '{}'::jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be authenticated to restart your team.';
  end if;

  if btrim(coalesce(p_confirm, '')) <> 'RESTART' then
    raise exception 'Restart confirmation is invalid. Type RESTART to confirm.';
  end if;

  select c.id
  into v_club_id
  from public.clubs c
  where c.owner_user_id = v_user_id
    and coalesce(c.club_type::text, 'main') = 'main'
  order by c.created_at asc
  limit 1;

  if v_club_id is null then
    raise exception 'No main club found for this user.';
  end if;

  select coalesce(array_agg(cr.rider_id), array[]::uuid[])
  into v_old_rider_ids
  from public.club_riders cr
  where cr.club_id = v_club_id;

  v_precleanup_result := public.restart_precleanup_blocking_refs_v1(v_user_id, v_club_id);

  v_result := public.restart_my_team_core_v1(p_confirm);

  v_club_id := nullif(v_result ->> 'club_id', '')::uuid;
  v_restart_id := nullif(v_result ->> 'restart_id', '')::uuid;

  if v_club_id is null then
    raise exception 'Restart completed but did not return a club id.';
  end if;

  v_released_riders_result := public.restart_ensure_released_riders_free_agents_v1(
    v_user_id,
    v_club_id,
    v_restart_id,
    v_old_rider_ids
  );

  v_role_fix_result := public.restart_force_starter_role_mix_v1(v_club_id);
  v_visible_cleanup_result := public.restart_cleanup_visible_history_v1(v_user_id, v_club_id);
  v_finance_sponsor_cleanup_result := public.restart_cleanup_finance_sponsor_visible_state_v1(v_user_id, v_club_id);
  v_active_commitments_cleanup_result := public.restart_cleanup_active_commitments_v1(v_user_id, v_club_id);
  v_remaining_active_commitments_cleanup_result := public.restart_cleanup_remaining_active_commitments_v1(v_user_id, v_club_id);
  v_final_visible_sources_cleanup_result := public.restart_cleanup_final_visible_sources_v1(v_user_id, v_club_id);
  v_finance_overview_summary_cleanup_result := public.restart_cleanup_finance_overview_summary_v1(v_user_id, v_club_id);

  update public.clubs
  set
    season_points = 0,
    is_active = true,
    deleted_at = null
  where id = v_club_id;

  if v_restart_id is not null then
    update public.club_restart_history h
    set reset_summary =
      coalesce(h.reset_summary, '{}'::jsonb) ||
      jsonb_build_object(
        'precleanup_result', v_precleanup_result,
        'released_riders_result', v_released_riders_result,
        'role_fix_result', v_role_fix_result,
        'visible_cleanup_result', v_visible_cleanup_result,
        'finance_sponsor_cleanup_result', v_finance_sponsor_cleanup_result,
        'active_commitments_cleanup_result', v_active_commitments_cleanup_result,
        'remaining_active_commitments_cleanup_result', v_remaining_active_commitments_cleanup_result,
        'final_visible_sources_cleanup_result', v_final_visible_sources_cleanup_result,
        'finance_overview_summary_cleanup_result', v_finance_overview_summary_cleanup_result
      )
    where h.id = v_restart_id;
  end if;

  return v_result || jsonb_build_object(
    'precleanup_result', v_precleanup_result,
    'released_riders_result', v_released_riders_result,
    'role_fix_result', v_role_fix_result,
    'visible_cleanup_result', v_visible_cleanup_result,
    'finance_sponsor_cleanup_result', v_finance_sponsor_cleanup_result,
    'active_commitments_cleanup_result', v_active_commitments_cleanup_result,
    'remaining_active_commitments_cleanup_result', v_remaining_active_commitments_cleanup_result,
    'final_visible_sources_cleanup_result', v_final_visible_sources_cleanup_result,
    'finance_overview_summary_cleanup_result', v_finance_overview_summary_cleanup_result
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_riders_national_team_country_lock_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_violation record;
begin
  if old.country_code is not distinct from new.country_code then
    return new;
  end if;

  with rider_team_links as (
    select
      cr.club_id,
      'club_riders'::text as source_table
    from public.club_riders cr
    where cr.rider_id = new.id

    union all

    select
      rc.club_id,
      'rider_contracts'::text as source_table
    from public.rider_contracts rc
    where rc.rider_id = new.id

    union all

    select
      rcn.club_id,
      'rider_contract_negotiations'::text as source_table
    from public.rider_contract_negotiations rcn
    where rcn.rider_id = new.id

    union all

    select
      rfan.club_id,
      'rider_free_agent_negotiations'::text as source_table
    from public.rider_free_agent_negotiations rfan
    where rfan.rider_id = new.id

    union all

    select
      rpr.team_id as club_id,
      'race_participant_riders'::text as source_table
    from public.race_participant_riders rpr
    where rpr.rider_id = new.id
  )
  select
    l.source_table,
    c.name as club_name,
    r.allowed_country_code
  into v_violation
  from rider_team_links l
  join public.club_roster_country_rules r
    on r.club_id = l.club_id
   and r.rule_key = 'national_team_country_lock_v1'
   and r.is_active = true
  join public.clubs c
    on c.id = r.club_id
  where new.country_code is distinct from r.allowed_country_code
  limit 1;

  if found then
    raise exception
      'National team country lock violation. Cannot change rider % country_code from % to %. Rider is attached to "%" through %, which only allows riders from %.',
      new.id,
      coalesce(old.country_code, '<null>'),
      coalesce(new.country_code, '<null>'),
      v_violation.club_name,
      v_violation.source_table,
      v_violation.allowed_country_code;
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.restart_cleanup_visible_history_v1(p_user_id uuid, p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_deleted_total integer := 0;
  v_notifications_deleted integer := 0;
  v_orphan_notifications_deleted integer := 0;
begin
  if p_user_id is null then
    raise exception 'User id is required for restart cleanup.';
  end if;

  if p_club_id is null then
    raise exception 'Club id is required for restart cleanup.';
  end if;

  /*
    Notifications:
    Remove old user notification assignments so the restarted team starts with no old inbox.
  */
  if to_regclass('public.user_notifications') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'user_notifications'
         and column_name = 'user_id'
     ) then
    execute 'delete from public.user_notifications where user_id = $1'
    using p_user_id;

    get diagnostics v_notifications_deleted = row_count;
    v_deleted_total := v_deleted_total + coalesce(v_notifications_deleted, 0);
  end if;

  /*
    Delete orphan notification master rows only if notification_id relationship exists.
    This avoids deleting shared/global notifications that still belong to other users.
  */
  if to_regclass('public.notifications') is not null
     and to_regclass('public.user_notifications') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'user_notifications'
         and column_name = 'notification_id'
     )
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'notifications'
         and column_name = 'id'
     ) then
    execute '
      delete from public.notifications n
      where not exists (
        select 1
        from public.user_notifications un
        where un.notification_id = n.id
      )
    ';

    get diagnostics v_orphan_notifications_deleted = row_count;
    v_deleted_total := v_deleted_total + coalesce(v_orphan_notifications_deleted, 0);
  end if;

  /*
    Race application / accepted race / preparation state.
    These are guarded. If a table does not exist, it is skipped.
  */
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'race_preparation_riders', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'race_preparation_staff', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'race_preparation_assets', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'race_preparation_supplies', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'race_preparations', 'club_id', p_club_id);

  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'race_applications', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'race_entries', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'race_participants', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'race_participant_clubs', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_race_calendar', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'accepted_races', 'club_id', p_club_id);

  /*
    Sponsors / sponsor history / objectives.
  */
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_sponsor_objectives', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_sponsor_contracts', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'sponsor_contracts', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'sponsorships', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_sponsor_history', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'sponsor_payments', 'club_id', p_club_id);

  /*
    Tax / policy / visible history.
  */
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_tax_history', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_tax_records', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_tax_liabilities', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_policy_history', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'team_policy_history', 'club_id', p_club_id);

  /*
    Mutable finance display/history tables.
    Do not touch finance.entries here.
  */
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_finance_transactions', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_finance_transaction_history', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_finance_events', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'finance_events', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_income_history', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'club_expense_history', 'club_id', p_club_id);

  /*
    Training / scouting / transfers.
  */
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'training_plans', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'rider_training_plans', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'scouting_reports', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'scout_assignments', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'transfer_offers', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'transfer_listings', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'rider_transfer_listings', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'rider_contract_negotiations', 'club_id', p_club_id);
  v_deleted_total := v_deleted_total + public._restart_delete_by_uuid_if_exists_v1('public', 'rider_free_agent_negotiations', 'club_id', p_club_id);

  return jsonb_build_object(
    'status', 'completed',
    'club_id', p_club_id,
    'user_id', p_user_id,
    'notifications_deleted', coalesce(v_notifications_deleted, 0),
    'orphan_notifications_deleted', coalesce(v_orphan_notifications_deleted, 0),
    'deleted_total', coalesce(v_deleted_total, 0),
    'note', 'Restart cleanup removed mutable visible history. Immutable finance ledger rows are not deleted.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.restart_precleanup_blocking_refs_v1(p_user_id uuid, p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_deleted_scout_reports integer := 0;
  v_deleted_scout_assignments integer := 0;
  v_staff_related_total integer := 0;
begin
  if p_user_id is null then
    raise exception 'User id is required for restart precleanup.';
  end if;

  if p_club_id is null then
    raise exception 'Club id is required for restart precleanup.';
  end if;

  if not exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
      and c.owner_user_id = p_user_id
      and coalesce(c.club_type::text, 'main') = 'main'
  ) then
    raise exception 'You can only restart-clean your own main club.';
  end if;

  /*
    Important blocker found:
    public.rider_scout_reports.scout_staff_id references public.club_staff.id.

    Restart Team must remove old scouting history before deleting old staff.
  */
  if to_regclass('public.rider_scout_reports') is not null
     and to_regclass('public.club_staff') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'rider_scout_reports'
         and column_name = 'scout_staff_id'
     ) then
    delete from public.rider_scout_reports rsr
    where rsr.scout_staff_id in (
      select cs.id
      from public.club_staff cs
      where cs.club_id = p_club_id
    );

    get diagnostics v_deleted_scout_reports = row_count;
  end if;

  if to_regclass('public.scout_assignments') is not null
     and to_regclass('public.club_staff') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'scout_assignments'
         and column_name = 'scout_staff_id'
     ) then
    delete from public.scout_assignments sa
    where sa.scout_staff_id in (
      select cs.id
      from public.club_staff cs
      where cs.club_id = p_club_id
    );

    get diagnostics v_deleted_scout_assignments = row_count;
  end if;

  /*
    Extra guarded cleanup by club_id, if these tables also store club_id directly.
  */
  v_staff_related_total := v_staff_related_total + public._restart_delete_by_uuid_if_exists_v1(
    'public',
    'rider_scout_reports',
    'club_id',
    p_club_id
  );

  v_staff_related_total := v_staff_related_total + public._restart_delete_by_uuid_if_exists_v1(
    'public',
    'scout_assignments',
    'club_id',
    p_club_id
  );

  v_staff_related_total := v_staff_related_total + public._restart_delete_by_uuid_if_exists_v1(
    'public',
    'scouting_reports',
    'club_id',
    p_club_id
  );

  return jsonb_build_object(
    'status', 'completed',
    'club_id', p_club_id,
    'deleted_scout_reports_by_staff', coalesce(v_deleted_scout_reports, 0),
    'deleted_scout_assignments_by_staff', coalesce(v_deleted_scout_assignments, 0),
    'deleted_staff_related_total', coalesce(v_staff_related_total, 0)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public._restart_delete_table_by_account_ref_if_exists_v1(p_entry_schema text, p_entry_table text, p_entry_account_column text, p_account_schema text, p_account_table text, p_account_id_column text, p_account_club_column text, p_club_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_deleted integer := 0;
begin
  /*
    Never delete immutable finance ledger tables.
  */
  if p_entry_schema = 'finance'
     and p_entry_table in ('entries', 'transactions', 'ledger_entries') then
    return 0;
  end if;

  if to_regclass(format('%I.%I', p_entry_schema, p_entry_table)) is null then
    return 0;
  end if;

  if to_regclass(format('%I.%I', p_account_schema, p_account_table)) is null then
    return 0;
  end if;

  if not public._restart_column_exists_v1(p_entry_schema, p_entry_table, p_entry_account_column) then
    return 0;
  end if;

  if not public._restart_column_exists_v1(p_account_schema, p_account_table, p_account_id_column) then
    return 0;
  end if;

  if not public._restart_column_exists_v1(p_account_schema, p_account_table, p_account_club_column) then
    return 0;
  end if;

  begin
    execute format(
      'delete from %I.%I e
       using %I.%I a
       where e.%I = a.%I
         and a.%I = $1',
      p_entry_schema,
      p_entry_table,
      p_account_schema,
      p_account_table,
      p_entry_account_column,
      p_account_id_column,
      p_account_club_column
    )
    using p_club_id;

    get diagnostics v_deleted = row_count;
    return coalesce(v_deleted, 0);
  exception
    when others then
      return 0;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.restart_cleanup_finance_sponsor_visible_state_v1(p_user_id uuid, p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_expected_cash numeric := 0;
  v_deleted_sponsor_rows integer := 0;
  v_deleted_finance_display_rows integer := 0;
  v_deleted_tax_policy_rows integer := 0;
  v_result jsonb;
  v_tmp jsonb;
begin
  if p_user_id is null then
    raise exception 'User id is required for restart finance/sponsor cleanup.';
  end if;

  if p_club_id is null then
    raise exception 'Club id is required for restart finance/sponsor cleanup.';
  end if;

  if not exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
      and c.owner_user_id = p_user_id
      and coalesce(c.club_type::text, 'main') = 'main'
  ) then
    raise exception 'You can only restart-clean your own main club.';
  end if;

  select
    case lower(coalesce(c.club_tier::text, ''))
      when 'worldteam' then 1750000
      when 'world_team' then 1750000
      when 'world tour' then 1750000
      when 'proteam' then 1000000
      when 'pro_team' then 1000000
      when 'continental' then 600000
      when 'amateur' then 300000
      else coalesce(c.cash_balance, 0)
    end
  into v_expected_cash
  from public.clubs c
  where c.id = p_club_id;

  /*
    Sponsor visible state cleanup.
  */
  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'club_sponsor_objectives', 'club_id', p_club_id);
  v_deleted_sponsor_rows := v_deleted_sponsor_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'club_sponsor_contracts', 'club_id', p_club_id);
  v_deleted_sponsor_rows := v_deleted_sponsor_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'club_sponsor_history', 'club_id', p_club_id);
  v_deleted_sponsor_rows := v_deleted_sponsor_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'club_sponsor_payments', 'club_id', p_club_id);
  v_deleted_sponsor_rows := v_deleted_sponsor_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'club_sponsor_offers', 'club_id', p_club_id);
  v_deleted_sponsor_rows := v_deleted_sponsor_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'club_sponsor_offer_choices', 'club_id', p_club_id);
  v_deleted_sponsor_rows := v_deleted_sponsor_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'club_sponsor_slots', 'club_id', p_club_id);
  v_deleted_sponsor_rows := v_deleted_sponsor_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'club_sponsor_deals', 'club_id', p_club_id);
  v_deleted_sponsor_rows := v_deleted_sponsor_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'club_sponsors', 'club_id', p_club_id);
  v_deleted_sponsor_rows := v_deleted_sponsor_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'sponsor_contracts', 'club_id', p_club_id);
  v_deleted_sponsor_rows := v_deleted_sponsor_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'sponsorships', 'club_id', p_club_id);
  v_deleted_sponsor_rows := v_deleted_sponsor_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'sponsor_payments', 'club_id', p_club_id);
  v_deleted_sponsor_rows := v_deleted_sponsor_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'sponsor_offers', 'club_id', p_club_id);
  v_deleted_sponsor_rows := v_deleted_sponsor_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'sponsor_objectives', 'club_id', p_club_id);
  v_deleted_sponsor_rows := v_deleted_sponsor_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'sponsor_bonus_objectives', 'club_id', p_club_id);
  v_deleted_sponsor_rows := v_deleted_sponsor_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'sponsor_selection_state', 'club_id', p_club_id);
  v_deleted_sponsor_rows := v_deleted_sponsor_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'sponsor_selection_offers', 'club_id', p_club_id);
  v_deleted_sponsor_rows := v_deleted_sponsor_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  /*
    Mutable finance display tables only.
    Do not delete finance.entries.
  */
  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'club_finance_transactions', 'club_id', p_club_id);
  v_deleted_finance_display_rows := v_deleted_finance_display_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'club_finance_transaction_history', 'club_id', p_club_id);
  v_deleted_finance_display_rows := v_deleted_finance_display_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'club_finance_events', 'club_id', p_club_id);
  v_deleted_finance_display_rows := v_deleted_finance_display_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'finance_events', 'club_id', p_club_id);
  v_deleted_finance_display_rows := v_deleted_finance_display_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'finance_transactions', 'club_id', p_club_id);
  v_deleted_finance_display_rows := v_deleted_finance_display_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'finance_entries', 'club_id', p_club_id);
  v_deleted_finance_display_rows := v_deleted_finance_display_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'club_transactions', 'club_id', p_club_id);
  v_deleted_finance_display_rows := v_deleted_finance_display_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'transactions', 'club_id', p_club_id);
  v_deleted_finance_display_rows := v_deleted_finance_display_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'club_income_history', 'club_id', p_club_id);
  v_deleted_finance_display_rows := v_deleted_finance_display_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'club_expense_history', 'club_id', p_club_id);
  v_deleted_finance_display_rows := v_deleted_finance_display_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  /*
    Tax and policy visible history.
  */
  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'club_tax_history', 'club_id', p_club_id);
  v_deleted_tax_policy_rows := v_deleted_tax_policy_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'club_tax_records', 'club_id', p_club_id);
  v_deleted_tax_policy_rows := v_deleted_tax_policy_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'club_tax_liabilities', 'club_id', p_club_id);
  v_deleted_tax_policy_rows := v_deleted_tax_policy_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'club_policy_history', 'club_id', p_club_id);
  v_deleted_tax_policy_rows := v_deleted_tax_policy_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  v_tmp := public._restart_try_delete_by_uuid_if_exists_v1('public', 'team_policy_history', 'club_id', p_club_id);
  v_deleted_tax_policy_rows := v_deleted_tax_policy_rows + coalesce((v_tmp ->> 'deleted')::integer, 0);

  /*
    Keep restarted club at starter cash.
  */
  update public.clubs c
  set
    cash_balance = v_expected_cash,
    season_points = 0,
    is_active = true,
    deleted_at = null
  where c.id = p_club_id;

  v_result := jsonb_build_object(
    'status', 'completed',
    'club_id', p_club_id,
    'expected_cash_balance', v_expected_cash,
    'deleted_sponsor_rows', coalesce(v_deleted_sponsor_rows, 0),
    'deleted_finance_display_rows', coalesce(v_deleted_finance_display_rows, 0),
    'deleted_tax_policy_rows', coalesce(v_deleted_tax_policy_rows, 0),
    'immutable_finance_ledger_deleted', false,
    'note', 'Sponsor/mutable finance display rows cleaned. Immutable finance ledger rows must be hidden in finance queries by filtering after the latest restart.'
  );

  update public.club_restart_history h
  set reset_summary =
    coalesce(h.reset_summary, '{}'::jsonb) ||
    jsonb_build_object('finance_sponsor_cleanup_result', v_result)
  where h.id = (
    select h2.id
    from public.club_restart_history h2
    where h2.club_id = p_club_id
    order by h2.created_at desc
    limit 1
  );

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._restart_try_delete_by_uuid_if_exists_v1(p_schema text, p_table text, p_column text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_deleted integer := 0;
begin
  /*
    Never delete immutable finance ledger tables.
    Finance ledger rows are hidden through finance statement filters after restart.
  */
  if p_schema = 'finance'
     and p_table in ('entries', 'transactions', 'ledger_entries') then
    return jsonb_build_object(
      'table', format('%I.%I', p_schema, p_table),
      'column', p_column,
      'deleted', 0,
      'skipped', true,
      'reason', 'immutable finance ledger table'
    );
  end if;

  begin
    v_deleted := public._restart_delete_by_uuid_if_exists_v1(
      p_schema,
      p_table,
      p_column,
      p_id
    );

    return jsonb_build_object(
      'table', format('%I.%I', p_schema, p_table),
      'column', p_column,
      'deleted', coalesce(v_deleted, 0),
      'skipped', false
    );
  exception
    when others then
      return jsonb_build_object(
        'table', format('%I.%I', p_schema, p_table),
        'column', p_column,
        'deleted', 0,
        'skipped', true,
        'reason', SQLERRM
      );
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.restart_cleanup_active_commitments_v1(p_user_id uuid, p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  v_tmp jsonb;
  v_deleted integer := 0;
  v_deleted_total integer := 0;
  v_area_counts jsonb := '{}'::jsonb;
  v_details jsonb := '[]'::jsonb;
begin
  if p_user_id is null then
    raise exception 'User id is required for restart active commitment cleanup.';
  end if;

  if p_club_id is null then
    raise exception 'Club id is required for restart active commitment cleanup.';
  end if;

  if not exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
      and c.owner_user_id = p_user_id
      and coalesce(c.club_type::text, 'main') = 'main'
  ) then
    raise exception 'You can only restart-clean your own main club.';
  end if;

  /*
    This cleanup removes old active commitments that cannot survive a restart:
    - race applications / accepted race entries
    - race preparation state
    - training camps
    - infrastructure construction jobs
    - pending asset / vehicle deliveries
    - transfer offers, negotiations, activity, and history

    Every table/column is guarded. Missing tables are skipped.
  */
  for r in
    select *
    from (
      values
        /*
          Race applications / accepted races / calendar commitments.
        */
        ('public','race_applications','club_id','races'),
        ('public','race_applications','applicant_club_id','races'),
        ('public','club_race_applications','club_id','races'),
        ('public','race_application_requests','club_id','races'),
        ('public','race_team_applications','club_id','races'),
        ('public','race_invitations','club_id','races'),
        ('public','club_race_invitations','club_id','races'),
        ('public','race_entries','club_id','races'),
        ('public','club_race_entries','club_id','races'),
        ('public','race_participant_clubs','club_id','races'),
        ('public','race_participants','club_id','races'),
        ('public','race_commitments','club_id','races'),
        ('public','club_race_commitments','club_id','races'),
        ('public','accepted_races','club_id','races'),
        ('public','club_accepted_races','club_id','races'),
        ('public','club_race_calendar','club_id','races'),

        /*
          Race preparation and stage-plan state.
        */
        ('public','race_preparation_riders','club_id','race_preparation'),
        ('public','race_preparation_staff','club_id','race_preparation'),
        ('public','race_preparation_assets','club_id','race_preparation'),
        ('public','race_preparation_supplies','club_id','race_preparation'),
        ('public','race_preparations','club_id','race_preparation'),
        ('public','race_stage_plans','club_id','race_preparation'),
        ('public','race_stage_plan_riders','club_id','race_preparation'),
        ('public','race_stage_plan_commands','club_id','race_preparation'),
        ('public','club_stage_plans','club_id','race_preparation'),

        /*
          Training camps and training bookings.
        */
        ('public','training_camp_riders','club_id','training'),
        ('public','training_camp_staff','club_id','training'),
        ('public','training_camp_participants','club_id','training'),
        ('public','training_camp_bookings','club_id','training'),
        ('public','club_training_camp_bookings','club_id','training'),
        ('public','club_training_camps','club_id','training'),
        ('public','training_camps','club_id','training'),
        ('public','training_camp_sessions','club_id','training'),
        ('public','training_camp_assignments','club_id','training'),
        ('public','rider_training_camp_assignments','club_id','training'),
        ('public','training_plans','club_id','training'),
        ('public','rider_training_plans','club_id','training'),

        /*
          Infrastructure jobs / facility construction / queued upgrades.
          Do not delete base facility catalog rows.
        */
        ('public','club_infrastructure_jobs','club_id','infrastructure'),
        ('public','infrastructure_jobs','club_id','infrastructure'),
        ('public','club_infrastructure_projects','club_id','infrastructure'),
        ('public','infrastructure_projects','club_id','infrastructure'),
        ('public','club_facility_jobs','club_id','infrastructure'),
        ('public','facility_jobs','club_id','infrastructure'),
        ('public','club_facility_upgrades','club_id','infrastructure'),
        ('public','facility_upgrade_jobs','club_id','infrastructure'),
        ('public','club_construction_jobs','club_id','infrastructure'),
        ('public','construction_jobs','club_id','infrastructure'),
        ('public','club_building_jobs','club_id','infrastructure'),
        ('public','building_jobs','club_id','infrastructure'),

        /*
          Assets / vehicle deliveries and owned assets.
          Restarted teams should not keep old purchased/in-progress assets.
          Starter equipment inventory is NOT touched here.
        */
        ('public','club_asset_delivery_items','club_id','assets'),
        ('public','asset_delivery_items','club_id','assets'),
        ('public','club_asset_deliveries','club_id','assets'),
        ('public','asset_deliveries','club_id','assets'),
        ('public','club_asset_orders','club_id','assets'),
        ('public','asset_orders','club_id','assets'),
        ('public','club_assets','club_id','assets'),
        ('public','club_vehicle_delivery_items','club_id','assets'),
        ('public','vehicle_delivery_items','club_id','assets'),
        ('public','club_vehicle_deliveries','club_id','assets'),
        ('public','vehicle_deliveries','club_id','assets'),
        ('public','club_vehicle_orders','club_id','assets'),
        ('public','vehicle_orders','club_id','assets'),
        ('public','club_vehicles','club_id','assets'),

        /*
          Transfers / offers / negotiations / activity.
          We delete rows where this club is buyer, seller, source, or target.
        */
        ('public','transfer_offers','club_id','transfers'),
        ('public','transfer_offers','buyer_club_id','transfers'),
        ('public','transfer_offers','seller_club_id','transfers'),
        ('public','transfer_offers','from_club_id','transfers'),
        ('public','transfer_offers','to_club_id','transfers'),

        ('public','rider_transfer_offers','club_id','transfers'),
        ('public','rider_transfer_offers','buyer_club_id','transfers'),
        ('public','rider_transfer_offers','seller_club_id','transfers'),
        ('public','rider_transfer_offers','from_club_id','transfers'),
        ('public','rider_transfer_offers','to_club_id','transfers'),

        ('public','club_transfer_offers','club_id','transfers'),
        ('public','club_transfer_offers','buyer_club_id','transfers'),
        ('public','club_transfer_offers','seller_club_id','transfers'),

        ('public','transfer_activity','club_id','transfers'),
        ('public','transfer_activity','buyer_club_id','transfers'),
        ('public','transfer_activity','seller_club_id','transfers'),
        ('public','transfer_activity','from_club_id','transfers'),
        ('public','transfer_activity','to_club_id','transfers'),

        ('public','transfer_history','club_id','transfers'),
        ('public','transfer_history','buyer_club_id','transfers'),
        ('public','transfer_history','seller_club_id','transfers'),
        ('public','transfer_history','from_club_id','transfers'),
        ('public','transfer_history','to_club_id','transfers'),

        ('public','club_transfer_history','club_id','transfers'),
        ('public','club_transfer_history','buyer_club_id','transfers'),
        ('public','club_transfer_history','seller_club_id','transfers'),

        ('public','rider_contract_negotiations','club_id','transfers'),
        ('public','rider_contract_negotiations','buyer_club_id','transfers'),
        ('public','rider_contract_negotiations','seller_club_id','transfers'),
        ('public','rider_contract_negotiations','from_club_id','transfers'),
        ('public','rider_contract_negotiations','to_club_id','transfers'),

        ('public','transfer_negotiations','club_id','transfers'),
        ('public','transfer_negotiations','buyer_club_id','transfers'),
        ('public','transfer_negotiations','seller_club_id','transfers'),

        ('public','rider_transfer_negotiations','club_id','transfers'),
        ('public','rider_transfer_negotiations','buyer_club_id','transfers'),
        ('public','rider_transfer_negotiations','seller_club_id','transfers'),

        ('public','rider_transfer_listings','club_id','transfers'),
        ('public','transfer_listings','club_id','transfers'),
        ('public','club_transfer_listings','club_id','transfers'),

        ('public','free_agent_negotiations','club_id','transfers'),
        ('public','rider_free_agent_negotiations','club_id','transfers')
    ) as x(schema_name, table_name, column_name, area)
  loop
    v_tmp := public._restart_try_delete_by_uuid_if_exists_v1(
      r.schema_name,
      r.table_name,
      r.column_name,
      p_club_id
    );

    v_deleted := coalesce((v_tmp ->> 'deleted')::integer, 0);
    v_deleted_total := v_deleted_total + v_deleted;

    if v_deleted > 0 then
      v_area_counts := jsonb_set(
        v_area_counts,
        array[r.area],
        to_jsonb(coalesce((v_area_counts ->> r.area)::integer, 0) + v_deleted),
        true
      );

      v_details := v_details || jsonb_build_array(v_tmp);
    end if;
  end loop;

  update public.club_restart_history h
  set reset_summary =
    coalesce(h.reset_summary, '{}'::jsonb) ||
    jsonb_build_object(
      'active_commitments_cleanup_result',
      jsonb_build_object(
        'status', 'completed',
        'club_id', p_club_id,
        'deleted_total', v_deleted_total,
        'area_counts', v_area_counts
      )
    )
  where h.id = (
    select h2.id
    from public.club_restart_history h2
    where h2.club_id = p_club_id
    order by h2.created_at desc
    limit 1
  );

  return jsonb_build_object(
    'status', 'completed',
    'club_id', p_club_id,
    'deleted_total', v_deleted_total,
    'area_counts', v_area_counts,
    'details', v_details,
    'note', 'Restart cleanup removed old race applications, race preparation, training camps, infrastructure jobs, pending assets, and transfer activity.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.restart_cleanup_remaining_active_commitments_v1(p_user_id uuid, p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  v_tmp jsonb;
  v_deleted integer := 0;
  v_deleted_total integer := 0;
  v_area_counts jsonb := '{}'::jsonb;
  v_details jsonb := '[]'::jsonb;
begin
  if p_user_id is null then
    raise exception 'User id is required for restart remaining cleanup.';
  end if;

  if p_club_id is null then
    raise exception 'Club id is required for restart remaining cleanup.';
  end if;

  if not exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
      and c.owner_user_id = p_user_id
      and coalesce(c.club_type::text, 'main') = 'main'
  ) then
    raise exception 'You can only restart-clean your own main club.';
  end if;

  for r in
    select *
    from (
      values
        /*
          Race application / entry state still visible on Calendar.
        */
        ('public','race_team_entries','club_id','races'),
        ('public','race_team_entries','applicant_club_id','races'),
        ('public','race_team_entries','team_club_id','races'),

        /*
          Regular training defaults / plans from old roster.
        */
        ('public','rider_regular_training_plans','club_id','training'),
        ('public','rider_regular_training_plans','owner_club_id','training'),
        ('public','rider_regular_training_plans','team_club_id','training'),

        /*
          Low-supply notification state from old club state.
        */
        ('public','club_race_supplies_low_notification_state','club_id','notifications'),

        /*
          Transfer events / listings still shown in Transfer Activity and Transfer History.
        */
        ('public','rider_transfer_events','club_id','transfers'),
        ('public','rider_transfer_events','buyer_club_id','transfers'),
        ('public','rider_transfer_events','seller_club_id','transfers'),
        ('public','rider_transfer_events','from_club_id','transfers'),
        ('public','rider_transfer_events','to_club_id','transfers'),

        ('public','rider_transfer_listings','club_id','transfers'),
        ('public','rider_transfer_listings','buyer_club_id','transfers'),
        ('public','rider_transfer_listings','seller_club_id','transfers'),
        ('public','rider_transfer_listings','from_club_id','transfers'),
        ('public','rider_transfer_listings','to_club_id','transfers'),
        ('public','rider_transfer_listings','owner_club_id','transfers'),

        /*
          Extra guarded asset / garage / vehicle delivery sources.
          These cover tables that may not use plain club_id.
        */
        ('public','asset_deliveries','owner_club_id','assets'),
        ('public','asset_deliveries','recipient_club_id','assets'),
        ('public','asset_deliveries','purchasing_club_id','assets'),
        ('public','asset_delivery_items','owner_club_id','assets'),
        ('public','asset_delivery_items','recipient_club_id','assets'),
        ('public','asset_delivery_items','purchasing_club_id','assets'),

        ('public','club_asset_deliveries','owner_club_id','assets'),
        ('public','club_asset_deliveries','recipient_club_id','assets'),
        ('public','club_asset_deliveries','purchasing_club_id','assets'),
        ('public','club_asset_delivery_items','owner_club_id','assets'),
        ('public','club_asset_delivery_items','recipient_club_id','assets'),
        ('public','club_asset_delivery_items','purchasing_club_id','assets'),

        ('public','vehicle_deliveries','owner_club_id','assets'),
        ('public','vehicle_deliveries','recipient_club_id','assets'),
        ('public','vehicle_deliveries','purchasing_club_id','assets'),
        ('public','vehicle_delivery_items','owner_club_id','assets'),
        ('public','vehicle_delivery_items','recipient_club_id','assets'),
        ('public','vehicle_delivery_items','purchasing_club_id','assets'),

        ('public','club_vehicle_deliveries','owner_club_id','assets'),
        ('public','club_vehicle_deliveries','recipient_club_id','assets'),
        ('public','club_vehicle_deliveries','purchasing_club_id','assets'),
        ('public','club_vehicle_delivery_items','owner_club_id','assets'),
        ('public','club_vehicle_delivery_items','recipient_club_id','assets'),
        ('public','club_vehicle_delivery_items','purchasing_club_id','assets'),

        ('public','garage_deliveries','club_id','assets'),
        ('public','garage_deliveries','owner_club_id','assets'),
        ('public','garage_delivery_items','club_id','assets'),
        ('public','garage_delivery_items','owner_club_id','assets'),
        ('public','club_garage_deliveries','club_id','assets'),
        ('public','club_garage_deliveries','owner_club_id','assets'),
        ('public','club_garage_delivery_items','club_id','assets'),
        ('public','club_garage_delivery_items','owner_club_id','assets')
    ) as x(schema_name, table_name, column_name, area)
  loop
    v_tmp := public._restart_try_delete_by_uuid_if_exists_v1(
      r.schema_name,
      r.table_name,
      r.column_name,
      p_club_id
    );

    v_deleted := coalesce((v_tmp ->> 'deleted')::integer, 0);
    v_deleted_total := v_deleted_total + v_deleted;

    if v_deleted > 0 then
      v_area_counts := jsonb_set(
        v_area_counts,
        array[r.area],
        to_jsonb(coalesce((v_area_counts ->> r.area)::integer, 0) + v_deleted),
        true
      );

      v_details := v_details || jsonb_build_array(v_tmp);
    end if;
  end loop;

  update public.club_restart_history h
  set reset_summary =
    coalesce(h.reset_summary, '{}'::jsonb) ||
    jsonb_build_object(
      'remaining_active_commitments_cleanup_result',
      jsonb_build_object(
        'status', 'completed',
        'club_id', p_club_id,
        'deleted_total', v_deleted_total,
        'area_counts', v_area_counts
      )
    )
  where h.id = (
    select h2.id
    from public.club_restart_history h2
    where h2.club_id = p_club_id
    order by h2.created_at desc
    limit 1
  );

  return jsonb_build_object(
    'status', 'completed',
    'club_id', p_club_id,
    'deleted_total', v_deleted_total,
    'area_counts', v_area_counts,
    'details', v_details,
    'note', 'Remaining restart cleanup removed race entries, regular training plans, transfer events/listings, low-supply state, and guarded pending asset delivery rows.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_enforce_replay_rider_gap_continuity_v7(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid, p_max_gap_increase_seconds_per_frame numeric DEFAULT 35, p_max_gap_closure_seconds_per_frame numeric DEFAULT 12, p_visible_split_seconds numeric DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_stage_id uuid;
  v_race_id uuid;
  v_source_group_frames integer := 0;
  v_source_rider_rows integer := 0;
  v_display_group_rows integer := 0;
  v_updated_rows integer := 0;
  v_deleted_rows integer := 0;
begin
  select
    sr.stage_id,
    sr.race_id
  into
    v_stage_id,
    v_race_id
  from public.race_stage_simulation_runs sr
  where sr.id = p_simulation_run_id
  limit 1;

  v_stage_id := coalesce(p_stage_id, v_stage_id);

  if v_stage_id is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'simulation_run_or_stage_not_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', p_stage_id
    );
  end if;

  drop table if exists pg_temp.tmp_replay_gap_v7_slots;
  drop table if exists pg_temp.tmp_replay_gap_v7_source_riders;
  drop table if exists pg_temp.tmp_replay_gap_v7_ordered;
  drop table if exists pg_temp.tmp_replay_gap_v7_safe_riders;
  drop table if exists pg_temp.tmp_replay_gap_v7_display_groups;
  drop table if exists pg_temp.tmp_replay_gap_v7_ranked_groups;

  -- Existing group-frame rows become reusable display slots.
  create temporary table pg_temp.tmp_replay_gap_v7_slots on commit drop as
  select
    rf.id as replay_frame_id,
    rf.frame_number,
    row_number() over (
      partition by rf.frame_number
      order by coalesce(rf.gap_seconds, 0), coalesce(rf.km_marker, 0) desc, rf.id
    )::integer as slot_number,
    count(*) over (
      partition by rf.frame_number
    )::integer as available_slots,
    rf.group_code as original_group_code,
    rf.group_label as original_group_label,
    coalesce(rf.gap_seconds, 0)::numeric as original_gap_seconds,
    coalesce(rf.km_marker, 0)::numeric as original_km_marker,
    rf.metadata as original_metadata
  from public.race_stage_replay_frames rf
  where rf.simulation_run_id = p_simulation_run_id
    and rf.stage_id = v_stage_id
    and coalesce(rf.entity_type, 'group') = 'group';

  get diagnostics v_source_group_frames = row_count;

  create index tmp_replay_gap_v7_slots_idx
    on pg_temp.tmp_replay_gap_v7_slots(frame_number, slot_number);

  -- Expand group frames to rider-frame rows.
  create temporary table pg_temp.tmp_replay_gap_v7_source_riders on commit drop as
  select
    rf.frame_number,
    coalesce(rf.km_marker, 0)::numeric as raw_km_marker,
    coalesce(rf.gap_seconds, 0)::numeric as raw_gap_seconds,
    rf.group_code as raw_group_code,
    rf.group_label as raw_group_label,
    member.rider_id,
    member.rider_position::integer as rider_position
  from public.race_stage_replay_frames rf
  cross join lateral unnest(rf.rider_ids) with ordinality
    as member(rider_id, rider_position)
  where rf.simulation_run_id = p_simulation_run_id
    and rf.stage_id = v_stage_id
    and coalesce(rf.entity_type, 'group') = 'group'
    and coalesce(array_length(rf.rider_ids, 1), 0) > 0;

  get diagnostics v_source_rider_rows = row_count;

  if v_source_group_frames = 0 or v_source_rider_rows = 0 then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'no_group_frames_or_riders',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id,
      'source_group_frames', v_source_group_frames,
      'source_rider_rows', v_source_rider_rows
    );
  end if;

  create index tmp_replay_gap_v7_source_riders_idx
    on pg_temp.tmp_replay_gap_v7_source_riders(rider_id, frame_number);

  -- Precompute rider ordering so the recursive continuity pass can use an index.
  create temporary table pg_temp.tmp_replay_gap_v7_ordered on commit drop as
  select
    src.*,
    row_number() over (
      partition by src.rider_id
      order by src.frame_number
    )::integer as rider_frame_index
  from pg_temp.tmp_replay_gap_v7_source_riders src;

  create index tmp_replay_gap_v7_ordered_idx
    on pg_temp.tmp_replay_gap_v7_ordered(rider_id, rider_frame_index);

  analyze pg_temp.tmp_replay_gap_v7_ordered;

  -- Rider-level continuity:
  -- A rider cannot jump from +51s to +409s in one frame.
  -- He can lose time, but only gradually.
  create temporary table pg_temp.tmp_replay_gap_v7_safe_riders on commit drop as
  with recursive safe_rows as (
    select
      o.frame_number,
      o.raw_km_marker,
      o.raw_gap_seconds,
      o.raw_group_code,
      o.raw_group_label,
      o.rider_id,
      o.rider_position,
      o.rider_frame_index,
      o.raw_gap_seconds::numeric as safe_gap_seconds
    from pg_temp.tmp_replay_gap_v7_ordered o
    where o.rider_frame_index = 1

    union all

    select
      n.frame_number,
      n.raw_km_marker,
      n.raw_gap_seconds,
      n.raw_group_code,
      n.raw_group_label,
      n.rider_id,
      n.rider_position,
      n.rider_frame_index,
      case
        when n.raw_gap_seconds > p.safe_gap_seconds then
          least(
            n.raw_gap_seconds,
            p.safe_gap_seconds
              + (
                  p_max_gap_increase_seconds_per_frame
                  * greatest(
                      0.60::numeric,
                      least(
                        1.60::numeric,
                        abs(n.raw_km_marker - p.raw_km_marker) / 0.60
                      )
                    )
                )
          )
        when n.raw_gap_seconds < p.safe_gap_seconds then
          greatest(
            n.raw_gap_seconds,
            p.safe_gap_seconds
              - (
                  p_max_gap_closure_seconds_per_frame
                  * greatest(
                      0.60::numeric,
                      least(
                        1.60::numeric,
                        abs(n.raw_km_marker - p.raw_km_marker) / 0.60
                      )
                    )
                )
          )
        else
          n.raw_gap_seconds
      end::numeric as safe_gap_seconds
    from safe_rows p
    join pg_temp.tmp_replay_gap_v7_ordered n
      on n.rider_id = p.rider_id
     and n.rider_frame_index = p.rider_frame_index + 1
  )
  select *
  from safe_rows;

  create index tmp_replay_gap_v7_safe_riders_idx
    on pg_temp.tmp_replay_gap_v7_safe_riders(frame_number, safe_gap_seconds, rider_id);

  analyze pg_temp.tmp_replay_gap_v7_safe_riders;

  -- Rebuild visible groups from rider-safe gaps.
  -- Small scattered splits are merged into one visible group, but real big gaps remain separate.
  create temporary table pg_temp.tmp_replay_gap_v7_display_groups on commit drop as
  with ordered_for_groups as (
    select
      sr.*,
      lag(sr.safe_gap_seconds) over (
        partition by sr.frame_number
        order by sr.safe_gap_seconds, sr.raw_km_marker desc, sr.rider_id
      ) as previous_safe_gap_seconds
    from pg_temp.tmp_replay_gap_v7_safe_riders sr
  ),
  grouped_breaks as (
    select
      ofg.*,
      case
        when ofg.previous_safe_gap_seconds is null then 1
        when ofg.safe_gap_seconds - ofg.previous_safe_gap_seconds > p_visible_split_seconds then 1
        else 0
      end as starts_new_visible_group
    from ordered_for_groups ofg
  ),
  clustered as (
    select
      gb.*,
      sum(starts_new_visible_group) over (
        partition by gb.frame_number
        order by gb.safe_gap_seconds, gb.raw_km_marker desc, gb.rider_id
        rows between unbounded preceding and current row
      )::integer as raw_visible_group_number
    from grouped_breaks gb
  ),
  cluster_counts as (
    select
      c.*,
      max(c.raw_visible_group_number) over (
        partition by c.frame_number
      )::integer as raw_visible_group_count,
      max(s.available_slots) over (
        partition by c.frame_number
      )::integer as available_slots
    from clustered c
    join pg_temp.tmp_replay_gap_v7_slots s
      on s.frame_number = c.frame_number
  ),
  limited_clusters as (
    select
      cc.*,
      case
        when cc.raw_visible_group_count <= cc.available_slots then
          cc.raw_visible_group_number
        else
          greatest(
            1,
            least(
              cc.available_slots,
              ceil(
                cc.raw_visible_group_number::numeric
                * cc.available_slots::numeric
                / greatest(cc.raw_visible_group_count::numeric, 1)
              )::integer
            )
          )
      end as visible_group_number
    from cluster_counts cc
  ),
  display_base as (
    select
      lc.frame_number,
      lc.visible_group_number as slot_number,
      round(avg(lc.safe_gap_seconds))::integer as display_gap_seconds,
      max(lc.raw_km_marker)::numeric as display_km_marker,
      count(*)::integer as rider_count,
      array_agg(lc.rider_id order by lc.safe_gap_seconds, lc.raw_km_marker desc, lc.rider_position, lc.rider_id) as rider_ids,
      min(lc.safe_gap_seconds) as min_safe_gap_seconds,
      max(lc.safe_gap_seconds) as max_safe_gap_seconds
    from limited_clusters lc
    group by lc.frame_number, lc.visible_group_number
  ),
  peloton_pick as (
    select distinct on (db.frame_number)
      db.frame_number,
      db.slot_number as peloton_slot_number
    from display_base db
    order by
      db.frame_number,
      db.rider_count desc,
      db.display_gap_seconds asc,
      db.slot_number asc
  )
  select
    db.frame_number,
    db.slot_number,
    db.display_gap_seconds,
    db.display_km_marker,
    db.rider_count,
    db.rider_ids,
    db.min_safe_gap_seconds,
    db.max_safe_gap_seconds,
    pp.peloton_slot_number,
    case
      when db.slot_number = pp.peloton_slot_number then 'main_peloton'
      when db.slot_number < pp.peloton_slot_number and db.slot_number = 1 then 'front_group'
      when db.slot_number < pp.peloton_slot_number then
        'chase_group_' || lpad(db.slot_number::text, 2, '0')
      when db.slot_number = pp.peloton_slot_number + 1 then 'dropped_group'
      else
        'outside_group_' || lpad((db.slot_number - pp.peloton_slot_number - 1)::text, 2, '0')
    end as display_group_code,
    case
      when db.slot_number = pp.peloton_slot_number then 'Peloton'
      when db.slot_number < pp.peloton_slot_number and db.slot_number = 1 then 'Front group'
      when db.slot_number < pp.peloton_slot_number then
        'Chasing group ' || db.slot_number::text
      when db.slot_number = pp.peloton_slot_number + 1 then 'Dropped group'
      else
        'Outside group ' || (db.slot_number - pp.peloton_slot_number - 1)::text
    end as display_group_label
  from display_base db
  join peloton_pick pp
    on pp.frame_number = db.frame_number;

  get diagnostics v_display_group_rows = row_count;

  create index tmp_replay_gap_v7_display_groups_idx
    on pg_temp.tmp_replay_gap_v7_display_groups(frame_number, slot_number);

  -- First give every reusable slot a unique temporary code to avoid
  -- unique constraint conflicts on (simulation_run_id, frame_number, group_code).
  update public.race_stage_replay_frames rf
  set
    group_code = 'tmp_v7_' || s.frame_number::text || '_' || s.slot_number::text,
    group_label = 'tmp v7'
  from pg_temp.tmp_replay_gap_v7_slots s
  where rf.id = s.replay_frame_id;

  -- Update the slots that remain after v7 grouping.
  update public.race_stage_replay_frames rf
  set
    group_code = dg.display_group_code,
    group_label = dg.display_group_label,
    gap_seconds = greatest(0, dg.display_gap_seconds),
    km_marker = dg.display_km_marker,
    rider_ids = dg.rider_ids,
    metadata =
      coalesce(s.original_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'gap_rider_continuity_v7', true,
        'gap_rider_continuity_v7_at', now(),
        'gap_rider_continuity_v7_source', 'rider_safe_gap_then_visible_group_rebuild',
        'v7_original_group_code', s.original_group_code,
        'v7_original_group_label', s.original_group_label,
        'v7_original_gap_seconds', s.original_gap_seconds,
        'v7_original_km_marker', s.original_km_marker,
        'v7_display_slot_number', dg.slot_number,
        'v7_peloton_slot_number', dg.peloton_slot_number,
        'v7_min_member_safe_gap_seconds', round(dg.min_safe_gap_seconds::numeric, 2),
        'v7_max_member_safe_gap_seconds', round(dg.max_safe_gap_seconds::numeric, 2),
        'v7_visible_split_seconds', p_visible_split_seconds,
        'v7_max_gap_increase_seconds_per_frame', p_max_gap_increase_seconds_per_frame,
        'v7_max_gap_closure_seconds_per_frame', p_max_gap_closure_seconds_per_frame
      )
  from pg_temp.tmp_replay_gap_v7_slots s
  join pg_temp.tmp_replay_gap_v7_display_groups dg
    on dg.frame_number = s.frame_number
   and dg.slot_number = s.slot_number
  where rf.id = s.replay_frame_id;

  get diagnostics v_updated_rows = row_count;

  -- Remove unused old group rows from frames where v7 created fewer visible groups.
  delete from public.race_stage_replay_frames rf
  using pg_temp.tmp_replay_gap_v7_slots s
  where rf.id = s.replay_frame_id
    and not exists (
      select 1
      from pg_temp.tmp_replay_gap_v7_display_groups dg
      where dg.frame_number = s.frame_number
        and dg.slot_number = s.slot_number
    );

  get diagnostics v_deleted_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_enforce_replay_rider_gap_continuity_v7',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'source_group_frames', v_source_group_frames,
    'source_rider_rows', v_source_rider_rows,
    'display_group_rows', v_display_group_rows,
    'updated_group_frame_rows', v_updated_rows,
    'deleted_extra_group_frame_rows', v_deleted_rows,
    'max_gap_increase_seconds_per_frame', p_max_gap_increase_seconds_per_frame,
    'max_gap_closure_seconds_per_frame', p_max_gap_closure_seconds_per_frame,
    'visible_split_seconds', p_visible_split_seconds
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_enforce_replay_rider_gap_continuity_v8(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid, p_max_gap_increase_seconds_per_frame numeric DEFAULT 24, p_max_gap_closure_seconds_per_frame numeric DEFAULT 12, p_visible_split_seconds numeric DEFAULT 28, p_km_per_gap_second numeric DEFAULT 0.012)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_stage_id uuid;
  v_race_id uuid;
  v_source_group_frames integer := 0;
  v_raw_source_rider_rows integer := 0;
  v_dedup_source_rider_rows integer := 0;
  v_display_group_rows integer := 0;
  v_updated_rows integer := 0;
  v_deleted_rows integer := 0;
begin
  select
    sr.stage_id,
    sr.race_id
  into
    v_stage_id,
    v_race_id
  from public.race_stage_simulation_runs sr
  where sr.id = p_simulation_run_id
  limit 1;

  v_stage_id := coalesce(p_stage_id, v_stage_id);

  if v_stage_id is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'simulation_run_or_stage_not_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', p_stage_id
    );
  end if;

  drop table if exists pg_temp.tmp_replay_gap_v8_slots;
  drop table if exists pg_temp.tmp_replay_gap_v8_raw_source_riders;
  drop table if exists pg_temp.tmp_replay_gap_v8_source_riders;
  drop table if exists pg_temp.tmp_replay_gap_v8_ordered;
  drop table if exists pg_temp.tmp_replay_gap_v8_safe_riders;
  drop table if exists pg_temp.tmp_replay_gap_v8_frame_leaders;
  drop table if exists pg_temp.tmp_replay_gap_v8_display_groups;
  drop table if exists pg_temp.tmp_replay_gap_v8_display_groups_safe;

  -- Existing group-frame rows become reusable display slots.
  create temporary table pg_temp.tmp_replay_gap_v8_slots on commit drop as
  select
    rf.id as replay_frame_id,
    rf.frame_number,
    row_number() over (
      partition by rf.frame_number
      order by coalesce(rf.gap_seconds, 0), coalesce(rf.km_marker, 0) desc, rf.id
    )::integer as slot_number,
    count(*) over (
      partition by rf.frame_number
    )::integer as available_slots,
    rf.group_code as original_group_code,
    rf.group_label as original_group_label,
    coalesce(rf.gap_seconds, 0)::numeric as original_gap_seconds,
    coalesce(rf.km_marker, 0)::numeric as original_km_marker,
    rf.metadata as original_metadata
  from public.race_stage_replay_frames rf
  where rf.simulation_run_id = p_simulation_run_id
    and rf.stage_id = v_stage_id
    and coalesce(rf.entity_type, 'group') = 'group';

  get diagnostics v_source_group_frames = row_count;

  create index tmp_replay_gap_v8_slots_idx
    on pg_temp.tmp_replay_gap_v8_slots(frame_number, slot_number);

  -- Expand current group frames to rider-frame rows.
  -- IMPORTANT: current v7 rows can contain duplicated rider_ids in a group.
  -- We collect raw rows first, then force one row per (frame_number, rider_id).
  create temporary table pg_temp.tmp_replay_gap_v8_raw_source_riders on commit drop as
  select
    rf.frame_number,
    coalesce(rf.km_marker, 0)::numeric as raw_km_marker,
    coalesce(rf.gap_seconds, 0)::numeric as raw_gap_seconds,
    rf.group_code as raw_group_code,
    rf.group_label as raw_group_label,
    member.rider_id,
    member.rider_position::integer as rider_position
  from public.race_stage_replay_frames rf
  cross join lateral unnest(rf.rider_ids) with ordinality
    as member(rider_id, rider_position)
  where rf.simulation_run_id = p_simulation_run_id
    and rf.stage_id = v_stage_id
    and coalesce(rf.entity_type, 'group') = 'group'
    and coalesce(array_length(rf.rider_ids, 1), 0) > 0;

  get diagnostics v_raw_source_rider_rows = row_count;

  -- One row per rider per frame. Prefer the row with the smallest displayed gap,
  -- then the most advanced road position. This removes v7 duplicate amplification.
  create temporary table pg_temp.tmp_replay_gap_v8_source_riders on commit drop as
  select distinct on (raw.frame_number, raw.rider_id)
    raw.frame_number,
    raw.raw_km_marker,
    raw.raw_gap_seconds,
    raw.raw_group_code,
    raw.raw_group_label,
    raw.rider_id,
    raw.rider_position
  from pg_temp.tmp_replay_gap_v8_raw_source_riders raw
  order by
    raw.frame_number,
    raw.rider_id,
    raw.raw_gap_seconds asc,
    raw.raw_km_marker desc,
    raw.rider_position asc;

  get diagnostics v_dedup_source_rider_rows = row_count;

  if v_source_group_frames = 0 or v_dedup_source_rider_rows = 0 then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'no_group_frames_or_riders',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id,
      'source_group_frames', v_source_group_frames,
      'raw_source_rider_rows', v_raw_source_rider_rows,
      'dedup_source_rider_rows', v_dedup_source_rider_rows
    );
  end if;

  create index tmp_replay_gap_v8_source_riders_idx
    on pg_temp.tmp_replay_gap_v8_source_riders(rider_id, frame_number);

  -- Precompute rider ordering for recursive continuity.
  create temporary table pg_temp.tmp_replay_gap_v8_ordered on commit drop as
  select
    src.*,
    row_number() over (
      partition by src.rider_id
      order by src.frame_number
    )::integer as rider_frame_index
  from pg_temp.tmp_replay_gap_v8_source_riders src;

  create index tmp_replay_gap_v8_ordered_idx
    on pg_temp.tmp_replay_gap_v8_ordered(rider_id, rider_frame_index);

  analyze pg_temp.tmp_replay_gap_v8_ordered;

  -- Rider-level continuity:
  -- A rider cannot jump from +51s to +409s in one frame.
  -- The rider also cannot move backwards in displayed km.
  create temporary table pg_temp.tmp_replay_gap_v8_safe_riders on commit drop as
  with recursive safe_rows as (
    select
      o.frame_number,
      o.raw_km_marker,
      o.raw_gap_seconds,
      o.raw_group_code,
      o.raw_group_label,
      o.rider_id,
      o.rider_position,
      o.rider_frame_index,
      o.raw_gap_seconds::numeric as safe_gap_seconds,
      o.raw_km_marker::numeric as safe_km_marker
    from pg_temp.tmp_replay_gap_v8_ordered o
    where o.rider_frame_index = 1

    union all

    select
      n.frame_number,
      n.raw_km_marker,
      n.raw_gap_seconds,
      n.raw_group_code,
      n.raw_group_label,
      n.rider_id,
      n.rider_position,
      n.rider_frame_index,
      case
        when n.raw_gap_seconds > p.safe_gap_seconds then
          least(
            n.raw_gap_seconds,
            p.safe_gap_seconds
              + (
                  p_max_gap_increase_seconds_per_frame
                  * greatest(
                      0.50::numeric,
                      least(
                        1.25::numeric,
                        abs(n.raw_km_marker - p.safe_km_marker) / 0.60
                      )
                    )
                )
          )
        when n.raw_gap_seconds < p.safe_gap_seconds then
          greatest(
            n.raw_gap_seconds,
            p.safe_gap_seconds
              - (
                  p_max_gap_closure_seconds_per_frame
                  * greatest(
                      0.50::numeric,
                      least(
                        1.25::numeric,
                        abs(n.raw_km_marker - p.safe_km_marker) / 0.60
                      )
                    )
                )
          )
        else
          n.raw_gap_seconds
      end::numeric as safe_gap_seconds,
      greatest(n.raw_km_marker, p.safe_km_marker)::numeric as safe_km_marker
    from safe_rows p
    join pg_temp.tmp_replay_gap_v8_ordered n
      on n.rider_id = p.rider_id
     and n.rider_frame_index = p.rider_frame_index + 1
  )
  select *
  from safe_rows;

  create index tmp_replay_gap_v8_safe_riders_idx
    on pg_temp.tmp_replay_gap_v8_safe_riders(frame_number, safe_gap_seconds, rider_id);

  analyze pg_temp.tmp_replay_gap_v8_safe_riders;

  create temporary table pg_temp.tmp_replay_gap_v8_frame_leaders on commit drop as
  select
    frame_number,
    max(safe_km_marker)::numeric as leader_km_marker,
    count(*)::integer as rider_count
  from pg_temp.tmp_replay_gap_v8_safe_riders
  group by frame_number;

  create index tmp_replay_gap_v8_frame_leaders_idx
    on pg_temp.tmp_replay_gap_v8_frame_leaders(frame_number);

  -- Rebuild visible groups from rider-safe gaps.
  -- Small scattered splits are merged, but the cluster-count calculation is
  -- now frame-level and does not multiply riders by available slots.
  create temporary table pg_temp.tmp_replay_gap_v8_display_groups on commit drop as
  with frame_slot_counts as (
    select
      frame_number,
      max(available_slots)::integer as available_slots
    from pg_temp.tmp_replay_gap_v8_slots
    group by frame_number
  ),
  ordered_for_groups as (
    select
      sr.*,
      lag(sr.safe_gap_seconds) over (
        partition by sr.frame_number
        order by sr.safe_gap_seconds, sr.safe_km_marker desc, sr.rider_id
      ) as previous_safe_gap_seconds
    from pg_temp.tmp_replay_gap_v8_safe_riders sr
  ),
  grouped_breaks as (
    select
      ofg.*,
      case
        when ofg.previous_safe_gap_seconds is null then 1
        when ofg.safe_gap_seconds - ofg.previous_safe_gap_seconds > p_visible_split_seconds then 1
        else 0
      end as starts_new_visible_group
    from ordered_for_groups ofg
  ),
  clustered as (
    select
      gb.*,
      sum(starts_new_visible_group) over (
        partition by gb.frame_number
        order by gb.safe_gap_seconds, gb.safe_km_marker desc, gb.rider_id
        rows between unbounded preceding and current row
      )::integer as raw_visible_group_number
    from grouped_breaks gb
  ),
  cluster_counts as (
    select
      c.*,
      max(c.raw_visible_group_number) over (
        partition by c.frame_number
      )::integer as raw_visible_group_count,
      fsc.available_slots
    from clustered c
    join frame_slot_counts fsc
      on fsc.frame_number = c.frame_number
  ),
  limited_clusters as (
    select
      cc.*,
      case
        when cc.raw_visible_group_count <= cc.available_slots then
          cc.raw_visible_group_number
        else
          greatest(
            1,
            least(
              cc.available_slots,
              ceil(
                cc.raw_visible_group_number::numeric
                * cc.available_slots::numeric
                / greatest(cc.raw_visible_group_count::numeric, 1)
              )::integer
            )
          )
      end as visible_group_number
    from cluster_counts cc
  ),
  display_base as (
    select
      lc.frame_number,
      lc.visible_group_number as slot_number,
      round(avg(lc.safe_gap_seconds))::integer as display_gap_seconds,
      min(lc.safe_gap_seconds)::numeric as min_safe_gap_seconds,
      max(lc.safe_gap_seconds)::numeric as max_safe_gap_seconds,
      min(lc.safe_km_marker)::numeric as min_member_safe_km_marker,
      max(lc.safe_km_marker)::numeric as max_member_safe_km_marker,
      count(*)::integer as rider_count,
      array_agg(lc.rider_id order by lc.safe_gap_seconds, lc.safe_km_marker desc, lc.rider_position, lc.rider_id) as rider_ids
    from limited_clusters lc
    group by lc.frame_number, lc.visible_group_number
  ),
  km_base as (
    select
      db.*,
      fl.leader_km_marker,
      least(
        fl.leader_km_marker,
        greatest(
          db.max_member_safe_km_marker,
          fl.leader_km_marker - (greatest(0, db.display_gap_seconds)::numeric * p_km_per_gap_second)
        )
      )::numeric as display_km_marker
    from display_base db
    join pg_temp.tmp_replay_gap_v8_frame_leaders fl
      on fl.frame_number = db.frame_number
  ),
  peloton_pick as (
    select distinct on (kb.frame_number)
      kb.frame_number,
      kb.slot_number as peloton_slot_number
    from km_base kb
    order by
      kb.frame_number,
      kb.rider_count desc,
      kb.display_gap_seconds asc,
      kb.slot_number asc
  )
  select
    kb.frame_number,
    kb.slot_number,
    kb.display_gap_seconds,
    kb.display_km_marker,
    kb.leader_km_marker,
    kb.rider_count,
    kb.rider_ids,
    kb.min_safe_gap_seconds,
    kb.max_safe_gap_seconds,
    kb.min_member_safe_km_marker,
    kb.max_member_safe_km_marker,
    pp.peloton_slot_number,
    case
      when kb.slot_number = pp.peloton_slot_number then 'main_peloton'
      when kb.slot_number < pp.peloton_slot_number and kb.slot_number = 1 then 'front_group'
      when kb.slot_number < pp.peloton_slot_number then
        'chase_group_' || lpad(kb.slot_number::text, 2, '0')
      when kb.slot_number = pp.peloton_slot_number + 1 then 'dropped_group'
      else
        'outside_group_' || lpad((kb.slot_number - pp.peloton_slot_number - 1)::text, 2, '0')
    end as display_group_code,
    case
      when kb.slot_number = pp.peloton_slot_number then 'Peloton'
      when kb.slot_number < pp.peloton_slot_number and kb.slot_number = 1 then 'Front group'
      when kb.slot_number < pp.peloton_slot_number then
        'Chasing group ' || kb.slot_number::text
      when kb.slot_number = pp.peloton_slot_number + 1 then 'Dropped group'
      else
        'Outside group ' || (kb.slot_number - pp.peloton_slot_number - 1)::text
    end as display_group_label
  from km_base kb
  join peloton_pick pp
    on pp.frame_number = kb.frame_number;

  get diagnostics v_display_group_rows = row_count;

  create index tmp_replay_gap_v8_display_groups_idx
    on pg_temp.tmp_replay_gap_v8_display_groups(frame_number, slot_number);

  -- First give every reusable slot a unique temporary code to avoid unique
  -- constraint conflicts on (simulation_run_id, frame_number, group_code).
  update public.race_stage_replay_frames rf
  set
    group_code = 'tmp_v8_' || s.frame_number::text || '_' || s.slot_number::text,
    group_label = 'tmp v8'
  from pg_temp.tmp_replay_gap_v8_slots s
  where rf.id = s.replay_frame_id;

  -- Update slots that remain after v8 grouping.
  update public.race_stage_replay_frames rf
  set
    group_code = dg.display_group_code,
    group_label = dg.display_group_label,
    gap_seconds = greatest(0, dg.display_gap_seconds),
    km_marker = dg.display_km_marker,
    rider_ids = dg.rider_ids,
    metadata =
      coalesce(s.original_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'gap_rider_continuity_v8', true,
        'gap_rider_continuity_v8_at', now(),
        'gap_rider_continuity_v8_source', 'dedup_rider_safe_gap_km_then_visible_group_rebuild',
        'v8_original_group_code', s.original_group_code,
        'v8_original_group_label', s.original_group_label,
        'v8_original_gap_seconds', s.original_gap_seconds,
        'v8_original_km_marker', s.original_km_marker,
        'v8_display_slot_number', dg.slot_number,
        'v8_peloton_slot_number', dg.peloton_slot_number,
        'v8_min_member_safe_gap_seconds', round(dg.min_safe_gap_seconds::numeric, 2),
        'v8_max_member_safe_gap_seconds', round(dg.max_safe_gap_seconds::numeric, 2),
        'v8_min_member_safe_km_marker', round(dg.min_member_safe_km_marker::numeric, 3),
        'v8_max_member_safe_km_marker', round(dg.max_member_safe_km_marker::numeric, 3),
        'v8_leader_km_marker', round(dg.leader_km_marker::numeric, 3),
        'v8_visible_split_seconds', p_visible_split_seconds,
        'v8_max_gap_increase_seconds_per_frame', p_max_gap_increase_seconds_per_frame,
        'v8_max_gap_closure_seconds_per_frame', p_max_gap_closure_seconds_per_frame,
        'v8_km_per_gap_second', p_km_per_gap_second
      )
  from pg_temp.tmp_replay_gap_v8_slots s
  join pg_temp.tmp_replay_gap_v8_display_groups dg
    on dg.frame_number = s.frame_number
   and dg.slot_number = s.slot_number
  where rf.id = s.replay_frame_id;

  get diagnostics v_updated_rows = row_count;

  -- Remove unused old group rows.
  delete from public.race_stage_replay_frames rf
  using pg_temp.tmp_replay_gap_v8_slots s
  where rf.id = s.replay_frame_id
    and not exists (
      select 1
      from pg_temp.tmp_replay_gap_v8_display_groups dg
      where dg.frame_number = s.frame_number
        and dg.slot_number = s.slot_number
    );

  get diagnostics v_deleted_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_enforce_replay_rider_gap_continuity_v8',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'source_group_frames', v_source_group_frames,
    'raw_source_rider_rows', v_raw_source_rider_rows,
    'dedup_source_rider_rows', v_dedup_source_rider_rows,
    'display_group_rows', v_display_group_rows,
    'updated_group_frame_rows', v_updated_rows,
    'deleted_extra_group_frame_rows', v_deleted_rows,
    'max_gap_increase_seconds_per_frame', p_max_gap_increase_seconds_per_frame,
    'max_gap_closure_seconds_per_frame', p_max_gap_closure_seconds_per_frame,
    'visible_split_seconds', p_visible_split_seconds,
    'km_per_gap_second', p_km_per_gap_second
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_enforce_replay_rider_gap_continuity_v9(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid, p_max_gap_increase_seconds_per_frame numeric DEFAULT 24, p_max_gap_closure_seconds_per_frame numeric DEFAULT 18, p_visible_gap_bin_seconds numeric DEFAULT 30, p_km_per_gap_second numeric DEFAULT 0.012, p_max_forward_km_per_frame numeric DEFAULT 0.85)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_stage_id uuid;
  v_race_id uuid;
  v_distance_km numeric := 1;
  v_source_group_rows integer := 0;
  v_raw_source_rider_rows integer := 0;
  v_dedup_source_rider_rows integer := 0;
  v_display_group_rows integer := 0;
  v_deleted_group_rows integer := 0;
  v_inserted_group_rows integer := 0;
begin
  select
    sr.stage_id,
    sr.race_id
  into
    v_stage_id,
    v_race_id
  from public.race_stage_simulation_runs sr
  where sr.id = p_simulation_run_id
  limit 1;

  v_stage_id := coalesce(p_stage_id, v_stage_id);

  if v_stage_id is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'simulation_run_or_stage_not_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', p_stage_id
    );
  end if;

  select greatest(
    1,
    coalesce(
      max(rs.distance_km),
      max(rf.km_marker),
      1
    )
  )
  into v_distance_km
  from public.race_stages rs
  left join public.race_stage_replay_frames rf
    on rf.stage_id = rs.id
   and rf.simulation_run_id = p_simulation_run_id
  where rs.id = v_stage_id;

  drop table if exists pg_temp.tmp_replay_gap_v9_source_frames;
  drop table if exists pg_temp.tmp_replay_gap_v9_raw_source_riders;
  drop table if exists pg_temp.tmp_replay_gap_v9_source_riders;
  drop table if exists pg_temp.tmp_replay_gap_v9_ordered;
  drop table if exists pg_temp.tmp_replay_gap_v9_safe_riders;
  drop table if exists pg_temp.tmp_replay_gap_v9_frame_leaders;
  drop table if exists pg_temp.tmp_replay_gap_v9_display_groups;
  drop table if exists pg_temp.tmp_replay_gap_v9_numbered_groups;

  create temporary table pg_temp.tmp_replay_gap_v9_source_frames on commit drop as
  select
    f.id,
    f.frame_number::integer as frame_number,
    coalesce(f.race_seconds, 0)::integer as race_seconds,
    greatest(0, least(v_distance_km, coalesce(f.km_marker, 0)::numeric)) as km_marker,
    coalesce(f.group_order, 1)::integer as group_order,
    coalesce(f.group_code, '')::text as group_code,
    coalesce(f.group_label, '')::text as group_label,
    greatest(0, coalesce(f.gap_seconds, 0)::numeric) as gap_seconds,
    greatest(1, coalesce(f.avg_speed_kmh, 38)::numeric) as avg_speed_kmh,
    coalesce(f.rider_ids, array[]::uuid[]) as rider_ids,
    coalesce(f.rider_names, array[]::text[]) as rider_names,
    coalesce(f.team_names, array[]::text[]) as team_names,
    coalesce(f.metadata, '{}'::jsonb) as metadata,
    lower(coalesce(nullif(f.metadata->>'terrain_type', ''), 'flat')) as terrain_type,
    coalesce(
      case when (f.metadata->>'slope_percent') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (f.metadata->>'slope_percent')::numeric end,
      0
    ) as slope_percent
  from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group'
    and array_length(f.rider_ids, 1) is not null
    and array_length(f.rider_ids, 1) > 0
  order by f.frame_number, f.group_order, f.gap_seconds, f.km_marker desc;

  get diagnostics v_source_group_rows = row_count;

  if v_source_group_rows = 0 then
    return jsonb_build_object(
      'status', 'skipped',
      'function', 'race_engine_enforce_replay_rider_gap_continuity_v9',
      'reason', 'no_group_replay_frames_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id
    );
  end if;

  create temporary table pg_temp.tmp_replay_gap_v9_raw_source_riders on commit drop as
  select
    sf.frame_number,
    sf.race_seconds,
    sf.km_marker as raw_group_km_marker,
    sf.group_order as raw_group_order,
    sf.group_code as raw_group_code,
    sf.group_label as raw_group_label,
    sf.gap_seconds as raw_gap_seconds,
    sf.avg_speed_kmh,
    sf.metadata,
    sf.terrain_type,
    sf.slope_percent,
    rider.rider_id::uuid as rider_id,
    rider.rider_ordinal::integer as rider_ordinal,
    coalesce(sf.rider_names[rider.rider_ordinal::integer], 'Rider') as rider_name,
    coalesce(sf.team_names[rider.rider_ordinal::integer], '') as team_name
  from pg_temp.tmp_replay_gap_v9_source_frames sf
  cross join lateral unnest(sf.rider_ids) with ordinality
    as rider(rider_id, rider_ordinal);

  get diagnostics v_raw_source_rider_rows = row_count;

  -- One source row per rider per frame. Prefer smallest displayed gap, then
  -- most advanced km. This protects against duplicate rider entries from older patches.
  create temporary table pg_temp.tmp_replay_gap_v9_source_riders on commit drop as
  select distinct on (raw.frame_number, raw.rider_id)
    raw.*
  from pg_temp.tmp_replay_gap_v9_raw_source_riders raw
  order by
    raw.frame_number,
    raw.rider_id,
    raw.raw_gap_seconds asc,
    raw.raw_group_km_marker desc,
    raw.rider_ordinal asc;

  get diagnostics v_dedup_source_rider_rows = row_count;

  create temporary table pg_temp.tmp_replay_gap_v9_ordered on commit drop as
  select
    src.*,
    row_number() over (
      partition by src.rider_id
      order by src.frame_number
    )::integer as rider_frame_index
  from pg_temp.tmp_replay_gap_v9_source_riders src;

  create index tmp_replay_gap_v9_ordered_idx
    on pg_temp.tmp_replay_gap_v9_ordered(rider_id, rider_frame_index);

  analyze pg_temp.tmp_replay_gap_v9_ordered;

  -- Rider-level continuity. This is the important part:
  -- same rider cannot jump from seconds to minutes, and cannot move backwards.
  create temporary table pg_temp.tmp_replay_gap_v9_safe_riders on commit drop as
  with recursive safe_rows as (
    select
      o.frame_number,
      o.race_seconds,
      o.raw_group_km_marker,
      o.raw_group_order,
      o.raw_group_code,
      o.raw_group_label,
      o.raw_gap_seconds,
      o.avg_speed_kmh,
      o.metadata,
      o.terrain_type,
      o.slope_percent,
      o.rider_id,
      o.rider_ordinal,
      o.rider_name,
      o.team_name,
      o.rider_frame_index,
      o.raw_gap_seconds::numeric as safe_gap_seconds,
      o.raw_group_km_marker::numeric as safe_km_marker
    from pg_temp.tmp_replay_gap_v9_ordered o
    where o.rider_frame_index = 1

    union all

    select
      n.frame_number,
      n.race_seconds,
      n.raw_group_km_marker,
      n.raw_group_order,
      n.raw_group_code,
      n.raw_group_label,
      n.raw_gap_seconds,
      n.avg_speed_kmh,
      n.metadata,
      n.terrain_type,
      n.slope_percent,
      n.rider_id,
      n.rider_ordinal,
      n.rider_name,
      n.team_name,
      n.rider_frame_index,
      case
        when n.raw_gap_seconds > p.safe_gap_seconds then
          least(
            n.raw_gap_seconds,
            p.safe_gap_seconds + p_max_gap_increase_seconds_per_frame
          )
        when n.raw_gap_seconds < p.safe_gap_seconds then
          greatest(
            n.raw_gap_seconds,
            p.safe_gap_seconds - p_max_gap_closure_seconds_per_frame
          )
        else
          n.raw_gap_seconds
      end::numeric as safe_gap_seconds,
      greatest(
        p.safe_km_marker,
        least(
          greatest(0, n.raw_group_km_marker),
          p.safe_km_marker + p_max_forward_km_per_frame
        )
      )::numeric as safe_km_marker
    from safe_rows p
    join pg_temp.tmp_replay_gap_v9_ordered n
      on n.rider_id = p.rider_id
     and n.rider_frame_index = p.rider_frame_index + 1
  )
  select *
  from safe_rows;

  create index tmp_replay_gap_v9_safe_riders_frame_idx
    on pg_temp.tmp_replay_gap_v9_safe_riders(frame_number, safe_gap_seconds, rider_id);

  analyze pg_temp.tmp_replay_gap_v9_safe_riders;

  create temporary table pg_temp.tmp_replay_gap_v9_frame_leaders on commit drop as
  select
    frame_number,
    max(safe_km_marker)::numeric as leader_km_marker,
    max(race_seconds)::integer as race_seconds,
    avg(avg_speed_kmh)::numeric as avg_speed_kmh
  from pg_temp.tmp_replay_gap_v9_safe_riders
  group by frame_number;

  -- Fixed-width gap bins keep group identities stable and avoid chained
  -- 10/15s splits becoming one huge internal group.
  create temporary table pg_temp.tmp_replay_gap_v9_display_groups on commit drop as
  with binned_riders as (
    select
      sr.*,
      greatest(1, floor(greatest(0, sr.safe_gap_seconds) / greatest(p_visible_gap_bin_seconds, 1))::integer + 1) as gap_bin
    from pg_temp.tmp_replay_gap_v9_safe_riders sr
  ),
  group_base as (
    select
      br.frame_number,
      br.gap_bin,
      round(avg(br.safe_gap_seconds))::integer as display_gap_seconds,
      min(br.safe_gap_seconds)::numeric as min_safe_gap_seconds,
      max(br.safe_gap_seconds)::numeric as max_safe_gap_seconds,
      min(br.safe_km_marker)::numeric as min_member_safe_km_marker,
      max(br.safe_km_marker)::numeric as max_member_safe_km_marker,
      count(*)::integer as rider_count,
      array_agg(br.rider_id order by br.safe_gap_seconds, br.safe_km_marker desc, br.rider_ordinal, br.rider_id) as rider_ids,
      array_agg(br.rider_name order by br.safe_gap_seconds, br.safe_km_marker desc, br.rider_ordinal, br.rider_id) as rider_names,
      array_agg(br.team_name order by br.safe_gap_seconds, br.safe_km_marker desc, br.rider_ordinal, br.rider_id) as team_names,
      max(br.race_seconds)::integer as race_seconds,
      avg(br.avg_speed_kmh)::numeric as avg_speed_kmh,
      (array_agg(br.metadata order by br.safe_gap_seconds, br.safe_km_marker desc))[1] as source_metadata,
      (array_agg(br.terrain_type order by br.safe_gap_seconds, br.safe_km_marker desc))[1] as terrain_type,
      (array_agg(br.slope_percent order by br.safe_gap_seconds, br.safe_km_marker desc))[1] as slope_percent
    from binned_riders br
    group by br.frame_number, br.gap_bin
  ),
  with_leader as (
    select
      gb.*,
      fl.leader_km_marker,
      least(
        v_distance_km,
        greatest(
          0,
          gb.max_member_safe_km_marker,
          fl.leader_km_marker - (greatest(0, gb.display_gap_seconds)::numeric * p_km_per_gap_second)
        )
      )::numeric as display_km_marker
    from group_base gb
    join pg_temp.tmp_replay_gap_v9_frame_leaders fl
      on fl.frame_number = gb.frame_number
  ),
  ordered_groups as (
    select
      wl.*,
      row_number() over (
        partition by wl.frame_number
        order by wl.display_gap_seconds asc, wl.display_km_marker desc, wl.gap_bin asc
      )::integer as group_order
    from with_leader wl
  ),
  peloton_pick as (
    select distinct on (og.frame_number)
      og.frame_number,
      og.group_order as peloton_group_order
    from ordered_groups og
    order by
      og.frame_number,
      og.rider_count desc,
      og.display_gap_seconds asc,
      og.group_order asc
  ),
  numbered as (
    select
      og.*,
      pp.peloton_group_order,
      count(*) filter (where og.group_order < pp.peloton_group_order) over (
        partition by og.frame_number
        order by og.group_order
        rows between unbounded preceding and current row
      )::integer as ahead_number,
      count(*) filter (where og.group_order > pp.peloton_group_order) over (
        partition by og.frame_number
        order by og.group_order
        rows between unbounded preceding and current row
      )::integer as behind_number
    from ordered_groups og
    join peloton_pick pp
      on pp.frame_number = og.frame_number
  )
  select
    n.*,
    case
      when n.group_order = n.peloton_group_order then 'main_peloton'
      when n.group_order < n.peloton_group_order and n.ahead_number = 1 then 'front_group'
      when n.group_order < n.peloton_group_order then 'chase_group_' || lpad(n.ahead_number::text, 2, '0')
      when n.behind_number = 1 then 'dropped_group'
      else 'outside_group_' || lpad((n.behind_number - 1)::text, 2, '0')
    end as display_group_code,
    case
      when n.group_order = n.peloton_group_order then 'Peloton'
      when n.group_order < n.peloton_group_order and n.ahead_number = 1 then 'Front group'
      when n.group_order < n.peloton_group_order then 'Chasing group ' || n.ahead_number::text
      when n.behind_number = 1 then 'Dropped group'
      else 'Outside group ' || (n.behind_number - 1)::text
    end as display_group_label
  from numbered n;

  get diagnostics v_display_group_rows = row_count;

  -- Replace current group rows with v9 rebuilt display rows. This avoids being
  -- limited by the number of old display slots.
  delete from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group';

  get diagnostics v_deleted_group_rows = row_count;

  insert into public.race_stage_replay_frames (
    simulation_run_id,
    race_id,
    stage_id,
    frame_number,
    race_seconds,
    km_marker,
    group_code,
    group_label,
    group_order,
    gap_seconds,
    avg_speed_kmh,
    rider_ids,
    rider_names,
    team_names,
    entity_type,
    metadata
  )
  select
    p_simulation_run_id,
    v_race_id,
    v_stage_id,
    dg.frame_number,
    dg.race_seconds,
    greatest(0, least(v_distance_km, dg.display_km_marker)) as km_marker,
    dg.display_group_code,
    dg.display_group_label,
    dg.group_order,
    greatest(0, dg.display_gap_seconds),
    greatest(1, coalesce(dg.avg_speed_kmh, 38)),
    dg.rider_ids,
    dg.rider_names,
    dg.team_names,
    'group',
    (
      coalesce(dg.source_metadata, '{}'::jsonb)
      - 'rider_energy_v1'
      - 'stage_live_energy_smooth_v8'
      - 'stage_live_energy_smooth_v9'
      - 'stage_live_energy_smooth_v10'
      - 'stage_live_energy_smooth_v11'
      - 'stage_live_energy_smooth_v12'
      - 'average_live_energy_pct'
      - 'minimum_live_energy_pct'
      - 'maximum_live_energy_pct'
      - 'average_pre_stage_freshness_pct'
      - 'minimum_pre_stage_freshness_pct'
      - 'maximum_pre_stage_freshness_pct'
    ) || jsonb_build_object(
      'source', 'race_engine_replay_v9_binned_rider_gap_km_continuity',
      'gap_rider_continuity_v9', true,
      'gap_rider_continuity_v9_at', now(),
      'v9_gap_bin_seconds', p_visible_gap_bin_seconds,
      'v9_group_gap_span_seconds', round((dg.max_safe_gap_seconds - dg.min_safe_gap_seconds)::numeric, 2),
      'v9_min_member_safe_gap_seconds', round(dg.min_safe_gap_seconds::numeric, 2),
      'v9_max_member_safe_gap_seconds', round(dg.max_safe_gap_seconds::numeric, 2),
      'v9_min_member_safe_km_marker', round(dg.min_member_safe_km_marker::numeric, 3),
      'v9_max_member_safe_km_marker', round(dg.max_member_safe_km_marker::numeric, 3),
      'v9_leader_km_marker', round(dg.leader_km_marker::numeric, 3),
      'v9_peloton_group_order', dg.peloton_group_order,
      'v9_max_gap_increase_seconds_per_frame', p_max_gap_increase_seconds_per_frame,
      'v9_max_gap_closure_seconds_per_frame', p_max_gap_closure_seconds_per_frame,
      'v9_max_forward_km_per_frame', p_max_forward_km_per_frame,
      'terrain_type', dg.terrain_type,
      'slope_percent', dg.slope_percent
    ) as metadata
  from pg_temp.tmp_replay_gap_v9_display_groups dg
  order by dg.frame_number, dg.group_order;

  get diagnostics v_inserted_group_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_enforce_replay_rider_gap_continuity_v9',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'distance_km', v_distance_km,
    'source_group_rows', v_source_group_rows,
    'raw_source_rider_rows', v_raw_source_rider_rows,
    'dedup_source_rider_rows', v_dedup_source_rider_rows,
    'display_group_rows', v_display_group_rows,
    'deleted_group_rows', v_deleted_group_rows,
    'inserted_group_rows', v_inserted_group_rows,
    'max_gap_increase_seconds_per_frame', p_max_gap_increase_seconds_per_frame,
    'max_gap_closure_seconds_per_frame', p_max_gap_closure_seconds_per_frame,
    'visible_gap_bin_seconds', p_visible_gap_bin_seconds,
    'km_per_gap_second', p_km_per_gap_second,
    'max_forward_km_per_frame', p_max_forward_km_per_frame
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public._restart_delete_by_rider_ids_if_exists_v1(p_schema text, p_table text, p_column text, p_rider_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_deleted integer := 0;
begin
  if p_rider_ids is null or array_length(p_rider_ids, 1) is null then
    return 0;
  end if;

  if to_regclass(format('%I.%I', p_schema, p_table)) is null then
    return 0;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = p_schema
      and table_name = p_table
      and column_name = p_column
  ) then
    return 0;
  end if;

  execute format(
    'delete from %I.%I where %I = any($1)',
    p_schema,
    p_table,
    p_column
  )
  using p_rider_ids;

  get diagnostics v_deleted = row_count;
  return coalesce(v_deleted, 0);
exception
  when others then
    return 0;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._restart_null_rider_uuid_column_if_exists_v1(p_column text, p_rider_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_updated integer := 0;
begin
  if p_rider_ids is null or array_length(p_rider_ids, 1) is null then
    return 0;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'riders'
      and column_name = p_column
  ) then
    return 0;
  end if;

  execute format(
    'update public.riders set %I = null where id = any($1)',
    p_column
  )
  using p_rider_ids;

  get diagnostics v_updated = row_count;
  return coalesce(v_updated, 0);
exception
  when others then
    return 0;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._restart_set_rider_boolean_column_if_exists_v1(p_column text, p_rider_ids uuid[], p_value boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_updated integer := 0;
begin
  if p_rider_ids is null or array_length(p_rider_ids, 1) is null then
    return 0;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'riders'
      and column_name = p_column
      and data_type = 'boolean'
  ) then
    return 0;
  end if;

  execute format(
    'update public.riders set %I = $2 where id = any($1)',
    p_column
  )
  using p_rider_ids, p_value;

  get diagnostics v_updated = row_count;
  return coalesce(v_updated, 0);
exception
  when others then
    return 0;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.restart_ensure_released_riders_free_agents_v1(p_user_id uuid, p_club_id uuid, p_restart_id uuid, p_old_rider_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_old_count integer := 0;
  v_inserted_audit integer := 0;
  v_deleted_links integer := 0;
  v_deleted_contract_rows integer := 0;
  v_null_updates integer := 0;
  v_bool_updates integer := 0;
  v_still_linked_to_restart_club integer := 0;
  v_still_linked_to_any_club integer := 0;
begin
  if p_user_id is null then
    raise exception 'User id is required for released rider cleanup.';
  end if;

  if p_club_id is null then
    raise exception 'Club id is required for released rider cleanup.';
  end if;

  if not exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
      and c.owner_user_id = p_user_id
      and coalesce(c.club_type::text, 'main') = 'main'
  ) then
    raise exception 'You can only release riders from your own main club.';
  end if;

  v_old_count := coalesce(array_length(p_old_rider_ids, 1), 0);

  if v_old_count = 0 then
    return jsonb_build_object(
      'status', 'completed',
      'club_id', p_club_id,
      'old_rider_count', 0,
      'note', 'No old riders were captured before restart.'
    );
  end if;

  insert into public.club_restart_released_riders (
    restart_id,
    club_id,
    user_id,
    rider_id,
    release_reason,
    metadata
  )
  select
    p_restart_id,
    p_club_id,
    p_user_id,
    x.rider_id,
    'team_restart',
    jsonb_build_object('captured_before_restart', true)
  from unnest(p_old_rider_ids) as x(rider_id);

  get diagnostics v_inserted_audit = row_count;

  delete from public.club_riders cr
  where cr.rider_id = any(p_old_rider_ids);

  get diagnostics v_deleted_links = row_count;

  v_null_updates := v_null_updates + public._restart_null_rider_uuid_column_if_exists_v1('club_id', p_old_rider_ids);
  v_null_updates := v_null_updates + public._restart_null_rider_uuid_column_if_exists_v1('current_club_id', p_old_rider_ids);
  v_null_updates := v_null_updates + public._restart_null_rider_uuid_column_if_exists_v1('team_id', p_old_rider_ids);
  v_null_updates := v_null_updates + public._restart_null_rider_uuid_column_if_exists_v1('current_team_id', p_old_rider_ids);
  v_null_updates := v_null_updates + public._restart_null_rider_uuid_column_if_exists_v1('owner_club_id', p_old_rider_ids);

  v_bool_updates := v_bool_updates + public._restart_set_rider_boolean_column_if_exists_v1('is_free_agent', p_old_rider_ids, true);
  v_bool_updates := v_bool_updates + public._restart_set_rider_boolean_column_if_exists_v1('is_on_free_agent_market', p_old_rider_ids, true);

  v_deleted_contract_rows := v_deleted_contract_rows + public._restart_delete_by_rider_ids_if_exists_v1('public', 'rider_contracts', 'rider_id', p_old_rider_ids);
  v_deleted_contract_rows := v_deleted_contract_rows + public._restart_delete_by_rider_ids_if_exists_v1('public', 'club_rider_contracts', 'rider_id', p_old_rider_ids);
  v_deleted_contract_rows := v_deleted_contract_rows + public._restart_delete_by_rider_ids_if_exists_v1('public', 'rider_contract_negotiations', 'rider_id', p_old_rider_ids);
  v_deleted_contract_rows := v_deleted_contract_rows + public._restart_delete_by_rider_ids_if_exists_v1('public', 'rider_free_agent_negotiations', 'rider_id', p_old_rider_ids);

  select count(*)
  into v_still_linked_to_restart_club
  from public.club_riders cr
  where cr.club_id = p_club_id
    and cr.rider_id = any(p_old_rider_ids);

  select count(*)
  into v_still_linked_to_any_club
  from public.club_riders cr
  where cr.rider_id = any(p_old_rider_ids);

  return jsonb_build_object(
    'status', 'completed',
    'club_id', p_club_id,
    'restart_id', p_restart_id,
    'old_rider_count', v_old_count,
    'audit_rows_inserted', coalesce(v_inserted_audit, 0),
    'club_rider_links_deleted', coalesce(v_deleted_links, 0),
    'contract_rows_deleted', coalesce(v_deleted_contract_rows, 0),
    'rider_uuid_columns_nulled', coalesce(v_null_updates, 0),
    'rider_boolean_columns_updated', coalesce(v_bool_updates, 0),
    'still_linked_to_restart_club', coalesce(v_still_linked_to_restart_club, 0),
    'still_linked_to_any_club', coalesce(v_still_linked_to_any_club, 0),
    'free_agent_market_rule', 'Released riders are free agents when they have no club_riders row and no current club link.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public._restart_update_summary_numeric_column_if_exists_v1(p_table text, p_column text, p_club_id uuid, p_value numeric)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_updated integer := 0;
begin
  if to_regclass(format('public.%I', p_table)) is null then
    return 0;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = 'club_id'
  ) then
    return 0;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = p_column
      and data_type in ('integer', 'bigint', 'numeric', 'real', 'double precision')
  ) then
    return 0;
  end if;

  execute format(
    'update public.%I set %I = $2 where club_id = $1',
    p_table,
    p_column
  )
  using p_club_id, p_value;

  get diagnostics v_updated = row_count;
  return coalesce(v_updated, 0);
exception
  when others then
    return 0;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._restart_touch_updated_at_if_exists_v1(p_table text, p_club_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_updated integer := 0;
begin
  if to_regclass(format('public.%I', p_table)) is null then
    return 0;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = 'club_id'
  ) then
    return 0;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = 'updated_at'
  ) then
    return 0;
  end if;

  execute format(
    'update public.%I set updated_at = now() where club_id = $1',
    p_table
  )
  using p_club_id;

  get diagnostics v_updated = row_count;
  return coalesce(v_updated, 0);
exception
  when others then
    return 0;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.restart_cleanup_final_visible_sources_v1(p_user_id uuid, p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  v_tmp jsonb;
  v_deleted integer := 0;
  v_deleted_total integer := 0;
  v_area_counts jsonb := '{}'::jsonb;
  v_details jsonb := '[]'::jsonb;
  v_expected_cash numeric := 0;
  v_summary_updates integer := 0;
begin
  if p_user_id is null then
    raise exception 'User id is required for final restart cleanup.';
  end if;

  if p_club_id is null then
    raise exception 'Club id is required for final restart cleanup.';
  end if;

  if not exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
      and c.owner_user_id = p_user_id
      and coalesce(c.club_type::text, 'main') = 'main'
  ) then
    raise exception 'You can only restart-clean your own main club.';
  end if;

  select
    case lower(coalesce(c.club_tier::text, ''))
      when 'worldteam' then 1750000
      when 'world_team' then 1750000
      when 'world tour' then 1750000
      when 'proteam' then 1000000
      when 'pro_team' then 1000000
      when 'continental' then 600000
      when 'amateur' then 300000
      else coalesce(c.cash_balance, 0)
    end
  into v_expected_cash
  from public.clubs c
  where c.id = p_club_id;

  for r in
    select *
    from (
      values
        ('public','race_application_previews','club_id','race_preview'),
        ('public','race_application_previews','applicant_club_id','race_preview'),
        ('public','race_application_scores','club_id','race_preview'),
        ('public','race_application_scores','applicant_club_id','race_preview'),
        ('public','race_application_estimates','club_id','race_preview'),
        ('public','race_application_estimates','applicant_club_id','race_preview'),
        ('public','club_race_application_scores','club_id','race_preview'),
        ('public','club_race_application_commitment_scores','club_id','race_preview'),
        ('public','club_race_commitment_scores','club_id','race_preview'),
        ('public','race_commitment_scores','club_id','race_preview'),
        ('public','race_commitment_scores','applicant_club_id','race_preview'),
        ('public','race_application_pressure','club_id','race_preview'),
        ('public','club_race_application_pressure','club_id','race_preview'),

        ('public','race_team_entries','club_id','races'),
        ('public','race_team_entries','applicant_club_id','races'),
        ('public','race_team_entries','team_club_id','races'),

        ('public','rider_transfer_events','club_id','transfers'),
        ('public','rider_transfer_events','buyer_club_id','transfers'),
        ('public','rider_transfer_events','seller_club_id','transfers'),
        ('public','rider_transfer_events','from_club_id','transfers'),
        ('public','rider_transfer_events','to_club_id','transfers'),
        ('public','rider_transfer_events','source_club_id','transfers'),
        ('public','rider_transfer_events','target_club_id','transfers'),
        ('public','rider_transfer_events','old_club_id','transfers'),
        ('public','rider_transfer_events','new_club_id','transfers'),
        ('public','rider_transfer_events','previous_club_id','transfers'),
        ('public','rider_transfer_events','released_from_club_id','transfers'),

        ('public','rider_transfer_history','club_id','transfers'),
        ('public','rider_transfer_history','buyer_club_id','transfers'),
        ('public','rider_transfer_history','seller_club_id','transfers'),
        ('public','rider_transfer_history','from_club_id','transfers'),
        ('public','rider_transfer_history','to_club_id','transfers'),
        ('public','rider_transfer_history','source_club_id','transfers'),
        ('public','rider_transfer_history','target_club_id','transfers'),
        ('public','rider_transfer_history','old_club_id','transfers'),
        ('public','rider_transfer_history','new_club_id','transfers'),
        ('public','rider_transfer_history','previous_club_id','transfers'),
        ('public','rider_transfer_history','released_from_club_id','transfers'),

        ('public','rider_history_events','club_id','transfers'),
        ('public','rider_history_events','source_club_id','transfers'),
        ('public','rider_history_events','target_club_id','transfers'),
        ('public','rider_history_events','old_club_id','transfers'),
        ('public','rider_history_events','new_club_id','transfers'),
        ('public','rider_history_events','previous_club_id','transfers'),
        ('public','rider_history_events','released_from_club_id','transfers'),

        ('public','rider_club_history','club_id','transfers'),
        ('public','rider_club_history','source_club_id','transfers'),
        ('public','rider_club_history','target_club_id','transfers'),
        ('public','rider_club_history','old_club_id','transfers'),
        ('public','rider_club_history','new_club_id','transfers'),
        ('public','rider_club_history','previous_club_id','transfers'),
        ('public','rider_club_history','released_from_club_id','transfers'),

        ('public','club_rider_history','club_id','transfers'),
        ('public','club_rider_history','source_club_id','transfers'),
        ('public','club_rider_history','target_club_id','transfers'),
        ('public','club_rider_history','old_club_id','transfers'),
        ('public','club_rider_history','new_club_id','transfers'),
        ('public','club_rider_history','previous_club_id','transfers'),
        ('public','club_rider_history','released_from_club_id','transfers'),

        ('public','rider_career_events','club_id','transfers'),
        ('public','rider_career_events','source_club_id','transfers'),
        ('public','rider_career_events','target_club_id','transfers'),
        ('public','rider_career_events','old_club_id','transfers'),
        ('public','rider_career_events','new_club_id','transfers'),
        ('public','rider_career_events','previous_club_id','transfers'),
        ('public','rider_career_events','released_from_club_id','transfers'),

        ('public','rider_regular_training_plans','club_id','training'),
        ('public','rider_regular_training_plans','owner_club_id','training'),
        ('public','rider_regular_training_plans','team_club_id','training')
    ) as x(schema_name, table_name, column_name, area)
  loop
    v_tmp := public._restart_try_delete_by_uuid_if_exists_v1(
      r.schema_name,
      r.table_name,
      r.column_name,
      p_club_id
    );

    v_deleted := coalesce((v_tmp ->> 'deleted')::integer, 0);
    v_deleted_total := v_deleted_total + v_deleted;

    if v_deleted > 0 then
      v_area_counts := jsonb_set(
        v_area_counts,
        array[r.area],
        to_jsonb(coalesce((v_area_counts ->> r.area)::integer, 0) + v_deleted),
        true
      );

      v_details := v_details || jsonb_build_array(v_tmp);
    end if;
  end loop;

  v_summary_updates := v_summary_updates + public._restart_update_summary_numeric_column_if_exists_v1('club_finance_summary', 'cash_balance', p_club_id, v_expected_cash);
  v_summary_updates := v_summary_updates + public._restart_update_summary_numeric_column_if_exists_v1('club_finance_summary', 'current_balance', p_club_id, v_expected_cash);
  v_summary_updates := v_summary_updates + public._restart_update_summary_numeric_column_if_exists_v1('club_finance_summary', 'balance', p_club_id, v_expected_cash);

  v_summary_updates := v_summary_updates + public._restart_update_summary_numeric_column_if_exists_v1('club_finance_summary', 'income_this_month', p_club_id, 0);
  v_summary_updates := v_summary_updates + public._restart_update_summary_numeric_column_if_exists_v1('club_finance_summary', 'expenses_this_month', p_club_id, 0);
  v_summary_updates := v_summary_updates + public._restart_update_summary_numeric_column_if_exists_v1('club_finance_summary', 'monthly_income', p_club_id, 0);
  v_summary_updates := v_summary_updates + public._restart_update_summary_numeric_column_if_exists_v1('club_finance_summary', 'monthly_expenses', p_club_id, 0);
  v_summary_updates := v_summary_updates + public._restart_update_summary_numeric_column_if_exists_v1('club_finance_summary', 'monthly_expense', p_club_id, 0);
  v_summary_updates := v_summary_updates + public._restart_update_summary_numeric_column_if_exists_v1('club_finance_summary', 'season_income', p_club_id, 0);
  v_summary_updates := v_summary_updates + public._restart_update_summary_numeric_column_if_exists_v1('club_finance_summary', 'season_expenses', p_club_id, 0);
  v_summary_updates := v_summary_updates + public._restart_update_summary_numeric_column_if_exists_v1('club_finance_summary', 'season_expense', p_club_id, 0);

  v_summary_updates := v_summary_updates + public._restart_touch_updated_at_if_exists_v1('club_finance_summary', p_club_id);

  update public.clubs c
  set
    cash_balance = v_expected_cash,
    season_points = 0,
    is_active = true,
    deleted_at = null
  where c.id = p_club_id;

  update public.club_restart_history h
  set reset_summary =
    coalesce(h.reset_summary, '{}'::jsonb) ||
    jsonb_build_object(
      'final_visible_sources_cleanup_result',
      jsonb_build_object(
        'status', 'completed',
        'club_id', p_club_id,
        'deleted_total', v_deleted_total,
        'area_counts', v_area_counts,
        'finance_summary_updates', v_summary_updates,
        'expected_cash_balance', v_expected_cash
      )
    )
  where h.id = (
    select h2.id
    from public.club_restart_history h2
    where h2.club_id = p_club_id
    order by h2.created_at desc
    limit 1
  );

  return jsonb_build_object(
    'status', 'completed',
    'club_id', p_club_id,
    'deleted_total', v_deleted_total,
    'area_counts', v_area_counts,
    'details', v_details,
    'finance_summary_updates', v_summary_updates,
    'expected_cash_balance', v_expected_cash,
    'note', 'Final restart cleanup removed race preview caches, transfer history rows, and synced finance summary to starter cash.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_enforce_replay_rider_gap_continuity_v10(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid, p_max_gap_increase_seconds_per_frame numeric DEFAULT 24, p_max_gap_closure_seconds_per_frame numeric DEFAULT 18, p_visible_gap_bin_seconds numeric DEFAULT 30, p_visible_km_bin_width numeric DEFAULT 0.10, p_km_per_gap_second numeric DEFAULT 0.012, p_max_forward_km_per_frame numeric DEFAULT 0.85)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_stage_id uuid;
  v_race_id uuid;
  v_distance_km numeric := 1;
  v_source_group_rows integer := 0;
  v_raw_source_rider_rows integer := 0;
  v_dedup_source_rider_rows integer := 0;
  v_display_group_rows integer := 0;
  v_deleted_group_rows integer := 0;
  v_inserted_group_rows integer := 0;
begin
  select
    sr.stage_id,
    sr.race_id
  into
    v_stage_id,
    v_race_id
  from public.race_stage_simulation_runs sr
  where sr.id = p_simulation_run_id
  limit 1;

  v_stage_id := coalesce(p_stage_id, v_stage_id);

  if v_stage_id is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'simulation_run_or_stage_not_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', p_stage_id
    );
  end if;

  select greatest(
    1,
    coalesce(
      max(rs.distance_km),
      max(rf.km_marker),
      1
    )
  )
  into v_distance_km
  from public.race_stages rs
  left join public.race_stage_replay_frames rf
    on rf.stage_id = rs.id
   and rf.simulation_run_id = p_simulation_run_id
  where rs.id = v_stage_id;

  drop table if exists pg_temp.tmp_replay_gap_v10_source_frames;
  drop table if exists pg_temp.tmp_replay_gap_v10_raw_source_riders;
  drop table if exists pg_temp.tmp_replay_gap_v10_source_riders;
  drop table if exists pg_temp.tmp_replay_gap_v10_ordered;
  drop table if exists pg_temp.tmp_replay_gap_v10_safe_riders;
  drop table if exists pg_temp.tmp_replay_gap_v10_frame_leaders;
  drop table if exists pg_temp.tmp_replay_gap_v10_display_groups;
  drop table if exists pg_temp.tmp_replay_gap_v10_numbered_groups;

  create temporary table pg_temp.tmp_replay_gap_v10_source_frames on commit drop as
  select
    f.id,
    f.frame_number::integer as frame_number,
    coalesce(f.race_seconds, 0)::integer as race_seconds,
    greatest(0, least(v_distance_km, coalesce(f.km_marker, 0)::numeric)) as km_marker,
    coalesce(f.group_order, 1)::integer as group_order,
    coalesce(f.group_code, '')::text as group_code,
    coalesce(f.group_label, '')::text as group_label,
    greatest(0, coalesce(f.gap_seconds, 0)::numeric) as gap_seconds,
    greatest(1, coalesce(f.avg_speed_kmh, 38)::numeric) as avg_speed_kmh,
    coalesce(f.rider_ids, array[]::uuid[]) as rider_ids,
    coalesce(f.rider_names, array[]::text[]) as rider_names,
    coalesce(f.team_names, array[]::text[]) as team_names,
    coalesce(f.metadata, '{}'::jsonb) as metadata,
    lower(coalesce(nullif(f.metadata->>'terrain_type', ''), 'flat')) as terrain_type,
    coalesce(
      case when (f.metadata->>'slope_percent') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (f.metadata->>'slope_percent')::numeric end,
      0
    ) as slope_percent
  from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group'
    and array_length(f.rider_ids, 1) is not null
    and array_length(f.rider_ids, 1) > 0
  order by f.frame_number, f.group_order, f.gap_seconds, f.km_marker desc;

  get diagnostics v_source_group_rows = row_count;

  if v_source_group_rows = 0 then
    return jsonb_build_object(
      'status', 'skipped',
      'function', 'race_engine_enforce_replay_rider_gap_continuity_v10',
      'reason', 'no_group_replay_frames_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id
    );
  end if;

  create temporary table pg_temp.tmp_replay_gap_v10_raw_source_riders on commit drop as
  select
    sf.frame_number,
    sf.race_seconds,
    sf.km_marker as raw_group_km_marker,
    sf.group_order as raw_group_order,
    sf.group_code as raw_group_code,
    sf.group_label as raw_group_label,
    sf.gap_seconds as raw_gap_seconds,
    sf.avg_speed_kmh,
    sf.metadata,
    sf.terrain_type,
    sf.slope_percent,
    rider.rider_id::uuid as rider_id,
    rider.rider_ordinal::integer as rider_ordinal,
    coalesce(sf.rider_names[rider.rider_ordinal::integer], 'Rider') as rider_name,
    coalesce(sf.team_names[rider.rider_ordinal::integer], '') as team_name
  from pg_temp.tmp_replay_gap_v10_source_frames sf
  cross join lateral unnest(sf.rider_ids) with ordinality
    as rider(rider_id, rider_ordinal);

  get diagnostics v_raw_source_rider_rows = row_count;

  -- One source row per rider per frame. Prefer smallest displayed gap, then
  -- most advanced km. This protects against duplicate rider entries from older patches.
  create temporary table pg_temp.tmp_replay_gap_v10_source_riders on commit drop as
  select distinct on (raw.frame_number, raw.rider_id)
    raw.*
  from pg_temp.tmp_replay_gap_v10_raw_source_riders raw
  order by
    raw.frame_number,
    raw.rider_id,
    raw.raw_gap_seconds asc,
    raw.raw_group_km_marker desc,
    raw.rider_ordinal asc;

  get diagnostics v_dedup_source_rider_rows = row_count;

  create temporary table pg_temp.tmp_replay_gap_v10_ordered on commit drop as
  select
    src.*,
    row_number() over (
      partition by src.rider_id
      order by src.frame_number
    )::integer as rider_frame_index
  from pg_temp.tmp_replay_gap_v10_source_riders src;

  create index tmp_replay_gap_v10_ordered_idx
    on pg_temp.tmp_replay_gap_v10_ordered(rider_id, rider_frame_index);

  analyze pg_temp.tmp_replay_gap_v10_ordered;

  -- Rider-level continuity. This is the important part:
  -- same rider cannot jump from seconds to minutes, and cannot move backwards.
  create temporary table pg_temp.tmp_replay_gap_v10_safe_riders on commit drop as
  with recursive safe_rows as (
    select
      o.frame_number,
      o.race_seconds,
      o.raw_group_km_marker,
      o.raw_group_order,
      o.raw_group_code,
      o.raw_group_label,
      o.raw_gap_seconds,
      o.avg_speed_kmh,
      o.metadata,
      o.terrain_type,
      o.slope_percent,
      o.rider_id,
      o.rider_ordinal,
      o.rider_name,
      o.team_name,
      o.rider_frame_index,
      o.raw_gap_seconds::numeric as safe_gap_seconds,
      o.raw_group_km_marker::numeric as safe_km_marker
    from pg_temp.tmp_replay_gap_v10_ordered o
    where o.rider_frame_index = 1

    union all

    select
      n.frame_number,
      n.race_seconds,
      n.raw_group_km_marker,
      n.raw_group_order,
      n.raw_group_code,
      n.raw_group_label,
      n.raw_gap_seconds,
      n.avg_speed_kmh,
      n.metadata,
      n.terrain_type,
      n.slope_percent,
      n.rider_id,
      n.rider_ordinal,
      n.rider_name,
      n.team_name,
      n.rider_frame_index,
      case
        when n.raw_gap_seconds > p.safe_gap_seconds then
          least(
            n.raw_gap_seconds,
            p.safe_gap_seconds + p_max_gap_increase_seconds_per_frame
          )
        when n.raw_gap_seconds < p.safe_gap_seconds then
          greatest(
            n.raw_gap_seconds,
            p.safe_gap_seconds - p_max_gap_closure_seconds_per_frame
          )
        else
          n.raw_gap_seconds
      end::numeric as safe_gap_seconds,
      greatest(
        p.safe_km_marker,
        least(
          greatest(0, n.raw_group_km_marker),
          p.safe_km_marker + p_max_forward_km_per_frame
        )
      )::numeric as safe_km_marker
    from safe_rows p
    join pg_temp.tmp_replay_gap_v10_ordered n
      on n.rider_id = p.rider_id
     and n.rider_frame_index = p.rider_frame_index + 1
  )
  select *
  from safe_rows;

  create index tmp_replay_gap_v10_safe_riders_frame_idx
    on pg_temp.tmp_replay_gap_v10_safe_riders(frame_number, safe_gap_seconds, rider_id);

  analyze pg_temp.tmp_replay_gap_v10_safe_riders;

  create temporary table pg_temp.tmp_replay_gap_v10_frame_leaders on commit drop as
  select
    frame_number,
    max(safe_km_marker)::numeric as leader_km_marker,
    max(race_seconds)::integer as race_seconds,
    avg(avg_speed_kmh)::numeric as avg_speed_kmh
  from pg_temp.tmp_replay_gap_v10_safe_riders
  group by frame_number;

  -- Fixed-width gap bins keep group identities stable and avoid chained
  -- 10/15s splits becoming one huge internal group.
  create temporary table pg_temp.tmp_replay_gap_v10_display_groups on commit drop as
  with binned_riders as (
    select
      sr.*,
      greatest(1, floor(greatest(0, sr.safe_gap_seconds) / greatest(p_visible_gap_bin_seconds, 1))::integer + 1) as gap_bin,
      greatest(0, floor(greatest(0, sr.safe_km_marker) / greatest(p_visible_km_bin_width, 0.05))::integer) as km_bin
    from pg_temp.tmp_replay_gap_v10_safe_riders sr
  ),
  group_base as (
    select
      br.frame_number,
      br.gap_bin,
      br.km_bin,
      round(avg(br.safe_gap_seconds))::integer as display_gap_seconds,
      min(br.safe_gap_seconds)::numeric as min_safe_gap_seconds,
      max(br.safe_gap_seconds)::numeric as max_safe_gap_seconds,
      min(br.safe_km_marker)::numeric as min_member_safe_km_marker,
      max(br.safe_km_marker)::numeric as max_member_safe_km_marker,
      count(*)::integer as rider_count,
      array_agg(br.rider_id order by br.safe_gap_seconds, br.safe_km_marker desc, br.rider_ordinal, br.rider_id) as rider_ids,
      array_agg(br.rider_name order by br.safe_gap_seconds, br.safe_km_marker desc, br.rider_ordinal, br.rider_id) as rider_names,
      array_agg(br.team_name order by br.safe_gap_seconds, br.safe_km_marker desc, br.rider_ordinal, br.rider_id) as team_names,
      max(br.race_seconds)::integer as race_seconds,
      avg(br.avg_speed_kmh)::numeric as avg_speed_kmh,
      (array_agg(br.metadata order by br.safe_gap_seconds, br.safe_km_marker desc))[1] as source_metadata,
      (array_agg(br.terrain_type order by br.safe_gap_seconds, br.safe_km_marker desc))[1] as terrain_type,
      (array_agg(br.slope_percent order by br.safe_gap_seconds, br.safe_km_marker desc))[1] as slope_percent
    from binned_riders br
    group by br.frame_number, br.gap_bin, br.km_bin
  ),
  with_leader as (
    select
      gb.*,
      fl.leader_km_marker,
      least(
        v_distance_km,
        greatest(
          0,
          gb.max_member_safe_km_marker
        )
      )::numeric as display_km_marker
    from group_base gb
    join pg_temp.tmp_replay_gap_v10_frame_leaders fl
      on fl.frame_number = gb.frame_number
  ),
  ordered_groups as (
    select
      wl.*,
      row_number() over (
        partition by wl.frame_number
        order by wl.display_gap_seconds asc, wl.display_km_marker desc, wl.gap_bin asc, wl.km_bin desc
      )::integer as group_order
    from with_leader wl
  ),
  peloton_pick as (
    select distinct on (og.frame_number)
      og.frame_number,
      og.group_order as peloton_group_order
    from ordered_groups og
    order by
      og.frame_number,
      og.rider_count desc,
      og.display_gap_seconds asc,
      og.group_order asc
  ),
  numbered as (
    select
      og.*,
      pp.peloton_group_order,
      count(*) filter (where og.group_order < pp.peloton_group_order) over (
        partition by og.frame_number
        order by og.group_order
        rows between unbounded preceding and current row
      )::integer as ahead_number,
      count(*) filter (where og.group_order > pp.peloton_group_order) over (
        partition by og.frame_number
        order by og.group_order
        rows between unbounded preceding and current row
      )::integer as behind_number
    from ordered_groups og
    join peloton_pick pp
      on pp.frame_number = og.frame_number
  )
  select
    n.*,
    case
      when n.group_order = n.peloton_group_order then 'main_peloton'
      when n.group_order < n.peloton_group_order and n.ahead_number = 1 then 'front_group'
      when n.group_order < n.peloton_group_order then 'chase_group_' || lpad(n.ahead_number::text, 2, '0')
      when n.behind_number = 1 then 'dropped_group'
      else 'outside_group_' || lpad((n.behind_number - 1)::text, 2, '0')
    end as display_group_code,
    case
      when n.group_order = n.peloton_group_order then 'Peloton'
      when n.group_order < n.peloton_group_order and n.ahead_number = 1 then 'Front group'
      when n.group_order < n.peloton_group_order then 'Chasing group ' || n.ahead_number::text
      when n.behind_number = 1 then 'Dropped group'
      else 'Outside group ' || (n.behind_number - 1)::text
    end as display_group_label
  from numbered n;

  get diagnostics v_display_group_rows = row_count;

  -- Replace current group rows with v10 rebuilt display rows. This avoids being
  -- limited by the number of old display slots.
  delete from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group';

  get diagnostics v_deleted_group_rows = row_count;

  insert into public.race_stage_replay_frames (
    simulation_run_id,
    race_id,
    stage_id,
    frame_number,
    race_seconds,
    km_marker,
    group_code,
    group_label,
    group_order,
    gap_seconds,
    avg_speed_kmh,
    rider_ids,
    rider_names,
    team_names,
    entity_type,
    metadata
  )
  select
    p_simulation_run_id,
    v_race_id,
    v_stage_id,
    dg.frame_number,
    dg.race_seconds,
    greatest(0, least(v_distance_km, dg.display_km_marker)) as km_marker,
    dg.display_group_code,
    dg.display_group_label,
    dg.group_order,
    greatest(0, dg.display_gap_seconds),
    greatest(1, coalesce(dg.avg_speed_kmh, 38)),
    dg.rider_ids,
    dg.rider_names,
    dg.team_names,
    'group',
    (
      coalesce(dg.source_metadata, '{}'::jsonb)
      - 'rider_energy_v1'
      - 'stage_live_energy_smooth_v8'
      - 'stage_live_energy_smooth_v10'
      - 'stage_live_energy_smooth_v10'
      - 'stage_live_energy_smooth_v11'
      - 'stage_live_energy_smooth_v12'
      - 'average_live_energy_pct'
      - 'minimum_live_energy_pct'
      - 'maximum_live_energy_pct'
      - 'average_pre_stage_freshness_pct'
      - 'minimum_pre_stage_freshness_pct'
      - 'maximum_pre_stage_freshness_pct'
    ) || jsonb_build_object(
      'source', 'race_engine_replay_v10_binned_rider_gap_km_continuity',
      'gap_rider_continuity_v10', true,
      'gap_rider_continuity_v10_at', now(),
      'v10_gap_bin_seconds', p_visible_gap_bin_seconds,
      'v10_km_bin_width', p_visible_km_bin_width,
      'v10_km_bin', dg.km_bin,
      'v10_group_gap_span_seconds', round((dg.max_safe_gap_seconds - dg.min_safe_gap_seconds)::numeric, 2),
      'v10_min_member_safe_gap_seconds', round(dg.min_safe_gap_seconds::numeric, 2),
      'v10_max_member_safe_gap_seconds', round(dg.max_safe_gap_seconds::numeric, 2),
      'v10_min_member_safe_km_marker', round(dg.min_member_safe_km_marker::numeric, 3),
      'v10_max_member_safe_km_marker', round(dg.max_member_safe_km_marker::numeric, 3),
      'v10_leader_km_marker', round(dg.leader_km_marker::numeric, 3),
      'v10_peloton_group_order', dg.peloton_group_order,
      'v10_max_gap_increase_seconds_per_frame', p_max_gap_increase_seconds_per_frame,
      'v10_max_gap_closure_seconds_per_frame', p_max_gap_closure_seconds_per_frame,
      'v10_max_forward_km_per_frame', p_max_forward_km_per_frame,
      'terrain_type', dg.terrain_type,
      'slope_percent', dg.slope_percent
    ) as metadata
  from pg_temp.tmp_replay_gap_v10_display_groups dg
  order by dg.frame_number, dg.group_order;

  get diagnostics v_inserted_group_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_enforce_replay_rider_gap_continuity_v10',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'distance_km', v_distance_km,
    'source_group_rows', v_source_group_rows,
    'raw_source_rider_rows', v_raw_source_rider_rows,
    'dedup_source_rider_rows', v_dedup_source_rider_rows,
    'display_group_rows', v_display_group_rows,
    'deleted_group_rows', v_deleted_group_rows,
    'inserted_group_rows', v_inserted_group_rows,
    'max_gap_increase_seconds_per_frame', p_max_gap_increase_seconds_per_frame,
    'max_gap_closure_seconds_per_frame', p_max_gap_closure_seconds_per_frame,
    'visible_gap_bin_seconds', p_visible_gap_bin_seconds,
    'visible_km_bin_width', p_visible_km_bin_width,
    'km_per_gap_second', p_km_per_gap_second,
    'max_forward_km_per_frame', p_max_forward_km_per_frame
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.restart_cleanup_finance_overview_summary_v1(p_user_id uuid, p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_safe_summary jsonb;
begin
  if p_user_id is null then
    raise exception 'User id is required for finance overview cleanup.';
  end if;

  if p_club_id is null then
    raise exception 'Club id is required for finance overview cleanup.';
  end if;

  if not exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
      and c.owner_user_id = p_user_id
      and coalesce(c.club_type::text, 'main') = 'main'
  ) then
    raise exception 'You can only clean finance overview for your own main club.';
  end if;

  /*
    Do NOT update public.club_finance_summary here.
    It is guarded and ledger-managed.
    The frontend must use finance_get_restart_safe_overview_summary_v1 instead.
  */
  v_safe_summary := public.finance_get_restart_safe_overview_summary_v1(p_club_id);

  update public.club_restart_history h
  set reset_summary =
    coalesce(h.reset_summary, '{}'::jsonb) ||
    jsonb_build_object(
      'finance_overview_summary_cleanup_result',
      jsonb_build_object(
        'status', 'completed',
        'club_id', p_club_id,
        'write_mode', 'no_direct_summary_write',
        'reason', 'club_finance_summary is ledger-managed and guarded',
        'safe_summary', v_safe_summary
      )
    )
  where h.id = (
    select h2.id
    from public.club_restart_history h2
    where h2.club_id = p_club_id
    order by h2.created_at desc
    limit 1
  );

  return jsonb_build_object(
    'status', 'completed',
    'club_id', p_club_id,
    'write_mode', 'no_direct_summary_write',
    'safe_summary', v_safe_summary,
    'note', 'Finance overview cleanup is now read-side safe. Frontend must read restart-safe RPC instead of stale club_finance_summary weekly fields.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_get_restart_safe_overview_summary_v1(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_restart_at timestamptz;
  v_cash_balance numeric:=0;
  v_weekly_income numeric:=0;
  v_weekly_expenses numeric:=0;
begin
  v_user_id:=auth.uid();
  if p_club_id is null then raise exception 'Club id is required.'; end if;
  if v_user_id is not null and not exists(
    select 1 from public.clubs c where c.id=p_club_id and c.owner_user_id=v_user_id and coalesce(c.club_type::text,'main')='main'
  ) then raise exception 'You can only view finance overview for your own main club.'; end if;

  select max(h.created_at) into v_restart_at from public.club_restart_history h where h.club_id=p_club_id;
  select coalesce(c.cash_balance,0) into v_cash_balance from public.clubs c where c.id=p_club_id;

  with club_transaction_net as (
    select t.id transaction_id,t.created_at,sum(e.amount)::numeric net_amount
    from finance.transactions t
    join finance.entries e on e.transaction_id=t.id
    join finance.accounts a on a.id=e.account_id
    left join finance.transaction_types tt on tt.code=t.type
    where a.club_id=p_club_id and a.currency='CASH' and a.kind='main'
      and coalesce(tt.is_user_visible,true)=true
      and not exists(select 1 from finance.transaction_voids tv where tv.source_transaction_id=t.id)
      and t.created_at>coalesce(v_restart_at,'-infinity'::timestamptz)
      and t.created_at>=now()-interval '7 days'
    group by t.id,t.created_at
  )
  select coalesce(sum(greatest(net_amount,0)),0),coalesce(sum(greatest(-net_amount,0)),0)
  into v_weekly_income,v_weekly_expenses
  from club_transaction_net;

  return jsonb_build_object(
    'club_id',p_club_id,'current_balance',v_cash_balance,
    'weekly_income',v_weekly_income,'weekly_expenses',v_weekly_expenses,
    'wage_total',0,'updated_at',now(),'restart_boundary',v_restart_at,
    'source','restart_safe_ledger_view'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_enforce_replay_rider_gap_continuity_v11(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid, p_max_gap_increase_seconds_per_frame numeric DEFAULT 24, p_max_gap_closure_seconds_per_frame numeric DEFAULT 18, p_visible_gap_bin_seconds numeric DEFAULT 30, p_visible_km_bin_width numeric DEFAULT 0.10, p_km_per_gap_second numeric DEFAULT 0.012, p_max_forward_km_per_frame numeric DEFAULT 0.85)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_stage_id uuid;
  v_race_id uuid;
  v_distance_km numeric := 1;
  v_source_group_rows integer := 0;
  v_raw_source_rider_rows integer := 0;
  v_dedup_source_rider_rows integer := 0;
  v_display_group_rows integer := 0;
  v_deleted_group_rows integer := 0;
  v_inserted_group_rows integer := 0;
begin
  select
    sr.stage_id,
    sr.race_id
  into
    v_stage_id,
    v_race_id
  from public.race_stage_simulation_runs sr
  where sr.id = p_simulation_run_id
  limit 1;

  v_stage_id := coalesce(p_stage_id, v_stage_id);

  if v_stage_id is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'simulation_run_or_stage_not_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', p_stage_id
    );
  end if;

  select greatest(
    1,
    coalesce(
      max(rs.distance_km),
      max(rf.km_marker),
      1
    )
  )
  into v_distance_km
  from public.race_stages rs
  left join public.race_stage_replay_frames rf
    on rf.stage_id = rs.id
   and rf.simulation_run_id = p_simulation_run_id
  where rs.id = v_stage_id;

  drop table if exists pg_temp.tmp_replay_gap_v11_source_frames;
  drop table if exists pg_temp.tmp_replay_gap_v11_raw_source_riders;
  drop table if exists pg_temp.tmp_replay_gap_v11_source_riders;
  drop table if exists pg_temp.tmp_replay_gap_v11_ordered;
  drop table if exists pg_temp.tmp_replay_gap_v11_safe_riders;
  drop table if exists pg_temp.tmp_replay_gap_v11_frame_leaders;
  drop table if exists pg_temp.tmp_replay_gap_v11_display_groups;
  drop table if exists pg_temp.tmp_replay_gap_v11_numbered_groups;

  create temporary table pg_temp.tmp_replay_gap_v11_source_frames on commit drop as
  select
    f.id,
    f.frame_number::integer as frame_number,
    coalesce(f.race_seconds, 0)::integer as race_seconds,
    greatest(0, least(v_distance_km, coalesce(f.km_marker, 0)::numeric)) as km_marker,
    coalesce(f.group_order, 1)::integer as group_order,
    coalesce(f.group_code, '')::text as group_code,
    coalesce(f.group_label, '')::text as group_label,
    greatest(0, coalesce(f.gap_seconds, 0)::numeric) as gap_seconds,
    greatest(1, coalesce(f.avg_speed_kmh, 38)::numeric) as avg_speed_kmh,
    coalesce(f.rider_ids, array[]::uuid[]) as rider_ids,
    coalesce(f.rider_names, array[]::text[]) as rider_names,
    coalesce(f.team_names, array[]::text[]) as team_names,
    coalesce(f.metadata, '{}'::jsonb) as metadata,
    lower(coalesce(nullif(f.metadata->>'terrain_type', ''), 'flat')) as terrain_type,
    coalesce(
      case when (f.metadata->>'slope_percent') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (f.metadata->>'slope_percent')::numeric end,
      0
    ) as slope_percent
  from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group'
    and array_length(f.rider_ids, 1) is not null
    and array_length(f.rider_ids, 1) > 0
  order by f.frame_number, f.group_order, f.gap_seconds, f.km_marker desc;

  get diagnostics v_source_group_rows = row_count;

  if v_source_group_rows = 0 then
    return jsonb_build_object(
      'status', 'skipped',
      'function', 'race_engine_enforce_replay_rider_gap_continuity_v11',
      'reason', 'no_group_replay_frames_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id
    );
  end if;

  create temporary table pg_temp.tmp_replay_gap_v11_raw_source_riders on commit drop as
  select
    sf.frame_number,
    sf.race_seconds,
    sf.km_marker as raw_group_km_marker,
    sf.group_order as raw_group_order,
    sf.group_code as raw_group_code,
    sf.group_label as raw_group_label,
    sf.gap_seconds as raw_gap_seconds,
    sf.avg_speed_kmh,
    sf.metadata,
    sf.terrain_type,
    sf.slope_percent,
    rider.rider_id::uuid as rider_id,
    rider.rider_ordinal::integer as rider_ordinal,
    coalesce(sf.rider_names[rider.rider_ordinal::integer], 'Rider') as rider_name,
    coalesce(sf.team_names[rider.rider_ordinal::integer], '') as team_name
  from pg_temp.tmp_replay_gap_v11_source_frames sf
  cross join lateral unnest(sf.rider_ids) with ordinality
    as rider(rider_id, rider_ordinal);

  get diagnostics v_raw_source_rider_rows = row_count;

  -- One source row per rider per frame. Prefer smallest displayed gap, then
  -- most advanced km. This protects against duplicate rider entries from older patches.
  create temporary table pg_temp.tmp_replay_gap_v11_source_riders on commit drop as
  select distinct on (raw.frame_number, raw.rider_id)
    raw.*
  from pg_temp.tmp_replay_gap_v11_raw_source_riders raw
  order by
    raw.frame_number,
    raw.rider_id,
    raw.raw_gap_seconds asc,
    raw.raw_group_km_marker desc,
    raw.rider_ordinal asc;

  get diagnostics v_dedup_source_rider_rows = row_count;

  create temporary table pg_temp.tmp_replay_gap_v11_ordered on commit drop as
  select
    src.*,
    row_number() over (
      partition by src.rider_id
      order by src.frame_number
    )::integer as rider_frame_index
  from pg_temp.tmp_replay_gap_v11_source_riders src;

  create index tmp_replay_gap_v11_ordered_idx
    on pg_temp.tmp_replay_gap_v11_ordered(rider_id, rider_frame_index);

  analyze pg_temp.tmp_replay_gap_v11_ordered;

  -- Rider-level continuity. This is the important part:
  -- same rider cannot jump from seconds to minutes, and cannot move backwards.
  create temporary table pg_temp.tmp_replay_gap_v11_safe_riders on commit drop as
  with recursive safe_rows as (
    select
      o.frame_number,
      o.race_seconds,
      o.raw_group_km_marker,
      o.raw_group_order,
      o.raw_group_code,
      o.raw_group_label,
      o.raw_gap_seconds,
      o.avg_speed_kmh,
      o.metadata,
      o.terrain_type,
      o.slope_percent,
      o.rider_id,
      o.rider_ordinal,
      o.rider_name,
      o.team_name,
      o.rider_frame_index,
      o.raw_gap_seconds::numeric as safe_gap_seconds,
      o.raw_group_km_marker::numeric as safe_km_marker
    from pg_temp.tmp_replay_gap_v11_ordered o
    where o.rider_frame_index = 1

    union all

    select
      n.frame_number,
      n.race_seconds,
      n.raw_group_km_marker,
      n.raw_group_order,
      n.raw_group_code,
      n.raw_group_label,
      n.raw_gap_seconds,
      n.avg_speed_kmh,
      n.metadata,
      n.terrain_type,
      n.slope_percent,
      n.rider_id,
      n.rider_ordinal,
      n.rider_name,
      n.team_name,
      n.rider_frame_index,
      case
        when n.raw_gap_seconds > p.safe_gap_seconds then
          least(
            n.raw_gap_seconds,
            p.safe_gap_seconds + p_max_gap_increase_seconds_per_frame
          )
        when n.raw_gap_seconds < p.safe_gap_seconds then
          greatest(
            n.raw_gap_seconds,
            p.safe_gap_seconds - p_max_gap_closure_seconds_per_frame
          )
        else
          n.raw_gap_seconds
      end::numeric as safe_gap_seconds,
      greatest(
        p.safe_km_marker,
        least(
          greatest(0, n.raw_group_km_marker),
          p.safe_km_marker + p_max_forward_km_per_frame
        )
      )::numeric as safe_km_marker
    from safe_rows p
    join pg_temp.tmp_replay_gap_v11_ordered n
      on n.rider_id = p.rider_id
     and n.rider_frame_index = p.rider_frame_index + 1
  )
  select *
  from safe_rows;

  create index tmp_replay_gap_v11_safe_riders_frame_idx
    on pg_temp.tmp_replay_gap_v11_safe_riders(frame_number, safe_gap_seconds, rider_id);

  analyze pg_temp.tmp_replay_gap_v11_safe_riders;

  create temporary table pg_temp.tmp_replay_gap_v11_frame_leaders on commit drop as
  select
    frame_number,
    max(safe_km_marker)::numeric as leader_km_marker,
    max(race_seconds)::integer as race_seconds,
    avg(avg_speed_kmh)::numeric as avg_speed_kmh
  from pg_temp.tmp_replay_gap_v11_safe_riders
  group by frame_number;

  -- Fixed-width gap bins keep groups readable. V11 then adds Peloton
  -- lineage, so Peloton is not chosen independently in every frame.
  create temporary table pg_temp.tmp_replay_gap_v11_display_groups on commit drop as
  with recursive binned_riders as (
    select
      sr.*,
      greatest(1, floor(greatest(0, sr.safe_gap_seconds) / greatest(p_visible_gap_bin_seconds, 1))::integer + 1) as gap_bin,
      greatest(0, floor(greatest(0, sr.safe_km_marker) / greatest(p_visible_km_bin_width, 0.05))::integer) as km_bin
    from pg_temp.tmp_replay_gap_v11_safe_riders sr
  ),
  group_base as (
    select
      br.frame_number,
      br.gap_bin,
      br.km_bin,
      round(avg(br.safe_gap_seconds))::integer as display_gap_seconds,
      min(br.safe_gap_seconds)::numeric as min_safe_gap_seconds,
      max(br.safe_gap_seconds)::numeric as max_safe_gap_seconds,
      min(br.safe_km_marker)::numeric as min_member_safe_km_marker,
      max(br.safe_km_marker)::numeric as max_member_safe_km_marker,
      count(*)::integer as rider_count,
      array_agg(br.rider_id order by br.safe_gap_seconds, br.safe_km_marker desc, br.rider_ordinal, br.rider_id) as rider_ids,
      array_agg(br.rider_name order by br.safe_gap_seconds, br.safe_km_marker desc, br.rider_ordinal, br.rider_id) as rider_names,
      array_agg(br.team_name order by br.safe_gap_seconds, br.safe_km_marker desc, br.rider_ordinal, br.rider_id) as team_names,
      max(br.race_seconds)::integer as race_seconds,
      avg(br.avg_speed_kmh)::numeric as avg_speed_kmh,
      (array_agg(br.metadata order by br.safe_gap_seconds, br.safe_km_marker desc))[1] as source_metadata,
      (array_agg(br.terrain_type order by br.safe_gap_seconds, br.safe_km_marker desc))[1] as terrain_type,
      (array_agg(br.slope_percent order by br.safe_gap_seconds, br.safe_km_marker desc))[1] as slope_percent
    from binned_riders br
    group by br.frame_number, br.gap_bin, br.km_bin
  ),
  with_leader as (
    select
      gb.*,
      fl.leader_km_marker,
      least(
        v_distance_km,
        greatest(
          0,
          gb.max_member_safe_km_marker
        )
      )::numeric as display_km_marker
    from group_base gb
    join pg_temp.tmp_replay_gap_v11_frame_leaders fl
      on fl.frame_number = gb.frame_number
  ),
  ordered_groups as (
    select
      wl.*,
      row_number() over (
        partition by wl.frame_number
        order by wl.display_gap_seconds asc, wl.display_km_marker desc, wl.gap_bin asc, wl.km_bin desc
      )::integer as group_order
    from with_leader wl
  ),
  frame_index as (
    select
      frame_number,
      row_number() over (order by frame_number)::integer as frame_idx
    from (
      select distinct frame_number
      from ordered_groups
    ) f
  ),
  peloton_pick as (
    -- First replay frame: choose the largest group as the Peloton seed.
    -- This matches the cycling logic: the peloton starts as the main pack.
    select
      seed.frame_idx,
      seed.frame_number,
      seed.group_order as peloton_group_order,
      seed.rider_ids as peloton_rider_ids,
      seed.display_gap_seconds as peloton_gap_seconds,
      seed.rider_count as peloton_rider_count,
      seed.rider_count::integer as peloton_overlap_count,
      true as peloton_seed_frame
    from (
      select
        fi.frame_idx,
        og.*,
        row_number() over (
          order by
            og.rider_count desc,
            og.display_gap_seconds asc,
            og.display_km_marker desc,
            og.group_order asc
        ) as seed_rank
      from frame_index fi
      join ordered_groups og
        on og.frame_number = fi.frame_number
      where fi.frame_idx = 1
    ) seed
    where seed.seed_rank = 1

    union all

    -- Next frames: follow the previous Peloton by rider overlap.
    -- This prevents frame-by-frame Peloton switching between G/B groups.
    select
      fi.frame_idx,
      picked.frame_number,
      picked.group_order as peloton_group_order,
      picked.rider_ids as peloton_rider_ids,
      picked.display_gap_seconds as peloton_gap_seconds,
      picked.rider_count as peloton_rider_count,
      picked.peloton_overlap_count,
      false as peloton_seed_frame
    from peloton_pick previous
    join frame_index fi
      on fi.frame_idx = previous.frame_idx + 1
    join lateral (
      select
        og.*,
        coalesce(
          (
            select count(*)::integer
            from unnest(og.rider_ids) current_rider(rider_id)
            join unnest(previous.peloton_rider_ids) previous_rider(rider_id)
              on previous_rider.rider_id = current_rider.rider_id
          ),
          0
        ) as peloton_overlap_count
      from ordered_groups og
      where og.frame_number = fi.frame_number
      order by
        -- Main rule: preserve Peloton lineage by overlap with previous Peloton.
        peloton_overlap_count desc,
        -- Hysteresis: avoid selecting a group with a very different gap unless
        -- overlap clearly forces it.
        abs(og.display_gap_seconds - previous.peloton_gap_seconds) asc,
        og.rider_count desc,
        og.display_gap_seconds asc,
        og.display_km_marker desc,
        og.group_order asc
      limit 1
    ) picked on true
  ),
  numbered as (
    select
      og.*,
      pp.peloton_group_order,
      pp.peloton_gap_seconds,
      pp.peloton_rider_count,
      pp.peloton_overlap_count,
      pp.peloton_seed_frame,
      count(*) filter (where og.group_order < pp.peloton_group_order) over (
        partition by og.frame_number
        order by og.group_order
        rows between unbounded preceding and current row
      )::integer as ahead_number,
      count(*) filter (where og.group_order > pp.peloton_group_order) over (
        partition by og.frame_number
        order by og.group_order
        rows between unbounded preceding and current row
      )::integer as behind_number
    from ordered_groups og
    join peloton_pick pp
      on pp.frame_number = og.frame_number
  )
  select
    n.*,
    case
      when n.group_order = n.peloton_group_order then 'main_peloton'
      when n.group_order < n.peloton_group_order and n.ahead_number = 1 then 'front_group'
      when n.group_order < n.peloton_group_order then 'chase_group_' || lpad(n.ahead_number::text, 2, '0')
      when n.behind_number = 1 then 'dropped_group'
      else 'outside_group_' || lpad((n.behind_number - 1)::text, 2, '0')
    end as display_group_code,
    case
      when n.group_order = n.peloton_group_order then 'Peloton'
      when n.group_order < n.peloton_group_order and n.ahead_number = 1 then 'Front group'
      when n.group_order < n.peloton_group_order then 'Chasing group ' || n.ahead_number::text
      when n.behind_number = 1 then 'Dropped group'
      else 'Outside group ' || (n.behind_number - 1)::text
    end as display_group_label
  from numbered n;

  get diagnostics v_display_group_rows = row_count;

  -- Replace current group rows with v11 rebuilt display rows. This avoids being
  -- limited by the number of old display slots.
  delete from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group';

  get diagnostics v_deleted_group_rows = row_count;

  insert into public.race_stage_replay_frames (
    simulation_run_id,
    race_id,
    stage_id,
    frame_number,
    race_seconds,
    km_marker,
    group_code,
    group_label,
    group_order,
    gap_seconds,
    avg_speed_kmh,
    rider_ids,
    rider_names,
    team_names,
    entity_type,
    metadata
  )
  select
    p_simulation_run_id,
    v_race_id,
    v_stage_id,
    dg.frame_number,
    dg.race_seconds,
    greatest(0, least(v_distance_km, dg.display_km_marker)) as km_marker,
    dg.display_group_code,
    dg.display_group_label,
    dg.group_order,
    greatest(0, dg.display_gap_seconds),
    greatest(1, coalesce(dg.avg_speed_kmh, 38)),
    dg.rider_ids,
    dg.rider_names,
    dg.team_names,
    'group',
    (
      coalesce(dg.source_metadata, '{}'::jsonb)
      - 'rider_energy_v1'
      - 'stage_live_energy_smooth_v8'
      - 'stage_live_energy_smooth_v11'
      - 'stage_live_energy_smooth_v11'
      - 'stage_live_energy_smooth_v11'
      - 'stage_live_energy_smooth_v12'
      - 'average_live_energy_pct'
      - 'minimum_live_energy_pct'
      - 'maximum_live_energy_pct'
      - 'average_pre_stage_freshness_pct'
      - 'minimum_pre_stage_freshness_pct'
      - 'maximum_pre_stage_freshness_pct'
    ) || jsonb_build_object(
      'source', 'race_engine_replay_v11_binned_rider_gap_km_continuity',
      'gap_rider_continuity_v11', true,
      'gap_rider_continuity_v11_at', now(),
      'v11_gap_bin_seconds', p_visible_gap_bin_seconds,
      'v11_km_bin_width', p_visible_km_bin_width,
      'v11_km_bin', dg.km_bin,
      'v11_group_gap_span_seconds', round((dg.max_safe_gap_seconds - dg.min_safe_gap_seconds)::numeric, 2),
      'v11_min_member_safe_gap_seconds', round(dg.min_safe_gap_seconds::numeric, 2),
      'v11_max_member_safe_gap_seconds', round(dg.max_safe_gap_seconds::numeric, 2),
      'v11_min_member_safe_km_marker', round(dg.min_member_safe_km_marker::numeric, 3),
      'v11_max_member_safe_km_marker', round(dg.max_member_safe_km_marker::numeric, 3),
      'v11_leader_km_marker', round(dg.leader_km_marker::numeric, 3),
      'v11_peloton_group_order', dg.peloton_group_order,
      'v11_peloton_overlap_count', coalesce(dg.peloton_overlap_count, 0),
      'v11_peloton_seed_frame', coalesce(dg.peloton_seed_frame, false),
      'v11_max_gap_increase_seconds_per_frame', p_max_gap_increase_seconds_per_frame,
      'v11_max_gap_closure_seconds_per_frame', p_max_gap_closure_seconds_per_frame,
      'v11_max_forward_km_per_frame', p_max_forward_km_per_frame,
      'terrain_type', dg.terrain_type,
      'slope_percent', dg.slope_percent
    ) as metadata
  from pg_temp.tmp_replay_gap_v11_display_groups dg
  order by dg.frame_number, dg.group_order;

  get diagnostics v_inserted_group_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_enforce_replay_rider_gap_continuity_v11',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'distance_km', v_distance_km,
    'source_group_rows', v_source_group_rows,
    'raw_source_rider_rows', v_raw_source_rider_rows,
    'dedup_source_rider_rows', v_dedup_source_rider_rows,
    'display_group_rows', v_display_group_rows,
    'deleted_group_rows', v_deleted_group_rows,
    'inserted_group_rows', v_inserted_group_rows,
    'max_gap_increase_seconds_per_frame', p_max_gap_increase_seconds_per_frame,
    'max_gap_closure_seconds_per_frame', p_max_gap_closure_seconds_per_frame,
    'visible_gap_bin_seconds', p_visible_gap_bin_seconds,
    'visible_km_bin_width', p_visible_km_bin_width,
    'km_per_gap_second', p_km_per_gap_second,
    'max_forward_km_per_frame', p_max_forward_km_per_frame
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_rider_current_club_for_morale_notification_v1(p_rider_id uuid, p_rider_row jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club_id uuid;
begin
  if coalesce(p_rider_row->>'club_id', '') ~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return (p_rider_row->>'club_id')::uuid;
  end if;

  select cr.club_id
  into v_club_id
  from public.club_riders cr
  join public.clubs c
    on c.id = cr.club_id
  where cr.rider_id = p_rider_id
    and c.owner_user_id is not null
    and coalesce(c.is_ai, false) = false
  order by cr.created_at desc nulls last
  limit 1;

  return v_club_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_rider_negative_morale_state_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rider_row jsonb;
  v_club_id uuid;
  v_owner_user_id uuid;
  v_rider_name text;
  v_first_name text;
  v_last_name text;
  v_action_url text;
  v_event_date text;
  v_morale_threshold integer := 39;
  v_more_selection_event boolean;
  v_unhappy_event boolean;
  v_release_event boolean;
begin
  v_more_selection_event :=
    coalesce(old.asked_for_more_selection, false) = false
    and coalesce(new.asked_for_more_selection, false) = true;

  v_unhappy_event :=
    (
      coalesce(old.morale, 50) > v_morale_threshold
      and coalesce(new.morale, 50) <= v_morale_threshold
    )
    or (
      old.low_morale_since is null
      and new.low_morale_since is not null
    );

  v_release_event :=
    coalesce(old.release_requested, false) = false
    and coalesce(new.release_requested, false) = true;

  if not (v_more_selection_event or v_unhappy_event or v_release_event) then
    return new;
  end if;

  v_rider_row := to_jsonb(new);

  v_club_id := public.resolve_rider_current_club_for_morale_notification_v1(
    new.id,
    v_rider_row
  );

  if v_club_id is null then
    return new;
  end if;

  select coalesce(c.owner_user_id, parent.owner_user_id)
  into v_owner_user_id
  from public.clubs c
  left join public.clubs parent
    on parent.id = c.parent_club_id
  where c.id = v_club_id
    and coalesce(c.is_ai, false) = false;

  if v_owner_user_id is null then
    return new;
  end if;

  v_first_name := coalesce(
    nullif(v_rider_row->>'first_name', ''),
    nullif(v_rider_row->>'firstname', ''),
    nullif(v_rider_row->>'given_name', '')
  );

  v_last_name := coalesce(
    nullif(v_rider_row->>'last_name', ''),
    nullif(v_rider_row->>'lastname', ''),
    nullif(v_rider_row->>'family_name', '')
  );

  v_rider_name := nullif(
    trim(coalesce(v_first_name, '') || ' ' || coalesce(v_last_name, '')),
    ''
  );

  v_rider_name := coalesce(
    v_rider_name,
    nullif(v_rider_row->>'full_name', ''),
    nullif(v_rider_row->>'display_name', ''),
    nullif(v_rider_row->>'name', ''),
    'A rider'
  );

  v_action_url := '/dashboard/my-riders/' || new.id::text;
  v_event_date := coalesce(new.morale_updated_on::text, current_date::text);

  if v_more_selection_event then
    if not exists (
      select 1
      from public.notifications n
      join public.notification_types nt
        on nt.id = n.type_id
      where nt.code = 'RIDER_WANTS_MORE_RACE_SELECTION'
        and n.payload_json->>'event_key' =
          'rider_morale:more_selection:' || new.id::text || ':' || v_event_date
    ) then
      perform public.create_infrastructure_notification(
        v_owner_user_id,
        'RIDER_WANTS_MORE_RACE_SELECTION',
        'Rider wants more race selection',
        v_rider_name || ' wants to be selected for more races. If this does not improve, he may ask to leave the team and terminate his contract.',
        v_action_url,
        jsonb_build_object(
          'event_key', 'rider_morale:more_selection:' || new.id::text || ':' || v_event_date,
          'rider_id', new.id,
          'rider_name', v_rider_name,
          'club_id', v_club_id,
          'morale', new.morale,
          'morale_updated_on', new.morale_updated_on,
          'low_morale_since', new.low_morale_since,
          'asked_for_more_selection', new.asked_for_more_selection,
          'release_requested', new.release_requested,
          'reason', 'race_selection',
          'action_url', v_action_url
        )
      );
    end if;
  end if;

  if v_unhappy_event then
    if not exists (
      select 1
      from public.notifications n
      join public.notification_types nt
        on nt.id = n.type_id
      where nt.code = 'RIDER_UNHAPPY'
        and n.payload_json->>'event_key' =
          'rider_morale:unhappy:' || new.id::text || ':' || v_event_date
    ) then
      perform public.create_infrastructure_notification(
        v_owner_user_id,
        'RIDER_UNHAPPY',
        'Rider morale is low',
        v_rider_name || ' is unhappy. Review his morale and team situation.',
        v_action_url,
        jsonb_build_object(
          'event_key', 'rider_morale:unhappy:' || new.id::text || ':' || v_event_date,
          'rider_id', new.id,
          'rider_name', v_rider_name,
          'club_id', v_club_id,
          'morale', new.morale,
          'morale_threshold', v_morale_threshold,
          'morale_updated_on', new.morale_updated_on,
          'low_morale_since', new.low_morale_since,
          'asked_for_more_selection', new.asked_for_more_selection,
          'release_requested', new.release_requested,
          'reason', 'low_morale',
          'action_url', v_action_url
        )
      );
    end if;
  end if;

  if v_release_event then
    if not exists (
      select 1
      from public.notifications n
      join public.notification_types nt
        on nt.id = n.type_id
      where nt.code = 'RIDER_REQUESTS_RELEASE'
        and n.payload_json->>'event_key' =
          'rider_morale:release_requested:' || new.id::text || ':' || v_event_date
    ) then
      perform public.create_infrastructure_notification(
        v_owner_user_id,
        'RIDER_REQUESTS_RELEASE',
        'Rider requests release',
        v_rider_name || ' is very unhappy and has requested to leave the team.',
        v_action_url,
        jsonb_build_object(
          'event_key', 'rider_morale:release_requested:' || new.id::text || ':' || v_event_date,
          'rider_id', new.id,
          'rider_name', v_rider_name,
          'club_id', v_club_id,
          'morale', new.morale,
          'morale_updated_on', new.morale_updated_on,
          'low_morale_since', new.low_morale_since,
          'asked_for_more_selection', new.asked_for_more_selection,
          'release_requested', new.release_requested,
          'reason', 'release_requested',
          'action_url', v_action_url
        )
      );
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_rider_daily_selection_morale_v1(p_game_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game_date date;
  v_activity_date_column text;
  v_participation_predicate text;
  v_sql text;

  v_processed_count integer := 0;
  v_recent_participation_count integer := 0;
  v_no_recent_participation_count integer := 0;
  v_low_morale_count integer := 0;
  v_more_selection_count integer := 0;
  v_release_requested_count integer := 0;
begin
  v_game_date := coalesce(
    p_game_date,
    public.get_current_game_date_date(),
    current_date
  );

  if to_regclass('public.rider_daily_activity') is null then
    raise exception 'Missing table public.rider_daily_activity. Morale processor needs daily rider activity.';
  end if;

  select c.column_name
  into v_activity_date_column
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'rider_daily_activity'
    and c.column_name in (
      'game_date',
      'activity_date',
      'activity_on',
      'date'
    )
  order by case c.column_name
    when 'game_date' then 1
    when 'activity_date' then 2
    when 'activity_on' then 3
    when 'date' then 4
    else 99
  end
  limit 1;

  if v_activity_date_column is null then
    raise exception 'Could not find date column on public.rider_daily_activity.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rider_daily_activity'
      and column_name = 'participated'
  ) then
    v_participation_predicate := 'coalesce(rda.participated, false) = true';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rider_daily_activity'
      and column_name = 'activity_type'
  ) then
    v_participation_predicate :=
      'lower(coalesce(rda.activity_type, '''')) in (''race'', ''stage'', ''race_stage'', ''participation'')';
  else
    raise exception 'Could not find participated/activity_type column on public.rider_daily_activity.';
  end if;

  v_sql := format(
    $sql$
    with candidates as (
      select
        r.id as rider_id,
        r.morale as old_morale,
        r.morale_updated_on,
        r.low_morale_since,
        r.very_low_morale_since,
        r.asked_for_more_selection,
        r.release_requested,
        public.resolve_rider_current_club_for_morale_notification_v1(
          r.id,
          to_jsonb(r)
        ) as club_id
      from public.riders r
      where coalesce(r.morale_updated_on, date '1900-01-01') < $1
    ),
    eligible as (
      select
        c.*,
        exists (
          select 1
          from public.rider_daily_activity rda
          where rda.rider_id = c.rider_id
            and rda.%I between ($1 - 2) and $1
            and %s
        ) as participated_recently
      from candidates c
      join public.clubs club
        on club.id = c.club_id
      left join public.clubs parent
        on parent.id = club.parent_club_id
      where coalesce(club.is_ai, false) = false
        and coalesce(club.deleted_at, parent.deleted_at) is null
        and coalesce(club.owner_user_id, parent.owner_user_id) is not null
    ),
    calculated as (
      select
        e.*,
        least(
          100,
          greatest(
            0,
            e.old_morale + case when e.participated_recently then 1 else -1 end
          )
        )::smallint as new_morale
      from eligible e
    ),
    updated as (
      update public.riders r
      set
        morale = c.new_morale,
        morale_updated_on = $1,

        low_morale_since = case
          when c.new_morale <= 39 then coalesce(r.low_morale_since, $1)
          else null
        end,

        very_low_morale_since = case
          when c.new_morale <= 19 then coalesce(r.very_low_morale_since, $1)
          else null
        end,

        asked_for_more_selection = case
          when c.new_morale <= 19 then true
          else false
        end,

        release_requested = case
          when r.release_requested = true then true
          when c.new_morale <= 19
            and coalesce(r.very_low_morale_since, $1) <= ($1 - 5)
            then true
          else false
        end
      from calculated c
      where r.id = c.rider_id
      returning
        r.id,
        c.participated_recently,
        c.old_morale,
        r.morale as new_morale,
        r.low_morale_since,
        r.very_low_morale_since,
        r.asked_for_more_selection,
        r.release_requested
    )
    select
      count(*)::integer as processed_count,
      count(*) filter (where participated_recently)::integer as recent_participation_count,
      count(*) filter (where not participated_recently)::integer as no_recent_participation_count,
      count(*) filter (where new_morale <= 39)::integer as low_morale_count,
      count(*) filter (where asked_for_more_selection)::integer as more_selection_count,
      count(*) filter (where release_requested)::integer as release_requested_count
    from updated
    $sql$,
    v_activity_date_column,
    v_participation_predicate
  );

  execute v_sql
  into
    v_processed_count,
    v_recent_participation_count,
    v_no_recent_participation_count,
    v_low_morale_count,
    v_more_selection_count,
    v_release_requested_count
  using v_game_date;

  return jsonb_build_object(
    'ok', true,
    'game_date', v_game_date,
    'processed_count', coalesce(v_processed_count, 0),
    'recent_participation_count', coalesce(v_recent_participation_count, 0),
    'no_recent_participation_count', coalesce(v_no_recent_participation_count, 0),
    'low_morale_count', coalesce(v_low_morale_count, 0),
    'more_selection_count', coalesce(v_more_selection_count, 0),
    'release_requested_count', coalesce(v_release_requested_count, 0),
    'rules', jsonb_build_object(
      'recent_participation_window_days', 2,
      'morale_gain_if_recently_participated', 1,
      'morale_loss_if_not_recently_participated', -1,
      'low_morale_threshold', 39,
      'more_selection_threshold', 19,
      'release_request_days_below_20', 5
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_daily_morale_v1(p_game_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game_date date;
  v_season int;
  v_month smallint;
  v_day smallint;
  v_day_of_year int;

  v_activity_riders int := 0;
  v_activity_rows int := 0;

  v_processed int := 0;
  v_recently_active int := 0;
  v_explicit_inactive int := 0;
  v_morale_up int := 0;
  v_morale_down int := 0;
  v_low_morale_count int := 0;
  v_more_selection_count int := 0;
  v_release_requested_count int := 0;

  v_release_after_days int := 7;
begin
  if p_game_date is not null then
    v_game_date := p_game_date;
  else
    select
      gs.season_number,
      gs.month_number,
      gs.day_number,
      (
        coalesce(
          (
            select sum(md.days_in_month)
            from public.month_definitions md
            where md.month_number < gs.month_number
          ),
          0
        )::int + gs.day_number
      )::int
    into
      v_season,
      v_month,
      v_day,
      v_day_of_year
    from public.game_state gs
    where gs.id = true;

    if v_season is null or v_day_of_year is null then
      raise exception 'Could not resolve current game date from public.game_state';
    end if;

    v_game_date :=
      (
        date '2000-01-01'
        + (
          ((v_season - 1) * 366)
          + (v_day_of_year - 1)
        )::int
      )::date;
  end if;

  select
    count(*)::int,
    count(distinct rda.rider_id)::int
  into
    v_activity_rows,
    v_activity_riders
  from public.rider_daily_activity rda
  where rda.activity_date between (v_game_date - 1) and v_game_date;

  if v_activity_riders = 0 then
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'no_activity_rows_found_for_two_day_window',
      'game_date', v_game_date,
      'lookback_start', v_game_date - 1,
      'lookback_end', v_game_date,
      'activity_rows', v_activity_rows,
      'activity_riders', v_activity_riders
    );
  end if;

  with activity_candidates as (
    select
      rda.rider_id,
      bool_or(rda.participated = true) as participated_recently,
      count(*)::int as activity_row_count
    from public.rider_daily_activity rda
    where rda.activity_date between (v_game_date - 1) and v_game_date
    group by rda.rider_id
  ),
  candidates as (
    select
      r.id,
      r.morale,
      r.low_morale_since,
      r.asked_for_more_selection,
      r.release_requested,
      ac.participated_recently,
      ac.activity_row_count
    from activity_candidates ac
    join public.riders r on r.id = ac.rider_id
    where r.morale_updated_on is distinct from v_game_date
  ),
  calculated as (
    select
      c.id,
      c.morale,
      c.low_morale_since,
      c.asked_for_more_selection,
      c.release_requested,
      c.participated_recently,
      c.activity_row_count,
      case
        when c.participated_recently then 1
        else -1
      end as morale_delta,
      least(
        100,
        greatest(
          0,
          c.morale + case when c.participated_recently then 1 else -1 end
        )
      )::smallint as next_morale
    from candidates c
  ),
  updated as (
    update public.riders r
    set
      morale = c.next_morale,
      morale_updated_on = v_game_date,

      low_morale_since = case
        when c.next_morale < 20 and r.low_morale_since is null then v_game_date
        when c.next_morale >= 20 then null
        else r.low_morale_since
      end,

      asked_for_more_selection = case
        when c.next_morale < 20 then true
        when c.next_morale >= 40 then false
        else r.asked_for_more_selection
      end,

      release_requested = case
        when c.next_morale < 20
          and coalesce(r.low_morale_since, v_game_date) <= (v_game_date - v_release_after_days)
        then true
        when c.next_morale >= 40 then false
        else r.release_requested
      end
    from calculated c
    where r.id = c.id
    returning
      r.id,
      c.participated_recently,
      c.activity_row_count,
      c.morale_delta,
      c.next_morale,
      r.low_morale_since,
      r.asked_for_more_selection,
      r.release_requested
  )
  select
    count(*)::int,
    count(*) filter (where participated_recently)::int,
    count(*) filter (where not participated_recently)::int,
    count(*) filter (where morale_delta > 0)::int,
    count(*) filter (where morale_delta < 0)::int,
    count(*) filter (where next_morale < 20)::int,
    count(*) filter (where asked_for_more_selection = true)::int,
    count(*) filter (where release_requested = true)::int
  into
    v_processed,
    v_recently_active,
    v_explicit_inactive,
    v_morale_up,
    v_morale_down,
    v_low_morale_count,
    v_more_selection_count,
    v_release_requested_count
  from updated;

  return jsonb_build_object(
    'ok', true,
    'skipped', false,
    'game_date', v_game_date,
    'lookback_start', v_game_date - 1,
    'lookback_end', v_game_date,
    'activity_rows', v_activity_rows,
    'activity_riders', v_activity_riders,
    'processed_riders', v_processed,
    'recently_active_riders', v_recently_active,
    'explicit_inactive_riders', v_explicit_inactive,
    'morale_increased', v_morale_up,
    'morale_decreased', v_morale_down,
    'low_morale_riders_after_update', v_low_morale_count,
    'asked_for_more_selection_riders_after_update', v_more_selection_count,
    'release_requested_riders_after_update', v_release_requested_count,
    'release_after_days', v_release_after_days
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_enforce_replay_rider_gap_continuity_v12(p_simulation_run_id uuid, p_stage_id uuid DEFAULT NULL::uuid, p_max_gap_increase_seconds_per_frame numeric DEFAULT 18, p_max_gap_closure_seconds_per_frame numeric DEFAULT 15, p_visible_gap_bin_seconds numeric DEFAULT 10, p_visible_km_bin_width numeric DEFAULT 0.25, p_km_per_gap_second numeric DEFAULT 0.012, p_max_forward_km_per_frame numeric DEFAULT 0.85)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_stage_id uuid;
  v_race_id uuid;
  v_distance_km numeric := 1;
  v_source_group_rows integer := 0;
  v_raw_source_rider_rows integer := 0;
  v_dedup_source_rider_rows integer := 0;
  v_display_group_rows integer := 0;
  v_deleted_group_rows integer := 0;
  v_inserted_group_rows integer := 0;
begin
  select
    sr.stage_id,
    sr.race_id
  into
    v_stage_id,
    v_race_id
  from public.race_stage_simulation_runs sr
  where sr.id = p_simulation_run_id
  limit 1;

  v_stage_id := coalesce(p_stage_id, v_stage_id);

  if v_stage_id is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'simulation_run_or_stage_not_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', p_stage_id
    );
  end if;

  select greatest(
    1,
    coalesce(
      max(rs.distance_km),
      max(rf.km_marker),
      1
    )
  )
  into v_distance_km
  from public.race_stages rs
  left join public.race_stage_replay_frames rf
    on rf.stage_id = rs.id
   and rf.simulation_run_id = p_simulation_run_id
  where rs.id = v_stage_id;

  drop table if exists pg_temp.tmp_replay_gap_v12_source_frames;
  drop table if exists pg_temp.tmp_replay_gap_v12_raw_source_riders;
  drop table if exists pg_temp.tmp_replay_gap_v12_source_riders;
  drop table if exists pg_temp.tmp_replay_gap_v12_ordered;
  drop table if exists pg_temp.tmp_replay_gap_v12_safe_riders;
  drop table if exists pg_temp.tmp_replay_gap_v12_frame_leaders;
  drop table if exists pg_temp.tmp_replay_gap_v12_display_groups;
  drop table if exists pg_temp.tmp_replay_gap_v12_numbered_groups;

  create temporary table pg_temp.tmp_replay_gap_v12_source_frames on commit drop as
  select
    f.id,
    f.frame_number::integer as frame_number,
    coalesce(f.race_seconds, 0)::integer as race_seconds,
    greatest(0, least(v_distance_km, coalesce(f.km_marker, 0)::numeric)) as km_marker,
    coalesce(f.group_order, 1)::integer as group_order,
    coalesce(f.group_code, '')::text as group_code,
    coalesce(f.group_label, '')::text as group_label,
    greatest(0, coalesce(f.gap_seconds, 0)::numeric) as gap_seconds,
    greatest(1, coalesce(f.avg_speed_kmh, 38)::numeric) as avg_speed_kmh,
    coalesce(f.rider_ids, array[]::uuid[]) as rider_ids,
    coalesce(f.rider_names, array[]::text[]) as rider_names,
    coalesce(f.team_names, array[]::text[]) as team_names,
    coalesce(f.metadata, '{}'::jsonb) as metadata,
    lower(coalesce(nullif(f.metadata->>'terrain_type', ''), 'flat')) as terrain_type,
    coalesce(
      case when (f.metadata->>'slope_percent') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (f.metadata->>'slope_percent')::numeric end,
      0
    ) as slope_percent
  from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group'
    and array_length(f.rider_ids, 1) is not null
    and array_length(f.rider_ids, 1) > 0
  order by f.frame_number, f.group_order, f.gap_seconds, f.km_marker desc;

  get diagnostics v_source_group_rows = row_count;

  if v_source_group_rows = 0 then
    return jsonb_build_object(
      'status', 'skipped',
      'function', 'race_engine_enforce_replay_rider_gap_continuity_v12',
      'reason', 'no_group_replay_frames_found',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id
    );
  end if;

  create temporary table pg_temp.tmp_replay_gap_v12_raw_source_riders on commit drop as
  select
    sf.frame_number,
    sf.race_seconds,
    sf.km_marker as raw_group_km_marker,
    sf.group_order as raw_group_order,
    sf.group_code as raw_group_code,
    sf.group_label as raw_group_label,
    sf.gap_seconds as raw_gap_seconds,
    sf.avg_speed_kmh,
    sf.metadata,
    sf.terrain_type,
    sf.slope_percent,
    rider.rider_id::uuid as rider_id,
    rider.rider_ordinal::integer as rider_ordinal,
    coalesce(sf.rider_names[rider.rider_ordinal::integer], 'Rider') as rider_name,
    coalesce(sf.team_names[rider.rider_ordinal::integer], '') as team_name
  from pg_temp.tmp_replay_gap_v12_source_frames sf
  cross join lateral unnest(sf.rider_ids) with ordinality
    as rider(rider_id, rider_ordinal);

  get diagnostics v_raw_source_rider_rows = row_count;

  -- One source row per rider per frame. Prefer smallest displayed gap, then
  -- most advanced km. This protects against duplicate rider entries from older patches.
  create temporary table pg_temp.tmp_replay_gap_v12_source_riders on commit drop as
  select distinct on (raw.frame_number, raw.rider_id)
    raw.*
  from pg_temp.tmp_replay_gap_v12_raw_source_riders raw
  order by
    raw.frame_number,
    raw.rider_id,
    raw.raw_gap_seconds asc,
    raw.raw_group_km_marker desc,
    raw.rider_ordinal asc;

  get diagnostics v_dedup_source_rider_rows = row_count;

  create temporary table pg_temp.tmp_replay_gap_v12_ordered on commit drop as
  select
    src.*,
    row_number() over (
      partition by src.rider_id
      order by src.frame_number
    )::integer as rider_frame_index
  from pg_temp.tmp_replay_gap_v12_source_riders src;

  create index tmp_replay_gap_v12_ordered_idx
    on pg_temp.tmp_replay_gap_v12_ordered(rider_id, rider_frame_index);

  analyze pg_temp.tmp_replay_gap_v12_ordered;

  -- Rider-level continuity. This is the important part:
  -- same rider cannot jump from seconds to minutes, and cannot move backwards.
  create temporary table pg_temp.tmp_replay_gap_v12_safe_riders on commit drop as
  with recursive safe_rows as (
    select
      o.frame_number,
      o.race_seconds,
      o.raw_group_km_marker,
      o.raw_group_order,
      o.raw_group_code,
      o.raw_group_label,
      o.raw_gap_seconds,
      o.avg_speed_kmh,
      o.metadata,
      o.terrain_type,
      o.slope_percent,
      o.rider_id,
      o.rider_ordinal,
      o.rider_name,
      o.team_name,
      o.rider_frame_index,
      o.raw_gap_seconds::numeric as safe_gap_seconds,
      o.raw_group_km_marker::numeric as safe_km_marker
    from pg_temp.tmp_replay_gap_v12_ordered o
    where o.rider_frame_index = 1

    union all

    select
      n.frame_number,
      n.race_seconds,
      n.raw_group_km_marker,
      n.raw_group_order,
      n.raw_group_code,
      n.raw_group_label,
      n.raw_gap_seconds,
      n.avg_speed_kmh,
      n.metadata,
      n.terrain_type,
      n.slope_percent,
      n.rider_id,
      n.rider_ordinal,
      n.rider_name,
      n.team_name,
      n.rider_frame_index,
      case
        when n.raw_gap_seconds > p.safe_gap_seconds then
          least(
            n.raw_gap_seconds,
            p.safe_gap_seconds + p_max_gap_increase_seconds_per_frame
          )
        when n.raw_gap_seconds < p.safe_gap_seconds then
          greatest(
            n.raw_gap_seconds,
            p.safe_gap_seconds - p_max_gap_closure_seconds_per_frame
          )
        else
          n.raw_gap_seconds
      end::numeric as safe_gap_seconds,
      greatest(
        p.safe_km_marker,
        least(
          greatest(0, n.raw_group_km_marker),
          p.safe_km_marker + p_max_forward_km_per_frame
        )
      )::numeric as safe_km_marker
    from safe_rows p
    join pg_temp.tmp_replay_gap_v12_ordered n
      on n.rider_id = p.rider_id
     and n.rider_frame_index = p.rider_frame_index + 1
  )
  select *
  from safe_rows;

  create index tmp_replay_gap_v12_safe_riders_frame_idx
    on pg_temp.tmp_replay_gap_v12_safe_riders(frame_number, safe_gap_seconds, rider_id);

  analyze pg_temp.tmp_replay_gap_v12_safe_riders;

  create temporary table pg_temp.tmp_replay_gap_v12_frame_leaders on commit drop as
  select
    frame_number,
    max(safe_km_marker)::numeric as leader_km_marker,
    max(race_seconds)::integer as race_seconds,
    avg(avg_speed_kmh)::numeric as avg_speed_kmh
  from pg_temp.tmp_replay_gap_v12_safe_riders
  group by frame_number;

  -- Fixed-width gap bins keep groups readable. V12 then adds Peloton
  -- lineage, so Peloton is not chosen independently in every frame.
  create temporary table pg_temp.tmp_replay_gap_v12_display_groups on commit drop as
  with recursive binned_riders as (
    select
      sr.*,
      greatest(1, floor(greatest(0, sr.safe_gap_seconds) / greatest(p_visible_gap_bin_seconds, 1))::integer + 1) as gap_bin,
      greatest(0, floor(greatest(0, sr.safe_km_marker) / greatest(p_visible_km_bin_width, 0.05))::integer) as km_bin
    from pg_temp.tmp_replay_gap_v12_safe_riders sr
  ),
  group_base as (
    select
      br.frame_number,
      br.gap_bin,
      br.km_bin,
      round(avg(br.safe_gap_seconds))::integer as display_gap_seconds,
      min(br.safe_gap_seconds)::numeric as min_safe_gap_seconds,
      max(br.safe_gap_seconds)::numeric as max_safe_gap_seconds,
      min(br.safe_km_marker)::numeric as min_member_safe_km_marker,
      max(br.safe_km_marker)::numeric as max_member_safe_km_marker,
      count(*)::integer as rider_count,
      array_agg(br.rider_id order by br.safe_gap_seconds, br.safe_km_marker desc, br.rider_ordinal, br.rider_id) as rider_ids,
      array_agg(br.rider_name order by br.safe_gap_seconds, br.safe_km_marker desc, br.rider_ordinal, br.rider_id) as rider_names,
      array_agg(br.team_name order by br.safe_gap_seconds, br.safe_km_marker desc, br.rider_ordinal, br.rider_id) as team_names,
      max(br.race_seconds)::integer as race_seconds,
      avg(br.avg_speed_kmh)::numeric as avg_speed_kmh,
      (array_agg(br.metadata order by br.safe_gap_seconds, br.safe_km_marker desc))[1] as source_metadata,
      (array_agg(br.terrain_type order by br.safe_gap_seconds, br.safe_km_marker desc))[1] as terrain_type,
      (array_agg(br.slope_percent order by br.safe_gap_seconds, br.safe_km_marker desc))[1] as slope_percent
    from binned_riders br
    group by br.frame_number, br.gap_bin, br.km_bin
  ),
  with_leader as (
    select
      gb.*,
      fl.leader_km_marker,
      least(
        v_distance_km,
        greatest(
          0,
          gb.max_member_safe_km_marker
        )
      )::numeric as display_km_marker
    from group_base gb
    join pg_temp.tmp_replay_gap_v12_frame_leaders fl
      on fl.frame_number = gb.frame_number
  ),
  ordered_groups as (
    select
      wl.*,
      row_number() over (
        partition by wl.frame_number
        order by wl.display_gap_seconds asc, wl.display_km_marker desc, wl.gap_bin asc, wl.km_bin desc
      )::integer as group_order
    from with_leader wl
  ),
  frame_index as (
    select
      frame_number,
      row_number() over (order by frame_number)::integer as frame_idx
    from (
      select distinct frame_number
      from ordered_groups
    ) f
  ),
  peloton_pick as (
    -- First replay frame: choose the largest group as the Peloton seed.
    -- This matches the cycling logic: the peloton starts as the main pack.
    select
      seed.frame_idx,
      seed.frame_number,
      seed.group_order as peloton_group_order,
      seed.rider_ids as peloton_rider_ids,
      seed.display_gap_seconds as peloton_gap_seconds,
      seed.rider_count as peloton_rider_count,
      seed.rider_count::integer as peloton_overlap_count,
      true as peloton_seed_frame
    from (
      select
        fi.frame_idx,
        og.*,
        row_number() over (
          order by
            og.rider_count desc,
            og.display_gap_seconds asc,
            og.display_km_marker desc,
            og.group_order asc
        ) as seed_rank
      from frame_index fi
      join ordered_groups og
        on og.frame_number = fi.frame_number
      where fi.frame_idx = 1
    ) seed
    where seed.seed_rank = 1

    union all

    -- Next frames: follow the previous Peloton by rider overlap.
    -- This prevents frame-by-frame Peloton switching between G/B groups.
    select
      fi.frame_idx,
      picked.frame_number,
      picked.group_order as peloton_group_order,
      picked.rider_ids as peloton_rider_ids,
      picked.display_gap_seconds as peloton_gap_seconds,
      picked.rider_count as peloton_rider_count,
      picked.peloton_overlap_count,
      false as peloton_seed_frame
    from peloton_pick previous
    join frame_index fi
      on fi.frame_idx = previous.frame_idx + 1
    join lateral (
      select
        og.*,
        coalesce(
          (
            select count(*)::integer
            from unnest(og.rider_ids) current_rider(rider_id)
            join unnest(previous.peloton_rider_ids) previous_rider(rider_id)
              on previous_rider.rider_id = current_rider.rider_id
          ),
          0
        ) as peloton_overlap_count
      from ordered_groups og
      where og.frame_number = fi.frame_number
      order by
        -- Main rule: preserve Peloton lineage by overlap with previous Peloton.
        peloton_overlap_count desc,
        -- Hysteresis: avoid selecting a group with a very different gap unless
        -- overlap clearly forces it.
        abs(og.display_gap_seconds - previous.peloton_gap_seconds) asc,
        og.rider_count desc,
        og.display_gap_seconds asc,
        og.display_km_marker desc,
        og.group_order asc
      limit 1
    ) picked on true
  ),
  numbered as (
    select
      og.*,
      pp.peloton_group_order,
      pp.peloton_gap_seconds,
      pp.peloton_rider_count,
      pp.peloton_overlap_count,
      pp.peloton_seed_frame,
      count(*) filter (where og.group_order < pp.peloton_group_order) over (
        partition by og.frame_number
        order by og.group_order
        rows between unbounded preceding and current row
      )::integer as ahead_number,
      count(*) filter (where og.group_order > pp.peloton_group_order) over (
        partition by og.frame_number
        order by og.group_order
        rows between unbounded preceding and current row
      )::integer as behind_number
    from ordered_groups og
    join peloton_pick pp
      on pp.frame_number = og.frame_number
  )
  select
    n.*,
    case
      when n.group_order = n.peloton_group_order then 'main_peloton'
      when n.group_order < n.peloton_group_order and n.ahead_number = 1 then 'front_group'
      when n.group_order < n.peloton_group_order then 'chase_group_' || lpad(n.ahead_number::text, 2, '0')
      when n.behind_number = 1 then 'dropped_group'
      else 'outside_group_' || lpad((n.behind_number - 1)::text, 2, '0')
    end as display_group_code,
    case
      when n.group_order = n.peloton_group_order then 'Peloton'
      when n.group_order < n.peloton_group_order and n.ahead_number = 1 then 'Front group'
      when n.group_order < n.peloton_group_order then 'Chasing group ' || n.ahead_number::text
      when n.behind_number = 1 then 'Dropped group'
      else 'Outside group ' || (n.behind_number - 1)::text
    end as display_group_label
  from numbered n;

  get diagnostics v_display_group_rows = row_count;

  -- Replace current group rows with v12 rebuilt display rows. This avoids being
  -- limited by the number of old display slots.
  delete from public.race_stage_replay_frames f
  where f.simulation_run_id = p_simulation_run_id
    and f.stage_id = v_stage_id
    and coalesce(f.entity_type, 'group') = 'group';

  get diagnostics v_deleted_group_rows = row_count;

  insert into public.race_stage_replay_frames (
    simulation_run_id,
    race_id,
    stage_id,
    frame_number,
    race_seconds,
    km_marker,
    group_code,
    group_label,
    group_order,
    gap_seconds,
    avg_speed_kmh,
    rider_ids,
    rider_names,
    team_names,
    entity_type,
    metadata
  )
  select
    p_simulation_run_id,
    v_race_id,
    v_stage_id,
    dg.frame_number,
    dg.race_seconds,
    greatest(0, least(v_distance_km, dg.display_km_marker)) as km_marker,
    dg.display_group_code,
    dg.display_group_label,
    dg.group_order,
    greatest(0, dg.display_gap_seconds),
    greatest(1, coalesce(dg.avg_speed_kmh, 38)),
    dg.rider_ids,
    dg.rider_names,
    dg.team_names,
    'group',
    (
      coalesce(dg.source_metadata, '{}'::jsonb)
      - 'rider_energy_v1'
      - 'stage_live_energy_smooth_v8'
      - 'stage_live_energy_smooth_v12'
      - 'stage_live_energy_smooth_v12'
      - 'stage_live_energy_smooth_v12'
      - 'stage_live_energy_smooth_v12'
      - 'average_live_energy_pct'
      - 'minimum_live_energy_pct'
      - 'maximum_live_energy_pct'
      - 'average_pre_stage_freshness_pct'
      - 'minimum_pre_stage_freshness_pct'
      - 'maximum_pre_stage_freshness_pct'
    ) || jsonb_build_object(
      'source', 'race_engine_replay_v12_binned_rider_gap_km_continuity',
      'gap_rider_continuity_v12', true,
      'gap_rider_continuity_v12_at', now(),
      'v12_gap_bin_seconds', p_visible_gap_bin_seconds,
      'v12_km_bin_width', p_visible_km_bin_width,
      'v12_km_bin', dg.km_bin,
      'v12_group_gap_span_seconds', round((dg.max_safe_gap_seconds - dg.min_safe_gap_seconds)::numeric, 2),
      'v12_min_member_safe_gap_seconds', round(dg.min_safe_gap_seconds::numeric, 2),
      'v12_max_member_safe_gap_seconds', round(dg.max_safe_gap_seconds::numeric, 2),
      'v12_min_member_safe_km_marker', round(dg.min_member_safe_km_marker::numeric, 3),
      'v12_max_member_safe_km_marker', round(dg.max_member_safe_km_marker::numeric, 3),
      'v12_leader_km_marker', round(dg.leader_km_marker::numeric, 3),
      'v12_expected_gap_km_from_time', round((greatest(0, dg.display_gap_seconds) * p_km_per_gap_second)::numeric, 3),
      'v12_time_gap_profile_mismatch_km', round(abs((dg.leader_km_marker - dg.display_km_marker) - (greatest(0, dg.display_gap_seconds) * p_km_per_gap_second))::numeric, 3),
      'v12_peloton_group_order', dg.peloton_group_order,
      'v12_peloton_overlap_count', coalesce(dg.peloton_overlap_count, 0),
      'v12_peloton_seed_frame', coalesce(dg.peloton_seed_frame, false),
      'v12_max_gap_increase_seconds_per_frame', p_max_gap_increase_seconds_per_frame,
      'v12_max_gap_closure_seconds_per_frame', p_max_gap_closure_seconds_per_frame,
      'v12_max_forward_km_per_frame', p_max_forward_km_per_frame,
      'terrain_type', dg.terrain_type,
      'slope_percent', dg.slope_percent
    ) as metadata
  from pg_temp.tmp_replay_gap_v12_display_groups dg
  order by dg.frame_number, dg.group_order;

  get diagnostics v_inserted_group_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'function', 'race_engine_enforce_replay_rider_gap_continuity_v12',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'distance_km', v_distance_km,
    'source_group_rows', v_source_group_rows,
    'raw_source_rider_rows', v_raw_source_rider_rows,
    'dedup_source_rider_rows', v_dedup_source_rider_rows,
    'display_group_rows', v_display_group_rows,
    'deleted_group_rows', v_deleted_group_rows,
    'inserted_group_rows', v_inserted_group_rows,
    'max_gap_increase_seconds_per_frame', p_max_gap_increase_seconds_per_frame,
    'max_gap_closure_seconds_per_frame', p_max_gap_closure_seconds_per_frame,
    'visible_gap_bin_seconds', p_visible_gap_bin_seconds,
    'visible_km_bin_width', p_visible_km_bin_width,
    'km_per_gap_second', p_km_per_gap_second,
    'max_forward_km_per_frame', p_max_forward_km_per_frame
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_user_low_coins_after_ledger_insert_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_threshold integer := 7;
  v_old_balance integer := 0;
  v_new_balance integer := 0;
  v_event_key text;
  v_action_url text := '/dashboard/pro-packages';
BEGIN
  SELECT COALESCE(SUM(delta), 0)::integer
  INTO v_new_balance
  FROM public.user_coin_ledger
  WHERE user_id = NEW.user_id;

  v_old_balance := v_new_balance - NEW.delta;

  /*
   * If the user is back above the warning threshold,
   * reset the warning state.
   */
  IF v_new_balance >= v_threshold THEN
    INSERT INTO public.user_coin_low_warning_state (
      user_id,
      is_below_threshold,
      last_balance,
      updated_at
    )
    VALUES (
      NEW.user_id,
      false,
      v_new_balance,
      now()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
      is_below_threshold = false,
      last_balance = EXCLUDED.last_balance,
      updated_at = now();

    RETURN NEW;
  END IF;

  /*
   * Notify only when crossing from 7 or more coins
   * to fewer than 7 coins.
   */
  IF v_old_balance >= v_threshold
     AND v_new_balance < v_threshold THEN

    v_event_key := 'coins_low:' || NEW.id::text;

    IF NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      JOIN public.notification_types nt
        ON nt.id = n.type_id
      WHERE nt.code = 'COINS_LOW_WARNING'
        AND n.payload_json->>'event_key' = v_event_key
    ) THEN
      PERFORM public.create_infrastructure_notification(
        NEW.user_id,
        'COINS_LOW_WARNING',
        'Coins are running low',
        format(
          'Your coin balance is now %s. Coins are used for optional features and services. Normal gameplay remains available even if your balance reaches 0.',
          v_new_balance
        ),
        v_action_url,
        jsonb_build_object(
          'event_key', v_event_key,
          'user_id', NEW.user_id,
          'ledger_id', NEW.id,
          'old_balance', v_old_balance,
          'new_balance', v_new_balance,
          'threshold', v_threshold,
          'delta', NEW.delta,
          'reason', NEW.reason,
          'payload_json', NEW.payload_json,
          'action_url', v_action_url,
          'pro_packages_path', '/dashboard/pro-packages',
          'coin_packages_path', '/dashboard/pro-packages',
          'coins_optional', true,
          'gameplay_access_affected', false
        )
      );
    END IF;

    INSERT INTO public.user_coin_low_warning_state (
      user_id,
      is_below_threshold,
      last_balance,
      last_warned_balance,
      last_warning_at,
      updated_at
    )
    VALUES (
      NEW.user_id,
      true,
      v_new_balance,
      v_new_balance,
      now(),
      now()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
      is_below_threshold = true,
      last_balance = EXCLUDED.last_balance,
      last_warned_balance = EXCLUDED.last_warned_balance,
      last_warning_at = EXCLUDED.last_warning_at,
      updated_at = now();

    RETURN NEW;
  END IF;

  /*
   * Already below the threshold:
   * update state without creating repeated warnings.
   */
  INSERT INTO public.user_coin_low_warning_state (
    user_id,
    is_below_threshold,
    last_balance,
    updated_at
  )
  VALUES (
    NEW.user_id,
    true,
    v_new_balance,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    is_below_threshold = true,
    last_balance = EXCLUDED.last_balance,
    updated_at = now();

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_rider_contract_expiry_notifications_v1(p_game_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game_date date:=coalesce(p_game_date,public.get_current_game_date_date(),current_date);
  r record;
  v_days integer;
  v_milestone integer;
  v_event_key text;
  v_name text;
  v_action_url text;
  v_message text;
  v_processed integer:=0;
  v_created integer:=0;
  v_existing integer:=0;
begin
  for r in
    select rc.id as contract_id,rc.rider_id,rc.club_id,rc.expires_on,
           coalesce(c.owner_user_id,parent.owner_user_id) as user_id,
           coalesce(c.name,parent.name) as club_name,
           rd.first_name,rd.last_name,rd.display_name
    from public.rider_contracts rc
    join public.clubs c on c.id=rc.club_id
    left join public.clubs parent on parent.id=c.parent_club_id
    join public.riders rd on rd.id=rc.rider_id
    where rc.status='active'
      and rc.expires_on between v_game_date and v_game_date+60
      and coalesce(c.is_ai,false)=false
      and coalesce(c.deleted_at,parent.deleted_at) is null
      and coalesce(c.owner_user_id,parent.owner_user_id) is not null
    order by rc.expires_on,rd.last_name,rd.first_name
  loop
    v_processed:=v_processed+1;
    v_days:=greatest(0,r.expires_on-v_game_date);
    v_milestone:=case
      when v_days<=0 then 0
      when v_days<=1 then 1
      when v_days<=3 then 3
      when v_days<=7 then 7
      when v_days<=14 then 14
      when v_days<=30 then 30
      else 60 end;
    v_event_key:='rider_contract_expiring:'||r.contract_id::text||':'||r.expires_on::text||':m'||v_milestone::text;

    if exists(
      select 1 from public.notifications n
      join public.notification_types nt on nt.id=n.type_id
      where nt.code='RIDER_CONTRACT_EXPIRING'
        and n.payload_json->>'event_key'=v_event_key
    ) then
      v_existing:=v_existing+1;
      continue;
    end if;

    v_name:=coalesce(nullif(trim(coalesce(r.first_name,'')||' '||coalesce(r.last_name,'')),''),nullif(r.display_name,''),'A rider');
    v_action_url:='/dashboard/my-riders/'||r.rider_id::text;
    v_message:=case
      when v_days=0 then v_name||'''s contract expires today. Renew now if you want to keep the rider.'
      when v_days=1 then v_name||'''s contract expires in 1 in-game day. Review renewal or replacement immediately.'
      else v_name||'''s contract expires in '||v_days||' in-game days. Review renewal terms and replacement planning.' end;

    perform public.create_infrastructure_notification(
      r.user_id,'RIDER_CONTRACT_EXPIRING','Rider contract expiring: '||v_name,v_message,v_action_url,
      jsonb_build_object(
        'event_key',v_event_key,'contract_id',r.contract_id,'rider_id',r.rider_id,'rider_name',v_name,
        'club_id',r.club_id,'club_name',r.club_name,'expires_on',r.expires_on,'days_until_expiry',v_days,
        'warning_milestone_days',v_milestone,'warning_policy','60_30_14_7_3_1_0','action_url',v_action_url
      )
    );
    v_created:=v_created+1;
  end loop;

  return jsonb_build_object('ok',true,'game_date',v_game_date,'processed_count',v_processed,'created_count',v_created,
    'existing_count',v_existing,'warning_policy','60_30_14_7_3_1_0');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_race_stage_results_upsert_daily_activity_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage record;
  v_race record;
  v_participated boolean := true;
  v_intensity text := 'normal';
  v_fatigue_load smallint := 16;
begin
  if new.rider_id is null or new.stage_id is null or new.race_id is null then
    return new;
  end if;

  -- Important safety guard:
  -- race_stage_results can contain old/orphan rider ids.
  -- rider_daily_activity has FK to public.riders, so skip missing riders.
  if not exists (
    select 1
    from public.riders r
    where r.id = new.rider_id
  ) then
    return new;
  end if;

  v_participated :=
    lower(coalesce(new.status, 'finished')) not in (
      'dns',
      'did_not_start',
      'not_started',
      'not_selected',
      'withdrawn_before_start'
    );

  if v_participated = false then
    return new;
  end if;

  select
    rs.id,
    rs.stage_date,
    rs.stage_number,
    rs.name,
    rs.distance_km,
    rs.terrain_type,
    rs.stage_format,
    rs.elevation_gain_m,
    rs.hilly_pct,
    rs.mountain_pct
  into v_stage
  from public.race_stages rs
  where rs.id = new.stage_id;

  if v_stage.id is null or v_stage.stage_date is null then
    return new;
  end if;

  select
    r.id,
    r.name,
    r.category,
    r.race_type,
    r.is_stage_race
  into v_race
  from public.races r
  where r.id = new.race_id;

  if lower(coalesce(v_stage.stage_format, '')) in (
      'individual_time_trial',
      'team_time_trial',
      'time_trial',
      'prologue'
    ) then
    v_intensity := 'hard';
    v_fatigue_load := 20;
  elsif lower(coalesce(v_stage.terrain_type, '')) like '%mountain%'
    or coalesce(v_stage.mountain_pct, 0) >= 25
    or coalesce(v_stage.elevation_gain_m, 0) >= 2500 then
    v_intensity := 'hard';
    v_fatigue_load := 30;
  elsif lower(coalesce(v_stage.terrain_type, '')) like '%hilly%'
    or coalesce(v_stage.hilly_pct, 0) >= 35
    or coalesce(v_stage.distance_km, 0) >= 180 then
    v_intensity := 'hard';
    v_fatigue_load := 24;
  else
    v_intensity := 'normal';
    v_fatigue_load := 16;
  end if;

  insert into public.rider_daily_activity (
    rider_id,
    activity_date,
    participated,
    source,
    activity_type,
    intensity,
    fatigue_load,
    recovery_bonus,
    source_id,
    metadata
  )
  values (
    new.rider_id,
    v_stage.stage_date,
    true,
    'race',
    'race',
    v_intensity,
    v_fatigue_load,
    0,
    new.stage_id,
    jsonb_build_object(
      'race_id', new.race_id,
      'stage_id', new.stage_id,
      'team_id', new.team_id,
      'race_name', coalesce(v_race.name, ''),
      'race_category', coalesce(v_race.category, ''),
      'race_type', coalesce(v_race.race_type, ''),
      'is_stage_race', coalesce(v_race.is_stage_race, false),
      'stage_number', v_stage.stage_number,
      'stage_name', coalesce(v_stage.name, ''),
      'stage_format', coalesce(v_stage.stage_format, ''),
      'terrain_type', coalesce(v_stage.terrain_type, ''),
      'distance_km', v_stage.distance_km,
      'elevation_gain_m', v_stage.elevation_gain_m,
      'result_status', new.status,
      'result_rank', new.rank,
      'elapsed_seconds', new.elapsed_seconds,
      'gap_seconds', new.gap_seconds,
      'source', 'race_stage_results_trigger'
    )
  )
  on conflict (rider_id, activity_date) do update
  set
    participated = true,
    source = 'race',
    activity_type = 'race',
    intensity = case
      when public.rider_daily_activity.intensity = 'hard'
        or excluded.intensity = 'hard'
      then 'hard'
      else excluded.intensity
    end,
    fatigue_load = greatest(
      public.rider_daily_activity.fatigue_load,
      excluded.fatigue_load
    ),
    recovery_bonus = 0,
    source_id = excluded.source_id,
    metadata = coalesce(public.rider_daily_activity.metadata, '{}'::jsonb)
      || excluded.metadata;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_backfill_race_daily_activity_v1(p_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source_result_rows int := 0;
  v_missing_rider_result_rows int := 0;
  v_eligible_result_rows int := 0;
  v_upserted_count int := 0;
begin
  -- All non-DNS race result rows.
  select count(*)::int
  into v_source_result_rows
  from public.race_stage_results rsr
  join public.race_stages st
    on st.id = rsr.stage_id
  join public.races r
    on r.id = rsr.race_id
  where (p_stage_id is null or rsr.stage_id = p_stage_id)
    and lower(coalesce(rsr.status, 'finished')) not in (
      'dns',
      'did_not_start',
      'not_started',
      'not_selected',
      'withdrawn_before_start'
    );

  -- Old/orphan race results whose rider no longer exists.
  select count(*)::int
  into v_missing_rider_result_rows
  from public.race_stage_results rsr
  join public.race_stages st
    on st.id = rsr.stage_id
  join public.races r
    on r.id = rsr.race_id
  left join public.riders rider_exists
    on rider_exists.id = rsr.rider_id
  where (p_stage_id is null or rsr.stage_id = p_stage_id)
    and lower(coalesce(rsr.status, 'finished')) not in (
      'dns',
      'did_not_start',
      'not_started',
      'not_selected',
      'withdrawn_before_start'
    )
    and rider_exists.id is null;

  -- Valid rows only: race result has a real rider.
  select count(*)::int
  into v_eligible_result_rows
  from public.race_stage_results rsr
  join public.race_stages st
    on st.id = rsr.stage_id
  join public.races r
    on r.id = rsr.race_id
  join public.riders rider_exists
    on rider_exists.id = rsr.rider_id
  where (p_stage_id is null or rsr.stage_id = p_stage_id)
    and lower(coalesce(rsr.status, 'finished')) not in (
      'dns',
      'did_not_start',
      'not_started',
      'not_selected',
      'withdrawn_before_start'
    );

  with raw_src as (
    select
      rsr.rider_id,
      st.stage_date as activity_date,
      rsr.race_id,
      rsr.stage_id,
      rsr.team_id,
      rsr.status,
      rsr.rank as result_rank,
      rsr.elapsed_seconds,
      rsr.gap_seconds,
      r.name as race_name,
      r.category as race_category,
      r.race_type,
      r.is_stage_race,
      st.stage_number,
      st.name as stage_name,
      st.stage_format,
      st.terrain_type,
      st.distance_km,
      st.elevation_gain_m,
      st.hilly_pct,
      st.mountain_pct,
      case
        when lower(coalesce(st.stage_format, '')) in (
          'individual_time_trial',
          'team_time_trial',
          'time_trial',
          'prologue'
        ) then 'hard'
        when lower(coalesce(st.terrain_type, '')) like '%mountain%'
          or coalesce(st.mountain_pct, 0) >= 25
          or coalesce(st.elevation_gain_m, 0) >= 2500 then 'hard'
        when lower(coalesce(st.terrain_type, '')) like '%hilly%'
          or coalesce(st.hilly_pct, 0) >= 35
          or coalesce(st.distance_km, 0) >= 180 then 'hard'
        else 'normal'
      end as intensity,
      case
        when lower(coalesce(st.stage_format, '')) in (
          'individual_time_trial',
          'team_time_trial',
          'time_trial',
          'prologue'
        ) then 20
        when lower(coalesce(st.terrain_type, '')) like '%mountain%'
          or coalesce(st.mountain_pct, 0) >= 25
          or coalesce(st.elevation_gain_m, 0) >= 2500 then 30
        when lower(coalesce(st.terrain_type, '')) like '%hilly%'
          or coalesce(st.hilly_pct, 0) >= 35
          or coalesce(st.distance_km, 0) >= 180 then 24
        else 16
      end::smallint as fatigue_load
    from public.race_stage_results rsr
    join public.race_stages st
      on st.id = rsr.stage_id
    join public.races r
      on r.id = rsr.race_id
    join public.riders rider_exists
      on rider_exists.id = rsr.rider_id
    where (p_stage_id is null or rsr.stage_id = p_stage_id)
      and lower(coalesce(rsr.status, 'finished')) not in (
        'dns',
        'did_not_start',
        'not_started',
        'not_selected',
        'withdrawn_before_start'
      )
  ),
  ranked_src as (
    select
      raw_src.*,
      count(*) over (
        partition by raw_src.rider_id, raw_src.activity_date
      )::int as same_day_source_rows,
      row_number() over (
        partition by raw_src.rider_id, raw_src.activity_date
        order by
          raw_src.fatigue_load desc,
          case when raw_src.intensity = 'hard' then 2 else 1 end desc,
          coalesce(raw_src.result_rank, 999999) asc,
          raw_src.stage_id
      ) as rn
    from raw_src
  ),
  src as (
    select *
    from ranked_src
    where rn = 1
  ),
  upserted as (
    insert into public.rider_daily_activity (
      rider_id,
      activity_date,
      participated,
      source,
      activity_type,
      intensity,
      fatigue_load,
      recovery_bonus,
      source_id,
      metadata
    )
    select
      s.rider_id,
      s.activity_date,
      true,
      'race',
      'race',
      s.intensity,
      s.fatigue_load,
      0,
      s.stage_id,
      jsonb_build_object(
        'race_id', s.race_id,
        'stage_id', s.stage_id,
        'team_id', s.team_id,
        'race_name', coalesce(s.race_name, ''),
        'race_category', coalesce(s.race_category, ''),
        'race_type', coalesce(s.race_type, ''),
        'is_stage_race', coalesce(s.is_stage_race, false),
        'stage_number', s.stage_number,
        'stage_name', coalesce(s.stage_name, ''),
        'stage_format', coalesce(s.stage_format, ''),
        'terrain_type', coalesce(s.terrain_type, ''),
        'distance_km', s.distance_km,
        'elevation_gain_m', s.elevation_gain_m,
        'result_status', s.status,
        'result_rank', s.result_rank,
        'elapsed_seconds', s.elapsed_seconds,
        'gap_seconds', s.gap_seconds,
        'same_day_source_rows', s.same_day_source_rows,
        'dedupe_rule', 'highest_fatigue_then_best_rank',
        'source', 'race_stage_results_backfill'
      )
    from src s
    on conflict (rider_id, activity_date) do update
    set
      participated = true,
      source = 'race',
      activity_type = 'race',
      intensity = case
        when public.rider_daily_activity.intensity = 'hard'
          or excluded.intensity = 'hard'
        then 'hard'
        else excluded.intensity
      end,
      fatigue_load = greatest(
        public.rider_daily_activity.fatigue_load,
        excluded.fatigue_load
      ),
      recovery_bonus = 0,
      source_id = excluded.source_id,
      metadata = coalesce(public.rider_daily_activity.metadata, '{}'::jsonb)
        || excluded.metadata
    returning 1
  )
  select count(*)::int
  into v_upserted_count
  from upserted;

  return jsonb_build_object(
    'status', 'completed',
    'stage_id', p_stage_id,
    'source_result_rows', v_source_result_rows,
    'eligible_result_rows', v_eligible_result_rows,
    'missing_rider_result_rows_skipped', v_missing_rider_result_rows,
    'race_activity_rows_upserted', v_upserted_count,
    'deduplicated_valid_source_rows', greatest(v_eligible_result_rows - v_upserted_count, 0),
    'dedupe_rule', 'one rider per activity_date, highest fatigue row wins',
    'missing_rider_policy', 'skipped because rider_daily_activity requires an existing riders.id'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public._job_rate_limit_can_run_v1(p_job_name text, p_min_interval interval)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_last_finished_at timestamptz;
begin
  select last_finished_at
    into v_last_finished_at
  from public.system_job_rate_limits_v1
  where job_name = p_job_name;

  if v_last_finished_at is not null
     and v_last_finished_at > now() - p_min_interval then
    return false;
  end if;

  insert into public.system_job_rate_limits_v1(job_name, last_started_at, updated_at)
  values (p_job_name, now(), now())
  on conflict (job_name)
  do update set
    last_started_at = excluded.last_started_at,
    updated_at = now();

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._job_rate_limit_finish_v1(p_job_name text, p_result jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.system_job_rate_limits_v1
  set
    last_finished_at = now(),
    last_result = p_result,
    updated_at = now()
  where job_name = p_job_name;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_race_stage_automation_guarded_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lock_key bigint := hashtext('process_race_stage_automation_guarded_v1');
  v_result jsonb;
begin
  if not pg_try_advisory_lock(v_lock_key) then
    return jsonb_build_object('status', 'skipped_already_running', 'job', 'process_race_stage_automation');
  end if;

  begin
    if not public._job_rate_limit_can_run_v1('process_race_stage_automation', interval '5 minutes') then
      perform pg_advisory_unlock(v_lock_key);
      return jsonb_build_object('status', 'skipped_rate_limited', 'job', 'process_race_stage_automation');
    end if;

    select to_jsonb(public.process_race_stage_automation_v1())
      into v_result;

    perform public._job_rate_limit_finish_v1('process_race_stage_automation', v_result);
    perform pg_advisory_unlock(v_lock_key);

    return jsonb_build_object('status', 'completed', 'job', 'process_race_stage_automation', 'result', v_result);

  exception when others then
    perform public._job_rate_limit_finish_v1(
      'process_race_stage_automation',
      jsonb_build_object('status', 'error', 'message', sqlerrm)
    );
    perform pg_advisory_unlock(v_lock_key);
    raise;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_daily_tick_guarded_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lock_key bigint := hashtext('run_daily_tick_guarded_v1');
  v_result jsonb;
begin
  if not pg_try_advisory_lock(v_lock_key) then
    return jsonb_build_object('status', 'skipped_already_running', 'job', 'daily_tick');
  end if;

  begin
    if not public._job_rate_limit_can_run_v1('daily_tick_if_needed', interval '15 minutes') then
      perform pg_advisory_unlock(v_lock_key);
      return jsonb_build_object('status', 'skipped_rate_limited', 'job', 'daily_tick');
    end if;

    select to_jsonb(public.run_daily_tick_if_needed())
      into v_result;

    perform public._job_rate_limit_finish_v1('daily_tick_if_needed', v_result);
    perform pg_advisory_unlock(v_lock_key);

    return jsonb_build_object('status', 'completed', 'job', 'daily_tick', 'result', v_result);

  exception when others then
    perform public._job_rate_limit_finish_v1(
      'daily_tick_if_needed',
      jsonb_build_object('status', 'error', 'message', sqlerrm)
    );
    perform pg_advisory_unlock(v_lock_key);
    raise;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.expire_rider_transfer_market_state_guarded_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lock_key bigint := hashtext('expire_rider_transfer_market_state_guarded_v1');
  v_result jsonb;
begin
  if not pg_try_advisory_lock(v_lock_key) then
    return jsonb_build_object('status', 'skipped_already_running', 'job', 'transfer_market_expiry');
  end if;

  begin
    if not public._job_rate_limit_can_run_v1('transfer_market_expiry', interval '1 hour') then
      perform pg_advisory_unlock(v_lock_key);
      return jsonb_build_object('status', 'skipped_rate_limited', 'job', 'transfer_market_expiry');
    end if;

    select to_jsonb(public.expire_rider_transfer_market_state())
      into v_result;

    perform public._job_rate_limit_finish_v1('transfer_market_expiry', v_result);
    perform pg_advisory_unlock(v_lock_key);

    return jsonb_build_object('status', 'completed', 'job', 'transfer_market_expiry', 'result', v_result);

  exception when others then
    perform public._job_rate_limit_finish_v1(
      'transfer_market_expiry',
      jsonb_build_object('status', 'error', 'message', sqlerrm)
    );
    perform pg_advisory_unlock(v_lock_key);
    raise;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_process_weekly_rider_wages_guarded_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lock_key bigint := hashtext('finance_process_weekly_rider_wages_guarded_v1');
  v_result jsonb;
begin
  if not pg_try_advisory_lock(v_lock_key) then
    return jsonb_build_object('status', 'skipped_already_running', 'job', 'weekly_rider_wages');
  end if;

  begin
    -- Shared payroll lock: rider and staff payroll can never interleave their
    -- club-finance locking sequences, even if schedules are accidentally aligned.
    perform pg_advisory_xact_lock(
      hashtextextended('finance_weekly_payroll_global_v1', 0)
    );

    if not public._job_rate_limit_can_run_v1('weekly_rider_wages', interval '12 hours') then
      perform pg_advisory_unlock(v_lock_key);
      return jsonb_build_object('status', 'skipped_rate_limited', 'job', 'weekly_rider_wages');
    end if;

    select to_jsonb(public.finance_process_weekly_rider_wages())
      into v_result;

    perform public._job_rate_limit_finish_v1('weekly_rider_wages', v_result);
    perform pg_advisory_unlock(v_lock_key);

    return jsonb_build_object('status', 'completed', 'job', 'weekly_rider_wages', 'result', v_result);

  exception when others then
    perform public._job_rate_limit_finish_v1(
      'weekly_rider_wages',
      jsonb_build_object('status', 'error', 'message', sqlerrm)
    );
    perform pg_advisory_unlock(v_lock_key);
    raise;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_due_game_notifications_scheduler_guarded_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lock_key bigint := hashtext('process_due_game_notifications_scheduler_guarded_v1');
  v_result jsonb;
begin
  if not pg_try_advisory_lock(v_lock_key) then
    return jsonb_build_object('status', 'skipped_already_running', 'job', 'game_notifications_scheduler');
  end if;

  begin
    if not public._job_rate_limit_can_run_v1('game_notifications_scheduler', interval '15 minutes') then
      perform pg_advisory_unlock(v_lock_key);
      return jsonb_build_object('status', 'skipped_rate_limited', 'job', 'game_notifications_scheduler');
    end if;

    select to_jsonb(public.process_due_game_notifications_scheduler_v1())
      into v_result;

    perform public._job_rate_limit_finish_v1('game_notifications_scheduler', v_result);
    perform pg_advisory_unlock(v_lock_key);

    return jsonb_build_object('status', 'completed', 'job', 'game_notifications_scheduler', 'result', v_result);

  exception when others then
    perform public._job_rate_limit_finish_v1(
      'game_notifications_scheduler',
      jsonb_build_object('status', 'error', 'message', sqlerrm)
    );
    perform pg_advisory_unlock(v_lock_key);
    raise;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_check_replay_density_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '120s'
AS $function$
declare
  v_stage record;

  v_replay_frame_rows integer := 0;
  v_avg_replay_row_bytes numeric := 0;
  v_estimated_row_bytes numeric := 0;
  v_estimated_metadata_bytes numeric := 0;
  v_metadata_percent numeric := 0;
  v_replay_rows_per_km numeric := 0;

  v_base_max_replay_rows_per_stage integer := 5000;
  v_effective_max_replay_rows_per_stage integer := 5000;
  v_max_replay_rows_per_km numeric := 60;
  v_max_avg_row_bytes numeric := 5000;

  v_violates_stage_row_cap boolean := false;
  v_violates_rows_per_km_cap boolean := false;
  v_violates_avg_row_size_cap boolean := false;

  v_has_hard_violation boolean := false;
  v_metadata_bloat_level text := 'unknown';
  v_generation_pattern text := 'normal_or_review';
  v_problem_type text := 'acceptable_or_review';
  v_recommendation text := 'No immediate replay-density action required.';
begin
  perform set_config('statement_timeout', '120s', true);

  select
    s.id as stage_id,
    s.race_id,
    r.name as race_name,
    r.category as race_category,
    s.stage_number,
    coalesce(s.stage_format, 'road_race') as stage_format,
    s.distance_km
  into v_stage
  from public.race_stages s
  join public.races r
    on r.id = s.race_id
  where s.id = p_stage_id;

  if not found then
    return jsonb_build_object(
      'status', 'not_found',
      'stage_id', p_stage_id,
      'has_violation', false,
      'recommendation', 'Stage not found.'
    );
  end if;

  select
    count(*)::integer,
    coalesce(avg(pg_column_size(to_jsonb(rf)))::numeric, 0),
    coalesce(sum(pg_column_size(to_jsonb(rf)))::numeric, 0),
    coalesce(sum(pg_column_size(coalesce(to_jsonb(rf)->'metadata', 'null'::jsonb)))::numeric, 0)
  into
    v_replay_frame_rows,
    v_avg_replay_row_bytes,
    v_estimated_row_bytes,
    v_estimated_metadata_bytes
  from public.race_stage_replay_frames rf
  where rf.stage_id = p_stage_id;

  if coalesce(v_replay_frame_rows, 0) = 0 then
    return jsonb_build_object(
      'status', 'not_found',
      'stage_id', p_stage_id,
      'has_violation', false,
      'recommendation', 'No replay frames found for this stage, or replay density audit view has no row.'
    );
  end if;

  v_replay_rows_per_km :=
    case
      when coalesce(v_stage.distance_km, 0) > 0
      then round((v_replay_frame_rows::numeric / v_stage.distance_km::numeric), 2)
      else 0
    end;

  v_effective_max_replay_rows_per_stage :=
    greatest(
      v_base_max_replay_rows_per_stage,
      ceil(coalesce(v_stage.distance_km, 0)::numeric * v_max_replay_rows_per_km)::integer
    );

  v_metadata_percent :=
    case
      when coalesce(v_estimated_row_bytes, 0) > 0
      then round((v_estimated_metadata_bytes / v_estimated_row_bytes) * 100, 2)
      else 0
    end;

  v_violates_stage_row_cap := v_replay_frame_rows > v_effective_max_replay_rows_per_stage;
  v_violates_rows_per_km_cap := v_replay_rows_per_km > v_max_replay_rows_per_km;
  v_violates_avg_row_size_cap := v_avg_replay_row_bytes > v_max_avg_row_bytes;

  v_has_hard_violation := v_violates_stage_row_cap or v_violates_rows_per_km_cap;

  v_metadata_bloat_level :=
    case
      when v_metadata_percent >= 65 then 'high_metadata_bloat'
      when v_metadata_percent >= 45 then 'medium_metadata_bloat'
      else 'low_metadata_bloat'
    end;

  v_generation_pattern :=
    case
      when v_has_hard_violation then 'dense_replay_review'
      else 'normal_or_review'
    end;

  v_problem_type :=
    case
      when v_violates_rows_per_km_cap then 'rows_per_km_violation'
      when v_violates_stage_row_cap then 'dynamic_stage_row_cap_violation'
      when v_violates_avg_row_size_cap then 'avg_row_size_warning_only'
      else 'acceptable_or_review'
    end;

  v_recommendation :=
    case
      when v_has_hard_violation
      then 'Hard replay-density violation. Compaction may be required before closeout.'
      when v_violates_avg_row_size_cap
      then 'Average row size warning only. Do not block closeout; compaction cannot reliably fix metadata row size.'
      else 'No immediate replay-density action required.'
    end;

  return jsonb_build_object(
    'status', 'checked',
    'stage_id', v_stage.stage_id,
    'race_name', v_stage.race_name,
    'race_category', upper(v_stage.race_category),
    'stage_number', v_stage.stage_number,
    'stage_format', v_stage.stage_format,
    'distance_km', v_stage.distance_km,

    'has_violation', v_has_hard_violation,
    'recommendation', v_recommendation,

    'replay_frame_rows', v_replay_frame_rows,
    'replay_rows_per_km', v_replay_rows_per_km,
    'avg_replay_row_bytes', round(v_avg_replay_row_bytes, 2),

    'base_max_replay_rows_per_stage', v_base_max_replay_rows_per_stage,
    'effective_max_replay_rows_per_stage', v_effective_max_replay_rows_per_stage,
    'max_replay_rows_per_stage', v_effective_max_replay_rows_per_stage,
    'max_replay_rows_per_km', v_max_replay_rows_per_km,
    'max_avg_row_bytes', v_max_avg_row_bytes,

    'violates_stage_row_cap', v_violates_stage_row_cap,
    'violates_rows_per_km_cap', v_violates_rows_per_km_cap,
    'violates_avg_row_size_cap', v_violates_avg_row_size_cap,
    'avg_row_size_is_warning_only', true,

    'estimated_replay_row_size', pg_size_pretty(greatest(coalesce(v_estimated_row_bytes, 0), 0)::bigint),
    'estimated_metadata_size', pg_size_pretty(greatest(coalesce(v_estimated_metadata_bytes, 0), 0)::bigint),
    'metadata_percent_of_estimated_row_size', v_metadata_percent,
    'metadata_bloat_level', v_metadata_bloat_level,

    'generation_pattern', v_generation_pattern,
    'replay_density_problem_type', v_problem_type,
    'density_helper_version', 'phase_3b_46_dynamic_stage_row_cap'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_assert_replay_density_safe_v1(p_stage_id uuid, p_raise boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_check jsonb;
  v_has_violation boolean;
begin
  v_check := public.race_engine_check_replay_density_v1(p_stage_id);
  v_has_violation := coalesce((v_check ->> 'has_violation')::boolean, false);

  if p_raise = true and v_has_violation = true then
    raise exception 'Replay density violation for stage %. Details: %', p_stage_id, v_check;
  end if;

  return v_check;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_try_stage_processing_lock_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_locked boolean;
begin
  if p_stage_id is null then
    return jsonb_build_object(
      'status', 'error',
      'locked', false,
      'reason', 'stage_id_is_null'
    );
  end if;

  select pg_try_advisory_xact_lock(
    hashtext('ppm_race_engine_stage_lock'),
    hashtext(p_stage_id::text)
  )
  into v_locked;

  return jsonb_build_object(
    'status', case when v_locked then 'locked' else 'already_locked' end,
    'stage_id', p_stage_id,
    'locked', v_locked,
    'lock_scope', 'transaction',
    'recommendation',
      case
        when v_locked then 'Stage processing lock acquired for this transaction.'
        else 'Another transaction already holds the stage processing lock. Do not run simulation/rebuild now.'
      end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_assert_stage_can_simulate_v1(p_stage_id uuid, p_raise boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_guard jsonb;
  v_should_block boolean;
begin
  v_guard := public.race_engine_get_stage_production_guard_v1(p_stage_id);

  v_should_block := coalesce(
    (v_guard ->> 'should_block_normal_simulation')::boolean,
    true
  );

  if p_raise = true and v_should_block = true then
    raise exception 'Race stage % already has simulation/output state. Normal simulation is blocked. Guard: %',
      p_stage_id,
      v_guard;
  end if;

  return v_guard;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.homepage_player_reviews_set_updated_at_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_homepage_player_review_v1(p_reviewer_name text, p_reviewer_email text, p_rating integer, p_review_text text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_name text := trim(coalesce(p_reviewer_name, ''));
  v_email text := lower(trim(coalesce(p_reviewer_email, '')));
  v_text text := trim(coalesce(p_review_text, ''));
  v_rating integer := coalesce(p_rating, 0);
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_existing_id uuid;
  v_review_id uuid;
begin
  if length(v_name) < 2 then
    raise exception 'Please enter your name.';
  end if;

  if length(v_name) > 80 then
    raise exception 'Name is too long.';
  end if;

  if length(v_email) < 5 or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address.';
  end if;

  if length(v_email) > 160 then
    raise exception 'Email is too long.';
  end if;

  if v_rating < 1 or v_rating > 5 then
    raise exception 'Please choose a rating from 1 to 5.';
  end if;

  if length(v_text) < 20 then
    raise exception 'Please write at least 20 characters.';
  end if;

  if length(v_text) > 1200 then
    raise exception 'Review is too long.';
  end if;

  select r.id
  into v_existing_id
  from public.homepage_player_reviews r
  where
    r.status in ('pending', 'approved')
    and (
      lower(r.reviewer_email) = v_email
      or (v_user_id is not null and r.user_id = v_user_id)
    )
  order by r.created_at desc
  limit 1;

  if v_existing_id is not null then
    update public.homepage_player_reviews r
    set
      user_id = coalesce(v_user_id, r.user_id),
      reviewer_name = v_name,
      reviewer_email = v_email,
      rating = v_rating,
      review_text = v_text,
      status = 'pending',
      moderation_note = null,
      approved_at = null,
      approved_by = null,
      rejected_at = null,
      rejected_by = null,
      metadata = v_metadata
    where r.id = v_existing_id
    returning r.id into v_review_id;
  else
    insert into public.homepage_player_reviews (
      user_id,
      reviewer_name,
      reviewer_email,
      rating,
      review_text,
      status,
      source,
      metadata
    )
    values (
      v_user_id,
      v_name,
      v_email,
      v_rating,
      v_text,
      'pending',
      'homepage',
      v_metadata
    )
    returning id into v_review_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'review_id', v_review_id,
    'status', 'pending',
    'message', 'Thank you. Your review was submitted and will appear after approval.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_get_homepage_review_queue_v1()
 RETURNS TABLE(id uuid, user_id uuid, reviewer_name text, reviewer_email text, rating smallint, review_text text, status text, moderation_note text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  return query
  select
    r.id,
    r.user_id,
    r.reviewer_name,
    r.reviewer_email,
    r.rating,
    r.review_text,
    r.status,
    r.moderation_note,
    r.created_at,
    r.updated_at
  from public.homepage_player_reviews r
  where r.status = 'pending'
  order by r.created_at asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_moderate_homepage_player_review_v1(p_review_id uuid, p_status text, p_moderation_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_review_id uuid;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if v_status not in ('approved', 'rejected') then
    raise exception 'Status must be approved or rejected.'
      using errcode = '22023';
  end if;

  if v_status = 'approved' then
    update public.homepage_player_reviews r
    set
      status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      rejected_at = null,
      rejected_by = null,
      moderation_note = nullif(trim(coalesce(p_moderation_note, '')), '')
    where r.id = p_review_id
      and r.status = 'pending'
    returning r.id into v_review_id;

    if v_review_id is null then
      raise exception 'Pending review not found.'
        using errcode = 'P0002';
    end if;

    return jsonb_build_object(
      'ok', true,
      'review_id', v_review_id,
      'status', 'approved'
    );
  end if;

  delete from public.homepage_player_reviews r
  where r.id = p_review_id
    and r.status = 'pending'
  returning r.id into v_review_id;

  if v_review_id is null then
    raise exception 'Pending review not found.'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'ok', true,
    'review_id', v_review_id,
    'status', 'deleted'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_cleanup_orphan_prize_awards_for_stage_v1(p_stage_id uuid, p_reason text DEFAULT 'orphan prize_awards cleanup'::text, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_integrity public.race_engine_stage_output_integrity_v1%rowtype;
  v_candidate boolean;
  v_prize_rows integer;
  v_paid_like_rows integer;
  v_deleted jsonb;
begin
  select *
  into v_integrity
  from public.race_engine_stage_output_integrity_v1
  where stage_id = p_stage_id;

  if not found then
    return jsonb_build_object(
      'status', 'blocked',
      'stage_id', p_stage_id,
      'dry_run', p_dry_run,
      'reason', 'stage_not_found'
    );
  end if;

  v_candidate :=
    v_integrity.simulation_run_rows = 0
    and v_integrity.completed_simulation_run_rows = 0
    and v_integrity.stage_result_rows = 0
    and v_integrity.stage_point_result_rows = 0
    and v_integrity.classification_rows = 0
    and v_integrity.ranking_award_rows = 0
    and v_integrity.prize_award_rows > 0
    and v_integrity.replay_frame_rows = 0
    and v_integrity.rider_state_rows = 0
    and v_integrity.team_state_rows = 0;

  if v_candidate = false then
    return jsonb_build_object(
      'status', 'blocked',
      'stage_id', p_stage_id,
      'dry_run', p_dry_run,
      'reason', 'stage_is_not_safe_shape_for_orphan_prize_cleanup',
      'integrity_status', v_integrity.output_integrity_status,
      'simulation_run_rows', v_integrity.simulation_run_rows,
      'stage_result_rows', v_integrity.stage_result_rows,
      'stage_point_result_rows', v_integrity.stage_point_result_rows,
      'classification_rows', v_integrity.classification_rows,
      'ranking_award_rows', v_integrity.ranking_award_rows,
      'prize_award_rows', v_integrity.prize_award_rows,
      'replay_frame_rows', v_integrity.replay_frame_rows,
      'rider_state_rows', v_integrity.rider_state_rows,
      'team_state_rows', v_integrity.team_state_rows
    );
  end if;

  select count(*)::integer
  into v_prize_rows
  from public.race_prize_awards pa
  where coalesce(
    nullif(to_jsonb(pa)->>'after_stage_id', '')::uuid,
    nullif(to_jsonb(pa)->>'stage_id', '')::uuid
  ) = p_stage_id;

  select count(*)::integer
  into v_paid_like_rows
  from public.race_prize_awards pa
  where coalesce(
    nullif(to_jsonb(pa)->>'after_stage_id', '')::uuid,
    nullif(to_jsonb(pa)->>'stage_id', '')::uuid
  ) = p_stage_id
  and (
    lower(coalesce(to_jsonb(pa)->>'payment_status', '')) in ('paid', 'processed', 'complete', 'completed')
    or lower(coalesce(to_jsonb(pa)->>'status', '')) in ('paid', 'processed', 'complete', 'completed')
    or lower(coalesce(to_jsonb(pa)->>'is_paid', 'false')) = 'true'
    or lower(coalesce(to_jsonb(pa)->>'paid', 'false')) = 'true'
    or nullif(to_jsonb(pa)->>'paid_at', '') is not null
    or nullif(to_jsonb(pa)->>'processed_at', '') is not null
  );

  if v_paid_like_rows > 0 then
    return jsonb_build_object(
      'status', 'blocked',
      'stage_id', p_stage_id,
      'dry_run', p_dry_run,
      'reason', 'prize_awards_look_paid_or_processed',
      'prize_award_rows', v_prize_rows,
      'paid_like_rows', v_paid_like_rows
    );
  end if;

  if p_dry_run = true then
    return jsonb_build_object(
      'status', 'dry_run_ok',
      'stage_id', p_stage_id,
      'race_name', v_integrity.race_name,
      'stage_number', v_integrity.stage_number,
      'dry_run', true,
      'would_delete_prize_award_rows', v_prize_rows,
      'paid_like_rows', v_paid_like_rows,
      'reason', p_reason
    );
  end if;

  with deleted as (
    delete from public.race_prize_awards pa
    where coalesce(
      nullif(to_jsonb(pa)->>'after_stage_id', '')::uuid,
      nullif(to_jsonb(pa)->>'stage_id', '')::uuid
    ) = p_stage_id
    returning to_jsonb(pa) as row_json
  )
  select jsonb_agg(row_json)
  into v_deleted
  from deleted;

  update public.race_engine_stage_output_resolution_v1
  set
    resolution_type = 'manual_review_required',
    normal_simulation_should_remain_blocked = false,
    reason = concat(
      'Orphan prize_awards cleaned. Previous reason: ',
      p_reason,
      '. Deleted rows: ',
      coalesce(jsonb_array_length(v_deleted), 0)::text
    ),
    updated_at = now()
  where stage_id = p_stage_id;

  return jsonb_build_object(
    'status', 'cleaned',
    'stage_id', p_stage_id,
    'race_name', v_integrity.race_name,
    'stage_number', v_integrity.stage_number,
    'dry_run', false,
    'deleted_prize_award_rows', coalesce(jsonb_array_length(v_deleted), 0),
    'deleted_rows_snapshot', coalesce(v_deleted, '[]'::jsonb),
    'reason', p_reason
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_reverse_paid_orphan_prize_finance_for_stage_v1(p_stage_id uuid, p_reason text DEFAULT 'paid orphan race prize finance reversal'::text, p_dry_run boolean DEFAULT true, p_confirm_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_summary record;
  v_plan_json jsonb;
  v_per_club_json jsonb;
  v_existing_reversal_tx_count integer;
  v_planned_rows integer;
  v_lock_result jsonb;
  v_locked boolean;
  v_row record;
  v_result jsonb;
begin
  -- ----------------------------------------------------------
  -- A. Load summary
  -- ----------------------------------------------------------

  select *
  into v_summary
  from public.race_engine_paid_orphan_prize_reversal_plan_summary_v1
  where stage_id = p_stage_id;

  if not found then
    v_result := jsonb_build_object(
      'status', 'blocked',
      'reason', 'no_reversal_plan_found_for_stage',
      'stage_id', p_stage_id,
      'dry_run', p_dry_run
    );

    insert into public.race_engine_paid_orphan_prize_reversal_audit_v1 (
      stage_id,
      dry_run,
      status,
      reason,
      summary
    )
    values (
      p_stage_id,
      p_dry_run,
      'blocked',
      'no_reversal_plan_found_for_stage',
      v_result
    );

    return v_result;
  end if;

  select count(*)::integer
  into v_planned_rows
  from public.race_engine_paid_orphan_prize_reversal_plan_rows_v1
  where stage_id = p_stage_id;


  -- ----------------------------------------------------------
  -- B. Existing reversal transaction check
  -- ----------------------------------------------------------

  select count(*)::integer
  into v_existing_reversal_tx_count
  from finance.transactions t
  where t.idempotency_key in (
    select planned_idempotency_key
    from public.race_engine_paid_orphan_prize_reversal_plan_rows_v1
    where stage_id = p_stage_id
  );


  -- ----------------------------------------------------------
  -- C. Build JSON details
  -- ----------------------------------------------------------

  select jsonb_agg(
    jsonb_build_object(
      'source_transaction_type', source_transaction_type,
      'source_transaction_id', source_transaction_id,
      'race_prize_award_id', race_prize_award_id,
      'source_tax_parent_transaction_id', source_tax_parent_transaction_id,
      'correction_club_id', correction_club_id,
      'team_name', team_name,
      'rider_name', rider_name,
      'planned_operation_type', planned_operation_type,
      'planned_function_candidate', planned_function_candidate,
      'planned_amount', planned_amount,
      'planned_finance_type', planned_finance_type,
      'planned_source_or_sink_code', planned_source_or_sink_code,
      'planned_idempotency_key', planned_idempotency_key,
      'planned_row_is_safe_shape', planned_row_is_safe_shape,
      'planned_row_status', planned_row_status
    )
    order by source_transaction_type, race_prize_award_id, source_transaction_id
  )
  into v_plan_json
  from public.race_engine_paid_orphan_prize_reversal_plan_rows_v1
  where stage_id = p_stage_id;

  select jsonb_agg(
    jsonb_build_object(
      'correction_club_id', correction_club_id,
      'team_name', team_name,
      'gross_prize_to_remove', coalesce(gross_prize_to_remove, 0),
      'tax_to_refund', coalesce(tax_to_refund, 0),
      'net_balance_reduction', coalesce(net_balance_reduction, 0),
      'all_rows_safe_shape', all_rows_safe_shape
    )
    order by team_name
  )
  into v_per_club_json
  from (
    select
      correction_club_id,
      team_name,
      sum(planned_amount) filter (
        where source_transaction_type = 'race_prize'
      ) as gross_prize_to_remove,
      sum(planned_amount) filter (
        where source_transaction_type = 'tax_withholding'
      ) as tax_to_refund,
      coalesce(
        sum(planned_amount) filter (where source_transaction_type = 'race_prize'),
        0
      )
      -
      coalesce(
        sum(planned_amount) filter (where source_transaction_type = 'tax_withholding'),
        0
      ) as net_balance_reduction,
      bool_and(planned_row_is_safe_shape) as all_rows_safe_shape
    from public.race_engine_paid_orphan_prize_reversal_plan_rows_v1
    where stage_id = p_stage_id
    group by correction_club_id, team_name
  ) club_plan;


  -- ----------------------------------------------------------
  -- D. Safety checks
  -- ----------------------------------------------------------

  if coalesce(v_summary.all_rows_safe_shape, false) = false then
    v_result := jsonb_build_object(
      'status', 'blocked',
      'reason', 'reversal_plan_has_unsafe_rows',
      'stage_id', p_stage_id,
      'dry_run', p_dry_run,
      'blocked_plan_rows', v_summary.blocked_plan_rows,
      'planned_rows', coalesce(v_plan_json, '[]'::jsonb)
    );

    insert into public.race_engine_paid_orphan_prize_reversal_audit_v1 (
      stage_id,
      dry_run,
      status,
      reason,
      planned_reversal_rows,
      existing_reversal_transaction_rows,
      summary
    )
    values (
      p_stage_id,
      p_dry_run,
      'blocked',
      'reversal_plan_has_unsafe_rows',
      v_planned_rows,
      v_existing_reversal_tx_count,
      v_result
    );

    return v_result;
  end if;

  if v_existing_reversal_tx_count > 0 then
    v_result := jsonb_build_object(
      'status', 'blocked',
      'reason', 'reversal_transactions_already_exist_review_before_rerun',
      'stage_id', p_stage_id,
      'dry_run', p_dry_run,
      'existing_reversal_transaction_rows', v_existing_reversal_tx_count,
      'planned_rows', coalesce(v_plan_json, '[]'::jsonb)
    );

    insert into public.race_engine_paid_orphan_prize_reversal_audit_v1 (
      stage_id,
      dry_run,
      status,
      reason,
      planned_reversal_rows,
      existing_reversal_transaction_rows,
      summary
    )
    values (
      p_stage_id,
      p_dry_run,
      'blocked',
      'reversal_transactions_already_exist_review_before_rerun',
      v_planned_rows,
      v_existing_reversal_tx_count,
      v_result
    );

    return v_result;
  end if;


  -- ----------------------------------------------------------
  -- E. Dry run returns here, with no finance changes
  -- ----------------------------------------------------------

  if p_dry_run = true then
    v_result := jsonb_build_object(
      'status', 'dry_run_ok_no_changes_made',
      'stage_id', p_stage_id,
      'race_name', v_summary.race_name,
      'stage_number', v_summary.stage_number,
      'dry_run', true,
      'planned_reversal_rows', v_summary.planned_reversal_rows,
      'race_prize_reversal_rows', v_summary.race_prize_reversal_rows,
      'tax_withholding_reversal_rows', v_summary.tax_withholding_reversal_rows,
      'gross_prize_to_remove_from_clubs', v_summary.gross_prize_to_remove_from_clubs,
      'tax_to_refund_to_clubs', v_summary.tax_to_refund_to_clubs,
      'net_balance_reduction_after_tax_refund', v_summary.net_balance_reduction_after_tax_refund,
      'existing_reversal_transaction_rows', v_existing_reversal_tx_count,
      'per_club_plan', coalesce(v_per_club_json, '[]'::jsonb),
      'planned_rows', coalesce(v_plan_json, '[]'::jsonb),
      'next_step', 'If approved, run with p_dry_run=false and confirmation text.'
    );

    insert into public.race_engine_paid_orphan_prize_reversal_audit_v1 (
      stage_id,
      dry_run,
      status,
      reason,
      planned_reversal_rows,
      existing_reversal_transaction_rows,
      summary
    )
    values (
      p_stage_id,
      true,
      'dry_run_ok_no_changes_made',
      p_reason,
      v_planned_rows,
      v_existing_reversal_tx_count,
      v_result
    );

    return v_result;
  end if;


  -- ----------------------------------------------------------
  -- F. Actual execution protection
  -- ----------------------------------------------------------

  if p_confirm_text is distinct from 'CONFIRM_REVERSE_PAID_ORPHAN_PRIZES' then
    v_result := jsonb_build_object(
      'status', 'blocked',
      'reason', 'missing_or_invalid_confirmation_text',
      'stage_id', p_stage_id,
      'dry_run', false,
      'required_confirm_text', 'CONFIRM_REVERSE_PAID_ORPHAN_PRIZES'
    );

    insert into public.race_engine_paid_orphan_prize_reversal_audit_v1 (
      stage_id,
      dry_run,
      status,
      reason,
      planned_reversal_rows,
      existing_reversal_transaction_rows,
      summary
    )
    values (
      p_stage_id,
      false,
      'blocked',
      'missing_or_invalid_confirmation_text',
      v_planned_rows,
      v_existing_reversal_tx_count,
      v_result
    );

    return v_result;
  end if;

  -- FIXED:
  -- race_engine_try_stage_processing_lock_v1 returns jsonb, not boolean.
  select public.race_engine_try_stage_processing_lock_v1(p_stage_id)
  into v_lock_result;

  v_locked := coalesce((v_lock_result->>'locked')::boolean, false);

  if v_locked = false then
    v_result := jsonb_build_object(
      'status', 'blocked',
      'reason', 'could_not_acquire_stage_processing_lock',
      'stage_id', p_stage_id,
      'dry_run', false,
      'lock_result', v_lock_result
    );

    insert into public.race_engine_paid_orphan_prize_reversal_audit_v1 (
      stage_id,
      dry_run,
      status,
      reason,
      planned_reversal_rows,
      existing_reversal_transaction_rows,
      summary
    )
    values (
      p_stage_id,
      false,
      'blocked',
      'could_not_acquire_stage_processing_lock',
      v_planned_rows,
      v_existing_reversal_tx_count,
      v_result
    );

    return v_result;
  end if;


  -- ----------------------------------------------------------
  -- G. Execute finance corrections
  --
  -- race_prize:
  --   remove invalid gross prize from club using finance_spend_from_club
  --
  -- tax_withholding:
  --   refund invalid tax withholding to club using finance_credit_to_club
  -- ----------------------------------------------------------

  for v_row in
    select *
    from public.race_engine_paid_orphan_prize_reversal_plan_rows_v1
    where stage_id = p_stage_id
    order by
      source_transaction_type,
      race_prize_award_id,
      source_transaction_id
  loop
    if v_row.planned_operation_type = 'reverse_race_prize_credit' then
      perform public.finance_spend_from_club(
        v_row.correction_club_id,
        round(v_row.planned_amount)::bigint,
        v_row.planned_finance_type,
        v_row.planned_source_or_sink_code,
        v_row.planned_idempotency_key,
        v_row.planned_metadata
      );

    elsif v_row.planned_operation_type = 'reverse_tax_withholding_debit' then
      perform public.finance_credit_to_club(
        v_row.correction_club_id,
        round(v_row.planned_amount)::bigint,
        v_row.planned_finance_type,
        v_row.planned_source_or_sink_code,
        v_row.planned_idempotency_key,
        v_row.planned_metadata
      );

    else
      raise exception 'Unsupported planned operation type: %', v_row.planned_operation_type;
    end if;
  end loop;


  -- ----------------------------------------------------------
  -- H. Keep stage blocked after finance reversal
  -- ----------------------------------------------------------

  update public.race_engine_stage_output_resolution_v1 r
  set
    resolution_type = 'manual_review_required',
    normal_simulation_should_remain_blocked = true,
    reason = concat(
      'Finance reversal executed for paid orphan prize rows. Prize_awards remain present and stage remains blocked until prize rows are safely archived/deleted/relabelled. Reason: ',
      p_reason
    ),
    updated_at = now()
  where r.stage_id = p_stage_id;

  v_result := jsonb_build_object(
    'status', 'executed_finance_reversal_stage_still_blocked',
    'stage_id', p_stage_id,
    'race_name', v_summary.race_name,
    'stage_number', v_summary.stage_number,
    'dry_run', false,
    'lock_result', v_lock_result,
    'planned_reversal_rows', v_summary.planned_reversal_rows,
    'race_prize_reversal_rows', v_summary.race_prize_reversal_rows,
    'tax_withholding_reversal_rows', v_summary.tax_withholding_reversal_rows,
    'gross_prize_removed_from_clubs', v_summary.gross_prize_to_remove_from_clubs,
    'tax_refunded_to_clubs', v_summary.tax_to_refund_to_clubs,
    'net_balance_reduction_after_tax_refund', v_summary.net_balance_reduction_after_tax_refund,
    'per_club_plan', coalesce(v_per_club_json, '[]'::jsonb),
    'next_step', 'Audit reversal transactions, then safely handle paid prize_award rows.'
  );

  insert into public.race_engine_paid_orphan_prize_reversal_audit_v1 (
    stage_id,
    dry_run,
    status,
    reason,
    planned_reversal_rows,
    existing_reversal_transaction_rows,
    summary
  )
  values (
    p_stage_id,
    false,
    'executed_finance_reversal_stage_still_blocked',
    p_reason,
    v_planned_rows,
    v_existing_reversal_tx_count,
    v_result
  );

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_rider_recent_form_score_v1(p_rider_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game_date date;
  v_result_count int := 0;
  v_total_points numeric := 0;
  v_recent_points numeric := 0;
  v_previous_points numeric := 0;
  v_trend_points numeric := 0;
  v_score numeric := 0;
begin
  v_game_date := public.get_current_game_date_date();

  if p_rider_id is null or v_game_date is null then
    return 0;
  end if;

  with result_rows as (
    select
      rsr.rider_id,
      rsr.rank as result_rank,
      lower(coalesce(rsr.status, 'finished')) as result_status,
      st.stage_date,
      coalesce(r.category, '') as race_category,
      case
        when upper(coalesce(r.category, '')) like '%UWT%' then 3.0
        when upper(coalesce(r.category, '')) like '%PRO%' then 2.2
        when coalesce(r.category, '') in ('1.1', '2.1') then 1.5
        when coalesce(r.category, '') in ('1.2', '2.2') then 1.0
        else 1.0
      end::numeric as prestige_weight
    from public.race_stage_results rsr
    join public.race_stages st
      on st.id = rsr.stage_id
    join public.races r
      on r.id = rsr.race_id
    where rsr.rider_id = p_rider_id
      and st.stage_date between (v_game_date - 183) and v_game_date
  ),
  scored as (
    select
      rr.*,
      case
        when rr.result_status in (
          'dnf',
          'did_not_finish',
          'abandoned',
          'withdrawn',
          'otl',
          'outside_time_limit'
        ) then -1.50 * rr.prestige_weight

        when rr.result_rank = 1 then 7.00 * rr.prestige_weight
        when rr.result_rank between 2 and 3 then 4.00 * rr.prestige_weight
        when rr.result_rank between 4 and 10 then 1.50 * rr.prestige_weight
        when rr.result_rank between 11 and 25 then 0.40 * rr.prestige_weight

        when rr.result_rank is null then -0.20
        else -0.20
      end::numeric as form_points
    from result_rows rr
  )
  select
    count(*)::int,
    coalesce(sum(form_points), 0),
    coalesce(sum(form_points) filter (where stage_date >= v_game_date - 90), 0),
    coalesce(sum(form_points) filter (where stage_date <  v_game_date - 90), 0)
  into
    v_result_count,
    v_total_points,
    v_recent_points,
    v_previous_points
  from scored;

  if v_result_count = 0 then
    return 0;
  end if;

  /*
    Trend:
    - Better last 90 days than previous 90 days gives a small boost.
    - Worse last 90 days gives a small drop.
    - Trend is capped so it never dominates.
  */
  v_trend_points :=
    greatest(
      -4,
      least(
        4,
        (v_recent_points - v_previous_points) * 0.15
      )
    );

  /*
    Final score:
    - Poor form can go negative.
    - Excellent form can go positive.
    - Capped to keep market/salary effect small.
  */
  v_score :=
    greatest(
      -15,
      least(
        30,
        v_total_points + v_trend_points
      )
    );

  return round(v_score, 2);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_processing_strategy_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_stage jsonb;
  v_stage_format text;

  v_selected_runner text;
  v_selected_finalizer text;

  v_runner_exists boolean;
  v_finalizer_exists boolean;

  v_available_functions jsonb;
begin
  select to_jsonb(i)
  into v_stage
  from public.race_engine_stage_output_integrity_v1 i
  where i.stage_id = p_stage_id;

  if v_stage is null then
    return jsonb_build_object(
      'status', 'stage_not_found',
      'stage_id', p_stage_id,
      'recommendation', 'Cannot process because stage was not found in race_engine_stage_output_integrity_v1.'
    );
  end if;

  v_stage_format := v_stage->>'stage_format';

  v_selected_runner :=
    case
      when v_stage_format in ('road_race', 'road', 'flat', 'hilly', 'mountain')
      then 'run_race_stage_road_race_v1'

      when v_stage_format in ('individual_time_trial', 'prologue')
      then 'run_race_stage_individual_time_trial_v1'

      when v_stage_format in ('team_time_trial')
      then 'run_race_stage_team_time_trial_v1'

      else null
    end;

  v_selected_finalizer :=
    case
      when v_stage_format in ('individual_time_trial', 'prologue', 'team_time_trial')
      then 'race_engine_finalize_time_trial_stage_v1'

      else null
    end;

  select exists (
    select 1
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = v_selected_runner
  )
  into v_runner_exists;

  if v_selected_finalizer is null then
    v_finalizer_exists := true;
  else
    select exists (
      select 1
      from pg_proc p
      join pg_namespace n
        on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = v_selected_finalizer
    )
    into v_finalizer_exists;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'function_name', function_name,
        'identity_arguments', identity_arguments,
        'return_type', return_type,
        'regprocedure_name', regprocedure_name,
        'security_definer', security_definer,
        'anon_can_execute', anon_can_execute,
        'authenticated_can_execute', authenticated_can_execute,
        'service_role_can_execute', service_role_can_execute
      )
      order by function_name, identity_arguments
    ),
    '[]'::jsonb
  )
  into v_available_functions
  from public.race_engine_stage_processing_function_inventory_v1;

  if v_selected_runner is null then
    return jsonb_build_object(
      'status', 'unsupported_stage_format',
      'stage_id', p_stage_id,
      'stage', v_stage,
      'stage_format', v_stage_format,
      'selected_runner_function', null,
      'selected_finalizer_function', v_selected_finalizer,
      'available_functions', v_available_functions,
      'recommendation', 'Stage format is not mapped yet. Add it before official processing.'
    );
  end if;

  if not coalesce(v_runner_exists, false) then
    return jsonb_build_object(
      'status', 'runner_function_missing',
      'stage_id', p_stage_id,
      'stage', v_stage,
      'stage_format', v_stage_format,
      'selected_runner_function', v_selected_runner,
      'selected_finalizer_function', v_selected_finalizer,
      'runner_exists', false,
      'finalizer_exists', v_finalizer_exists,
      'available_functions', v_available_functions,
      'recommendation', 'Selected runner function is missing. Cannot wire official processing yet.'
    );
  end if;

  if not coalesce(v_finalizer_exists, false) then
    return jsonb_build_object(
      'status', 'finalizer_function_missing',
      'stage_id', p_stage_id,
      'stage', v_stage,
      'stage_format', v_stage_format,
      'selected_runner_function', v_selected_runner,
      'selected_finalizer_function', v_selected_finalizer,
      'runner_exists', v_runner_exists,
      'finalizer_exists', false,
      'available_functions', v_available_functions,
      'recommendation', 'Selected finalizer function is missing. Cannot wire official processing yet.'
    );
  end if;

  return jsonb_build_object(
    'status', 'strategy_resolved',
    'stage_id', p_stage_id,
    'stage', v_stage,
    'stage_format', v_stage_format,
    'selected_runner_function', v_selected_runner,
    'selected_finalizer_function', v_selected_finalizer,
    'runner_exists', v_runner_exists,
    'finalizer_exists', v_finalizer_exists,
    'available_functions', v_available_functions,
    'recommendation', 'Strategy resolved. Phase 3A shell can check readiness. Phase 3B will wire execution.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_process_stage_official_v1(p_stage_id uuid, p_dry_run boolean DEFAULT true, p_confirm_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_stage record;

  v_attempt_id uuid;
  v_pipeline_version text := 'phase_3b_road_runner_wired_preflight_auto_tail_v1';

  v_guard_before jsonb := '{}'::jsonb;
  v_guard_after_lock jsonb := '{}'::jsonb;
  v_guard_after jsonb := '{}'::jsonb;
  v_strategy jsonb := '{}'::jsonb;
  v_preflight jsonb := '{}'::jsonb;
  v_lock_result jsonb := '{}'::jsonb;

  v_selected_runner text;
  v_selected_finalizer text;

  v_status text;
  v_reason text;
  v_summary jsonb := '{}'::jsonb;

  v_runner_result jsonb := '{}'::jsonb;
  v_runner_started_at timestamptz;
  v_runner_finished_at timestamptz;

  v_completed_simulation_run_id uuid;
  v_replay_tail_repair_result jsonb := '{}'::jsonb;
  v_replay_tail_repair_started_at timestamptz;
  v_replay_tail_repair_finished_at timestamptz;
begin
  select
    s.id as stage_id,
    s.race_id,
    r.name as race_name,
    coalesce(s.stage_format, 'road_race') as stage_format,
    s.stage_number
  into v_stage
  from public.race_stages s
  join public.races r
    on r.id = s.race_id
  where s.id = p_stage_id
  limit 1;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status', 'stage_not_found',
      'stage_id', p_stage_id,
      'dry_run', p_dry_run,
      'pipeline_version', v_pipeline_version,
      'recommendation', 'Stage was not found. No attempt row was created.'
    );
  end if;

  v_guard_before := public.race_engine_get_stage_production_guard_v1(p_stage_id);
  v_strategy := public.race_engine_get_stage_processing_strategy_v1(p_stage_id);
  v_preflight := public.race_engine_get_stage_processing_preflight_v1(p_stage_id);

  v_selected_runner := nullif(v_strategy->>'selected_runner_function', '');
  v_selected_finalizer := nullif(v_strategy->>'selected_finalizer_function', '');

  insert into public.race_engine_stage_processing_attempts_v1 (
    stage_id,
    race_id,
    race_name,
    stage_number,
    stage_format,
    pipeline_version,
    dry_run,
    status,
    reason,
    selected_runner_function,
    selected_finalizer_function,
    guard_before,
    strategy,
    execution_summary,
    created_at,
    started_at
  )
  values (
    v_stage.stage_id,
    v_stage.race_id,
    v_stage.race_name,
    v_stage.stage_number,
    v_stage.stage_format,
    v_pipeline_version,
    coalesce(p_dry_run, true),
    'started',
    'Official stage processing attempt started.',
    v_selected_runner,
    v_selected_finalizer,
    v_guard_before,
    v_strategy,
    jsonb_build_object(
      'status', 'started',
      'stage_id', v_stage.stage_id,
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_number', v_stage.stage_number,
      'stage_format', v_stage.stage_format,
      'dry_run', coalesce(p_dry_run, true),
      'pipeline_version', v_pipeline_version,
      'guard_before', v_guard_before,
      'strategy', v_strategy,
      'preflight', v_preflight
    ),
    now(),
    now()
  )
  returning id into v_attempt_id;

  if coalesce((v_guard_before->>'should_block_normal_simulation')::boolean, false) then
    v_status := 'blocked_by_production_guard';
    v_reason := 'Production guard blocked simulation because the stage already has official outputs or engine state.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'guard_before', v_guard_before,
      'strategy', v_strategy,
      'preflight', v_preflight,
      'next_step', 'Do not rerun this stage unless outputs are intentionally reset.'
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      execution_summary = v_summary,
      guard_after = v_guard_before,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;
  end if;

  if coalesce(v_strategy->>'status', '') <> 'strategy_resolved' then
    v_status := 'blocked_strategy_not_resolved';
    v_reason := 'No executable strategy was resolved for this stage.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'guard_before', v_guard_before,
      'strategy', v_strategy,
      'preflight', v_preflight
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      execution_summary = v_summary,
      guard_after = v_guard_before,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;
  end if;

  if v_selected_runner <> 'run_race_stage_road_race_v1' then
    v_status := 'blocked_runner_not_wired_in_phase_3b';
    v_reason := 'Only run_race_stage_road_race_v1 is wired in Phase 3B. TT/TTT are handled later.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'selected_runner_function', v_selected_runner,
      'selected_finalizer_function', v_selected_finalizer,
      'guard_before', v_guard_before,
      'strategy', v_strategy,
      'preflight', v_preflight
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      execution_summary = v_summary,
      guard_after = v_guard_before,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;
  end if;

  if not coalesce((v_preflight->>'ready_for_road_runner')::boolean, false) then
    v_status := 'blocked_by_preflight_missing_inputs';
    v_reason := 'Preflight blocked execution because the stage is missing required runner inputs, usually participant teams/riders or segments.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'race_name', v_stage.race_name,
      'stage_number', v_stage.stage_number,
      'stage_format', v_stage.stage_format,
      'dry_run', coalesce(p_dry_run, true),
      'selected_runner_function', v_selected_runner,
      'guard_before', v_guard_before,
      'strategy', v_strategy,
      'preflight', v_preflight,
      'next_step', 'Fix race startlist/participants first, then run dry-run again.'
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      execution_summary = v_summary,
      guard_after = v_guard_before,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;
  end if;

  if coalesce(p_dry_run, true) then
    v_status := 'dry_run_ready_no_changes_made';
    v_reason := 'Stage passed guard, strategy, and preflight checks. No engine execution in dry-run mode.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_number', v_stage.stage_number,
      'stage_format', v_stage.stage_format,
      'dry_run', true,
      'pipeline_version', v_pipeline_version,
      'selected_runner_function', v_selected_runner,
      'selected_finalizer_function', v_selected_finalizer,
      'guard_before', v_guard_before,
      'strategy', v_strategy,
      'preflight', v_preflight,
      'next_step', 'Dry-run passed. Use confirm text for real execution.'
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      execution_summary = v_summary,
      guard_after = v_guard_before,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;
  end if;

  if p_confirm_text is distinct from 'CONFIRM_STAGE_PROCESSING_PIPELINE' then
    v_status := 'blocked_missing_confirmation';
    v_reason := 'Real execution requires exact confirmation text.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'dry_run', false,
      'required_confirm_text', 'CONFIRM_STAGE_PROCESSING_PIPELINE',
      'guard_before', v_guard_before,
      'strategy', v_strategy,
      'preflight', v_preflight
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      execution_summary = v_summary,
      guard_after = v_guard_before,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;
  end if;

  v_lock_result := public.race_engine_try_stage_processing_lock_v1(p_stage_id);

  if not coalesce((v_lock_result->>'locked')::boolean, false) then
    v_status := 'blocked_lock_not_acquired';
    v_reason := 'Could not acquire transaction-scoped stage processing lock.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'lock_result', v_lock_result,
      'guard_before', v_guard_before,
      'strategy', v_strategy,
      'preflight', v_preflight
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      lock_result = v_lock_result,
      execution_summary = v_summary,
      guard_after = v_guard_before,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;
  end if;

  v_guard_after_lock := public.race_engine_get_stage_production_guard_v1(p_stage_id);

  if coalesce((v_guard_after_lock->>'should_block_normal_simulation')::boolean, false) then
    v_status := 'blocked_by_production_guard_after_lock';
    v_reason := 'Production guard blocked after lock acquisition. Another process may have written outputs first.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'lock_result', v_lock_result,
      'guard_before', v_guard_before,
      'guard_after_lock', v_guard_after_lock,
      'strategy', v_strategy,
      'preflight', v_preflight
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      lock_result = v_lock_result,
      execution_summary = v_summary,
      guard_after = v_guard_after_lock,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;
  end if;

  begin
    v_runner_started_at := clock_timestamp();

    v_runner_result := public.run_race_stage_road_race_v1(p_stage_id);

    v_runner_finished_at := clock_timestamp();

    select sim.id
    into v_completed_simulation_run_id
    from public.race_stage_simulation_runs sim
    where sim.stage_id = p_stage_id
      and sim.status = 'completed'
    order by sim.created_at desc
    limit 1;

    if v_completed_simulation_run_id is null then
      raise exception
        'Completed simulation run was not found after official road runner for stage %.',
        p_stage_id;
    end if;

    v_replay_tail_repair_started_at := clock_timestamp();

    v_replay_tail_repair_result :=
      public.race_engine_repair_replay_finish_tail_v1(
        v_completed_simulation_run_id,
        true,
        10
      );

    v_replay_tail_repair_finished_at := clock_timestamp();

    v_guard_after := public.race_engine_get_stage_production_guard_v1(p_stage_id);

    v_status := 'official_road_runner_executed';
    v_reason := 'Road-race runner executed through the official backend processing shell, including automatic replay finish-tail repair.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_number', v_stage.stage_number,
      'stage_format', v_stage.stage_format,
      'dry_run', false,
      'pipeline_version', v_pipeline_version,
      'selected_runner_function', v_selected_runner,
      'selected_finalizer_function', v_selected_finalizer,
      'guard_before', v_guard_before,
      'guard_after_lock', v_guard_after_lock,
      'guard_after', v_guard_after,
      'strategy', v_strategy,
      'preflight', v_preflight,
      'lock_result', v_lock_result,
      'runner_started_at', v_runner_started_at,
      'runner_finished_at', v_runner_finished_at,
      'runner_result', coalesce(v_runner_result, '{}'::jsonb),
      'completed_simulation_run_id', v_completed_simulation_run_id,
      'replay_tail_repair_started_at', v_replay_tail_repair_started_at,
      'replay_tail_repair_finished_at', v_replay_tail_repair_finished_at,
      'replay_tail_repair_result', coalesce(v_replay_tail_repair_result, '{}'::jsonb),
      'next_step', 'Verify output integrity, replay density, replay end coverage, rankings, prizes, and finance.'
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      lock_result = v_lock_result,
      guard_after = v_guard_after,
      execution_summary = v_summary,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;

  exception when others then
    v_runner_finished_at := clock_timestamp();
    v_guard_after := public.race_engine_get_stage_production_guard_v1(p_stage_id);

    v_status := 'runner_error_rolled_back';
    v_reason := 'Road-race runner or automatic replay-tail repair raised an exception. Runner writes were rolled back by nested exception block.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_number', v_stage.stage_number,
      'stage_format', v_stage.stage_format,
      'dry_run', false,
      'pipeline_version', v_pipeline_version,
      'selected_runner_function', v_selected_runner,
      'selected_finalizer_function', v_selected_finalizer,
      'guard_before', v_guard_before,
      'guard_after_lock', v_guard_after_lock,
      'guard_after', v_guard_after,
      'strategy', v_strategy,
      'preflight', v_preflight,
      'lock_result', v_lock_result,
      'runner_started_at', v_runner_started_at,
      'runner_finished_at', v_runner_finished_at,
      'runner_error', sqlerrm,
      'runner_result', coalesce(v_runner_result, '{}'::jsonb),
      'completed_simulation_run_id', v_completed_simulation_run_id,
      'replay_tail_repair_started_at', v_replay_tail_repair_started_at,
      'replay_tail_repair_finished_at', v_replay_tail_repair_finished_at,
      'replay_tail_repair_result', coalesce(v_replay_tail_repair_result, '{}'::jsonb),
      'next_step', 'Review runner_error before continuing.'
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      lock_result = v_lock_result,
      guard_after = v_guard_after,
      error_message = sqlerrm,
      execution_summary = v_summary,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_processing_preflight_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage record;

  v_segment_rows integer := 0;
  v_stage_point_rows integer := 0;
  v_profile_detail_rows integer := 0;
  v_route_profile_rows integer := 0;

  v_participant_team_rows integer := 0;
  v_participant_rider_rows integer := 0;
  v_participant_rider_distinct_team_rows integer := 0;
  v_participant_rider_rows_without_team integer := 0;

  v_race_preparation_rows integer := 0;
  v_stage_plan_rows integer := 0;

  v_min_teams integer := null;
  v_max_teams integer := null;
  v_min_riders_per_team integer := null;
  v_max_riders_per_team integer := null;

  v_required_min_teams integer := 2;
  v_required_min_riders_per_team integer := 1;

  v_min_team_rider_count integer := 0;
  v_max_team_rider_count integer := 0;
  v_teams_below_min_riders integer := 0;
  v_teams_above_max_riders integer := 0;

  v_team_distribution jsonb := '[]'::jsonb;

  v_ready boolean := false;
  v_missing jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
begin
  select
    s.id as stage_id,
    s.race_id,
    r.name as race_name,
    r.category as race_category,
    s.stage_number,
    s.stage_date,
    coalesce(s.stage_format, 'road_race') as stage_format
  into v_stage
  from public.race_stages s
  join public.races r
    on r.id = s.race_id
  where s.id = p_stage_id
  limit 1;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status', 'stage_not_found',
      'stage_id', p_stage_id,
      'ready_for_road_runner', false,
      'recommendation', 'Stage was not found.'
    );
  end if;

  select
    er.min_teams,
    er.max_teams,
    er.min_riders_per_team,
    er.max_riders_per_team
  into
    v_min_teams,
    v_max_teams,
    v_min_riders_per_team,
    v_max_riders_per_team
  from public.race_entry_rules er
  where er.race_id = v_stage.race_id
  limit 1;

  v_required_min_teams := greatest(coalesce(v_min_teams, 2), 2);
  v_required_min_riders_per_team := greatest(coalesce(v_min_riders_per_team, 1), 1);

  begin
    select count(*)::integer
    into v_segment_rows
    from public.race_engine_get_stage_segments_v1(p_stage_id);
  exception when others then
    v_segment_rows := 0;
    v_missing := v_missing || jsonb_build_array(
      jsonb_build_object(
        'code', 'segment_function_error',
        'message', sqlerrm
      )
    );
  end;

  select count(*)::integer
  into v_stage_point_rows
  from public.race_stage_points sp
  where sp.stage_id = p_stage_id;

  select count(*)::integer
  into v_profile_detail_rows
  from public.race_stage_profile_details pd
  where pd.stage_id = p_stage_id;

  select count(*)::integer
  into v_route_profile_rows
  from public.race_stage_route_profiles rp
  where rp.stage_id = p_stage_id;

  select count(*)::integer
  into v_participant_team_rows
  from public.race_participant_teams_v1 rpt
  where rpt.race_id = v_stage.race_id;

  select
    count(*)::integer,
    count(distinct rpr.team_id)::integer,
    count(*) filter (where rpr.team_id is null)::integer
  into
    v_participant_rider_rows,
    v_participant_rider_distinct_team_rows,
    v_participant_rider_rows_without_team
  from public.race_participant_riders rpr
  where rpr.race_id = v_stage.race_id;

  with rider_team_counts as (
    select
      rpr.team_id,
      min(rpr.team_name_snapshot) as team_name_snapshot,
      count(*)::integer as rider_count
    from public.race_participant_riders rpr
    where rpr.race_id = v_stage.race_id
      and rpr.team_id is not null
    group by rpr.team_id
  )
  select
    coalesce(min(rider_count), 0)::integer,
    coalesce(max(rider_count), 0)::integer,
    count(*) filter (
      where rider_count < v_required_min_riders_per_team
    )::integer,
    count(*) filter (
      where v_max_riders_per_team is not null
        and rider_count > v_max_riders_per_team
    )::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'team_id', team_id,
          'team_name', team_name_snapshot,
          'rider_count', rider_count
        )
        order by rider_count desc, team_name_snapshot
      ),
      '[]'::jsonb
    )
  into
    v_min_team_rider_count,
    v_max_team_rider_count,
    v_teams_below_min_riders,
    v_teams_above_max_riders,
    v_team_distribution
  from rider_team_counts;

  select count(*)::integer
  into v_race_preparation_rows
  from public.race_preparations prep
  where prep.race_id = v_stage.race_id;

  select count(*)::integer
  into v_stage_plan_rows
  from public.race_stage_plans sp
  where sp.stage_id = p_stage_id;

  -- Required stage route/segment input
  if v_segment_rows <= 0 then
    v_missing := v_missing || jsonb_build_array(
      jsonb_build_object(
        'code', 'missing_segments',
        'message', 'race_engine_get_stage_segments_v1 returned zero rows.'
      )
    );
  end if;

  if v_profile_detail_rows <= 0 then
    v_warnings := v_warnings || jsonb_build_array(
      jsonb_build_object(
        'code', 'missing_profile_detail',
        'message', 'No race_stage_profile_details row exists. Segment function may still work, but profile detail is expected.'
      )
    );
  end if;

  -- Road-race startlist requirements
  if v_stage.stage_format = 'road_race' then
    if v_participant_team_rows < v_required_min_teams then
      v_missing := v_missing || jsonb_build_array(
        jsonb_build_object(
          'code', 'too_few_participant_team_rows',
          'message', 'race_participant_teams has fewer teams than required.',
          'participant_team_rows', v_participant_team_rows,
          'required_min_teams', v_required_min_teams
        )
      );
    end if;

    if v_participant_rider_distinct_team_rows < v_required_min_teams then
      v_missing := v_missing || jsonb_build_array(
        jsonb_build_object(
          'code', 'too_few_distinct_rider_teams',
          'message', 'race_participant_riders has riders from fewer distinct teams than required.',
          'participant_rider_distinct_team_rows', v_participant_rider_distinct_team_rows,
          'required_min_teams', v_required_min_teams
        )
      );
    end if;

    if v_participant_rider_rows <= 0 then
      v_missing := v_missing || jsonb_build_array(
        jsonb_build_object(
          'code', 'missing_participant_riders',
          'message', 'No race_participant_riders rows exist for this race.'
        )
      );
    end if;

    if v_participant_rider_rows_without_team > 0 then
      v_missing := v_missing || jsonb_build_array(
        jsonb_build_object(
          'code', 'participant_riders_without_team',
          'message', 'Some race_participant_riders rows have null team_id.',
          'rows_without_team', v_participant_rider_rows_without_team
        )
      );
    end if;

    if v_teams_below_min_riders > 0 then
      v_missing := v_missing || jsonb_build_array(
        jsonb_build_object(
          'code', 'teams_below_min_riders',
          'message', 'One or more teams have fewer riders than required.',
          'teams_below_min_riders', v_teams_below_min_riders,
          'required_min_riders_per_team', v_required_min_riders_per_team
        )
      );
    end if;

    if v_teams_above_max_riders > 0 then
      v_missing := v_missing || jsonb_build_array(
        jsonb_build_object(
          'code', 'teams_above_max_riders',
          'message', 'One or more teams have more riders than allowed.',
          'teams_above_max_riders', v_teams_above_max_riders,
          'max_riders_per_team', v_max_riders_per_team
        )
      );
    end if;

    if v_participant_team_rows <> v_participant_rider_distinct_team_rows then
      v_warnings := v_warnings || jsonb_build_array(
        jsonb_build_object(
          'code', 'participant_team_table_mismatch',
          'message', 'race_participant_teams row count differs from distinct team_id count in race_participant_riders.',
          'participant_team_rows', v_participant_team_rows,
          'participant_rider_distinct_team_rows', v_participant_rider_distinct_team_rows
        )
      );
    end if;
  end if;

  v_ready :=
    jsonb_array_length(v_missing) = 0
    and v_segment_rows > 0
    and (
      v_stage.stage_format <> 'road_race'
      or (
        v_participant_team_rows >= v_required_min_teams
        and v_participant_rider_distinct_team_rows >= v_required_min_teams
        and v_participant_rider_rows > 0
        and v_participant_rider_rows_without_team = 0
        and v_teams_below_min_riders = 0
        and v_teams_above_max_riders = 0
      )
    );

  return jsonb_build_object(
    'status',
      case
        when v_ready then 'preflight_ready'
        else 'preflight_blocked'
      end,
    'stage_id', v_stage.stage_id,
    'race_id', v_stage.race_id,
    'race_name', v_stage.race_name,
    'race_category', v_stage.race_category,
    'stage_number', v_stage.stage_number,
    'stage_date', v_stage.stage_date,
    'stage_format', v_stage.stage_format,

    'ready_for_road_runner', v_ready,

    'entry_rule_min_teams', v_min_teams,
    'entry_rule_max_teams', v_max_teams,
    'entry_rule_min_riders_per_team', v_min_riders_per_team,
    'entry_rule_max_riders_per_team', v_max_riders_per_team,
    'required_min_teams', v_required_min_teams,
    'required_min_riders_per_team', v_required_min_riders_per_team,

    'segment_rows', v_segment_rows,
    'stage_point_rows', v_stage_point_rows,
    'profile_detail_rows', v_profile_detail_rows,
    'route_profile_rows', v_route_profile_rows,

    'participant_team_rows', v_participant_team_rows,
    'participant_rider_rows', v_participant_rider_rows,
    'participant_rider_distinct_team_rows', v_participant_rider_distinct_team_rows,
    'participant_rider_rows_without_team', v_participant_rider_rows_without_team,

    'min_team_rider_count', v_min_team_rider_count,
    'max_team_rider_count', v_max_team_rider_count,
    'teams_below_min_riders', v_teams_below_min_riders,
    'teams_above_max_riders', v_teams_above_max_riders,
    'team_distribution', v_team_distribution,

    'race_preparation_rows', v_race_preparation_rows,
    'stage_plan_rows', v_stage_plan_rows,

    'missing_requirements', v_missing,
    'warnings', v_warnings,

    'recommendation',
      case
        when v_ready then
          'Preflight passed. Stage has segments and a structurally valid rider startlist.'
        else
          'Preflight blocked. Do not run the engine until missing startlist/participant requirements are fixed.'
      end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_backfill_participant_teams_from_riders_v1(p_race_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true, p_confirm_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_planned_rows integer := 0;
  v_inserted_rows integer := 0;
  v_summary jsonb := '{}'::jsonb;
  v_rows jsonb := '[]'::jsonb;
begin
  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'race_id', m.race_id,
          'race_name', m.race_name,
          'race_category', m.race_category,
          'first_stage_date', m.first_stage_date,
          'team_id', m.team_id,
          'team_name_snapshot', m.team_name_snapshot,
          'country_code_snapshot', m.country_code_snapshot,
          'rider_count', m.rider_count
        )
        order by m.first_stage_date, m.race_name, m.team_name_snapshot
      ),
      '[]'::jsonb
    )
  into
    v_planned_rows,
    v_rows
  from public.race_engine_missing_participant_team_rows_v1 m
  where p_race_id is null
     or m.race_id = p_race_id;

  if coalesce(p_dry_run, true) then
    return jsonb_build_object(
      'status', 'dry_run_no_changes_made',
      'planned_insert_rows', v_planned_rows,
      'race_id_filter', p_race_id,
      'planned_rows', v_rows,
      'recommendation',
        case
          when v_planned_rows > 0 then
            'Dry-run found missing race_participant_teams rows. Review planned rows, then run real backfill with confirmation.'
          else
            'No missing race_participant_teams rows found for this scope.'
        end
    );
  end if;

  if p_confirm_text is distinct from 'CONFIRM_BACKFILL_PARTICIPANT_TEAMS' then
    return jsonb_build_object(
      'status', 'blocked_missing_confirmation',
      'planned_insert_rows', v_planned_rows,
      'required_confirm_text', 'CONFIRM_BACKFILL_PARTICIPANT_TEAMS',
      'recommendation', 'Real backfill requires exact confirmation text.'
    );
  end if;

  insert into public.race_participant_teams (
    id,
    race_id,
    team_id,
    status,
    team_name_snapshot,
    logo_url_snapshot,
    country_code_snapshot,
    ranking_snapshot,
    submitted_at,
    accepted_at,
    created_at
  )
  select
    gen_random_uuid(),
    m.race_id,
    m.team_id,
    'accepted',
    m.team_name_snapshot,
    null,
    m.country_code_snapshot,
    null,
    now(),
    now(),
    now()
  from public.race_engine_missing_participant_team_rows_v1 m
  where p_race_id is null
     or m.race_id = p_race_id;

  get diagnostics v_inserted_rows = row_count;

  select
    jsonb_build_object(
      'status', 'backfill_completed',
      'race_id_filter', p_race_id,
      'planned_insert_rows', v_planned_rows,
      'inserted_rows', v_inserted_rows,
      'recommendation', 'Re-run official preflight candidate query. Valid races should now become eligible.'
    )
  into v_summary;

  return v_summary;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.travel_region_from_country_v1(p_country_code text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_cc text := upper(btrim(coalesce(p_country_code, '')));
begin
  if v_cc = '' then
    return 'unknown';
  end if;

  if v_cc in (
    'AD','AL','AT','BA','BE','BG','BY','CH','CY','CZ','DE','DK','EE','ES',
    'FI','FR','GB','GR','HR','HU','IE','IS','IT','LI','LT','LU','LV','MC',
    'MD','ME','MK','MT','NL','NO','PL','PT','RO','RS','SE','SI','SK','UA','XK'
  ) then
    return 'europe';
  end if;

  if v_cc in ('AE','BH','IL','JO','KW','LB','OM','QA','SA','TR') then
    return 'middle_east';
  end if;

  if v_cc in ('DZ','EG','MA','TN') then
    return 'north_africa';
  end if;

  if v_cc in (
    'AO','BF','BI','BJ','BW','CD','CG','CI','CM','CV','DJ','ER','ET','GA','GH',
    'GM','GN','GQ','GW','KE','LR','LS','MG','ML','MR','MU','MW','MZ','NA','NE',
    'NG','RW','SC','SD','SL','SN','SO','SS','ST','SZ','TD','TG','TZ','UG','ZA','ZM','ZW'
  ) then
    return 'africa';
  end if;

  if v_cc in ('CA','MX','US') then
    return 'north_america';
  end if;

  if v_cc in ('AR','BO','BR','CL','CO','EC','GY','PE','PY','SR','UY','VE') then
    return 'south_america';
  end if;

  if v_cc in (
    'CN','HK','ID','IN','JP','KR','KZ','MY','PH','PK','SG','TH','TW','VN'
  ) then
    return 'asia';
  end if;

  if v_cc in ('AU','FJ','NZ','PG','TO') then
    return 'oceania';
  end if;

  return 'other';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.travel_route_band_multiplier_v1(p_origin_country_code text, p_destination_country_code text)
 RETURNS TABLE(route_band text, route_multiplier numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_origin text := upper(btrim(coalesce(p_origin_country_code, '')));
  v_dest text := upper(btrim(coalesce(p_destination_country_code, '')));
  v_distance numeric;
  v_origin_region text;
  v_dest_region text;
  v_band text := 'unknown_route';
  v_multiplier numeric := 2.00;
begin
  if v_origin = '' or v_dest = '' then
    return query select v_band, v_multiplier;
    return;
  end if;

  if v_origin = v_dest then
    return query select 'domestic'::text, 0.35::numeric;
    return;
  end if;

  v_distance := public.travel_country_distance_km_v2(v_origin, v_dest);

  if v_distance is not null then
    if v_distance <= 300 then
      v_band := 'nearby';
      v_multiplier := 0.50 + (v_distance / 3000.0);
    elsif v_distance <= 800 then
      v_band := 'short_haul';
      v_multiplier := 0.60 + ((v_distance - 300.0) * 0.0004);
    elsif v_distance <= 1500 then
      v_band := 'regional';
      v_multiplier := 0.80 + ((v_distance - 800.0) * 0.0003);
    elsif v_distance <= 3000 then
      v_band := 'medium_haul';
      v_multiplier := 1.01 + ((v_distance - 1500.0) * 0.0003);
    elsif v_distance <= 6000 then
      v_band := 'long_haul';
      v_multiplier := 1.46 + ((v_distance - 3000.0) * 0.00027);
    elsif v_distance <= 10000 then
      v_band := 'intercontinental';
      v_multiplier := 2.27 + ((v_distance - 6000.0) * 0.00024);
    else
      v_band := 'ultra_long_haul';
      v_multiplier := least(4.50, 3.23 + ((v_distance - 10000.0) * 0.00018));
    end if;

    return query select v_band, round(v_multiplier, 3);
    return;
  end if;

  -- Safe compatibility fallback for any future country code not yet in the
  -- geography table. This preserves the previous region-based behavior rather
  -- than failing or returning a zero cost.
  v_origin_region := public.travel_region_from_country_v1(v_origin);
  v_dest_region := public.travel_region_from_country_v1(v_dest);

  if v_origin_region = v_dest_region and v_origin_region not in ('unknown', 'other') then
    v_band := 'same_region_fallback';
    v_multiplier := 1.00;
  elsif (v_origin_region = 'oceania' or v_dest_region = 'oceania') then
    v_band := 'oceania_fallback';
    v_multiplier := 4.00;
  elsif v_origin_region in ('north_america','south_america','asia')
     or v_dest_region in ('north_america','south_america','asia') then
    v_band := 'longhaul_fallback';
    v_multiplier := 3.00;
  else
    v_band := 'international_fallback';
    v_multiplier := 2.00;
  end if;

  return query select v_band, v_multiplier;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_unsolicited_transfer_bids_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_ai_unsolicited_transfer_decision_v1(p_rider_id uuid, p_buyer_club_id uuid, p_offer_amount_cash bigint DEFAULT NULL::bigint)
 RETURNS TABLE(rider_id uuid, buyer_club_id uuid, seller_club_id uuid, market_value bigint, offer_amount bigint, resistance_price bigint, resistance_multiplier numeric, offer_to_resistance_ratio numeric, ai_decision text, suggested_status text, hard_block boolean, counteroffer_amount bigint, importance_component numeric, season_performance_component numeric, contract_component numeric, replacement_component numeric, finance_component numeric, morale_component numeric, decision_breakdown_json jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();

  v_today date;
  v_season_year integer;

  v_seller_club_id uuid;
  v_seller_is_ai boolean := false;
  v_seller_cash bigint := 0;
  v_seller_name text;
  v_buyer_name text;

  v_market_value bigint := 0;
  v_offer bigint := coalesce(p_offer_amount_cash, 0);

  v_overall integer := 50;
  v_potential integer := 50;
  v_morale integer := 100;
  v_release_requested boolean := false;
  v_assigned_role text := null;
  v_rider_name text := null;

  v_squad_count integer := 0;
  v_market_rank integer := 999;
  v_overall_rank integer := 999;
  v_same_role_replacements integer := 0;

  v_points numeric := 0;
  v_wins integer := 0;
  v_podiums integer := 0;
  v_top10s integer := 0;

  v_contract_expires_on date := null;
  v_contract_days_left integer := null;

  v_base_multiplier numeric := 2.00;
  v_importance numeric := 0;
  v_performance numeric := 0;
  v_contract numeric := 0;
  v_replacement numeric := 0;
  v_finance numeric := 0;
  v_morale_component numeric := 0;
  v_multiplier numeric := 2.00;

  v_resistance_price bigint := 0;
  v_ratio numeric := 0;

  v_hard_block boolean := false;
  v_ai_decision text := 'rejected_low_offer';
  v_status text := 'rejected';
  v_counteroffer bigint := null;

  v_reasons jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_rider_id is null then
    raise exception 'rider_id is required';
  end if;

  if p_buyer_club_id is null then
    raise exception 'buyer_club_id is required';
  end if;

  if p_offer_amount_cash is not null and p_offer_amount_cash <= 0 then
    raise exception 'offer_amount_cash must be greater than 0';
  end if;

  if not (
    exists (
      select 1
      from public.clubs c
      where c.id = p_buyer_club_id
        and c.owner_user_id = v_uid
    )
    or exists (
      select 1
      from public.club_memberships cm
      where cm.club_id = p_buyer_club_id
        and cm.user_id = v_uid
    )
  ) then
    raise exception 'Not allowed to bid from this club';
  end if;

  v_today := public.get_market_game_date();
  v_season_year := extract(year from coalesce(v_today, current_date))::integer;

  select
    cr.club_id,
    cr.assigned_role::text
  into
    v_seller_club_id,
    v_assigned_role
  from public.club_riders cr
  where cr.rider_id = p_rider_id
  limit 1;

  if v_seller_club_id is null then
    raise exception 'Rider is not assigned to a club';
  end if;

  if v_seller_club_id = p_buyer_club_id then
    v_hard_block := true;
    v_reasons := v_reasons || jsonb_build_array('Buyer club already owns this rider.');
  end if;

  if exists (
    select 1
    from public.club_riders cr
    where cr.club_id = p_buyer_club_id
      and cr.rider_id = p_rider_id
  ) then
    v_hard_block := true;
    v_reasons := v_reasons || jsonb_build_array('Buyer club already has this rider.');
  end if;

  select
    coalesce(c.is_ai, false),
    coalesce(c.cash_balance, 0)::bigint,
    c.name
  into
    v_seller_is_ai,
    v_seller_cash,
    v_seller_name
  from public.clubs c
  where c.id = v_seller_club_id;

  select c.name
  into v_buyer_name
  from public.clubs c
  where c.id = p_buyer_club_id;

  if coalesce(v_seller_is_ai, false) = false then
    v_hard_block := true;
    v_reasons := v_reasons || jsonb_build_array('Selling club is not AI-controlled.');
  end if;

  if exists (
    select 1
    from public.rider_transfer_listings rtl
    where rtl.rider_id = p_rider_id
      and rtl.status in ('listed', 'club_accepted')
  ) then
    v_hard_block := true;
    v_reasons := v_reasons || jsonb_build_array('Rider is already transfer listed. Use the normal transfer flow.');
  end if;

  if exists (
    select 1
    from public.rider_transfer_offers rto
    where rto.rider_id = p_rider_id
      and rto.status in ('open', 'club_accepted')
  ) then
    v_hard_block := true;
    v_reasons := v_reasons || jsonb_build_array('Rider already has an active transfer offer.');
  end if;

  if exists (
    select 1
    from public.rider_transfer_negotiations rtn
    where rtn.rider_id = p_rider_id
      and rtn.status = 'open'
  ) then
    v_hard_block := true;
    v_reasons := v_reasons || jsonb_build_array('Rider already has an open transfer negotiation.');
  end if;

  if exists (
    select 1
    from public.rider_unsolicited_transfer_bids ub
    where ub.rider_id = p_rider_id
      and ub.buyer_club_id = p_buyer_club_id
      and ub.status in ('submitted', 'countered', 'accepted_pending_confirmation')
  ) then
    v_hard_block := true;
    v_reasons := v_reasons || jsonb_build_array('This buyer club already has an active premium bid for this rider.');
  end if;

  select
    coalesce(round(r.market_value)::bigint, 0),
    coalesce(r.overall::integer, 50),
    coalesce(r.potential::integer, 50),
    coalesce(r.morale::integer, 100),
    coalesce(r.release_requested, false),
    coalesce(
      nullif(trim(concat_ws(' ', nullif(r.first_name, ''), nullif(r.last_name, ''))), ''),
      nullif(r.display_name, ''),
      r.id::text
    )
  into
    v_market_value,
    v_overall,
    v_potential,
    v_morale,
    v_release_requested,
    v_rider_name
  from public.riders r
  where r.id = p_rider_id;

  if v_market_value <= 0 then
    v_market_value := 10000;
  end if;

  select count(*)::integer
  into v_squad_count
  from public.club_riders cr
  where cr.club_id = v_seller_club_id;

  if v_squad_count <= 8 then
    v_hard_block := true;
    v_reasons := v_reasons || jsonb_build_array(
      'Selling club would fall too close to minimum squad size.'
    );
  end if;

  select rank_no
  into v_market_rank
  from (
    select
      cr.rider_id,
      row_number() over (order by coalesce(r.market_value, 0) desc, coalesce(r.overall, 0) desc) as rank_no
    from public.club_riders cr
    join public.riders r
      on r.id = cr.rider_id
    where cr.club_id = v_seller_club_id
  ) ranked
  where ranked.rider_id = p_rider_id;

  select rank_no
  into v_overall_rank
  from (
    select
      cr.rider_id,
      row_number() over (order by coalesce(r.overall, 0) desc, coalesce(r.market_value, 0) desc) as rank_no
    from public.club_riders cr
    join public.riders r
      on r.id = cr.rider_id
    where cr.club_id = v_seller_club_id
  ) ranked
  where ranked.rider_id = p_rider_id;

  select count(*)::integer
  into v_same_role_replacements
  from public.club_riders cr
  join public.riders r
    on r.id = cr.rider_id
  where cr.club_id = v_seller_club_id
    and cr.rider_id <> p_rider_id
    and coalesce(cr.assigned_role::text, '') = coalesce(v_assigned_role, '')
    and coalesce(r.overall, 0) >= greatest(v_overall - 5, 0);

  select coalesce(p.international_points, 0)
  into v_points
  from public.rider_international_points_by_season_v1 p
  where p.rider_id = p_rider_id
    and p.season_year = v_season_year
  limit 1;

  select
    count(*) filter (where rsr.rank = 1)::integer,
    count(*) filter (where rsr.rank <= 3)::integer,
    count(*) filter (where rsr.rank <= 10)::integer
  into
    v_wins,
    v_podiums,
    v_top10s
  from public.race_stage_results rsr
  where rsr.rider_id = p_rider_id
    and coalesce(rsr.status, 'finished') not in ('dns', 'dnf', 'dsq');

  select rc.expires_on
  into v_contract_expires_on
  from public.rider_contracts rc
  where rc.rider_id = p_rider_id
    and rc.club_id = v_seller_club_id
    and rc.status = 'active'
  order by rc.created_at desc
  limit 1;

  if v_contract_expires_on is not null and v_today is not null then
    v_contract_days_left := v_contract_expires_on - v_today;
  end if;

  -- ------------------------------------------------------------
  -- Importance component
  -- ------------------------------------------------------------

  if coalesce(v_market_rank, 999) = 1 then
    v_importance := v_importance + 2.00;
    v_reasons := v_reasons || jsonb_build_array('Rider is the most valuable rider in the AI squad.');
  elsif v_market_rank <= 3 then
    v_importance := v_importance + 1.20;
    v_reasons := v_reasons || jsonb_build_array('Rider is a top-three market value rider in the AI squad.');
  elsif v_market_rank <= 5 then
    v_importance := v_importance + 0.60;
  end if;

  if coalesce(v_overall_rank, 999) = 1 then
    v_importance := v_importance + 1.20;
    v_reasons := v_reasons || jsonb_build_array('Rider is the strongest overall rider in the AI squad.');
  elsif v_overall_rank <= 3 then
    v_importance := v_importance + 0.70;
  end if;

  if v_overall >= 78 then
    v_importance := v_importance + 1.20;
  elsif v_overall >= 72 then
    v_importance := v_importance + 0.70;
  elsif v_overall >= 66 then
    v_importance := v_importance + 0.30;
  end if;

  if lower(coalesce(v_assigned_role, '')) similar to '%(leader|protected|sprinter|climber)%' then
    v_importance := v_importance + 0.70;
    v_reasons := v_reasons || jsonb_build_array('Rider has an important squad role.');
  end if;

  -- ------------------------------------------------------------
  -- Season performance component
  -- ------------------------------------------------------------

  if v_points >= 500 then
    v_performance := v_performance + 1.50;
    v_reasons := v_reasons || jsonb_build_array('Rider is having an elite points season.');
  elsif v_points >= 250 then
    v_performance := v_performance + 1.00;
    v_reasons := v_reasons || jsonb_build_array('Rider is having a strong points season.');
  elsif v_points >= 100 then
    v_performance := v_performance + 0.50;
  elsif v_points >= 50 then
    v_performance := v_performance + 0.25;
  end if;

  v_performance := v_performance + least(coalesce(v_wins, 0) * 0.25, 1.00);
  v_performance := v_performance + least(coalesce(v_podiums, 0) * 0.10, 0.50);

  if v_wins > 0 then
    v_reasons := v_reasons || jsonb_build_array('Race wins increase the AI selling resistance.');
  elsif v_podiums > 0 then
    v_reasons := v_reasons || jsonb_build_array('Podium results increase the AI selling resistance.');
  end if;

  -- ------------------------------------------------------------
  -- Contract component
  -- ------------------------------------------------------------

  if v_contract_days_left is null then
    v_contract := 0;
  elsif v_contract_days_left <= 90 then
    v_contract := v_contract - 0.40;
    v_reasons := v_reasons || jsonb_build_array('Short remaining contract lowers AI resistance.');
  elsif v_contract_days_left <= 180 then
    v_contract := v_contract - 0.20;
  elsif v_contract_days_left <= 365 then
    v_contract := v_contract + 0.30;
  elsif v_contract_days_left <= 730 then
    v_contract := v_contract + 0.80;
    v_reasons := v_reasons || jsonb_build_array('Long contract gives the AI club strong control.');
  else
    v_contract := v_contract + 1.20;
    v_reasons := v_reasons || jsonb_build_array('Very long contract heavily increases AI resistance.');
  end if;

  -- ------------------------------------------------------------
  -- Replacement difficulty component
  -- ------------------------------------------------------------

  if v_same_role_replacements <= 0 then
    v_replacement := v_replacement + 0.80;
    v_reasons := v_reasons || jsonb_build_array('AI team has no similar replacement for this role.');
  elsif v_same_role_replacements = 1 then
    v_replacement := v_replacement + 0.40;
  elsif v_same_role_replacements >= 3 then
    v_replacement := v_replacement - 0.20;
    v_reasons := v_reasons || jsonb_build_array('AI team has multiple similar replacements.');
  end if;

  -- ------------------------------------------------------------
  -- Seller finance pressure
  -- ------------------------------------------------------------

  if v_seller_cash < 0 then
    v_finance := v_finance - 0.80;
    v_reasons := v_reasons || jsonb_build_array('Seller is under strong financial pressure.');
  elsif v_seller_cash < 100000 then
    v_finance := v_finance - 0.50;
    v_reasons := v_reasons || jsonb_build_array('Seller has low cash, so a big offer is more tempting.');
  elsif v_seller_cash > 5000000 then
    v_finance := v_finance + 0.30;
  end if;

  -- ------------------------------------------------------------
  -- Rider morale / willingness
  -- ------------------------------------------------------------

  if v_release_requested then
    v_morale_component := v_morale_component - 1.00;
    v_reasons := v_reasons || jsonb_build_array('Rider has requested release, lowering AI resistance.');
  elsif v_morale <= 20 then
    v_morale_component := v_morale_component - 0.80;
    v_reasons := v_reasons || jsonb_build_array('Very low morale lowers AI resistance.');
  elsif v_morale <= 40 then
    v_morale_component := v_morale_component - 0.40;
  elsif v_morale >= 85 then
    v_morale_component := v_morale_component + 0.20;
  end if;

  v_multiplier :=
    greatest(
      1.50,
      least(
        10.00,
        v_base_multiplier
        + v_importance
        + v_performance
        + v_contract
        + v_replacement
        + v_finance
        + v_morale_component
      )
    );

  v_resistance_price :=
    greatest(
      10000,
      ceil((v_market_value::numeric * v_multiplier) / 1000.0)::bigint * 1000
    );

  v_ratio :=
    case
      when v_resistance_price > 0 and v_offer > 0
        then round(v_offer::numeric / v_resistance_price::numeric, 4)
      else 0
    end;

  if v_hard_block then
    v_ai_decision := 'hard_rejected';
    v_status := 'rejected';
    v_counteroffer := null;
  elsif v_offer <= 0 then
    v_ai_decision := 'pending';
    v_status := 'submitted';
    v_counteroffer := null;
  elsif v_ratio < 0.70 then
    v_ai_decision := 'rejected_low_offer';
    v_status := 'rejected';
    v_counteroffer := null;
  elsif v_ratio < 1.00 then
    v_ai_decision := 'counteroffer';
    v_status := 'countered';
    v_counteroffer := ceil((v_resistance_price * 1.05)::numeric / 1000.0)::bigint * 1000;
  else
    v_ai_decision := 'accepted';
    v_status := 'accepted_pending_confirmation';
    v_counteroffer := null;
  end if;

  return query
  select
    p_rider_id,
    p_buyer_club_id,
    v_seller_club_id,
    v_market_value,
    v_offer,

    v_resistance_price,
    v_multiplier,
    v_ratio,

    v_ai_decision,
    v_status,
    v_hard_block,
    v_counteroffer,

    v_importance,
    v_performance,
    v_contract,
    v_replacement,
    v_finance,
    v_morale_component,

    jsonb_build_object(
      'source', 'calculate_ai_unsolicited_transfer_decision_v1',
      'rider_id', p_rider_id,
      'rider_name', v_rider_name,
      'buyer_club_id', p_buyer_club_id,
      'buyer_club_name', v_buyer_name,
      'seller_club_id', v_seller_club_id,
      'seller_club_name', v_seller_name,
      'seller_is_ai', v_seller_is_ai,
      'seller_cash', v_seller_cash,
      'market_value', v_market_value,
      'offer_amount', v_offer,
      'resistance_price', v_resistance_price,
      'resistance_multiplier', v_multiplier,
      'offer_to_resistance_ratio', v_ratio,
      'assigned_role', v_assigned_role,
      'overall', v_overall,
      'potential', v_potential,
      'morale', v_morale,
      'release_requested', v_release_requested,
      'squad_count', v_squad_count,
      'market_rank_in_squad', v_market_rank,
      'overall_rank_in_squad', v_overall_rank,
      'same_role_replacements', v_same_role_replacements,
      'season_year', v_season_year,
      'season_points', v_points,
      'wins', v_wins,
      'podiums', v_podiums,
      'top10s', v_top10s,
      'contract_expires_on', v_contract_expires_on,
      'contract_days_left', v_contract_days_left,
      'components', jsonb_build_object(
        'base', v_base_multiplier,
        'importance', v_importance,
        'season_performance', v_performance,
        'contract', v_contract,
        'replacement', v_replacement,
        'seller_finance', v_finance,
        'morale', v_morale_component
      ),
      'hard_block', v_hard_block,
      'ai_decision', v_ai_decision,
      'suggested_status', v_status,
      'counteroffer_amount', v_counteroffer,
      'reasons', v_reasons
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.quote_unsolicited_ai_transfer_bid_v1(p_rider_id uuid, p_buyer_club_id uuid, p_offer_amount_cash bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_review record;
  v_offer_strength text := 'no_offer';
  v_can_submit boolean := false;
  v_public_reasons jsonb := '[]'::jsonb;
begin
  select *
  into v_review
  from public.calculate_ai_unsolicited_transfer_decision_v1(
    p_rider_id,
    p_buyer_club_id,
    p_offer_amount_cash
  )
  limit 1;

  if v_review.hard_block then
    v_offer_strength := 'blocked';
    v_can_submit := false;
  elsif coalesce(p_offer_amount_cash, 0) <= 0 then
    v_offer_strength := 'no_offer';
    v_can_submit := true;
  elsif v_review.offer_to_resistance_ratio < 0.70 then
    v_offer_strength := 'too_low';
    v_can_submit := true;
  elsif v_review.offer_to_resistance_ratio < 1.00 then
    v_offer_strength := 'serious_but_short';
    v_can_submit := true;
  elsif v_review.offer_to_resistance_ratio < 1.30 then
    v_offer_strength := 'very_strong';
    v_can_submit := true;
  else
    v_offer_strength := 'exceptional';
    v_can_submit := true;
  end if;

  v_public_reasons :=
    case
      when v_review.hard_block then
        jsonb_build_array('This rider is not available through a premium bid right now.')
      when v_review.market_value <= 0 then
        jsonb_build_array('Market value is missing, so the club will be cautious.')
      else
        jsonb_build_array(
          'The rider is not transfer listed.',
          'The selling club is not actively trying to sell.',
          'A very high premium offer may make the AI reconsider.'
        )
    end;

  return jsonb_build_object(
    'success', true,
    'can_submit', v_can_submit,
    'rider_id', v_review.rider_id,
    'buyer_club_id', v_review.buyer_club_id,
    'seller_club_id', v_review.seller_club_id,
    'market_value', v_review.market_value,
    'offer_amount', coalesce(p_offer_amount_cash, 0),

    -- Public stance only; hidden resistance price is intentionally not returned.
    'selling_club_stance', case
      when v_review.hard_block then 'not_available'
      when v_review.importance_component >= 3.0 or v_review.season_performance_component >= 1.5
        then 'strongly_not_interested'
      when v_review.importance_component >= 1.5
        then 'not_interested'
      else 'unlikely_to_sell'
    end,

    'offer_strength', v_offer_strength,
    'predicted_public_outcome', case
      when v_review.hard_block then 'blocked'
      when coalesce(p_offer_amount_cash, 0) <= 0 then 'not_submitted'
      when v_review.ai_decision = 'accepted' then 'may_be_accepted'
      when v_review.ai_decision = 'counteroffer' then 'likely_counteroffer'
      else 'likely_rejected'
    end,

    'counteroffer_amount_cash',
      case
        when v_review.ai_decision = 'counteroffer'
          then v_review.counteroffer_amount
        else null
      end,

    'reasons', v_public_reasons
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_unsolicited_ai_transfer_bid_v1(p_rider_id uuid, p_buyer_club_id uuid, p_offer_amount_cash bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_review record;
  v_today date;
  v_expires_on date;
  v_bid_id uuid;

  v_cash_balance bigint := 0;
  v_reserved_normal_offers bigint := 0;
  v_reserved_unsolicited bigint := 0;
  v_available_transfer_funds bigint := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_offer_amount_cash is null or p_offer_amount_cash <= 0 then
    raise exception 'Offer amount must be greater than 0';
  end if;

  v_today := public.get_market_game_date();
  v_expires_on := v_today + 2;

  select *
  into v_review
  from public.calculate_ai_unsolicited_transfer_decision_v1(
    p_rider_id,
    p_buyer_club_id,
    p_offer_amount_cash
  )
  limit 1;

  if v_review.hard_block then
    insert into public.rider_unsolicited_transfer_bids (
      rider_id,
      buyer_club_id,
      seller_club_id,
      offer_amount_cash,
      status,
      ai_decision,
      market_value_snapshot,
      resistance_price_snapshot,
      resistance_multiplier_snapshot,
      counteroffer_amount_cash,
      decision_breakdown_json,
      offered_on_game_date,
      expires_on_game_date,
      created_by_user_id,
      metadata
    )
    values (
      p_rider_id,
      p_buyer_club_id,
      v_review.seller_club_id,
      p_offer_amount_cash,
      'rejected',
      'hard_rejected',
      v_review.market_value,
      v_review.resistance_price,
      v_review.resistance_multiplier,
      null,
      v_review.decision_breakdown_json,
      v_today,
      v_expires_on,
      v_uid,
      jsonb_build_object('source', 'submit_unsolicited_ai_transfer_bid_v1')
    )
    returning id into v_bid_id;

    return jsonb_build_object(
      'success', true,
      'bid_id', v_bid_id,
      'status', 'rejected',
      'ai_decision', 'hard_rejected',
      'message', 'The selling club is not willing to consider this rider right now.'
    );
  end if;

  select coalesce(c.cash_balance, 0)::bigint
  into v_cash_balance
  from public.clubs c
  where c.id = p_buyer_club_id;

  select coalesce(sum(o.offered_price), 0)::bigint
  into v_reserved_normal_offers
  from public.rider_transfer_offers o
  where o.buyer_club_id = p_buyer_club_id
    and o.status in ('open', 'club_accepted');

  select coalesce(sum(ub.offer_amount_cash), 0)::bigint
  into v_reserved_unsolicited
  from public.rider_unsolicited_transfer_bids ub
  where ub.buyer_club_id = p_buyer_club_id
    and ub.status in ('submitted', 'countered', 'accepted_pending_confirmation');

  v_available_transfer_funds :=
    greatest(
      coalesce(v_cash_balance, 0)
      - coalesce(v_reserved_normal_offers, 0)
      - coalesce(v_reserved_unsolicited, 0),
      0
    );

  if p_offer_amount_cash > v_available_transfer_funds then
    raise exception
      'Insufficient funds: available %, reserved %, need %',
      public.format_money_us(v_available_transfer_funds::numeric),
      public.format_money_us((coalesce(v_reserved_normal_offers, 0) + coalesce(v_reserved_unsolicited, 0))::numeric),
      public.format_money_us(p_offer_amount_cash::numeric);
  end if;

  insert into public.rider_unsolicited_transfer_bids (
    rider_id,
    buyer_club_id,
    seller_club_id,
    offer_amount_cash,
    status,
    ai_decision,
    market_value_snapshot,
    resistance_price_snapshot,
    resistance_multiplier_snapshot,
    counteroffer_amount_cash,
    decision_breakdown_json,
    offered_on_game_date,
    expires_on_game_date,
    created_by_user_id,
    metadata
  )
  values (
    p_rider_id,
    p_buyer_club_id,
    v_review.seller_club_id,
    p_offer_amount_cash,
    v_review.suggested_status,
    v_review.ai_decision,
    v_review.market_value,
    v_review.resistance_price,
    v_review.resistance_multiplier,
    v_review.counteroffer_amount,
    v_review.decision_breakdown_json,
    v_today,
    v_expires_on,
    v_uid,
    jsonb_build_object(
      'source', 'submit_unsolicited_ai_transfer_bid_v1',
      'phase', 'phase_1_no_money_no_rider_move'
    )
  )
  returning id into v_bid_id;

  return jsonb_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'rider_id', p_rider_id,
    'buyer_club_id', p_buyer_club_id,
    'seller_club_id', v_review.seller_club_id,
    'offer_amount_cash', p_offer_amount_cash,
    'status', v_review.suggested_status,
    'ai_decision', v_review.ai_decision,

    -- Public result only.
    -- Hidden resistance_price_snapshot is stored in DB for audit/admin balancing,
    -- but not returned to frontend here.
    'counteroffer_amount_cash',
      case
        when v_review.ai_decision = 'counteroffer'
          then v_review.counteroffer_amount
        else null
      end,

    'message', case
      when v_review.ai_decision = 'accepted'
        then 'The AI club accepted the transfer fee. Confirm the bid to open rider personal-terms negotiation.'
      when v_review.ai_decision = 'counteroffer'
        then 'The AI club is not ready to accept, but sent a counteroffer.'
      when v_review.ai_decision = 'rejected_low_offer'
        then 'The AI club rejected the offer as too low for a non-listed rider.'
      else 'The offer was rejected.'
    end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_repair_replay_finish_tail_v1(p_simulation_run_id uuid, p_apply boolean DEFAULT false, p_tail_step_seconds integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_stage_id uuid;
  v_race_id uuid;
  v_distance_km numeric := 1;

  v_result_rows integer := 0;
  v_winner_seconds integer;
  v_slowest_seconds integer;
  v_max_gap_seconds integer;

  v_first_replay_seconds integer;
  v_last_replay_seconds integer;
  v_first_frame_number integer;
  v_last_frame_number integer;
  v_replay_group_rows_before integer := 0;

  v_final_frame_rider_count integer := 0;
  v_tail_step integer := greatest(coalesce(p_tail_step_seconds, 10), 1);
  v_tail_speed_kmh numeric := 38.0;

  v_tail_frame_count integer := 0;
  v_tail_group_row_count integer := 0;
  v_inserted_tail_rows integer := 0;

  v_status text;
begin
  select
    sim.stage_id,
    sim.race_id,
    greatest(coalesce(stage.distance_km, 1)::numeric, 1)
  into
    v_stage_id,
    v_race_id,
    v_distance_km
  from public.race_stage_simulation_runs sim
  join public.race_stages stage
    on stage.id = sim.stage_id
  where sim.id = p_simulation_run_id
    and sim.status = 'completed'
  limit 1;

  if v_stage_id is null then
    raise exception 'Completed simulation run % was not found.', p_simulation_run_id;
  end if;

  select
    count(*)::integer,
    min(result.elapsed_seconds)::integer,
    max(result.elapsed_seconds)::integer,
    max(coalesce(result.gap_seconds, 0))::integer
  into
    v_result_rows,
    v_winner_seconds,
    v_slowest_seconds,
    v_max_gap_seconds
  from public.race_stage_results result
  where result.stage_id = v_stage_id
    and result.status = 'finished';

  if coalesce(v_result_rows, 0) = 0 then
    raise exception 'No finished stage results found for stage %.', v_stage_id;
  end if;

  select
    min(replay.race_seconds)::integer,
    max(replay.race_seconds)::integer,
    min(replay.frame_number)::integer,
    max(replay.frame_number)::integer,
    count(*)::integer
  into
    v_first_replay_seconds,
    v_last_replay_seconds,
    v_first_frame_number,
    v_last_frame_number,
    v_replay_group_rows_before
  from public.race_stage_replay_frames replay
  where replay.simulation_run_id = p_simulation_run_id;

  if v_last_replay_seconds is null or v_last_frame_number is null then
    raise exception 'No replay frames found for simulation run %.', p_simulation_run_id;
  end if;

  select count(distinct final_rider.rider_id)::integer
  into v_final_frame_rider_count
  from public.race_stage_replay_frames replay
  cross join lateral unnest(replay.rider_ids) as final_rider(rider_id)
  where replay.simulation_run_id = p_simulation_run_id
    and replay.frame_number = v_last_frame_number;

  with tail_seconds as (
    select distinct race_seconds
    from (
      select
        generate_series(
          v_last_replay_seconds + v_tail_step,
          v_slowest_seconds,
          v_tail_step
        )::integer as race_seconds

      union all

      select v_slowest_seconds::integer as race_seconds
    ) seconds
    where race_seconds > v_last_replay_seconds
      and race_seconds <= v_slowest_seconds
  ),
  gap_values as (
    select distinct
      coalesce(result.gap_seconds, 0)::integer as gap_seconds
    from public.race_stage_results result
    where result.stage_id = v_stage_id
      and result.status = 'finished'
  ),
  ordered_gaps as (
    select
      gap_seconds,
      lag(gap_seconds) over (order by gap_seconds) as previous_gap_seconds
    from gap_values
  ),
  gap_clusters as (
    select
      gap_seconds,
      sum(
        case
          when previous_gap_seconds is null then 1
          when gap_seconds - previous_gap_seconds <= 10 then 0
          else 1
        end
      ) over (order by gap_seconds)::integer as cluster_number
    from ordered_gaps
  )
  select
    (select count(*) from tail_seconds)::integer,
    (
      (select count(*) from tail_seconds)
      *
      (select count(distinct cluster_number) from gap_clusters)
    )::integer
  into
    v_tail_frame_count,
    v_tail_group_row_count;

  if v_last_replay_seconds >= v_slowest_seconds
     and v_final_frame_rider_count >= v_result_rows then
    return jsonb_build_object(
      'status', 'no_repair_needed',
      'mode', 'tail_repair_unique_group_codes_v2',
      'apply', coalesce(p_apply, false),
      'simulation_run_id', p_simulation_run_id,
      'race_id', v_race_id,
      'stage_id', v_stage_id,
      'result_rows', v_result_rows,
      'winner_seconds', v_winner_seconds,
      'slowest_seconds', v_slowest_seconds,
      'last_replay_seconds', v_last_replay_seconds,
      'final_frame_rider_count', v_final_frame_rider_count,
      'replay_group_rows_before', v_replay_group_rows_before
    );
  end if;

  if not coalesce(p_apply, false) then
    return jsonb_build_object(
      'status', 'dry_run_tail_repair_planned',
      'mode', 'tail_repair_unique_group_codes_v2',
      'apply', false,
      'simulation_run_id', p_simulation_run_id,
      'race_id', v_race_id,
      'stage_id', v_stage_id,
      'result_rows', v_result_rows,
      'winner_seconds', v_winner_seconds,
      'slowest_seconds', v_slowest_seconds,
      'max_gap_seconds', v_max_gap_seconds,
      'first_replay_seconds', v_first_replay_seconds,
      'last_replay_seconds', v_last_replay_seconds,
      'first_frame_number', v_first_frame_number,
      'last_frame_number', v_last_frame_number,
      'missing_seconds', v_slowest_seconds - v_last_replay_seconds,
      'final_frame_rider_count', v_final_frame_rider_count,
      'planned_tail_frames', v_tail_frame_count,
      'planned_tail_group_rows', v_tail_group_row_count,
      'tail_step_seconds', v_tail_step
    );
  end if;

  with tail_seconds as (
    select distinct race_seconds
    from (
      select
        generate_series(
          v_last_replay_seconds + v_tail_step,
          v_slowest_seconds,
          v_tail_step
        )::integer as race_seconds

      union all

      select v_slowest_seconds::integer as race_seconds
    ) seconds
    where race_seconds > v_last_replay_seconds
      and race_seconds <= v_slowest_seconds
  ),
  numbered_tail_seconds as (
    select
      race_seconds,
      v_last_frame_number
        + dense_rank() over (order by race_seconds) as frame_number
    from tail_seconds
  ),
  gap_values as (
    select distinct
      coalesce(result.gap_seconds, 0)::integer as gap_seconds
    from public.race_stage_results result
    where result.stage_id = v_stage_id
      and result.status = 'finished'
  ),
  ordered_gaps as (
    select
      gap_seconds,
      lag(gap_seconds) over (order by gap_seconds) as previous_gap_seconds
    from gap_values
  ),
  gap_clusters as (
    select
      gap_seconds,
      sum(
        case
          when previous_gap_seconds is null then 1
          when gap_seconds - previous_gap_seconds <= 10 then 0
          else 1
        end
      ) over (order by gap_seconds)::integer as cluster_number
    from ordered_gaps
  ),
  rider_rows as (
    select
      result.rider_id,
      result.rider_name_snapshot,
      result.team_name_snapshot,
      result.rank,
      result.elapsed_seconds::integer as elapsed_seconds,
      coalesce(result.gap_seconds, 0)::integer as gap_seconds,
      cluster.cluster_number
    from public.race_stage_results result
    join gap_clusters cluster
      on cluster.gap_seconds = coalesce(result.gap_seconds, 0)::integer
    where result.stage_id = v_stage_id
      and result.status = 'finished'
  ),
  grouped_tail_rows as (
    select
      seconds.frame_number,
      seconds.race_seconds,
      rider.cluster_number,
      min(rider.gap_seconds)::integer as group_gap_seconds,
      count(*)::integer as group_size,

      round(
        max(
          case
            when seconds.race_seconds >= rider.elapsed_seconds then
              v_distance_km
            else
              greatest(
                0,
                v_distance_km -
                (
                  (
                    rider.elapsed_seconds - seconds.race_seconds
                  )::numeric
                  * v_tail_speed_kmh
                  / 3600.0
                )
              )
          end
        ),
        3
      ) as km_marker,

      array_agg(rider.rider_id order by rider.rank)::uuid[] as rider_ids,
      array_agg(rider.rider_name_snapshot order by rider.rank)::text[] as rider_names,
      array_agg(rider.team_name_snapshot order by rider.rank)::text[] as team_names
    from numbered_tail_seconds seconds
    cross join rider_rows rider
    group by
      seconds.frame_number,
      seconds.race_seconds,
      rider.cluster_number
  ),
  prepared_tail_rows as (
    select
      tail.*,

      case
        when tail.cluster_number = 1 then
          'main_peloton'
        when tail.group_gap_seconds >= 90 then
          'dropped_group_' || lpad(tail.cluster_number::text, 2, '0')
        else
          'chase_group_' || lpad(tail.cluster_number::text, 2, '0')
      end as safe_group_code,

      case
        when tail.cluster_number = 1 then
          'Peloton'
        when tail.group_gap_seconds >= 90 then
          'Dropped group ' || lpad(tail.cluster_number::text, 2, '0')
        else
          'Chase group ' || lpad(tail.cluster_number::text, 2, '0')
      end as safe_group_label
    from grouped_tail_rows tail
  )
  insert into public.race_stage_replay_frames (
    simulation_run_id,
    race_id,
    stage_id,
    frame_number,
    race_seconds,
    km_marker,
    group_code,
    group_label,
    group_order,
    gap_seconds,
    avg_speed_kmh,
    rider_ids,
    rider_names,
    team_names,
    metadata,
    replay_mode,
    entity_type,
    entity_key,
    entity_label
  )
  select
    p_simulation_run_id,
    v_race_id,
    v_stage_id,
    tail.frame_number,
    tail.race_seconds,
    tail.km_marker,
    tail.safe_group_code,
    tail.safe_group_label,
    tail.cluster_number::integer,
    tail.group_gap_seconds::integer,
    round(v_tail_speed_kmh, 2),
    tail.rider_ids,
    tail.rider_names,
    tail.team_names,
    jsonb_build_object(
      'source', 'race_engine_replay_finish_tail_repair_v2_unique_group_codes',
      'repair_reason', 'replay_extended_to_slowest_finisher',
      'winner_seconds', v_winner_seconds,
      'slowest_seconds', v_slowest_seconds,
      'original_last_replay_seconds', v_last_replay_seconds,
      'tail_step_seconds', v_tail_step,
      'tail_frame_seconds', tail.race_seconds,
      'group_size', tail.group_size,
      'gap_cluster_number', tail.cluster_number,
      'group_gap_seconds', tail.group_gap_seconds,
      'tail_speed_kmh', round(v_tail_speed_kmh, 2)
    ),
    'road_race'::text,
    'group'::text,
    tail.safe_group_code,
    tail.safe_group_label
  from prepared_tail_rows tail
  order by
    tail.frame_number,
    tail.cluster_number
  on conflict (simulation_run_id, frame_number, group_code)
  do update set
    race_seconds = excluded.race_seconds,
    km_marker = excluded.km_marker,
    group_label = excluded.group_label,
    group_order = excluded.group_order,
    gap_seconds = excluded.gap_seconds,
    avg_speed_kmh = excluded.avg_speed_kmh,
    rider_ids = excluded.rider_ids,
    rider_names = excluded.rider_names,
    team_names = excluded.team_names,
    metadata = excluded.metadata,
    replay_mode = excluded.replay_mode,
    entity_type = excluded.entity_type,
    entity_key = excluded.entity_key,
    entity_label = excluded.entity_label;

  get diagnostics v_inserted_tail_rows = row_count;

  select
    max(replay.race_seconds)::integer,
    max(replay.frame_number)::integer,
    count(*)::integer
  into
    v_last_replay_seconds,
    v_last_frame_number,
    v_replay_group_rows_before
  from public.race_stage_replay_frames replay
  where replay.simulation_run_id = p_simulation_run_id;

  select count(distinct final_rider.rider_id)::integer
  into v_final_frame_rider_count
  from public.race_stage_replay_frames replay
  cross join lateral unnest(replay.rider_ids) as final_rider(rider_id)
  where replay.simulation_run_id = p_simulation_run_id
    and replay.frame_number = v_last_frame_number;

  v_status := case
    when v_last_replay_seconds >= v_slowest_seconds
     and v_final_frame_rider_count >= v_result_rows
    then 'tail_repair_inserted'
    else 'tail_repair_inserted_but_verify_needed'
  end;

  return jsonb_build_object(
    'status', v_status,
    'mode', 'tail_repair_unique_group_codes_v2',
    'apply', true,
    'simulation_run_id', p_simulation_run_id,
    'race_id', v_race_id,
    'stage_id', v_stage_id,
    'result_rows', v_result_rows,
    'winner_seconds', v_winner_seconds,
    'slowest_seconds', v_slowest_seconds,
    'max_gap_seconds', v_max_gap_seconds,
    'last_replay_seconds_after', v_last_replay_seconds,
    'last_frame_number_after', v_last_frame_number,
    'final_frame_rider_count_after', v_final_frame_rider_count,
    'tail_step_seconds', v_tail_step,
    'planned_tail_frames', v_tail_frame_count,
    'planned_tail_group_rows', v_tail_group_row_count,
    'inserted_or_updated_tail_rows', v_inserted_tail_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_unsolicited_ai_transfer_bid_v1(p_bid_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();

  v_bid public.rider_unsolicited_transfer_bids%rowtype;

  v_today date;
  v_expires_on date;

  v_current_owner_club_id uuid;
  v_seller_is_ai boolean := false;

  v_listing_id uuid;
  v_offer_id uuid;
  v_negotiation_id uuid;

  v_existing_listing_id uuid;
  v_existing_offer_id uuid;
  v_existing_negotiation_id uuid;

  v_cash_balance bigint := 0;
  v_reserved_normal_offers bigint := 0;
  v_reserved_unsolicited bigint := 0;
  v_available_transfer_funds bigint := 0;

  v_current_salary integer := 0;
  v_expected_salary integer := 0;
  v_min_salary integer := 0;
  v_preferred_duration smallint := 1;
  v_salary_breakdown jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_bid_id is null then
    raise exception 'bid_id is required';
  end if;

  v_today := public.get_market_game_date();

  select *
  into v_bid
  from public.rider_unsolicited_transfer_bids ub
  where ub.id = p_bid_id
  for update;

  if not found then
    raise exception 'Unsolicited transfer bid not found';
  end if;

  if not (
    exists (
      select 1
      from public.clubs c
      where c.id = v_bid.buyer_club_id
        and c.owner_user_id = v_uid
    )
    or exists (
      select 1
      from public.club_memberships cm
      where cm.club_id = v_bid.buyer_club_id
        and cm.user_id = v_uid
    )
  ) then
    raise exception 'Not allowed to confirm this bid';
  end if;

  if v_bid.status = 'converted_to_transfer_flow' then
    v_existing_listing_id := nullif(v_bid.metadata ->> 'listing_id', '')::uuid;
    v_existing_offer_id := nullif(v_bid.metadata ->> 'offer_id', '')::uuid;
    v_existing_negotiation_id := nullif(v_bid.metadata ->> 'negotiation_id', '')::uuid;

    return jsonb_build_object(
      'success', true,
      'already_converted', true,
      'bid_id', v_bid.id,
      'listing_id', v_existing_listing_id,
      'offer_id', v_existing_offer_id,
      'negotiation_id', v_existing_negotiation_id,
      'message', 'This premium bid was already converted into rider negotiation.'
    );
  end if;

  if v_bid.status <> 'accepted_pending_confirmation'
     or v_bid.ai_decision <> 'accepted' then
    raise exception
      'Bid must be accepted_pending_confirmation before conversion. Current status %, ai_decision %',
      v_bid.status,
      v_bid.ai_decision;
  end if;

  if v_bid.expires_on_game_date is not null and v_today > v_bid.expires_on_game_date then
    update public.rider_unsolicited_transfer_bids
    set
      status = 'expired',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'expired_during_confirmation', true,
        'expired_checked_at', now()
      )
    where id = v_bid.id;

    raise exception 'This premium bid has expired';
  end if;

  select cr.club_id
  into v_current_owner_club_id
  from public.club_riders cr
  where cr.rider_id = v_bid.rider_id
  limit 1
  for update;

  if v_current_owner_club_id is null then
    raise exception 'Rider is no longer assigned to any club';
  end if;

  if v_current_owner_club_id <> v_bid.seller_club_id then
    raise exception 'Rider is no longer owned by the original selling club';
  end if;

  select coalesce(c.is_ai, false)
  into v_seller_is_ai
  from public.clubs c
  where c.id = v_bid.seller_club_id;

  if coalesce(v_seller_is_ai, false) = false then
    raise exception 'Selling club is no longer AI-controlled';
  end if;

  if exists (
    select 1
    from public.rider_transfer_listings l
    where l.rider_id = v_bid.rider_id
      and l.status in ('listed', 'club_accepted')
  ) then
    raise exception 'Rider already has an active transfer listing';
  end if;

  if exists (
    select 1
    from public.rider_transfer_offers o
    where o.rider_id = v_bid.rider_id
      and o.status in ('open', 'club_accepted')
  ) then
    raise exception 'Rider already has an active transfer offer';
  end if;

  if exists (
    select 1
    from public.rider_transfer_negotiations n
    where n.rider_id = v_bid.rider_id
      and n.status = 'open'
  ) then
    raise exception 'Rider already has an open transfer negotiation';
  end if;

  select coalesce(c.cash_balance, 0)::bigint
  into v_cash_balance
  from public.clubs c
  where c.id = v_bid.buyer_club_id;

  select coalesce(sum(o.offered_price), 0)::bigint
  into v_reserved_normal_offers
  from public.rider_transfer_offers o
  where o.buyer_club_id = v_bid.buyer_club_id
    and o.status in ('open', 'club_accepted');

  select coalesce(sum(ub.offer_amount_cash), 0)::bigint
  into v_reserved_unsolicited
  from public.rider_unsolicited_transfer_bids ub
  where ub.buyer_club_id = v_bid.buyer_club_id
    and ub.id <> v_bid.id
    and ub.status in ('submitted', 'countered', 'accepted_pending_confirmation');

  v_available_transfer_funds :=
    greatest(
      coalesce(v_cash_balance, 0)
      - coalesce(v_reserved_normal_offers, 0)
      - coalesce(v_reserved_unsolicited, 0),
      0
    );

  if v_bid.offer_amount_cash > v_available_transfer_funds then
    raise exception
      'Insufficient available transfer funds. Available %, needed %',
      v_available_transfer_funds,
      v_bid.offer_amount_cash;
  end if;

  select
    t.current_salary_weekly,
    t.expected_salary_weekly,
    t.min_acceptable_salary_weekly,
    t.preferred_duration_seasons,
    t.salary_breakdown_json
  into
    v_current_salary,
    v_expected_salary,
    v_min_salary,
    v_preferred_duration,
    v_salary_breakdown
  from public.calculate_unsolicited_ai_transfer_personal_terms_v1(
    v_bid.rider_id,
    v_bid.buyer_club_id,
    v_bid.seller_club_id,
    v_bid.offer_amount_cash
  ) t
  limit 1;

  v_expires_on := least(
    coalesce(v_bid.expires_on_game_date, v_today + 3),
    v_today + 3
  );

  insert into public.rider_transfer_listings (
    rider_id,
    seller_club_id,
    asking_price,
    min_allowed_price,
    max_allowed_price,
    listed_on_game_date,
    expires_on_game_date,
    status,
    auto_price_clamped,
    status_changed_at_game_ts,
    status_changed_game_ts
  )
  values (
    v_bid.rider_id,
    v_bid.seller_club_id,
    v_bid.offer_amount_cash,
    v_bid.offer_amount_cash,
    v_bid.offer_amount_cash,
    v_today,
    v_expires_on,
    'club_accepted',
    false,
    now()::timestamp,
    now()::timestamp
  )
  returning id into v_listing_id;

  insert into public.rider_transfer_offers (
    listing_id,
    rider_id,
    seller_club_id,
    buyer_club_id,
    offered_price,
    offered_on_game_date,
    status,
    auto_block_reason,
    metadata,
    expires_on_game_date,
    status_changed_at_game_ts,
    status_changed_at_game_at
  )
  values (
    v_listing_id,
    v_bid.rider_id,
    v_bid.seller_club_id,
    v_bid.buyer_club_id,
    v_bid.offer_amount_cash,
    v_today,
    'club_accepted',
    null,
    jsonb_build_object(
      'source', 'unsolicited_ai_premium_bid',
      'unsolicited_bid_id', v_bid.id,
      'club_accepted_at', now(),
      'club_auto_accepted', true,
      'premium_offer_amount_cash', v_bid.offer_amount_cash,
      'market_value_snapshot', v_bid.market_value_snapshot,
      'resistance_multiplier_snapshot', v_bid.resistance_multiplier_snapshot
    ),
    v_expires_on,
    now()::timestamp,
    now()::timestamp
  )
  returning id into v_offer_id;

  insert into public.rider_transfer_negotiations (
    offer_id,
    listing_id,
    rider_id,
    seller_club_id,
    buyer_club_id,
    status,
    current_salary_weekly,
    expected_salary_weekly,
    min_acceptable_salary_weekly,
    preferred_duration_seasons,
    offer_salary_weekly,
    offer_duration_seasons,
    attempt_count,
    max_attempts,
    locked_until,
    opened_on_game_date,
    expires_on_game_date,
    closed_reason,
    notes_json,
    status_changed_at_game_ts,
    offer_signing_bonus,
    offer_agent_fee
  )
  values (
    v_offer_id,
    v_listing_id,
    v_bid.rider_id,
    v_bid.seller_club_id,
    v_bid.buyer_club_id,
    'open',
    v_current_salary,
    v_expected_salary,
    v_min_salary,
    v_preferred_duration,
    null,
    null,
    0,
    5,
    null,
    v_today,
    v_expires_on,
    null,
    jsonb_build_object(
      'source', 'unsolicited_ai_premium_bid',
      'unsolicited_bid_id', v_bid.id,
      'premium_transfer_fee', v_bid.offer_amount_cash,
      'expected_salary_weekly', v_expected_salary,
      'min_acceptable_salary_weekly', v_min_salary,
      'preferred_duration_seasons', v_preferred_duration,
      'salary_breakdown', v_salary_breakdown
    ),
    now()::timestamp,
    null,
    null
  )
  returning id into v_negotiation_id;

  update public.rider_unsolicited_transfer_bids ub
  set
    status = 'converted_to_transfer_flow',
    metadata = coalesce(ub.metadata, '{}'::jsonb) || jsonb_build_object(
      'converted_to_transfer_flow', true,
      'converted_at', now(),
      'listing_id', v_listing_id,
      'offer_id', v_offer_id,
      'negotiation_id', v_negotiation_id,
      'expected_salary_weekly', v_expected_salary,
      'min_acceptable_salary_weekly', v_min_salary,
      'preferred_duration_seasons', v_preferred_duration,
      'salary_breakdown', v_salary_breakdown,
      'phase', 'phase_2_opened_rider_negotiation_salary_v2'
    )
  where ub.id = v_bid.id;

  return jsonb_build_object(
    'success', true,
    'bid_id', v_bid.id,
    'status', 'converted_to_transfer_flow',
    'listing_id', v_listing_id,
    'offer_id', v_offer_id,
    'negotiation_id', v_negotiation_id,
    'rider_id', v_bid.rider_id,
    'buyer_club_id', v_bid.buyer_club_id,
    'seller_club_id', v_bid.seller_club_id,
    'transfer_fee_cash', v_bid.offer_amount_cash,
    'current_salary_weekly', v_current_salary,
    'expected_salary_weekly', v_expected_salary,
    'min_acceptable_salary_weekly', v_min_salary,
    'preferred_duration_seasons', v_preferred_duration,
    'salary_breakdown', v_salary_breakdown,
    'message', 'Premium bid converted. Rider personal-terms negotiation is now open.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_unsolicited_ai_transfer_personal_terms_v1(p_rider_id uuid, p_buyer_club_id uuid, p_seller_club_id uuid, p_transfer_fee_cash bigint)
 RETURNS TABLE(current_salary_weekly integer, expected_salary_weekly integer, min_acceptable_salary_weekly integer, preferred_duration_seasons smallint, salary_breakdown_json jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date := public.get_market_game_date();
  v_season_year integer := extract(year from coalesce(public.get_market_game_date(), current_date))::integer;

  v_market_value bigint := 0;
  v_transfer_fee bigint := greatest(coalesce(p_transfer_fee_cash, 0), 0);

  v_current_contract_salary integer := 0;
  v_rider_salary integer := 0;
  v_current_salary integer := 0;

  v_overall integer := 50;
  v_potential integer := 50;
  v_age integer := 30;
  v_morale integer := 100;

  v_points numeric := 0;
  v_international_rank bigint := 999999;
  v_wins integer := 0;
  v_podiums integer := 0;
  v_top10s integer := 0;

  v_buyer_tier text := 'amateur';
  v_seller_tier text := 'amateur';
  v_buyer_tier_score integer := 1;
  v_seller_tier_score integer := 1;
  v_tier_gap integer := 0;

  v_market_salary_anchor integer := 0;
  v_rank_component numeric := 0;
  v_points_component numeric := 0;
  v_result_component numeric := 0;
  v_profile_component numeric := 0;
  v_tier_component numeric := 0;
  v_premium_component numeric := 0;
  v_morale_component numeric := 0;
  v_total_multiplier numeric := 1.00;
  v_fee_to_market_ratio numeric := 0;

  v_salary_anchor integer := 1000;
  v_soft_cap integer := 10000;
  v_expected integer := 1000;
  v_min integer := 1000;
  v_duration smallint := 1;
begin
  if p_rider_id is null then
    raise exception 'rider_id is required';
  end if;

  if p_buyer_club_id is null then
    raise exception 'buyer_club_id is required';
  end if;

  if p_seller_club_id is null then
    raise exception 'seller_club_id is required';
  end if;

  select
    coalesce(round(r.market_value)::bigint, 0),
    coalesce(r.salary::integer, 0),
    coalesce(r.overall::integer, 50),
    coalesce(r.potential::integer, 50),
    coalesce(public.get_age_years_on_game_date(r.birth_date), 30),
    coalesce(r.morale::integer, 100)
  into
    v_market_value,
    v_rider_salary,
    v_overall,
    v_potential,
    v_age,
    v_morale
  from public.riders r
  where r.id = p_rider_id;

  select coalesce(rc.salary_weekly, 0)
  into v_current_contract_salary
  from public.rider_contracts rc
  where rc.rider_id = p_rider_id
    and rc.club_id = p_seller_club_id
    and rc.status = 'active'
  order by rc.created_at desc
  limit 1;

  v_current_salary := greatest(
    coalesce(v_current_contract_salary, 0),
    coalesce(v_rider_salary, 0),
    100
  );

  select
    coalesce(p.international_points::numeric, 0),
    coalesce(p.international_rank::bigint, 999999)
  into
    v_points,
    v_international_rank
  from public.rider_international_points_by_season_v1 p
  where p.rider_id = p_rider_id
    and p.season_year = v_season_year
  limit 1;

  v_points := coalesce(v_points, 0);
  v_international_rank := coalesce(v_international_rank, 999999);

  select
    count(*) filter (where rsr.rank = 1)::integer,
    count(*) filter (where rsr.rank <= 3)::integer,
    count(*) filter (where rsr.rank <= 10)::integer
  into
    v_wins,
    v_podiums,
    v_top10s
  from public.race_stage_results rsr
  where rsr.rider_id = p_rider_id
    and coalesce(rsr.status, 'finished') not in ('dns', 'dnf', 'dsq');

  select coalesce(c.club_tier::text, 'amateur')
  into v_buyer_tier
  from public.clubs c
  where c.id = p_buyer_club_id;

  select coalesce(c.club_tier::text, 'amateur')
  into v_seller_tier
  from public.clubs c
  where c.id = p_seller_club_id;

  v_buyer_tier_score :=
    case lower(coalesce(v_buyer_tier, 'amateur'))
      when 'worldteam' then 4
      when 'proteam' then 3
      when 'continental' then 2
      else 1
    end;

  v_seller_tier_score :=
    case lower(coalesce(v_seller_tier, 'amateur'))
      when 'worldteam' then 4
      when 'proteam' then 3
      when 'continental' then 2
      else 1
    end;

  v_tier_gap := greatest(v_seller_tier_score - v_buyer_tier_score, 0);

  -- Correct economy anchor:
  -- Your market-value system is based around salary × 52 × 2,
  -- so salary anchor is market_value / 104.
  v_market_salary_anchor := greatest(
    500,
    ceil((greatest(v_market_value, 0)::numeric / 104.0) / 100.0)::integer * 100
  );

  v_fee_to_market_ratio := case
    when v_market_value > 0 then round(v_transfer_fee::numeric / v_market_value::numeric, 4)
    else 0
  end;

  -- Rank/result/profile are still important, but kept inside game salary range.
  if v_international_rank = 1 then
    v_rank_component := 0.45;
  elsif v_international_rank <= 5 then
    v_rank_component := 0.30;
  elsif v_international_rank <= 20 then
    v_rank_component := 0.18;
  elsif v_international_rank <= 50 then
    v_rank_component := 0.10;
  end if;

  if v_points >= 600 then
    v_points_component := 0.35;
  elsif v_points >= 400 then
    v_points_component := 0.25;
  elsif v_points >= 250 then
    v_points_component := 0.16;
  elsif v_points >= 100 then
    v_points_component := 0.09;
  elsif v_points >= 50 then
    v_points_component := 0.04;
  end if;

  v_result_component :=
    least(coalesce(v_wins, 0) * 0.035, 0.16)
    + least(coalesce(v_podiums, 0) * 0.012, 0.10)
    + least(coalesce(v_top10s, 0) * 0.003, 0.05);

  v_profile_component :=
    case
      when v_overall >= 82 then 0.18
      when v_overall >= 78 then 0.12
      when v_overall >= 74 then 0.08
      when v_overall >= 70 then 0.04
      else 0
    end
    + case
        when v_potential - v_overall >= 8 then 0.08
        when v_potential - v_overall >= 5 then 0.05
        when v_potential - v_overall >= 3 then 0.02
        else 0
      end;

  v_tier_component := least(v_tier_gap * 0.06, 0.18);

  -- Premium fee is only a prestige/seriousness signal.
  -- It must NOT become the salary anchor.
  v_premium_component := case
    when v_fee_to_market_ratio >= 10 then 0.18
    when v_fee_to_market_ratio >= 8 then 0.15
    when v_fee_to_market_ratio >= 5 then 0.10
    when v_fee_to_market_ratio >= 3 then 0.06
    else 0
  end;

  v_morale_component := case
    when v_morale <= 25 then -0.06
    when v_morale <= 45 then -0.03
    when v_morale >= 85 then 0.03
    else 0
  end;

  v_total_multiplier := greatest(
    1.00,
    least(
      2.60,
      1.00
      + v_rank_component
      + v_points_component
      + v_result_component
      + v_profile_component
      + v_tier_component
      + v_premium_component
      + v_morale_component
    )
  );

  v_salary_anchor := greatest(
    v_current_salary,
    v_market_salary_anchor,
    500
  );

  -- Soft cap prevents one premium fee from destroying the wage economy.
  -- Rank #1 / elite riders can go higher, but still within game range.
  v_soft_cap := greatest(
    v_current_salary,
    case
      when v_international_rank = 1 or v_points >= 600 then v_market_salary_anchor * 3
      when v_international_rank <= 10 or v_points >= 400 then v_market_salary_anchor * 2
      when v_points >= 150 then ceil(v_market_salary_anchor * 1.7)::integer
      else ceil(v_market_salary_anchor * 1.4)::integer
    end,
    1000
  );

  v_expected :=
    ceil((v_salary_anchor::numeric * v_total_multiplier) / 100.0)::integer * 100;

  v_expected := least(v_expected, v_soft_cap);
  v_expected := greatest(v_expected, v_current_salary, 500);

  v_min := greatest(
    v_current_salary,
    ceil((v_expected::numeric * 0.85) / 100.0)::integer * 100,
    500
  );

  v_duration := case
    when v_age <= 24 and v_potential >= 75 then 3
    when v_international_rank <= 10 or v_points >= 400 or v_overall >= 74 then 2
    else 1
  end;

  return query
  select
    v_current_salary,
    v_expected,
    v_min,
    v_duration,
    jsonb_build_object(
      'source', 'calculate_unsolicited_ai_transfer_personal_terms_v1',
      'version', 'salary_economy_corrected_v3',
      'rider_id', p_rider_id,
      'buyer_club_id', p_buyer_club_id,
      'seller_club_id', p_seller_club_id,
      'season_year', v_season_year,
      'current_contract_salary', coalesce(v_current_contract_salary, 0),
      'rider_salary', coalesce(v_rider_salary, 0),
      'current_salary', v_current_salary,
      'market_value', v_market_value,
      'transfer_fee', v_transfer_fee,
      'fee_to_market_ratio', v_fee_to_market_ratio,
      'market_salary_anchor', v_market_salary_anchor,
      'salary_anchor', v_salary_anchor,
      'soft_cap', v_soft_cap,
      'international_rank', v_international_rank,
      'international_points', v_points,
      'wins', v_wins,
      'podiums', v_podiums,
      'top10s', v_top10s,
      'overall', v_overall,
      'potential', v_potential,
      'age', v_age,
      'morale', v_morale,
      'buyer_tier', v_buyer_tier,
      'seller_tier', v_seller_tier,
      'tier_gap', v_tier_gap,
      'components', jsonb_build_object(
        'rank', v_rank_component,
        'points', v_points_component,
        'results', v_result_component,
        'profile', v_profile_component,
        'tier', v_tier_component,
        'premium_fee', v_premium_component,
        'morale', v_morale_component,
        'total_multiplier', v_total_multiplier
      ),
      'expected_salary_weekly', v_expected,
      'min_acceptable_salary_weekly', v_min,
      'preferred_duration_seasons', v_duration
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_external_rider_current_team_v1(p_rider_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_club_id uuid;
  v_team_name text;
  v_logo_url text;
begin
  if p_rider_id is null then
    return jsonb_build_object(
      'success', false,
      'found', false,
      'message', 'rider_id is required'
    );
  end if;

  select
    c.id,
    coalesce(
      nullif(to_jsonb(c)->>'full_display_name', ''),
      nullif(to_jsonb(c)->>'display_name', ''),
      nullif(c.name, ''),
      c.id::text
    ) as team_name,
    coalesce(
      nullif(to_jsonb(c)->>'logo_url', ''),
      nullif(to_jsonb(c)->>'team_logo_url', ''),
      nullif(to_jsonb(c)->>'logo_path', '')
    ) as logo_url
  into
    v_club_id,
    v_team_name,
    v_logo_url
  from public.club_riders cr
  join public.clubs c
    on c.id = cr.club_id
  where cr.rider_id = p_rider_id
  limit 1;

  if v_club_id is null then
    return jsonb_build_object(
      'success', true,
      'found', false,
      'rider_id', p_rider_id
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'found', true,
    'rider_id', p_rider_id,
    'club_id', v_club_id,
    'team_name', v_team_name,
    'logo_url', v_logo_url
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_active_unsolicited_transfer_bid_for_rider_v1(p_rider_id uuid, p_buyer_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_bid record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_rider_id is null then
    raise exception 'rider_id is required';
  end if;

  if p_buyer_club_id is null then
    return jsonb_build_object(
      'success', true,
      'has_active_bid', false,
      'bid', null
    );
  end if;

  if not (
    exists (
      select 1
      from public.clubs c
      where c.id = p_buyer_club_id
        and c.owner_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.club_memberships cm
      where cm.club_id = p_buyer_club_id
        and cm.user_id = auth.uid()
    )
  ) then
    raise exception 'Not allowed to read premium bids for this club';
  end if;

  select
    ub.id,
    ub.status,
    ub.ai_decision,
    ub.offer_amount_cash,
    ub.counteroffer_amount_cash,
    ub.expires_on_game_date,
    ub.created_at,
    ub.updated_at
  into v_bid
  from public.rider_unsolicited_transfer_bids ub
  where ub.rider_id = p_rider_id
    and ub.buyer_club_id = p_buyer_club_id
    and ub.status in (
      'submitted',
      'countered',
      'accepted_pending_confirmation',
      'converted_to_transfer_flow'
    )
  order by ub.updated_at desc nulls last, ub.created_at desc
  limit 1;

  if v_bid.id is null then
    return jsonb_build_object(
      'success', true,
      'has_active_bid', false,
      'bid', null
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'has_active_bid', true,
    'bid', jsonb_build_object(
      'id', v_bid.id,
      'status', v_bid.status,
      'ai_decision', v_bid.ai_decision,
      'offer_amount_cash', v_bid.offer_amount_cash,
      'counteroffer_amount_cash', v_bid.counteroffer_amount_cash,
      'expires_on_game_date', v_bid.expires_on_game_date,
      'created_at', v_bid.created_at,
      'updated_at', v_bid.updated_at
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_process_stage_runner_only_v1(p_stage_id uuid, p_dry_run boolean DEFAULT true, p_confirm_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_stage record;

  v_attempt_id uuid;
  v_pipeline_version text := 'phase_3b_split_runner_only_v1';

  v_guard_before jsonb := '{}'::jsonb;
  v_guard_after_lock jsonb := '{}'::jsonb;
  v_guard_after jsonb := '{}'::jsonb;
  v_strategy jsonb := '{}'::jsonb;
  v_preflight jsonb := '{}'::jsonb;
  v_lock_result jsonb := '{}'::jsonb;

  v_selected_runner text;
  v_selected_finalizer text;

  v_status text;
  v_reason text;
  v_summary jsonb := '{}'::jsonb;

  v_runner_result jsonb := '{}'::jsonb;
  v_runner_started_at timestamptz;
  v_runner_finished_at timestamptz;

  v_completed_simulation_run_id uuid;
begin
  perform set_config('statement_timeout', '300s', true);

  select
    s.id as stage_id,
    s.race_id,
    r.name as race_name,
    coalesce(s.stage_format, 'road_race') as stage_format,
    s.stage_number
  into v_stage
  from public.race_stages s
  join public.races r
    on r.id = s.race_id
  where s.id = p_stage_id
  limit 1;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status', 'stage_not_found',
      'stage_id', p_stage_id,
      'dry_run', coalesce(p_dry_run, true),
      'pipeline_version', v_pipeline_version
    );
  end if;

  v_guard_before := public.race_engine_get_stage_production_guard_v1(p_stage_id);
  v_strategy := public.race_engine_get_stage_processing_strategy_v1(p_stage_id);
  v_preflight := public.race_engine_get_stage_processing_preflight_v1(p_stage_id);

  v_selected_runner := nullif(v_strategy->>'selected_runner_function', '');
  v_selected_finalizer := nullif(v_strategy->>'selected_finalizer_function', '');

  insert into public.race_engine_stage_processing_attempts_v1 (
    stage_id,
    race_id,
    race_name,
    stage_number,
    stage_format,
    pipeline_version,
    dry_run,
    status,
    reason,
    selected_runner_function,
    selected_finalizer_function,
    guard_before,
    strategy,
    execution_summary,
    created_at,
    started_at
  )
  values (
    v_stage.stage_id,
    v_stage.race_id,
    v_stage.race_name,
    v_stage.stage_number,
    v_stage.stage_format,
    v_pipeline_version,
    coalesce(p_dry_run, true),
    'started',
    'Split pipeline runner-only attempt started.',
    v_selected_runner,
    v_selected_finalizer,
    v_guard_before,
    v_strategy,
    jsonb_build_object(
      'status', 'started',
      'mode', 'split_runner_only',
      'stage_id', v_stage.stage_id,
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_number', v_stage.stage_number,
      'stage_format', v_stage.stage_format,
      'dry_run', coalesce(p_dry_run, true),
      'pipeline_version', v_pipeline_version,
      'guard_before', v_guard_before,
      'strategy', v_strategy,
      'preflight', v_preflight
    ),
    now(),
    now()
  )
  returning id into v_attempt_id;

  if coalesce((v_guard_before->>'should_block_normal_simulation')::boolean, false) then
    v_status := 'blocked_by_production_guard';
    v_reason := 'Production guard blocked runner-only execution because the stage already has official outputs or engine state.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'guard_before', v_guard_before,
      'strategy', v_strategy,
      'preflight', v_preflight
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      guard_after = v_guard_before,
      execution_summary = v_summary,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;
  end if;

  if coalesce(v_strategy->>'status', '') <> 'strategy_resolved' then
    v_status := 'blocked_strategy_not_resolved';
    v_reason := 'No executable strategy was resolved for this stage.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'guard_before', v_guard_before,
      'strategy', v_strategy,
      'preflight', v_preflight
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      guard_after = v_guard_before,
      execution_summary = v_summary,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;
  end if;

  if v_selected_runner <> 'run_race_stage_road_race_v1' then
    v_status := 'blocked_runner_not_wired_for_split_pipeline';
    v_reason := 'Split runner-only v1 currently supports road_race runner only.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'selected_runner_function', v_selected_runner,
      'selected_finalizer_function', v_selected_finalizer,
      'guard_before', v_guard_before,
      'strategy', v_strategy,
      'preflight', v_preflight
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      guard_after = v_guard_before,
      execution_summary = v_summary,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;
  end if;

  if not coalesce((v_preflight->>'ready_for_road_runner')::boolean, false) then
    v_status := 'blocked_by_preflight_missing_inputs';
    v_reason := 'Preflight blocked runner-only execution because required runner inputs are missing.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'race_name', v_stage.race_name,
      'stage_number', v_stage.stage_number,
      'stage_format', v_stage.stage_format,
      'dry_run', coalesce(p_dry_run, true),
      'selected_runner_function', v_selected_runner,
      'guard_before', v_guard_before,
      'strategy', v_strategy,
      'preflight', v_preflight
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      guard_after = v_guard_before,
      execution_summary = v_summary,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;
  end if;

  if coalesce(p_dry_run, true) then
    v_status := 'dry_run_ready_no_changes_made';
    v_reason := 'Split runner-only dry-run passed. No engine execution in dry-run mode.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_number', v_stage.stage_number,
      'stage_format', v_stage.stage_format,
      'dry_run', true,
      'pipeline_version', v_pipeline_version,
      'selected_runner_function', v_selected_runner,
      'selected_finalizer_function', v_selected_finalizer,
      'guard_before', v_guard_before,
      'strategy', v_strategy,
      'preflight', v_preflight,
      'next_step', 'Run with p_dry_run=false and CONFIRM_STAGE_RUNNER_ONLY.'
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      guard_after = v_guard_before,
      execution_summary = v_summary,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;
  end if;

  if p_confirm_text is distinct from 'CONFIRM_STAGE_RUNNER_ONLY' then
    v_status := 'blocked_missing_confirmation';
    v_reason := 'Real runner-only execution requires exact confirmation text.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'dry_run', false,
      'required_confirm_text', 'CONFIRM_STAGE_RUNNER_ONLY',
      'guard_before', v_guard_before,
      'strategy', v_strategy,
      'preflight', v_preflight
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      guard_after = v_guard_before,
      execution_summary = v_summary,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;
  end if;

  v_lock_result := public.race_engine_try_stage_processing_lock_v1(p_stage_id);

  if not coalesce((v_lock_result->>'locked')::boolean, false) then
    v_status := 'blocked_lock_not_acquired';
    v_reason := 'Could not acquire transaction-scoped stage processing lock.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'lock_result', v_lock_result,
      'guard_before', v_guard_before,
      'strategy', v_strategy,
      'preflight', v_preflight
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      lock_result = v_lock_result,
      guard_after = v_guard_before,
      execution_summary = v_summary,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;
  end if;

  v_guard_after_lock := public.race_engine_get_stage_production_guard_v1(p_stage_id);

  if coalesce((v_guard_after_lock->>'should_block_normal_simulation')::boolean, false) then
    v_status := 'blocked_by_production_guard_after_lock';
    v_reason := 'Production guard blocked after lock acquisition. Another process may have written outputs first.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'lock_result', v_lock_result,
      'guard_before', v_guard_before,
      'guard_after_lock', v_guard_after_lock,
      'strategy', v_strategy,
      'preflight', v_preflight
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      lock_result = v_lock_result,
      guard_after = v_guard_after_lock,
      execution_summary = v_summary,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;
  end if;

  begin
    v_runner_started_at := clock_timestamp();

    v_runner_result := public.run_race_stage_road_race_v1(p_stage_id);

    v_runner_finished_at := clock_timestamp();

    select sim.id
    into v_completed_simulation_run_id
    from public.race_stage_simulation_runs sim
    where sim.stage_id = p_stage_id
      and sim.status = 'completed'
    order by sim.created_at desc
    limit 1;

    if v_completed_simulation_run_id is null then
      raise exception 'Runner completed but completed simulation run was not found for stage %.', p_stage_id;
    end if;

    v_guard_after := public.race_engine_get_stage_production_guard_v1(p_stage_id);

    v_status := 'official_road_runner_executed_tail_pending';
    v_reason := 'Road runner completed in split pipeline. Replay-tail repair is pending.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_number', v_stage.stage_number,
      'stage_format', v_stage.stage_format,
      'dry_run', false,
      'pipeline_version', v_pipeline_version,
      'selected_runner_function', v_selected_runner,
      'selected_finalizer_function', v_selected_finalizer,
      'completed_simulation_run_id', v_completed_simulation_run_id,
      'runner_started_at', v_runner_started_at,
      'runner_finished_at', v_runner_finished_at,
      'runner_result', coalesce(v_runner_result, '{}'::jsonb),
      'guard_before', v_guard_before,
      'guard_after_lock', v_guard_after_lock,
      'guard_after', v_guard_after,
      'strategy', v_strategy,
      'preflight', v_preflight,
      'lock_result', v_lock_result,
      'tail_repair_completed', false,
      'next_step', 'Run race_engine_process_stage_tail_repair_v1 for this stage.'
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      lock_result = v_lock_result,
      guard_after = v_guard_after,
      execution_summary = v_summary,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;

  exception when others then
    v_runner_finished_at := clock_timestamp();
    v_guard_after := public.race_engine_get_stage_production_guard_v1(p_stage_id);

    v_status := 'runner_error_rolled_back';
    v_reason := 'Split runner-only execution raised an exception. Runner writes were rolled back by nested exception block.';

    v_summary := jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'attempt_id', v_attempt_id,
      'stage_id', v_stage.stage_id,
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_number', v_stage.stage_number,
      'stage_format', v_stage.stage_format,
      'dry_run', false,
      'pipeline_version', v_pipeline_version,
      'selected_runner_function', v_selected_runner,
      'selected_finalizer_function', v_selected_finalizer,
      'guard_before', v_guard_before,
      'guard_after_lock', v_guard_after_lock,
      'guard_after', v_guard_after,
      'strategy', v_strategy,
      'preflight', v_preflight,
      'lock_result', v_lock_result,
      'runner_started_at', v_runner_started_at,
      'runner_finished_at', v_runner_finished_at,
      'runner_error', sqlerrm,
      'runner_result', coalesce(v_runner_result, '{}'::jsonb)
    );

    update public.race_engine_stage_processing_attempts_v1
    set
      status = v_status,
      reason = v_reason,
      lock_result = v_lock_result,
      guard_after = v_guard_after,
      error_message = sqlerrm,
      execution_summary = v_summary,
      finished_at = now()
    where id = v_attempt_id;

    return v_summary;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_process_stage_tail_repair_v1(p_stage_id uuid, p_dry_run boolean DEFAULT true, p_confirm_text text DEFAULT NULL::text, p_tail_step_seconds integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_stage record;
  v_attempt record;

  v_pipeline_version text := 'phase_3b_split_tail_repair_v1';

  v_simulation_run_id uuid;
  v_repair_result jsonb := '{}'::jsonb;

  v_result_rows integer := 0;
  v_slowest_seconds integer;
  v_last_replay_seconds integer;
  v_final_frame_number integer;
  v_final_frame_rider_count integer;
  v_replay_group_rows integer := 0;

  v_status text;
  v_reason text;
  v_summary jsonb := '{}'::jsonb;
begin
  perform set_config('statement_timeout', '300s', true);

  select
    s.id as stage_id,
    s.race_id,
    r.name as race_name,
    coalesce(s.stage_format, 'road_race') as stage_format,
    s.stage_number
  into v_stage
  from public.race_stages s
  join public.races r
    on r.id = s.race_id
  where s.id = p_stage_id
  limit 1;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status', 'stage_not_found',
      'stage_id', p_stage_id,
      'dry_run', coalesce(p_dry_run, true),
      'pipeline_version', v_pipeline_version
    );
  end if;

  select *
  into v_attempt
  from public.race_engine_stage_processing_attempts_v1 attempt
  where attempt.stage_id = p_stage_id
    and attempt.dry_run = false
    and attempt.status in (
      'official_road_runner_executed_tail_pending',
      'official_road_runner_executed_manual_tail_pending'
    )
  order by attempt.created_at desc
  limit 1;

  if v_attempt.id is null then
    return jsonb_build_object(
      'status', 'blocked_no_tail_pending_attempt',
      'reason', 'No runner-completed tail-pending attempt was found for this stage.',
      'stage_id', p_stage_id,
      'pipeline_version', v_pipeline_version
    );
  end if;

  v_simulation_run_id := nullif(v_attempt.execution_summary->>'completed_simulation_run_id', '')::uuid;

  if v_simulation_run_id is null then
    select sim.id
    into v_simulation_run_id
    from public.race_stage_simulation_runs sim
    where sim.stage_id = p_stage_id
      and sim.status = 'completed'
    order by sim.created_at desc
    limit 1;
  end if;

  if v_simulation_run_id is null then
    return jsonb_build_object(
      'status', 'blocked_no_completed_simulation_run',
      'reason', 'No completed simulation run found for tail repair.',
      'stage_id', p_stage_id,
      'attempt_id', v_attempt.id,
      'pipeline_version', v_pipeline_version
    );
  end if;

  if coalesce(p_dry_run, true) then
    v_repair_result := public.race_engine_repair_replay_finish_tail_v1(
      v_simulation_run_id,
      false,
      p_tail_step_seconds
    );

    v_summary := jsonb_build_object(
      'status', 'dry_run_tail_repair_checked',
      'reason', 'Tail repair dry-run completed. No replay rows were written.',
      'pipeline_version', v_pipeline_version,
      'stage_id', p_stage_id,
      'attempt_id', v_attempt.id,
      'completed_simulation_run_id', v_simulation_run_id,
      'tail_repair_result', v_repair_result,
      'next_step', 'Run with p_dry_run=false and CONFIRM_STAGE_TAIL_REPAIR.'
    );

    return v_summary;
  end if;

  if p_confirm_text is distinct from 'CONFIRM_STAGE_TAIL_REPAIR' then
    return jsonb_build_object(
      'status', 'blocked_missing_confirmation',
      'reason', 'Real tail repair requires exact confirmation text.',
      'required_confirm_text', 'CONFIRM_STAGE_TAIL_REPAIR',
      'pipeline_version', v_pipeline_version,
      'stage_id', p_stage_id,
      'attempt_id', v_attempt.id,
      'completed_simulation_run_id', v_simulation_run_id
    );
  end if;

  v_repair_result := public.race_engine_repair_replay_finish_tail_v1(
    v_simulation_run_id,
    true,
    p_tail_step_seconds
  );

  select
    count(*)::integer,
    max(elapsed_seconds)::integer
  into
    v_result_rows,
    v_slowest_seconds
  from public.race_stage_results
  where stage_id = p_stage_id
    and status = 'finished';

  select
    max(race_seconds)::integer,
    max(frame_number)::integer,
    count(*)::integer
  into
    v_last_replay_seconds,
    v_final_frame_number,
    v_replay_group_rows
  from public.race_stage_replay_frames
  where stage_id = p_stage_id
    and simulation_run_id = v_simulation_run_id;

  select count(distinct rider_id)::integer
  into v_final_frame_rider_count
  from (
    select unnest(rf.rider_ids) as rider_id
    from public.race_stage_replay_frames rf
    where rf.stage_id = p_stage_id
      and rf.simulation_run_id = v_simulation_run_id
      and rf.frame_number = v_final_frame_number
  ) final_riders;

  if v_last_replay_seconds >= v_slowest_seconds
     and v_final_frame_rider_count >= v_result_rows then
    v_status := 'official_road_runner_executed_tail_repaired';
    v_reason := 'Road runner completed in split pipeline and replay-tail repair completed.';
  else
    v_status := 'tail_repair_applied_but_verify_needed';
    v_reason := 'Tail repair applied, but replay-end verification did not fully pass.';
  end if;

  v_summary :=
    coalesce(v_attempt.execution_summary, '{}'::jsonb)
    || jsonb_build_object(
      'status', v_status,
      'reason', v_reason,
      'mode', 'split_runner_tail_repaired',
      'pipeline_version', v_pipeline_version,
      'stage_id', p_stage_id,
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_number', v_stage.stage_number,
      'completed_simulation_run_id', v_simulation_run_id,
      'tail_repair_completed', v_status = 'official_road_runner_executed_tail_repaired',
      'tail_repair_result', v_repair_result,
      'result_rows', v_result_rows,
      'slowest_seconds', v_slowest_seconds,
      'last_replay_seconds_after_tail_repair', v_last_replay_seconds,
      'final_frame_number_after_tail_repair', v_final_frame_number,
      'final_frame_rider_count_after_tail_repair', v_final_frame_rider_count,
      'replay_group_rows_after_tail_repair', v_replay_group_rows,
      'replay_end_diagnosis',
        case
          when v_last_replay_seconds >= v_slowest_seconds
           and v_final_frame_rider_count >= v_result_rows
          then 'replay_reaches_slowest_finisher'
          else 'tail_repair_verify_needed'
        end
    );

  update public.race_engine_stage_processing_attempts_v1 attempt
  set
    status = v_status,
    reason = v_reason,
    execution_summary = v_summary,
    finished_at = now(),
    error_message = null
  where attempt.id = v_attempt.id;

  return v_summary;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_compact_replay_density_v1(p_stage_id uuid, p_dry_run boolean DEFAULT true, p_confirm_text text DEFAULT NULL::text, p_target_replay_rows integer DEFAULT 4900, p_preserve_last_frames integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_stage record;
  v_simulation_run_id uuid;

  v_rows_before integer := 0;
  v_frames_before integer := 0;
  v_first_frame_number integer;
  v_final_frame_number integer;

  v_selected_modulus integer;
  v_frames_to_remove integer := 0;
  v_rows_to_remove integer := 0;
  v_projected_replay_rows integer := 0;
  v_rows_deleted integer := 0;

  v_result_rows integer := 0;
  v_slowest_seconds integer;
  v_last_replay_seconds integer;
  v_final_frame_rider_count integer := 0;

  v_density_before jsonb := '{}'::jsonb;
  v_density_after jsonb := '{}'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  perform set_config('statement_timeout', '300s', true);

  if p_target_replay_rows is null or p_target_replay_rows < 1000 then
    return jsonb_build_object(
      'status', 'blocked_invalid_target_replay_rows',
      'stage_id', p_stage_id,
      'target_replay_rows', p_target_replay_rows,
      'reason', 'Target replay rows must be at least 1000.'
    );
  end if;

  if p_preserve_last_frames is null or p_preserve_last_frames < 0 then
    return jsonb_build_object(
      'status', 'blocked_invalid_preserve_last_frames',
      'stage_id', p_stage_id,
      'preserve_last_frames', p_preserve_last_frames,
      'reason', 'Preserve-last-frames must be zero or greater.'
    );
  end if;

  select
    s.id as stage_id,
    s.race_id,
    r.name as race_name,
    r.category as race_category,
    s.stage_number,
    coalesce(s.stage_format, 'road_race') as stage_format,
    s.distance_km,
    s.terrain_type
  into v_stage
  from public.race_stages s
  join public.races r
    on r.id = s.race_id
  where s.id = p_stage_id
  limit 1;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status', 'stage_not_found',
      'stage_id', p_stage_id
    );
  end if;

  select sim.id
  into v_simulation_run_id
  from public.race_stage_simulation_runs sim
  where sim.stage_id = p_stage_id
    and sim.status = 'completed'
  order by sim.created_at desc
  limit 1;

  if v_simulation_run_id is null then
    return jsonb_build_object(
      'status', 'blocked_no_completed_simulation_run',
      'stage_id', p_stage_id,
      'race_name', v_stage.race_name,
      'stage_number', v_stage.stage_number
    );
  end if;

  v_density_before := public.race_engine_check_replay_density_v1(p_stage_id);

  select
    count(*)::integer,
    count(distinct rf.frame_number)::integer,
    min(rf.frame_number)::integer,
    max(rf.frame_number)::integer
  into
    v_rows_before,
    v_frames_before,
    v_first_frame_number,
    v_final_frame_number
  from public.race_stage_replay_frames rf
  where rf.stage_id = p_stage_id
    and rf.simulation_run_id = v_simulation_run_id;

  if v_rows_before = 0 then
    return jsonb_build_object(
      'status', 'blocked_no_replay_rows',
      'stage_id', p_stage_id,
      'simulation_run_id', v_simulation_run_id
    );
  end if;

  if v_rows_before <= p_target_replay_rows then
    return jsonb_build_object(
      'status', 'no_compaction_needed',
      'reason', 'Replay rows are already at or below target.',
      'stage_id', p_stage_id,
      'race_name', v_stage.race_name,
      'stage_number', v_stage.stage_number,
      'simulation_run_id', v_simulation_run_id,
      'rows_before', v_rows_before,
      'target_replay_rows', p_target_replay_rows,
      'density_before', v_density_before
    );
  end if;

  with frame_stats as (
    select
      rf.frame_number,
      min(rf.race_seconds) as race_seconds,
      count(*)::integer as frame_row_count
    from public.race_stage_replay_frames rf
    where rf.stage_id = p_stage_id
      and rf.simulation_run_id = v_simulation_run_id
    group by rf.frame_number
  ),
  bounds as (
    select
      min(frame_number) as first_frame_number,
      max(frame_number) as final_frame_number
    from frame_stats
  ),
  numbered_frames as (
    select
      fs.*,
      row_number() over (order by fs.frame_number) as frame_order
    from frame_stats fs
    cross join bounds b
    where fs.frame_number <> b.first_frame_number
      and fs.frame_number <> b.final_frame_number
      and fs.frame_number < b.final_frame_number - p_preserve_last_frames
  ),
  plans as (
    select
      m.modulus,
      count(*) filter (where nf.frame_order % m.modulus = 0)::integer as frames_to_remove,
      coalesce(
        sum(nf.frame_row_count) filter (where nf.frame_order % m.modulus = 0),
        0
      )::integer as rows_to_remove
    from numbered_frames nf
    cross join generate_series(2, 30) as m(modulus)
    group by m.modulus
  ),
  valid_plans as (
    select
      p.modulus,
      p.frames_to_remove,
      p.rows_to_remove,
      v_rows_before - p.rows_to_remove as projected_replay_rows
    from plans p
    where p.rows_to_remove > 0
      and v_rows_before - p.rows_to_remove <= p_target_replay_rows
  )
  select
    vp.modulus,
    vp.frames_to_remove,
    vp.rows_to_remove,
    vp.projected_replay_rows
  into
    v_selected_modulus,
    v_frames_to_remove,
    v_rows_to_remove,
    v_projected_replay_rows
  from valid_plans vp
  order by
    vp.rows_to_remove asc,
    vp.modulus desc
  limit 1;

  if v_selected_modulus is null then
    return jsonb_build_object(
      'status', 'blocked_no_safe_compaction_plan',
      'reason', 'No sampled intermediate-frame compaction plan reached the target replay-row count.',
      'stage_id', p_stage_id,
      'race_name', v_stage.race_name,
      'stage_number', v_stage.stage_number,
      'simulation_run_id', v_simulation_run_id,
      'rows_before', v_rows_before,
      'frames_before', v_frames_before,
      'target_replay_rows', p_target_replay_rows,
      'preserve_last_frames', p_preserve_last_frames,
      'density_before', v_density_before
    );
  end if;

  v_summary := jsonb_build_object(
    'status',
      case
        when coalesce(p_dry_run, true)
        then 'dry_run_compaction_planned'
        else 'compaction_plan_ready'
      end,
    'stage_id', p_stage_id,
    'race_id', v_stage.race_id,
    'race_name', v_stage.race_name,
    'race_category', v_stage.race_category,
    'stage_number', v_stage.stage_number,
    'stage_format', v_stage.stage_format,
    'simulation_run_id', v_simulation_run_id,
    'dry_run', coalesce(p_dry_run, true),
    'rows_before', v_rows_before,
    'frames_before', v_frames_before,
    'first_frame_number', v_first_frame_number,
    'final_frame_number', v_final_frame_number,
    'target_replay_rows', p_target_replay_rows,
    'preserve_last_frames', p_preserve_last_frames,
    'selected_modulus', v_selected_modulus,
    'delete_method', 'delete_every_selected_nth_intermediate_frame_preserve_first_final_and_last_frames',
    'planned_frames_to_remove', v_frames_to_remove,
    'planned_rows_to_remove', v_rows_to_remove,
    'projected_replay_rows_after_compaction', v_projected_replay_rows,
    'density_before', v_density_before
  );

  if coalesce(p_dry_run, true) then
    return v_summary;
  end if;

  if p_confirm_text is distinct from 'CONFIRM_REPLAY_COMPACTION' then
    return v_summary || jsonb_build_object(
      'status', 'blocked_missing_confirmation',
      'reason', 'Real replay compaction requires exact confirmation text.',
      'required_confirm_text', 'CONFIRM_REPLAY_COMPACTION'
    );
  end if;

  drop table if exists tmp_replay_compaction_delete;

  create temp table tmp_replay_compaction_delete
  on commit drop
  as
  with frame_stats as (
    select
      rf.frame_number,
      min(rf.race_seconds) as race_seconds,
      count(*)::integer as frame_row_count
    from public.race_stage_replay_frames rf
    where rf.stage_id = p_stage_id
      and rf.simulation_run_id = v_simulation_run_id
    group by rf.frame_number
  ),
  bounds as (
    select
      min(frame_number) as first_frame_number,
      max(frame_number) as final_frame_number
    from frame_stats
  ),
  numbered_frames as (
    select
      fs.*,
      row_number() over (order by fs.frame_number) as frame_order
    from frame_stats fs
    cross join bounds b
    where fs.frame_number <> b.first_frame_number
      and fs.frame_number <> b.final_frame_number
      and fs.frame_number < b.final_frame_number - p_preserve_last_frames
  ),
  frames_to_delete as (
    select nf.frame_number
    from numbered_frames nf
    where nf.frame_order % v_selected_modulus = 0
  )
  select
    rf.id,
    rf.frame_number,
    rf.race_seconds
  from public.race_stage_replay_frames rf
  join frames_to_delete d
    on d.frame_number = rf.frame_number
  where rf.stage_id = p_stage_id
    and rf.simulation_run_id = v_simulation_run_id;

  select count(*)::integer
  into v_rows_to_remove
  from tmp_replay_compaction_delete;

  if v_rows_to_remove <= 0 then
    raise exception 'Replay compaction delete list is empty for stage %.', p_stage_id;
  end if;

  if v_rows_before - v_rows_to_remove > p_target_replay_rows then
    raise exception
      'Replay compaction plan no longer reaches target. rows_before %, rows_to_remove %, target %.',
      v_rows_before,
      v_rows_to_remove,
      p_target_replay_rows;
  end if;

  if v_rows_to_remove > greatest(1000, floor(v_rows_before * 0.60)::integer) then
    raise exception
      'Replay compaction plan is too aggressive. rows_before %, rows_to_remove %.',
      v_rows_before,
      v_rows_to_remove;
  end if;

  delete from public.race_stage_replay_frames rf
  using tmp_replay_compaction_delete d
  where rf.id = d.id;

  get diagnostics v_rows_deleted = row_count;

  select
    count(*)::integer,
    max(elapsed_seconds)::integer
  into
    v_result_rows,
    v_slowest_seconds
  from public.race_stage_results
  where stage_id = p_stage_id
    and status = 'finished';

  select
    max(rf.race_seconds)::integer,
    max(rf.frame_number)::integer
  into
    v_last_replay_seconds,
    v_final_frame_number
  from public.race_stage_replay_frames rf
  where rf.stage_id = p_stage_id
    and rf.simulation_run_id = v_simulation_run_id;

  select count(distinct rider_id)::integer
  into v_final_frame_rider_count
  from (
    select unnest(rf.rider_ids) as rider_id
    from public.race_stage_replay_frames rf
    where rf.stage_id = p_stage_id
      and rf.simulation_run_id = v_simulation_run_id
      and rf.frame_number = v_final_frame_number
  ) final_riders;

  v_density_after := public.race_engine_check_replay_density_v1(p_stage_id);

  with latest_attempt as (
    select attempt.id
    from public.race_engine_stage_processing_attempts_v1 attempt
    where attempt.stage_id = p_stage_id
      and attempt.dry_run = false
    order by attempt.created_at desc
    limit 1
  )
  update public.race_engine_stage_processing_attempts_v1 attempt
  set execution_summary =
    coalesce(attempt.execution_summary, '{}'::jsonb)
    || jsonb_build_object(
      'replay_compaction_applied', true,
      'replay_compaction_function', 'race_engine_compact_replay_density_v1',
      'replay_compaction_reason', 'Replay exceeded target/cap and was compacted using sampled intermediate-frame deletion.',
      'replay_compaction_method', 'delete_every_selected_nth_intermediate_frame_preserve_first_final_and_last_frames',
      'replay_compaction_target_replay_rows', p_target_replay_rows,
      'replay_compaction_preserve_last_frames', p_preserve_last_frames,
      'replay_compaction_selected_modulus', v_selected_modulus,
      'replay_compaction_rows_before', v_rows_before,
      'replay_compaction_rows_deleted', v_rows_deleted,
      'replay_compaction_rows_after', v_rows_before - v_rows_deleted,
      'replay_compaction_applied_at', now()
    )
  from latest_attempt la
  where attempt.id = la.id;

  return v_summary || jsonb_build_object(
    'status', 'replay_compaction_applied',
    'rows_deleted', v_rows_deleted,
    'rows_after', v_rows_before - v_rows_deleted,
    'density_after', v_density_after,
    'result_rows', v_result_rows,
    'slowest_seconds', v_slowest_seconds,
    'last_replay_seconds_after_compaction', v_last_replay_seconds,
    'final_frame_number_after_compaction', v_final_frame_number,
    'final_frame_rider_count_after_compaction', v_final_frame_rider_count,
    'replay_end_diagnosis',
      case
        when v_last_replay_seconds >= v_slowest_seconds
         and v_final_frame_rider_count >= v_result_rows
        then 'replay_reaches_slowest_finisher'
        else 'replay_compaction_verify_needed'
      end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_closeout_stage_after_tail_v1(p_stage_id uuid, p_dry_run boolean DEFAULT true, p_confirm_text text DEFAULT NULL::text, p_auto_compact boolean DEFAULT true, p_target_replay_rows integer DEFAULT 4900, p_preserve_last_frames integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_stage record;
  v_output record;

  v_simulation_run_id uuid;

  v_result_rows integer := 0;
  v_winner_seconds integer;
  v_slowest_seconds integer;
  v_max_gap_seconds integer;

  v_first_replay_seconds integer;
  v_last_replay_seconds integer;
  v_first_frame_number integer;
  v_last_frame_number integer;
  v_replay_group_rows integer := 0;
  v_final_frame_rider_count integer := 0;
  v_missing_seconds integer := 0;
  v_replay_end_diagnosis text := 'unknown';

  v_guard jsonb := '{}'::jsonb;
  v_density_before jsonb := '{}'::jsonb;
  v_density_after jsonb := '{}'::jsonb;
  v_compaction_result jsonb := null;

  v_closeout_status text;
  v_closeout_reason text;
  v_summary jsonb := '{}'::jsonb;
begin
  perform set_config('statement_timeout', '300s', true);

  select
    s.id as stage_id,
    s.race_id,
    r.name as race_name,
    r.category as race_category,
    s.stage_number,
    coalesce(s.stage_format, 'road_race') as stage_format,
    s.distance_km,
    s.terrain_type
  into v_stage
  from public.race_stages s
  join public.races r
    on r.id = s.race_id
  where s.id = p_stage_id
  limit 1;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status', 'stage_not_found',
      'stage_id', p_stage_id
    );
  end if;

  select *
  into v_output
  from public.race_engine_stage_output_integrity_v1
  where stage_id = p_stage_id
  limit 1;

  if v_output.stage_id is null then
    return jsonb_build_object(
      'status', 'blocked_output_integrity_missing',
      'reason', 'Stage output-integrity view returned no row for this stage.',
      'stage_id', p_stage_id,
      'race_name', v_stage.race_name,
      'stage_number', v_stage.stage_number
    );
  end if;

  select sim.id
  into v_simulation_run_id
  from public.race_stage_simulation_runs sim
  where sim.stage_id = p_stage_id
    and sim.status = 'completed'
  order by sim.created_at desc
  limit 1;

  if v_simulation_run_id is null then
    return jsonb_build_object(
      'status', 'blocked_no_completed_simulation_run',
      'reason', 'No completed simulation run exists for this stage.',
      'stage_id', p_stage_id,
      'race_name', v_stage.race_name,
      'stage_number', v_stage.stage_number
    );
  end if;

  select
    count(*)::integer,
    min(elapsed_seconds)::integer,
    max(elapsed_seconds)::integer,
    max(gap_seconds)::integer
  into
    v_result_rows,
    v_winner_seconds,
    v_slowest_seconds,
    v_max_gap_seconds
  from public.race_stage_results
  where stage_id = p_stage_id
    and status = 'finished';

  select
    min(rf.race_seconds)::integer,
    max(rf.race_seconds)::integer,
    min(rf.frame_number)::integer,
    max(rf.frame_number)::integer,
    count(*)::integer
  into
    v_first_replay_seconds,
    v_last_replay_seconds,
    v_first_frame_number,
    v_last_frame_number,
    v_replay_group_rows
  from public.race_stage_replay_frames rf
  where rf.stage_id = p_stage_id
    and rf.simulation_run_id = v_simulation_run_id;

  if v_last_frame_number is not null then
    select count(distinct rider_id)::integer
    into v_final_frame_rider_count
    from (
      select unnest(rf.rider_ids) as rider_id
      from public.race_stage_replay_frames rf
      where rf.stage_id = p_stage_id
        and rf.simulation_run_id = v_simulation_run_id
        and rf.frame_number = v_last_frame_number
    ) final_riders;
  end if;

  v_missing_seconds := greatest(coalesce(v_slowest_seconds, 0) - coalesce(v_last_replay_seconds, 0), 0);

  v_replay_end_diagnosis :=
    case
      when v_last_replay_seconds >= v_slowest_seconds
       and v_final_frame_rider_count >= v_result_rows
      then 'replay_reaches_slowest_finisher'
      when v_last_replay_seconds = v_winner_seconds
      then 'replay_ends_at_winner_time'
      else 'replay_end_verify_needed'
    end;

  v_guard := public.race_engine_get_stage_production_guard_v1(p_stage_id);
  v_density_before := public.race_engine_check_replay_density_v1(p_stage_id);
  v_density_after := v_density_before;

  if coalesce(v_output.output_integrity_status, '') <> 'completed_outputs_present' then
    v_closeout_status := 'blocked_output_integrity_not_complete';
    v_closeout_reason := 'Stage outputs are not complete.';
  elsif not coalesce(v_output.should_block_normal_simulation, false) then
    v_closeout_status := 'blocked_rerun_guard_not_active';
    v_closeout_reason := 'Stage is not protected against normal rerun.';
  elsif v_result_rows <= 0 then
    v_closeout_status := 'blocked_no_finished_results';
    v_closeout_reason := 'No finished stage-result rows found.';
  elsif v_replay_group_rows <= 0 then
    v_closeout_status := 'blocked_no_replay_frames';
    v_closeout_reason := 'No replay frames found for latest completed simulation run.';
  elsif v_replay_end_diagnosis <> 'replay_reaches_slowest_finisher' then
    v_closeout_status := 'blocked_replay_tail_incomplete';
    v_closeout_reason := 'Replay does not yet reach the slowest finisher with all finished riders in final frame.';
  elsif coalesce((v_density_before->>'has_violation')::boolean, false)
        and not coalesce(p_auto_compact, true) then
    v_closeout_status := 'blocked_density_violation_auto_compact_disabled';
    v_closeout_reason := 'Replay density has a violation and auto-compaction is disabled.';
  elsif coalesce((v_density_before->>'has_violation')::boolean, false)
        and coalesce(p_auto_compact, true)
        and coalesce(p_dry_run, true) then
    v_compaction_result := public.race_engine_compact_replay_density_v1(
      p_stage_id,
      true,
      null,
      p_target_replay_rows,
      p_preserve_last_frames
    );

    v_closeout_status := 'dry_run_closeout_density_compaction_planned';
    v_closeout_reason := 'Closeout dry-run found density violation and planned compaction.';
  elsif coalesce((v_density_before->>'has_violation')::boolean, false)
        and coalesce(p_auto_compact, true)
        and not coalesce(p_dry_run, true) then

    if p_confirm_text is distinct from 'CONFIRM_STAGE_CLOSEOUT' then
      v_closeout_status := 'blocked_missing_confirmation';
      v_closeout_reason := 'Real closeout with compaction requires exact confirmation text.';
    else
      v_compaction_result := public.race_engine_compact_replay_density_v1(
        p_stage_id,
        false,
        'CONFIRM_REPLAY_COMPACTION',
        p_target_replay_rows,
        p_preserve_last_frames
      );

      v_density_after := public.race_engine_check_replay_density_v1(p_stage_id);

      if coalesce((v_density_after->>'has_violation')::boolean, false) then
        v_closeout_status := 'closeout_compacted_but_density_still_violates';
        v_closeout_reason := 'Compaction ran, but density still violates limits.';
      elsif coalesce(v_compaction_result->>'replay_end_diagnosis', '') not in (
        '',
        'replay_reaches_slowest_finisher'
      ) then
        v_closeout_status := 'closeout_compacted_but_replay_verify_needed';
        v_closeout_reason := 'Compaction ran, but replay-end verification needs review.';
      else
        v_closeout_status := 'stage_closeout_passed';
        v_closeout_reason := 'Stage closeout passed after automatic replay compaction.';
      end if;
    end if;
  else
    if coalesce(p_dry_run, true) then
      v_closeout_status := 'dry_run_stage_closeout_passed';
      v_closeout_reason := 'Stage closeout dry-run passed. No changes made.';
    else
      if p_confirm_text is distinct from 'CONFIRM_STAGE_CLOSEOUT' then
        v_closeout_status := 'blocked_missing_confirmation';
        v_closeout_reason := 'Real closeout requires exact confirmation text.';
      else
        v_closeout_status := 'stage_closeout_passed';
        v_closeout_reason := 'Stage closeout passed. No compaction needed.';
      end if;
    end if;
  end if;

  v_summary := jsonb_build_object(
    'status', v_closeout_status,
    'reason', v_closeout_reason,
    'stage_id', p_stage_id,
    'race_id', v_stage.race_id,
    'race_name', v_stage.race_name,
    'race_category', v_stage.race_category,
    'stage_number', v_stage.stage_number,
    'stage_format', v_stage.stage_format,
    'terrain_type', v_stage.terrain_type,
    'distance_km', v_stage.distance_km,
    'dry_run', coalesce(p_dry_run, true),
    'auto_compact', coalesce(p_auto_compact, true),
    'target_replay_rows', p_target_replay_rows,
    'preserve_last_frames', p_preserve_last_frames,
    'simulation_run_id', v_simulation_run_id,
    'result_rows', v_result_rows,
    'winner_seconds', v_winner_seconds,
    'slowest_seconds', v_slowest_seconds,
    'max_gap_seconds', v_max_gap_seconds,
    'first_replay_seconds', v_first_replay_seconds,
    'last_replay_seconds', v_last_replay_seconds,
    'first_frame_number', v_first_frame_number,
    'last_frame_number', v_last_frame_number,
    'replay_group_rows', v_replay_group_rows,
    'final_frame_rider_count', v_final_frame_rider_count,
    'missing_seconds_after_tail_repair', v_missing_seconds,
    'replay_end_diagnosis', v_replay_end_diagnosis,
    'output_integrity_status', v_output.output_integrity_status,
    'should_block_normal_simulation', v_output.should_block_normal_simulation,
    'stage_result_rows', v_output.stage_result_rows,
    'stage_point_result_rows', v_output.stage_point_result_rows,
    'classification_rows', v_output.classification_rows,
    'ranking_award_rows', v_output.ranking_award_rows,
    'prize_award_rows', v_output.prize_award_rows,
    'report_event_rows', v_output.report_event_rows,
    'rider_state_rows', v_output.rider_state_rows,
    'team_state_rows', v_output.team_state_rows,
    'guard', v_guard,
    'density_before', v_density_before,
    'density_after', v_density_after,
    'compaction_result', v_compaction_result
  );

  if not coalesce(p_dry_run, true)
     and v_closeout_status = 'stage_closeout_passed' then
    with latest_attempt as (
      select attempt.id
      from public.race_engine_stage_processing_attempts_v1 attempt
      where attempt.stage_id = p_stage_id
        and attempt.dry_run = false
      order by attempt.created_at desc
      limit 1
    )
    update public.race_engine_stage_processing_attempts_v1 attempt
    set execution_summary =
        coalesce(attempt.execution_summary, '{}'::jsonb)
        || jsonb_build_object(
          'stage_closeout_completed', true,
          'stage_closeout_function', 'race_engine_closeout_stage_after_tail_v1',
          'stage_closeout_status', v_closeout_status,
          'stage_closeout_reason', v_closeout_reason,
          'stage_closeout_completed_at', now(),
          'stage_closeout_density_has_violation_before', coalesce((v_density_before->>'has_violation')::boolean, false),
          'stage_closeout_density_has_violation_after', coalesce((v_density_after->>'has_violation')::boolean, false),
          'stage_closeout_replay_end_diagnosis', v_replay_end_diagnosis,
          'stage_closeout_replay_group_rows', v_replay_group_rows
        )
    from latest_attempt la
    where attempt.id = la.id;
  end if;

  return v_summary;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_processing_state_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '120s'
AS $function$
declare
  v_stage record;
  v_output record;
  v_latest_attempt record;

  v_guard jsonb := '{}'::jsonb;
  v_density jsonb := '{}'::jsonb;

  v_simulation_run_id uuid;

  v_result_rows integer := 0;
  v_winner_seconds integer;
  v_slowest_seconds integer;
  v_max_gap_seconds integer;

  v_first_replay_seconds integer;
  v_last_replay_seconds integer;
  v_first_frame_number integer;
  v_last_frame_number integer;
  v_replay_group_rows integer := 0;
  v_final_frame_rider_count integer := 0;
  v_missing_seconds integer := 0;
  v_replay_end_diagnosis text := 'unknown';

  v_latest_status text;
  v_latest_pipeline_version text;
  v_latest_error_message text;
  v_tail_repair_completed boolean := false;
  v_stage_closeout_completed boolean := false;
  v_stage_closeout_status text;

  v_next_action text;
  v_next_action_reason text;
begin
  perform set_config('statement_timeout', '120s', true);

  select
    s.id as stage_id,
    s.race_id,
    r.name as race_name,
    r.category as race_category,
    s.stage_number,
    coalesce(s.stage_format, 'road_race') as stage_format,
    s.stage_date,
    s.distance_km,
    s.terrain_type
  into v_stage
  from public.race_stages s
  join public.races r
    on r.id = s.race_id
  where s.id = p_stage_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'status', 'stage_not_found',
      'stage_id', p_stage_id,
      'next_action', 'none',
      'next_action_reason', 'Stage ID was not found.'
    );
  end if;

  select *
  into v_output
  from public.race_engine_stage_output_integrity_v1
  where stage_id = p_stage_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'status', 'output_integrity_missing',
      'stage_id', p_stage_id,
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_number', v_stage.stage_number,
      'next_action', 'investigate_output_integrity_view',
      'next_action_reason', 'The output-integrity view returned no row for this stage.'
    );
  end if;

  select
    attempt.id,
    attempt.pipeline_version,
    attempt.status,
    attempt.error_message,
    attempt.created_at,
    attempt.finished_at,
    attempt.execution_summary,
    attempt.execution_summary->>'completed_simulation_run_id' as completed_simulation_run_id,
    attempt.execution_summary->>'tail_repair_completed' as tail_repair_completed_text,
    attempt.execution_summary->>'replay_end_diagnosis' as replay_end_diagnosis_text,
    attempt.execution_summary->>'stage_closeout_completed' as stage_closeout_completed_text,
    attempt.execution_summary->>'stage_closeout_status' as stage_closeout_status_text
  into v_latest_attempt
  from public.race_engine_stage_processing_attempts_v1 attempt
  where attempt.stage_id = p_stage_id
    and attempt.dry_run = false
  order by attempt.created_at desc
  limit 1;

  if found then
    v_latest_status := v_latest_attempt.status;
    v_latest_pipeline_version := v_latest_attempt.pipeline_version;
    v_latest_error_message := v_latest_attempt.error_message;
    v_tail_repair_completed := coalesce(v_latest_attempt.tail_repair_completed_text::boolean, false);
    v_stage_closeout_completed := coalesce(v_latest_attempt.stage_closeout_completed_text::boolean, false);
    v_stage_closeout_status := v_latest_attempt.stage_closeout_status_text;
  end if;

  select sim.id
  into v_simulation_run_id
  from public.race_stage_simulation_runs sim
  where sim.stage_id = p_stage_id
    and sim.status = 'completed'
  order by sim.created_at desc
  limit 1;

  select
    count(*)::integer,
    min(elapsed_seconds)::integer,
    max(elapsed_seconds)::integer,
    max(gap_seconds)::integer
  into
    v_result_rows,
    v_winner_seconds,
    v_slowest_seconds,
    v_max_gap_seconds
  from public.race_stage_results
  where stage_id = p_stage_id
    and status = 'finished';

  if v_simulation_run_id is not null then
    select
      min(rf.race_seconds)::integer,
      max(rf.race_seconds)::integer,
      min(rf.frame_number)::integer,
      max(rf.frame_number)::integer,
      count(*)::integer
    into
      v_first_replay_seconds,
      v_last_replay_seconds,
      v_first_frame_number,
      v_last_frame_number,
      v_replay_group_rows
    from public.race_stage_replay_frames rf
    where rf.stage_id = p_stage_id
      and rf.simulation_run_id = v_simulation_run_id;

    if v_last_frame_number is not null then
      select count(distinct rider_id)::integer
      into v_final_frame_rider_count
      from (
        select unnest(rf.rider_ids) as rider_id
        from public.race_stage_replay_frames rf
        where rf.stage_id = p_stage_id
          and rf.simulation_run_id = v_simulation_run_id
          and rf.frame_number = v_last_frame_number
      ) final_riders;
    end if;
  end if;

  v_missing_seconds := greatest(coalesce(v_slowest_seconds, 0) - coalesce(v_last_replay_seconds, 0), 0);

  v_replay_end_diagnosis :=
    case
      when v_result_rows > 0
       and v_last_replay_seconds >= v_slowest_seconds
       and v_final_frame_rider_count >= v_result_rows
      then 'replay_reaches_slowest_finisher'
      when v_result_rows > 0
       and v_last_replay_seconds = v_winner_seconds
      then 'replay_ends_at_winner_time'
      when v_result_rows > 0
       and coalesce(v_replay_group_rows, 0) > 0
      then 'replay_end_verify_needed'
      else 'no_replay_or_results_yet'
    end;

  v_guard := public.race_engine_get_stage_production_guard_v1(p_stage_id);
  v_density := public.race_engine_check_replay_density_v1(p_stage_id);

  if v_latest_error_message is not null then
    v_next_action := 'investigate_latest_processing_error';
    v_next_action_reason := 'Latest real processing attempt has an error message.';
  elsif coalesce(v_output.output_integrity_status, '') = 'completed_outputs_present'
        and coalesce(v_output.should_block_normal_simulation, false)
        and v_tail_repair_completed
        and v_stage_closeout_completed
        and v_stage_closeout_status = 'stage_closeout_passed' then
    v_next_action := 'none_stage_completed_and_closed_out';
    v_next_action_reason := 'Stage has completed outputs, tail repair, rerun protection, density check, and closeout metadata.';
  elsif coalesce(v_output.output_integrity_status, '') = 'completed_outputs_present'
        and coalesce(v_output.should_block_normal_simulation, false)
        and v_tail_repair_completed
        and not v_stage_closeout_completed then
    v_next_action := 'run_stage_closeout_helper';
    v_next_action_reason := 'Stage outputs and tail repair are complete, but closeout metadata is not written yet.';
  elsif coalesce(v_output.output_integrity_status, '') = 'completed_outputs_present'
        and coalesce(v_output.should_block_normal_simulation, false)
        and v_replay_end_diagnosis = 'replay_reaches_slowest_finisher'
        and not v_tail_repair_completed then
    v_next_action := 'run_stage_closeout_helper_or_mark_tail_repaired_after_review';
    v_next_action_reason := 'Outputs are complete and replay reaches slowest finisher, but latest attempt does not show tail_repair_completed.';
  elsif coalesce(v_output.output_integrity_status, '') = 'completed_outputs_present'
        and coalesce(v_output.should_block_normal_simulation, false)
        and v_replay_end_diagnosis <> 'replay_reaches_slowest_finisher' then
    v_next_action := 'run_tail_repair_dry_run_then_real';
    v_next_action_reason := 'Stage outputs exist, but replay tail does not reach slowest finisher.';
  elsif v_latest_status = 'official_road_runner_executed_tail_pending' then
    v_next_action := 'run_tail_repair_dry_run_then_real';
    v_next_action_reason := 'Runner-only completed and latest attempt is waiting for replay-tail repair.';
  elsif coalesce(v_output.completed_simulation_run_rows, 0) = 0
        and coalesce(v_output.stage_result_rows, 0) = 0 then
    v_next_action := 'run_runner_only_dry_run';
    v_next_action_reason := 'No completed simulation outputs exist for this stage.';
  elsif coalesce(v_output.completed_simulation_run_rows, 0) > 0
        and coalesce(v_output.stage_result_rows, 0) > 0
        and not coalesce(v_output.should_block_normal_simulation, false) then
    v_next_action := 'investigate_completed_outputs_without_rerun_guard';
    v_next_action_reason := 'Some completed outputs exist, but normal rerun is not blocked.';
  else
    v_next_action := 'manual_review_needed';
    v_next_action_reason := 'Stage state does not match a known safe automatic transition.';
  end if;

  return jsonb_build_object(
    'status', 'checked',
    'stage_id', p_stage_id,
    'race_id', v_stage.race_id,
    'race_name', v_stage.race_name,
    'race_category', v_stage.race_category,
    'stage_number', v_stage.stage_number,
    'stage_format', v_stage.stage_format,
    'stage_date', v_stage.stage_date,
    'distance_km', v_stage.distance_km,
    'terrain_type', v_stage.terrain_type,

    'next_action', v_next_action,
    'next_action_reason', v_next_action_reason,

    'latest_real_attempt_id', case when v_latest_attempt.id is null then null else v_latest_attempt.id end,
    'latest_pipeline_version', v_latest_pipeline_version,
    'latest_attempt_status', v_latest_status,
    'latest_attempt_error_message', v_latest_error_message,
    'latest_attempt_created_at', case when v_latest_attempt.id is null then null else v_latest_attempt.created_at end,
    'latest_attempt_finished_at', case when v_latest_attempt.id is null then null else v_latest_attempt.finished_at end,
    'tail_repair_completed', v_tail_repair_completed,
    'stage_closeout_completed', v_stage_closeout_completed,
    'stage_closeout_status', v_stage_closeout_status,

    'simulation_run_id', v_simulation_run_id,

    'output_integrity_status', v_output.output_integrity_status,
    'should_block_normal_simulation', v_output.should_block_normal_simulation,
    'stage_result_rows', v_output.stage_result_rows,
    'stage_point_result_rows', v_output.stage_point_result_rows,
    'classification_rows', v_output.classification_rows,
    'ranking_award_rows', v_output.ranking_award_rows,
    'prize_award_rows', v_output.prize_award_rows,
    'report_event_rows', v_output.report_event_rows,
    'replay_frame_rows', v_output.replay_frame_rows,
    'rider_state_rows', v_output.rider_state_rows,
    'team_state_rows', v_output.team_state_rows,
    'completed_simulation_run_rows', v_output.completed_simulation_run_rows,

    'result_rows', v_result_rows,
    'winner_seconds', v_winner_seconds,
    'slowest_seconds', v_slowest_seconds,
    'max_gap_seconds', v_max_gap_seconds,
    'first_replay_seconds', v_first_replay_seconds,
    'last_replay_seconds', v_last_replay_seconds,
    'first_frame_number', v_first_frame_number,
    'last_frame_number', v_last_frame_number,
    'replay_group_rows', v_replay_group_rows,
    'final_frame_rider_count', v_final_frame_rider_count,
    'missing_seconds_after_tail_repair', v_missing_seconds,
    'replay_end_diagnosis', v_replay_end_diagnosis,

    'density', v_density,
    'guard', v_guard
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_admin_process_stage_once_unlocked_v1(p_stage_id uuid, p_dry_run boolean DEFAULT true, p_confirm_text text DEFAULT NULL::text, p_auto_compact boolean DEFAULT true, p_tail_step_seconds integer DEFAULT 10, p_target_replay_rows integer DEFAULT 4900, p_preserve_last_frames integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_state_before jsonb := '{}'::jsonb;
  v_state_after jsonb := '{}'::jsonb;
  v_next_action text;
  v_action_result jsonb := null;
  v_status text;
  v_reason text;
begin
  perform set_config('statement_timeout', '300s', true);

  v_state_before := public.race_engine_get_stage_processing_state_v1(p_stage_id);
  v_next_action := v_state_before->>'next_action';

  if coalesce(v_state_before->>'status', '') = 'stage_not_found' then
    return jsonb_build_object(
      'status', 'stage_not_found',
      'stage_id', p_stage_id,
      'next_action', 'none',
      'reason', 'Stage ID was not found.',
      'state_before', v_state_before
    );
  end if;

  -- ==========================================================
  -- Already closed: no-op
  -- ==========================================================

  if v_next_action = 'none_stage_completed_and_closed_out' then
    return jsonb_build_object(
      'status', 'no_action_needed_stage_already_closed_out',
      'reason', 'Stage is already completed, tail repaired, closeout-confirmed, density-safe, and rerun-protected.',
      'stage_id', p_stage_id,
      'race_id', v_state_before->>'race_id',
      'race_name', v_state_before->>'race_name',
      'stage_number', v_state_before->>'stage_number',
      'next_action_before', v_next_action,
      'dry_run', coalesce(p_dry_run, true),
      'state_before', v_state_before
    );
  end if;

  -- ==========================================================
  -- Error/manual-review states: do not proceed automatically
  -- ==========================================================

  if v_next_action in (
    'investigate_latest_processing_error',
    'investigate_output_integrity_view',
    'investigate_completed_outputs_without_rerun_guard',
    'manual_review_needed',
    'run_stage_closeout_helper_or_mark_tail_repaired_after_review'
  ) then
    return jsonb_build_object(
      'status', 'blocked_manual_review_needed',
      'reason', 'State helper returned a non-automatic next action. Admin wrapper will not proceed.',
      'stage_id', p_stage_id,
      'race_id', v_state_before->>'race_id',
      'race_name', v_state_before->>'race_name',
      'stage_number', v_state_before->>'stage_number',
      'next_action_before', v_next_action,
      'next_action_reason', v_state_before->>'next_action_reason',
      'dry_run', coalesce(p_dry_run, true),
      'state_before', v_state_before
    );
  end if;

  -- ==========================================================
  -- Runner-only step
  -- ==========================================================

  if v_next_action = 'run_runner_only_dry_run' then
    if coalesce(p_dry_run, true) then
      v_action_result := public.race_engine_process_stage_runner_only_v1(
        p_stage_id,
        true,
        null
      );

      v_status := 'dry_run_runner_only_checked';
      v_reason := 'Admin wrapper dry-run checked runner-only step. No race outputs were written.';
    else
      if p_confirm_text is distinct from 'CONFIRM_ADMIN_STAGE_PROCESS_ONCE' then
        return jsonb_build_object(
          'status', 'blocked_missing_confirmation',
          'reason', 'Real admin stage processing requires exact confirmation text.',
          'required_confirm_text', 'CONFIRM_ADMIN_STAGE_PROCESS_ONCE',
          'stage_id', p_stage_id,
          'next_action_before', v_next_action,
          'state_before', v_state_before
        );
      end if;

      v_action_result := public.race_engine_process_stage_runner_only_v1(
        p_stage_id,
        false,
        'CONFIRM_STAGE_RUNNER_ONLY'
      );

      v_status := 'runner_only_step_executed';
      v_reason := 'Admin wrapper executed runner-only step. Tail repair/closeout should be handled by later calls.';
    end if;

  -- ==========================================================
  -- Tail repair step
  -- ==========================================================

  elsif v_next_action = 'run_tail_repair_dry_run_then_real' then
    if coalesce(p_dry_run, true) then
      v_action_result := public.race_engine_process_stage_tail_repair_v1(
        p_stage_id,
        true,
        null,
        p_tail_step_seconds
      );

      v_status := 'dry_run_tail_repair_checked';
      v_reason := 'Admin wrapper dry-run checked tail repair. No replay rows were written.';
    else
      if p_confirm_text is distinct from 'CONFIRM_ADMIN_STAGE_PROCESS_ONCE' then
        return jsonb_build_object(
          'status', 'blocked_missing_confirmation',
          'reason', 'Real admin stage processing requires exact confirmation text.',
          'required_confirm_text', 'CONFIRM_ADMIN_STAGE_PROCESS_ONCE',
          'stage_id', p_stage_id,
          'next_action_before', v_next_action,
          'state_before', v_state_before
        );
      end if;

      v_action_result := public.race_engine_process_stage_tail_repair_v1(
        p_stage_id,
        false,
        'CONFIRM_STAGE_TAIL_REPAIR',
        p_tail_step_seconds
      );

      v_status := 'tail_repair_step_executed';
      v_reason := 'Admin wrapper executed replay-tail repair. Closeout should be handled by a later call.';
    end if;

  -- ==========================================================
  -- Closeout step
  -- ==========================================================

  elsif v_next_action = 'run_stage_closeout_helper' then
    if coalesce(p_dry_run, true) then
      v_action_result := public.race_engine_closeout_stage_after_tail_v1(
        p_stage_id,
        true,
        null,
        p_auto_compact,
        p_target_replay_rows,
        p_preserve_last_frames
      );

      v_status := 'dry_run_stage_closeout_checked';
      v_reason := 'Admin wrapper dry-run checked stage closeout. No closeout metadata was written.';
    else
      if p_confirm_text is distinct from 'CONFIRM_ADMIN_STAGE_PROCESS_ONCE' then
        return jsonb_build_object(
          'status', 'blocked_missing_confirmation',
          'reason', 'Real admin stage processing requires exact confirmation text.',
          'required_confirm_text', 'CONFIRM_ADMIN_STAGE_PROCESS_ONCE',
          'stage_id', p_stage_id,
          'next_action_before', v_next_action,
          'state_before', v_state_before
        );
      end if;

      v_action_result := public.race_engine_closeout_stage_after_tail_v1(
        p_stage_id,
        false,
        'CONFIRM_STAGE_CLOSEOUT',
        p_auto_compact,
        p_target_replay_rows,
        p_preserve_last_frames
      );

      v_status := 'stage_closeout_step_executed';
      v_reason := 'Admin wrapper executed stage closeout.';
    end if;

  else
    return jsonb_build_object(
      'status', 'blocked_unknown_next_action',
      'reason', 'State helper returned an unknown next action. Admin wrapper will not proceed.',
      'stage_id', p_stage_id,
      'next_action_before', v_next_action,
      'state_before', v_state_before
    );
  end if;

  v_state_after := public.race_engine_get_stage_processing_state_v1(p_stage_id);

  return jsonb_build_object(
    'status', v_status,
    'reason', v_reason,
    'stage_id', p_stage_id,
    'race_id', v_state_before->>'race_id',
    'race_name', v_state_before->>'race_name',
    'stage_number', v_state_before->>'stage_number',
    'dry_run', coalesce(p_dry_run, true),
    'next_action_before', v_next_action,
    'next_action_after', v_state_after->>'next_action',
    'action_result', v_action_result,
    'state_before', v_state_before,
    'state_after', v_state_after
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_admin_get_due_stage_queue_v1(p_cutoff_stage_date date DEFAULT NULL::date, p_race_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_result jsonb;
begin
  perform set_config('statement_timeout', '300s', true);

  with stages_filtered as (
    select
      s.id as stage_id,
      s.race_id,
      r.name as race_name,
      r.category as race_category,
      s.stage_number,
      coalesce(s.stage_format, 'road_race') as stage_format,
      s.stage_date,
      s.distance_km,
      s.terrain_type
    from public.race_stages s
    join public.races r on r.id = s.race_id
    where (p_race_id is null or s.race_id = p_race_id)
      and (p_cutoff_stage_date is null or s.stage_date <= p_cutoff_stage_date)
  ),

  entry_rules as (
    select distinct on (rer.race_id)
      rer.race_id,
      coalesce(rer.min_teams, 0)::integer as required_min_teams
    from public.race_entry_rules rer
    join (select distinct race_id from stages_filtered) sf on sf.race_id = rer.race_id
    order by rer.race_id, rer.created_at desc nulls last
  ),

  participant_team_counts as (
    select
      rpt.race_id,
      count(distinct rpt.club_id)::integer as participant_team_rows
    from public.race_participant_teams_v1 rpt
    join (select distinct race_id from stages_filtered) sf on sf.race_id = rpt.race_id
    group by rpt.race_id
  ),

  participant_rider_counts as (
    select
      rpr.race_id,
      count(*)::integer as participant_rider_rows,
      count(distinct rpr.team_id)::integer as participant_rider_distinct_team_rows
    from public.race_participant_riders rpr
    join (select distinct race_id from stages_filtered) sf on sf.race_id = rpr.race_id
    group by rpr.race_id
  ),

  latest_attempt as (
    select distinct on (attempt.stage_id)
      attempt.stage_id,
      attempt.id as latest_attempt_id,
      attempt.pipeline_version,
      attempt.status as latest_attempt_status,
      attempt.error_message as latest_attempt_error_message,
      coalesce((attempt.execution_summary->>'tail_repair_completed')::boolean, false) as tail_repair_completed,
      attempt.execution_summary->>'replay_end_diagnosis' as replay_end_diagnosis,
      coalesce((attempt.execution_summary->>'stage_closeout_completed')::boolean, false) as stage_closeout_completed,
      attempt.execution_summary->>'stage_closeout_status' as stage_closeout_status
    from public.race_engine_stage_processing_attempts_v1 attempt
    join stages_filtered sf on sf.stage_id = attempt.stage_id
    where attempt.dry_run = false
    order by attempt.stage_id, attempt.created_at desc
  ),

  completed_runs as (
    select
      sim.stage_id,
      count(*)::integer as completed_simulation_run_rows
    from public.race_stage_simulation_runs sim
    join stages_filtered sf on sf.stage_id = sim.stage_id
    where sim.status = 'completed'
    group by sim.stage_id
  ),

  result_counts as (
    select
      res.stage_id,
      count(*)::integer as stage_result_rows
    from public.race_stage_results res
    join stages_filtered sf on sf.stage_id = res.stage_id
    where res.status = 'finished'
    group by res.stage_id
  ),

  decisions as (
    select
      sf.*,

      (sf.stage_format = 'road_race') as road_automation_gate_passed,

      coalesce(er.required_min_teams, 0) as required_min_teams,
      coalesce(ptc.participant_team_rows, 0) as participant_team_rows,
      coalesce(prc.participant_rider_rows, 0) as participant_rider_rows,
      coalesce(prc.participant_rider_distinct_team_rows, 0) as participant_rider_distinct_team_rows,

      (
        coalesce(er.required_min_teams, 0) > 0
        and coalesce(ptc.participant_team_rows, 0) >= coalesce(er.required_min_teams, 0)
        and coalesce(prc.participant_rider_rows, 0) > 0
        and coalesce(prc.participant_rider_distinct_team_rows, 0) >= coalesce(er.required_min_teams, 0)
      ) as participant_gate_passed,

      la.latest_attempt_id,
      la.pipeline_version,
      la.latest_attempt_status,
      la.latest_attempt_error_message,
      coalesce(la.tail_repair_completed, false) as tail_repair_completed,
      la.replay_end_diagnosis,
      coalesce(la.stage_closeout_completed, false) as stage_closeout_completed,
      la.stage_closeout_status,

      coalesce(cr.completed_simulation_run_rows, 0) as completed_simulation_run_rows,
      coalesce(rc.stage_result_rows, 0) as stage_result_rows,

      case
        when la.latest_attempt_error_message is not null
        then 'investigate_latest_processing_error'

        when coalesce(la.tail_repair_completed, false)
         and coalesce(la.stage_closeout_completed, false)
         and la.stage_closeout_status = 'stage_closeout_passed'
        then 'none_stage_completed_and_closed_out'

        when coalesce(la.tail_repair_completed, false)
         and not coalesce(la.stage_closeout_completed, false)
         and sf.stage_format = 'road_race'
        then 'run_stage_closeout_helper'

        when la.latest_attempt_status = 'official_road_runner_executed_tail_pending'
         and sf.stage_format = 'road_race'
        then 'run_tail_repair_dry_run_then_real'

        when coalesce(cr.completed_simulation_run_rows, 0) = 0
         and coalesce(rc.stage_result_rows, 0) = 0
         and sf.stage_format <> 'road_race'
        then 'blocked_stage_format_not_supported_by_road_wrapper'

        when coalesce(cr.completed_simulation_run_rows, 0) = 0
         and coalesce(rc.stage_result_rows, 0) = 0
         and sf.stage_format = 'road_race'
         and (
           coalesce(er.required_min_teams, 0) > 0
           and coalesce(ptc.participant_team_rows, 0) >= coalesce(er.required_min_teams, 0)
           and coalesce(prc.participant_rider_rows, 0) > 0
           and coalesce(prc.participant_rider_distinct_team_rows, 0) >= coalesce(er.required_min_teams, 0)
         )
        then 'run_runner_only_dry_run'

        when coalesce(cr.completed_simulation_run_rows, 0) = 0
         and coalesce(rc.stage_result_rows, 0) = 0
         and sf.stage_format = 'road_race'
        then 'blocked_participant_gate'

        else 'manual_review_needed'
      end as next_action
    from stages_filtered sf
    left join entry_rules er on er.race_id = sf.race_id
    left join participant_team_counts ptc on ptc.race_id = sf.race_id
    left join participant_rider_counts prc on prc.race_id = sf.race_id
    left join latest_attempt la on la.stage_id = sf.stage_id
    left join completed_runs cr on cr.stage_id = sf.stage_id
    left join result_counts rc on rc.stage_id = sf.stage_id
  ),

  actionable as (
    select
      d.*,
      exists (
        select 1
        from decisions prev
        where prev.race_id = d.race_id
          and prev.stage_number < d.stage_number
          and prev.next_action <> 'none_stage_completed_and_closed_out'
      ) as has_unclosed_previous_stage
    from decisions d
    where d.next_action in (
      'run_runner_only_dry_run',
      'run_tail_repair_dry_run_then_real',
      'run_stage_closeout_helper'
    )
  ),

  ready as (
    select *
    from actionable
    where has_unclosed_previous_stage = false
  ),

  blocked as (
    select *
    from actionable
    where has_unclosed_previous_stage = true
  )

  select jsonb_build_object(
    'status', 'checked',
    'queue_helper_version', 'lightweight_v3_road_only_with_participant_gate',
    'cutoff_stage_date', p_cutoff_stage_date,
    'race_id_filter', p_race_id,
    'limit', v_limit,
    'actionable_count', (select count(*) from actionable),
    'ready_count', (select count(*) from ready),
    'blocked_count', (select count(*) from blocked),

    'next_candidate', (
      select jsonb_build_object(
        'stage_id', r.stage_id,
        'race_id', r.race_id,
        'race_name', r.race_name,
        'race_category', r.race_category,
        'stage_number', r.stage_number,
        'stage_format', r.stage_format,
        'stage_date', r.stage_date,
        'distance_km', r.distance_km,
        'terrain_type', r.terrain_type,
        'next_action', r.next_action,
        'road_automation_gate_passed', r.road_automation_gate_passed,
        'participant_gate_passed', r.participant_gate_passed,
        'required_min_teams', r.required_min_teams,
        'participant_team_rows', r.participant_team_rows,
        'participant_rider_rows', r.participant_rider_rows,
        'participant_rider_distinct_team_rows', r.participant_rider_distinct_team_rows,
        'completed_simulation_run_rows', r.completed_simulation_run_rows,
        'stage_result_rows', r.stage_result_rows,
        'latest_attempt_id', r.latest_attempt_id,
        'latest_attempt_status', r.latest_attempt_status
      )
      from ready r
      order by r.stage_date, r.race_name, r.stage_number
      limit 1
    ),

    'ready_candidates', coalesce((
      select jsonb_agg(candidate_row)
      from (
        select jsonb_build_object(
          'stage_id', r.stage_id,
          'race_id', r.race_id,
          'race_name', r.race_name,
          'race_category', r.race_category,
          'stage_number', r.stage_number,
          'stage_format', r.stage_format,
          'stage_date', r.stage_date,
          'distance_km', r.distance_km,
          'terrain_type', r.terrain_type,
          'next_action', r.next_action,
          'road_automation_gate_passed', r.road_automation_gate_passed,
          'participant_gate_passed', r.participant_gate_passed,
          'required_min_teams', r.required_min_teams,
          'participant_team_rows', r.participant_team_rows,
          'participant_rider_rows', r.participant_rider_rows,
          'participant_rider_distinct_team_rows', r.participant_rider_distinct_team_rows,
          'completed_simulation_run_rows', r.completed_simulation_run_rows,
          'stage_result_rows', r.stage_result_rows,
          'latest_attempt_status', r.latest_attempt_status
        ) as candidate_row
        from ready r
        order by r.stage_date, r.race_name, r.stage_number
        limit v_limit
      ) q
    ), '[]'::jsonb),

    'blocked_candidates', coalesce((
      select jsonb_agg(candidate_row)
      from (
        select jsonb_build_object(
          'stage_id', b.stage_id,
          'race_id', b.race_id,
          'race_name', b.race_name,
          'race_category', b.race_category,
          'stage_number', b.stage_number,
          'stage_format', b.stage_format,
          'stage_date', b.stage_date,
          'distance_km', b.distance_km,
          'terrain_type', b.terrain_type,
          'next_action', b.next_action,
          'blocked_reason', 'Previous stage in the same race is not closed out yet.',
          'road_automation_gate_passed', b.road_automation_gate_passed,
          'participant_gate_passed', b.participant_gate_passed,
          'required_min_teams', b.required_min_teams,
          'participant_team_rows', b.participant_team_rows,
          'participant_rider_rows', b.participant_rider_rows,
          'participant_rider_distinct_team_rows', b.participant_rider_distinct_team_rows,
          'completed_simulation_run_rows', b.completed_simulation_run_rows,
          'stage_result_rows', b.stage_result_rows,
          'latest_attempt_status', b.latest_attempt_status
        ) as candidate_row
        from blocked b
        order by b.stage_date, b.race_name, b.stage_number
        limit v_limit
      ) q
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.team_ranking_get_current_season_year_v1()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_year integer := null;
begin
  -- IMPORTANT:
  -- Do not scan team_international_points_by_season_v1 here.
  -- That view can call display-name helpers and is too expensive inside this
  -- season helper / tie-breaker view.

  if to_regprocedure('public.get_current_game_date_date()') is not null then
    begin
      execute 'select extract(year from public.get_current_game_date_date())::integer'
      into v_year;

      if v_year is not null then
        return v_year;
      end if;
    exception
      when others then
        v_year := null;
    end;
  end if;

  -- Game season 1 fallback.
  return 2000;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.team_ranking_get_race_reputation_value_v1(p_team_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_col text;
  v_value numeric := 0;
begin
  if p_team_id is null then
    return 0;
  end if;

  foreach v_col in array array[
    'race_reputation_value',
    'team_race_reputation_value',
    'race_reputation',
    'team_reputation',
    'club_reputation',
    'reputation',
    'prestige'
  ]
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'clubs'
        and column_name = v_col
    ) then
      begin
        execute format(
          'select coalesce(%I::numeric, 0) from public.clubs where id = $1',
          v_col
        )
        into v_value
        using p_team_id;

        return coalesce(v_value, 0);
      exception
        when others then
          v_value := 0;
      end;
    end if;
  end loop;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clubs'
      and column_name = 'metadata'
  ) then
    begin
      select coalesce(
        nullif(metadata->>'race_reputation_value', '')::numeric,
        nullif(metadata->>'team_race_reputation_value', '')::numeric,
        nullif(metadata->>'race_reputation', '')::numeric,
        nullif(metadata->>'team_reputation', '')::numeric,
        nullif(metadata->>'reputation', '')::numeric,
        0
      )
      into v_value
      from public.clubs
      where id = p_team_id;

      return coalesce(v_value, 0);
    exception
      when others then
        return 0;
    end;
  end if;

  return 0;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_block_placeholder_ai_main_clubs_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.is_ai = true
     and new.club_type = 'main'
     and new.deleted_at is null
  then
    if new.name ilike 'AI Team%' then
      raise exception
        'Blocked placeholder AI main club "%". Active AI main clubs must come from the curated AI team pool, not generated AI Team placeholders.',
        new.name;
    end if;

    if nullif(btrim(new.logo_path), '') is null then
      raise exception
        'Blocked active AI main club "%". Active AI main clubs must have logo_path before they can be used.',
        new.name;
    end if;
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.race_get_rider_numeric_skill_value_v1(p_rider_id uuid, p_candidate_columns text[], p_default numeric DEFAULT 0)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_column text;
  v_value numeric := null;
begin
  if p_rider_id is null then
    return coalesce(p_default, 0);
  end if;

  if to_regclass('public.riders') is null then
    return coalesce(p_default, 0);
  end if;

  foreach v_column in array coalesce(p_candidate_columns, array[]::text[])
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'riders'
        and column_name = v_column
    ) then
      begin
        execute format(
          'select nullif(%I::text, '''')::numeric from public.riders where id = $1',
          v_column
        )
        into v_value
        using p_rider_id;

        if v_value is not null then
          return v_value;
        end if;
      exception
        when others then
          v_value := null;
      end;
    end if;
  end loop;

  return coalesce(p_default, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_get_rider_season_result_points_v1(p_rider_id uuid, p_season_year integer DEFAULT NULL::integer)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rider_col text;
  v_points_col text;
  v_season_col text;
  v_year integer := coalesce(
    p_season_year,
    case
      when to_regprocedure('public.team_ranking_get_current_season_year_v1()') is not null
        then public.team_ranking_get_current_season_year_v1()
      else 2000
    end
  );
  v_sql text;
  v_points numeric := 0;
begin
  if p_rider_id is null then
    return 0;
  end if;

  if to_regclass('public.race_ranking_point_awards') is null then
    return 0;
  end if;

  select column_name
  into v_rider_col
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'race_ranking_point_awards'
    and column_name in ('rider_id', 'entity_id')
  order by case column_name
    when 'rider_id' then 1
    when 'entity_id' then 2
    else 99
  end
  limit 1;

  select column_name
  into v_points_col
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'race_ranking_point_awards'
    and column_name in ('rider_points', 'points', 'ranking_points')
  order by case column_name
    when 'rider_points' then 1
    when 'points' then 2
    when 'ranking_points' then 3
    else 99
  end
  limit 1;

  select column_name
  into v_season_col
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'race_ranking_point_awards'
    and column_name in ('season_year', 'year')
  order by case column_name
    when 'season_year' then 1
    when 'year' then 2
    else 99
  end
  limit 1;

  if v_rider_col is null or v_points_col is null then
    return 0;
  end if;

  begin
    if v_season_col is not null then
      v_sql := format(
        'select coalesce(sum(%I::numeric), 0) from public.race_ranking_point_awards where %I = $1 and %I::integer = $2',
        v_points_col,
        v_rider_col,
        v_season_col
      );

      execute v_sql into v_points using p_rider_id, v_year;
    else
      -- Fallback: if the awards table has no season column, use all current awards.
      -- This still captures "this season" in season-1 databases where only active
      -- season awards exist.
      v_sql := format(
        'select coalesce(sum(%I::numeric), 0) from public.race_ranking_point_awards where %I = $1',
        v_points_col,
        v_rider_col
      );

      execute v_sql into v_points using p_rider_id;
    end if;
  exception
    when others then
      v_points := 0;
  end;

  return coalesce(v_points, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_get_favorites_profile_type_v1(p_race_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race_type text := null;
  v_tt_stages integer := 0;
  v_mountain numeric := 0;
  v_hilly numeric := 0;
  v_cobbled numeric := 0;
begin
  if p_race_id is null then
    return 'balanced';
  end if;

  select lower(coalesce(r.race_type::text, ''))
  into v_race_type
  from public.races r
  where r.id = p_race_id;

  select
    count(*) filter (
      where lower(coalesce(rs.terrain_type::text, rs.profile_type::text, '')) in (
        'individual_time_trial',
        'team_time_trial',
        'prologue',
        'time_trial',
        'tt'
      )
    ),
    coalesce(avg(nullif(rs.mountain_pct::text, '')::numeric), 0),
    coalesce(avg(nullif(rs.hilly_pct::text, '')::numeric), 0),
    coalesce(avg(nullif(rs.cobbled_pct::text, '')::numeric), 0)
  into
    v_tt_stages,
    v_mountain,
    v_hilly,
    v_cobbled
  from public.race_stages rs
  where rs.race_id = p_race_id;

  if v_race_type like '%time_trial%' or v_tt_stages > 0 then
    return 'time_trial';
  end if;

  if v_mountain >= 35 then
    return 'mountain';
  end if;

  if v_cobbled >= 20 then
    return 'cobbled';
  end if;

  if v_hilly >= 35 then
    return 'hilly';
  end if;

  if v_race_type = 'one_day' then
    return 'classic';
  end if;

  return 'flat';
exception
  when others then
    return 'balanced';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_calculate_rider_favorite_score_v1(p_rider_id uuid, p_overall_snapshot numeric DEFAULT NULL::numeric, p_role_snapshot text DEFAULT NULL::text, p_race_profile_type text DEFAULT 'balanced'::text, p_season_year integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_default numeric := coalesce(p_overall_snapshot, 50);
  v_role text := lower(coalesce(p_role_snapshot, ''));
  v_profile text := lower(coalesce(p_race_profile_type, 'balanced'));

  v_sprint numeric;
  v_climbing numeric;
  v_time_trial numeric;
  v_endurance numeric;
  v_flat numeric;
  v_recovery numeric;
  v_resistance numeric;
  v_race_iq numeric;
  v_teamwork numeric;
  v_morale numeric;

  v_skill_score numeric := 0;
  v_season_points numeric := 0;
  v_result_bonus numeric := 0;
  v_role_bonus numeric := 0;
  v_score numeric := 0;
  v_reason text := '';
begin
  v_sprint := public.race_get_rider_numeric_skill_value_v1(
    p_rider_id,
    array['sprint', 'sprint_skill', 'sprinter', 'sprinting'],
    v_default
  );

  v_climbing := public.race_get_rider_numeric_skill_value_v1(
    p_rider_id,
    array['climbing', 'climb', 'mountain', 'mountain_skill', 'climber'],
    v_default
  );

  v_time_trial := public.race_get_rider_numeric_skill_value_v1(
    p_rider_id,
    array['time_trial', 'time_trial_skill', 'tt', 'itt', 'prologue'],
    v_default
  );

  v_endurance := public.race_get_rider_numeric_skill_value_v1(
    p_rider_id,
    array['endurance', 'stamina', 'endurance_skill'],
    v_default
  );

  v_flat := public.race_get_rider_numeric_skill_value_v1(
    p_rider_id,
    array['flat', 'flat_skill', 'rouleur'],
    v_default
  );

  v_recovery := public.race_get_rider_numeric_skill_value_v1(
    p_rider_id,
    array['recovery', 'recovery_skill'],
    v_default
  );

  v_resistance := public.race_get_rider_numeric_skill_value_v1(
    p_rider_id,
    array['resistance', 'resilience', 'resistance_skill'],
    v_default
  );

  v_race_iq := public.race_get_rider_numeric_skill_value_v1(
    p_rider_id,
    array['race_iq', 'raceiq', 'tactical', 'tactics'],
    v_default
  );

  v_teamwork := public.race_get_rider_numeric_skill_value_v1(
    p_rider_id,
    array['teamwork', 'team_work'],
    v_default
  );

  v_morale := public.race_get_rider_numeric_skill_value_v1(
    p_rider_id,
    array['morale'],
    v_default
  );

  if v_profile = 'time_trial' then
    v_skill_score :=
      v_time_trial * 0.50 +
      v_endurance * 0.20 +
      v_flat * 0.15 +
      v_race_iq * 0.10 +
      v_resistance * 0.05;
    v_reason := 'TT ability, endurance and pacing';
  elsif v_profile = 'mountain' then
    v_skill_score :=
      v_climbing * 0.45 +
      v_endurance * 0.20 +
      v_recovery * 0.15 +
      v_resistance * 0.10 +
      v_race_iq * 0.10;
    v_reason := 'climbing, endurance and recovery';
  elsif v_profile = 'hilly' then
    v_skill_score :=
      v_climbing * 0.25 +
      v_flat * 0.20 +
      v_endurance * 0.20 +
      v_resistance * 0.15 +
      v_race_iq * 0.10 +
      v_sprint * 0.10;
    v_reason := 'hilly profile, endurance and race IQ';
  elsif v_profile = 'cobbled' then
    v_skill_score :=
      v_flat * 0.30 +
      v_resistance * 0.25 +
      v_endurance * 0.20 +
      v_race_iq * 0.15 +
      v_sprint * 0.10;
    v_reason := 'flat power, resistance and cobbled reliability';
  elsif v_profile = 'classic' then
    v_skill_score :=
      v_flat * 0.25 +
      v_endurance * 0.25 +
      v_resistance * 0.15 +
      v_race_iq * 0.15 +
      v_sprint * 0.10 +
      v_climbing * 0.10;
    v_reason := 'one-day classic balance';
  else
    v_skill_score :=
      v_sprint * 0.30 +
      v_flat * 0.25 +
      v_endurance * 0.20 +
      v_race_iq * 0.10 +
      v_resistance * 0.10 +
      v_morale * 0.05;
    v_reason := 'flat speed, endurance and race IQ';
  end if;

  v_season_points := public.race_get_rider_season_result_points_v1(
    p_rider_id,
    p_season_year
  );

  -- Up to +30 from season results, enough to reward form without making
  -- weak riders favorites only because of one old result.
  v_result_bonus := least(coalesce(v_season_points, 0), 300) / 10.0;

  if v_role like '%leader%' or v_role like '%captain%' or v_role like '%gc%' then
    v_role_bonus := v_role_bonus + 5;
  end if;

  if v_profile = 'flat' and (v_role like '%sprinter%' or v_role like '%sprint%') then
    v_role_bonus := v_role_bonus + 4;
  end if;

  if v_profile = 'mountain' and (v_role like '%climber%' or v_role like '%mountain%') then
    v_role_bonus := v_role_bonus + 4;
  end if;

  if v_profile = 'time_trial' and (v_role like '%tt%' or v_role like '%time%trial%') then
    v_role_bonus := v_role_bonus + 4;
  end if;

  -- Small support indicator from teamwork. This is not a pure favorite skill,
  -- but it helps riders on stronger team structures slightly.
  v_score :=
    v_skill_score * 0.72 +
    v_result_bonus +
    v_role_bonus +
    least(v_teamwork, 100) * 0.03;

  return jsonb_build_object(
    'favorite_score', round(v_score, 2),
    'skill_score', round(v_skill_score, 2),
    'season_points', round(v_season_points, 2),
    'role_bonus', round(v_role_bonus, 2),
    'race_profile_type', v_profile,
    'reason', v_reason
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_assign_team_start_numbers_v1(p_race_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_updated_count integer := 0;
begin
  if p_race_id is null then
    raise exception 'p_race_id is required';
  end if;

  if to_regclass('public.race_participant_riders') is null then
    raise exception 'race_participant_riders table not found';
  end if;

  /*
   * Start numbers are presentation metadata. During startlist finalization we
   * must not recalculate the full live international ranking stack for every
   * participant-team insert. Use the ranking snapshot already persisted on
   * race_participant_teams instead. This keeps ordering deterministic for the
   * race and prevents the 2-minute cron timeout seen on Jan 7.
   */
  with accepted_teams as (
    select distinct
      coalesce(t.club_id, t.owner_club_id, t.participating_club_id) as team_key,
      t.club_id,
      t.owner_club_id,
      t.participating_club_id,
      t.race_team_entry_id,
      coalesce(t.club_name, 'Team') as team_name,
      lower(coalesce(t.club_tier::text, '')) as club_tier_text,
      case lower(coalesce(t.club_tier::text, ''))
        when 'worldteam' then 1
        when 'proteam' then 2
        when 'continental' then 3
        when 'amateur' then 4
        else 99
      end as club_tier_order,
      case
        when nullif(regexp_replace(coalesce(t.world_tier::text, ''), '[^0-9]', '', 'g'), '') is null then null
        else nullif(regexp_replace(coalesce(t.world_tier::text, ''), '[^0-9]', '', 'g'), '')::integer
      end as world_tier_number,
      coalesce(rpt.ranking_snapshot, 999999) as current_team_rank,
      case
        when nullif(regexp_replace(coalesce(t.reputation::text, ''), '[^0-9.-]', '', 'g'), '') is null then 0
        else nullif(regexp_replace(coalesce(t.reputation::text, ''), '[^0-9.-]', '', 'g'), '')::numeric
      end as race_reputation_value
    from public.race_participant_teams_v1 t
    left join public.race_participant_teams rpt
      on rpt.race_id = t.race_id
     and rpt.team_id = coalesce(t.club_id, t.owner_club_id, t.participating_club_id)
    where t.race_id = p_race_id
      and coalesce(t.status, 'accepted') = 'accepted'
      and coalesce(t.club_id, t.owner_club_id, t.participating_club_id) is not null
  ),
  ordered_teams as (
    select at.*,
      row_number() over (
        order by
          at.club_tier_order asc,
          coalesce(at.current_team_rank, 999999) asc,
          coalesce(at.race_reputation_value, 0) desc,
          coalesce(at.world_tier_number, 999999) asc,
          lower(at.team_name) asc,
          at.team_key asc
      )::integer as team_order
    from accepted_teams at
  ),
  ranked_riders as (
    select rpr.id as participant_rider_id,
      ot.team_order,
      row_number() over (
        partition by ot.team_key
        order by
          case
            when lower(coalesce(rpr.role_snapshot, '')) in (
              'leader','team leader','team_leader','gc leader','gc_leader','captain','race captain'
            ) then 0
            when lower(coalesce(rpr.role_snapshot, '')) like '%leader%' then 0
            when lower(coalesce(rpr.role_snapshot, '')) like '%captain%' then 0
            else 1
          end asc,
          coalesce(rpr.overall_snapshot, 0) desc,
          lower(coalesce(rpr.rider_name_snapshot, '')) asc,
          rpr.rider_id asc
      )::integer as rider_order
    from public.race_participant_riders rpr
    join ordered_teams ot
      on rpr.race_id = p_race_id
     and rpr.team_id = ot.team_key
  ),
  updated as (
    update public.race_participant_riders rpr
    set start_number = ((rr.team_order - 1) * 10) + rr.rider_order
    from ranked_riders rr
    where rpr.id = rr.participant_rider_id
      and rpr.start_number is distinct from (((rr.team_order - 1) * 10) + rr.rider_order)
    returning rpr.id
  )
  select count(*)::integer into v_updated_count from updated;

  return coalesce(v_updated_count, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_race_participant_riders_assign_numbers_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if new.start_number is not null then
      return new;
    end if;

    perform public.race_assign_team_start_numbers_v1(new.race_id);
    return new;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_race_participant_teams_assign_numbers_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  perform public.race_assign_team_start_numbers_v1(new.race_id);

  return null;
exception
  when others then
    raise warning 'race participant team start-number assignment failed for race %: %',
      new.race_id,
      sqlerrm;
    return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_refresh_pre_race_display_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_updated_count integer := 0;
  v_favorites jsonb := '[]'::jsonb;
begin
  v_updated_count := public.race_assign_team_start_numbers_v1(p_race_id);

  select coalesce(jsonb_agg(to_jsonb(f) order by f.favorite_rank), '[]'::jsonb)
  into v_favorites
  from public.get_race_favorites_v1(p_race_id, 5) f;

  return jsonb_build_object(
    'race_id', p_race_id,
    'updated_start_numbers', v_updated_count,
    'favorites', v_favorites
  );
end;
$function$
;

