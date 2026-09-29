CREATE OR REPLACE FUNCTION public.race_engine_write_team_time_trial_replay_frames_v1(p_simulation_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_stage_format text;
  v_distance_km numeric;

  v_replay_duration_seconds integer;
  v_start_interval_seconds integer;
  v_counting_rider_number integer;
  v_dropped_rider_time_mode text;

  v_frame_count constant integer := 120;

  v_team_count integer := 0;
  v_rider_count integer := 0;
  v_inserted_count integer := 0;
  v_team_replay_row_count integer := 0;
  v_dropped_rider_replay_row_count integer := 0;

  v_first_start_offset_seconds integer := 0;
  v_last_start_offset_seconds integer := 0;
  v_competition_end_seconds integer := 0;
begin
  if p_simulation_run_id is null then
    raise exception using
      errcode = '22023',
      message = 'Simulation run ID is required.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_simulation_run_id::text,
      0
    )
  );

  select
    simulation_run.race_id,
    simulation_run.stage_id,
    stage.stage_format,
    stage.distance_km,
    rule.replay_duration_seconds,
    rule.start_interval_seconds,
    rule.counting_rider_number,
    rule.dropped_rider_time_mode
  into
    v_race_id,
    v_stage_id,
    v_stage_format,
    v_distance_km,
    v_replay_duration_seconds,
    v_start_interval_seconds,
    v_counting_rider_number,
    v_dropped_rider_time_mode
  from public.race_stage_simulation_runs simulation_run
  join public.race_stages stage
    on stage.id = simulation_run.stage_id
  join public.race_stage_time_trial_rules rule
    on rule.stage_id = simulation_run.stage_id
  where simulation_run.id = p_simulation_run_id
    and simulation_run.status = 'completed';

  if not found then
    raise exception using
      errcode = 'P0002',
      message = format(
        'Completed simulation run %s with time-trial rules was not found.',
        p_simulation_run_id
      );
  end if;

  if v_stage_format <> 'team_time_trial' then
    raise exception using
      errcode = '22023',
      message = format(
        'Team time-trial replay writer cannot process stage format %s.',
        coalesce(v_stage_format, '<null>')
      );
  end if;

  if coalesce(v_distance_km, 0) <= 0 then
    raise exception using
      errcode = '22023',
      message = format(
        'Stage %s has no valid distance.',
        v_stage_id
      );
  end if;

  if v_replay_duration_seconds <> 900 then
    raise exception using
      errcode = '22023',
      message = format(
        'Stage %s has replay duration %s. TTT replay requires exactly 900 seconds.',
        v_stage_id,
        v_replay_duration_seconds
      );
  end if;

  if v_counting_rider_number is null
     or v_counting_rider_number < 2
  then
    raise exception using
      errcode = '22023',
      message = format(
        'Stage %s has invalid counting-rider number %s.',
        v_stage_id,
        coalesce(
          v_counting_rider_number::text,
          '<null>'
        )
      );
  end if;

  select
    count(
      distinct team_state.team_id
    )::integer,

    count(
      distinct rider_state.rider_id
    )::integer,

    coalesce(
      min(
        (
          team_state.metadata
            ->> 'competition_start_offset_seconds'
        )::integer
      ),
      0
    )::integer,

    coalesce(
      max(
        (
          team_state.metadata
            ->> 'competition_start_offset_seconds'
        )::integer
      ),
      0
    )::integer,

    coalesce(
      max(
        (
          team_state.metadata
            ->> 'competition_start_offset_seconds'
        )::integer
        + rider_state.finish_time_seconds
      ),
      0
    )::integer
  into
    v_team_count,
    v_rider_count,
    v_first_start_offset_seconds,
    v_last_start_offset_seconds,
    v_competition_end_seconds
  from public.race_stage_team_states team_state
  join public.race_stage_rider_states rider_state
    on rider_state.simulation_run_id =
      team_state.simulation_run_id
   and rider_state.team_id =
      team_state.team_id
  where team_state.simulation_run_id =
    p_simulation_run_id;

  if v_team_count = 0 then
    raise exception using
      errcode = 'P0002',
      message = format(
        'No TTT team states were found for simulation run %s.',
        p_simulation_run_id
      );
  end if;

  if v_rider_count = 0 then
    raise exception using
      errcode = 'P0002',
      message = format(
        'No TTT rider states were found for simulation run %s.',
        p_simulation_run_id
      );
  end if;

  if v_competition_end_seconds <= 0 then
    raise exception using
      errcode = '22023',
      message = format(
        'Simulation run %s has no valid competition duration.',
        p_simulation_run_id
      );
  end if;

  if exists (
    select 1
    from public.race_stage_rider_states rider_state
    where rider_state.simulation_run_id =
      p_simulation_run_id
    group by rider_state.team_id
    having count(*) filter (
      where coalesce(
        (
          rider_state.metadata
            ->> 'is_counting_group_member'
        )::boolean,
        false
      )
    ) <> v_counting_rider_number
  ) then
    raise exception using
      errcode = 'P0001',
      message = format(
        'At least one team in simulation run %s does not contain exactly %s counting-group riders.',
        p_simulation_run_id,
        v_counting_rider_number
      );
  end if;

  delete from public.race_stage_replay_frames
  where simulation_run_id =
    p_simulation_run_id;

  with team_base as (
    select
      team_state.team_id,

      coalesce(
        nullif(
          team_state.metadata
            ->> 'team_name',
          ''
        ),
        club.name,
        'Team'
      ) as team_name,

      team_state.team_finish_time_seconds,
      team_state.team_rank,

      coalesce(
        (
          team_state.metadata
            ->> 'team_gap_seconds'
        )::integer,
        0
      ) as team_gap_seconds,

      (
        team_state.metadata
          ->> 'team_start_order'
      )::integer as team_start_order,

      (
        team_state.metadata
          ->> 'competition_start_offset_seconds'
      )::integer as competition_start_offset_seconds,

      case
        when team_state.metadata
          ->> 'previous_team_classification_rank'
          ~ '^[0-9]+$'
        then (
          team_state.metadata
            ->> 'previous_team_classification_rank'
        )::integer
      end as previous_team_classification_rank,

      coalesce(
        (
          team_state.metadata
            ->> 'dropped_rider_count'
        )::integer,
        0
      ) as dropped_rider_count,

      case
        when team_state.metadata
          ->> 'counting_rider_id'
          ~* '^[0-9a-f-]{36}$'
        then (
          team_state.metadata
            ->> 'counting_rider_id'
        )::uuid
      end as counting_rider_id,

      team_state.metadata
        ->> 'counting_rider_name'
          as counting_rider_name,

      round(
        (
          v_distance_km
          / greatest(
              team_state.team_finish_time_seconds,
              1
            )::numeric
        ) * 3600,
        2
      ) as final_average_speed_kmh,

      round(
        (
          (
            team_state.metadata
              ->> 'competition_start_offset_seconds'
          )::integer::numeric
          / greatest(
              v_competition_end_seconds,
              1
            )::numeric
        )
        * v_replay_duration_seconds
      )::integer as replay_start_offset_seconds,

      team_state.metadata
        as team_state_metadata

    from public.race_stage_team_states team_state

    left join public.clubs club
      on club.id = team_state.team_id

    where team_state.simulation_run_id =
      p_simulation_run_id
  ),

  rider_base as (
    select
      rider_state.rider_id,
      rider_state.team_id,

      coalesce(
        nullif(
          rider_state.metadata
            ->> 'rider_name',
          ''
        ),
        nullif(
          rider.display_name,
          ''
        ),
        nullif(
          trim(
            concat_ws(
              ' ',
              rider.first_name,
              rider.last_name
            )
          ),
          ''
        ),
        'Rider'
      ) as rider_name,

      coalesce(
        nullif(
          rider_state.metadata
            ->> 'team_name',
          ''
        ),
        club.name,
        'Team'
      ) as team_name,

      rider.country_code,

      rider_state.finish_time_seconds
        as official_finish_time_seconds,

      coalesce(
        (
          rider_state.metadata
            ->> 'personal_time_seconds'
        )::integer,
        rider_state.finish_time_seconds
      ) as personal_time_seconds,

      (
        rider_state.metadata
          ->> 'team_finish_time_seconds'
      )::integer as team_finish_time_seconds,

      (
        rider_state.metadata
          ->> 'team_finish_order'
      )::integer as team_finish_order,

      coalesce(
        (
          rider_state.metadata
            ->> 'is_counting_group_member'
        )::boolean,
        false
      ) as is_counting_group_member,

      coalesce(
        (
          rider_state.metadata
            ->> 'is_counting_rider'
        )::boolean,
        false
      ) as is_counting_rider,

      coalesce(
        (
          rider_state.metadata
            ->> 'is_dropped_rider'
        )::boolean,
        false
      ) as is_dropped_rider,

      (
        rider_state.metadata
          ->> 'team_rank'
      )::integer as team_rank,

      (
        rider_state.metadata
          ->> 'team_start_order'
      )::integer as team_start_order,

      (
        rider_state.metadata
          ->> 'competition_start_offset_seconds'
      )::integer as competition_start_offset_seconds,

      decode(
        md5(
          rider_state.stage_id::text
          || ':'
          || rider_state.rider_id::text
          || ':ttt_drop_point_v1'
        ),
        'hex'
      ) as drop_seed_bytes,

      rider_state.metadata
        as rider_state_metadata

    from public.race_stage_rider_states rider_state

    left join public.riders rider
      on rider.id = rider_state.rider_id

    left join public.clubs club
      on club.id = rider_state.team_id

    where rider_state.simulation_run_id =
      p_simulation_run_id

      and rider_state.stage_status =
        'finished'
  ),

  rider_seeded as (
    select
      rider.*,

      (
        (
          get_byte(
            rider.drop_seed_bytes,
            0
          ) * 256
          + get_byte(
              rider.drop_seed_bytes,
              1
            )
        )::numeric
        / 65535.0
        * 2.0
        - 1.0
      )::numeric as drop_seed_unit

    from rider_base rider
  ),

  rider_drop_parameters as (
    select
      rider.*,

      case
        when rider.is_dropped_rider is not true
        then null
        else greatest(
          0.62::numeric,
          least(
            0.90::numeric,

            0.86::numeric

            - least(
                0.18::numeric,

                (
                  greatest(
                    0,
                    rider.personal_time_seconds
                    - rider.team_finish_time_seconds
                  )::numeric
                  / greatest(
                      rider.team_finish_time_seconds,
                      1
                    )::numeric
                ) * 2.50
              )

            + rider.drop_seed_unit * 0.015
          )
        )
      end as drop_progress

    from rider_seeded rider
  ),

  rider_with_drop_point as (
    select
      rider.*,

      case
        when rider.is_dropped_rider is not true
        then null
        else greatest(
          1,
          least(
            rider.team_finish_time_seconds - 1,

            round(
              rider.team_finish_time_seconds
              * rider.drop_progress
            )::integer
          )
        )
      end as drop_elapsed_seconds,

      case
        when rider.is_dropped_rider is not true
        then null
        else round(
          v_distance_km
          * rider.drop_progress,
          3
        )
      end as drop_km,

      round(
        (
          v_distance_km
          / greatest(
              rider.personal_time_seconds,
              1
            )::numeric
        ) * 3600,
        2
      ) as final_personal_average_speed_kmh

    from rider_drop_parameters rider
  ),

  replay_frames as (
    select
      frame_number,

      round(
        (
          frame_number::numeric
          / v_frame_count::numeric
        )
        * v_replay_duration_seconds
      )::integer as replay_seconds,

      round(
        (
          frame_number::numeric
          / v_frame_count::numeric
        )
        * v_competition_end_seconds
      )::integer as competition_seconds

    from generate_series(
      0,
      v_frame_count
    ) frame_number
  ),

  expanded_teams as (
    select
      frame.frame_number,
      frame.replay_seconds,
      frame.competition_seconds,
      team.*,

      greatest(
        0,
        least(
          team.team_finish_time_seconds,

          frame.competition_seconds
          - team.competition_start_offset_seconds
        )
      )::integer as team_elapsed_seconds,

      frame.competition_seconds
        >= team.competition_start_offset_seconds
          as team_started,

      frame.competition_seconds
        >= (
          team.competition_start_offset_seconds
          + team.team_finish_time_seconds
        ) as team_finished

    from replay_frames frame
    cross join team_base team
  ),

  ranked_teams as (
    select
      expanded.*,

      case
        when expanded.team_started is not true
        then null
        else (
          1
          + (
            select count(*)::integer
            from team_base other_team
            where other_team.competition_start_offset_seconds
              <= expanded.competition_seconds
              and (
                other_team.team_finish_time_seconds
                  < expanded.team_finish_time_seconds

                or (
                  other_team.team_finish_time_seconds
                    = expanded.team_finish_time_seconds
                  and other_team.team_rank
                    < expanded.team_rank
                )

                or (
                  other_team.team_finish_time_seconds
                    = expanded.team_finish_time_seconds
                  and other_team.team_rank
                    = expanded.team_rank
                  and other_team.team_id
                    < expanded.team_id
                )
              )
          )
        )
      end::integer as provisional_rank,

      case
        when expanded.team_started is not true
        then null
        else (
          select min(
            other_team.team_finish_time_seconds
          )
          from team_base other_team
          where other_team.competition_start_offset_seconds
            <= expanded.competition_seconds
        )
      end as provisional_leader_time_seconds

    from expanded_teams expanded
  ),

  team_entities as (
    select
      ranked.*,

      coalesce(
        members.rider_ids,
        '{}'::uuid[]
      ) as current_rider_ids,

      coalesce(
        members.rider_names,
        '{}'::text[]
      ) as current_rider_names,

      coalesce(
        members.team_names,
        '{}'::text[]
      ) as current_team_names,

      coalesce(
        members.current_group_size,
        0
      )::integer as current_group_size

    from ranked_teams ranked

    left join lateral (
      select
        array_agg(
          rider.rider_id
          order by rider.team_finish_order
        ) as rider_ids,

        array_agg(
          rider.rider_name
          order by rider.team_finish_order
        ) as rider_names,

        array_agg(
          rider.team_name
          order by rider.team_finish_order
        ) as team_names,

        count(*)::integer
          as current_group_size

      from rider_with_drop_point rider

      where rider.team_id =
          ranked.team_id

        and (
          rider.is_dropped_rider is not true
          or ranked.team_elapsed_seconds
            < rider.drop_elapsed_seconds
        )
    ) members
      on true
  ),

  dropped_rider_entities as (
    select
      frame.frame_number,
      frame.replay_seconds,
      frame.competition_seconds,
      rider.*,

      greatest(
        0,
        least(
          rider.personal_time_seconds,

          frame.competition_seconds
          - rider.competition_start_offset_seconds
        )
      )::integer as rider_elapsed_seconds,

      frame.competition_seconds
        >= (
          rider.competition_start_offset_seconds
          + rider.personal_time_seconds
        ) as rider_finished

    from replay_frames frame
    cross join rider_with_drop_point rider

    where rider.is_dropped_rider = true

      and frame.competition_seconds
        >= (
          rider.competition_start_offset_seconds
          + rider.drop_elapsed_seconds
        )
  ),

  dropped_rider_positions as (
    select
      dropped.*,

      round(
        least(
          v_distance_km,

          greatest(
            0,

            case
              when dropped.rider_elapsed_seconds
                <= dropped.drop_elapsed_seconds
              then
                v_distance_km
                * (
                    dropped.rider_elapsed_seconds::numeric
                    / greatest(
                        dropped.team_finish_time_seconds,
                        1
                      )::numeric
                  )

              else
                dropped.drop_km
                + (
                    v_distance_km
                    - dropped.drop_km
                  )
                  * (
                      (
                        dropped.rider_elapsed_seconds
                        - dropped.drop_elapsed_seconds
                      )::numeric
                      / greatest(
                          dropped.personal_time_seconds
                          - dropped.drop_elapsed_seconds,
                          1
                        )::numeric
                    )
            end
          )
        ),
        3
      ) as rider_km_marker,

      round(
        (
          dropped.competition_start_offset_seconds::numeric
          / greatest(
              v_competition_end_seconds,
              1
            )::numeric
        )
        * v_replay_duration_seconds
      )::integer as replay_start_offset_seconds

    from dropped_rider_entities dropped
  ),

  output_rows as (
    select
      p_simulation_run_id
        as simulation_run_id,

      v_race_id
        as race_id,

      v_stage_id
        as stage_id,

      team.frame_number,
      team.replay_seconds
        as race_seconds,

      round(
        least(
          v_distance_km,

          greatest(
            0,

            v_distance_km
            * (
                team.team_elapsed_seconds::numeric
                / greatest(
                    team.team_finish_time_seconds,
                    1
                  )::numeric
              )
          )
        ),
        3
      ) as km_marker,

      'team:'
        || team.team_id::text
          as group_code,

      team.team_name
        as group_label,

      (
        team.team_start_order * 100
      )::integer as group_order,

      case
        when team.team_started is not true
        then 0
        else greatest(
          0,

          team.team_finish_time_seconds
          - coalesce(
              team.provisional_leader_time_seconds,
              team.team_finish_time_seconds
            )
        )
      end::integer as gap_seconds,

      case
        when team.team_started is not true
        then 0::numeric
        else team.final_average_speed_kmh
      end as avg_speed_kmh,

      team.current_rider_ids
        as rider_ids,

      team.current_rider_names
        as rider_names,

      team.current_team_names
        as team_names,

      jsonb_build_object(
        'source',
          'race_engine_team_time_trial_replay_v1',

        'model',
          'staggered_team_replay',

        'competition_format',
          'team_time_trial',

        'entity_state',
          case
            when team.team_started is not true
              then 'waiting'
            when team.team_finished
              then 'finished'
            else 'racing'
          end,

        'competition_seconds',
          team.competition_seconds,

        'competition_end_seconds',
          v_competition_end_seconds,

        'replay_seconds',
          team.replay_seconds,

        'replay_duration_seconds',
          v_replay_duration_seconds,

        'frame_progress',
          team.frame_number::numeric
          / v_frame_count::numeric,

        'team_id',
          team.team_id,

        'team_name',
          team.team_name,

        'team_start_order',
          team.team_start_order,

        'competition_start_offset_seconds',
          team.competition_start_offset_seconds,

        'replay_start_offset_seconds',
          team.replay_start_offset_seconds,

        'team_elapsed_seconds',
          team.team_elapsed_seconds,

        'team_finish_time_seconds',
          team.team_finish_time_seconds,

        'team_rank',
          team.team_rank,

        'team_gap_seconds',
          team.team_gap_seconds,

        'provisional_rank',
          team.provisional_rank,

        'provisional_gap_seconds',
          case
            when team.team_started is not true
              then null
            else greatest(
              0,

              team.team_finish_time_seconds
              - coalesce(
                  team.provisional_leader_time_seconds,
                  team.team_finish_time_seconds
                )
            )
          end,

        'current_group_size',
          team.current_group_size,

        'starting_rider_count',
          v_counting_rider_number
          + team.dropped_rider_count,

        'counting_rider_number',
          v_counting_rider_number,

        'counting_rider_id',
          team.counting_rider_id,

        'counting_rider_name',
          team.counting_rider_name,

        'dropped_rider_count',
          team.dropped_rider_count,

        'dropped_rider_time_mode',
          v_dropped_rider_time_mode,

        'distance_km',
          v_distance_km,

        'final_average_speed_kmh',
          team.final_average_speed_kmh
      ) as metadata,

      'team_time_trial'::text
        as replay_mode,

      'team'::text
        as entity_type,

      team.team_id
        as entity_id,

      'team:'
        || team.team_id::text
          as entity_key,

      team.team_name
        as entity_label,

      (
        (
          team.team_start_order - 1
        ) % 12
      ) + 1 as entity_color_slot,

      team.team_start_order
        as start_order,

      team.competition_start_offset_seconds,
      team.replay_start_offset_seconds,

      team.team_elapsed_seconds
        as entity_elapsed_seconds,

      team.provisional_rank,
      team.team_finished
        as entity_finished

    from team_entities team

    union all

    select
      p_simulation_run_id,
      v_race_id,
      v_stage_id,

      rider.frame_number,
      rider.replay_seconds,
      rider.rider_km_marker,

      'rider:'
        || rider.rider_id::text,

      rider.rider_name,

      (
        rider.team_start_order * 100
        + rider.team_finish_order
      )::integer,

      greatest(
        0,

        rider.personal_time_seconds
        - rider.team_finish_time_seconds
      )::integer,

      rider.final_personal_average_speed_kmh,

      array[
        rider.rider_id
      ]::uuid[],

      array[
        rider.rider_name
      ]::text[],

      array[
        rider.team_name
      ]::text[],

      jsonb_build_object(
        'source',
          'race_engine_team_time_trial_replay_v1',

        'model',
          'dropped_rider_replay',

        'competition_format',
          'team_time_trial',

        'entity_state',
          case
            when rider.rider_finished
              then 'finished'
            else 'dropped_racing'
          end,

        'competition_seconds',
          rider.competition_seconds,

        'competition_end_seconds',
          v_competition_end_seconds,

        'replay_seconds',
          rider.replay_seconds,

        'replay_duration_seconds',
          v_replay_duration_seconds,

        'frame_progress',
          rider.frame_number::numeric
          / v_frame_count::numeric,

        'rider_id',
          rider.rider_id,

        'rider_name',
          rider.rider_name,

        'country_code',
          rider.country_code,

        'team_id',
          rider.team_id,

        'team_name',
          rider.team_name,

        'team_rank',
          rider.team_rank,

        'team_start_order',
          rider.team_start_order,

        'team_finish_order',
          rider.team_finish_order,

        'competition_start_offset_seconds',
          rider.competition_start_offset_seconds,

        'replay_start_offset_seconds',
          rider.replay_start_offset_seconds,

        'drop_elapsed_seconds',
          rider.drop_elapsed_seconds,

        'drop_km',
          rider.drop_km,

        'drop_progress',
          rider.drop_progress,

        'entity_elapsed_seconds',
          rider.rider_elapsed_seconds,

        'personal_time_seconds',
          rider.personal_time_seconds,

        'team_finish_time_seconds',
          rider.team_finish_time_seconds,

        'personal_time_loss_seconds',
          greatest(
            0,

            rider.personal_time_seconds
            - rider.team_finish_time_seconds
          ),

        'distance_km',
          v_distance_km,

        'final_personal_average_speed_kmh',
          rider.final_personal_average_speed_kmh,

        'dropped_rider_time_mode',
          v_dropped_rider_time_mode
      ),

      'team_time_trial',
      'rider',
      rider.rider_id,

      'rider:'
        || rider.rider_id::text,

      rider.rider_name,

      (
        (
          rider.team_start_order - 1
        ) % 12
      ) + 1,

      rider.team_start_order,
      rider.competition_start_offset_seconds,
      rider.replay_start_offset_seconds,
      rider.rider_elapsed_seconds,

      null::integer,
      rider.rider_finished

    from dropped_rider_positions rider
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
    entity_id,
    entity_key,
    entity_label,
    entity_color_slot,
    start_order,
    competition_start_offset_seconds,
    replay_start_offset_seconds,
    entity_elapsed_seconds,
    provisional_rank,
    entity_finished
  )
  select
    output.simulation_run_id,
    output.race_id,
    output.stage_id,
    output.frame_number,
    output.race_seconds,
    output.km_marker,
    output.group_code,
    output.group_label,
    output.group_order,
    output.gap_seconds,
    output.avg_speed_kmh,
    output.rider_ids,
    output.rider_names,
    output.team_names,
    output.metadata,
    output.replay_mode,
    output.entity_type,
    output.entity_id,
    output.entity_key,
    output.entity_label,
    output.entity_color_slot,
    output.start_order,
    output.competition_start_offset_seconds,
    output.replay_start_offset_seconds,
    output.entity_elapsed_seconds,
    output.provisional_rank,
    output.entity_finished
  from output_rows output
  order by
    output.frame_number,
    output.group_order,
    output.entity_key;

  get diagnostics v_inserted_count =
    row_count;

  select
    count(*) filter (
      where replay_frame.entity_type = 'team'
    )::integer,

    count(*) filter (
      where replay_frame.entity_type = 'rider'
    )::integer
  into
    v_team_replay_row_count,
    v_dropped_rider_replay_row_count
  from public.race_stage_replay_frames replay_frame
  where replay_frame.simulation_run_id =
    p_simulation_run_id;

  if v_team_replay_row_count <>
    v_team_count * (
      v_frame_count + 1
    )
  then
    raise exception using
      errcode = 'P0001',
      message = format(
        'TTT team replay count mismatch for run %s: expected %s, wrote %s.',
        p_simulation_run_id,
        v_team_count * (
          v_frame_count + 1
        ),
        v_team_replay_row_count
      );
  end if;

  update public.race_stage_simulation_runs
  set
    result_summary_json =
      coalesce(
        result_summary_json,
        '{}'::jsonb
      )
      || jsonb_build_object(
        'team_time_trial_replay',
          jsonb_build_object(
            'source',
              'race_engine_write_team_time_trial_replay_frames_v1',

            'stage_format',
              v_stage_format,

            'frame_count',
              v_frame_count + 1,

            'team_count',
              v_team_count,

            'rider_count',
              v_rider_count,

            'replay_row_count',
              v_inserted_count,

            'team_replay_row_count',
              v_team_replay_row_count,

            'dropped_rider_replay_row_count',
              v_dropped_rider_replay_row_count,

            'replay_duration_seconds',
              v_replay_duration_seconds,

            'competition_end_seconds',
              v_competition_end_seconds,

            'first_start_offset_seconds',
              v_first_start_offset_seconds,

            'last_start_offset_seconds',
              v_last_start_offset_seconds,

            'written_at',
              now()
          )
      ),
    updated_at = now()
  where id =
    p_simulation_run_id;

  return jsonb_build_object(
    'status',
      'completed',

    'simulation_run_id',
      p_simulation_run_id,

    'race_id',
      v_race_id,

    'stage_id',
      v_stage_id,

    'stage_format',
      v_stage_format,

    'frame_count',
      v_frame_count + 1,

    'team_count',
      v_team_count,

    'rider_count',
      v_rider_count,

    'inserted_count',
      v_inserted_count,

    'team_replay_row_count',
      v_team_replay_row_count,

    'expected_team_replay_row_count',
      v_team_count
      * (
          v_frame_count + 1
        ),

    'dropped_rider_replay_row_count',
      v_dropped_rider_replay_row_count,

    'replay_duration_seconds',
      v_replay_duration_seconds,

    'competition_end_seconds',
      v_competition_end_seconds,

    'first_start_offset_seconds',
      v_first_start_offset_seconds,

    'last_start_offset_seconds',
      v_last_start_offset_seconds
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_race_stage_team_time_trial_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race_id uuid;
  v_stage_format text;
  v_stage_number integer;

  v_start_order_mode text;
  v_start_interval_seconds integer;
  v_counting_rider_number integer;
  v_dropped_rider_time_mode text;
  v_replay_duration_seconds integer;

  v_previous_stage_id uuid;

  v_existing_run_id uuid;
  v_existing_run_status text;
  v_run_id uuid;

  v_input_rider_count integer := 0;
  v_input_team_count integer := 0;
  v_minimum_team_size integer := 0;

  v_rider_state_count integer := 0;
  v_team_state_count integer := 0;
  v_expected_dropped_rider_count integer := 0;

  v_result_count integer := 0;

  v_replay_row_count integer := 0;
  v_replay_frame_count integer := 0;
  v_team_replay_row_count integer := 0;
  v_dropped_rider_replay_row_count integer := 0;

  v_final_finished_team_count integer := 0;
  v_final_dropped_rider_count integer := 0;
  v_final_unfinished_entity_count integer := 0;

  v_non_start_point_count integer := 0;

  v_winner_team_id uuid;
  v_winner_team_name text;
  v_winner_team_time_seconds integer;
  v_winner_counting_rider_id uuid;
  v_winner_counting_rider_name text;

  v_state_result jsonb;
  v_replay_result jsonb;
  v_stage_result jsonb;
  v_classification_result jsonb;
begin
  if p_stage_id is null then
    raise exception using
      errcode = '22023',
      message =
        'Stage ID is required.';
  end if;

  /*
   * Only one worker may run a given stage.
   */
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_stage_id::text,
      0
    )
  );

  select
    stage.race_id,
    stage.stage_format,
    stage.stage_number,

    rule.start_order_mode,
    rule.start_interval_seconds,
    rule.counting_rider_number,
    rule.dropped_rider_time_mode,
    rule.replay_duration_seconds

  into
    v_race_id,
    v_stage_format,
    v_stage_number,

    v_start_order_mode,
    v_start_interval_seconds,
    v_counting_rider_number,
    v_dropped_rider_time_mode,
    v_replay_duration_seconds

  from public.race_stages stage

  join public.race_stage_time_trial_rules rule
    on rule.stage_id =
      stage.id

  where stage.id =
    p_stage_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message =
        format(
          'Race stage %s with time-trial rules was not found.',
          p_stage_id
        );
  end if;

  if v_stage_format <> 'team_time_trial' then
    raise exception using
      errcode = '22023',
      message =
        format(
          'The team time-trial runner cannot process '
          || 'stage format %s.',
          coalesce(
            v_stage_format,
            '<null>'
          )
        );
  end if;

  if v_counting_rider_number is null
     or v_counting_rider_number < 2
  then
    raise exception using
      errcode = '22023',
      message =
        format(
          'Stage %s has invalid counting-rider number %s.',
          p_stage_id,
          coalesce(
            v_counting_rider_number::text,
            '<null>'
          )
        );
  end if;

  if v_replay_duration_seconds <> 900 then
    raise exception using
      errcode = '22023',
      message =
        format(
          'Stage %s has replay duration %s. '
          || 'The TTT runner requires 900 seconds.',
          p_stage_id,
          v_replay_duration_seconds
        );
  end if;

  /*
   * Completed simulations are immutable.
   */
  select
    simulation_run.id,
    simulation_run.status

  into
    v_existing_run_id,
    v_existing_run_status

  from public.race_stage_simulation_runs
    simulation_run

  where simulation_run.stage_id =
    p_stage_id;

  if v_existing_run_status = 'completed' then
    return jsonb_build_object(
      'status',
        'already_completed',

      'simulation_run_id',
        v_existing_run_id,

      'race_id',
        v_race_id,

      'stage_id',
        p_stage_id,

      'stage_format',
        v_stage_format
    );
  end if;

  /*
   * A stage can run only when the immediately preceding stage
   * has persisted official results.
   */
  select previous_stage.id

  into v_previous_stage_id

  from public.race_stages previous_stage

  where previous_stage.race_id =
      v_race_id

    and previous_stage.stage_number <
      v_stage_number

  order by previous_stage.stage_number desc

  limit 1;

  if v_previous_stage_id is not null
     and not exists (
       select 1

       from public.race_stage_results
         previous_result

       where previous_result.stage_id =
         v_previous_stage_id
     )
  then
    raise exception using
      errcode = '55000',
      message =
        format(
          'Stage %s cannot run because previous stage %s '
          || 'has no persisted results.',
          p_stage_id,
          v_previous_stage_id
        );
  end if;

  /*
   * Generic stage-point calculation is not yet valid for TTT.
   */
  select count(*)::integer

  into v_non_start_point_count

  from public.race_stage_points stage_point

  where stage_point.stage_id =
      p_stage_id

    and upper(
      stage_point.point_type
    ) <> 'START';

  if v_non_start_point_count > 0 then
    raise exception using
      errcode = '0A000',
      message =
        format(
          'Stage %s contains %s competition point gate(s). '
          || 'The dedicated TTT point writer is not installed.',
          p_stage_id,
          v_non_start_point_count
        );
  end if;

  /*
   * Validate the live TTT input field.
   */
  with rider_inputs as (
    select *

    from public.race_engine_get_time_trial_rider_inputs_v1(
      p_stage_id
    )
  ),

  team_sizes as (
    select
      rider_input.team_id,
      count(*)::integer
        as rider_count

    from rider_inputs rider_input

    group by rider_input.team_id
  )

  select
    (
      select count(*)::integer
      from rider_inputs
    ),

    (
      select count(*)::integer
      from team_sizes
    ),

    (
      select coalesce(
        min(team_size.rider_count),
        0
      )::integer
      from team_sizes team_size
    )

  into
    v_input_rider_count,
    v_input_team_count,
    v_minimum_team_size;

  if v_input_rider_count = 0
     or v_input_team_count = 0
  then
    raise exception using
      errcode = 'P0002',
      message =
        format(
          'No TTT input field was found for stage %s.',
          p_stage_id
        );
  end if;

  if v_minimum_team_size <
    v_counting_rider_number
  then
    raise exception using
      errcode = '22023',
      message =
        format(
          'Stage %s contains a team with only %s riders, '
          || 'but counting-rider number is %s.',
          p_stage_id,
          v_minimum_team_size,
          v_counting_rider_number
        );
  end if;

  /*
   * Create or reset the unique simulation run.
   */
  insert into public.race_stage_simulation_runs (
    race_id,
    stage_id,
    status,
    engine_version,
    simulation_mode,
    started_at,
    completed_at,
    failed_at,
    error_message,
    input_snapshot_json,
    result_summary_json
  )
  values (
    v_race_id,
    p_stage_id,
    'running',
    'race_engine_ttt_core_v1',
    'option_2_precomputed_live_replay',
    now(),
    null,
    null,
    null,

    jsonb_build_object(
      'created_by',
        'run_race_stage_team_time_trial_v1',

      'pipeline',
        'ttt_core_validation',

      'stage_format',
        v_stage_format,

      'input_rider_count',
        v_input_rider_count,

      'input_team_count',
        v_input_team_count,

      'counting_rider_number',
        v_counting_rider_number,

      'dropped_rider_time_mode',
        v_dropped_rider_time_mode,

      'start_order_mode',
        v_start_order_mode,

      'started_at',
        now()
    ),

    '{}'::jsonb
  )

  returning id into v_run_id;

  /*
   * Capture the classification leaders as they existed before
   * this stage.
   */
  perform
    public.race_engine_capture_pre_stage_leaders_v1(
      v_run_id
    );

  /*
   * Remove partial artifacts from an unfinished earlier attempt.
   */
  delete from public.race_stage_replay_frames
  where simulation_run_id =
    v_run_id;

  delete from public.race_stage_incidents
  where simulation_run_id =
    v_run_id;

  delete from public.race_stage_rider_states
  where simulation_run_id =
    v_run_id;

  delete from public.race_stage_team_states
  where simulation_run_id =
    v_run_id;

  delete from public.race_stage_point_results
  where stage_id =
    p_stage_id;

  delete from public.race_stage_results
  where stage_id =
    p_stage_id;

  delete from public.race_classification_standings
  where race_id =
      v_race_id

    and after_stage_id =
      p_stage_id;

  delete from public.race_stage_report_events
  where stage_id =
      p_stage_id

    and metadata ->> 'source' in (
      'race_engine_team_time_trial_v1',
      'race_engine_team_time_trial_replay_v1',
      'race_engine_team_time_trial_commentary_v1'
    );

  /*
   * Write TTT rider and team state rows.
   */
  v_state_result :=
    public.race_engine_write_team_time_trial_states_v1(
      v_run_id
    );

  select
    count(*)::integer,

    count(
      distinct rider_state.team_id
    )::integer,

    count(*) filter (
      where rider_state.metadata
        ->> 'is_dropped_rider' = 'true'
    )::integer

  into
    v_rider_state_count,
    v_team_state_count,
    v_expected_dropped_rider_count

  from public.race_stage_rider_states
    rider_state

  where rider_state.simulation_run_id =
    v_run_id;

  if v_rider_state_count <>
    v_input_rider_count
  then
    raise exception using
      errcode = 'P0001',
      message =
        format(
          'TTT rider-state count mismatch for stage %s: '
          || 'expected %s, received %s.',
          p_stage_id,
          v_input_rider_count,
          v_rider_state_count
        );
  end if;

  if v_team_state_count <>
    v_input_team_count
  then
    raise exception using
      errcode = 'P0001',
      message =
        format(
          'TTT team-state count mismatch for stage %s: '
          || 'expected %s, received %s.',
          p_stage_id,
          v_input_team_count,
          v_team_state_count
        );
  end if;

  if (
    select count(*)::integer

    from public.race_stage_team_states team_state

    where team_state.simulation_run_id =
      v_run_id
  ) <> v_input_team_count
  then
    raise exception using
      errcode = 'P0001',
      message =
        format(
          'TTT team-state table count does not match '
          || 'the input-team count for stage %s.',
          p_stage_id
        );
  end if;

  select
    team_state.team_id,

    team_state.metadata
      ->> 'team_name',

    team_state.team_finish_time_seconds,

    case
      when team_state.metadata
        ->> 'counting_rider_id'
        ~* '^[0-9a-f-]{36}$'
      then (
        team_state.metadata
          ->> 'counting_rider_id'
      )::uuid
    end,

    team_state.metadata
      ->> 'counting_rider_name'

  into
    v_winner_team_id,
    v_winner_team_name,
    v_winner_team_time_seconds,
    v_winner_counting_rider_id,
    v_winner_counting_rider_name

  from public.race_stage_team_states
    team_state

  where team_state.simulation_run_id =
    v_run_id

  order by
    team_state.team_rank,
    team_state.team_id

  limit 1;

  if v_winner_team_id is null then
    raise exception using
      errcode = 'P0001',
      message =
        format(
          'TTT state writer produced no winning team '
          || 'for stage %s.',
          p_stage_id
        );
  end if;

  /*
   * Replay and official result writers require completed status.
   */
  update public.race_stage_simulation_runs
  set
    status =
      'completed',

    completed_at =
      now(),

    failed_at =
      null,

    error_message =
      null,

    result_summary_json =
      jsonb_build_object(
        'pipeline',
          'ttt_core_validation',

        'stage_format',
          v_stage_format,

        'rider_count',
          v_rider_state_count,

        'team_count',
          v_team_state_count,

        'counting_rider_number',
          v_counting_rider_number,

        'dropped_rider_time_mode',
          v_dropped_rider_time_mode,

        'expected_dropped_rider_count',
          v_expected_dropped_rider_count,

        'winner_team_id',
          v_winner_team_id,

        'winner_team_name',
          v_winner_team_name,

        'winner_team_time_seconds',
          v_winner_team_time_seconds,

        'winner_counting_rider_id',
          v_winner_counting_rider_id,

        'winner_counting_rider_name',
          v_winner_counting_rider_name,

        'core_completed_at',
          now(),

        'pending_components',
          jsonb_build_array(
            'ttt_point_gates',
            'ttt_replay_commentary',
            'ttt_incidents',
            'fatigue',
            'ranking_awards',
            'prize_awards',
            'delayed_publication'
          )
      ),

    updated_at =
      now()

  where id =
    v_run_id;

  /*
   * Team entities plus individual entities after rider separation.
   */
  v_replay_result :=
    public.race_engine_write_team_time_trial_replay_frames_v1(
      v_run_id
    );

  /*
   * Final display continuity pass: preserve physical group identity
   * across semantic label/order changes and prevent matched tracks
   * from moving backward in replay distance.
   */
  perform public.race_engine_enforce_replay_display_continuity_v5_exact(
    v_run_id,
    p_stage_id
  );

  /*
   * Persist official rider results.
   *
   * Counting-group riders receive team time.
   * Dropped riders retain their slower personal time.
   */
  v_stage_result :=
    public.race_engine_write_stage_results_v1(
      v_run_id
    );

  /*
   * Rebuild GC, young and team classifications.
   *
   * Points and mountain remain empty because no point gates exist.
   */
  v_classification_result :=
    public.race_engine_write_cumulative_classifications_v1(
      v_run_id
    );

  select count(*)::integer

  into v_result_count

  from public.race_stage_results result

  where result.stage_id =
    p_stage_id;

  select
    count(*)::integer,

    count(
      distinct replay_frame.frame_number
    )::integer,

    count(*) filter (
      where replay_frame.entity_type =
        'team'
    )::integer,

    count(*) filter (
      where replay_frame.entity_type =
        'rider'
    )::integer,

    count(
      distinct replay_frame.entity_id
    ) filter (
      where replay_frame.frame_number = 120
        and replay_frame.entity_type = 'team'
        and replay_frame.entity_finished = true
    )::integer,

    count(
      distinct replay_frame.entity_id
    ) filter (
      where replay_frame.frame_number = 120
        and replay_frame.entity_type = 'rider'
        and replay_frame.entity_finished = true
    )::integer,

    count(*) filter (
      where replay_frame.frame_number = 120
        and replay_frame.entity_finished is not true
    )::integer

  into
    v_replay_row_count,
    v_replay_frame_count,
    v_team_replay_row_count,
    v_dropped_rider_replay_row_count,
    v_final_finished_team_count,
    v_final_dropped_rider_count,
    v_final_unfinished_entity_count

  from public.race_stage_replay_frames
    replay_frame

  where replay_frame.simulation_run_id =
    v_run_id;

  if v_result_count <>
    v_rider_state_count
  then
    raise exception using
      errcode = 'P0001',
      message =
        format(
          'TTT result count mismatch for stage %s: '
          || 'states %s, results %s.',
          p_stage_id,
          v_rider_state_count,
          v_result_count
        );
  end if;

  if v_replay_frame_count <> 121 then
    raise exception using
      errcode = 'P0001',
      message =
        format(
          'TTT replay frame count mismatch for stage %s: '
          || 'expected 121, received %s.',
          p_stage_id,
          v_replay_frame_count
        );
  end if;

  if v_team_replay_row_count <>
    v_team_state_count * 121
  then
    raise exception using
      errcode = 'P0001',
      message =
        format(
          'TTT primary team replay count mismatch for stage %s: '
          || 'expected %s, received %s.',
          p_stage_id,
          v_team_state_count * 121,
          v_team_replay_row_count
        );
  end if;

  if v_final_finished_team_count <>
    v_team_state_count
  then
    raise exception using
      errcode = 'P0001',
      message =
        format(
          'TTT final frame contains %s finished teams; '
          || 'expected %s.',
          v_final_finished_team_count,
          v_team_state_count
        );
  end if;

  if v_final_dropped_rider_count <>
    v_expected_dropped_rider_count
  then
    raise exception using
      errcode = 'P0001',
      message =
        format(
          'TTT final frame contains %s dropped-rider entities; '
          || 'expected %s.',
          v_final_dropped_rider_count,
          v_expected_dropped_rider_count
        );
  end if;

  if v_final_unfinished_entity_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message =
        format(
          'TTT final replay frame contains %s unfinished entities.',
          v_final_unfinished_entity_count
        );
  end if;

  update public.race_stage_simulation_runs
  set
    result_summary_json =
      coalesce(
        result_summary_json,
        '{}'::jsonb
      )
      || jsonb_build_object(
        'core_validation',
          jsonb_build_object(
            'status',
              'passed',

            'rider_state_count',
              v_rider_state_count,

            'team_state_count',
              v_team_state_count,

            'stage_result_count',
              v_result_count,

            'replay_row_count',
              v_replay_row_count,

            'replay_frame_count',
              v_replay_frame_count,

            'team_replay_row_count',
              v_team_replay_row_count,

            'dropped_rider_replay_row_count',
              v_dropped_rider_replay_row_count,

            'expected_dropped_rider_count',
              v_expected_dropped_rider_count,

            'final_finished_team_count',
              v_final_finished_team_count,

            'final_finished_dropped_rider_count',
              v_final_dropped_rider_count,

            'verified_at',
              now()
          )
      ),

    updated_at =
      now()

  where id =
    v_run_id;

  return jsonb_build_object(
    'status',
      'core_completed',

    'simulation_run_id',
      v_run_id,

    'race_id',
      v_race_id,

    'stage_id',
      p_stage_id,

    'stage_format',
      v_stage_format,

    'input_rider_count',
      v_input_rider_count,

    'input_team_count',
      v_input_team_count,

    'rider_state_count',
      v_rider_state_count,

    'team_state_count',
      v_team_state_count,

    'stage_result_count',
      v_result_count,

    'replay_row_count',
      v_replay_row_count,

    'replay_frame_count',
      v_replay_frame_count,

    'team_replay_row_count',
      v_team_replay_row_count,

    'dropped_rider_replay_row_count',
      v_dropped_rider_replay_row_count,

    'expected_dropped_rider_count',
      v_expected_dropped_rider_count,

    'winner_team_id',
      v_winner_team_id,

    'winner_team_name',
      v_winner_team_name,

    'winner_team_time_seconds',
      v_winner_team_time_seconds,

    'winner_counting_rider_id',
      v_winner_counting_rider_id,

    'winner_counting_rider_name',
      v_winner_counting_rider_name,

    'state_writer',
      v_state_result,

    'replay_writer',
      v_replay_result,

    'stage_result_writer',
      v_stage_result,

    'classification_writer',
      v_classification_result
  );

exception
  when others then
    update public.race_stage_simulation_runs
    set
      status =
        'failed',

      failed_at =
        now(),

      completed_at =
        null,

      error_message =
        sqlerrm,

      result_summary_json =
        coalesce(
          result_summary_json,
          '{}'::jsonb
        )
        || jsonb_build_object(
          'pipeline',
            'ttt_core_validation',

          'failed_at',
            now(),

          'error',
            sqlerrm
        ),

      updated_at =
        now()

    where stage_id =
      p_stage_id;

    raise;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_race_stage_road_race_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '300s'
AS $function$declare
  v_race_id uuid;
  v_run_id uuid;
  v_segment_count integer := 0;
  v_rider_count integer := 0;
  v_is_final_stage boolean := false;
  v_post_stage_team_id uuid;
begin
  select race_id into v_race_id
  from public.race_stages
  where id = p_stage_id;

  if v_race_id is null then
    raise exception 'Stage % not found.', p_stage_id;
  end if;

  select id into v_run_id
  from public.race_stage_simulation_runs
  where stage_id = p_stage_id
    and status = 'completed';

  if v_run_id is not null then
    return jsonb_build_object(
      'status',
      'already_completed',
      'simulation_run_id',
      v_run_id
    );
  end if;

  insert into public.race_stage_simulation_runs (
    race_id,
    stage_id,
    status,
    started_at,
    input_snapshot_json
  )
  values (
    v_race_id,
    p_stage_id,
    'running',
    now(),
    jsonb_build_object(
      'created_by',
      'run_race_stage_road_race_v1'
    )
  )
  returning id into v_run_id;

  /*
   * Freeze the jersey owners as they were immediately before
   * this stage began. Replay must never replace these owners
   * with the post-stage classification winners.
   */
  perform public.race_engine_capture_pre_stage_leaders_v1(
    v_run_id
  );

  delete from public.race_stage_rider_states
  where simulation_run_id = v_run_id;

  delete from public.race_stage_team_states
  where simulation_run_id = v_run_id;

  delete from public.race_stage_incidents
  where simulation_run_id = v_run_id;

  delete from public.race_stage_report_events
  where stage_id = p_stage_id
    and metadata->>'source' = 'race_engine_v1';

  select count(*)
  into v_segment_count
  from public.race_engine_get_stage_segments_v1(p_stage_id);

  if v_segment_count = 0 then
    raise exception 'No profile segments found for stage %.', p_stage_id;
  end if;

  with segment_totals as (
    select
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
      ) as base_stage_cost,
      sum(
        case terrain_type
          when 'flat' then 0.50
          when 'false_flat' then 0.65
          when 'climb' then 1.00
          when 'steep_climb' then 1.35
          when 'descent' then 0.35
          when 'technical_descent' then 0.55
          else 0.50
        end * (distance_km / 10.0)
      ) as terrain_stress
    from public.race_engine_get_stage_segments_v1(p_stage_id)
  ),
  rider_scores as (
    select
      ri.*,
      st.base_stage_cost,
      st.terrain_stress,
      (
        (ri.flat * 0.22) +
        (ri.endurance * 0.20) +
        (ri.climbing * 0.20) +
        (ri.resistance * 0.14) +
        (ri.race_iq * 0.10) +
        (ri.recovery * 0.08) +
        (ri.teamwork * 0.06)
      )::numeric as stage_skill_score,

      coalesce(pc.weighted_effort_multiplier, 1.00)::numeric
        as effort_multiplier,

      coalesce(pc.weighted_performance_modifier, 0.00)::numeric
        as command_performance_modifier,

      pc.phase_1_command,
      pc.phase_2_command,
      pc.phase_3_command,
      pc.phase_4_command,

      coalesce(
        pc.role_code,
        pcm.role_code,
        public.race_engine_normalize_stage_role_code_v1(ri.role_code)
      ) as engine_stage_role,

      coalesce(
        pcm.team_plan,
        ri.stage_tactic,
        'balanced'
      ) as engine_stage_tactic,

      coalesce(
        nullif(ri.bonus_snapshot_json->>'race_sharpness', '')::numeric,
        50
      ) as race_sharpness,

      greatest(
        0.96,
        least(
          1.03,
          1 - (
            (
              coalesce(
                nullif(ri.bonus_snapshot_json->>'race_sharpness', '')::numeric,
                50
              ) - 50
            ) * 0.001
          )
        )
      )::numeric as race_sharpness_stamina_spent_factor,

      greatest(
        0.97,
        least(
          1.02,
          1 - (
            (
              coalesce(
                nullif(ri.bonus_snapshot_json->>'race_sharpness', '')::numeric,
                50
              ) - 50
            ) * 0.00075
          )
        )
      )::numeric as race_sharpness_fatigue_gain_factor,

      greatest(
        -0.30,
        least(
          0.40,
          (
            coalesce(
              nullif(ri.bonus_snapshot_json->>'race_sharpness', '')::numeric,
              50
            ) - 50
          ) * 0.01
        )
      )::numeric as race_sharpness_performance_modifier

    from public.race_engine_get_stage_rider_inputs_v1(p_stage_id) ri
    cross join segment_totals st
    left join public.race_engine_get_stage_phase_command_effects_v1(
      p_stage_id
    ) pc
      on pc.rider_id = ri.rider_id
    left join public.race_engine_get_stage_phase_commands_v1(
      p_stage_id
    ) pcm
      on pcm.rider_id = ri.rider_id
  ),
  calculated as (
    select
      rs.*,

      greatest(
        0,
        rs.base_stage_cost
        * rs.effort_multiplier
        * case
            when rs.stage_skill_score >= 80 then 0.88
            when rs.stage_skill_score >= 70 then 0.95
            when rs.stage_skill_score >= 60 then 1.00
            when rs.stage_skill_score >= 50 then 1.08
            else 1.18
          end
        * case
            when rs.fatigue <= 20 then 1.00
            when rs.fatigue <= 40 then 1.05
            when rs.fatigue <= 60 then 1.12
            when rs.fatigue <= 80 then 1.25
            else 1.45
          end
        * rs.race_sharpness_stamina_spent_factor
      )::numeric(10,2) as stamina_spent_calc,

      (
        rs.base_stage_cost
        * rs.effort_multiplier
        * case
            when lower(coalesce(rs.engine_stage_role, '')) like '%domestique%'
              then 1.15
            when lower(coalesce(rs.engine_stage_role, '')) like '%rouleur%'
              then 1.12
            when lower(coalesce(rs.engine_stage_role, '')) like '%leader%'
              then 0.92
            when lower(coalesce(rs.engine_stage_role, '')) like '%sprinter%'
              then 0.95
            else 1.00
          end
      )::numeric(10,2) as work_done_calc,

      (
        rs.stage_skill_score
        + (rs.start_stamina * 0.25)
        + (rs.morale * 0.05)
        - (rs.fatigue * 0.20)
        + coalesce(rs.command_performance_modifier, 0)
        + rs.race_sharpness_performance_modifier
        + ((random() * 6) - 3)
      )::numeric(10,3) as performance_score

    from rider_scores rs
  ),
  ranked as (
    select
      c.*,
      row_number() over (
        order by
          c.performance_score desc,
          c.stage_skill_score desc,
          c.start_stamina desc
      ) as finish_position_calc
    from calculated c
  ),
  final_rows as (
    select
      r.*,

      greatest(
        1,
        r.start_stamina - r.stamina_spent_calc
      )::numeric(10,2) as finish_stamina_calc,

      greatest(
        1,
        least(
          30,
          (r.work_done_calc * 0.20)
          + case
              when (r.start_stamina - r.stamina_spent_calc) < 10 then 8
              when (r.start_stamina - r.stamina_spent_calc) < 25 then 5
              when (r.start_stamina - r.stamina_spent_calc) < 40 then 3
              else 1
            end
          + (r.terrain_stress * 0.30)
          - greatest(r.recovery - 60, 0) * 0.03
        )
        * r.race_sharpness_fatigue_gain_factor
      )::numeric(10,2) as fatigue_gain_calc,

      (
        round(
          (
            (
              select stage.distance_km
              from public.race_stages stage
              where stage.id = p_stage_id
            ) / 42.0
          ) * 3600
        )::integer
        + case
            when r.finish_position_calc <= 12 then 0
            when r.finish_position_calc <= 35 then
              18
              + least(
                  6,
                  floor(
                    (r.finish_position_calc - 13)::numeric / 6
                  )::integer * 2
                )
            when r.finish_position_calc <= 70 then
              42
              + least(
                  10,
                  floor(
                    (r.finish_position_calc - 36)::numeric / 8
                  )::integer * 3
                )
            when r.finish_position_calc <= 105 then
              115
              + least(
                  25,
                  floor(
                    (r.finish_position_calc - 71)::numeric / 7
                  )::integer * 5
                )
            else
              240
              + least(
                  60,
                  floor(
                    (r.finish_position_calc - 106)::numeric / 5
                  )::integer * 8
                )
          end
      )::integer as finish_time_seconds_calc,

      (
        case
          when r.finish_position_calc <= 12 then 0
          when r.finish_position_calc <= 35 then
            18
            + least(
                6,
                floor(
                  (r.finish_position_calc - 13)::numeric / 6
                )::integer * 2
              )
          when r.finish_position_calc <= 70 then
            42
            + least(
                10,
                floor(
                  (r.finish_position_calc - 36)::numeric / 8
                )::integer * 3
              )
          when r.finish_position_calc <= 105 then
            115
            + least(
                25,
                floor(
                  (r.finish_position_calc - 71)::numeric / 7
                )::integer * 5
              )
          else
            240
            + least(
                60,
                floor(
                  (r.finish_position_calc - 106)::numeric / 5
                )::integer * 8
              )
        end
      )::integer as gap_seconds_calc

    from ranked r
  )
  insert into public.race_stage_rider_states (
    simulation_run_id,
    race_id,
    stage_id,
    rider_id,
    team_id,
    role_code,
    start_stamina,
    finish_stamina,
    stamina_spent,
    work_done_score,
    fatigue_before_stage,
    fatigue_gain,
    fatigue_after_stage,
    stage_status,
    finish_position,
    finish_time_seconds,
    gap_seconds,
    metadata
  )
  select
    v_run_id,
    race_id,
    stage_id,
    rider_id,
    team_id,
    engine_stage_role,
    start_stamina,
    finish_stamina_calc,
    stamina_spent_calc,
    work_done_calc,
    fatigue_before_stage,
    fatigue_gain_calc,
    least(
      100,
      fatigue_before_stage + fatigue_gain_calc
    ),
    'finished',
    finish_position_calc,
    finish_time_seconds_calc,
    gap_seconds_calc,
    jsonb_build_object(
      'rider_name', rider_name,
      'team_name', team_name,
      'stage_role', engine_stage_role,
      'stage_tactic', engine_stage_tactic,
      'performance_score', performance_score,
      'stage_skill_score', stage_skill_score,
      'command_performance_modifier', command_performance_modifier,
      'effort_multiplier', effort_multiplier,
      'phase_1_command', phase_1_command,
      'phase_2_command', phase_2_command,
      'phase_3_command', phase_3_command,
      'phase_4_command', phase_4_command,
      'source', 'race_engine_v1',
      'race_sharpness_engine_version', '2026-06-19-phase-3b',
      'race_sharpness', race_sharpness,
      'race_sharpness_stamina_spent_factor', race_sharpness_stamina_spent_factor,
      'race_sharpness_fatigue_gain_factor', race_sharpness_fatigue_gain_factor,
      'race_sharpness_performance_modifier', race_sharpness_performance_modifier
    )
  from final_rows;

  get diagnostics v_rider_count = row_count;

  insert into public.race_stage_team_states (
    simulation_run_id,
    race_id,
    stage_id,
    team_id,
    best_rider_position,
    team_finish_time_seconds,
    team_rank,
    team_work_score,
    metadata
  )
  select
    v_run_id,
    v_race_id,
    p_stage_id,
    team_id,
    min(finish_position),
    min(finish_time_seconds),
    row_number() over (
      order by
        min(finish_time_seconds),
        min(finish_position)
    ),
    sum(work_done_score),
    jsonb_build_object(
      'source',
      'race_engine_v1'
    )
  from public.race_stage_rider_states
  where simulation_run_id = v_run_id
  group by team_id;

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
    v_race_id::uuid,
    p_stage_id::uuid,
    600001::integer,
    0::numeric,
    '00:00'::text,
    'start'::text,
    'Stage started'::text,
    'The peloton rolls out as the race engine begins the stage simulation.'::text,
    null::uuid,
    null::uuid,
    null::text,
    null::text,
    jsonb_build_object(
      'source',
      'race_engine_v1'
    )

  union all

  select
    v_race_id::uuid,
    p_stage_id::uuid,
    600002::integer,
    null::numeric,
    null::text,
    'summary'::text,
    'Race develops'::text,
    'The stage profile, rider skills, stamina, morale, fatigue and tactics are calculated across the route.'::text,
    null::uuid,
    null::uuid,
    null::text,
    null::text,
    jsonb_build_object(
      'source',
      'race_engine_v1',
      'segment_count',
      v_segment_count
    )

  union all

  select
    v_race_id::uuid,
    p_stage_id::uuid,
    600003::integer,
    null::numeric,
    null::text,
    'finish'::text,
    'Stage winner'::text,
    concat(
      coalesce(metadata->>'rider_name', 'Unknown rider'),
      ' wins the stage for ',
      coalesce(metadata->>'team_name', 'Unknown team'),
      '.'
    )::text,
    rider_id::uuid,
    team_id::uuid,
    (metadata->>'rider_name')::text,
    (metadata->>'team_name')::text,
    jsonb_build_object(
      'source',
      'race_engine_v1'
    )
  from public.race_stage_rider_states
  where simulation_run_id = v_run_id
    and finish_position = 1;

  update public.race_stage_simulation_runs
  set
    status = 'completed',
    completed_at = now(),
    result_summary_json = jsonb_build_object(
      'rider_count',
      v_rider_count,
      'segment_count',
      v_segment_count,
      'winner_rider_id',
      (
        select rider_id
        from public.race_stage_rider_states
        where simulation_run_id = v_run_id
        order by finish_position
        limit 1
      ),
      'winner_name',
      (
        select metadata->>'rider_name'
        from public.race_stage_rider_states
        where simulation_run_id = v_run_id
        order by finish_position
        limit 1
      )
    ),
    updated_at = now()
  where id = v_run_id;

  perform public.race_engine_write_incidents_v1(v_run_id);
  perform public.race_engine_assign_result_groups_v1(v_run_id);

  perform public.race_engine_generate_tactical_report_events_v1(
    v_run_id,
    p_stage_id
  );

  /*
   * Creates the time-based replay and live rider positions.
   */
  perform public.race_engine_write_replay_frames_v1(
    v_run_id
  );

  perform public.race_engine_apply_breakaway_attack_realism_v1(
    v_run_id,
    p_stage_id
  );

  perform public.race_engine_apply_late_chase_replay_realism_v1(
    v_run_id,
    p_stage_id
  );

  perform public.race_engine_apply_finish_sprint_micro_battle_v1(
    v_run_id,
    p_stage_id
  );

  /*
   * Replay-only sprint motion:
   * Reorders rider arrays in the final 2 km and sprint-point approach
   * so the replay visibly shows riders fighting for position.
   * Official results are not changed here.
   */
  perform public.race_engine_apply_sprint_zone_replay_motion_v1(
    v_run_id,
    p_stage_id
  );

  perform public.race_engine_normalize_physical_groups_v1(
    v_run_id,
    p_stage_id
  );

  perform public.race_engine_apply_replay_rider_energy_v1(
    v_run_id,
    p_stage_id
  );

  perform public.race_engine_apply_energy_exhaustion_group_drops_v1(
    v_run_id,
    p_stage_id
  );

  /*
   * Official results are required by replay finish-tail extension.
   * Generate them before the final continuity pass so every newly
   * inserted tail frame participates in the same identity, km and
   * gap validation as the original replay.
   */
  perform public.race_engine_write_stage_results_v1(
    v_run_id
  );

  perform public.race_engine_repair_replay_finish_tail_v1(
    v_run_id,
    true,
    10
  );

  /* Project rider-specific energy onto inserted tail rows. */
  perform public.race_engine_apply_replay_rider_energy_v1(
    v_run_id,
    p_stage_id
  );

  /* Reuse the established group-energy hydration sequence. */
  perform public.race_engine_fill_replay_group_energy_metadata_v1(
    v_run_id,
    p_stage_id
  );

  perform public.race_engine_normalize_replay_energy_bars_v1(
    v_run_id,
    p_stage_id
  );

  perform public.race_engine_apply_stage_live_energy_smooth_v2(
    v_run_id,
    p_stage_id
  );

  /*
   * Final display continuity pass: preserve physical group identity
   * across semantic label/order changes and prevent matched tracks
   * from moving backward in replay distance.
   */
  perform public.race_engine_enforce_replay_display_continuity_v5_exact(
    v_run_id,
    p_stage_id
  );

  /*
   * Ensure profile JSON has been converted into canonical
   * race_stage_points before points and bonuses are calculated.
   *
   * Existing manually configured definitions are preserved.
   */
  perform public.sync_race_stage_points_from_stage_json_v1(
    p_stage_id,
    false
  );

  /*
   * Generic for every race and every stage.
   *
   * If the stage has KOM/sprint/finish definitions, it writes the
   * corresponding race_stage_point_results.
   *
   * If no definitions exist, it safely returns skipped_no_stage_points.
   */
  perform public.race_engine_write_stage_point_results_v1(
    v_run_id
  );

  perform public.race_engine_generate_point_battle_report_events_v1(
    v_run_id,
    p_stage_id
  );

  /*
   * Rebuild cumulative GC, points, mountain, young and team
   * classifications after this stage.
   *
   * Must run after race_engine_write_stage_point_results_v1.
   */
  perform public.race_engine_write_cumulative_classifications_v1(
    v_run_id
  );

  /*
   * Create deterministic replay commentary from persisted frames,
   * point winners and incidents.
   */
  perform public.race_engine_write_replay_commentary_v1(
    v_run_id
  );

  select not exists (
    select 1
    from public.race_stages rs
    where rs.race_id = v_race_id
      and rs.stage_number > (
        select stage_number
        from public.race_stages
        where id = p_stage_id
      )
  )
  into v_is_final_stage;

  perform public.generate_race_ranking_point_awards_v1(
    v_race_id,
    p_stage_id,
    v_is_final_stage
  );

  perform public.generate_race_prize_awards_v1(
    v_race_id,
    p_stage_id,
    v_is_final_stage
  );

  perform public.race_engine_pay_prize_awards_v1(
    v_race_id,
    p_stage_id
  );

  /*
   * Apply rain/cold weather exposure after the stage has been fully
   * calculated but before fatigue/aftermath is finalized.
   *
   * Rain jackets are required when:
   * - the stage is rainy/drizzly/heavy rain, OR
   * - the average temperature is below 15°C.
   *
   * Missing rain jackets do not block the start, but increase
   * post-stage illness/exposure risk.
   */
  perform public.race_engine_apply_rain_jacket_weather_exposure_v1(
    v_run_id,
    p_stage_id
  );

  /*
   * Preparation-linked post-stage integration.
   *
   * The existing road post-finalizer wrapper requires an explicit team id
   * for idempotent stage-supply consumption. Run it once for every team
   * represented in the completed simulation so tactical outcomes, official
   * command deltas, incident-equipment damage and supplies are processed
   * through the already installed helpers without adding duplicate writers.
   */
  for v_post_stage_team_id in
    select distinct rider_state.team_id
    from public.race_stage_rider_states rider_state
    where rider_state.simulation_run_id = v_run_id
      and rider_state.team_id is not null
    order by rider_state.team_id
  loop
    perform public.race_engine_apply_road_stage_post_finalizer_extensions_v20(
      v_run_id,
      v_post_stage_team_id,
      false,
      'run_race_stage_road_race_v1'
    );
  end loop;

  /*
   * Equipment and team-asset wear is simulation-scoped and must run once.
   * Reuse the installed post-audit wrapper; do not call the wear writer per
   * team because its idempotency ledger is keyed to the simulation/stage.
   */
  perform public.race_engine_apply_stage_post_audit_extras_v2(
    v_run_id,
    null,
    false
  );

  /*
   * Legacy timeline writer removed.
   * race_engine_write_replay_commentary_v1 is now the single
   * authoritative source for replay commentary.
   */

  perform public.race_engine_apply_stage_fatigue_v1(
    v_run_id
  );

  /*
   * RACE_RESULTS_SUMMARY is created by the delayed publication
   * processor only after the 15-minute live window has ended.
   */

  return jsonb_build_object(
    'status',
    'completed',
    'simulation_run_id',
    v_run_id,
    'race_id',
    v_race_id,
    'stage_id',
    p_stage_id,
    'rider_count',
    v_rider_count,
    'segment_count',
    v_segment_count
  );

exception when others then
  update public.race_stage_simulation_runs
  set
    status = 'failed',
    failed_at = now(),
    error_message = sqlerrm,
    updated_at = now()
  where stage_id = p_stage_id;

  raise;
end;$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_finalize_time_trial_stage_v1_legacy_before_tt_point(p_simulation_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_stage_format text;
  v_run_status text;
  v_summary jsonb;
  v_is_final_stage boolean := false;

  v_component_errors jsonb := '{}'::jsonb;

  v_report_event_count integer := 0;
  v_incident_count integer := 0;
  v_point_result_count integer := 0;
  v_classification_count integer := 0;
  v_ranking_award_count integer := 0;
  v_prize_award_count integer := 0;
  v_replay_commentary_count integer := 0;

  v_finalization_status text := 'completed';
begin
  if p_simulation_run_id is null then
    raise exception using
      errcode = '22023',
      message = 'Simulation run ID is required.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_simulation_run_id::text || ':time_trial_finalizer_v1',
      0
    )
  );

  select
    simulation_run.race_id,
    simulation_run.stage_id,
    simulation_run.status,
    coalesce(simulation_run.result_summary_json, '{}'::jsonb),
    lower(
      coalesce(
        nullif(stage.stage_format, ''),
        'road_race'
      )
    )
  into
    v_race_id,
    v_stage_id,
    v_run_status,
    v_summary,
    v_stage_format
  from public.race_stage_simulation_runs simulation_run
  join public.race_stages stage
    on stage.id = simulation_run.stage_id
  where simulation_run.id = p_simulation_run_id;

  if v_stage_id is null then
    raise exception using
      errcode = 'P0002',
      message = format(
        'Simulation run %s was not found.',
        p_simulation_run_id
      );
  end if;

  if v_stage_format not in (
    'prologue',
    'individual_time_trial',
    'itt',
    'team_time_trial',
    'ttt'
  ) then
    return jsonb_build_object(
      'status', 'skipped_not_time_trial',
      'simulation_run_id', p_simulation_run_id,
      'race_id', v_race_id,
      'stage_id', v_stage_id,
      'stage_format', v_stage_format
    );
  end if;

  if v_run_status not in (
    'running',
    'completed'
  ) then
    raise exception using
      errcode = '55000',
      message = format(
        'Simulation run %s has status %s. Only running/completed TT runs can be finalized.',
        p_simulation_run_id,
        coalesce(v_run_status, '<null>')
      );
  end if;

  if v_summary #>> '{time_trial_finalization,status}' = 'completed' then
    return jsonb_build_object(
      'status', 'already_finalized',
      'simulation_run_id', p_simulation_run_id,
      'race_id', v_race_id,
      'stage_id', v_stage_id,
      'stage_format', v_stage_format
    );
  end if;

  select not exists (
    select 1
    from public.race_stages later_stage
    where later_stage.race_id = v_race_id
      and later_stage.stage_number > (
        select current_stage.stage_number
        from public.race_stages current_stage
        where current_stage.id = v_stage_id
      )
  )
  into v_is_final_stage;

  /*
    ------------------------------------------------------------
    Report events for TT / TTT
    ------------------------------------------------------------
  */

  delete from public.race_stage_report_events event
  where event.stage_id = v_stage_id
    and event.metadata ->> 'source' =
      'time_trial_finalizer_v1';

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
  values (
    v_race_id,
    v_stage_id,
    900001,
    0,
    '00:00',
    'start',
    case
      when v_stage_format in ('team_time_trial', 'ttt')
        then 'Team time trial starts'
      when v_stage_format = 'prologue'
        then 'Prologue starts'
      else 'Individual time trial starts'
    end,
    case
      when v_stage_format in ('team_time_trial', 'ttt')
        then 'Teams roll down the start ramp one by one as the team time trial begins.'
      when v_stage_format = 'prologue'
        then 'Riders start one by one in the short opening prologue.'
      else 'Riders start one by one against the clock.'
    end,
    null,
    null,
    null,
    null,
    jsonb_build_object(
      'source', 'time_trial_finalizer_v1',
      'stage_format', v_stage_format
    )
  );

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
    900002,
    null,
    null,
    'summary',
    case
      when v_stage_format in ('team_time_trial', 'ttt')
        then 'Teams settle into formation'
      else 'The time checks begin'
    end,
    case
      when v_stage_format in ('team_time_trial', 'ttt')
        then 'The engine calculates team order, cohesion, counting-rider time, dropped riders and final team gaps.'
      else 'The engine calculates rider start order, time-trial performance, pacing, fatigue and final gaps.'
    end,
    null,
    null,
    null,
    null,
    jsonb_build_object(
      'source', 'time_trial_finalizer_v1',
      'stage_format', v_stage_format
    );

  /*
    TTT winner event.
  */
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
    900003,
    null,
    null,
    'finish',
    'Winning team',
    concat(
      coalesce(club.name, 'The winning team'),
      ' wins the team time trial in ',
      team_state.team_finish_time_seconds,
      ' seconds. The counting rider was ',
      coalesce(
        team_state.metadata ->> 'counting_rider_name',
        'the configured counting rider'
      ),
      '.'
    ),
    nullif(
      team_state.metadata ->> 'counting_rider_id',
      ''
    )::uuid,
    team_state.team_id,
    team_state.metadata ->> 'counting_rider_name',
    club.name,
    jsonb_build_object(
      'source', 'time_trial_finalizer_v1',
      'stage_format', v_stage_format,
      'team_rank', team_state.team_rank,
      'team_finish_time_seconds', team_state.team_finish_time_seconds,
      'counting_rider_number', team_state.metadata ->> 'counting_rider_number',
      'counting_rider_id', team_state.metadata ->> 'counting_rider_id',
      'counting_rider_name', team_state.metadata ->> 'counting_rider_name'
    )
  from public.race_stage_team_states team_state
  left join public.clubs club
    on club.id = team_state.team_id
  where team_state.simulation_run_id = p_simulation_run_id
    and team_state.team_rank = 1
    and v_stage_format in ('team_time_trial', 'ttt');

  /*
    ITT / prologue winner event.
  */
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
    900003,
    null,
    null,
    'finish',
    'Stage winner',
    concat(
      coalesce(result.rider_name_snapshot, 'The fastest rider'),
      ' wins against the clock for ',
      coalesce(result.team_name_snapshot, 'their team'),
      ' in ',
      result.elapsed_seconds,
      ' seconds.'
    ),
    result.rider_id,
    result.team_id,
    result.rider_name_snapshot,
    result.team_name_snapshot,
    jsonb_build_object(
      'source', 'time_trial_finalizer_v1',
      'stage_format', v_stage_format,
      'elapsed_seconds', result.elapsed_seconds,
      'gap_seconds', result.gap_seconds
    )
  from public.race_stage_results result
  where result.stage_id = v_stage_id
    and result.rank = 1
    and v_stage_format in (
      'prologue',
      'individual_time_trial',
      'itt'
    );

  select count(*)
  into v_report_event_count
  from public.race_stage_report_events event
  where event.stage_id = v_stage_id
    and event.metadata ->> 'source' =
      'time_trial_finalizer_v1';

  /*
    ------------------------------------------------------------
    Incidents
    ------------------------------------------------------------
  */

  begin
    perform public.race_engine_write_incidents_v1(
      p_simulation_run_id
    );

    select count(*)
    into v_incident_count
    from public.race_stage_incidents incident
    where incident.simulation_run_id =
      p_simulation_run_id;

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'incidents',
        sqlerrm
      );
  end;

  /*
    ------------------------------------------------------------
    Point gates
    ------------------------------------------------------------
  */

  begin
    perform public.sync_race_stage_points_from_stage_json_v1(
      v_stage_id,
      false
    );

    perform public.race_engine_write_stage_point_results_v1(
      p_simulation_run_id
    );

    select count(*)
    into v_point_result_count
    from public.race_stage_point_results point_result
    where point_result.stage_id =
      v_stage_id;

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'point_gates',
        sqlerrm
      );
  end;

  /*
    ------------------------------------------------------------
    Classifications
    ------------------------------------------------------------
  */

  begin
    perform public.race_engine_write_cumulative_classifications_v1(
      p_simulation_run_id
    );

    select count(*)
    into v_classification_count
    from public.race_classification_standings standing
    where standing.after_stage_id =
      v_stage_id;

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'classifications',
        sqlerrm
      );
  end;

  /*
    ------------------------------------------------------------
    Replay commentary
    ------------------------------------------------------------

    Important:
    Some TT core runners already create low-order report events.
    Replay commentary also writes low event_order values.

    Move existing non-commentary / non-finalizer low-order events
    away from the replay-commentary range before calling the
    commentary writer.
  */

  begin
    with moved_event as (
      select
        event.id,
        row_number() over (
          order by
            event.event_order,
            event.created_at,
            event.id
        ) as event_row_number
      from public.race_stage_report_events event
      where event.stage_id = v_stage_id
        and event.event_order < 700000
        and coalesce(
          event.metadata ->> 'source',
          ''
        ) not in (
          'race_engine_replay_commentary_v1',
          'time_trial_finalizer_v1'
        )
        and coalesce(event.event_type, '') <> 'commentary'
    )
    update public.race_stage_report_events event
    set event_order =
      700000 + moved_event.event_row_number
    from moved_event
    where moved_event.id = event.id;

    perform public.race_engine_write_replay_commentary_v1(
      p_simulation_run_id
    );

    select count(*)
    into v_replay_commentary_count
    from public.race_stage_report_events event
    where event.stage_id = v_stage_id
      and (
        event.metadata ->> 'source' =
          'race_engine_replay_commentary_v1'
        or event.event_type = 'commentary'
      );

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'replay_commentary',
        sqlerrm
      );
  end;

  /*
    ------------------------------------------------------------
    Ranking awards
    ------------------------------------------------------------
  */

  begin
    perform public.generate_race_ranking_point_awards_v1(
      v_race_id,
      v_stage_id,
      v_is_final_stage
    );

    select count(*)
    into v_ranking_award_count
    from public.race_ranking_point_awards award
    where award.race_id = v_race_id
      and award.stage_id = v_stage_id;

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'ranking_awards',
        sqlerrm
      );
  end;

  /*
    ------------------------------------------------------------
    Prize awards and payment
    ------------------------------------------------------------
  */

  begin
    perform public.generate_race_prize_awards_v1(
      v_race_id,
      v_stage_id,
      v_is_final_stage
    );

    perform public.race_engine_pay_prize_awards_v1(
      v_race_id,
      v_stage_id
    );

    select count(*)
    into v_prize_award_count
    from public.race_prize_awards prize
    where prize.race_id = v_race_id
      and prize.stage_id = v_stage_id;

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'prize_awards',
        sqlerrm
      );
  end;

  /*
    ------------------------------------------------------------
    Fatigue
    ------------------------------------------------------------
  */

  begin
    perform public.race_engine_apply_stage_fatigue_v1(
      p_simulation_run_id
    );

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'fatigue',
        sqlerrm
      );
  end;

  if v_component_errors <> '{}'::jsonb then
    v_finalization_status := 'completed_with_component_errors';
  end if;

  update public.race_stage_simulation_runs simulation_run
  set
    status = 'completed',
    result_summary_json =
      (
        coalesce(simulation_run.result_summary_json, '{}'::jsonb)
        - 'pending_components'
      )
      || jsonb_build_object(
        'time_trial_finalization',
        jsonb_build_object(
          'status', v_finalization_status,
          'finalized_at', now(),
          'stage_format', v_stage_format,
          'is_final_stage', v_is_final_stage,
          'report_event_count', v_report_event_count,
          'incident_count', v_incident_count,
          'point_result_count', v_point_result_count,
          'classification_count', v_classification_count,
          'replay_commentary_count', v_replay_commentary_count,
          'ranking_award_count', v_ranking_award_count,
          'prize_award_count', v_prize_award_count,
          'component_errors', v_component_errors
        )
      ),
    updated_at = now()
  where simulation_run.id =
    p_simulation_run_id;

  return jsonb_build_object(
    'status', v_finalization_status,
    'simulation_run_id', p_simulation_run_id,
    'race_id', v_race_id,
    'stage_id', v_stage_id,
    'stage_format', v_stage_format,
    'is_final_stage', v_is_final_stage,
    'report_event_count', v_report_event_count,
    'incident_count', v_incident_count,
    'point_result_count', v_point_result_count,
    'classification_count', v_classification_count,
    'replay_commentary_count', v_replay_commentary_count,
    'ranking_award_count', v_ranking_award_count,
    'prize_award_count', v_prize_award_count,
    'component_errors', v_component_errors
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_race_replay_frames_participation_only_v1(p_race_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return false;
  end if;

  /*
    User may own a main club and a developing club.
    Both must be considered valid owned clubs.
  */
  return exists (
    with owned_clubs as (
      select club.id
      from public.clubs club
      where club.owner_user_id = v_user_id
    )

    select 1
    from owned_clubs club
    where exists (
      select 1
      from public.race_participant_teams participant_team
      where participant_team.race_id = p_race_id
        and participant_team.team_id = club.id
        and lower(
          coalesce(
            participant_team.status,
            ''
          )
        ) in (
          'accepted',
          'confirmed',
          'participating'
        )
    )

    or exists (
      select 1
      from public.race_participant_riders participant_rider
      where participant_rider.race_id = p_race_id
        and participant_rider.team_id = club.id
    )

    or exists (
      select 1
      from public.race_team_entries race_entry
      where race_entry.race_id = p_race_id
        and race_entry.club_id = club.id
        and lower(
          coalesce(
            race_entry.status,
            ''
          )
        ) in (
          'accepted',
          'confirmed',
          'participating'
        )
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_race_stage_plan_v1(p_club_id uuid, p_race_preparation_id uuid, p_race_id uuid, p_stage_id uuid, p_stage_number integer, p_team_tactic_json jsonb, p_rider_roles_json jsonb, p_rider_equipment_json jsonb, p_rider_individual_tactics_json jsonb, p_rider_supplies_json jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage_id uuid;
  v_stage_format text;
  v_is_tt_stage boolean := false;
  v_is_ttt_stage boolean := false;

  v_team_tactic_json jsonb :=
    coalesce(p_team_tactic_json, '{}'::jsonb);

  v_rider_roles_json jsonb :=
    coalesce(p_rider_roles_json, '{}'::jsonb);

  v_rider_individual_tactics_json jsonb :=
    coalesce(p_rider_individual_tactics_json, '{}'::jsonb);

  v_rider_supplies_json jsonb :=
    coalesce(p_rider_supplies_json, '{}'::jsonb);

  v_normalized_tt_plan text;
  v_tt_role text;
  v_safe_roles_json jsonb := '{}'::jsonb;
  v_intended_tt_roles_json jsonb := '{}'::jsonb;
begin
  select
    stage.id,
    stage.stage_format
  into
    v_stage_id,
    v_stage_format
  from public.race_stages stage
  where (
      p_stage_id is not null
      and stage.id = p_stage_id
    )
    or (
      p_stage_id is null
      and p_stage_number is not null
      and stage.race_id = p_race_id
      and stage.stage_number = p_stage_number
    )
  order by
    case when stage.id = p_stage_id then 0 else 1 end
  limit 1;

  if v_stage_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Stage was not found for Stage Plan save.';
  end if;

  v_is_tt_stage :=
    v_stage_format in (
      'prologue',
      'individual_time_trial',
      'team_time_trial'
    );

  v_is_ttt_stage :=
    v_stage_format = 'team_time_trial';

  if v_is_tt_stage then
    v_normalized_tt_plan :=
      public.normalize_time_trial_team_tactic_plan_v1(
        coalesce(
          v_team_tactic_json ->> 'tt_plan',
          v_team_tactic_json ->> 'tt_team_tactic_plan',
          v_team_tactic_json ->> 'plan',
          'tt_balanced_pace'
        )
      );

    v_tt_role :=
      case
        when v_is_ttt_stage
          then 'team_time_trial_rider'
        else 'time_trial_rider'
      end;

    with rider_keys as (
      select jsonb_object_keys(
        coalesce(v_rider_roles_json, '{}'::jsonb)
      ) as rider_id

      union

      select jsonb_object_keys(
        coalesce(p_rider_equipment_json, '{}'::jsonb)
      ) as rider_id

      union

      select jsonb_object_keys(
        coalesce(v_rider_individual_tactics_json, '{}'::jsonb)
      ) as rider_id

      union

      select jsonb_object_keys(
        coalesce(v_rider_supplies_json, '{}'::jsonb)
      ) as rider_id
    )
    select
      coalesce(
        jsonb_object_agg(rider_id, 'free_role'::text),
        '{}'::jsonb
      ),
      coalesce(
        jsonb_object_agg(rider_id, v_tt_role),
        '{}'::jsonb
      )
    into
      v_safe_roles_json,
      v_intended_tt_roles_json
    from rider_keys;

    /*
     * Important:
     * The legacy SQL RPC may still only understand old road-stage values.
     * Therefore the wrapper accepts native TT values, stores the TT intent
     * as metadata, but passes old-safe fields into the legacy function.
     */
    v_team_tactic_json :=
      v_team_tactic_json
      || jsonb_build_object(
        'plan',
          'balanced',

        'tt_plan',
          v_normalized_tt_plan,

        'tt_team_tactic_plan',
          v_normalized_tt_plan,

        'is_time_trial_stage',
          true,

        'is_team_time_trial_stage',
          v_is_ttt_stage,

        'tt_engine_roles_by_rider',
          v_intended_tt_roles_json,

        'tt_individual_tactics_by_rider',
          v_rider_individual_tactics_json,

        'tt_supplies_disabled',
          true,

        'tt_native_save_wrapper',
          'save_race_stage_plan_v1',

        'tt_native_save_wrapper_version',
          '2026-06-18-v1'
      );

    return public.save_race_stage_plan_v1_legacy_before_tt_native(
      p_club_id,
      p_race_preparation_id,
      p_race_id,
      v_stage_id,
      p_stage_number,
      v_team_tactic_json,
      v_safe_roles_json,
      coalesce(p_rider_equipment_json, '{}'::jsonb),
      '{}'::jsonb,
      '{}'::jsonb
    );
  end if;

  return public.save_race_stage_plan_v1_legacy_before_tt_native(
    p_club_id,
    p_race_preparation_id,
    p_race_id,
    p_stage_id,
    p_stage_number,
    coalesce(p_team_tactic_json, jsonb_build_object('plan', 'balanced', 'notes', '')),
    coalesce(p_rider_roles_json, '{}'::jsonb),
    coalesce(p_rider_equipment_json, '{}'::jsonb),
    coalesce(p_rider_individual_tactics_json, '{}'::jsonb),
    coalesce(p_rider_supplies_json, '{}'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_finalize_time_trial_stage_v1_legacy_before_ttt_rank(p_simulation_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_stage_format text;
  v_run_status text;
  v_summary jsonb;
  v_is_final_stage boolean := false;

  v_component_errors jsonb := '{}'::jsonb;

  v_report_event_count integer := 0;
  v_incident_count integer := 0;
  v_point_result_count integer := 0;
  v_classification_count integer := 0;
  v_ranking_award_count integer := 0;
  v_prize_award_count integer := 0;
  v_replay_commentary_count integer := 0;

  v_result_rule_update_count integer := 0;
  v_deleted_stage_point_count integer := 0;
  v_deleted_stage_point_result_count integer := 0;

  v_finalization_status text := 'completed';
begin
  if p_simulation_run_id is null then
    raise exception using
      errcode = '22023',
      message = 'Simulation run ID is required.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_simulation_run_id::text || ':time_trial_finalizer_v1',
      0
    )
  );

  select
    simulation_run.race_id,
    simulation_run.stage_id,
    simulation_run.status,
    coalesce(simulation_run.result_summary_json, '{}'::jsonb),
    lower(
      coalesce(
        nullif(stage.stage_format, ''),
        'road_race'
      )
    )
  into
    v_race_id,
    v_stage_id,
    v_run_status,
    v_summary,
    v_stage_format
  from public.race_stage_simulation_runs simulation_run
  join public.race_stages stage
    on stage.id = simulation_run.stage_id
  where simulation_run.id = p_simulation_run_id;

  if v_stage_id is null then
    raise exception using
      errcode = 'P0002',
      message = format(
        'Simulation run %s was not found.',
        p_simulation_run_id
      );
  end if;

  if v_stage_format not in (
    'prologue',
    'individual_time_trial',
    'itt',
    'team_time_trial',
    'ttt'
  ) then
    return jsonb_build_object(
      'status', 'skipped_not_time_trial',
      'simulation_run_id', p_simulation_run_id,
      'race_id', v_race_id,
      'stage_id', v_stage_id,
      'stage_format', v_stage_format
    );
  end if;

  if v_run_status not in (
    'running',
    'completed'
  ) then
    raise exception using
      errcode = '55000',
      message = format(
        'Simulation run %s has status %s. Only running/completed TT runs can be finalized.',
        p_simulation_run_id,
        coalesce(v_run_status, '<null>')
      );
  end if;

  /*
    ------------------------------------------------------------
    Hard TT result rules / point-gate cleanup
    ------------------------------------------------------------

    This runs even when a TT stage was already finalized, because
    old finalizer versions could leave road-style gate rows or
    bonus/point values behind.
  */

  begin
    delete from public.race_stage_point_results point_result
    where point_result.stage_id = v_stage_id;

    get diagnostics
      v_deleted_stage_point_result_count = row_count;

    delete from public.race_stage_points stage_point
    where stage_point.stage_id = v_stage_id;

    get diagnostics
      v_deleted_stage_point_count = row_count;

    update public.race_stage_results result
    set
      bonus_seconds = 0,
      sprint_points = 0,
      mountain_points = 0,
      finish_points =
        case
          when v_stage_format in (
            'prologue',
            'individual_time_trial',
            'itt'
          )
          then
            case result.rank
              when 1 then 15
              when 2 then 12
              when 3 then 10
              when 4 then 8
              when 5 then 6
              when 6 then 5
              when 7 then 4
              when 8 then 3
              when 9 then 2
              when 10 then 1
              else 0
            end

          else 0
        end
    where result.stage_id = v_stage_id;

    get diagnostics
      v_result_rule_update_count = row_count;

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'tt_result_rules',
        sqlerrm
      );
  end;

  if v_summary #>> '{time_trial_finalization,status}' = 'completed' then
    return jsonb_build_object(
      'status', 'already_finalized',
      'simulation_run_id', p_simulation_run_id,
      'race_id', v_race_id,
      'stage_id', v_stage_id,
      'stage_format', v_stage_format,
      'result_rule_update_count', v_result_rule_update_count,
      'deleted_stage_point_count', v_deleted_stage_point_count,
      'deleted_stage_point_result_count', v_deleted_stage_point_result_count,
      'component_errors', v_component_errors
    );
  end if;

  select not exists (
    select 1
    from public.race_stages later_stage
    where later_stage.race_id = v_race_id
      and later_stage.stage_number > (
        select current_stage.stage_number
        from public.race_stages current_stage
        where current_stage.id = v_stage_id
      )
  )
  into v_is_final_stage;

  /*
    ------------------------------------------------------------
    Report events for TT / TTT
    ------------------------------------------------------------
  */

  delete from public.race_stage_report_events event
  where event.stage_id = v_stage_id
    and event.metadata ->> 'source' =
      'time_trial_finalizer_v1';

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
  values (
    v_race_id,
    v_stage_id,
    900001,
    0,
    '00:00',
    'start',
    case
      when v_stage_format in ('team_time_trial', 'ttt')
        then 'Team time trial starts'
      when v_stage_format = 'prologue'
        then 'Prologue starts'
      else 'Individual time trial starts'
    end,
    case
      when v_stage_format in ('team_time_trial', 'ttt')
        then 'Teams roll down the start ramp one by one as the team time trial begins.'
      when v_stage_format = 'prologue'
        then 'Riders start one by one in the short opening prologue.'
      else 'Riders start one by one against the clock.'
    end,
    null,
    null,
    null,
    null,
    jsonb_build_object(
      'source', 'time_trial_finalizer_v1',
      'stage_format', v_stage_format
    )
  );

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
    900002,
    null,
    null,
    'summary',
    case
      when v_stage_format in ('team_time_trial', 'ttt')
        then 'Teams settle into formation'
      else 'The time checks begin'
    end,
    case
      when v_stage_format in ('team_time_trial', 'ttt')
        then 'The engine calculates team order, cohesion, counting-rider time, dropped riders and final team gaps.'
      else 'The engine calculates rider start order, time-trial performance, pacing, fatigue and final gaps.'
    end,
    null,
    null,
    null,
    null,
    jsonb_build_object(
      'source', 'time_trial_finalizer_v1',
      'stage_format', v_stage_format
    );

  /*
    TTT winner event.
  */
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
    900003,
    null,
    null,
    'finish',
    'Winning team',
    concat(
      coalesce(club.name, 'The winning team'),
      ' wins the team time trial in ',
      team_state.team_finish_time_seconds,
      ' seconds. The counting rider was ',
      coalesce(
        team_state.metadata ->> 'counting_rider_name',
        'the configured counting rider'
      ),
      '.'
    ),
    nullif(
      team_state.metadata ->> 'counting_rider_id',
      ''
    )::uuid,
    team_state.team_id,
    team_state.metadata ->> 'counting_rider_name',
    club.name,
    jsonb_build_object(
      'source', 'time_trial_finalizer_v1',
      'stage_format', v_stage_format,
      'team_rank', team_state.team_rank,
      'team_finish_time_seconds', team_state.team_finish_time_seconds,
      'counting_rider_number', team_state.metadata ->> 'counting_rider_number',
      'counting_rider_id', team_state.metadata ->> 'counting_rider_id',
      'counting_rider_name', team_state.metadata ->> 'counting_rider_name'
    )
  from public.race_stage_team_states team_state
  left join public.clubs club
    on club.id = team_state.team_id
  where team_state.simulation_run_id = p_simulation_run_id
    and team_state.team_rank = 1
    and v_stage_format in ('team_time_trial', 'ttt');

  /*
    ITT / prologue winner event.
  */
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
    900003,
    null,
    null,
    'finish',
    'Stage winner',
    concat(
      coalesce(result.rider_name_snapshot, 'The fastest rider'),
      ' wins against the clock for ',
      coalesce(result.team_name_snapshot, 'their team'),
      ' in ',
      result.elapsed_seconds,
      ' seconds.'
    ),
    result.rider_id,
    result.team_id,
    result.rider_name_snapshot,
    result.team_name_snapshot,
    jsonb_build_object(
      'source', 'time_trial_finalizer_v1',
      'stage_format', v_stage_format,
      'elapsed_seconds', result.elapsed_seconds,
      'gap_seconds', result.gap_seconds
    )
  from public.race_stage_results result
  where result.stage_id = v_stage_id
    and result.rank = 1
    and v_stage_format in (
      'prologue',
      'individual_time_trial',
      'itt'
    );

  select count(*)
  into v_report_event_count
  from public.race_stage_report_events event
  where event.stage_id = v_stage_id
    and event.metadata ->> 'source' =
      'time_trial_finalizer_v1';

  /*
    ------------------------------------------------------------
    Incidents
    ------------------------------------------------------------
  */

  begin
    perform public.race_engine_write_incidents_v1(
      p_simulation_run_id
    );

    select count(*)
    into v_incident_count
    from public.race_stage_incidents incident
    where incident.simulation_run_id =
      p_simulation_run_id;

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'incidents',
        sqlerrm
      );
  end;

  /*
    ------------------------------------------------------------
    Point gates
    ------------------------------------------------------------

    TT / Prologue / TTT stages deliberately do not use road-style
    race_stage_points or race_stage_point_results.

    The result-rule block above deletes any stale gate rows and
    forces:
    - no bonus seconds for all TT formats
    - Prologue / ITT finish points only through race_stage_results
    - TTT finish points = 0
  */

  v_point_result_count := 0;

  /*
    ------------------------------------------------------------
    Classifications
    ------------------------------------------------------------
  */

  begin
    perform public.race_engine_write_cumulative_classifications_v1(
      p_simulation_run_id
    );

    select count(*)
    into v_classification_count
    from public.race_classification_standings standing
    where standing.after_stage_id =
      v_stage_id;

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'classifications',
        sqlerrm
      );
  end;

  /*
    ------------------------------------------------------------
    Replay commentary
    ------------------------------------------------------------

    Important:
    Some TT core runners already create low-order report events.
    Replay commentary also writes low event_order values.

    Move existing non-commentary / non-finalizer low-order events
    away from the replay-commentary range before calling the
    commentary writer.
  */

  begin
    with moved_event as (
      select
        event.id,
        row_number() over (
          order by
            event.event_order,
            event.created_at,
            event.id
        ) as event_row_number
      from public.race_stage_report_events event
      where event.stage_id = v_stage_id
        and event.event_order < 700000
        and coalesce(
          event.metadata ->> 'source',
          ''
        ) not in (
          'race_engine_replay_commentary_v1',
          'time_trial_finalizer_v1'
        )
        and coalesce(event.event_type, '') <> 'commentary'
    )
    update public.race_stage_report_events event
    set event_order =
      700000 + moved_event.event_row_number
    from moved_event
    where moved_event.id = event.id;

    perform public.race_engine_write_replay_commentary_v1(
      p_simulation_run_id
    );

    select count(*)
    into v_replay_commentary_count
    from public.race_stage_report_events event
    where event.stage_id = v_stage_id
      and (
        event.metadata ->> 'source' =
          'race_engine_replay_commentary_v1'
        or event.event_type = 'commentary'
      );

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'replay_commentary',
        sqlerrm
      );
  end;

  /*
    ------------------------------------------------------------
    Ranking awards
    ------------------------------------------------------------
  */

  begin
    perform public.generate_race_ranking_point_awards_v1(
      v_race_id,
      v_stage_id,
      v_is_final_stage
    );

    select count(*)
    into v_ranking_award_count
    from public.race_ranking_point_awards award
    where award.race_id = v_race_id
      and award.stage_id = v_stage_id;

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'ranking_awards',
        sqlerrm
      );
  end;

  /*
    ------------------------------------------------------------
    Prize awards and payment
    ------------------------------------------------------------
  */

  begin
    perform public.generate_race_prize_awards_v1(
      v_race_id,
      v_stage_id,
      v_is_final_stage
    );

    perform public.race_engine_pay_prize_awards_v1(
      v_race_id,
      v_stage_id
    );

    select count(*)
    into v_prize_award_count
    from public.race_prize_awards prize
    where prize.race_id = v_race_id
      and prize.stage_id = v_stage_id;

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'prize_awards',
        sqlerrm
      );
  end;

  /*
    ------------------------------------------------------------
    Fatigue
    ------------------------------------------------------------
  */

  begin
    perform public.race_engine_apply_stage_fatigue_v1(
      p_simulation_run_id
    );

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'fatigue',
        sqlerrm
      );
  end;

  if v_component_errors <> '{}'::jsonb then
    v_finalization_status := 'completed_with_component_errors';
  end if;

  update public.race_stage_simulation_runs simulation_run
  set
    status = 'completed',
    result_summary_json =
      (
        coalesce(simulation_run.result_summary_json, '{}'::jsonb)
        - 'pending_components'
      )
      || jsonb_build_object(
        'time_trial_finalization',
        jsonb_build_object(
          'status', v_finalization_status,
          'finalized_at', now(),
          'stage_format', v_stage_format,
          'is_final_stage', v_is_final_stage,
          'report_event_count', v_report_event_count,
          'incident_count', v_incident_count,
          'point_result_count', v_point_result_count,
          'result_rule_update_count', v_result_rule_update_count,
          'deleted_stage_point_count', v_deleted_stage_point_count,
          'deleted_stage_point_result_count', v_deleted_stage_point_result_count,
          'classification_count', v_classification_count,
          'replay_commentary_count', v_replay_commentary_count,
          'ranking_award_count', v_ranking_award_count,
          'prize_award_count', v_prize_award_count,
          'component_errors', v_component_errors
        )
      ),
    updated_at = now()
  where simulation_run.id =
    p_simulation_run_id;

  return jsonb_build_object(
    'status', v_finalization_status,
    'simulation_run_id', p_simulation_run_id,
    'race_id', v_race_id,
    'stage_id', v_stage_id,
    'stage_format', v_stage_format,
    'is_final_stage', v_is_final_stage,
    'report_event_count', v_report_event_count,
    'incident_count', v_incident_count,
    'point_result_count', v_point_result_count,
    'result_rule_update_count', v_result_rule_update_count,
    'deleted_stage_point_count', v_deleted_stage_point_count,
    'deleted_stage_point_result_count', v_deleted_stage_point_result_count,
    'classification_count', v_classification_count,
    'replay_commentary_count', v_replay_commentary_count,
    'ranking_award_count', v_ranking_award_count,
    'prize_award_count', v_prize_award_count,
    'component_errors', v_component_errors
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_finalize_time_trial_stage_v1(p_simulation_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_stage_format text;
  v_run_status text;
  v_summary jsonb;
  v_is_final_stage boolean := false;

  v_component_errors jsonb := '{}'::jsonb;

  v_report_event_count integer := 0;
  v_incident_count integer := 0;
  v_point_result_count integer := 0;
  v_classification_count integer := 0;
  v_ranking_award_count integer := 0;
  v_prize_award_count integer := 0;
  v_replay_commentary_count integer := 0;

  v_result_rule_update_count integer := 0;
  v_deleted_stage_point_count integer := 0;
  v_deleted_stage_point_result_count integer := 0;
  v_deleted_ranking_award_count integer := 0;

  v_finalization_status text := 'completed';
begin
  if p_simulation_run_id is null then
    raise exception using
      errcode = '22023',
      message = 'Simulation run ID is required.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_simulation_run_id::text || ':time_trial_finalizer_v1',
      0
    )
  );

  select
    simulation_run.race_id,
    simulation_run.stage_id,
    simulation_run.status,
    coalesce(simulation_run.result_summary_json, '{}'::jsonb),
    lower(
      coalesce(
        nullif(stage.stage_format, ''),
        'road_race'
      )
    )
  into
    v_race_id,
    v_stage_id,
    v_run_status,
    v_summary,
    v_stage_format
  from public.race_stage_simulation_runs simulation_run
  join public.race_stages stage
    on stage.id = simulation_run.stage_id
  where simulation_run.id = p_simulation_run_id;

  if v_stage_id is null then
    raise exception using
      errcode = 'P0002',
      message = format(
        'Simulation run %s was not found.',
        p_simulation_run_id
      );
  end if;

  if v_stage_format not in (
    'prologue',
    'individual_time_trial',
    'itt',
    'team_time_trial',
    'ttt'
  ) then
    return jsonb_build_object(
      'status', 'skipped_not_time_trial',
      'simulation_run_id', p_simulation_run_id,
      'race_id', v_race_id,
      'stage_id', v_stage_id,
      'stage_format', v_stage_format
    );
  end if;

  if v_run_status not in (
    'running',
    'completed'
  ) then
    raise exception using
      errcode = '55000',
      message = format(
        'Simulation run %s has status %s. Only running/completed TT runs can be finalized.',
        p_simulation_run_id,
        coalesce(v_run_status, '<null>')
      );
  end if;

  /*
    ------------------------------------------------------------
    Hard TT result rules / point-gate cleanup
    ------------------------------------------------------------

    This runs even when a TT stage was already finalized, because
    old finalizer versions could leave road-style gate rows,
    bonus/point values, or TTT ranking awards behind.
  */

  begin
    delete from public.race_stage_point_results point_result
    where point_result.stage_id = v_stage_id;

    get diagnostics
      v_deleted_stage_point_result_count = row_count;

    delete from public.race_stage_points stage_point
    where stage_point.stage_id = v_stage_id;

    get diagnostics
      v_deleted_stage_point_count = row_count;

    update public.race_stage_results result
    set
      bonus_seconds = 0,
      sprint_points = 0,
      mountain_points = 0,
      finish_points =
        case
          when v_stage_format in (
            'prologue',
            'individual_time_trial',
            'itt'
          )
          then
            case result.rank
              when 1 then 15
              when 2 then 12
              when 3 then 10
              when 4 then 8
              when 5 then 6
              when 6 then 5
              when 7 then 4
              when 8 then 3
              when 9 then 2
              when 10 then 1
              else 0
            end

          else 0
        end
    where result.stage_id = v_stage_id;

    get diagnostics
      v_result_rule_update_count = row_count;

    /*
      TTT v1 rule:
      no rider finish points and no ranking-point awards.
    */
    if v_stage_format in (
      'team_time_trial',
      'ttt'
    ) then
      delete from public.race_ranking_point_awards award
      where award.race_id = v_race_id
        and award.stage_id = v_stage_id;

      get diagnostics
        v_deleted_ranking_award_count = row_count;
    end if;

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'tt_result_rules',
        sqlerrm
      );
  end;

  if v_summary #>> '{time_trial_finalization,status}' = 'completed' then
    return jsonb_build_object(
      'status', 'already_finalized',
      'simulation_run_id', p_simulation_run_id,
      'race_id', v_race_id,
      'stage_id', v_stage_id,
      'stage_format', v_stage_format,
      'result_rule_update_count', v_result_rule_update_count,
      'deleted_stage_point_count', v_deleted_stage_point_count,
      'deleted_stage_point_result_count', v_deleted_stage_point_result_count,
      'deleted_ranking_award_count', v_deleted_ranking_award_count,
      'component_errors', v_component_errors
    );
  end if;

  select not exists (
    select 1
    from public.race_stages later_stage
    where later_stage.race_id = v_race_id
      and later_stage.stage_number > (
        select current_stage.stage_number
        from public.race_stages current_stage
        where current_stage.id = v_stage_id
      )
  )
  into v_is_final_stage;

  /*
    ------------------------------------------------------------
    Report events for TT / TTT
    ------------------------------------------------------------
  */

  delete from public.race_stage_report_events event
  where event.stage_id = v_stage_id
    and event.metadata ->> 'source' =
      'time_trial_finalizer_v1';

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
  values (
    v_race_id,
    v_stage_id,
    900001,
    0,
    '00:00',
    'start',
    case
      when v_stage_format in ('team_time_trial', 'ttt')
        then 'Team time trial starts'
      when v_stage_format = 'prologue'
        then 'Prologue starts'
      else 'Individual time trial starts'
    end,
    case
      when v_stage_format in ('team_time_trial', 'ttt')
        then 'Teams roll down the start ramp one by one as the team time trial begins.'
      when v_stage_format = 'prologue'
        then 'Riders start one by one in the short opening prologue.'
      else 'Riders start one by one against the clock.'
    end,
    null,
    null,
    null,
    null,
    jsonb_build_object(
      'source', 'time_trial_finalizer_v1',
      'stage_format', v_stage_format
    )
  );

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
    900002,
    null,
    null,
    'summary',
    case
      when v_stage_format in ('team_time_trial', 'ttt')
        then 'Teams settle into formation'
      else 'The time checks begin'
    end,
    case
      when v_stage_format in ('team_time_trial', 'ttt')
        then 'The engine calculates team order, cohesion, counting-rider time, dropped riders and final team gaps.'
      else 'The engine calculates rider start order, time-trial performance, pacing, fatigue and final gaps.'
    end,
    null,
    null,
    null,
    null,
    jsonb_build_object(
      'source', 'time_trial_finalizer_v1',
      'stage_format', v_stage_format
    );

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
    900003,
    null,
    null,
    'finish',
    'Winning team',
    concat(
      coalesce(club.name, 'The winning team'),
      ' wins the team time trial in ',
      team_state.team_finish_time_seconds,
      ' seconds. The counting rider was ',
      coalesce(
        team_state.metadata ->> 'counting_rider_name',
        'the configured counting rider'
      ),
      '.'
    ),
    nullif(
      team_state.metadata ->> 'counting_rider_id',
      ''
    )::uuid,
    team_state.team_id,
    team_state.metadata ->> 'counting_rider_name',
    club.name,
    jsonb_build_object(
      'source', 'time_trial_finalizer_v1',
      'stage_format', v_stage_format,
      'team_rank', team_state.team_rank,
      'team_finish_time_seconds', team_state.team_finish_time_seconds,
      'counting_rider_number', team_state.metadata ->> 'counting_rider_number',
      'counting_rider_id', team_state.metadata ->> 'counting_rider_id',
      'counting_rider_name', team_state.metadata ->> 'counting_rider_name'
    )
  from public.race_stage_team_states team_state
  left join public.clubs club
    on club.id = team_state.team_id
  where team_state.simulation_run_id = p_simulation_run_id
    and team_state.team_rank = 1
    and v_stage_format in ('team_time_trial', 'ttt');

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
    900003,
    null,
    null,
    'finish',
    'Stage winner',
    concat(
      coalesce(result.rider_name_snapshot, 'The fastest rider'),
      ' wins against the clock for ',
      coalesce(result.team_name_snapshot, 'their team'),
      ' in ',
      result.elapsed_seconds,
      ' seconds.'
    ),
    result.rider_id,
    result.team_id,
    result.rider_name_snapshot,
    result.team_name_snapshot,
    jsonb_build_object(
      'source', 'time_trial_finalizer_v1',
      'stage_format', v_stage_format,
      'elapsed_seconds', result.elapsed_seconds,
      'gap_seconds', result.gap_seconds
    )
  from public.race_stage_results result
  where result.stage_id = v_stage_id
    and result.rank = 1
    and v_stage_format in (
      'prologue',
      'individual_time_trial',
      'itt'
    );

  select count(*)
  into v_report_event_count
  from public.race_stage_report_events event
  where event.stage_id = v_stage_id
    and event.metadata ->> 'source' =
      'time_trial_finalizer_v1';

  /*
    ------------------------------------------------------------
    Incidents
    ------------------------------------------------------------
  */

  begin
    perform public.race_engine_write_incidents_v1(
      p_simulation_run_id
    );

    select count(*)
    into v_incident_count
    from public.race_stage_incidents incident
    where incident.simulation_run_id =
      p_simulation_run_id;

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'incidents',
        sqlerrm
      );
  end;

  /*
    ------------------------------------------------------------
    Point gates
    ------------------------------------------------------------

    TT / Prologue / TTT stages deliberately do not use road-style
    race_stage_points or race_stage_point_results.
  */

  v_point_result_count := 0;

  /*
    ------------------------------------------------------------
    Classifications
    ------------------------------------------------------------
  */

  begin
    perform public.race_engine_write_cumulative_classifications_v1(
      p_simulation_run_id
    );

    select count(*)
    into v_classification_count
    from public.race_classification_standings standing
    where standing.after_stage_id =
      v_stage_id;

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'classifications',
        sqlerrm
      );
  end;

  /*
    ------------------------------------------------------------
    Replay commentary
    ------------------------------------------------------------
  */

  begin
    with moved_event as (
      select
        event.id,
        row_number() over (
          order by
            event.event_order,
            event.created_at,
            event.id
        ) as event_row_number
      from public.race_stage_report_events event
      where event.stage_id = v_stage_id
        and event.event_order < 700000
        and coalesce(
          event.metadata ->> 'source',
          ''
        ) not in (
          'race_engine_replay_commentary_v1',
          'time_trial_finalizer_v1'
        )
        and coalesce(event.event_type, '') <> 'commentary'
    )
    update public.race_stage_report_events event
    set event_order =
      700000 + moved_event.event_row_number
    from moved_event
    where moved_event.id = event.id;

    perform public.race_engine_write_replay_commentary_v1(
      p_simulation_run_id
    );

    select count(*)
    into v_replay_commentary_count
    from public.race_stage_report_events event
    where event.stage_id = v_stage_id
      and (
        event.metadata ->> 'source' =
          'race_engine_replay_commentary_v1'
        or event.event_type = 'commentary'
      );

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'replay_commentary',
        sqlerrm
      );
  end;

  /*
    ------------------------------------------------------------
    Ranking awards
    ------------------------------------------------------------

    TTT v1 rule:
    Team time trial stages do not award rider/ranking points.
  */

  begin
    if v_stage_format in (
      'team_time_trial',
      'ttt'
    ) then
      delete from public.race_ranking_point_awards award
      where award.race_id = v_race_id
        and award.stage_id = v_stage_id;

      get diagnostics
        v_deleted_ranking_award_count = row_count;

      v_ranking_award_count := 0;
    else
      perform public.generate_race_ranking_point_awards_v1(
        v_race_id,
        v_stage_id,
        v_is_final_stage
      );

      select count(*)
      into v_ranking_award_count
      from public.race_ranking_point_awards award
      where award.race_id = v_race_id
        and award.stage_id = v_stage_id;
    end if;

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'ranking_awards',
        sqlerrm
      );
  end;

  /*
    ------------------------------------------------------------
    Prize awards and payment
    ------------------------------------------------------------
  */

  begin
    perform public.generate_race_prize_awards_v1(
      v_race_id,
      v_stage_id,
      v_is_final_stage
    );

    perform public.race_engine_pay_prize_awards_v1(
      v_race_id,
      v_stage_id
    );

    select count(*)
    into v_prize_award_count
    from public.race_prize_awards prize
    where prize.race_id = v_race_id
      and prize.stage_id = v_stage_id;

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'prize_awards',
        sqlerrm
      );
  end;

  /*
    ------------------------------------------------------------
    Fatigue
    ------------------------------------------------------------
  */

  begin
    perform public.race_engine_apply_stage_fatigue_v1(
      p_simulation_run_id
    );

  exception when others then
    v_component_errors :=
      v_component_errors || jsonb_build_object(
        'fatigue',
        sqlerrm
      );
  end;

  if v_component_errors <> '{}'::jsonb then
    v_finalization_status := 'completed_with_component_errors';
  end if;

  update public.race_stage_simulation_runs simulation_run
  set
    status = 'completed',
    result_summary_json =
      (
        coalesce(simulation_run.result_summary_json, '{}'::jsonb)
        - 'pending_components'
      )
      || jsonb_build_object(
        'time_trial_finalization',
        jsonb_build_object(
          'status', v_finalization_status,
          'finalized_at', now(),
          'stage_format', v_stage_format,
          'is_final_stage', v_is_final_stage,
          'report_event_count', v_report_event_count,
          'incident_count', v_incident_count,
          'point_result_count', v_point_result_count,
          'result_rule_update_count', v_result_rule_update_count,
          'deleted_stage_point_count', v_deleted_stage_point_count,
          'deleted_stage_point_result_count', v_deleted_stage_point_result_count,
          'deleted_ranking_award_count', v_deleted_ranking_award_count,
          'classification_count', v_classification_count,
          'replay_commentary_count', v_replay_commentary_count,
          'ranking_award_count', v_ranking_award_count,
          'prize_award_count', v_prize_award_count,
          'component_errors', v_component_errors
        )
      ),
    updated_at = now()
  where simulation_run.id =
    p_simulation_run_id;

  return jsonb_build_object(
    'status', v_finalization_status,
    'simulation_run_id', p_simulation_run_id,
    'race_id', v_race_id,
    'stage_id', v_stage_id,
    'stage_format', v_stage_format,
    'is_final_stage', v_is_final_stage,
    'report_event_count', v_report_event_count,
    'incident_count', v_incident_count,
    'point_result_count', v_point_result_count,
    'result_rule_update_count', v_result_rule_update_count,
    'deleted_stage_point_count', v_deleted_stage_point_count,
    'deleted_stage_point_result_count', v_deleted_stage_point_result_count,
    'deleted_ranking_award_count', v_deleted_ranking_award_count,
    'classification_count', v_classification_count,
    'replay_commentary_count', v_replay_commentary_count,
    'ranking_award_count', v_ranking_award_count,
    'prize_award_count', v_prize_award_count,
    'component_errors', v_component_errors
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_race_ranking_point_awards_v1(p_race_id uuid, p_after_stage_id uuid DEFAULT NULL::uuid, p_is_final boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_class_code text;
  v_race_format text;
  v_stage_id uuid;
begin
  if exists (
    select 1 from public.races r
    where r.id=p_race_id
      and coalesce((r.metadata->>'world_road_championship')::boolean,false)=true
  ) then
    delete from public.race_ranking_point_awards where race_id=p_race_id;
    return;
  end if;

  select
    coalesce(rer.race_class_code::text, r.category::text),
    coalesce(
      rcr.race_format::text,
      case when r.category::text like '2.%' then 'stage_race' else 'one_day' end
    )
  into v_race_class_code, v_race_format
  from public.races r
  left join public.race_entry_rules rer on rer.race_id = r.id
  left join public.race_category_rules rcr
    on rcr.race_class_code = coalesce(rer.race_class_code::text, r.category::text)
  where r.id = p_race_id;

  if v_race_class_code is null then
    raise exception 'Cannot generate ranking awards: race % has no class/category rule.', p_race_id;
  end if;

  if not exists (
    select 1 from public.race_ranking_point_rules rr
    where rr.race_class_code = v_race_class_code
  ) then
    raise exception 'Cannot generate ranking awards: missing race_ranking_point_rules for class %.', v_race_class_code;
  end if;

  if p_after_stage_id is not null then
    select s.id into v_stage_id
    from public.race_stages s
    where s.id = p_after_stage_id and s.race_id = p_race_id;

    if v_stage_id is null then
      raise exception 'Stage % does not belong to race %.', p_after_stage_id, p_race_id;
    end if;
  else
    select s.id into v_stage_id
    from public.race_stages s
    where s.race_id = p_race_id
    order by s.stage_number desc nulls last, s.stage_date desc nulls last, s.id
    limit 1;
  end if;

  if v_stage_id is null then
    raise exception 'Cannot generate ranking awards: race % has no stage.', p_race_id;
  end if;

  delete from public.race_ranking_point_awards a
  where a.race_id = p_race_id
    and a.stage_id = v_stage_id
    and a.source_type in ('stage_finish', 'leader_day', 'oneday_finish');

  if p_is_final then
    delete from public.race_ranking_point_awards a
    where a.race_id = p_race_id
      and a.source_type = 'final_gc';
  end if;

  if v_race_format = 'stage_race' then
    insert into public.race_ranking_point_awards (
      race_id, stage_id, source_type, classification_type, rank,
      rider_id, team_id, rider_points, team_points,
      display_name_snapshot, team_name_snapshot
    )
    select
      p_race_id, v_stage_id, 'stage_finish', null, sr.rank,
      sr.rider_id, sr.team_id, rr.points, rr.points,
      coalesce(sr.rider_name_snapshot, rd.display_name, sr.rider_id::text),
      coalesce(sr.team_name_snapshot, c.name, sr.team_id::text)
    from public.race_stage_results sr
    join public.race_ranking_point_rules rr
      on rr.race_class_code = v_race_class_code
     and rr.source_type = 'stage_finish'
     and rr.rank = sr.rank
    left join public.riders rd on rd.id = sr.rider_id
    left join public.clubs c on c.id = sr.team_id
    where sr.stage_id = v_stage_id
      and sr.rider_id is not null
      and sr.rank is not null
      and coalesce(lower(to_jsonb(sr)->>'status'), 'finished') not in (
        'dnf','dns','dsq','otl','abandoned','did_not_finish','did_not_start','disqualified'
      );

    insert into public.race_ranking_point_awards (
      race_id, stage_id, source_type, classification_type, rank,
      rider_id, team_id, rider_points, team_points,
      display_name_snapshot, team_name_snapshot
    )
    select
      p_race_id, v_stage_id, 'leader_day', 'general', cs.rank,
      cs.rider_id, cs.team_id, rr.points, rr.points,
      coalesce(cs.display_name_snapshot, rd.display_name, cs.rider_id::text),
      coalesce(cs.team_name_snapshot, c.name, cs.team_id::text)
    from public.race_classification_standings cs
    join public.race_ranking_point_rules rr
      on rr.race_class_code = v_race_class_code
     and rr.source_type = 'leader_day'
     and rr.rank = cs.rank
    left join public.riders rd on rd.id = cs.rider_id
    left join public.clubs c on c.id = cs.team_id
    where cs.race_id = p_race_id
      and cs.after_stage_id = v_stage_id
      and cs.rider_id is not null
      and coalesce(cs.entity_type::text, 'rider') = 'rider'
      and lower(cs.classification_type::text) in ('general','gc','overall')
      and cs.rank = 1;

    if p_is_final then
      insert into public.race_ranking_point_awards (
        race_id, stage_id, source_type, classification_type, rank,
        rider_id, team_id, rider_points, team_points,
        display_name_snapshot, team_name_snapshot
      )
      select
        p_race_id, v_stage_id, 'final_gc', 'general', cs.rank,
        cs.rider_id, cs.team_id, rr.points, rr.points,
        coalesce(cs.display_name_snapshot, rd.display_name, cs.rider_id::text),
        coalesce(cs.team_name_snapshot, c.name, cs.team_id::text)
      from public.race_classification_standings cs
      join public.race_ranking_point_rules rr
        on rr.race_class_code = v_race_class_code
       and rr.source_type = 'final_gc'
       and rr.rank = cs.rank
      left join public.riders rd on rd.id = cs.rider_id
      left join public.clubs c on c.id = cs.team_id
      where cs.race_id = p_race_id
        and cs.after_stage_id = v_stage_id
        and cs.rider_id is not null
        and coalesce(cs.entity_type::text, 'rider') = 'rider'
        and lower(cs.classification_type::text) in ('general','gc','overall')
        and cs.rank is not null;
    end if;
  else
    insert into public.race_ranking_point_awards (
      race_id, stage_id, source_type, classification_type, rank,
      rider_id, team_id, rider_points, team_points,
      display_name_snapshot, team_name_snapshot
    )
    select
      p_race_id, v_stage_id, 'oneday_finish', null, sr.rank,
      sr.rider_id, sr.team_id, rr.points, rr.points,
      coalesce(sr.rider_name_snapshot, rd.display_name, sr.rider_id::text),
      coalesce(sr.team_name_snapshot, c.name, sr.team_id::text)
    from public.race_stage_results sr
    join public.race_ranking_point_rules rr
      on rr.race_class_code = v_race_class_code
     and rr.source_type = 'oneday_finish'
     and rr.rank = sr.rank
    left join public.riders rd on rd.id = sr.rider_id
    left join public.clubs c on c.id = sr.team_id
    where sr.stage_id = v_stage_id
      and sr.rider_id is not null
      and sr.rank is not null
      and coalesce(lower(to_jsonb(sr)->>'status'), 'finished') not in (
        'dnf','dns','dsq','otl','abandoned','did_not_finish','did_not_start','disqualified'
      );
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_international_points_after_stage_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_id uuid;
  v_stage_number integer;
  v_max_stage_number integer;
  v_is_final boolean;
  v_before_rows integer;
  v_after_rows integer;
begin
  select
    s.race_id,
    s.stage_number
  into
    v_race_id,
    v_stage_number
  from public.race_stages s
  where s.id = p_stage_id;

  if v_race_id is null then
    raise exception 'Stage % not found.', p_stage_id;
  end if;

  select max(s.stage_number)
  into v_max_stage_number
  from public.race_stages s
  where s.race_id = v_race_id;

  v_is_final :=
    v_stage_number is not null
    and v_max_stage_number is not null
    and v_stage_number = v_max_stage_number;

  select count(*)::integer
  into v_before_rows
  from public.race_ranking_point_awards a
  where a.race_id = v_race_id;

  perform public.generate_race_ranking_point_awards_v1(
    v_race_id,
    p_stage_id,
    v_is_final
  );

  select count(*)::integer
  into v_after_rows
  from public.race_ranking_point_awards a
  where a.race_id = v_race_id;

  return jsonb_build_object(
    'race_id', v_race_id,
    'stage_id', p_stage_id,
    'stage_number', v_stage_number,
    'is_final_stage', v_is_final,
    'award_rows_before', v_before_rows,
    'award_rows_after', v_after_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_one_day_zero_stage_result_bonus_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.is_one_day_race_stage_v1(new.stage_id) then
    new.bonus_seconds := 0;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_one_day_zero_point_result_bonus_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.is_one_day_race_stage_v1(new.stage_id) then
    new.bonus_seconds_awarded := 0;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_one_day_zero_stage_point_bonus_def_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.is_one_day_race_stage_v1(new.stage_id) then
    new.time_bonus_seconds := '[]'::jsonb;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_award_race_development_progress_v1(p_simulation_run_id uuid, p_rider_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run_status text;
  v_inserted_count integer := 0;
  v_applied_count integer := 0;
  v_condition_count integer := 0;
begin
  if p_simulation_run_id is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'simulation_run_id_required'
    );
  end if;

  select run.status
  into v_run_status
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id;

  if coalesce(v_run_status, '') <> 'completed' then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'simulation_run_not_completed',
      'simulation_run_id', p_simulation_run_id,
      'run_status', v_run_status
    );
  end if;

  with base as (
    select
      run.id as simulation_run_id,
      run.race_id,
      run.stage_id,

      stage.stage_date::date as stage_date,
      stage.stage_number,
      coalesce(to_jsonb(stage)->>'stage_format', 'road_race') as stage_format,
      stage.terrain_type::text as terrain_type,
      stage.profile_type::text as profile_type,
      stage.distance_km::numeric as distance_km,
      coalesce(stage.elevation_gain_m, 0)::numeric as elevation_gain_m,

      state.rider_id,
      state.team_id,

      state.role_code::text as role_code,
      nullif(state.metadata->>'stage_role', '') as stage_role,
      nullif(state.metadata->>'stage_tactic', '') as stage_tactic,

      coalesce(state.stage_status::text, 'finished') as finish_status,
      coalesce(result.rank, state.finish_position)::integer as finish_rank,

      state.start_stamina::numeric as start_stamina,
      state.stamina_spent::numeric as stamina_spent,
      state.finish_stamina::numeric as finish_stamina,

      state.fatigue_before_stage::numeric as fatigue_before_stage,
      state.fatigue_gain::numeric as fatigue_gain,
      state.fatigue_after_stage::numeric as fatigue_after_stage,

      case
        when nullif(state.metadata->>'performance_score', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then nullif(state.metadata->>'performance_score', '')::numeric
        else null
      end as performance_score,

      case
        when nullif(state.metadata->>'stage_skill_score', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then nullif(state.metadata->>'stage_skill_score', '')::numeric
        else null
      end as stage_skill_score,

      case
        when nullif(state.metadata->>'command_performance_modifier', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then nullif(state.metadata->>'command_performance_modifier', '')::numeric
        else null
      end as command_performance_modifier,

      coalesce(
        case
          when nullif(to_jsonb(rider)->>'age_years', '') ~ '^[0-9]+$'
            then nullif(to_jsonb(rider)->>'age_years', '')::integer
          else null
        end,
        case
          when nullif(to_jsonb(rider)->>'age', '') ~ '^[0-9]+$'
            then nullif(to_jsonb(rider)->>'age', '')::integer
          else null
        end,
        case
          when nullif(to_jsonb(rider)->>'date_of_birth', '') is not null
               and nullif(to_jsonb(rider)->>'date_of_birth', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
            then extract(year from age(stage.stage_date::date, (to_jsonb(rider)->>'date_of_birth')::date))::integer
          else null
        end,
        25
      ) as age_years,

      coalesce(
        case
          when nullif(to_jsonb(rider)->>'potential', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then nullif(to_jsonb(rider)->>'potential', '')::numeric
          else null
        end,
        case
          when nullif(to_jsonb(rider)->>'potential_score', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then nullif(to_jsonb(rider)->>'potential_score', '')::numeric
          else null
        end,
        case
          when nullif(to_jsonb(rider)->>'potential_rating', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then nullif(to_jsonb(rider)->>'potential_rating', '')::numeric
          else null
        end,
        65
      ) as potential_score,

      state.metadata as source_metadata

    from public.race_stage_simulation_runs run
    join public.race_stages stage
      on stage.id = run.stage_id
    join public.race_stage_rider_states state
      on state.simulation_run_id = run.id
    left join public.race_stage_results result
      on result.stage_id = run.stage_id
     and result.rider_id = state.rider_id
    left join public.riders rider
      on rider.id = state.rider_id
    where run.id = p_simulation_run_id
      and (p_rider_id is null or state.rider_id = p_rider_id)
  ),

  calc as (
    select
      base.*,
      public.calculate_race_development_progress_v1(
        base.stage_format,
        base.terrain_type,
        base.profile_type,
        base.distance_km,
        base.stage_role,
        base.role_code,
        base.finish_rank,
        base.fatigue_gain,
        base.age_years,
        base.potential_score,
        base.finish_status
      ) as progress_calc,

      least(
        3.50,
        greatest(
          0.20,
          1.15
          * least(1.50, greatest(0.45, coalesce(base.distance_km, 120) / 150.0))
          * case
              when lower(coalesce(base.stage_format, '')) in (
                'individual_time_trial',
                'time_trial',
                'prologue',
                'team_time_trial'
              ) then 1.15
              when lower(coalesce(base.terrain_type, '')) like '%mountain%'
                or lower(coalesce(base.terrain_type, '')) like '%climb%'
                or lower(coalesce(base.profile_type, '')) like '%mountain%'
                or lower(coalesce(base.profile_type, '')) like '%climb%'
                then 1.35
              when lower(coalesce(base.terrain_type, '')) like '%hill%'
                or lower(coalesce(base.profile_type, '')) like '%hill%'
                or lower(coalesce(base.profile_type, '')) like '%puncheur%'
                then 1.20
              when lower(coalesce(base.terrain_type, '')) like '%flat%'
                or lower(coalesce(base.profile_type, '')) like '%flat%'
                then 0.85
              else 1.00
            end
          * case
              when lower(coalesce(base.finish_status, 'finished')) in ('finished', 'ok', 'completed') then 1.00
              when lower(coalesce(base.finish_status, '')) in ('dnf', 'abandoned', 'did_not_finish') then 0.25
              else 0.75
            end
        )
      )::numeric(8,3) as sharpness_delta_calc,

      case
        when coalesce(base.fatigue_after_stage, 0) >= 90 then 2.50
        when coalesce(base.fatigue_after_stage, 0) >= 80 then 1.50
        when coalesce(base.fatigue_after_stage, 0) >= 70 then 0.75
        else 0.00
      end::numeric(8,3) as overload_penalty_calc

    from base
  ),

  prepared_rows as (
    select
      calc.*,
      calc.progress_calc->'progress_json' as progress_json_calc,
      (calc.progress_calc->>'total_progress_points')::numeric(10,4) as total_progress_points_calc
    from calc
  ),

  inserted as (
    insert into public.rider_race_development_events (
      simulation_run_id,
      race_id,
      stage_id,
      rider_id,
      team_id,
      stage_date,
      stage_number,
      stage_format,
      terrain_type,
      profile_type,
      distance_km,
      elevation_gain_m,
      role_code,
      stage_role,
      stage_tactic,
      finish_status,
      finish_rank,
      start_stamina,
      stamina_spent,
      finish_stamina,
      fatigue_before_stage,
      fatigue_gain,
      fatigue_after_stage,
      performance_score,
      stage_skill_score,
      command_performance_modifier,
      age_years,
      potential_score,
      sharpness_delta,
      overload_penalty,
      progress_json,
      total_progress_points,
      metadata
    )
    select
      simulation_run_id,
      race_id,
      stage_id,
      rider_id,
      team_id,
      stage_date,
      stage_number,
      stage_format,
      terrain_type,
      profile_type,
      distance_km,
      elevation_gain_m,
      role_code,
      stage_role,
      stage_tactic,
      finish_status,
      finish_rank,
      start_stamina,
      stamina_spent,
      finish_stamina,
      fatigue_before_stage,
      fatigue_gain,
      fatigue_after_stage,
      performance_score,
      stage_skill_score,
      command_performance_modifier,
      age_years,
      potential_score,
      sharpness_delta_calc,
      overload_penalty_calc,
      progress_json_calc,
      total_progress_points_calc,
      jsonb_build_object(
        'source', 'race_engine_award_race_development_progress_v1',
        'formula_version', 'terrain_profile_combined_v2',
        'progress_calc', progress_calc,
        'source_metadata', coalesce(source_metadata, '{}'::jsonb)
      )
    from prepared_rows
    on conflict (simulation_run_id, rider_id) do nothing
    returning *
  ),

  unapplied as (
    select *
    from public.rider_race_development_events ev
    where ev.simulation_run_id = p_simulation_run_id
      and (p_rider_id is null or ev.rider_id = p_rider_id)
      and ev.applied_to_condition = false
  ),

  apply_condition as (
    insert into public.rider_race_condition (
      rider_id,
      race_sharpness,
      last_raced_on,
      total_race_days,
      last_stage_sharpness_delta,
      last_stage_overload_penalty,
      updated_at
    )
    select
      ev.rider_id,
      least(
        100,
        greatest(
          0,
          50 + sum(ev.sharpness_delta - ev.overload_penalty)
        )
      )::numeric(6,2) as race_sharpness,
      max(ev.stage_date) as last_raced_on,
      count(*)::integer as total_race_days,
      sum(ev.sharpness_delta)::numeric(8,3) as last_stage_sharpness_delta,
      sum(ev.overload_penalty)::numeric(8,3) as last_stage_overload_penalty,
      now() as updated_at
    from unapplied ev
    group by ev.rider_id
    on conflict (rider_id) do update
    set
      race_sharpness = least(
        100,
        greatest(
          0,
          rider_race_condition.race_sharpness
          + excluded.last_stage_sharpness_delta
          - excluded.last_stage_overload_penalty
        )
      ),
      last_raced_on = greatest(
        coalesce(rider_race_condition.last_raced_on, excluded.last_raced_on),
        excluded.last_raced_on
      ),
      total_race_days = rider_race_condition.total_race_days + excluded.total_race_days,
      last_stage_sharpness_delta = excluded.last_stage_sharpness_delta,
      last_stage_overload_penalty = excluded.last_stage_overload_penalty,
      updated_at = now()
    returning rider_id
  ),

  mark_applied as (
    update public.rider_race_development_events ev
    set
      applied_to_condition = true,
      updated_at = now()
    where ev.simulation_run_id = p_simulation_run_id
      and (p_rider_id is null or ev.rider_id = p_rider_id)
      and ev.applied_to_condition = false
    returning ev.rider_id
  )

  select
    (select count(*) from inserted),
    (select count(*) from mark_applied),
    (select count(*) from apply_condition)
  into
    v_inserted_count,
    v_applied_count,
    v_condition_count;

  return jsonb_build_object(
    'status', 'completed',
    'simulation_run_id', p_simulation_run_id,
    'rider_id', p_rider_id,
    'inserted_events', v_inserted_count,
    'applied_condition_events', v_applied_count,
    'condition_rows_touched', v_condition_count,
    'formula_version', 'terrain_profile_combined_v2'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.backfill_race_development_events_v1(p_max_runs integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run record;
  v_result jsonb;
  v_processed_runs integer := 0;
  v_inserted_events integer := 0;
  v_applied_events integer := 0;
begin
  for v_run in
    select run.id
    from public.race_stage_simulation_runs run
    where run.status = 'completed'
    order by coalesce(run.completed_at, run.started_at, run.created_at) desc nulls last, run.id desc
    limit greatest(1, coalesce(p_max_runs, 50))
  loop
    v_result := public.race_engine_award_race_development_progress_v1(
      v_run.id,
      null
    );

    v_processed_runs := v_processed_runs + 1;
    v_inserted_events := v_inserted_events + coalesce((v_result->>'inserted_events')::integer, 0);
    v_applied_events := v_applied_events + coalesce((v_result->>'applied_condition_events')::integer, 0);
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'processed_runs', v_processed_runs,
    'inserted_events', v_inserted_events,
    'applied_condition_events', v_applied_events
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_award_race_development_on_run_completed_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(new.status, '') = 'completed'
     and (
       tg_op = 'INSERT'
       or coalesce(old.status, '') is distinct from coalesce(new.status, '')
     )
  then
    perform public.race_engine_award_race_development_progress_v1(
      new.id,
      null
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_award_race_development_on_rider_state_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.race_engine_award_race_development_progress_v1(
    new.simulation_run_id,
    new.rider_id
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_race_development_progress_v1(p_stage_format text, p_terrain_type text, p_profile_type text, p_distance_km numeric, p_stage_role text, p_role_code text, p_finish_rank integer, p_fatigue_gain numeric, p_age_years integer, p_potential_score numeric, p_finish_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_format text := lower(coalesce(p_stage_format, 'road_race'));
  v_terrain text := lower(coalesce(p_terrain_type, ''));
  v_profile text := lower(coalesce(p_profile_type, ''));
  v_role text := lower(coalesce(p_stage_role, p_role_code, ''));

  v_completion_factor numeric := 1.0;
  v_distance_factor numeric := 1.0;
  v_terrain_factor numeric := 1.0;
  v_age_factor numeric := 1.0;
  v_potential_factor numeric := 1.0;
  v_base_progress numeric := 0;

  v_is_tt boolean := false;
  v_is_ttt boolean := false;
  v_is_flat boolean := false;
  v_is_hilly boolean := false;
  v_is_puncheur boolean := false;
  v_is_mountain boolean := false;
  v_is_sprint boolean := false;

  v_progress jsonb;
begin
  v_is_tt := v_stage_format in (
    'individual_time_trial',
    'time_trial',
    'prologue'
  );

  v_is_ttt := v_stage_format = 'team_time_trial';

  v_is_flat :=
    v_terrain like '%flat%'
    or v_profile like '%flat%'
    or v_profile like '%sprinter%'
    or v_profile like '%sprint%';

  v_is_hilly :=
    v_terrain like '%hill%'
    or v_profile like '%hill%'
    or v_profile like '%puncheur%'
    or v_profile like '%classic%';

  v_is_puncheur :=
    v_profile like '%puncheur%';

  v_is_mountain :=
    v_terrain like '%mountain%'
    or v_terrain like '%climb%'
    or v_profile like '%mountain%'
    or v_profile like '%climb%';

  v_is_sprint :=
    v_role like '%sprint%'
    or v_profile like '%sprint%'
    or v_profile like '%sprinter%';

  v_completion_factor :=
    case
      when lower(coalesce(p_finish_status, 'finished')) in ('finished', 'ok', 'completed') then 1.00
      when lower(coalesce(p_finish_status, '')) in ('dnf', 'abandoned', 'did_not_finish') then 0.25
      else 0.75
    end;

  v_distance_factor :=
    least(
      1.50,
      greatest(0.45, coalesce(p_distance_km, 120) / 150.0)
    );

  v_terrain_factor :=
    case
      when v_is_tt or v_is_ttt then 1.15
      when v_is_mountain then 1.35
      when v_is_hilly or v_is_puncheur then 1.20
      when v_is_flat then 0.85
      else 1.00
    end;

  v_age_factor :=
    case
      when coalesce(p_age_years, 25) <= 22 then 1.30
      when coalesce(p_age_years, 25) <= 27 then 1.00
      when coalesce(p_age_years, 25) <= 31 then 0.75
      when coalesce(p_age_years, 25) <= 35 then 0.45
      else 0.20
    end;

  v_potential_factor :=
    case
      when coalesce(p_potential_score, 65) >= 85 then 1.25
      when coalesce(p_potential_score, 65) >= 75 then 1.10
      when coalesce(p_potential_score, 65) >= 60 then 1.00
      else 0.85
    end;

  v_base_progress :=
    greatest(
      0.03,
      0.22
      * v_distance_factor
      * v_terrain_factor
      * v_completion_factor
      * v_age_factor
      * v_potential_factor
    );

  v_progress :=
    jsonb_build_object(
      'endurance',
        round((v_base_progress * case
          when v_is_mountain then 0.36
          when v_is_hilly or v_is_puncheur then 0.34
          when v_is_tt or v_is_ttt then 0.32
          else 0.30
        end)::numeric, 4),

      'resistance',
        round((v_base_progress * case
          when v_is_mountain then 0.28
          when v_is_hilly or v_is_puncheur then 0.24
          when coalesce(p_fatigue_gain, 0) >= 12 then 0.22
          else 0.16
        end)::numeric, 4),

      'recovery',
        round((v_base_progress * case
          when coalesce(p_fatigue_gain, 0) >= 12 then 0.12
          when coalesce(p_fatigue_gain, 0) >= 8 then 0.10
          else 0.05
        end)::numeric, 4),

      'flat',
        round((v_base_progress * case
          when v_is_flat then 0.34
          when v_is_hilly or v_is_puncheur then 0.16
          when v_is_tt or v_is_ttt then 0.18
          else 0.08
        end)::numeric, 4),

      'climbing',
        round((v_base_progress * case
          when v_is_mountain then 0.46
          when v_is_hilly or v_is_puncheur then 0.30
          else 0.04
        end)::numeric, 4),

      'time_trial',
        round((v_base_progress * case
          when v_is_tt then 0.55
          when v_is_ttt then 0.28
          else 0.02
        end)::numeric, 4),

      'sprint',
        round((v_base_progress * case
          when v_is_sprint then 0.30
          when v_is_flat then 0.16
          else 0.03
        end)::numeric, 4),

      'teamwork',
        round((v_base_progress * case
          when v_role like '%domestique%' then 0.30
          when v_role like '%helper%' then 0.30
          when v_role like '%lead%' then 0.26
          when v_role like '%train%' then 0.22
          when v_is_ttt then 0.24
          else 0.08
        end)::numeric, 4),

      'race_iq',
        round((v_base_progress * case
          when v_role like '%breakaway%' then 0.18
          when v_is_hilly or v_is_puncheur then 0.12
          when coalesce(p_finish_rank, 99999) <= 10 then 0.12
          else 0.06
        end)::numeric, 4),

      'morale',
        round((v_base_progress * case
          when coalesce(p_finish_rank, 99999) = 1 then 0.16
          when coalesce(p_finish_rank, 99999) <= 10 then 0.08
          else 0.01
        end)::numeric, 4)
    );

  return jsonb_build_object(
    'progress_json', v_progress,
    'total_progress_points', (
      select sum(value::numeric)
      from jsonb_each_text(v_progress)
    ),
    'base_progress', round(v_base_progress::numeric, 4),
    'distance_factor', round(v_distance_factor::numeric, 4),
    'terrain_factor', round(v_terrain_factor::numeric, 4),
    'age_factor', round(v_age_factor::numeric, 4),
    'potential_factor', round(v_potential_factor::numeric, 4),
    'completion_factor', round(v_completion_factor::numeric, 4),
    'detected_profile', jsonb_build_object(
      'is_flat', v_is_flat,
      'is_hilly', v_is_hilly,
      'is_puncheur', v_is_puncheur,
      'is_mountain', v_is_mountain,
      'is_tt', v_is_tt,
      'is_ttt', v_is_ttt,
      'is_sprint', v_is_sprint
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_race_development_progress_bank_v1(p_simulation_run_id uuid DEFAULT NULL::uuid, p_stage_id uuid DEFAULT NULL::uuid, p_rider_id uuid DEFAULT NULL::uuid, p_max_events integer DEFAULT 10000, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event_count integer := 0;
  v_progress_rows integer := 0;
  v_total_progress numeric := 0;
begin
  with target_events as (
    select ev.*
    from public.rider_race_development_events ev
    where (p_force = true or ev.applied_to_progress_bank = false)
      and (p_simulation_run_id is null or ev.simulation_run_id = p_simulation_run_id)
      and (p_stage_id is null or ev.stage_id = p_stage_id)
      and (p_rider_id is null or ev.rider_id = p_rider_id)
    order by ev.stage_date nulls last, ev.created_at, ev.id
    limit greatest(1, coalesce(p_max_events, 10000))
  ),
  progress_rows as (
    select
      ev.id as event_id,
      ev.rider_id,
      key as attribute_code,
      (
        greatest(0, value::numeric)
        * public.rider_potential_headroom_multiplier_v1(ev.rider_id)
      )::numeric as progress_points
    from target_events ev
    cross join lateral jsonb_each_text(coalesce(ev.progress_json, '{}'::jsonb))
    where key in (
      'sprint','climbing','time_trial','endurance','flat',
      'recovery','resistance','race_iq','teamwork'
    )
      and value ~ '^-?[0-9]+(\.[0-9]+)?$'
      and value::numeric <> 0
  ),
  upserted_bank as (
    insert into public.rider_attribute_progress_bank (
      rider_id,
      attribute_code,
      progress_points,
      updated_at,
      created_at
    )
    select
      pr.rider_id,
      pr.attribute_code,
      sum(pr.progress_points)::numeric,
      now(),
      now()
    from progress_rows pr
    group by pr.rider_id, pr.attribute_code
    on conflict (rider_id, attribute_code)
    do update
      set progress_points =
            public.rider_attribute_progress_bank.progress_points
            + excluded.progress_points,
          updated_at = now()
    returning rider_id, attribute_code, progress_points
  ),
  event_progress_summary as (
    select
      pr.event_id,
      jsonb_object_agg(
        pr.attribute_code,
        round(pr.progress_points::numeric, 4)
        order by pr.attribute_code
      ) as applied_progress_json,
      sum(pr.progress_points)::numeric(10,4) as applied_total_progress
    from progress_rows pr
    group by pr.event_id
  ),
  marked as (
    update public.rider_race_development_events ev
    set
      applied_to_progress_bank = true,
      progress_bank_applied_at = now(),
      progress_bank_progress_json =
        coalesce(eps.applied_progress_json, '{}'::jsonb),
      progress_bank_metadata =
        coalesce(ev.progress_bank_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'source', 'apply_race_development_progress_bank_v1',
          'applied_total_progress', coalesce(eps.applied_total_progress, 0),
          'applied_at', now(),
          'force', p_force,
          'skipped_attributes', jsonb_build_array('morale'),
          'potential_headroom_model', 'soft_ceiling_v1',
          'potential_headroom_multiplier',
            public.rider_potential_headroom_multiplier_v1(ev.rider_id)
        ),
      updated_at = now()
    from event_progress_summary eps
    where eps.event_id = ev.id
    returning ev.id, coalesce(eps.applied_total_progress, 0) as applied_total_progress
  )
  select
    (select count(*) from target_events),
    (select count(*) from progress_rows),
    coalesce((select sum(applied_total_progress) from marked), 0)
  into v_event_count, v_progress_rows, v_total_progress;

  return jsonb_build_object(
    'status', 'completed',
    'simulation_run_id', p_simulation_run_id,
    'stage_id', p_stage_id,
    'rider_id', p_rider_id,
    'force', p_force,
    'target_event_count', v_event_count,
    'progress_rows', v_progress_rows,
    'total_progress_added_to_bank', round(v_total_progress::numeric, 4),
    'potential_headroom_model', 'soft_ceiling_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_apply_race_development_progress_bank_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.applied_to_progress_bank = false then
    perform public.apply_race_development_progress_bank_v1(
      new.simulation_run_id,
      new.stage_id,
      new.rider_id,
      1,
      false
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_merge_duplicate_ranking_point_award_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if exists (
    select 1
    from public.race_ranking_point_awards existing
    where existing.race_id is not distinct from new.race_id
      and existing.stage_id is not distinct from new.stage_id
      and existing.source_type is not distinct from new.source_type
      and existing.rank is not distinct from new.rank
      and existing.team_id is not distinct from new.team_id
      and existing.rider_id is not distinct from new.rider_id
  ) then

    update public.race_ranking_point_awards existing
    set
      classification_type = coalesce(new.classification_type, existing.classification_type),
      rider_points = coalesce(new.rider_points, existing.rider_points),
      team_points = coalesce(new.team_points, existing.team_points),
      display_name_snapshot = coalesce(new.display_name_snapshot, existing.display_name_snapshot),
      team_name_snapshot = coalesce(new.team_name_snapshot, existing.team_name_snapshot)
    where existing.race_id is not distinct from new.race_id
      and existing.stage_id is not distinct from new.stage_id
      and existing.source_type is not distinct from new.source_type
      and existing.rank is not distinct from new.rank
      and existing.team_id is not distinct from new.team_id
      and existing.rider_id is not distinct from new.rider_id;

    return null;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_promote_tt_race_sharpness_metadata_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_input jsonb;
begin
  if new.metadata is null then
    return new;
  end if;

  v_input := coalesce(new.metadata->'input_metadata', '{}'::jsonb);

  if v_input->>'race_sharpness_engine_version' = '2026-06-19-phase-3c' then
    new.metadata :=
      new.metadata
      || jsonb_build_object(
        'race_sharpness_engine_applied',
          coalesce((v_input->>'race_sharpness_engine_applied')::boolean, true),

        'race_sharpness_engine_version',
          v_input->>'race_sharpness_engine_version',

        'race_sharpness',
          case
            when v_input ? 'race_sharpness'
              then to_jsonb((v_input->>'race_sharpness')::numeric)
            else '50'::jsonb
          end,

        'race_sharpness_tt_start_stamina_modifier',
          case
            when v_input ? 'race_sharpness_tt_start_stamina_modifier'
              then to_jsonb((v_input->>'race_sharpness_tt_start_stamina_modifier')::numeric)
            else '0'::jsonb
          end,

        'race_sharpness_tt_score_modifier',
          case
            when v_input ? 'race_sharpness_tt_score_modifier'
              then to_jsonb((v_input->>'race_sharpness_tt_score_modifier')::numeric)
            else '0'::jsonb
          end,

        'race_sharpness_tt_time_factor',
          case
            when v_input ? 'race_sharpness_tt_time_factor'
              then to_jsonb((v_input->>'race_sharpness_tt_time_factor')::numeric)
            else '1'::jsonb
          end,

        'race_sharpness_tt_effort_factor',
          case
            when v_input ? 'race_sharpness_tt_effort_factor'
              then to_jsonb((v_input->>'race_sharpness_tt_effort_factor')::numeric)
            else '1'::jsonb
          end
      );
  end if;

  return new;
end;
$function$
;

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

  with race_stage_result_base as (
    select
      rsr.*,
      to_jsonb(rsr) as rsr_json,
      coalesce(
        nullif(to_jsonb(rsr)->>'rider_id', ''),
        nullif(to_jsonb(rsr)->>'riderId', '')
      ) as resolved_rider_id_text,
      coalesce(
        nullif(to_jsonb(rsr)->>'team_id', ''),
        nullif(to_jsonb(rsr)->>'club_id', ''),
        nullif(to_jsonb(rsr)->>'teamId', ''),
        nullif(to_jsonb(rsr)->>'clubId', '')
      ) as resolved_team_id_text,
      coalesce(
        nullif(to_jsonb(rsr)->>'finish_position', ''),
        nullif(to_jsonb(rsr)->>'position', ''),
        nullif(to_jsonb(rsr)->>'rank', ''),
        nullif(to_jsonb(rsr)->>'place', '')
      ) as resolved_position_text
    from public.race_stage_results rsr
  ),
  published_stage_results as (
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
      coalesce(to_jsonb(s)->>'stage_format', to_jsonb(s)->>'terrain_type', 'road_race') as stage_format,
      coalesce(
        nullif(rb.rsr_json->>'rider_name_snapshot', ''),
        to_jsonb(rd)->>'display_name',
        to_jsonb(rd)->>'full_name',
        nullif(concat_ws(' ', to_jsonb(rd)->>'first_name', to_jsonb(rd)->>'last_name'), ''),
        rb.resolved_rider_id_text,
        'Unknown rider'
      ) as rider_name,
      coalesce(
        nullif(rb.rsr_json->>'team_name_snapshot', ''),
        c.name,
        to_jsonb(c)->>'club_name',
        'Unknown team'
      ) as team_name
    from race_stage_result_base rb
    join public.race_stages s
      on s.id = rb.stage_id
    join public.races r
      on r.id = s.race_id
    left join public.riders rd
      on rd.id::text = rb.resolved_rider_id_text
    left join public.clubs c
      on c.id::text = rb.resolved_team_id_text
    where rb.resolved_position_text ~ '^\d+$'
      and rb.resolved_position_text::integer = 1
      and s.stage_date <= v_current_game_date
      and s.stage_date >= (v_current_game_date - 14)
    order by s.id, s.stage_date desc
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
;

CREATE OR REPLACE FUNCTION public.get_overview_squad_pulse_v1(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current_game_date date;
  v_result jsonb;
begin
  select public.get_current_game_date_date()
  into v_current_game_date;

  if v_current_game_date is null then
    v_current_game_date := current_date;
  end if;

  with club_scope as (
    select p_club_id as club_id
    union
    select c.id
    from public.clubs c
    where c.parent_club_id = p_club_id
      and c.club_type = 'developing'
  ),
  squad as (
    select distinct
      r.id,
      coalesce(r.fatigue, 0)::numeric as fatigue,
      coalesce(r.morale, 50)::numeric as morale,
      lower(coalesce(r.availability_status, 'fit')) as availability_status,
      r.unavailable_until,
      lower(coalesce(r.unavailable_reason, '')) as unavailable_reason,
      r.contract_expires_at
    from club_scope cs
    join public.club_riders cr
      on cr.club_id = cs.club_id
    join public.riders r
      on r.id = cr.rider_id
  ),
  classified as (
    select
      *,
      (
        availability_status in ('sick', 'ill', 'illness')
        or unavailable_reason like '%sick%'
        or unavailable_reason like '%ill%'
      )
      and (unavailable_until is null or unavailable_until >= v_current_game_date) as is_sick,
      (
        availability_status in ('injured', 'injury')
        or unavailable_reason like '%injur%'
      )
      and (unavailable_until is null or unavailable_until >= v_current_game_date) as is_injured,
      (
        unavailable_until is null
        or unavailable_until < v_current_game_date
      )
      and availability_status in ('fit', 'available', 'active', '') as is_available
    from squad
  )
  select jsonb_build_object(
    'fitness', coalesce(round(avg(greatest(0, 100 - fatigue)))::integer, 0),
    'morale', coalesce(round(avg(morale))::integer, 0),
    'readiness', coalesce(
      round(avg(
        case
          when is_sick or is_injured then 35
          when not is_available then 55
          else greatest(0, 100 - fatigue)
        end
      ))::integer,
      0
    ),
    'form', '+0',
    'availableRiders', count(*) filter (where is_available and not is_sick and not is_injured),
    'injured', count(*) filter (where is_injured),
    'sick', count(*) filter (where is_sick),
    'notFullyFit', count(*) filter (
      where fatigue >= 50
         or is_sick
         or is_injured
         or not is_available
    ),
    'expiringContracts', count(*) filter (
      where contract_expires_at is not null
        and contract_expires_at <= v_current_game_date + interval '60 days'
    )
  )
  into v_result
  from classified;

  return coalesce(
    v_result,
    jsonb_build_object(
      'fitness', 0,
      'morale', 0,
      'readiness', 0,
      'form', '+0',
      'availableRiders', 0,
      'injured', 0,
      'sick', 0,
      'notFullyFit', 0,
      'expiringContracts', 0
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_overview_season_snapshot_v1(p_club_id uuid, p_season_year integer DEFAULT 2000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current_game_date date;
  v_result jsonb;
begin
  select public.get_current_game_date_date()
  into v_current_game_date;

  if v_current_game_date is null then
    v_current_game_date := current_date;
  end if;

  with club_scope as (
    select p_club_id as club_id
    union
    select c.id
    from public.clubs c
    where c.parent_club_id = p_club_id
      and c.club_type = 'developing'
  ),
  team_riders as (
    select distinct cr.rider_id
    from public.club_riders cr
    join club_scope cs on cs.club_id = cr.club_id
  ),
  stage_result_text as (
    select
      rsr.stage_id,
      coalesce(
        nullif(to_jsonb(rsr)->>'rider_id', ''),
        nullif(to_jsonb(rsr)->>'riderId', '')
      ) as rider_id_text,
      coalesce(
        nullif(to_jsonb(rsr)->>'finish_position', ''),
        nullif(to_jsonb(rsr)->>'position', ''),
        nullif(to_jsonb(rsr)->>'rank', ''),
        nullif(to_jsonb(rsr)->>'place', '')
      ) as position_text,
      coalesce(
        nullif(to_jsonb(rsr)->>'points', ''),
        nullif(to_jsonb(rsr)->>'finish_points', ''),
        nullif(to_jsonb(rsr)->>'stage_points', '')
      ) as result_points_text
    from public.race_stage_results rsr
  ),
  team_stage_results as (
    select
      r.id as race_id,
      s.id as stage_id,
      s.stage_date,
      case
        when srt.position_text ~ '^\d+$' then srt.position_text::integer
        else null
      end as position
    from stage_result_text srt
    join public.race_stages s
      on s.id = srt.stage_id
    join public.races r
      on r.id = s.race_id
    join team_riders tr
      on tr.rider_id::text = srt.rider_id_text
    where extract(year from s.stage_date)::integer = coalesce(p_season_year, 2000)
      and s.stage_date <= v_current_game_date
  ),
  ranking_text as (
    select
      coalesce(
        nullif(to_jsonb(rrpa)->>'rider_id', ''),
        nullif(to_jsonb(rrpa)->>'riderId', '')
      ) as rider_id_text,
      coalesce(
        nullif(to_jsonb(rrpa)->>'team_id', ''),
        nullif(to_jsonb(rrpa)->>'club_id', ''),
        nullif(to_jsonb(rrpa)->>'teamId', ''),
        nullif(to_jsonb(rrpa)->>'clubId', '')
      ) as team_id_text,
      coalesce(
        nullif(to_jsonb(rrpa)->>'source_stage_id', ''),
        nullif(to_jsonb(rrpa)->>'stage_id', ''),
        nullif(to_jsonb(rrpa)->>'stageId', '')
      ) as stage_id_text,
      coalesce(
        nullif(to_jsonb(rrpa)->>'source_race_id', ''),
        nullif(to_jsonb(rrpa)->>'race_id', ''),
        nullif(to_jsonb(rrpa)->>'raceId', '')
      ) as race_id_text,
      coalesce(
        nullif(to_jsonb(rrpa)->>'rider_points', ''),
        nullif(to_jsonb(rrpa)->>'team_points', ''),
        nullif(to_jsonb(rrpa)->>'points', '')
      ) as points_text
    from public.race_ranking_point_awards rrpa
  ),
  team_ranking_points as (
    select
      sum(
        case
          when rt.points_text ~ '^-?\d+(\.\d+)?$' then rt.points_text::numeric
          else 0
        end
      )::integer as points
    from ranking_text rt
    left join public.race_stages s
      on s.id::text = rt.stage_id_text
    where (
        rt.rider_id_text in (select rider_id::text from team_riders)
        or rt.team_id_text in (select club_id::text from club_scope)
      )
      and (
        s.stage_date is null
        or (
          extract(year from s.stage_date)::integer = coalesce(p_season_year, 2000)
          and s.stage_date <= v_current_game_date
        )
      )
  ),
  classification_text as (
    select
      coalesce(
        nullif(to_jsonb(rcs)->>'rider_id', ''),
        nullif(to_jsonb(rcs)->>'riderId', '')
      ) as rider_id_text,
      lower(coalesce(
        nullif(to_jsonb(rcs)->>'classification_type', ''),
        nullif(to_jsonb(rcs)->>'classification', ''),
        nullif(to_jsonb(rcs)->>'ranking_type', ''),
        nullif(to_jsonb(rcs)->>'type', '')
      )) as classification_type,
      coalesce(
        nullif(to_jsonb(rcs)->>'position', ''),
        nullif(to_jsonb(rcs)->>'rank', ''),
        nullif(to_jsonb(rcs)->>'standing_position', '')
      ) as position_text,
      coalesce(
        nullif(to_jsonb(rcs)->>'after_stage_id', ''),
        nullif(to_jsonb(rcs)->>'stage_id', ''),
        nullif(to_jsonb(rcs)->>'stageId', '')
      ) as stage_id_text
    from public.race_classification_standings rcs
  ),
  team_classifications as (
    select
      ct.classification_type,
      case
        when ct.position_text ~ '^\d+$' then ct.position_text::integer
        else null
      end as position
    from classification_text ct
    join public.race_stages s
      on s.id::text = ct.stage_id_text
    where ct.rider_id_text in (select rider_id::text from team_riders)
      and extract(year from s.stage_date)::integer = coalesce(p_season_year, 2000)
      and s.stage_date <= v_current_game_date
  ),
  aggregate_values as (
    select
      count(distinct race_id)::integer as races,
      count(distinct stage_id)::integer as stages,
      count(*) filter (where position = 1)::integer as wins,
      count(*) filter (where position between 1 and 3)::integer as podiums,
      count(*) filter (where position between 1 and 10)::integer as top10s,
      (
        select coalesce(points, 0)
        from team_ranking_points
      )::integer as international_points,
      (
        select count(*)::integer
        from team_classifications
        where position = 1
          and classification_type not in ('general', 'gc', 'overall')
      ) as jerseys,
      (
        select min(position)::integer
        from team_classifications
        where classification_type in ('general', 'gc', 'overall')
      ) as best_gc
    from team_stage_results
  )
  select jsonb_build_object(
    'races', coalesce(races, 0),
    'stages', coalesce(stages, 0),
    'internationalPoints', coalesce(international_points, 0),
    'wins', coalesce(wins, 0),
    'podiums', coalesce(podiums, 0),
    'top10s', coalesce(top10s, 0),
    'jerseys', coalesce(jerseys, 0),
    'bestGc', best_gc
  )
  into v_result
  from aggregate_values;

  return coalesce(
    v_result,
    jsonb_build_object(
      'races', 0,
      'stages', 0,
      'internationalPoints', 0,
      'wins', 0,
      'podiums', 0,
      'top10s', 0,
      'jerseys', 0,
      'bestGc', null
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_due_race_plan_deadline_notifications_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Retired from Core.
  -- Paid Sports Director / sd_startlist_deadline_alert owns this information.
  return jsonb_build_object(
    'status', 'retired_to_staff_advisory',
    'inserted_notifications', 0,
    'owner', 'sport_director',
    'replacement_report_code', 'sd_startlist_deadline_alert'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_due_missing_stage_plan_notifications_v1()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
begin
  -- Retired from Core.
  -- Paid Sports Director / sd_stage_plans_missing owns this information.
  return 0;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_due_game_notifications_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_app jsonb:=null; v_prep jsonb:=null; v_stage jsonb:=null; v_health jsonb:=null; v_startlist jsonb:=null;
  e_app text:=null; e_prep text:=null; e_stage text:=null; e_health text:=null; e_startlist text:=null;
  v_cleanup int:=0;
begin
  begin v_app:=public.process_race_application_window_notifications_v1(); exception when others then e_app:=sqlerrm; end;
  begin v_prep:=public.process_race_preparation_daily_report_v1(); exception when others then e_prep:=sqlerrm; end;
  begin v_stage:=public.process_stage_planning_daily_report_v1(); exception when others then e_stage:=sqlerrm; end;
  begin v_health:=public.process_rider_health_daily_report_v1(); exception when others then e_health:=sqlerrm; end;
  begin v_startlist:=public.process_due_race_startlist_deadlines_v1(); exception when others then e_startlist:=sqlerrm; end;
  begin v_cleanup:=public.cleanup_missed_startlist_race_notifications_v1(); exception when others then v_cleanup:=0; end;
  return jsonb_build_object('status',case when e_app is null and e_prep is null and e_stage is null and e_health is null and e_startlist is null then 'completed' else 'completed_with_errors' end,
    'race_application_daily',v_app,'race_application_error',e_app,'race_preparation_daily',v_prep,'race_preparation_error',e_prep,
    'stage_planning_daily',v_stage,'stage_planning_error',e_stage,'rider_health_daily',v_health,'rider_health_error',e_health,
    'startlist_deadline_processing',v_startlist,'startlist_deadline_error',e_startlist,'missed_startlist_notifications_cleaned_up',v_cleanup,'processed_at',now());
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_duplicate_stage_plan_lock_notifications_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_deleted_count integer := 0;
begin
  with ranked as (
    select
      n.id as notification_id,
      row_number() over (
        partition by
          nt.code,
          coalesce(un.user_id::text, 'no-user'),
          coalesce(n.payload_json->>'race_id', ''),
          coalesce(n.payload_json->>'stage_id', ''),
          coalesce(n.payload_json->>'club_id', ''),
          coalesce(n.payload_json->>'owner_club_id', '')
        order by n.id asc
      ) as rn
    from public.notifications n
    join public.notification_types nt
      on nt.id = n.type_id
    left join public.user_notifications un
      on un.notification_id = n.id
    where nt.code = 'STAGE_PLAN_LOCK_REMINDER'
      and coalesce(n.payload_json->>'stage_id', '') <> ''
  ),
  duplicates as (
    select notification_id
    from ranked
    where rn > 1
  ),
  deleted_user_notifications as (
    delete from public.user_notifications un
    using duplicates d
    where un.notification_id = d.notification_id
    returning un.notification_id
  ),
  deleted_notifications as (
    delete from public.notifications n
    using duplicates d
    where n.id = d.notification_id
    returning n.id
  )
  select count(*)::integer
  into v_deleted_count
  from deleted_notifications;

  return coalesce(v_deleted_count, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_duplicate_stage_plan_lock_notifications_v2()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_deleted_count integer := 0;
begin
  with notification_users as (
    select
      un.notification_id,
      string_agg(un.user_id::text, ',' order by un.user_id::text) as user_key
    from public.user_notifications un
    group by un.notification_id
  ),
  ranked as (
    select
      n.id as notification_id,
      row_number() over (
        partition by
          coalesce(nu.user_key, 'no-user'),
          coalesce(n.payload_json->>'race_id', ''),
          coalesce(n.payload_json->>'stage_id', '')
        order by n.id asc
      ) as rn
    from public.notifications n
    join public.notification_types nt
      on nt.id = n.type_id
    left join notification_users nu
      on nu.notification_id = n.id
    where nt.code = 'STAGE_PLAN_LOCK_REMINDER'
      and coalesce(n.payload_json->>'race_id', '') <> ''
      and coalesce(n.payload_json->>'stage_id', '') <> ''
  ),
  duplicates as (
    select notification_id
    from ranked
    where rn > 1
  ),
  deleted_user_notifications as (
    delete from public.user_notifications un
    using duplicates d
    where un.notification_id = d.notification_id
    returning un.notification_id
  ),
  deleted_notifications as (
    delete from public.notifications n
    using duplicates d
    where n.id = d.notification_id
    returning n.id
  )
  select count(*)::integer
  into v_deleted_count
  from deleted_notifications;

  return coalesce(v_deleted_count, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_duplicate_stage_plan_lock_notifications_v3()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_deleted_count integer := 0;
begin
  with lock_rows as (
    select
      n.id as notification_id,
      n.created_at,
      coalesce(n.payload_json->>'race_id', '') as race_id,
      coalesce(n.payload_json->>'stage_id', '') as stage_id,
      coalesce(n.payload_json->>'club_id', '') as club_id,
      coalesce(n.payload_json->>'owner_club_id', '') as owner_club_id,
      bool_or(lower(coalesce(un.status, 'unread')) = 'unread') as has_unread,
      min(un.user_id::text) as user_id_text
    from public.notifications n
    join public.notification_types nt
      on nt.id = n.type_id
    left join public.user_notifications un
      on un.notification_id = n.id
    where nt.code = 'STAGE_PLAN_LOCK_REMINDER'
      and coalesce(n.payload_json->>'race_id', '') <> ''
      and coalesce(n.payload_json->>'stage_id', '') <> ''
    group by
      n.id,
      n.created_at,
      coalesce(n.payload_json->>'race_id', ''),
      coalesce(n.payload_json->>'stage_id', ''),
      coalesce(n.payload_json->>'club_id', ''),
      coalesce(n.payload_json->>'owner_club_id', '')
  ),
  ranked as (
    select
      lr.*,
      row_number() over (
        partition by
          lr.race_id,
          lr.stage_id,
          coalesce(nullif(lr.owner_club_id, ''), nullif(lr.club_id, ''), ''),
          coalesce(lr.user_id_text, '')
        order by
          case when lr.has_unread then 0 else 1 end,
          lr.notification_id asc
      ) as keep_rank
    from lock_rows lr
  ),
  duplicates as (
    select notification_id
    from ranked
    where keep_rank > 1
  ),
  deleted_user_notifications as (
    delete from public.user_notifications un
    using duplicates d
    where un.notification_id = d.notification_id
    returning un.notification_id
  ),
  deleted_notifications as (
    delete from public.notifications n
    using duplicates d
    where n.id = d.notification_id
    returning n.id
  )
  select count(*)::integer
  into v_deleted_count
  from deleted_notifications;

  return coalesce(v_deleted_count, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_duplicate_stage_plan_lock_notifications_v4()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_deleted_count integer := 0;
begin
  with lock_user_rows as (
    select
      n.id as notification_id,
      un.user_id,
      lower(coalesce(un.status, 'unread')) as user_notification_status,
      coalesce(n.payload_json->>'race_id', '') as race_id,
      coalesce(n.payload_json->>'stage_id', '') as stage_id
    from public.notifications n
    join public.notification_types nt
      on nt.id = n.type_id
    join public.user_notifications un
      on un.notification_id = n.id
    where nt.code = 'STAGE_PLAN_LOCK_REMINDER'
      and coalesce(n.payload_json->>'race_id', '') <> ''
      and coalesce(n.payload_json->>'stage_id', '') <> ''
  ),
  ranked as (
    select
      lur.*,
      row_number() over (
        partition by lur.user_id, lur.race_id, lur.stage_id
        order by
          case when lur.user_notification_status = 'unread' then 0 else 1 end,
          lur.notification_id asc
      ) as keep_rank
    from lock_user_rows lur
  ),
  duplicates as (
    select notification_id
    from ranked
    where keep_rank > 1
  ),
  deleted_user_notifications as (
    delete from public.user_notifications un
    using duplicates d
    where un.notification_id = d.notification_id
    returning un.notification_id
  ),
  deleted_notifications as (
    delete from public.notifications n
    using duplicates d
    where n.id = d.notification_id
    returning n.id
  )
  select count(*)::integer
  into v_deleted_count
  from deleted_notifications;

  return coalesce(v_deleted_count, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_due_race_preparation_notifications_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return public.process_due_game_notifications_v1();
end;
$function$
;

CREATE OR REPLACE FUNCTION public._get_club_balance_tier_key(p_club_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tier text;
  v_club_type text;
begin
  select
    lower(coalesce(c.club_tier::text, 'amateur')),
    lower(coalesce(c.club_type::text, 'main'))
  into v_tier, v_club_type
  from public.clubs c
  where c.id = p_club_id;

  if v_club_type = 'developing' then
    return 'developing_u23';
  end if;

  if v_tier in ('worldteam', 'world_team', 'world') then
    return 'worldteam';
  elsif v_tier in ('proteam', 'pro_team', 'pro') then
    return 'proteam';
  elsif v_tier in ('continental') then
    return 'continental';
  else
    return 'amateur';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._clubs_before_insert_set_starting_cash_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tier_key text;
  v_starting_cash bigint;
begin
  if coalesce(new.is_ai, false) = true or new.owner_user_id is null then
    return new;
  end if;

  if lower(coalesce(new.club_type::text, 'main')) = 'developing' then
    v_tier_key := 'developing_u23';
  else
    v_tier_key :=
      case lower(coalesce(new.club_tier::text, 'amateur'))
        when 'worldteam' then 'worldteam'
        when 'world_team' then 'worldteam'
        when 'world' then 'worldteam'
        when 'proteam' then 'proteam'
        when 'pro_team' then 'proteam'
        when 'pro' then 'proteam'
        when 'continental' then 'continental'
        else 'amateur'
      end;
  end if;

  select starting_cash_user
  into v_starting_cash
  from public.team_tier_balance_profiles
  where tier_key = v_tier_key;

  new.cash_balance := coalesce(v_starting_cash, 0);

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_new_club_defaults_v1(p_club_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.club_team_policies (
    club_id,
    flight_class,
    hotel_level,
    ground_transport,
    logistics_support_level,
    team_vehicle_policy,
    rider_housing_support,
    nutrition_support_level,
    recovery_support_level,
    staff_equipment_level,
    staff_accommodation_level,
    rider_bonus_plan,
    staff_bonus_plan
  )
  values (
    p_club_id,
    'economy',
    'budget',
    'standard_vans',
    'none',
    'none',
    'none',
    'none',
    'none',
    'basic',
    'shared',
    'none',
    'none'
  )
  on conflict (club_id) do nothing;

  insert into public.club_infrastructure (
    club_id,
    hq_level,
    training_center_level,
    medical_center_level,
    scouting_level,
    equipment_level,
    youth_academy_level,
    mechanics_workshop_level,
    team_car_fleet_quantity,
    team_bus_quantity,
    equipment_van_quantity,
    logistics_truck_quantity,
    mobile_workshop_quantity,
    medical_van_quantity
  )
  values (
    p_club_id,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
  )
  on conflict (club_id) do nothing;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._clubs_after_insert_new_team_setup_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.apply_new_club_creation_balance_v1(new.id, false);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._apply_new_club_starting_cash_v1(p_club_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_ai boolean;
  v_owner_user_id uuid;
  v_tier_key text;
  v_starting_cash bigint := 0;
  v_current_cash numeric := 0;
  v_missing_amount bigint := 0;
  v_tx uuid;
begin
  select
    coalesce(c.is_ai, false),
    c.owner_user_id,
    coalesce(c.cash_balance, 0)
  into
    v_is_ai,
    v_owner_user_id,
    v_current_cash
  from public.clubs c
  where c.id = p_club_id;

  -- AI teams do not receive real finance starting capital.
  if v_is_ai = true or v_owner_user_id is null then
    return;
  end if;

  v_tier_key := public._get_club_balance_tier_key(p_club_id);

  select coalesce(tbp.starting_cash_user, 0)
  into v_starting_cash
  from public.team_tier_balance_profiles tbp
  where tbp.tier_key = v_tier_key;

  v_missing_amount := greatest(0, v_starting_cash - floor(v_current_cash)::bigint);

  if v_missing_amount <= 0 then
    return;
  end if;

  if to_regprocedure('public.finance_credit_to_club(uuid,bigint,text,text,text,jsonb)') is null then
    raise exception 'Missing required finance helper public.finance_credit_to_club(uuid,bigint,text,text,text,jsonb).';
  end if;

  /*
    Mark this as internal finance operation for SECURITY DEFINER flow.
    finance_credit_to_club then resolves the club owner as created_by.
  */
  perform set_config('finance.internal', '1', true);

  select public.finance_credit_to_club(
    p_club_id,
    v_missing_amount,
    'new_club_bonus',
    'TREASURY',
    'new_club_starting_cash_delta_v1:' || p_club_id::text || ':' || v_tier_key || ':' || v_starting_cash::text,
    jsonb_build_object(
      'reason', 'new_club_starting_cash_delta',
      'club_id', p_club_id,
      'tier_key', v_tier_key,
      'expected_starting_cash', v_starting_cash,
      'cash_before_delta', v_current_cash,
      'delta_amount', v_missing_amount
    )
  )
  into v_tx;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_overview_active_operations_v1(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb := '[]'::jsonb;
begin
  if p_club_id is null then
    return '[]'::jsonb;
  end if;

  with pending_jobs as (
    select
      j.id,
      j.club_id,
      j.job_type,
      j.target_key,
      j.status,
      j.facility_target_level,
      j.asset_quantity,
      j.asset_level,
      j.cost_cash,
      j.started_game_date,
      j.complete_game_date,
      j.duration_game_days,
      j.complete_at,
      j.created_at,
      coalesce(j.metadata, '{}'::jsonb) as metadata
    from public.club_infrastructure_jobs j
    where j.club_id = p_club_id
      and lower(coalesce(j.status::text, '')) = 'pending'
    order by
      j.complete_game_date asc nulls last,
      j.complete_at asc nulls last,
      j.created_at asc nulls last
    limit 6
  ),
  labelled as (
    select
      pj.*,
      case pj.target_key
        when 'hq' then 'Club House'
        when 'club_house' then 'Club House'
        when 'training_center' then 'Training Center'
        when 'medical_center' then 'Medical Center'
        when 'scouting' then 'Scouting Office'
        when 'scouting_office' then 'Scouting Office'
        when 'youth_academy' then 'Youth Academy'
        when 'mechanics_workshop' then 'Mechanics Workshop'
        when 'team_car' then coalesce(nullif(pj.metadata->>'asset_name', ''), 'Team Car Lv ' || coalesce(pj.asset_level::text, '?'))
        when 'team_bus' then coalesce(nullif(pj.metadata->>'asset_name', ''), 'Team Bus Lv ' || coalesce(pj.asset_level::text, '?'))
        when 'equipment_van' then coalesce(nullif(pj.metadata->>'asset_name', ''), 'Equipment Van Lv ' || coalesce(pj.asset_level::text, '?'))
        when 'mobile_workshop' then coalesce(nullif(pj.metadata->>'asset_name', ''), 'Mobile Workshop Lv ' || coalesce(pj.asset_level::text, '?'))
        when 'medical_van' then coalesce(nullif(pj.metadata->>'asset_name', ''), 'Medical Van Lv ' || coalesce(pj.asset_level::text, '?'))
        else initcap(replace(coalesce(pj.target_key, 'Operation'), '_', ' '))
      end as display_name,
      case
        when pj.complete_game_date is not null then
          'Season '
          || greatest(1, extract(year from pj.complete_game_date)::int - 1999)::text
          || ' - '
          || to_char(pj.complete_game_date, 'FMDD Mon')
        else '—'
      end as complete_label,
      case
        when pj.cost_cash is not null then '$' || to_char(pj.cost_cash, 'FM999G999G999G999')
        else '—'
      end as cost_label
    from pending_jobs pj
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', 'infrastructure-job:' || id::text,
        'title', case
          when job_type = 'facility_upgrade' then display_name || ' upgrade'
          when job_type = 'asset_delivery' then 'Asset delivery: ' || display_name
          else display_name
        end,
        'subtitle', case
          when job_type = 'facility_upgrade' then
            'Upgrading to Level ' || coalesce(facility_target_level::text, '?') || '. Completes ' || complete_label || '.'
          when job_type = 'asset_delivery' then
            'Pending delivery' || case when coalesce(asset_quantity, 1) > 1 then ' x' || asset_quantity::text else '' end || '. Completes ' || complete_label || '.'
          else
            'Active infrastructure operation. Completes ' || complete_label || '.'
        end,
        'summary', case
          when job_type = 'facility_upgrade' then
            'Upgrading to Level ' || coalesce(facility_target_level::text, '?') || '. Completes ' || complete_label || '.'
          when job_type = 'asset_delivery' then
            'Pending delivery' || case when coalesce(asset_quantity, 1) > 1 then ' x' || asset_quantity::text else '' end || '. Completes ' || complete_label || '.'
          else
            'Active infrastructure operation. Completes ' || complete_label || '.'
        end,
        'status', case
          when job_type = 'facility_upgrade' then 'Upgrade'
          when job_type = 'asset_delivery' then 'Delivery'
          else initcap(replace(coalesce(job_type, 'active'), '_', ' '))
        end,
        'statusLabel', case
          when job_type = 'facility_upgrade' then 'Upgrade'
          when job_type = 'asset_delivery' then 'Delivery'
          else initcap(replace(coalesce(job_type, 'active'), '_', ' '))
        end,
        'href', '#/dashboard/infrastructure',
        'metrics', jsonb_build_array(
          jsonb_build_object('label', 'Completes', 'value', complete_label),
          jsonb_build_object('label', 'Duration', 'value', coalesce(duration_game_days::text || ' game days', '—')),
          jsonb_build_object('label', 'Cost paid', 'value', cost_label)
        )
      )
      order by complete_game_date asc nulls last, complete_at asc nulls last, created_at asc nulls last
    ),
    '[]'::jsonb
  )
  into v_result
  from labelled;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_new_club_creation_balance_v1(p_club_id uuid, p_apply_cash boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tier_key text;
  v_starting_cash bigint := 0;
  v_cash_balance numeric := 0;
  v_generated_riders int := 0;
  v_domestic_riders int := 0;
  v_country_code text;
  v_roles jsonb := '{}'::jsonb;
  v_role_ok boolean := false;
  v_roster_ok boolean := false;
  v_detached_riders int := 0;
  v_roster_action text := 'kept_existing_roster';
  v_market_result jsonb := '{}'::jsonb;
begin
  select c.country_code
  into v_country_code
  from public.clubs c
  where c.id = p_club_id;

  if v_country_code is null then
    raise exception 'Club % not found or has no country_code.', p_club_id;
  end if;

  v_tier_key := public._get_club_balance_tier_key(p_club_id);

  select coalesce(tbp.starting_cash_user, 0)
  into v_starting_cash
  from public.team_tier_balance_profiles tbp
  where tbp.tier_key = v_tier_key;

  -- Cash is applied only through the finance ledger.
  if p_apply_cash then
    perform public._apply_new_club_starting_cash_v1(p_club_id);
  end if;

  -- Minimum valid policy defaults.
  insert into public.club_team_policies (
    club_id,
    flight_class,
    hotel_level,
    ground_transport,
    logistics_support_level,
    team_vehicle_policy,
    rider_housing_support,
    nutrition_support_level,
    recovery_support_level,
    staff_equipment_level,
    staff_accommodation_level,
    rider_bonus_plan,
    staff_bonus_plan
  )
  values (
    p_club_id,
    'economy',
    'budget',
    'standard_vans',
    'none',
    'none',
    'none',
    'none',
    'none',
    'basic',
    'shared',
    'none',
    'none'
  )
  on conflict (club_id) do update
  set
    flight_class = excluded.flight_class,
    hotel_level = excluded.hotel_level,
    ground_transport = excluded.ground_transport,
    logistics_support_level = excluded.logistics_support_level,
    team_vehicle_policy = excluded.team_vehicle_policy,
    rider_housing_support = excluded.rider_housing_support,
    nutrition_support_level = excluded.nutrition_support_level,
    recovery_support_level = excluded.recovery_support_level,
    staff_equipment_level = excluded.staff_equipment_level,
    staff_accommodation_level = excluded.staff_accommodation_level,
    rider_bonus_plan = excluded.rider_bonus_plan,
    staff_bonus_plan = excluded.staff_bonus_plan,
    updated_at = now();

  -- Club House / HQ Level 1 only.
  insert into public.club_infrastructure (
    club_id,
    hq_level,
    training_center_level,
    medical_center_level,
    scouting_level,
    equipment_level,
    youth_academy_level,
    mechanics_workshop_level,
    team_car_fleet_quantity,
    team_bus_quantity,
    equipment_van_quantity,
    logistics_truck_quantity,
    mobile_workshop_quantity,
    medical_van_quantity
  )
  values (
    p_club_id,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
  )
  on conflict (club_id) do update
  set
    hq_level = excluded.hq_level,
    training_center_level = excluded.training_center_level,
    medical_center_level = excluded.medical_center_level,
    scouting_level = excluded.scouting_level,
    equipment_level = excluded.equipment_level,
    youth_academy_level = excluded.youth_academy_level,
    mechanics_workshop_level = excluded.mechanics_workshop_level,
    team_car_fleet_quantity = excluded.team_car_fleet_quantity,
    team_bus_quantity = excluded.team_bus_quantity,
    equipment_van_quantity = excluded.equipment_van_quantity,
    logistics_truck_quantity = excluded.logistics_truck_quantity,
    mobile_workshop_quantity = excluded.mobile_workshop_quantity,
    medical_van_quantity = excluded.medical_van_quantity,
    updated_at = now();

  -- Current roster check.
  select
    count(cr.rider_id),
    count(*) filter (where r.country_code = c.country_code)
  into
    v_generated_riders,
    v_domestic_riders
  from public.clubs c
  left join public.club_riders cr on cr.club_id = c.id
  left join public.riders r on r.id = cr.rider_id
  where c.id = p_club_id
  group by c.id;

  select coalesce(jsonb_object_agg(role_name, rider_count), '{}'::jsonb)
  into v_roles
  from (
    select
      r.role::text as role_name,
      count(*) as rider_count
    from public.club_riders cr
    join public.riders r on r.id = cr.rider_id
    where cr.club_id = p_club_id
    group by r.role::text
  ) x;

  v_role_ok :=
    coalesce((v_roles->>'Leader')::int, 0) = 1
    and coalesce((v_roles->>'Sprinter')::int, 0) = 1
    and coalesce((v_roles->>'Climber')::int, 0) = 1
    and coalesce((v_roles->>'All-rounder')::int, 0) = 3
    and coalesce((v_roles->>'Domestique')::int, 0) = 3
    and coalesce((v_roles->>'Breakaway')::int, 0) = 1;

  v_roster_ok :=
    coalesce(v_generated_riders, 0) = 10
    and coalesce(v_domestic_riders, 0) = 10
    and v_role_ok;

  if not v_roster_ok then
    delete from public.club_riders
    where club_id = p_club_id;

    get diagnostics v_detached_riders = row_count;

    perform public._generate_domestic_roster_for_club(p_club_id);

    v_roster_action := 'detached_old_riders_and_generated_new_roster';
  end if;

  -- Market-value balance for final starter riders.
  v_market_result := public.rebalance_new_club_starter_market_values_v1(p_club_id);

  -- Read final cash after all ledger actions.
  select coalesce(c.cash_balance, 0)
  into v_cash_balance
  from public.clubs c
  where c.id = p_club_id;

  -- Ensure club_finance_summary exists and matches final cash.
  insert into public.club_finance_summary (club_id, current_balance)
  values (p_club_id, v_cash_balance)
  on conflict (club_id) do update
  set current_balance = excluded.current_balance;

  -- Final rider count.
  select
    count(cr.rider_id),
    count(*) filter (where r.country_code = c.country_code)
  into
    v_generated_riders,
    v_domestic_riders
  from public.clubs c
  left join public.club_riders cr on cr.club_id = c.id
  left join public.riders r on r.id = cr.rider_id
  where c.id = p_club_id
  group by c.id;

  return jsonb_build_object(
    'status', 'completed',
    'club_id', p_club_id,
    'tier_key', v_tier_key,
    'apply_cash', p_apply_cash,
    'expected_starting_cash', v_starting_cash,
    'cash_balance', v_cash_balance,
    'generated_riders', coalesce(v_generated_riders, 0),
    'domestic_riders', coalesce(v_domestic_riders, 0),
    'roster_action', v_roster_action,
    'detached_old_riders', v_detached_riders,
    'market_value_balance', v_market_result,
    'finance_summary_synced', true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rebalance_new_club_starter_market_values_v1(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tier_key text;
  v_value_min bigint;
  v_value_max bigint;
  v_target_total bigint;
  v_current_total bigint;
  v_rider_count int;
  v_scale numeric;
  v_new_total bigint;
begin
  v_tier_key := public._get_club_balance_tier_key(p_club_id);

  select
    tbp.squad_market_value_min,
    tbp.squad_market_value_max
  into
    v_value_min,
    v_value_max
  from public.team_tier_balance_profiles tbp
  where tbp.tier_key = v_tier_key;

  if v_value_min is null or v_value_max is null then
    raise exception 'No market value target found for tier_key=%', v_tier_key;
  end if;

  select
    count(r.id),
    coalesce(sum(coalesce(r.market_value, 0)), 0)
  into
    v_rider_count,
    v_current_total
  from public.club_riders cr
  join public.riders r on r.id = cr.rider_id
  where cr.club_id = p_club_id;

  if coalesce(v_rider_count, 0) = 0 then
    return jsonb_build_object(
      'status', 'skipped_no_riders',
      'club_id', p_club_id,
      'tier_key', v_tier_key
    );
  end if;

  -- Target the midpoint of the configured tier band.
  v_target_total := floor((v_value_min + v_value_max) / 2.0)::bigint;

  -- If current total is 0, assign values from salary/overall weights.
  if coalesce(v_current_total, 0) <= 0 then
    with rider_weights as (
      select
        r.id,
        greatest(
          1,
          coalesce(r.salary, 0)::numeric * 8
          + coalesce(r.overall, 50)::numeric * 10000
          + coalesce(r.potential, coalesce(r.overall, 50))::numeric * 5000
          + case r.role::text
              when 'Leader' then 500000
              when 'Sprinter' then 250000
              when 'Climber' then 250000
              when 'All-rounder' then 180000
              when 'Breakaway' then 140000
              when 'Domestique' then 90000
              else 100000
            end
        ) as weight
      from public.club_riders cr
      join public.riders r on r.id = cr.rider_id
      where cr.club_id = p_club_id
    ),
    total_weight as (
      select sum(weight) as total_weight
      from rider_weights
    )
    update public.riders r
    set market_value = greatest(
      25000,
      round((rw.weight / nullif(tw.total_weight, 0)) * v_target_total)::bigint
    )
    from rider_weights rw
    cross join total_weight tw
    where r.id = rw.id;
  else
    -- Normal case: preserve relative values and scale to target total.
    v_scale := v_target_total::numeric / v_current_total::numeric;

    update public.riders r
    set market_value = greatest(
      25000,
      round(coalesce(r.market_value, 0)::numeric * v_scale)::bigint
    )
    from public.club_riders cr
    where cr.rider_id = r.id
      and cr.club_id = p_club_id;
  end if;

  -- Small correction for rounding drift: add/remove difference on the leader if possible.
  select coalesce(sum(coalesce(r.market_value, 0)), 0)
  into v_new_total
  from public.club_riders cr
  join public.riders r on r.id = cr.rider_id
  where cr.club_id = p_club_id;

  if v_new_total <> v_target_total then
    update public.riders r
    set market_value = greatest(
      25000,
      coalesce(r.market_value, 0) + (v_target_total - v_new_total)
    )
    where r.id = (
      select r2.id
      from public.club_riders cr2
      join public.riders r2 on r2.id = cr2.rider_id
      where cr2.club_id = p_club_id
      order by
        case r2.role::text
          when 'Leader' then 1
          when 'Sprinter' then 2
          when 'Climber' then 3
          else 4
        end,
        r2.overall desc nulls last,
        r2.market_value desc nulls last
      limit 1
    );
  end if;

  select coalesce(sum(coalesce(r.market_value, 0)), 0)
  into v_new_total
  from public.club_riders cr
  join public.riders r on r.id = cr.rider_id
  where cr.club_id = p_club_id;

  return jsonb_build_object(
    'status', 'completed',
    'club_id', p_club_id,
    'tier_key', v_tier_key,
    'rider_count', v_rider_count,
    'target_min', v_value_min,
    'target_max', v_value_max,
    'target_total', v_target_total,
    'old_total', v_current_total,
    'new_total', v_new_total,
    'market_value_ok', v_new_total between v_value_min and v_value_max
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_stage_tactical_audit_v1(p_stage_id uuid, p_club_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_run_id uuid;
  v_race_id uuid;
  v_stage jsonb;
  v_scope text;
  v_rows jsonb;
  v_summary jsonb;
begin
  select sim.id, sim.race_id
    into v_run_id, v_race_id
  from public.race_stage_simulation_runs sim
  where sim.stage_id = p_stage_id
  order by coalesce((to_jsonb(sim)->>'created_at')::timestamptz, now()) desc
  limit 1;

  if v_run_id is null then
    return jsonb_build_object(
      'status', 'no_simulation_run_found',
      'stage_id', p_stage_id
    );
  end if;

  select to_jsonb(rs)
    into v_stage
  from public.race_stages rs
  where rs.id = p_stage_id;

  v_scope := case when p_club_id is null then 'all_teams' else 'club_family' end;

  with selected_states as (
    select
      rss.*,
      rsr.rank,
      rsr.gap_seconds as result_gap_seconds,
      c.name as team_name,
      c.club_type,
      coalesce(
        nullif(concat_ws(' ', nullif(to_jsonb(r)->>'first_name', ''), nullif(to_jsonb(r)->>'last_name', '')), ''),
        nullif(to_jsonb(r)->>'display_name', ''),
        nullif(to_jsonb(r)->>'full_name', ''),
        to_jsonb(rss)->'metadata'->>'rider_name',
        rss.rider_id::text
      ) as rider_name,
      coalesce(to_jsonb(rss)->'metadata', '{}'::jsonb) as md
    from public.race_stage_rider_states rss
    left join public.race_stage_results rsr
      on rsr.stage_id = p_stage_id
     and rsr.rider_id = rss.rider_id
    left join public.riders r on r.id = rss.rider_id
    left join public.clubs c on c.id = rss.team_id
    where rss.simulation_run_id = v_run_id
      and (
        p_club_id is null
        or rss.team_id in (select club_id from public.get_stage_club_family_ids_v1(p_club_id))
      )
  ), tactical as (
    select
      rider_id,
      team_id,
      rider_name,
      team_name,
      club_type,
      rank,
      result_gap_seconds,
      to_jsonb(selected_states)->>'role_code' as role_code,
      md->>'stage_role' as engine_stage_role,
      md->>'stage_tactic' as stage_tactic,
      md->>'phase_1_command' as phase_1_command,
      md->>'phase_2_command' as phase_2_command,
      md->>'phase_3_command' as phase_3_command,
      md->>'phase_4_command' as phase_4_command,
      coalesce((to_jsonb(selected_states)->>'start_stamina')::numeric, 0) as start_stamina,
      coalesce((to_jsonb(selected_states)->>'finish_stamina')::numeric, 0) as finish_stamina,
      coalesce((to_jsonb(selected_states)->>'stamina_spent')::numeric, 0) as stamina_spent,
      coalesce((to_jsonb(selected_states)->>'fatigue_before_stage')::numeric, 0) as fatigue_before_stage,
      coalesce((to_jsonb(selected_states)->>'fatigue_after_stage')::numeric, 0) as fatigue_after_stage,
      coalesce((to_jsonb(selected_states)->>'fatigue_gain')::numeric, 0) as fatigue_gain,
      coalesce((to_jsonb(selected_states)->>'attack_attempts')::numeric, 0) as attack_attempts,
      coalesce((to_jsonb(selected_states)->>'breakaway_km')::numeric, 0) as breakaway_km,
      coalesce((to_jsonb(selected_states)->>'work_done_score')::numeric, 0) as work_done_score,
      coalesce((to_jsonb(selected_states)->>'support_work_done_score')::numeric, 0) as support_work_done_score,
      coalesce((to_jsonb(selected_states)->>'protection_received_score')::numeric, 0) as protection_received_score,
      coalesce((to_jsonb(selected_states)->>'leadout_work_score')::numeric, 0) as leadout_work_score,
      coalesce((to_jsonb(selected_states)->>'chase_work_score')::numeric, 0) as chase_work_score,
      coalesce((to_jsonb(selected_states)->>'incident_risk_score')::numeric, 0) as incident_risk_score,
      coalesce((to_jsonb(selected_states)->>'mechanical_risk_score')::numeric, 0) as mechanical_risk_score,
      coalesce((md->>'effort_multiplier')::numeric, 1) as effort_multiplier,
      coalesce((md->>'command_performance_modifier')::numeric, 0) as command_performance_modifier,
      coalesce((md->>'stage_skill_score')::numeric, null) as stage_skill_score,
      coalesce((md->>'performance_score')::numeric, null) as performance_score,
      to_jsonb(selected_states) as full_state_json
    from selected_states
  ), row_json as (
    select jsonb_agg(
      jsonb_build_object(
        'rider_id', rider_id,
        'rider_name', rider_name,
        'team_id', team_id,
        'team_name', team_name,
        'club_type', club_type,
        'rank', rank,
        'gap_seconds', result_gap_seconds,
        'role_code', role_code,
        'engine_stage_role', engine_stage_role,
        'stage_tactic', stage_tactic,
        'commands', jsonb_build_object(
          'phase_1', phase_1_command,
          'phase_2', phase_2_command,
          'phase_3', phase_3_command,
          'phase_4', phase_4_command
        ),
        'effort_multiplier', effort_multiplier,
        'command_performance_modifier', command_performance_modifier,
        'stage_skill_score', stage_skill_score,
        'performance_score', performance_score,
        'stamina', jsonb_build_object(
          'start', start_stamina,
          'finish', finish_stamina,
          'spent', stamina_spent
        ),
        'fatigue', jsonb_build_object(
          'before', fatigue_before_stage,
          'after', fatigue_after_stage,
          'gain', fatigue_gain
        ),
        'attack_breakaway', jsonb_build_object(
          'attack_attempts', attack_attempts,
          'breakaway_km', breakaway_km
        ),
        'support', jsonb_build_object(
          'work_done_score', work_done_score,
          'support_work_done_score', support_work_done_score,
          'protection_received_score', protection_received_score,
          'leadout_work_score', leadout_work_score,
          'chase_work_score', chase_work_score
        ),
        'risk', jsonb_build_object(
          'incident_risk_score', incident_risk_score,
          'mechanical_risk_score', mechanical_risk_score
        ),
        'notes', jsonb_build_array(
          case when phase_1_command in ('attack','join_breakaway') or phase_2_command in ('attack','join_breakaway') or phase_3_command in ('attack','join_breakaway') or phase_4_command in ('attack','join_breakaway')
            then case when attack_attempts = 0 and breakaway_km = 0
              then 'Attack/breakaway command was present, but no visible attack_attempts or breakaway_km were written.'
              else 'Attack/breakaway command produced measurable attempt or breakaway data.' end
            else null end,
          case when phase_1_command = 'protect_leader' or phase_2_command = 'protect_leader' or phase_3_command = 'protect_leader' or phase_4_command = 'protect_leader'
            then case when support_work_done_score = 0 and protection_received_score = 0
              then 'Protect-leader command was present, but no support/protection score was written.'
              else 'Protect-leader command produced support/protection data.' end
            else null end,
          case when incident_risk_score = 0 and mechanical_risk_score = 0
            then 'No incident/mechanical risk was written for this rider state.'
            else 'Incident/mechanical risk was written for this rider state.' end
        )
      ) order by rank nulls last, rider_name
    ) as rows
    from tactical
  ), summary_json as (
    select jsonb_build_object(
      'rider_count', count(*),
      'attack_or_breakaway_command_riders', count(*) filter (where phase_1_command in ('attack','join_breakaway') or phase_2_command in ('attack','join_breakaway') or phase_3_command in ('attack','join_breakaway') or phase_4_command in ('attack','join_breakaway')),
      'attack_attempts_total', coalesce(sum(attack_attempts), 0),
      'breakaway_km_total', coalesce(sum(breakaway_km), 0),
      'protect_leader_command_riders', count(*) filter (where phase_1_command = 'protect_leader' or phase_2_command = 'protect_leader' or phase_3_command = 'protect_leader' or phase_4_command = 'protect_leader'),
      'support_work_total', coalesce(sum(support_work_done_score), 0),
      'protection_received_total', coalesce(sum(protection_received_score), 0),
      'incident_risk_total', coalesce(sum(incident_risk_score), 0),
      'mechanical_risk_total', coalesce(sum(mechanical_risk_score), 0),
      'avg_stamina_spent', round(avg(stamina_spent), 2),
      'avg_fatigue_gain', round(avg(fatigue_gain), 2),
      'avg_performance_score', round(avg(performance_score), 3),
      'avg_stage_skill_score', round(avg(stage_skill_score), 3)
    ) as summary
    from tactical
  )
  select coalesce(row_json.rows, '[]'::jsonb), summary_json.summary
    into v_rows, v_summary
  from row_json cross join summary_json;

  return jsonb_build_object(
    'status', 'ok',
    'scope', v_scope,
    'race_id', v_race_id,
    'stage_id', p_stage_id,
    'simulation_run_id', v_run_id,
    'stage', v_stage,
    'summary', v_summary,
    'riders', coalesce(v_rows, '[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_stage_bonus_audit_v1(p_stage_id uuid, p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_run_id uuid;
  v_race_id uuid;
  v_user_summary jsonb;
  v_no_prep_summary jsonb;
  v_prep_json jsonb;
  v_stage_plan_json jsonb;
  v_explicit_bonus_present boolean;
begin
  select sim.id, sim.race_id
    into v_run_id, v_race_id
  from public.race_stage_simulation_runs sim
  where sim.stage_id = p_stage_id
  order by coalesce((to_jsonb(sim)->>'created_at')::timestamptz, now()) desc
  limit 1;

  if v_run_id is null then
    return jsonb_build_object('status', 'no_simulation_run_found', 'stage_id', p_stage_id);
  end if;

  with prep as (
    select rp.*
    from public.race_preparations rp
    where rp.race_id = v_race_id
      and rp.club_id in (select club_id from public.get_stage_club_family_ids_v1(p_club_id))
  )
  select jsonb_agg(to_jsonb(prep)) into v_prep_json from prep;

  with prep as (
    select rp.*
    from public.race_preparations rp
    where rp.race_id = v_race_id
      and rp.club_id in (select club_id from public.get_stage_club_family_ids_v1(p_club_id))
  ), sp as (
    select rsp.*
    from public.race_stage_plans rsp
    join prep on prep.id = rsp.race_preparation_id
    where rsp.stage_id = p_stage_id
  )
  select jsonb_agg(to_jsonb(sp)) into v_stage_plan_json from sp;

  with user_rows as (
    select
      rss.*,
      rsr.rank,
      coalesce((to_jsonb(rss)->'metadata'->>'performance_score')::numeric, null) as audit_performance_score,
      coalesce((to_jsonb(rss)->'metadata'->>'stage_skill_score')::numeric, null) as audit_stage_skill_score,
      coalesce((to_jsonb(rss)->>'stamina_spent')::numeric, 0) as audit_stamina_spent,
      coalesce((to_jsonb(rss)->>'fatigue_gain')::numeric, 0) as audit_fatigue_gain,
      coalesce((to_jsonb(rss)->>'start_stamina')::numeric, 0) as audit_start_stamina,
      coalesce((to_jsonb(rss)->>'finish_stamina')::numeric, 0) as audit_finish_stamina
    from public.race_stage_rider_states rss
    left join public.race_stage_results rsr
      on rsr.stage_id = p_stage_id and rsr.rider_id = rss.rider_id
    where rss.simulation_run_id = v_run_id
      and rss.team_id in (select club_id from public.get_stage_club_family_ids_v1(p_club_id))
  )
  select jsonb_build_object(
    'rider_count', count(*),
    'best_rank', min(rank),
    'avg_rank', round(avg(rank), 2),
    'avg_start_stamina', round(avg(audit_start_stamina), 2),
    'avg_finish_stamina', round(avg(audit_finish_stamina), 2),
    'avg_stamina_spent', round(avg(audit_stamina_spent), 2),
    'avg_fatigue_gain', round(avg(audit_fatigue_gain), 2),
    'avg_stage_skill_score', round(avg(audit_stage_skill_score), 3),
    'avg_performance_score', round(avg(audit_performance_score), 3)
  ) into v_user_summary
  from user_rows;

  with prep_teams as (
    select distinct rp.club_id
    from public.race_preparations rp
    where rp.race_id = v_race_id
  ), no_prep_rows as (
    select
      rss.*,
      rsr.rank,
      coalesce((to_jsonb(rss)->'metadata'->>'performance_score')::numeric, null) as audit_performance_score,
      coalesce((to_jsonb(rss)->'metadata'->>'stage_skill_score')::numeric, null) as audit_stage_skill_score,
      coalesce((to_jsonb(rss)->>'stamina_spent')::numeric, 0) as audit_stamina_spent,
      coalesce((to_jsonb(rss)->>'fatigue_gain')::numeric, 0) as audit_fatigue_gain,
      coalesce((to_jsonb(rss)->>'start_stamina')::numeric, 0) as audit_start_stamina,
      coalesce((to_jsonb(rss)->>'finish_stamina')::numeric, 0) as audit_finish_stamina
    from public.race_stage_rider_states rss
    left join public.race_stage_results rsr
      on rsr.stage_id = p_stage_id and rsr.rider_id = rss.rider_id
    left join prep_teams pt on pt.club_id = rss.team_id
    where rss.simulation_run_id = v_run_id
      and pt.club_id is null
  )
  select jsonb_build_object(
    'team_type', 'teams_without_race_preparation_rows',
    'rider_count', count(*),
    'best_rank', min(rank),
    'avg_rank', round(avg(rank), 2),
    'avg_start_stamina', round(avg(audit_start_stamina), 2),
    'avg_finish_stamina', round(avg(audit_finish_stamina), 2),
    'avg_stamina_spent', round(avg(audit_stamina_spent), 2),
    'avg_fatigue_gain', round(avg(audit_fatigue_gain), 2),
    'avg_stage_skill_score', round(avg(audit_stage_skill_score), 3),
    'avg_performance_score', round(avg(audit_performance_score), 3)
  ) into v_no_prep_summary
  from no_prep_rows;

  select exists (
    select 1
    from public.race_stage_rider_states rss
    where rss.simulation_run_id = v_run_id
      and rss.team_id in (select club_id from public.get_stage_club_family_ids_v1(p_club_id))
      and lower(to_jsonb(rss)::text) like any (array[
        '%staff_bonus%', '%asset_bonus%', '%supply_bonus%', '%equipment_bonus%',
        '%health_protection%', '%recovery_support%', '%fatigue_bonus%', '%race_plan_bonus%'
      ])
  ) into v_explicit_bonus_present;

  return jsonb_build_object(
    'status', 'ok',
    'race_id', v_race_id,
    'stage_id', p_stage_id,
    'simulation_run_id', v_run_id,
    'important_note', 'This compares actual stage-state outputs. It is not a clean causal re-simulation unless explicit bonus fields are stored by the engine.',
    'explicit_bonus_fields_present_in_rider_states', v_explicit_bonus_present,
    'race_preparations', coalesce(v_prep_json, '[]'::jsonb),
    'stage_plans', coalesce(v_stage_plan_json, '[]'::jsonb),
    'club_family_summary', v_user_summary,
    'no_prep_team_summary', v_no_prep_summary,
    'estimated_difference_vs_no_prep_group', jsonb_build_object(
      'avg_performance_score_delta', round(((v_user_summary->>'avg_performance_score')::numeric - coalesce((v_no_prep_summary->>'avg_performance_score')::numeric, 0)), 3),
      'avg_stage_skill_score_delta', round(((v_user_summary->>'avg_stage_skill_score')::numeric - coalesce((v_no_prep_summary->>'avg_stage_skill_score')::numeric, 0)), 3),
      'avg_stamina_spent_delta', round(((v_user_summary->>'avg_stamina_spent')::numeric - coalesce((v_no_prep_summary->>'avg_stamina_spent')::numeric, 0)), 2),
      'avg_fatigue_gain_delta', round(((v_user_summary->>'avg_fatigue_gain')::numeric - coalesce((v_no_prep_summary->>'avg_fatigue_gain')::numeric, 0)), 2)
    ),
    'missing_for_full_audit', case when v_explicit_bonus_present then 'none_detected' else 'Engine does not currently store explicit staff/assets/supplies/equipment bonus components in rider states.' end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.backfill_stage_tactical_report_events_v1(p_stage_id uuid, p_club_id uuid DEFAULT NULL::uuid, p_scope text DEFAULT 'club_family'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_run_id uuid;
  v_race_id uuid;
  v_distance numeric;
  v_order integer;
  v_inserted integer := 0;
  rec record;
  v_phase integer;
  v_command text;
  v_km numeric;
  v_title text;
  v_description text;
  v_event_type text;
  v_scope_all boolean;
begin
  v_scope_all := lower(coalesce(p_scope, 'club_family')) in ('all', 'all_teams', 'race');

  select sim.id, sim.race_id
    into v_run_id, v_race_id
  from public.race_stage_simulation_runs sim
  where sim.stage_id = p_stage_id
  order by coalesce((to_jsonb(sim)->>'created_at')::timestamptz, now()) desc
  limit 1;

  if v_run_id is null then
    return jsonb_build_object('status', 'no_simulation_run_found', 'stage_id', p_stage_id);
  end if;

  select coalesce((to_jsonb(rs)->>'distance_km')::numeric, 120)
    into v_distance
  from public.race_stages rs
  where rs.id = p_stage_id;

  delete from public.race_stage_report_events e
  where e.stage_id = p_stage_id
    and e.race_id = v_race_id
    and e.metadata->>'generated_by' = 'stage_tactical_audit_v1'
    and (
      v_scope_all
      or p_club_id is null
      or e.team_id in (select club_id from public.get_stage_club_family_ids_v1(p_club_id))
    );

  select coalesce(max(event_order), 0)
    into v_order
  from public.race_stage_report_events
  where race_id = v_race_id
    and stage_id = p_stage_id;

  for rec in
    select
      rss.rider_id,
      rss.team_id,
      coalesce(
        nullif(concat_ws(' ', nullif(to_jsonb(r)->>'first_name', ''), nullif(to_jsonb(r)->>'last_name', '')), ''),
        nullif(to_jsonb(r)->>'display_name', ''),
        to_jsonb(rss)->'metadata'->>'rider_name',
        rss.rider_id::text
      ) as rider_name,
      coalesce(c.name, to_jsonb(rss)->'metadata'->>'team_name') as team_name,
      coalesce((to_jsonb(rss)->>'attack_attempts')::numeric, 0) as attack_attempts,
      coalesce((to_jsonb(rss)->>'breakaway_km')::numeric, 0) as breakaway_km,
      coalesce((to_jsonb(rss)->>'support_work_done_score')::numeric, 0) as support_work_done_score,
      coalesce((to_jsonb(rss)->>'protection_received_score')::numeric, 0) as protection_received_score,
      coalesce((to_jsonb(rss)->>'leadout_work_score')::numeric, 0) as leadout_work_score,
      coalesce((to_jsonb(rss)->>'stamina_spent')::numeric, 0) as stamina_spent,
      coalesce((to_jsonb(rss)->>'fatigue_gain')::numeric, 0) as fatigue_gain,
      to_jsonb(rss)->'metadata'->>'phase_1_command' as phase_1_command,
      to_jsonb(rss)->'metadata'->>'phase_2_command' as phase_2_command,
      to_jsonb(rss)->'metadata'->>'phase_3_command' as phase_3_command,
      to_jsonb(rss)->'metadata'->>'phase_4_command' as phase_4_command,
      to_jsonb(rss) as state_json
    from public.race_stage_rider_states rss
    left join public.riders r on r.id = rss.rider_id
    left join public.clubs c on c.id = rss.team_id
    where rss.simulation_run_id = v_run_id
      and (
        v_scope_all
        or p_club_id is null
        or rss.team_id in (select club_id from public.get_stage_club_family_ids_v1(p_club_id))
      )
      and lower(to_jsonb(rss)::text) like any (array[
        '%attack%', '%join_breakaway%', '%protect_leader%', '%sprint%', '%lead_out%', '%chase_breakaway%'
      ])
    order by coalesce((to_jsonb(rss)->>'finish_position')::integer, 9999), rider_name
  loop
    for v_phase in 1..4 loop
      v_command := case v_phase
        when 1 then rec.phase_1_command
        when 2 then rec.phase_2_command
        when 3 then rec.phase_3_command
        when 4 then rec.phase_4_command
      end;

      if v_command is null or v_command in ('balanced', 'follow_team_plan', 'conserve_energy') then
        continue;
      end if;

      v_km := round((v_distance * ((v_phase::numeric - 0.5) / 4.0))::numeric, 1);
      v_event_type := 'tactical_' || v_command;

      if v_command in ('attack', 'join_breakaway') then
        if rec.attack_attempts > 0 or rec.breakaway_km > 0 then
          v_title := rec.rider_name || ' makes a move';
          v_description := rec.rider_name || ' follows the stage plan and tries to open or join a breakaway. The move is recorded by the engine with ' || rec.attack_attempts || ' attack attempts and ' || rec.breakaway_km || ' breakaway km.';
        else
          v_title := rec.rider_name || ' tries to force a move';
          v_description := rec.rider_name || ' follows the ' || v_command || ' instruction, spends extra energy, but no successful attack or breakaway distance is recorded. The move is effectively closed down.';
        end if;
      elsif v_command = 'protect_leader' then
        v_title := rec.rider_name || ' works to protect the leader';
        if rec.support_work_done_score > 0 or rec.protection_received_score > 0 then
          v_description := rec.rider_name || ' spends energy protecting a team leader. Support score: ' || rec.support_work_done_score || ', protection received score: ' || rec.protection_received_score || '.';
        else
          v_description := rec.rider_name || ' is assigned to protect the leader and spends energy, but no measurable support/protection score is written for this phase.';
        end if;
      elsif v_command in ('sprint', 'lead_out') then
        v_title := rec.rider_name || ' prepares for a sprint effort';
        v_description := rec.rider_name || ' follows a ' || v_command || ' instruction around this phase. Stamina spent after the stage: ' || rec.stamina_spent || ', fatigue gain: ' || rec.fatigue_gain || '.';
      elsif v_command = 'chase_breakaway' then
        v_title := rec.rider_name || ' helps chase the breakaway';
        v_description := rec.rider_name || ' follows a chase-breakaway instruction. This should cost stamina and may help reduce the breakaway gap when the chase model is connected.';
      else
        v_title := rec.rider_name || ' follows tactical command: ' || v_command;
        v_description := rec.rider_name || ' follows individual command ' || v_command || ' in phase ' || v_phase || '.';
      end if;

      v_order := v_order + 1;

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
        rider_name_snapshot,
        team_id,
        team_name_snapshot,
        metadata
      ) values (
        v_race_id,
        p_stage_id,
        v_order,
        v_km,
        null,
        v_event_type,
        v_title,
        v_description,
        rec.rider_id,
        rec.rider_name,
        rec.team_id,
        rec.team_name,
        jsonb_build_object(
          'generated_by', 'stage_tactical_audit_v1',
          'simulation_run_id', v_run_id,
          'phase_number', v_phase,
          'command', v_command,
          'stamina_spent', rec.stamina_spent,
          'fatigue_gain', rec.fatigue_gain,
          'attack_attempts', rec.attack_attempts,
          'breakaway_km', rec.breakaway_km,
          'support_work_done_score', rec.support_work_done_score,
          'protection_received_score', rec.protection_received_score,
          'note', 'Backfilled commentary from existing state values; does not alter results.'
        )
      );

      v_inserted := v_inserted + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'race_id', v_race_id,
    'stage_id', p_stage_id,
    'simulation_run_id', v_run_id,
    'scope', case when v_scope_all then 'all_teams' else 'club_family' end,
    'inserted_events', v_inserted
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_current_game_season_number_safe_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_state jsonb;
  v_result integer;
begin
  select to_jsonb(gs)
  into v_state
  from public.game_state gs
  limit 1;

  v_result := coalesce(
    nullif(v_state ->> 'season_number', '')::integer,
    nullif(v_state ->> 'season', '')::integer,
    nullif(v_state ->> 'season_year', '')::integer,
    1
  );

  return greatest(v_result, 1);
exception
  when others then
    return 1;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_current_game_date_safe_v1()
 RETURNS date
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_date date;
  v_state jsonb;
begin
  begin
    execute 'select public.get_current_game_date_date()'
    into v_date;

    if v_date is not null then
      return v_date;
    end if;
  exception
    when others then
      null;
  end;

  select to_jsonb(gs)
  into v_state
  from public.game_state gs
  limit 1;

  v_date := coalesce(
    nullif(v_state ->> 'current_game_date', '')::date,
    nullif(v_state ->> 'current_date', '')::date,
    nullif(v_state ->> 'game_date', '')::date,
    current_date
  );

  return v_date;
exception
  when others then
    return current_date;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.club_branding_lock_status_v1(p_club_id uuid)
 RETURNS TABLE(can_edit_name boolean, can_edit_colors boolean, can_edit_logo boolean, locked_by_sponsor boolean, locked_until_game_date date, season_display_name text, original_club_name text, full_display_name text, source_sponsor_id uuid, lock_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_season integer;
  v_rows integer;
begin
  if p_club_id is null then
    raise exception 'Club id is required.';
  end if;

  -- Normal app users must be club owner/member.
  -- SQL Editor/admin calls often have auth.uid() = null, so allow those for verification/admin use.
  if auth.uid() is not null
     and not finance.is_club_member_or_owner(p_club_id, auth.uid()) then
    raise exception 'Not allowed to read club branding lock status.';
  end if;

  v_season := public.get_current_game_season_number_safe_v1();

  return query
  select
    false as can_edit_name,
    false as can_edit_colors,
    true as can_edit_logo,
    true as locked_by_sponsor,
    i.ends_game_date as locked_until_game_date,
    i.display_name as season_display_name,
    i.original_club_name,
    i.full_display_name,
    i.source_sponsor_id,
    'Naming-rights sponsor locks team name and colors until the end of the season.'::text
      as lock_reason
  from public.club_season_identities i
  where i.club_id = p_club_id
    and i.season_number = v_season
    and i.is_active = true
    and i.source_type = 'sponsor_naming_rights'
  order by i.created_at desc
  limit 1;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return query
    select
      true,
      true,
      true,
      false,
      null::date,
      null::text,
      null::text,
      null::text,
      null::uuid,
      null::text;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_club_branding_v1(p_club_id uuid, p_name text DEFAULT NULL::text, p_primary_color text DEFAULT NULL::text, p_secondary_color text DEFAULT NULL::text, p_logo_path text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, owner_user_id uuid, name text, country_code text, primary_color text, secondary_color text, logo_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_club public.clubs%rowtype;
  v_name text;
  v_primary_color text;
  v_secondary_color text;
  v_has_naming_lock boolean;
  v_season integer;
begin
  if p_club_id is null then
    raise exception 'Club id is required.';
  end if;

  select *
  into v_club
  from public.clubs c
  where c.id = p_club_id
  for update;

  if not found then
    raise exception 'Club not found.';
  end if;

  if v_club.owner_user_id is distinct from auth.uid() then
    raise exception 'Only the club owner can customize club branding.';
  end if;

  v_name := case
    when p_name is null then null
    else regexp_replace(trim(p_name), '\s+', ' ', 'g')
  end;

  v_primary_color := case
    when p_primary_color is null then null
    else trim(p_primary_color)
  end;

  v_secondary_color := case
    when p_secondary_color is null then null
    else trim(p_secondary_color)
  end;

  if v_name is not null and length(v_name) not between 3 and 40 then
    raise exception 'Team name must be between 3 and 40 characters.';
  end if;

  if v_primary_color is not null and v_primary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Primary color must be a valid HEX color.';
  end if;

  if v_secondary_color is not null and v_secondary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Secondary color must be a valid HEX color.';
  end if;

  if v_primary_color is not null
     and v_secondary_color is not null
     and lower(v_primary_color) = lower(v_secondary_color) then
    raise exception 'Primary and secondary colors must be different.';
  end if;

  v_season := public.get_current_game_season_number_safe_v1();

  select exists (
    select 1
    from public.club_season_identities i
    where i.club_id = p_club_id
      and i.season_number = v_season
      and i.is_active = true
      and i.source_type = 'sponsor_naming_rights'
  )
  into v_has_naming_lock;

  if v_has_naming_lock then
    if v_name is not null and v_name is distinct from v_club.name then
      raise exception 'Team name is locked by an active naming-rights sponsor until the end of the season.';
    end if;

    if v_primary_color is not null and v_primary_color is distinct from v_club.primary_color then
      raise exception 'Primary color is locked by an active naming-rights sponsor until the end of the season.';
    end if;

    if v_secondary_color is not null and v_secondary_color is distinct from v_club.secondary_color then
      raise exception 'Secondary color is locked by an active naming-rights sponsor until the end of the season.';
    end if;
  end if;

  return query
  update public.clubs c
  set
    name = coalesce(v_name, c.name),
    primary_color = coalesce(v_primary_color, c.primary_color),
    secondary_color = coalesce(v_secondary_color, c.secondary_color),
    logo_path = case
      when p_logo_path is null then c.logo_path
      else p_logo_path
    end
  where c.id = p_club_id
    and c.owner_user_id = auth.uid()
  returning
    c.id,
    c.owner_user_id,
    c.name,
    c.country_code,
    c.primary_color,
    c.secondary_color,
    c.logo_path;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_sponsor_naming_rights_identity_v1(p_club_sponsor_id uuid, p_display_name text DEFAULT NULL::text, p_primary_color text DEFAULT NULL::text, p_secondary_color text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sponsor public.club_sponsors%rowtype;
  v_club public.clubs%rowtype;
  v_identity_id uuid;
  v_display_name text;
  v_game_date date;
  v_season integer;
  v_primary_color text;
  v_secondary_color text;
begin
  if p_club_sponsor_id is null then
    raise exception 'Club sponsor id is required.';
  end if;

  select *
  into v_sponsor
  from public.club_sponsors cs
  where cs.id = p_club_sponsor_id
  for update;

  if not found then
    raise exception 'Signed sponsor not found.';
  end if;

  if v_sponsor.sponsor_kind <> 'main' then
    raise exception 'Only main sponsors can create naming-rights identities.';
  end if;

  select *
  into v_club
  from public.clubs c
  where c.id = v_sponsor.club_id
  for update;

  if not found then
    raise exception 'Club not found for signed sponsor.';
  end if;

  -- Allow SQL editor/admin execution where auth.uid() can be null.
  -- In app usage, the current user must be the owner.
  if auth.uid() is not null and v_club.owner_user_id is distinct from auth.uid() then
    raise exception 'Only the club owner can apply naming-rights identity.';
  end if;

  v_season := v_sponsor.season_number;
  v_game_date := public.get_current_game_date_safe_v1();

  v_display_name := regexp_replace(
    trim(coalesce(nullif(p_display_name, ''), v_sponsor.name || ' Team')),
    '\s+',
    ' ',
    'g'
  );

  if length(v_display_name) not between 3 and 60 then
    raise exception 'Naming-rights display name must be between 3 and 60 characters.';
  end if;

  v_primary_color := nullif(trim(coalesce(p_primary_color, '')), '');
  v_secondary_color := nullif(trim(coalesce(p_secondary_color, '')), '');

  if v_primary_color is not null and v_primary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Primary sponsor color must be a valid HEX color.';
  end if;

  if v_secondary_color is not null and v_secondary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Secondary sponsor color must be a valid HEX color.';
  end if;

  -- Only one active naming-rights identity per club/season.
  update public.club_season_identities i
  set is_active = false
  where i.club_id = v_sponsor.club_id
    and i.season_number = v_season
    and i.source_type = 'sponsor_naming_rights'
    and i.is_active = true;

  insert into public.club_season_identities (
    club_id,
    season_number,
    display_name,
    original_club_name,
    source_type,
    source_sponsor_id,
    primary_color,
    secondary_color,
    original_primary_color,
    original_secondary_color,
    starts_game_date,
    ends_game_date,
    is_active,
    metadata
  )
  values (
    v_sponsor.club_id,
    v_season,
    v_display_name,
    v_club.name,
    'sponsor_naming_rights',
    v_sponsor.id,
    v_primary_color,
    v_secondary_color,
    v_club.primary_color,
    v_club.secondary_color,
    v_game_date,
    make_date(extract(year from v_game_date)::integer, 12, 31),
    true,
    jsonb_build_object(
      'deal_type', 'naming_rights',
      'requires_team_name_change', true,
      'season_display_name', v_display_name,
      'original_club_name', v_club.name,
      'full_display_name', v_display_name || ' (' || v_club.name || ')',
      'branding_locked_fields', jsonb_build_array('name', 'primary_color', 'secondary_color'),
      'source', 'apply_sponsor_naming_rights_identity_v1'
    )
  )
  returning id
  into v_identity_id;

  update public.club_sponsors cs
  set
    main_sponsor_deal_type = 'naming_rights',
    metadata = coalesce(cs.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'deal_type', 'naming_rights',
        'requires_team_name_change', true,
        'season_display_name', v_display_name,
        'original_club_name', v_club.name,
        'full_display_name', v_display_name || ' (' || v_club.name || ')',
        'season_identity_id', v_identity_id,
        'branding_locked_fields', jsonb_build_array('name', 'primary_color', 'secondary_color')
      )
  where cs.id = v_sponsor.id;

  return v_identity_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.block_locked_club_branding_update_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_season integer;
  v_has_lock boolean;
begin
  v_season := public.get_current_game_season_number_safe_v1();

  select exists (
    select 1
    from public.club_season_identities i
    where i.club_id = old.id
      and i.season_number = v_season
      and i.is_active = true
      and i.source_type = 'sponsor_naming_rights'
  )
  into v_has_lock;

  if v_has_lock then
    if new.name is distinct from old.name then
      raise exception 'Team name is locked by an active naming-rights sponsor until the end of the season.';
    end if;

    if new.primary_color is distinct from old.primary_color then
      raise exception 'Primary color is locked by an active naming-rights sponsor until the end of the season.';
    end if;

    if new.secondary_color is distinct from old.secondary_color then
      raise exception 'Secondary color is locked by an active naming-rights sponsor until the end of the season.';
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_set_objective_target_v1(p_objective_id uuid, p_target_race_id uuid DEFAULT NULL::uuid, p_target_stage_id uuid DEFAULT NULL::uuid, p_target_check_game_date date DEFAULT NULL::date, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_club_id uuid;
begin
  if p_objective_id is null then
    raise exception 'Objective id is required.';
  end if;

  select cs.club_id
  into v_club_id
  from public.club_sponsor_objectives o
  join public.club_sponsors cs on cs.id = o.club_sponsor_id
  where o.id = p_objective_id;

  if not found then
    raise exception 'Sponsor objective not found.';
  end if;

  if not finance.is_club_member_or_owner(v_club_id, auth.uid()) then
    raise exception 'Not allowed to update sponsor objective target.';
  end if;

  update public.club_sponsor_objectives o
  set
    target_race_id = p_target_race_id,
    target_stage_id = p_target_stage_id,
    target_check_game_date = p_target_check_game_date,
    check_state = case
      when p_target_check_game_date is null then 'not_scheduled'
      else 'scheduled'
    end,
    metadata = coalesce(o.metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb)
  where o.id = p_objective_id;

  return p_objective_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_stage_equipment_asset_wear_v1(p_simulation_run_id uuid, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage_id uuid;
  v_race_id uuid;
  v_stage_distance_km numeric := 0;
  v_applied_game_date date;
  v_updated_equipment_count integer := 0;
  v_inserted_equipment_log_count integer := 0;
  v_result jsonb;
  v_inserted_plan_rows integer := 0;
  v_inserted_direct_plan_rows integer := 0;
  v_inserted_prep_plan_rows integer := 0;
  v_categories text[] := array['frame', 'wheelset', 'groupset', 'tires', 'helmet', 'shoes'];
  -- Phase 11B universal-manifest exact application branch.
  v_manifest jsonb;
  v_resource_updates jsonb;
  v_resource_row jsonb;
  v_resource_id uuid;
  v_resource_type text;
  v_team_id uuid;
  v_condition_before numeric;
  v_condition_after numeric;
  v_condition_used numeric;
  v_current_condition numeric;
  v_applied_condition_after numeric;
  v_asset_key text;
  v_asset_table text;
  v_universal_candidate_count integer := 0;
  v_universal_equipment_updated integer := 0;
  v_universal_asset_updated integer := 0;
  v_universal_log_inserted integer := 0;
  v_universal_already_applied integer := 0;
  v_universal_sql text;
begin
  if p_simulation_run_id is null then
    raise exception 'p_simulation_run_id is required';
  end if;

  -- Resolve the stage from whichever simulation-run table exists.
  if to_regclass('public.race_stage_simulation_runs') is not null then
    execute 'select stage_id from public.race_stage_simulation_runs where id = $1 limit 1'
      into v_stage_id
      using p_simulation_run_id;
  end if;

  if v_stage_id is null and to_regclass('public.race_simulation_runs') is not null then
    execute 'select stage_id from public.race_simulation_runs where id = $1 limit 1'
      into v_stage_id
      using p_simulation_run_id;
  end if;

  if v_stage_id is null and to_regclass('public.race_stage_runs') is not null then
    execute 'select stage_id from public.race_stage_runs where id = $1 limit 1'
      into v_stage_id
      using p_simulation_run_id;
  end if;

  if v_stage_id is null then
    raise exception 'Could not resolve stage_id for simulation_run_id %', p_simulation_run_id;
  end if;

  execute 'select race_id, coalesce(distance_km, 0)::numeric from public.race_stages where id = $1 limit 1'
    into v_race_id, v_stage_distance_km
    using v_stage_id;

  -- Persistent race use belongs to the immutable in-game stage date, not to
  -- the real clock moment at which the replay/publication window closes.
  select stage.stage_date::date
  into v_applied_game_date
  from public.race_stages stage
  where stage.id = v_stage_id;

  /* ------------------------------------------------------------------
     Phase 11B universal-manifest path.

     Phase 9 owns resource calculations. For universal runs this writer does
     NOT recompute wear from mutable plans or staff. It applies the exact
     phase9ResourceUpdates already stored in the immutable application manifest.
     The existing race_engine_stage_wear_applications ledger remains the
     exact-once guard for equipment and assets.
     ------------------------------------------------------------------ */
  select coalesce(run.result_summary_json -> 'application_manifest', '{}'::jsonb)
  into v_manifest
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1';

  if coalesce(v_manifest ->> 'contractVersion', '') = 'universal_phase11_application_manifest_v1'
     and coalesce((v_manifest ->> 'readyForApplication')::boolean, false)
  then
    v_resource_updates := coalesce(v_manifest -> 'phase9ResourceUpdates', '[]'::jsonb);

    if jsonb_typeof(v_resource_updates) <> 'array' then
      raise exception 'Universal Phase 9 resource updates are not an array for run %', p_simulation_run_id;
    end if;

    select count(*)::integer
    into v_universal_candidate_count
    from jsonb_array_elements(v_resource_updates) item
    where item ->> 'resourceType' in ('equipment', 'asset');

    if p_dry_run then
      return jsonb_build_object(
        'status', 'ok',
        'version', 'phase11b_manifest_exact_v1',
        'dry_run', true,
        'simulation_run_id', p_simulation_run_id,
        'stage_id', v_stage_id,
        'race_id', v_race_id,
        'stage_distance_km', v_stage_distance_km,
        'manifest_resource_candidate_count', v_universal_candidate_count,
        'resource_updates', (
          select coalesce(jsonb_agg(item), '[]'::jsonb)
          from jsonb_array_elements(v_resource_updates) item
          where item ->> 'resourceType' in ('equipment', 'asset')
        )
      );
    end if;

    for v_resource_row in
      select item
      from jsonb_array_elements(v_resource_updates) item
      where item ->> 'resourceType' in ('equipment', 'asset')
      order by item ->> 'resourceType', item ->> 'resourceId'
    loop
      v_resource_type := v_resource_row ->> 'resourceType';
      v_resource_id := nullif(v_resource_row ->> 'resourceId', '')::uuid;
      v_team_id := nullif(v_resource_row ->> 'teamId', '')::uuid;
      v_condition_before := nullif(v_resource_row ->> 'conditionBefore', '')::numeric;
      v_condition_after := nullif(v_resource_row ->> 'conditionAfter', '')::numeric;
      v_condition_used := coalesce(
        nullif(v_resource_row ->> 'conditionUsed', '')::numeric,
        greatest(coalesce(v_condition_before, 0) - coalesce(v_condition_after, 0), 0)
      );

      if v_resource_id is null or v_condition_before is null or v_condition_after is null then
        raise exception 'Universal Phase 9 % resource row is incomplete: %', v_resource_type, v_resource_row;
      end if;

      if exists (
        select 1
        from public.race_engine_stage_wear_applications log
        where log.simulation_run_id = p_simulation_run_id
          and log.target_type = v_resource_type
          and log.target_id = v_resource_id
      ) then
        v_universal_already_applied := v_universal_already_applied + 1;
        continue;
      end if;

      if v_resource_type = 'equipment' then
        select inventory.condition_percent
        into v_current_condition
        from public.club_equipment_inventory inventory
        where inventory.id = v_resource_id
        for update;

        if not found then
          raise exception 'Phase 11B equipment resource % was not found.', v_resource_id;
        end if;

        -- The manifest owns the immutable wear delta, not a stale absolute condition.
        -- Another legitimate race may have used this same equipment after calculation
        -- but before publication. The row is locked above, so apply this stage's exact
        -- delta to the condition that exists now.
        v_applied_condition_after := greatest(
          0,
          least(100, coalesce(v_current_condition, 100) - greatest(v_condition_used, 0))
        );

        insert into public.race_engine_stage_wear_applications (
          simulation_run_id, stage_id, race_id, club_id, target_type,
          target_table, target_id, target_key, condition_loss,
          applied_game_date, metadata
        ) values (
          p_simulation_run_id, v_stage_id, v_race_id, v_team_id, 'equipment',
          'club_equipment_inventory', v_resource_id,
          coalesce(
            (select inventory.equipment_category from public.club_equipment_inventory inventory where inventory.id = v_resource_id),
            'equipment'
          ),
          greatest(v_condition_used, 0), v_applied_game_date,
          jsonb_build_object(
            'source', 'phase11b_universal_application_manifest',
            'condition_before', v_condition_before,
            'condition_after', v_condition_after,
            'applied_condition_before', v_current_condition,
            'applied_condition_after', v_applied_condition_after,
            'stage_distance_km', v_stage_distance_km,
            'resource_update', v_resource_row
          )
        ) on conflict do nothing;

        if found then
          v_universal_log_inserted := v_universal_log_inserted + 1;

          update public.club_equipment_inventory inventory
          set
            condition_percent = v_applied_condition_after,
            last_used_game_date = coalesce(v_applied_game_date, inventory.last_used_game_date),
            total_distance_km = coalesce(inventory.total_distance_km, 0) + v_stage_distance_km,
            total_race_days = coalesce(inventory.total_race_days, 0) + 1
          where inventory.id = v_resource_id;

          select inventory.condition_percent
          into v_current_condition
          from public.club_equipment_inventory inventory
          where inventory.id = v_resource_id;
          if abs(coalesce(v_current_condition, 100) - v_applied_condition_after) > 0.02 then
            raise exception 'Phase 11B equipment post-application mismatch for %: current %, applied after %.',
              v_resource_id, v_current_condition, v_applied_condition_after;
          end if;

          v_universal_equipment_updated := v_universal_equipment_updated + 1;
        else
          v_universal_already_applied := v_universal_already_applied + 1;
        end if;
      else
        v_asset_key := coalesce(
          (select run.input_snapshot_json #>> array['preparation','assets',v_resource_id::text,'assetKey']
           from public.race_stage_simulation_runs run where run.id = p_simulation_run_id),
          ''
        );

        v_asset_table := case lower(v_asset_key)
          when 'team_car' then 'club_team_cars'
          when 'car' then 'club_team_cars'
          when 'team_bus' then 'club_team_buses'
          when 'bus' then 'club_team_buses'
          when 'equipment_van' then 'club_equipment_vans'
          when 'van' then 'club_equipment_vans'
          when 'mobile_workshop' then 'club_mobile_workshops'
          when 'workshop' then 'club_mobile_workshops'
          when 'medical_van' then 'club_medical_vans'
          when 'medical' then 'club_medical_vans'
          else null
        end;

        if v_asset_table is null then
          raise exception 'Phase 11B asset % has unsupported asset key %.', v_resource_id, v_asset_key;
        end if;

        execute format('select condition_percent from public.%I where id = $1 for update', v_asset_table)
          into v_current_condition
          using v_resource_id;

        if not found then
          raise exception 'Phase 11B asset % was not found in %.', v_resource_id, v_asset_table;
        end if;

        -- Same rule for shared race assets: the immutable manifest owns this
        -- stage's wear delta. Apply it to the row-locked current condition.
        v_applied_condition_after := greatest(
          0,
          least(100, coalesce(v_current_condition, 100) - greatest(v_condition_used, 0))
        );

        insert into public.race_engine_stage_wear_applications (
          simulation_run_id, stage_id, race_id, club_id, target_type,
          target_table, target_id, target_key, condition_loss,
          applied_game_date, metadata
        ) values (
          p_simulation_run_id, v_stage_id, v_race_id, v_team_id, 'asset',
          v_asset_table, v_resource_id, v_asset_key,
          greatest(v_condition_used, 0), v_applied_game_date,
          jsonb_build_object(
            'source', 'phase11b_universal_application_manifest',
            'condition_before', v_condition_before,
            'condition_after', v_condition_after,
            'applied_condition_before', v_current_condition,
            'applied_condition_after', v_applied_condition_after,
            'stage_distance_km', v_stage_distance_km,
            'resource_update', v_resource_row
          )
        ) on conflict do nothing;

        if found then
          v_universal_log_inserted := v_universal_log_inserted + 1;
          -- Asset tables share condition_percent/id, while usage counters have
          -- evolved independently across asset types. Apply the authoritative
          -- condition first, then update only optional counters that actually
          -- exist on the current production relation.
          execute format(
            'update public.%I set condition_percent = $1 where id = $2',
            v_asset_table
          ) using v_applied_condition_after, v_resource_id;

          if exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = v_asset_table and column_name = 'last_used_game_date'
          ) then
            execute format(
              'update public.%I set last_used_game_date = coalesce($1, last_used_game_date) where id = $2',
              v_asset_table
            ) using v_applied_game_date, v_resource_id;
          end if;

          if exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = v_asset_table and column_name = 'total_distance_km'
          ) then
            execute format(
              'update public.%I set total_distance_km = coalesce(total_distance_km, 0) + $1 where id = $2',
              v_asset_table
            ) using v_stage_distance_km, v_resource_id;
          end if;

          if exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = v_asset_table and column_name = 'total_race_days'
          ) then
            execute format(
              'update public.%I set total_race_days = coalesce(total_race_days, 0) + 1 where id = $1',
              v_asset_table
            ) using v_resource_id;
          end if;

          if exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = v_asset_table and column_name = 'updated_at'
          ) then
            execute format(
              'update public.%I set updated_at = clock_timestamp() where id = $1',
              v_asset_table
            ) using v_resource_id;
          end if;

          execute format('select condition_percent from public.%I where id = $1', v_asset_table)
            into v_current_condition
            using v_resource_id;
          if abs(coalesce(v_current_condition, 100) - v_applied_condition_after) > 0.02 then
            raise exception 'Phase 11B asset post-application mismatch for %: current %, applied after %.',
              v_resource_id, v_current_condition, v_applied_condition_after;
          end if;

          v_universal_asset_updated := v_universal_asset_updated + 1;
        else
          v_universal_already_applied := v_universal_already_applied + 1;
        end if;
      end if;
    end loop;

    return jsonb_build_object(
      'status', 'ok',
      'version', 'phase11b_manifest_exact_v1',
      'dry_run', false,
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id,
      'race_id', v_race_id,
      'manifest_resource_candidate_count', v_universal_candidate_count,
      'equipment_updated_count', v_universal_equipment_updated,
      'asset_updated_count', v_universal_asset_updated,
      'wear_log_inserted_count', v_universal_log_inserted,
      'already_applied_count', v_universal_already_applied
    );
  end if;

  -- v8.4: if a previous failed function call left this temp table in the
  -- same SQL editor/session transaction, recreate it cleanly.
  drop table if exists pg_temp.tmp_stage_equipment_plan_sources;

  create temp table tmp_stage_equipment_plan_sources (
    club_id uuid not null,
    rider_id uuid null,
    source_value_id uuid null,
    source_kind text not null
  ) on commit drop;

  -- -------------------------------------------------------------------
  -- Stage-plan source, schema-safe.
  -- Important: do not reference rsp.club_id or rsp.rider_id directly.
  -- row_to_json(rsp) returns only real columns, so missing fields become NULL.
  -- -------------------------------------------------------------------
  insert into tmp_stage_equipment_plan_sources (club_id, rider_id, source_value_id, source_kind)
  select distinct
    resolved.club_id,
    resolved.rider_id,
    resolved.source_value_id,
    'stage_plan_json'::text
  from public.race_stage_plans rsp
  cross join lateral (select row_to_json(rsp)::jsonb as rspj) rsp_json
  cross join lateral (
    select
      coalesce(
        nullif(rsp_json.rspj->>'race_preparation_id', ''),
        nullif(rsp_json.rspj->>'preparation_id', ''),
        nullif(rsp_json.rspj->>'race_plan_id', ''),
        nullif(rsp_json.rspj->>'race_preparation', '')
      ) as preparation_id_text,
      coalesce(
        nullif(rsp_json.rspj->>'rider_id', ''),
        nullif(rsp_json.rspj->>'selected_rider_id', ''),
        nullif(rsp_json.rspj->>'club_rider_id', '')
      ) as rider_id_text,
      coalesce(
        nullif(rsp_json.rspj #>> '{rider_equipment_json,id}', ''),
        nullif(rsp_json.rspj #>> '{rider_equipment_json,setup_id}', ''),
        nullif(rsp_json.rspj #>> '{rider_equipment_json,preset_id}', ''),
        nullif(rsp_json.rspj #>> '{rider_equipment_json,equipment_setup_id}', ''),
        nullif(rsp_json.rspj #>> '{equipment_json,id}', ''),
        nullif(rsp_json.rspj #>> '{equipment_json,setup_id}', ''),
        nullif(rsp_json.rspj #>> '{equipment_setup_json,id}', ''),
        nullif(rsp_json.rspj #>> '{equipment_preset_json,id}', '')
      ) as source_value_text
  ) raw_values
  left join public.race_preparations rp
    on row_to_json(rp)::jsonb->>'id' = raw_values.preparation_id_text
  cross join lateral (
    select
      coalesce(
        nullif(rsp_json.rspj->>'club_id', ''),
        nullif(rsp_json.rspj->>'team_id', ''),
        nullif(row_to_json(rp)::jsonb->>'club_id', ''),
        nullif(row_to_json(rp)::jsonb #>> '{metadata,participating_club_id}', '')
      ) as club_id_text
  ) club_source
  cross join lateral (
    select
      case
        when club_source.club_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then club_source.club_id_text::uuid
        else null
      end as club_id,
      case
        when raw_values.rider_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then raw_values.rider_id_text::uuid
        else null
      end as rider_id,
      case
        when raw_values.source_value_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then raw_values.source_value_text::uuid
        else null
      end as source_value_id
  ) resolved
  where rsp.stage_id = v_stage_id
    and resolved.club_id is not null
    and (
      resolved.rider_id is not null
      or resolved.source_value_id is not null
      or rsp_json.rspj ? 'rider_equipment_json'
      or rsp_json.rspj ? 'equipment_json'
      or rsp_json.rspj ? 'equipment_setup_json'
      or rsp_json.rspj ? 'equipment_preset_json'
    );

  get diagnostics v_inserted_direct_plan_rows = row_count;

  -- -------------------------------------------------------------------
  -- Race-preparation source, schema-safe.
  -- Important: do not reference rpr.rider_id directly. Use row_to_json.
  -- This fallback is necessary because the current race_stage_plans table is
  -- not one-row-per-rider in this DB.
  -- -------------------------------------------------------------------
  if to_regclass('public.race_preparation_riders') is not null then
    insert into tmp_stage_equipment_plan_sources (club_id, rider_id, source_value_id, source_kind)
    select distinct
      resolved.club_id,
      resolved.rider_id,
      resolved.source_value_id,
      'race_preparation_riders'::text
    from public.race_preparation_riders rpr
    cross join lateral (select row_to_json(rpr)::jsonb as rprj) rpr_json
    join public.race_preparations rp
      on row_to_json(rp)::jsonb->>'id' = coalesce(
        nullif(rpr_json.rprj->>'race_preparation_id', ''),
        nullif(rpr_json.rprj->>'preparation_id', ''),
        nullif(rpr_json.rprj->>'race_plan_id', '')
      )
    cross join lateral (select row_to_json(rp)::jsonb as rpj) rp_json
    cross join lateral (
      select
        coalesce(
          nullif(rp_json.rpj->>'club_id', ''),
          nullif(rp_json.rpj #>> '{metadata,participating_club_id}', '')
        ) as club_id_text,
        coalesce(
          nullif(rpr_json.rprj->>'rider_id', ''),
          nullif(rpr_json.rprj->>'selected_rider_id', ''),
          nullif(rpr_json.rprj->>'club_rider_id', '')
        ) as rider_id_text,
        coalesce(
          nullif(rpr_json.rprj #>> '{rider_equipment_json,id}', ''),
          nullif(rpr_json.rprj #>> '{rider_equipment_json,setup_id}', ''),
          nullif(rpr_json.rprj #>> '{rider_equipment_json,preset_id}', ''),
          nullif(rpr_json.rprj #>> '{rider_equipment_json,equipment_setup_id}', ''),
          nullif(rpr_json.rprj #>> '{equipment_json,id}', ''),
          nullif(rpr_json.rprj #>> '{equipment_json,setup_id}', ''),
          nullif(rpr_json.rprj #>> '{equipment_setup_json,id}', ''),
          nullif(rpr_json.rprj #>> '{equipment_preset_json,id}', '')
        ) as source_value_text
    ) raw_values
    cross join lateral (
      select
        case
          when raw_values.club_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then raw_values.club_id_text::uuid
          else null
        end as club_id,
        case
          when raw_values.rider_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then raw_values.rider_id_text::uuid
          else null
        end as rider_id,
        case
          when raw_values.source_value_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then raw_values.source_value_text::uuid
          else null
        end as source_value_id
    ) resolved
    where rp_json.rpj->>'race_id' = v_race_id::text
      and resolved.club_id is not null
      and resolved.rider_id is not null;

    get diagnostics v_inserted_prep_plan_rows = row_count;
  end if;

  select count(*) into v_inserted_plan_rows from tmp_stage_equipment_plan_sources;

  -- v8.4: same safety for the candidate temp table.
  drop table if exists pg_temp.tmp_stage_equipment_wear_candidates;

  create temp table tmp_stage_equipment_wear_candidates (
    inventory_item_id uuid primary key,
    club_id uuid,
    catalog_item_id uuid,
    equipment_category text,
    display_name text,
    rider_use_count integer,
    allocated_physical_use_count integer,
    planned_loss numeric,
    already_applied boolean,
    pending_loss numeric,
    match_type text,
    source_value_id uuid
  ) on commit drop;

  -- -------------------------------------------------------------------
  -- Equipment matching strategy v8.5:
  -- 1) Count planned riders per club from schema-safe plan sources.
  -- 2) If equipment wear was already logged for this simulation run, treat
  --    those logged physical inventory rows as the fixed candidate set.
  --    This prevents a post-apply dry-run from selecting different equipment
  --    after condition_percent changed.
  -- 3) Only fill missing slots per club/category from unlogged inventory.
  -- 4) Limit setup/preset equipment matching to one physical item per rider
  --    per category.
  -- -------------------------------------------------------------------
  insert into tmp_stage_equipment_wear_candidates (
    inventory_item_id,
    club_id,
    catalog_item_id,
    equipment_category,
    display_name,
    rider_use_count,
    allocated_physical_use_count,
    planned_loss,
    already_applied,
    pending_loss,
    match_type,
    source_value_id
  )
  with planned_riders as (
    select
      club_id,
      greatest(1, count(distinct rider_id))::integer as rider_count,
      (array_agg(source_value_id order by source_value_id::text nulls last))[1] as source_value_id
    from tmp_stage_equipment_plan_sources
    where club_id is not null
      and rider_id is not null
    group by club_id
  ),
  required_categories as (
    select
      pr.club_id,
      pr.rider_count,
      pr.source_value_id,
      c.equipment_category
    from planned_riders pr
    cross join unnest(v_categories) as c(equipment_category)
  ),
  equipment_catalog_rows as (
    select
      ec.id as catalog_item_id,
      lower(coalesce(
        nullif(ecj->>'equipment_category', ''),
        nullif(ecj->>'category', ''),
        nullif(ecj->>'item_category', ''),
        nullif(ecj->>'type', '')
      )) as equipment_category,
      coalesce(
        nullif(ecj->>'display_name', ''),
        nullif(ecj->>'name', ''),
        nullif(ecj->>'item_name', ''),
        nullif(ecj->>'model_name', ''),
        nullif(ecj->>'model', ''),
        nullif(ecj->>'brand', ''),
        ec.id::text
      ) as display_name,
      case
        when coalesce(
          nullif(ecj->>'condition_loss_per_race_day', ''),
          nullif(ecj->>'wear_per_race_day', ''),
          nullif(ecj->>'condition_loss', ''),
          nullif(ecj->>'race_day_condition_loss', '')
        ) ~ '^[0-9]+(\.[0-9]+)?$'
        then coalesce(
          nullif(ecj->>'condition_loss_per_race_day', ''),
          nullif(ecj->>'wear_per_race_day', ''),
          nullif(ecj->>'condition_loss', ''),
          nullif(ecj->>'race_day_condition_loss', '')
        )::numeric
        else 0::numeric
      end as condition_loss_per_race_day
    from public.equipment_catalog ec
    cross join lateral (select row_to_json(ec)::jsonb as ecj) j
  ),
  logged_equipment as (
    select
      wea.target_id as inventory_item_id,
      coalesce(wea.club_id, cei.club_id) as club_id,
      cei.catalog_item_id,
      lower(coalesce(cei.equipment_category, ecr.equipment_category, wea.target_key)) as equipment_category,
      coalesce(nullif(cei.display_name, ''), ecr.display_name, wea.target_id::text) as display_name,
      rc.rider_count as rider_use_count,
      rc.rider_count as allocated_physical_use_count,
      coalesce(wea.condition_loss, 0)::numeric(10,3) as planned_loss,
      'setup_preset_limited'::text as match_type,
      rc.source_value_id,
      true as already_applied,
      0::numeric(10,3) as pending_loss,
      0 as source_priority
    from public.race_engine_stage_wear_applications wea
    join public.club_equipment_inventory cei
      on cei.id = wea.target_id
    left join equipment_catalog_rows ecr
      on ecr.catalog_item_id = cei.catalog_item_id
    join required_categories rc
      on rc.club_id = coalesce(wea.club_id, cei.club_id)
     and rc.equipment_category = lower(coalesce(cei.equipment_category, ecr.equipment_category, wea.target_key))
    where wea.simulation_run_id = p_simulation_run_id
      and wea.target_type = 'equipment'
      and wea.target_table = 'club_equipment_inventory'
  ),
  logged_counts as (
    select
      club_id,
      equipment_category,
      count(*)::integer as logged_count
    from logged_equipment
    group by club_id, equipment_category
  ),
  ranked_unlogged_inventory as (
    select
      cei.id as inventory_item_id,
      cei.club_id,
      cei.catalog_item_id,
      lower(coalesce(cei.equipment_category, ecr.equipment_category)) as equipment_category,
      coalesce(nullif(cei.display_name, ''), ecr.display_name, cei.id::text) as display_name,
      ecr.condition_loss_per_race_day,
      row_number() over (
        partition by cei.club_id, lower(coalesce(cei.equipment_category, ecr.equipment_category))
        order by
          coalesce(cei.condition_percent, 100) desc,
          cei.id::text asc
      ) as physical_rank
    from public.club_equipment_inventory cei
    join equipment_catalog_rows ecr on ecr.catalog_item_id = cei.catalog_item_id
    left join public.race_engine_stage_wear_applications existing_log
      on existing_log.simulation_run_id = p_simulation_run_id
     and existing_log.target_type = 'equipment'
     and existing_log.target_table = 'club_equipment_inventory'
     and existing_log.target_id = cei.id
    where cei.club_id in (select club_id from planned_riders)
      and lower(coalesce(cei.equipment_category, ecr.equipment_category)) = any(v_categories)
      and coalesce(cei.condition_percent, 100) > 0
      and existing_log.id is null
  ),
  fill_candidates as (
    select
      rui.inventory_item_id,
      rui.club_id,
      rui.catalog_item_id,
      rui.equipment_category,
      rui.display_name,
      rc.rider_count as rider_use_count,
      rc.rider_count as allocated_physical_use_count,
      greatest(
        0,
        (v_stage_distance_km / 100.0)
        * coalesce(nullif(rui.condition_loss_per_race_day, 0), 0.35)
        * (
          1
          - least(
              30,
              coalesce(
                (public.equipment_get_mechanic_effects_v1(rui.club_id, null::uuid[])->>'condition_loss_reduction_pct')::numeric,
                0
              )
            ) / 100.0
        )
      )::numeric(10,3) as planned_loss,
      'setup_preset_limited'::text as match_type,
      rc.source_value_id,
      false as already_applied,
      greatest(
        0,
        (v_stage_distance_km / 100.0)
        * coalesce(nullif(rui.condition_loss_per_race_day, 0), 0.35)
        * (
          1
          - least(
              30,
              coalesce(
                (public.equipment_get_mechanic_effects_v1(rui.club_id, null::uuid[])->>'condition_loss_reduction_pct')::numeric,
                0
              )
            ) / 100.0
        )
      )::numeric(10,3) as pending_loss,
      1 as source_priority
    from required_categories rc
    join ranked_unlogged_inventory rui
      on rui.club_id = rc.club_id
     and rui.equipment_category = rc.equipment_category
    left join logged_counts lc
      on lc.club_id = rc.club_id
     and lc.equipment_category = rc.equipment_category
    where rui.physical_rank <= greatest(0, rc.rider_count - coalesce(lc.logged_count, 0))
  ),
  raw_candidates as (
    select * from logged_equipment
    union all
    select * from fill_candidates
  ),
  consolidated as (
    select distinct on (rc.inventory_item_id)
      rc.inventory_item_id,
      rc.club_id,
      rc.catalog_item_id,
      rc.equipment_category,
      rc.display_name,
      rc.rider_use_count,
      rc.allocated_physical_use_count,
      rc.planned_loss,
      rc.already_applied,
      rc.pending_loss,
      rc.match_type,
      rc.source_value_id
    from raw_candidates rc
    order by rc.inventory_item_id, rc.source_priority, rc.equipment_category
  )
  select
    c.inventory_item_id,
    c.club_id,
    c.catalog_item_id,
    c.equipment_category,
    c.display_name,
    c.rider_use_count,
    c.allocated_physical_use_count,
    c.planned_loss,
    c.already_applied,
    c.pending_loss,
    c.match_type,
    c.source_value_id
  from consolidated c;

  -- p_dry_run=true is the safe/default path and performs no writes.
  if not p_dry_run then
    insert into public.race_engine_stage_wear_applications (
      simulation_run_id,
      stage_id,
      race_id,
      club_id,
      target_type,
      target_table,
      target_id,
      target_key,
      condition_loss,
      applied_game_date,
      metadata
    )
    select
      p_simulation_run_id,
      v_stage_id,
      v_race_id,
      c.club_id,
      'equipment',
      'club_equipment_inventory',
      c.inventory_item_id,
      c.equipment_category,
      c.pending_loss,
      v_applied_game_date,
      jsonb_build_object(
        'source', 'race_engine_stage_interactions_v8_5',
        'match_type', c.match_type,
        'catalog_item_id', c.catalog_item_id,
        'source_value_id', c.source_value_id,
        'display_name', c.display_name,
        'stage_distance_km', v_stage_distance_km,
        'rider_use_count', c.rider_use_count,
        'allocated_physical_use_count', c.allocated_physical_use_count
      )
    from tmp_stage_equipment_wear_candidates c
    where c.pending_loss > 0
      and c.already_applied = false
    on conflict (simulation_run_id, target_type, target_table, target_id) do nothing;

    get diagnostics v_inserted_equipment_log_count = row_count;

    update public.club_equipment_inventory cei
    set
      condition_percent = greatest(0, coalesce(cei.condition_percent, 100) - c.pending_loss),
      last_used_game_date = coalesce(v_applied_game_date, cei.last_used_game_date),
      total_distance_km = coalesce(cei.total_distance_km, 0) + v_stage_distance_km,
      total_race_days = coalesce(cei.total_race_days, 0) + 1
    from tmp_stage_equipment_wear_candidates c
    join public.race_engine_stage_wear_applications wea
      on wea.simulation_run_id = p_simulation_run_id
     and wea.target_type = 'equipment'
     and wea.target_table = 'club_equipment_inventory'
     and wea.target_id = c.inventory_item_id
     and wea.metadata->>'source' = 'race_engine_stage_interactions_v8_5'
    where cei.id = c.inventory_item_id
      and c.pending_loss > 0
      and c.already_applied = false;

    get diagnostics v_updated_equipment_count = row_count;
  end if;

  v_result := jsonb_build_object(
    'status', 'ok',
    'version', 'v8_5_log_locked_equipment_candidates',
    'dry_run', p_dry_run,
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'race_id', v_race_id,
    'stage_distance_km', v_stage_distance_km,
    'plan_source_rows', v_inserted_plan_rows,
    'plan_source_rows_from_stage_plan_json', v_inserted_direct_plan_rows,
    'plan_source_rows_from_race_preparation_riders', v_inserted_prep_plan_rows,
    'plan_sources_by_kind', coalesce((
      select jsonb_agg(jsonb_build_object('source_kind', source_kind, 'rows', rows, 'riders', riders) order by source_kind)
      from (
        select source_kind, count(*) as rows, count(distinct rider_id) as riders
        from tmp_stage_equipment_plan_sources
        group by source_kind
      ) s
    ), '[]'::jsonb),
    'planned_riders_by_club', coalesce((
      select jsonb_agg(jsonb_build_object('club_id', club_id, 'rider_count', rider_count) order by club_id::text)
      from (
        select club_id, count(distinct rider_id) as rider_count
        from tmp_stage_equipment_plan_sources
        where rider_id is not null
        group by club_id
      ) pr
    ), '[]'::jsonb),
    'equipment_candidate_count', (select count(*) from tmp_stage_equipment_wear_candidates),
    'equipment_pending_count', (select count(*) from tmp_stage_equipment_wear_candidates where pending_loss > 0),
    'equipment_already_applied_count', (select count(*) from tmp_stage_equipment_wear_candidates where already_applied),
    'equipment_updated_count', v_updated_equipment_count,
    'equipment_log_inserted_count', v_inserted_equipment_log_count,
    'asset_existing_log_count', (
      select count(*)
      from public.race_engine_stage_wear_applications wea
      where wea.simulation_run_id = p_simulation_run_id
        and wea.target_type = 'asset'
    ),
    'asset_existing_logs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'target_table', wea.target_table,
          'target_id', wea.target_id,
          'target_key', wea.target_key,
          'condition_loss', wea.condition_loss,
          'already_applied', true,
          'pending_loss', 0,
          'applied_game_date', wea.applied_game_date,
          'metadata', wea.metadata
        )
        order by wea.target_table, wea.target_key, wea.target_id::text
      )
      from public.race_engine_stage_wear_applications wea
      where wea.simulation_run_id = p_simulation_run_id
        and wea.target_type = 'asset'
    ), '[]'::jsonb),
    'equipment_candidates', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'inventory_item_id', c.inventory_item_id,
          'club_id', c.club_id,
          'catalog_item_id', c.catalog_item_id,
          'equipment_category', c.equipment_category,
          'display_name', c.display_name,
          'rider_use_count', c.rider_use_count,
          'allocated_physical_use_count', c.allocated_physical_use_count,
          'planned_loss', c.planned_loss,
          'already_applied', c.already_applied,
          'pending_loss', c.pending_loss,
          'match_type', c.match_type,
          'source_value_id', c.source_value_id
        )
        order by c.club_id::text, c.equipment_category, c.display_name, c.inventory_item_id::text
      )
      from tmp_stage_equipment_wear_candidates c
    ), '[]'::jsonb),
    'debug_schema_columns', coalesce((
      select jsonb_object_agg(table_name, columns)
      from (
        select
          table_name,
          jsonb_agg(column_name order by ordinal_position) as columns
        from information_schema.columns
        where table_schema = 'public'
          and table_name in (
            'race_stage_plans',
            'race_preparation_riders',
            'race_preparations',
            'club_equipment_inventory',
            'equipment_catalog'
          )
        group by table_name
      ) c
    ), '{}'::jsonb)
  );

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_stage_post_audit_extras_v1(p_simulation_run_id uuid, p_write_tactical_events boolean DEFAULT true, p_apply_wear boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tactical jsonb := '{}'::jsonb;
  v_wear jsonb := '{}'::jsonb;
begin
  if p_write_tactical_events then
    v_tactical := public.race_engine_generate_tactical_report_events_v1(p_simulation_run_id, null);
  end if;

  -- p_apply_wear=false means dry-run true.
  v_wear := public.race_engine_apply_stage_equipment_asset_wear_v1(p_simulation_run_id, not p_apply_wear);

  return jsonb_build_object(
    'status', 'ok',
    'simulation_run_id', p_simulation_run_id,
    'tactical_events', v_tactical,
    'equipment_asset_wear', v_wear
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_prepare_main_offer_deal_metadata_v1(p_offer_id uuid, p_deal_type text DEFAULT 'standard'::text, p_uplift_pct numeric DEFAULT NULL::numeric, p_display_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_offer public.club_sponsor_offers%rowtype;
  v_company_name text;
  v_uplift numeric(5,2);
  v_bonus_uplift numeric(5,2);
  v_proration numeric;
  v_display_name text;
  v_new_guaranteed bigint;
  v_new_bonus bigint;
  v_new_monthly bigint;
begin
  if p_offer_id is null then
    raise exception 'Offer id is required.';
  end if;

  if p_deal_type not in ('standard', 'naming_rights') then
    raise exception 'Invalid main sponsor deal type: %', p_deal_type;
  end if;

  select *
    into v_offer
  from public.club_sponsor_offers o
  where o.id = p_offer_id
  for update;

  if not found then
    raise exception 'Sponsor offer not found.';
  end if;

  if v_offer.sponsor_kind <> 'main' then
    raise exception 'Only main sponsor offers can use main sponsor deal types.';
  end if;

  if v_offer.status <> 'offered' then
    raise exception 'Only offered sponsor offers can be prepared.';
  end if;

  if auth.uid() is not null
     and not finance.is_club_member_or_owner(v_offer.club_id, auth.uid()) then
    raise exception 'Not allowed to update this sponsor offer.';
  end if;

  select sc.name
    into v_company_name
  from public.sponsor_companies sc
  where sc.id = v_offer.company_id;

  v_company_name := coalesce(v_company_name, 'Sponsor');

  v_proration := greatest(
    0.01,
    least(
      1.0,
      coalesce(
        v_offer.proration_factor,
        (coalesce(v_offer.coverage_months, 12)::numeric / 12.0),
        1.0
      )
    )
  );

  if p_deal_type = 'naming_rights' then
    v_uplift := coalesce(
      p_uplift_pct,
      30 + (((('x' || substr(md5(p_offer_id::text || '|naming-premium-v4'), 1, 8))::bit(32)::bigint) % 1001)::numeric / 100.0)
    );
    -- Old callers may still pass a 20-30 value. Clamp them into the new 30-40 policy
    -- rather than breaking existing transition/retry code.
    v_uplift := round(greatest(30, least(40, v_uplift)), 2);
    v_bonus_uplift := v_uplift;

    v_display_name := regexp_replace(
      trim(coalesce(nullif(p_display_name, ''), v_company_name || ' Team')),
      '\s+',
      ' ',
      'g'
    );

    if length(v_display_name) not between 3 and 60 then
      raise exception 'Naming-rights display name must be between 3 and 60 characters.';
    end if;
  else
    v_uplift := 0;
    v_bonus_uplift := 0;
    v_display_name := null;
  end if;

  v_new_guaranteed := floor(
    greatest(0, coalesce(v_offer.full_season_guaranteed_amount, v_offer.guaranteed_amount, 0))
    * v_proration
    * (1 + (v_uplift / 100.0))
  )::bigint;

  v_new_bonus := floor(
    greatest(0, coalesce(v_offer.full_season_bonus_pool_amount, v_offer.bonus_pool_amount, 0))
    * v_proration
    * (1 + (v_bonus_uplift / 100.0))
  )::bigint;

  v_new_monthly := case
    when coalesce(v_offer.coverage_months, 0) > 0 then
      floor(v_new_guaranteed::numeric / v_offer.coverage_months)::bigint
    else
      v_new_guaranteed
  end;

  update public.club_sponsor_offers o
  set
    main_sponsor_deal_type = p_deal_type,
    naming_rights_uplift_pct = v_uplift,
    guaranteed_amount = v_new_guaranteed,
    bonus_pool_amount = v_new_bonus,
    monthly_amount = v_new_monthly,
    metadata = coalesce(o.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'deal_type', p_deal_type,
        'main_sponsor_deal_type', p_deal_type,
        'requires_team_name_change', p_deal_type = 'naming_rights',
        'naming_rights_uplift_pct', v_uplift,
        'naming_rights_bonus_uplift_pct', v_bonus_uplift,
        'naming_rights_policy_version', 'v4_min_30',
        'season_display_name', v_display_name,
        'full_display_name_preview',
          case
            when v_display_name is not null then v_display_name || ' (Original club name)'
            else null
          end,
        'branding_locked_fields',
          case
            when p_deal_type = 'naming_rights'
            then jsonb_build_array('name', 'primary_color', 'secondary_color')
            else '[]'::jsonb
          end
      )
  where o.id = p_offer_id;

  return p_offer_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_apply_naming_rights_identity_from_contract_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_requires_name_change boolean;
  v_club public.clubs%rowtype;
  v_identity_id uuid;
  v_display_name text;
  v_game_date date;
  v_ends_date date;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.sponsor_kind <> 'main' then
    return new;
  end if;

  v_requires_name_change :=
    new.main_sponsor_deal_type = 'naming_rights'
    or coalesce(new.metadata ->> 'deal_type', '') = 'naming_rights'
    or coalesce(new.metadata ->> 'main_sponsor_deal_type', '') = 'naming_rights'
    or coalesce((new.metadata ->> 'requires_team_name_change')::boolean, false) = true;

  if not v_requires_name_change then
    return new;
  end if;

  select *
  into v_club
  from public.clubs c
  where c.id = new.club_id
  for update;

  if not found then
    return new;
  end if;

  if exists (
    select 1
    from public.club_season_identities i
    where i.club_id = new.club_id
      and i.season_number = new.season_number
      and i.source_type = 'sponsor_naming_rights'
      and i.source_sponsor_id = new.id
      and i.is_active = true
  ) then
    return new;
  end if;

  v_game_date := public.get_current_game_date_safe_v1();

  v_ends_date := coalesce(
    new.ends_at::date,
    make_date(extract(year from v_game_date)::integer, 12, 31)
  );

  v_display_name := regexp_replace(
    trim(coalesce(nullif(new.metadata ->> 'season_display_name', ''), new.name || ' Team')),
    '\s+',
    ' ',
    'g'
  );

  if length(v_display_name) not between 3 and 60 then
    v_display_name := left(new.name || ' Team', 60);
  end if;

  -- Only one active naming-rights identity per club/season.
  update public.club_season_identities i
  set is_active = false
  where i.club_id = new.club_id
    and i.season_number = new.season_number
    and i.source_type = 'sponsor_naming_rights'
    and i.is_active = true;

  insert into public.club_season_identities (
    club_id,
    season_number,
    display_name,
    original_club_name,
    source_type,
    source_sponsor_id,
    primary_color,
    secondary_color,
    original_primary_color,
    original_secondary_color,
    starts_game_date,
    ends_game_date,
    is_active,
    metadata
  )
  values (
    new.club_id,
    new.season_number,
    v_display_name,
    v_club.name,
    'sponsor_naming_rights',
    new.id,
    null,
    null,
    v_club.primary_color,
    v_club.secondary_color,
    v_game_date,
    v_ends_date,
    true,
    jsonb_build_object(
      'deal_type', 'naming_rights',
      'requires_team_name_change', true,
      'season_display_name', v_display_name,
      'original_club_name', v_club.name,
      'full_display_name', v_display_name || ' (' || v_club.name || ')',
      'branding_locked_fields', jsonb_build_array('name', 'primary_color', 'secondary_color'),
      'source', 'sponsor_contract_trigger'
    )
  )
  returning id
  into v_identity_id;

  update public.club_sponsors cs
  set
    main_sponsor_deal_type = 'naming_rights',
    metadata = coalesce(cs.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'deal_type', 'naming_rights',
        'main_sponsor_deal_type', 'naming_rights',
        'requires_team_name_change', true,
        'season_display_name', v_display_name,
        'original_club_name', v_club.name,
        'full_display_name', v_display_name || ' (' || v_club.name || ')',
        'season_identity_id', v_identity_id,
        'branding_locked_fields', jsonb_build_array('name', 'primary_color', 'secondary_color')
      )
  where cs.id = new.id;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_sync_naming_rights_from_accepted_offer_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_is_naming_rights boolean;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.sponsor_kind <> 'main' then
    return new;
  end if;

  if new.status <> 'accepted' then
    return new;
  end if;

  v_is_naming_rights :=
    new.main_sponsor_deal_type = 'naming_rights'
    or coalesce(new.metadata ->> 'deal_type', '') = 'naming_rights'
    or coalesce(new.metadata ->> 'main_sponsor_deal_type', '') = 'naming_rights'
    or coalesce((new.metadata ->> 'requires_team_name_change')::boolean, false) = true;

  if not v_is_naming_rights then
    return new;
  end if;

  update public.club_sponsors cs
  set
    main_sponsor_deal_type = 'naming_rights',
    metadata = coalesce(cs.metadata, '{}'::jsonb)
      || coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'deal_type', 'naming_rights',
        'main_sponsor_deal_type', 'naming_rights',
        'requires_team_name_change', true,
        'accepted_offer_id', new.id,
        'naming_rights_uplift_pct', new.naming_rights_uplift_pct
      )
  where cs.club_id = new.club_id
    and cs.season_number = new.season_number
    and cs.company_id = new.company_id
    and cs.sponsor_kind = 'main';

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_objective_required_result_v1(p_objective_code text, p_title text, p_position integer DEFAULT 1)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_text text;
begin
  v_text := lower(coalesce(p_objective_code, '') || ' ' || coalesce(p_title, ''));

  if v_text like '%stage%win%' then
    return 'stage_win';
  end if;

  if v_text like '%gc%top%5%' or v_text like '%general%top%5%' then
    return 'gc_top_5';
  end if;

  if v_text like '%gc%top%10%' or v_text like '%general%top%10%' then
    return 'gc_top_10';
  end if;

  if v_text like '%top%5%' then
    return 'race_top_5';
  end if;

  if v_text like '%top%10%' then
    return 'race_top_10';
  end if;

  if v_text like '%podium%' then
    return 'race_podium';
  end if;

  if v_text like '%win%' then
    return 'race_win';
  end if;

  if v_text like '%start%' or v_text like '%participat%' then
    return 'race_start';
  end if;

  -- fallback by objective ordering/value
  if p_position = 1 then
    return 'race_top_10';
  elsif p_position = 2 then
    return 'race_start';
  else
    return 'race_start';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_attach_race_targets_to_main_sponsor_v1(p_club_sponsor_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sponsor public.club_sponsors%rowtype;
  v_company_country text;
  v_club_tier text;
  v_game_date date;
  v_updated integer := 0;
  v_unscheduled integer := 0;
  v_objective record;
  v_race record;
  v_required_result text;
  v_position integer := 0;
  v_objective_count integer := 0;
  v_allow_prestige_fallback boolean;
begin
  if p_club_sponsor_id is null then
    raise exception 'Signed sponsor id is required.';
  end if;

  select *
  into v_sponsor
  from public.club_sponsors cs
  where cs.id = p_club_sponsor_id
  for update;

  if not found then
    raise exception 'Signed sponsor not found.';
  end if;

  if v_sponsor.sponsor_kind <> 'main' then
    raise exception 'Only main sponsors can have race-target objectives.';
  end if;

  if auth.uid() is not null
     and not finance.is_club_member_or_owner(v_sponsor.club_id, auth.uid()) then
    raise exception 'Not allowed to update sponsor objectives for this club.';
  end if;

  v_game_date := public.get_current_game_date_safe_v1();

  v_company_country := upper(coalesce(
    nullif(v_sponsor.metadata ->> 'company_country_code', ''),
    nullif(v_sponsor.country_code, '')
  ));

  v_club_tier := lower(coalesce(
    nullif(v_sponsor.metadata ->> 'club_tier', ''),
    'worldteam'
  ));

  select count(*)
  into v_objective_count
  from public.club_sponsor_objectives o
  where o.club_sponsor_id = p_club_sponsor_id
    and o.status = 'active';

  for v_objective in
    select
      o.*,
      row_number() over (order by o.reward_amount desc nulls last, o.created_at asc) as objective_position
    from public.club_sponsor_objectives o
    where o.club_sponsor_id = p_club_sponsor_id
      and o.status = 'active'
      and (
        p_force = true
        or o.target_race_id is null
      )
    order by o.reward_amount desc nulls last, o.created_at asc
  loop
    v_position := v_objective.objective_position;

    v_required_result := public.sponsor_objective_required_result_v1(
      v_objective.objective_code,
      v_objective.title,
      v_position
    );

    /*
      Important:
      Only allow fallback outside sponsor/objective country for real prestige goals.
      Do NOT allow a WorldTeam regional objective to pick a random 2.2 race abroad.
    */
    v_allow_prestige_fallback :=
      v_club_tier in ('worldteam', 'proteam', 'world_team', 'pro_team')
      and v_required_result in (
        'stage_win',
        'gc_top_5',
        'gc_top_10',
        'race_win',
        'race_podium',
        'race_top_5',
        'race_top_10'
      );

    select
      r.id,
      r.name,
      r.start_date,
      r.end_date,
      r.country_code,
      r.category,
      r.race_type,
      case
        when v_company_country is not null and upper(r.country_code) = v_company_country then 0
        when v_objective.country_code is not null and upper(r.country_code) = upper(v_objective.country_code) then 1
        else 2
      end as priority_bucket
    into v_race
    from public.races r
    where coalesce(r.end_date, r.start_date) >= v_game_date
      and (
        -- Preferred: sponsor country
        (v_company_country is not null and upper(r.country_code) = v_company_country)

        -- Also allowed: country already stored on objective
        or (v_objective.country_code is not null and upper(r.country_code) = upper(v_objective.country_code))

        -- Prestige fallback only for high-tier races, never random low-tier 2.2 abroad
        or (
          v_allow_prestige_fallback
          and (
            r.category ilike '%UWT%'
            or r.category ilike '%World%'
            or r.category ilike '%2.1%'
            or r.category ilike '%1.1%'
            or r.category ilike '%2.Pro%'
            or r.category ilike '%1.Pro%'
          )
        )
      )
    order by
      case
        when v_company_country is not null and upper(r.country_code) = v_company_country then 0
        when v_objective.country_code is not null and upper(r.country_code) = upper(v_objective.country_code) then 1
        else 2
      end,
      r.start_date asc,
      case
        when r.category ilike '%UWT%' then 0
        when r.category ilike '%2.Pro%' or r.category ilike '%1.Pro%' then 1
        when r.category ilike '%2.1%' or r.category ilike '%1.1%' then 2
        when r.category ilike '%2.2%' or r.category ilike '%1.2%' then 3
        else 4
      end,
      r.name asc
    limit 1;

    if v_race.id is null then
      update public.club_sponsor_objectives o
      set
        check_state = 'not_scheduled',
        target_race_id = null,
        target_stage_id = null,
        target_check_game_date = null,
        metadata = coalesce(o.metadata, '{}'::jsonb)
          || jsonb_build_object(
            'target_type', 'none',
            'objective_family', 'sponsor_result',
            'required_result', v_required_result,
            'target_assignment_status', 'no_realistic_remaining_race',
            'target_assignment_note', 'No suitable sponsor-country, objective-country, or prestige race remains. Objective is not forced.',
            'assigned_by', 'sponsor_attach_race_targets_to_main_sponsor_v1',
            'assigned_at', now()
          )
      where o.id = v_objective.id;

      v_unscheduled := v_unscheduled + 1;
    else
      update public.club_sponsor_objectives o
      set
        target_race_id = v_race.id,
        target_stage_id = null,
        target_check_game_date = coalesce(v_race.end_date, v_race.start_date),
        check_state = 'scheduled',
        metadata = coalesce(o.metadata, '{}'::jsonb)
          || jsonb_build_object(
            'target_type', 'race',
            'objective_family',
              case
                when v_race.priority_bucket in (0, 1) then 'regional_result'
                else 'prestige_result'
              end,
            'required_result', v_required_result,
            'race_id', v_race.id,
            'race_name', v_race.name,
            'race_category', v_race.category,
            'race_type', v_race.race_type,
            'target_country_code', v_race.country_code,
            'check_after', 'race_finished',
            'check_game_date', coalesce(v_race.end_date, v_race.start_date),
            'user_visible_deadline_label',
              'Checked after ' || v_race.name || ' finishes',
            'target_assignment_status', 'scheduled',
            'assigned_by', 'sponsor_attach_race_targets_to_main_sponsor_v1',
            'assigned_at', now()
          )
      where o.id = v_objective.id;

      v_updated := v_updated + 1;
    end if;

    v_race := null;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'club_sponsor_id', p_club_sponsor_id,
    'club_id', v_sponsor.club_id,
    'sponsor_name', v_sponsor.name,
    'sponsor_country_code', v_company_country,
    'club_tier', v_club_tier,
    'current_game_date', v_game_date,
    'active_objective_count', v_objective_count,
    'objectives_scheduled', v_updated,
    'objectives_not_scheduled', v_unscheduled,
    'important_note', 'Strict target selection is active. Unrelated low-category races abroad are not assigned.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_cleanup_unscheduled_objective_metadata_v1(p_club_sponsor_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_updated integer := 0;
begin
  if p_club_sponsor_id is null then
    raise exception 'Signed sponsor id is required.';
  end if;

  if auth.uid() is not null then
    if not exists (
      select 1
      from public.club_sponsors cs
      where cs.id = p_club_sponsor_id
        and finance.is_club_member_or_owner(cs.club_id, auth.uid())
    ) then
      raise exception 'Not allowed to clean sponsor objectives for this club.';
    end if;
  end if;

  update public.club_sponsor_objectives o
  set
    metadata =
      (
        coalesce(o.metadata, '{}'::jsonb)
        - 'race_id'
        - 'race_name'
        - 'race_type'
        - 'race_category'
        - 'check_game_date'
        - 'target_country_code'
        - 'user_visible_deadline_label'
        - 'check_after'
      )
      || jsonb_build_object(
        'target_type', 'none',
        'target_assignment_status', 'no_realistic_remaining_race',
        'target_assignment_note', 'No suitable sponsor-country, objective-country, or prestige race remains. Objective is not forced.',
        'user_visible_deadline_label', 'No eligible remaining race target this season'
      )
  where o.club_sponsor_id = p_club_sponsor_id
    and o.check_state = 'not_scheduled';

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_normalize_objective_modes_v1(p_club_sponsor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sponsor public.club_sponsors%rowtype; v_game_date date; v_cleaned int:=0; v_updated int:=0; v_row_count int:=0; v_season_end date;
begin
  if p_club_sponsor_id is null then raise exception 'Signed sponsor id is required.'; end if;
  select * into v_sponsor from public.club_sponsors where id=p_club_sponsor_id for update;
  if not found then raise exception 'Signed sponsor not found.'; end if;
  if auth.uid() is not null and not finance.is_club_member_or_owner(v_sponsor.club_id,auth.uid()) then raise exception 'Not allowed to normalize sponsor objectives for this club.'; end if;
  v_game_date:=public.get_current_game_date_safe_v1(); v_season_end:=public.get_game_date_for_season_end(v_sponsor.season_number);
  update public.club_sponsor_objectives o set objective_target_mode='single_race',evaluation_mode='race_final_result',progress_source='race_results',eligible_from_game_date=null,eligible_to_game_date=o.target_check_game_date,eligible_country_code=coalesce(o.metadata->>'target_country_code',eligible_country_code),metadata=coalesce(o.metadata,'{}'::jsonb)||jsonb_build_object('evaluation_mode','race_final_result','objective_target_mode','single_race')
  where o.club_sponsor_id=p_club_sponsor_id and o.status='active' and o.check_state='scheduled' and coalesce(o.metadata->>'required_result','') in ('race_win','race_podium','race_top_5','race_top_10','gc_top_5','gc_top_10') and coalesce(o.target_value,1)=1;
  get diagnostics v_row_count=row_count; v_updated:=v_updated+v_row_count;
  update public.club_sponsor_objectives o set objective_target_mode='single_stage_race',evaluation_mode='stage_result_count',progress_source='stage_results',eligible_from_game_date=null,eligible_to_game_date=o.target_check_game_date,eligible_country_code=coalesce(o.metadata->>'target_country_code',eligible_country_code),metadata=(coalesce(o.metadata,'{}'::jsonb)-'required_result'-'user_visible_deadline_label')||jsonb_build_object('required_result','stage_top_5','evaluation_mode','stage_result_count','objective_target_mode','single_stage_race','user_visible_deadline_label','Checked after target race finishes (counts stage top-5 results during the race)')
  where o.club_sponsor_id=p_club_sponsor_id and o.status='active' and o.check_state='scheduled' and coalesce(o.target_value,1)>1 and exists(select 1 from public.races r where r.id=o.target_race_id and r.race_type='stage_race');
  get diagnostics v_row_count=row_count; v_updated:=v_updated+v_row_count;
  update public.club_sponsor_objectives o set objective_target_mode='window',evaluation_mode='race_start_count',progress_source='race_entries',eligible_from_game_date=coalesce(o.eligible_from_game_date,v_game_date),eligible_to_game_date=v_season_end,eligible_country_code=coalesce(nullif(o.country_code,''),nullif(v_sponsor.metadata->>'company_country_code',''),eligible_country_code),metadata=(coalesce(o.metadata,'{}'::jsonb)-'race_id'-'race_name'-'race_type'-'race_category'-'check_game_date'-'target_country_code'-'user_visible_deadline_label')||jsonb_build_object('target_type','window','evaluation_mode','race_start_count','objective_target_mode','window','required_result','race_start','user_visible_deadline_label','Checked across eligible remaining races until season end')
  where o.club_sponsor_id=p_club_sponsor_id and o.status='active' and (o.objective_code ilike '%start%' or coalesce(o.metadata->>'required_result','')='race_start');
  get diagnostics v_row_count=row_count; v_updated:=v_updated+v_row_count;
  v_cleaned:=public.sponsor_cleanup_unscheduled_objective_metadata_v1(p_club_sponsor_id);
  return jsonb_build_object('status','completed','club_sponsor_id',p_club_sponsor_id,'club_id',v_sponsor.club_id,'sponsor_name',v_sponsor.name,'current_game_date',v_game_date,'season_end',v_season_end,'rows_normalized_or_updated',v_updated,'rows_cleaned_not_scheduled',v_cleaned);
end;$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_jsonb_int_first_v1(p_data jsonb, p_keys text[])
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_key text;
  v_value text;
begin
  if p_data is null or p_keys is null then
    return null;
  end if;

  foreach v_key in array p_keys loop
    v_value := nullif(p_data ->> v_key, '');

    if v_value is not null and v_value ~ '^-?[0-9]+$' then
      return v_value::integer;
    end if;
  end loop;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_jsonb_uuid_first_v1(p_data jsonb, p_keys text[])
 RETURNS uuid
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_key text;
  v_value text;
begin
  if p_data is null or p_keys is null then
    return null;
  end if;

  foreach v_key in array p_keys loop
    v_value := nullif(p_data ->> v_key, '');

    if v_value is not null
       and v_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return v_value::uuid;
    end if;
  end loop;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_jsonb_text_first_v1(p_data jsonb, p_keys text[])
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_key text;
  v_value text;
begin
  if p_data is null or p_keys is null then
    return null;
  end if;

  foreach v_key in array p_keys loop
    v_value := nullif(p_data ->> v_key, '');

    if v_value is not null then
      return v_value;
    end if;
  end loop;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_result_row_belongs_to_club_v1(p_result_row jsonb, p_main_club_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_row_club_id uuid;
  v_row_rider_id uuid;
begin
  if p_result_row is null or p_main_club_id is null then
    return false;
  end if;

  v_row_club_id := public.sponsor_jsonb_uuid_first_v1(
    p_result_row,
    array[
      'club_id',
      'team_id',
      'racing_club_id',
      'participant_club_id',
      'participating_club_id',
      'owner_club_id'
    ]
  );

  if v_row_club_id is not null then
    if exists (
      select 1
      from public.clubs c
      where c.id = v_row_club_id
        and (
          c.id = p_main_club_id
          or (
            c.club_type = 'developing'
            and c.parent_club_id = p_main_club_id
          )
        )
    ) then
      return true;
    end if;
  end if;

  v_row_rider_id := public.sponsor_jsonb_uuid_first_v1(
    p_result_row,
    array[
      'rider_id',
      'participant_id',
      'cyclist_id'
    ]
  );

  if v_row_rider_id is not null then
    if exists (
      select 1
      from public.club_riders cr
      join public.clubs c on c.id = cr.club_id
      where cr.rider_id = v_row_rider_id
        and (
          cr.club_id = p_main_club_id
          or (
            c.club_type = 'developing'
            and c.parent_club_id = p_main_club_id
          )
        )
    ) then
      return true;
    end if;
  end if;

  return false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_is_general_classification_row_v1(p_result_row jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_type text;
begin
  v_type := lower(coalesce(public.sponsor_jsonb_text_first_v1(
    p_result_row,
    array[
      'classification_type',
      'classification',
      'classification_name',
      'standing_type',
      'type',
      'category'
    ]
  ), ''));

  if v_type = '' then
    return true;
  end if;

  return v_type in (
    'general',
    'gc',
    'overall',
    'general_classification',
    'final_gc',
    'race_gc'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_evaluate_objective_v1(p_objective_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_objective public.club_sponsor_objectives%rowtype; v_sponsor public.club_sponsors%rowtype; v_race public.races%rowtype;
  v_game_date date; v_required_result text; v_required_count int; v_actual_count int:=0; v_completed boolean:=false;
  v_result_state text:='failed'; v_failed_reason text:=null; v_stage_result_rows int:=0; v_classification_rows int:=0;
  v_progress jsonb; v_effective_visibility_code text;
begin
  if p_objective_id is null then raise exception 'Objective id is required.'; end if;
  select * into v_objective from public.club_sponsor_objectives where id=p_objective_id for update;
  if not found then raise exception 'Sponsor objective not found.'; end if;
  select * into v_sponsor from public.club_sponsors where id=v_objective.club_sponsor_id;
  if not found then raise exception 'Signed sponsor not found for objective.'; end if;
  if auth.uid() is not null and not finance.is_club_member_or_owner(v_sponsor.club_id,auth.uid()) then raise exception 'Not allowed to evaluate sponsor objective for this club.'; end if;
  if v_objective.check_state='not_scheduled' then return jsonb_build_object('status','skipped','reason','objective_not_scheduled','objective_id',p_objective_id); end if;
  if not p_force and v_objective.check_state in ('checked','paid') and v_objective.objective_result_state in ('completed','failed','paid') then
    return jsonb_build_object('status','skipped','reason','already_checked','objective_id',p_objective_id,'objective_result_state',v_objective.objective_result_state);
  end if;
  v_game_date:=public.get_current_game_date_safe_v1(); v_required_result:=coalesce(nullif(v_objective.metadata->>'required_result',''),'race_top_10');
  v_required_count:=greatest(1,coalesce(v_objective.target_value,1));

  -- Participation/visibility objectives do not require final classifications.
  v_effective_visibility_code:=coalesce(nullif(v_objective.metadata->>'objective_code',''),v_objective.objective_code);
  if v_effective_visibility_code in ('race_start','target_race_visibility','country_visibility','season_country_starts','category_visibility','season_category_starts')
     or v_objective.objective_code ilike '%target_race_visibility%'
     or v_objective.objective_code ilike '%category_visibility%' then
    if not p_force and v_objective.target_check_game_date is not null and v_game_date<v_objective.target_check_game_date then
      update public.club_sponsor_objectives set check_state='waiting_for_result' where id=p_objective_id;
      return jsonb_build_object('status','waiting','objective_id',p_objective_id,'reason','target_check_date_not_reached');
    end if;
    v_progress:=public.sponsor_count_visibility_progress_v1(p_objective_id,null);
    v_actual_count:=coalesce((v_progress->>'current_value')::int,0); v_completed:=v_actual_count>=v_required_count;
    v_result_state:=case when v_completed then 'completed' else 'failed' end;
    v_failed_reason:=case when v_completed then null else 'Visibility/participation target was not reached.' end;
    update public.club_sponsor_objectives set check_state='checked',objective_result_state=v_result_state,current_value=v_actual_count,checked_at=now(),
      failed_reason=v_failed_reason,metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('objective_result_state',v_result_state,'result_checked_at',now(),'actual_value',v_actual_count,'required_value',v_required_count,'visibility_progress',v_progress)
    where id=p_objective_id;
    return jsonb_build_object('status','checked','objective_id',p_objective_id,'objective_result_state',v_result_state,'actual_value',v_actual_count,'required_value',v_required_count,'progress',v_progress);
  end if;

  -- Legacy generic main-sponsor market objectives are season/window aggregates.
  if v_objective.objective_code in ('sponsor_market_starts','sponsor_country_win_or_podium','sponsor_market_top5_results') then
    v_progress:=public.sponsor_count_market_result_progress_v1(p_objective_id,least(v_game_date,coalesce(v_sponsor.ends_at,v_game_date)));
    v_actual_count:=coalesce((v_progress->>'current_value')::int,0); v_completed:=v_actual_count>=v_required_count;
    if not p_force and v_game_date<coalesce(v_sponsor.ends_at,v_game_date) and not v_completed then
      update public.club_sponsor_objectives set current_value=v_actual_count,check_state='scheduled',objective_result_state='pending',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('market_progress',v_progress) where id=p_objective_id;
      return jsonb_build_object('status','waiting','objective_id',p_objective_id,'reason','season_window_still_open','progress',v_progress);
    end if;
    v_result_state:=case when v_completed then 'completed' else 'failed' end;
    v_failed_reason:=case when v_completed then null else 'Sponsor market target was not reached.' end;
    update public.club_sponsor_objectives set check_state='checked',objective_result_state=v_result_state,current_value=v_actual_count,checked_at=now(),failed_reason=v_failed_reason,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('objective_result_state',v_result_state,'result_checked_at',now(),'actual_value',v_actual_count,'required_value',v_required_count,'market_progress',v_progress)
    where id=p_objective_id;
    return jsonb_build_object('status','checked','objective_id',p_objective_id,'objective_result_state',v_result_state,'actual_value',v_actual_count,'required_value',v_required_count,'progress',v_progress);
  end if;

  if v_objective.target_race_id is null then
    update public.club_sponsor_objectives set check_state='checked',objective_result_state='failed',current_value=0,checked_at=now(),failed_reason='No target race was assigned.',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('objective_result_state','failed','result_checked_at',now(),'actual_value',0,'required_value',v_required_count,'failed_reason','No target race was assigned.') where id=p_objective_id;
    return jsonb_build_object('status','checked','objective_id',p_objective_id,'objective_result_state','failed','actual_value',0,'required_value',v_required_count,'reason','no_target_race');
  end if;
  select * into v_race from public.races where id=v_objective.target_race_id;
  if not found then
    update public.club_sponsor_objectives set check_state='checked',objective_result_state='failed',current_value=0,checked_at=now(),failed_reason='Target race no longer exists.' where id=p_objective_id;
    return jsonb_build_object('status','checked','objective_id',p_objective_id,'objective_result_state','failed','actual_value',0,'required_value',v_required_count,'reason','target_race_missing');
  end if;
  if not p_force and v_objective.target_check_game_date is not null and v_game_date<v_objective.target_check_game_date then
    update public.club_sponsor_objectives set check_state='waiting_for_result',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('objective_result_state','pending','waiting_reason','Target race has not reached its check date yet.') where id=p_objective_id;
    return jsonb_build_object('status','waiting','objective_id',p_objective_id,'reason','target_check_date_not_reached','current_game_date',v_game_date,'target_check_game_date',v_objective.target_check_game_date);
  end if;
  select count(*) into v_stage_result_rows from public.race_stage_results sr where sr.stage_id in(select rs.id from public.race_stages rs where rs.race_id=v_objective.target_race_id);
  select count(*) into v_classification_rows from public.race_classification_standings cs where cs.race_id=v_objective.target_race_id;
  if v_objective.evaluation_mode='race_final_result' then
    if v_classification_rows=0 then update public.club_sponsor_objectives set check_state='waiting_for_result',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('objective_result_state','pending','waiting_reason','No final classification rows found yet.') where id=p_objective_id; return jsonb_build_object('status','waiting','objective_id',p_objective_id,'reason','no_final_classification_rows'); end if;
    if v_required_result='race_win' then select count(*) into v_actual_count from public.race_classification_standings cs where cs.race_id=v_objective.target_race_id and public.sponsor_is_general_classification_row_v1(to_jsonb(cs)) and public.sponsor_result_row_belongs_to_club_v1(to_jsonb(cs),v_sponsor.club_id) and public.sponsor_result_position_v1(to_jsonb(cs))<=1; v_completed:=v_actual_count>=1;
    elsif v_required_result='race_podium' then select count(*) into v_actual_count from public.race_classification_standings cs where cs.race_id=v_objective.target_race_id and public.sponsor_is_general_classification_row_v1(to_jsonb(cs)) and public.sponsor_result_row_belongs_to_club_v1(to_jsonb(cs),v_sponsor.club_id) and public.sponsor_result_position_v1(to_jsonb(cs))<=3; v_completed:=v_actual_count>=1;
    elsif v_required_result in ('race_top_5','gc_top_5') then select count(*) into v_actual_count from public.race_classification_standings cs where cs.race_id=v_objective.target_race_id and public.sponsor_is_general_classification_row_v1(to_jsonb(cs)) and public.sponsor_result_row_belongs_to_club_v1(to_jsonb(cs),v_sponsor.club_id) and public.sponsor_result_position_v1(to_jsonb(cs))<=5; v_completed:=v_actual_count>=v_required_count;
    elsif v_required_result in ('race_top_10','gc_top_10') then select count(*) into v_actual_count from public.race_classification_standings cs where cs.race_id=v_objective.target_race_id and public.sponsor_is_general_classification_row_v1(to_jsonb(cs)) and public.sponsor_result_row_belongs_to_club_v1(to_jsonb(cs),v_sponsor.club_id) and public.sponsor_result_position_v1(to_jsonb(cs))<=10; v_completed:=v_actual_count>=v_required_count;
    elsif v_required_result='classification_visibility' then select count(*) into v_actual_count from public.race_classification_standings cs where cs.race_id=v_objective.target_race_id and public.sponsor_result_row_belongs_to_club_v1(to_jsonb(cs),v_sponsor.club_id); v_completed:=v_actual_count>=v_required_count;
    else v_failed_reason:='Unsupported race_final_result requirement: '||v_required_result; end if;
  elsif v_objective.evaluation_mode='stage_result_count' then
    if v_stage_result_rows=0 then update public.club_sponsor_objectives set check_state='waiting_for_result',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('objective_result_state','pending','waiting_reason','No stage result rows found yet.') where id=p_objective_id; return jsonb_build_object('status','waiting','objective_id',p_objective_id,'reason','no_stage_result_rows'); end if;
    if v_required_result='stage_top_5' then select count(*) into v_actual_count from public.race_stage_results sr where sr.stage_id in(select rs.id from public.race_stages rs where rs.race_id=v_objective.target_race_id) and public.sponsor_result_row_belongs_to_club_v1(to_jsonb(sr),v_sponsor.club_id) and public.sponsor_result_position_v1(to_jsonb(sr))<=5; v_completed:=v_actual_count>=v_required_count;
    elsif v_required_result='stage_win' then select count(*) into v_actual_count from public.race_stage_results sr where sr.stage_id in(select rs.id from public.race_stages rs where rs.race_id=v_objective.target_race_id) and public.sponsor_result_row_belongs_to_club_v1(to_jsonb(sr),v_sponsor.club_id) and public.sponsor_result_position_v1(to_jsonb(sr))<=1; v_completed:=v_actual_count>=v_required_count;
    else v_failed_reason:='Unsupported stage_result_count requirement: '||v_required_result; end if;
  else v_failed_reason:='Unsupported evaluation mode for this checker: '||v_objective.evaluation_mode; end if;
  v_result_state:=case when v_completed then 'completed' else 'failed' end; if v_completed then v_failed_reason:=null; else v_failed_reason:=coalesce(v_failed_reason,'Objective target was not reached.'); end if;
  update public.club_sponsor_objectives set check_state='checked',objective_result_state=v_result_state,current_value=v_actual_count,checked_at=now(),failed_reason=v_failed_reason,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('objective_result_state',v_result_state,'result_checked_at',now(),'actual_value',v_actual_count,'required_value',v_required_count,'required_result',v_required_result,'evaluation_mode',v_objective.evaluation_mode,'stage_result_rows_seen',v_stage_result_rows,'classification_rows_seen',v_classification_rows,'failed_reason',v_failed_reason)
  where id=p_objective_id;
  return jsonb_build_object('status','checked','objective_id',p_objective_id,'club_sponsor_id',v_objective.club_sponsor_id,'sponsor_name',v_sponsor.name,'club_id',v_sponsor.club_id,'target_race_id',v_objective.target_race_id,'target_race_name',v_race.name,'evaluation_mode',v_objective.evaluation_mode,'required_result',v_required_result,'required_value',v_required_count,'actual_value',v_actual_count,'objective_result_state',v_result_state,'failed_reason',v_failed_reason,'stage_result_rows_seen',v_stage_result_rows,'classification_rows_seen',v_classification_rows);
end;$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_evaluate_due_objectives_for_sponsor_v1(p_club_sponsor_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sponsor public.club_sponsors%rowtype;
  v_objective record;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
  v_checked integer := 0;
  v_waiting integer := 0;
  v_skipped integer := 0;
begin
  if p_club_sponsor_id is null then
    raise exception 'Signed sponsor id is required.';
  end if;

  select *
  into v_sponsor
  from public.club_sponsors cs
  where cs.id = p_club_sponsor_id;

  if not found then
    raise exception 'Signed sponsor not found.';
  end if;

  if auth.uid() is not null
     and not finance.is_club_member_or_owner(v_sponsor.club_id, auth.uid()) then
    raise exception 'Not allowed to evaluate sponsor objectives for this club.';
  end if;

  for v_objective in
    select o.id
    from public.club_sponsor_objectives o
    where o.club_sponsor_id = p_club_sponsor_id
      and o.status = 'active'
      and o.check_state in ('scheduled', 'waiting_for_result')
      and (
        p_force = true
        or o.target_check_game_date <= public.get_current_game_date_safe_v1()
      )
    order by o.reward_amount desc nulls last, o.created_at asc
  loop
    v_result := public.sponsor_evaluate_objective_v1(v_objective.id, p_force);
    v_results := v_results || jsonb_build_array(v_result);

    if v_result ->> 'status' = 'checked' then
      v_checked := v_checked + 1;
    elsif v_result ->> 'status' = 'waiting' then
      v_waiting := v_waiting + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'club_sponsor_id', p_club_sponsor_id,
    'sponsor_name', v_sponsor.name,
    'club_id', v_sponsor.club_id,
    'checked_count', v_checked,
    'waiting_count', v_waiting,
    'skipped_count', v_skipped,
    'results', v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_resolve_objective_bonus_accounts_v1(p_club_id uuid)
 RETURNS TABLE(debit_account_id uuid, credit_account_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_debit_account_id uuid;
  v_credit_account_id uuid;
begin
  if p_club_id is null then
    raise exception 'Club id is required.';
  end if;

  -- The external/sponsor debit account appears stable across sponsor payments.
  select e.account_id
  into v_debit_account_id
  from finance.entries e
  join finance.transactions t on t.id = e.transaction_id
  where t.type = 'sponsor_contract_payment'
    and e.amount < 0
  order by e.created_at desc nulls last, e.id desc
  limit 1;

  -- The club cash credit account should be resolved from this club's own sponsor payment.
  select e.account_id
  into v_credit_account_id
  from finance.entries e
  join finance.transactions t on t.id = e.transaction_id
  where t.type = 'sponsor_contract_payment'
    and e.amount > 0
    and nullif(t.metadata ->> 'club_id', '')::uuid = p_club_id
  order by e.created_at desc nulls last, e.id desc
  limit 1;

  if v_debit_account_id is null then
    raise exception 'Could not resolve sponsor debit account from existing sponsor_contract_payment entries.';
  end if;

  if v_credit_account_id is null then
    raise exception 'Could not resolve club cash credit account for club % from existing sponsor_contract_payment entries.', p_club_id;
  end if;

  return query
  select v_debit_account_id, v_credit_account_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_pay_completed_objective_bonus_v1(p_objective_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_objective public.club_sponsor_objectives%rowtype;
  v_sponsor public.club_sponsors%rowtype;
  v_club public.clubs%rowtype;
  v_debit_account_id uuid;
  v_credit_account_id uuid;
  v_amount bigint;
  v_transaction_id uuid;
  v_existing_transaction_id uuid;
  v_idempotency_key text;
  v_created_by uuid;
  v_game_date jsonb;
begin
  if p_objective_id is null then
    raise exception 'Objective id is required.';
  end if;

  select *
  into v_objective
  from public.club_sponsor_objectives o
  where o.id = p_objective_id
  for update;

  if not found then
    raise exception 'Sponsor objective not found.';
  end if;

  select *
  into v_sponsor
  from public.club_sponsors cs
  where cs.id = v_objective.club_sponsor_id;

  if not found then
    raise exception 'Signed sponsor not found for objective.';
  end if;

  select *
  into v_club
  from public.clubs c
  where c.id = v_sponsor.club_id;

  if not found then
    raise exception 'Club not found for sponsor objective.';
  end if;

  if auth.uid() is not null
     and not finance.is_club_member_or_owner(v_sponsor.club_id, auth.uid()) then
    raise exception 'Not allowed to pay sponsor objective bonus for this club.';
  end if;

  if v_objective.check_state <> 'checked'
     or v_objective.objective_result_state <> 'completed' then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'objective_not_completed',
      'objective_id', p_objective_id,
      'check_state', v_objective.check_state,
      'objective_result_state', v_objective.objective_result_state
    );
  end if;

  if v_objective.payout_transaction_id is not null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'already_paid',
      'objective_id', p_objective_id,
      'transaction_id', v_objective.payout_transaction_id
    );
  end if;

  v_amount := greatest(0, coalesce(v_objective.reward_amount, 0))::bigint;

  if v_amount <= 0 then
    update public.club_sponsor_objectives o
    set
      objective_result_state = 'paid',
      check_state = 'paid',
      metadata = coalesce(o.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'payout_status', 'skipped_zero_amount',
          'paid_at', now()
        )
    where o.id = p_objective_id;

    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'zero_reward_amount',
      'objective_id', p_objective_id
    );
  end if;

  v_idempotency_key := 'sponsor_objective_bonus:' || p_objective_id::text;

  -- If transaction already exists from an earlier partial run, link it instead of paying twice.
  select t.id
  into v_existing_transaction_id
  from finance.transactions t
  where t.idempotency_key = v_idempotency_key
  limit 1;

  if v_existing_transaction_id is not null then
    update public.club_sponsor_objectives o
    set
      payout_transaction_id = v_existing_transaction_id,
      objective_result_state = 'paid',
      check_state = 'paid',
      metadata = coalesce(o.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'payout_status', 'linked_existing_transaction',
          'payout_transaction_id', v_existing_transaction_id,
          'paid_at', now()
        )
    where o.id = p_objective_id;

    return jsonb_build_object(
      'status', 'paid',
      'reason', 'linked_existing_transaction',
      'objective_id', p_objective_id,
      'transaction_id', v_existing_transaction_id,
      'amount', v_amount
    );
  end if;

  select a.debit_account_id, a.credit_account_id
  into v_debit_account_id, v_credit_account_id
  from public.sponsor_resolve_objective_bonus_accounts_v1(v_sponsor.club_id) a;

  v_created_by := coalesce(auth.uid(), v_club.owner_user_id);

  v_game_date := jsonb_build_object(
    'season', public.get_current_game_season_number_safe_v1(),
    'game_date', public.get_current_game_date_safe_v1()
  );

  insert into finance.transactions (
    type,
    metadata,
    created_by,
    idempotency_key
  )
  values (
    'sponsor_objective_bonus',
    jsonb_build_object(
      'source', 'sponsor_objective_bonus',
      'amount', v_amount,
      'club_id', v_sponsor.club_id,
      'club_name', v_club.name,
      'club_sponsor_id', v_sponsor.id,
      'sponsor_name', v_sponsor.name,
      'sponsor_kind', v_sponsor.sponsor_kind,
      'objective_id', v_objective.id,
      'objective_code', v_objective.objective_code,
      'objective_title', v_objective.title,
      'target_value', v_objective.target_value,
      'current_value', v_objective.current_value,
      'target_race_id', v_objective.target_race_id,
      'evaluation_mode', v_objective.evaluation_mode,
      'required_result', v_objective.metadata ->> 'required_result',
      'game_date', v_game_date
    ),
    v_created_by,
    v_idempotency_key
  )
  returning id
  into v_transaction_id;

  insert into finance.entries (
    transaction_id,
    account_id,
    amount,
    memo
  )
  values
    (
      v_transaction_id,
      v_debit_account_id,
      -v_amount,
      'sponsor objective bonus debit'
    ),
    (
      v_transaction_id,
      v_credit_account_id,
      v_amount,
      'sponsor objective bonus credit'
    );

  update public.club_sponsor_objectives o
  set
    payout_transaction_id = v_transaction_id,
    objective_result_state = 'paid',
    check_state = 'paid',
    metadata = coalesce(o.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'payout_status', 'paid',
        'payout_transaction_id', v_transaction_id,
        'paid_at', now(),
        'paid_amount', v_amount
      )
  where o.id = p_objective_id;

  return jsonb_build_object(
    'status', 'paid',
    'objective_id', p_objective_id,
    'club_sponsor_id', v_sponsor.id,
    'sponsor_name', v_sponsor.name,
    'club_id', v_sponsor.club_id,
    'amount', v_amount,
    'transaction_id', v_transaction_id,
    'debit_account_id', v_debit_account_id,
    'credit_account_id', v_credit_account_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_pay_completed_objectives_for_sponsor_v1(p_club_sponsor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sponsor public.club_sponsors%rowtype;
  v_objective record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_paid integer := 0;
  v_skipped integer := 0;
  v_total_paid bigint := 0;
begin
  if p_club_sponsor_id is null then
    raise exception 'Signed sponsor id is required.';
  end if;

  select *
  into v_sponsor
  from public.club_sponsors cs
  where cs.id = p_club_sponsor_id;

  if not found then
    raise exception 'Signed sponsor not found.';
  end if;

  if auth.uid() is not null
     and not finance.is_club_member_or_owner(v_sponsor.club_id, auth.uid()) then
    raise exception 'Not allowed to pay sponsor objective bonuses for this club.';
  end if;

  for v_objective in
    select o.id
    from public.club_sponsor_objectives o
    where o.club_sponsor_id = p_club_sponsor_id
      and o.check_state = 'checked'
      and o.objective_result_state = 'completed'
      and o.payout_transaction_id is null
    order by o.reward_amount desc nulls last, o.created_at asc
  loop
    v_result := public.sponsor_pay_completed_objective_bonus_v1(v_objective.id);
    v_results := v_results || jsonb_build_array(v_result);

    if v_result ->> 'status' = 'paid' then
      v_paid := v_paid + 1;
      v_total_paid := v_total_paid + coalesce((v_result ->> 'amount')::bigint, 0);
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'club_sponsor_id', p_club_sponsor_id,
    'sponsor_name', v_sponsor.name,
    'club_id', v_sponsor.club_id,
    'paid_count', v_paid,
    'skipped_count', v_skipped,
    'total_paid', v_total_paid,
    'results', v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_process_objectives_for_sponsor_v1(p_club_sponsor_id uuid, p_force_evaluation boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_eval jsonb;
  v_pay jsonb;
begin
  v_eval := public.sponsor_evaluate_due_objectives_for_sponsor_v1(
    p_club_sponsor_id,
    p_force_evaluation
  );

  v_pay := public.sponsor_pay_completed_objectives_for_sponsor_v1(
    p_club_sponsor_id
  );

  return jsonb_build_object(
    'status', 'completed',
    'club_sponsor_id', p_club_sponsor_id,
    'evaluation', v_eval,
    'payment', v_pay
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_process_objectives_for_race_v1(p_race_id uuid, p_force_evaluation boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_race public.races%rowtype;
  v_objective record;
  v_eval_result jsonb;
  v_pay_result jsonb;
  v_results jsonb := '[]'::jsonb;

  v_processed integer := 0;
  v_checked integer := 0;
  v_waiting integer := 0;
  v_failed integer := 0;
  v_completed integer := 0;
  v_paid integer := 0;
  v_payment_skipped integer := 0;
  v_total_paid bigint := 0;

  v_current_game_date date;
begin
  if p_race_id is null then
    raise exception 'Race id is required.';
  end if;

  select *
  into v_race
  from public.races r
  where r.id = p_race_id;

  if not found then
    raise exception 'Race not found.';
  end if;

  v_current_game_date := public.get_current_game_date_safe_v1();

  for v_objective in
    select
      o.id as objective_id,
      o.club_sponsor_id,
      o.reward_amount,
      o.target_check_game_date,
      cs.club_id,
      cs.name as sponsor_name
    from public.club_sponsor_objectives o
    join public.club_sponsors cs on cs.id = o.club_sponsor_id
    where o.status = 'active'
      and o.target_race_id = p_race_id
      and o.check_state in ('scheduled', 'waiting_for_result')
      and o.objective_result_state = 'pending'
      and (
        p_force_evaluation = true
        or o.target_check_game_date is null
        or o.target_check_game_date <= v_current_game_date
      )
      and (
        auth.uid() is null
        or finance.is_club_member_or_owner(cs.club_id, auth.uid())
      )
    order by
      o.reward_amount desc nulls last,
      o.created_at asc
  loop
    v_processed := v_processed + 1;

    v_eval_result := public.sponsor_evaluate_objective_v1(
      v_objective.objective_id,
      p_force_evaluation
    );

    v_pay_result := jsonb_build_object(
      'status', 'skipped',
      'reason', 'objective_not_completed'
    );

    if v_eval_result ->> 'status' = 'checked' then
      v_checked := v_checked + 1;

      if v_eval_result ->> 'objective_result_state' = 'completed' then
        v_completed := v_completed + 1;

        v_pay_result := public.sponsor_pay_completed_objective_bonus_v1(
          v_objective.objective_id
        );

        if v_pay_result ->> 'status' = 'paid' then
          v_paid := v_paid + 1;
          v_total_paid := v_total_paid + coalesce((v_pay_result ->> 'amount')::bigint, 0);
        else
          v_payment_skipped := v_payment_skipped + 1;
        end if;
      elsif v_eval_result ->> 'objective_result_state' = 'failed' then
        v_failed := v_failed + 1;
      end if;

    elsif v_eval_result ->> 'status' = 'waiting' then
      v_waiting := v_waiting + 1;
    end if;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'objective_id', v_objective.objective_id,
        'club_sponsor_id', v_objective.club_sponsor_id,
        'sponsor_name', v_objective.sponsor_name,
        'club_id', v_objective.club_id,
        'evaluation', v_eval_result,
        'payment', v_pay_result
      )
    );
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'race_id', p_race_id,
    'race_name', v_race.name,
    'race_status', v_race.status,
    'current_game_date', v_current_game_date,
    'force_evaluation', p_force_evaluation,
    'processed_count', v_processed,
    'checked_count', v_checked,
    'waiting_count', v_waiting,
    'completed_count', v_completed,
    'failed_count', v_failed,
    'paid_count', v_paid,
    'payment_skipped_count', v_payment_skipped,
    'total_paid', v_total_paid,
    'results', v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_process_due_objectives_v1(p_force_evaluation boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_current_game_date date;
  v_race record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;

  v_race_count integer := 0;
  v_total_processed integer := 0;
  v_total_checked integer := 0;
  v_total_paid integer := 0;
  v_total_amount_paid bigint := 0;
begin
  v_current_game_date := public.get_current_game_date_safe_v1();

  for v_race in
    select distinct
      o.target_race_id as race_id
    from public.club_sponsor_objectives o
    join public.club_sponsors cs on cs.id = o.club_sponsor_id
    where o.status = 'active'
      and o.target_race_id is not null
      and o.check_state in ('scheduled', 'waiting_for_result')
      and o.objective_result_state = 'pending'
      and (
        p_force_evaluation = true
        or o.target_check_game_date is null
        or o.target_check_game_date <= v_current_game_date
      )
      and (
        auth.uid() is null
        or finance.is_club_member_or_owner(cs.club_id, auth.uid())
      )
    order by o.target_race_id
  loop
    v_race_count := v_race_count + 1;

    v_result := public.sponsor_process_objectives_for_race_v1(
      v_race.race_id,
      p_force_evaluation
    );

    v_results := v_results || jsonb_build_array(v_result);

    v_total_processed := v_total_processed + coalesce((v_result ->> 'processed_count')::integer, 0);
    v_total_checked := v_total_checked + coalesce((v_result ->> 'checked_count')::integer, 0);
    v_total_paid := v_total_paid + coalesce((v_result ->> 'paid_count')::integer, 0);
    v_total_amount_paid := v_total_amount_paid + coalesce((v_result ->> 'total_paid')::bigint, 0);
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'current_game_date', v_current_game_date,
    'force_evaluation', p_force_evaluation,
    'race_count', v_race_count,
    'total_processed_objectives', v_total_processed,
    'total_checked_objectives', v_total_checked,
    'total_paid_objectives', v_total_paid,
    'total_amount_paid', v_total_amount_paid,
    'results', v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_sponsor_objectives_ui_v1(p_club_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(club_id uuid, club_sponsor_id uuid, sponsor_name text, sponsor_kind text, sponsor_status text, main_sponsor_deal_type text, season_number integer, objective_id uuid, objective_code text, objective_title text, reward_amount bigint, target_value integer, current_value integer, objective_status text, check_state text, objective_result_state text, objective_target_mode text, evaluation_mode text, progress_source text, target_race_id uuid, target_race_name text, target_race_country text, target_race_category text, target_race_type text, target_race_start_date date, target_race_end_date date, target_check_game_date date, eligible_from_game_date date, eligible_to_game_date date, eligible_country_code text, required_result text, user_visible_deadline_label text, checked_at timestamp with time zone, failed_reason text, payout_transaction_id uuid, payout_status text, paid_amount bigint, display_status_label text, display_status_variant text, progress_text text, target_text text, result_text text, metadata jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_club_id uuid;
begin
  if p_club_id is null then
    if auth.uid() is null then
      raise exception 'Club id is required when no authenticated user is available.';
    end if;

    select c.id
    into v_club_id
    from public.clubs c
    where c.owner_user_id = auth.uid()
      and coalesce(c.club_type, 'main') = 'main'
    order by c.created_at asc nulls last
    limit 1;
  else
    v_club_id := p_club_id;
  end if;

  if v_club_id is null then
    raise exception 'Club could not be resolved.';
  end if;

  if auth.uid() is not null
     and not finance.is_club_member_or_owner(v_club_id, auth.uid()) then
    raise exception 'Not allowed to read sponsor objectives for this club.';
  end if;

  return query
  select
    cs.club_id,
    cs.id as club_sponsor_id,
    cs.name::text as sponsor_name,
    cs.sponsor_kind::text as sponsor_kind,
    cs.status::text as sponsor_status,
    coalesce(cs.main_sponsor_deal_type, cs.metadata ->> 'main_sponsor_deal_type', 'standard')::text as main_sponsor_deal_type,
    cs.season_number,

    o.id as objective_id,
    o.objective_code::text,
    o.title::text as objective_title,
    coalesce(o.reward_amount, 0)::bigint as reward_amount,
    coalesce(o.target_value, 0)::integer as target_value,
    coalesce(o.current_value, 0)::integer as current_value,

    o.status::text as objective_status,
    o.check_state::text,
    o.objective_result_state::text,
    o.objective_target_mode::text,
    o.evaluation_mode::text,
    o.progress_source::text,

    o.target_race_id,
    r.name::text as target_race_name,
    r.country_code::text as target_race_country,
    r.category::text as target_race_category,
    r.race_type::text as target_race_type,
    r.start_date,
    r.end_date,
    o.target_check_game_date,

    o.eligible_from_game_date,
    o.eligible_to_game_date,
    o.eligible_country_code::text,

    coalesce(o.metadata ->> 'required_result', '')::text as required_result,
    coalesce(o.metadata ->> 'user_visible_deadline_label', '')::text as user_visible_deadline_label,

    o.checked_at,
    o.failed_reason::text,
    o.payout_transaction_id,
    coalesce(o.metadata ->> 'payout_status', '')::text as payout_status,

    case
      when coalesce(o.metadata ->> 'paid_amount', '') ~ '^[0-9]+$'
        then (o.metadata ->> 'paid_amount')::bigint
      else null::bigint
    end as paid_amount,

    case
      when o.check_state = 'paid' or o.objective_result_state = 'paid' then 'Paid'
      when o.objective_result_state = 'completed' and o.payout_transaction_id is null then 'Completed - payout pending'
      when o.objective_result_state = 'completed' then 'Completed'
      when o.objective_result_state = 'failed' then 'Failed'
      when o.check_state = 'not_scheduled' then 'Not scheduled'
      when o.check_state = 'waiting_for_result' then 'Waiting for result'
      when o.check_state = 'scheduled' then 'Scheduled'
      else 'Pending'
    end::text as display_status_label,

    case
      when o.check_state = 'paid' or o.objective_result_state = 'paid' then 'success'
      when o.objective_result_state = 'completed' then 'success'
      when o.objective_result_state = 'failed' then 'danger'
      when o.check_state = 'not_scheduled' then 'muted'
      when o.check_state = 'waiting_for_result' then 'warning'
      when o.check_state = 'scheduled' then 'info'
      else 'muted'
    end::text as display_status_variant,

    case
      when coalesce(o.target_value, 0) > 0
        then coalesce(o.current_value, 0)::text || ' / ' || coalesce(o.target_value, 0)::text
      else coalesce(o.current_value, 0)::text
    end::text as progress_text,

    case
      when o.check_state = 'not_scheduled' then
        coalesce(nullif(o.metadata ->> 'user_visible_deadline_label', ''), 'No eligible remaining race target this season')
      when o.objective_target_mode = 'window' then
        'Window objective · ' || coalesce(o.eligible_from_game_date::text, '?') || ' to ' || coalesce(o.eligible_to_game_date::text, '?')
      when r.id is not null then
        r.name || coalesce(' · ' || r.category, '') || coalesce(' · check date ' || o.target_check_game_date::text, '')
      else
        coalesce(nullif(o.metadata ->> 'user_visible_deadline_label', ''), 'Target not assigned')
    end::text as target_text,

    case
      when o.objective_result_state = 'paid' then 'Bonus paid'
      when o.objective_result_state = 'completed' and o.payout_transaction_id is null then 'Objective completed. Bonus is ready for payout.'
      when o.objective_result_state = 'completed' then 'Objective completed.'
      when o.objective_result_state = 'failed' then coalesce(o.failed_reason, 'Objective target was not reached.')
      when o.check_state = 'not_scheduled' then 'No realistic remaining target was available when this sponsor was signed.'
      when o.check_state = 'waiting_for_result' then 'Waiting for target race result.'
      when o.check_state = 'scheduled' then coalesce(nullif(o.metadata ->> 'user_visible_deadline_label', ''), 'Objective scheduled.')
      else 'Pending.'
    end::text as result_text,

    coalesce(o.metadata, '{}'::jsonb) as metadata
  from public.club_sponsors cs
  join public.club_sponsor_objectives o on o.club_sponsor_id = cs.id
  left join public.races r on r.id = o.target_race_id
  where cs.club_id = v_club_id
    and cs.sponsor_kind = 'main'
    and coalesce(cs.status, 'active') not in ('expired', 'ended', 'terminated', 'inactive')
    and coalesce(o.status, 'active') = 'active'
  order by
    cs.season_number desc nulls last,
    cs.created_at desc nulls last,
    case o.check_state
      when 'paid' then 0
      when 'checked' then 1
      when 'scheduled' then 2
      when 'waiting_for_result' then 3
      when 'not_scheduled' then 4
      else 5
    end,
    o.reward_amount desc nulls last,
    o.created_at asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_stage_interactions_touch_updated_at_v1()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_try_uuid_v1(p_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
begin
  if p_text is null or btrim(p_text) = '' then
    return null;
  end if;

  if p_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return p_text::uuid;
  end if;

  return null;
exception when others then
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_resolve_simulation_context_v1(p_simulation_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  t record;
  v_stage_id uuid;
  v_race_id uuid;
  v_distance_km numeric;
  v_sql text;
  v_has_race_id boolean;
  v_has_stage_id boolean;
  v_source_table text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'id'
      and exists (
        select 1 from information_schema.columns c2
        where c2.table_schema = 'public'
          and c2.table_name = c.table_name
          and c2.column_name in ('stage_id', 'race_stage_id')
      )
    order by case
      when c.table_name = 'race_simulation_runs' then 1
      when c.table_name = 'race_stage_simulation_runs' then 2
      when c.table_name like '%simulation%run%' then 3
      else 9
    end, c.table_name
  loop
    select exists(select 1 from information_schema.columns where table_schema='public' and table_name=t.table_name and column_name='race_id') into v_has_race_id;
    select exists(select 1 from information_schema.columns where table_schema='public' and table_name=t.table_name and column_name='stage_id') into v_has_stage_id;

    v_sql := format(
      'select %s as stage_id, %s as race_id from public.%I where id = $1 limit 1',
      case when v_has_stage_id then 'stage_id' else 'race_stage_id' end,
      case when v_has_race_id then 'race_id' else 'null::uuid' end,
      t.table_name
    );

    begin
      execute v_sql into v_stage_id, v_race_id using p_simulation_run_id;
      if v_stage_id is not null then
        v_source_table := t.table_name;
        exit;
      end if;
    exception when others then
      v_stage_id := null;
      v_race_id := null;
    end;
  end loop;

  if v_stage_id is null then
    for t in
      select c.table_name
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.column_name = 'simulation_run_id'
        and exists (
          select 1 from information_schema.columns c2
          where c2.table_schema = 'public'
            and c2.table_name = c.table_name
            and c2.column_name in ('stage_id', 'race_stage_id')
        )
      order by c.table_name
    loop
      select exists(select 1 from information_schema.columns where table_schema='public' and table_name=t.table_name and column_name='race_id') into v_has_race_id;
      select exists(select 1 from information_schema.columns where table_schema='public' and table_name=t.table_name and column_name='stage_id') into v_has_stage_id;

      v_sql := format(
        'select %s as stage_id, %s as race_id from public.%I where simulation_run_id = $1 limit 1',
        case when v_has_stage_id then 'stage_id' else 'race_stage_id' end,
        case when v_has_race_id then 'race_id' else 'null::uuid' end,
        t.table_name
      );

      begin
        execute v_sql into v_stage_id, v_race_id using p_simulation_run_id;
        if v_stage_id is not null then
          v_source_table := t.table_name;
          exit;
        end if;
      exception when others then
        v_stage_id := null;
        v_race_id := null;
      end;
    end loop;
  end if;

  if v_stage_id is null then
    raise exception 'Could not resolve stage_id for simulation_run_id %', p_simulation_run_id;
  end if;

  if v_race_id is null then
    begin
      select rs.race_id into v_race_id
      from public.race_stages rs
      where rs.id = v_stage_id
      limit 1;
    exception when undefined_table or undefined_column then
      v_race_id := null;
    end;
  end if;

  begin
    select coalesce((row_to_json(rs)::jsonb->>'distance_km')::numeric, (row_to_json(rs)::jsonb->>'length_km')::numeric, 120::numeric)
    into v_distance_km
    from public.race_stages rs
    where rs.id = v_stage_id
    limit 1;
  exception when others then
    v_distance_km := 120;
  end;

  return jsonb_build_object(
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'race_id', v_race_id,
    'stage_distance_km', coalesce(v_distance_km, 120),
    'source_table', v_source_table
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_extract_tactical_command_v1(p_row jsonb, p_phase integer)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v text;
  k text;
  phase_text text := p_phase::text;
begin
  foreach k in array array[
    'phase_' || phase_text || '_command',
    'phase' || phase_text || '_command',
    'phase_' || phase_text || '_tactic',
    'phase' || phase_text || '_tactic',
    'phase_' || phase_text,
    'phase' || phase_text,
    'tactic_phase_' || phase_text,
    'command_phase_' || phase_text
  ] loop
    v := nullif(p_row->>k, '');
    if v is not null then
      return lower(v);
    end if;
  end loop;

  v := coalesce(
    p_row #>> array['phase_' || phase_text, 'command'],
    p_row #>> array['phase_' || phase_text, 'tactic'],
    p_row #>> array['phase' || phase_text, 'command'],
    p_row #>> array['phase' || phase_text, 'tactic'],
    p_row #>> array['commands', phase_text],
    p_row #>> array['commands', 'phase_' || phase_text],
    p_row #>> array['commands', 'phase' || phase_text],
    p_row #>> array['tactics', phase_text],
    p_row #>> array['tactics', 'phase_' || phase_text],
    p_row #>> array['tactics', 'phase' || phase_text],
    p_row #>> array['rider_individual_tactics_json', phase_text],
    p_row #>> array['rider_individual_tactics_json', 'phase_' || phase_text],
    p_row #>> array['rider_individual_tactics_json', 'phase' || phase_text],
    p_row #>> array['metadata', 'phase_' || phase_text || '_command'],
    p_row #>> array['metadata', 'phase' || phase_text || '_command'],
    p_row #>> array['metadata', 'commands', phase_text],
    p_row #>> array['metadata', 'tactics', phase_text]
  );

  if v is null or btrim(v) = '' then
    return null;
  end if;

  return lower(v);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_build_tactical_outcome_v1(p_simulation_run_id uuid, p_stage_distance_km numeric, p_rider_id uuid, p_rider_name text, p_phase integer, p_command text, p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_seed numeric;
  v_km numeric;
  v_followers integer;
  v_gap integer;
  v_cmd text := lower(coalesce(p_command, ''));
  v_title text;
  v_commentary text;
  v_interaction_type text;
  v_outcome_type text;
  v_stamina_hint numeric;
  v_distance numeric := greatest(1, coalesce(p_stage_distance_km, 120));
  v_name text := coalesce(nullif(p_rider_name, ''), 'A rider');
  v_target text;
begin
  v_seed := public.race_engine_deterministic_unit_v1(
    p_simulation_run_id::text || ':' || coalesce(p_rider_id::text, v_name) || ':' || p_phase::text || ':' || v_cmd
  );

  v_km := round((v_distance * case p_phase when 1 then 0.153 when 2 then 0.400 when 3 then 0.650 else 0.880 end
                 + ((v_seed - 0.5) * 4.0))::numeric, 1);
  v_km := greatest(1, least(v_distance - 1, v_km));
  v_followers := 1 + floor(v_seed * 7)::integer;
  v_gap := greatest(5, floor(10 + v_seed * 55)::integer);

  v_target := coalesce(
    nullif(p_row->>'protected_rider_name', ''),
    nullif(p_row->>'target_rider_name', ''),
    nullif(p_row->>'leader_name', ''),
    nullif(p_row#>>'{metadata,protected_rider_name}', ''),
    'the protected leader'
  );

  if v_cmd like '%join_breakaway%' or v_cmd like '%breakaway%' then
    v_interaction_type := 'tactical_breakaway_attempt';
    if v_seed < 0.48 then
      v_outcome_type := 'joined_breakaway';
      v_stamina_hint := 4.5 + v_seed * 3.5;
      v_title := v_name || ' joins the breakaway';
      v_commentary := format('%s joins a %s-rider breakaway after %.1f km. The move starts to build a gap of about %s seconds.', v_name, v_followers + 1, v_km, v_gap);
    elsif v_seed < 0.78 then
      v_outcome_type := 'breakaway_closed_down';
      v_stamina_hint := 1.7 + v_seed * 1.3;
      v_title := v_name || ' tries to join the move';
      v_commentary := format('%s tries to jump across to the breakaway at %.1f km, but the peloton closes it down quickly.', v_name, v_km);
    else
      v_outcome_type := 'brief_breakaway_then_caught';
      v_stamina_hint := 3.0 + v_seed * 2.0;
      v_title := v_name || ' gets a brief gap';
      v_commentary := format('%s briefly gets away at %.1f km with %s riders, but the group is brought back before the move settles.', v_name, v_km, v_followers);
    end if;
  elsif v_cmd like '%attack%' then
    v_interaction_type := 'tactical_attack';
    if v_seed < 0.34 then
      v_outcome_type := 'attack_successful';
      v_stamina_hint := 3.5 + v_seed * 2.5;
      v_title := v_name || ' attacks';
      v_commentary := format('%s attacks at %.1f km. %s riders follow and the peloton reacts immediately.', v_name, v_km, v_followers);
    elsif v_seed < 0.72 then
      v_outcome_type := 'attack_closed_down';
      v_stamina_hint := 1.2 + v_seed * 1.6;
      v_title := v_name || ' attacks but is closed down';
      v_commentary := format('%s tries to attack at %.1f km, but the move is closed down quickly.', v_name, v_km);
    else
      v_outcome_type := 'attack_forces_chase';
      v_stamina_hint := 2.5 + v_seed * 2.2;
      v_title := v_name || ' forces a chase';
      v_commentary := format('%s accelerates hard at %.1f km. The move does not fully go clear, but it forces the front of the peloton to chase.', v_name, v_km);
    end if;
  elsif v_cmd like '%protect_leader%' or v_cmd like '%protect%' or v_cmd like '%domestique%' then
    v_interaction_type := 'tactical_protection';
    v_outcome_type := 'protection_work_visible';
    v_stamina_hint := 1.8 + v_seed * 2.5;
    v_title := v_name || ' protects the leader';
    v_commentary := format('%s works to protect %s around %.1f km, keeping position and reducing the leader''s exposure in the bunch.', v_name, v_target, v_km);
  elsif v_cmd like '%avoid_risks%' or v_cmd like '%safe%' or v_cmd like '%risk%' then
    v_interaction_type := 'tactical_safety';
    v_outcome_type := 'risk_reduction_visible';
    v_stamina_hint := 0.3 + v_seed * 0.6;
    v_title := v_name || ' rides safely';
    v_commentary := format('%s chooses a safer line at %.1f km, avoiding unnecessary risks and staying out of trouble.', v_name, v_km);
  elsif v_cmd like '%sprint%' then
    v_interaction_type := 'tactical_sprint';
    v_outcome_type := 'sprint_positioning';
    v_stamina_hint := 1.5 + v_seed * 2.0;
    v_title := v_name || ' moves up for the sprint';
    v_commentary := format('%s moves up at %.1f km, preparing for the sprint and fighting for position near the front.', v_name, v_km);
  elsif v_cmd like '%leadout%' or v_cmd like '%lead_out%' then
    v_interaction_type := 'tactical_leadout';
    v_outcome_type := 'leadout_work_visible';
    v_stamina_hint := 2.2 + v_seed * 2.4;
    v_title := v_name || ' starts lead-out work';
    v_commentary := format('%s starts lead-out work at %.1f km, lifting the pace for the team sprinter.', v_name, v_km);
  elsif v_cmd like '%chase%' then
    v_interaction_type := 'tactical_chase';
    v_outcome_type := 'chase_work_visible';
    v_stamina_hint := 2.0 + v_seed * 2.5;
    v_title := v_name || ' contributes to the chase';
    v_commentary := format('%s works in the chase at %.1f km, helping control the gap to the riders ahead.', v_name, v_km);
  elsif v_cmd like '%tempo%' or v_cmd like '%rouleur%' then
    v_interaction_type := 'tactical_tempo';
    v_outcome_type := 'tempo_work_visible';
    v_stamina_hint := 1.4 + v_seed * 2.0;
    v_title := v_name || ' controls the tempo';
    v_commentary := format('%s rides tempo at %.1f km, keeping the team positioned and the pace steady.', v_name, v_km);
  else
    return null;
  end if;

  return jsonb_build_object(
    'event_km', v_km,
    'interaction_type', v_interaction_type,
    'outcome_type', v_outcome_type,
    'title', v_title,
    'commentary', v_commentary,
    'involved_rider_count', case when v_interaction_type in ('tactical_attack','tactical_breakaway_attempt') then v_followers + 1 else null end,
    'gap_seconds', case when v_outcome_type in ('joined_breakaway','attack_successful') then v_gap else null end,
    'stamina_cost_hint', round(v_stamina_hint::numeric, 3),
    'metadata', jsonb_build_object(
      'deterministic_seed', v_seed,
      'important_note', 'v9.1 is still visible tactical commentary. v10 should write real simulation state fields and final stamina/fatigue impact.'
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_generate_alive_tactical_events_v1(p_simulation_run_id uuid, p_only_team_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ctx jsonb;
  v_stage_id uuid;
  v_race_id uuid;
  v_distance numeric;
  v_scope jsonb;
  v_scope_count integer := 0;
  v_deleted integer := 0;
  v_inserted integer := 0;
  v_candidates jsonb := '[]'::jsonb;
  v_report_rows_seen integer := 0;
  v_report_candidate_count integer := 0;
  v_audit_available boolean := false;
  v_audit_rows_seen integer := 0;
  v_command_rows_seen integer := 0;
  v_default_club_id uuid;
  v_insert_count integer;
  v_report_table_exists boolean;
begin
  v_ctx := public.race_engine_resolve_simulation_context_v1(p_simulation_run_id);
  v_stage_id := (v_ctx->>'stage_id')::uuid;
  v_race_id := public.race_engine_try_uuid_v1(v_ctx->>'race_id');
  v_distance := coalesce((v_ctx->>'stage_distance_km')::numeric, 120);

  drop table if exists pg_temp.tmp_alive_team_scope;
  create temp table tmp_alive_team_scope (
    club_id uuid primary key,
    scope_role text not null
  ) on commit drop;

  if p_only_team_id is not null then
    insert into tmp_alive_team_scope(club_id, scope_role)
    select s.club_id, min(s.scope_role)
    from public.race_engine_club_scope_v1(p_only_team_id) s
    where s.club_id is not null
    group by s.club_id
    on conflict (club_id) do nothing;
  else
    insert into tmp_alive_team_scope(club_id, scope_role)
    select distinct rp.club_id, 'race_preparation'::text
    from public.race_preparations rp
    where rp.race_id = v_race_id
      and rp.club_id is not null
    on conflict (club_id) do nothing;

    insert into tmp_alive_team_scope(club_id, scope_role)
    select distinct rp.participating_club_id, 'race_preparation_participating'::text
    from public.race_preparations rp
    where rp.race_id = v_race_id
      and rp.participating_club_id is not null
    on conflict (club_id) do nothing;
  end if;

  if not exists(select 1 from tmp_alive_team_scope) and p_only_team_id is not null then
    insert into tmp_alive_team_scope(club_id, scope_role) values (p_only_team_id, 'requested_fallback') on conflict do nothing;
  end if;

  select club_id into v_default_club_id
  from tmp_alive_team_scope
  order by case scope_role when 'developing_child' then 1 when 'requested' then 2 else 9 end, club_id::text
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('club_id', club_id, 'scope_role', scope_role) order by scope_role, club_id::text), '[]'::jsonb), count(*)
  into v_scope, v_scope_count
  from tmp_alive_team_scope;

  drop table if exists pg_temp.tmp_alive_candidates;
  create temp table tmp_alive_candidates (
    candidate_order integer generated always as identity,
    source_kind text not null,
    source_event_order integer null,
    club_id uuid null,
    rider_id uuid null,
    rider_name text null,
    event_order integer null,
    event_km numeric null,
    phase_number integer null,
    command_code text null,
    interaction_type text not null,
    outcome_type text not null,
    title text not null,
    commentary text not null,
    involved_rider_count integer null,
    stamina_cost_hint numeric null,
    gap_seconds integer null,
    metadata jsonb not null default '{}'::jsonb
  ) on commit drop;

  select exists(
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name = 'race_stage_report_events'
  ) into v_report_table_exists;

  -- Primary source: known-working v5 tactical report rows.
  if v_report_table_exists then
    begin
      execute $q$
        insert into tmp_alive_candidates (
          source_kind,
          source_event_order,
          club_id,
          rider_id,
          rider_name,
          event_order,
          event_km,
          phase_number,
          command_code,
          interaction_type,
          outcome_type,
          title,
          commentary,
          involved_rider_count,
          stamina_cost_hint,
          gap_seconds,
          metadata
        )
        with report_rows as (
          select row_to_json(e)::jsonb as ej
          from public.race_stage_report_events e
          where public.race_engine_try_uuid_v1(row_to_json(e)::jsonb->>'stage_id') = $1
        ), normalized as (
          select
            ej,
            coalesce(
              nullif(ej->>'event_type', ''),
              nullif(ej->>'type', ''),
              nullif(ej->>'category', ''),
              nullif(ej#>>'{metadata,event_type}', '')
            ) as event_type,
            coalesce(
              nullif(ej->>'commentary', ''),
              nullif(ej->>'description', ''),
              nullif(ej->>'event_text', ''),
              nullif(ej->>'message', ''),
              nullif(ej->>'text', ''),
              nullif(ej->>'title', ''),
              nullif(ej#>>'{metadata,commentary}', ''),
              nullif(ej#>>'{payload,commentary}', '')
            ) as commentary,
            coalesce(
              nullif(ej->>'title', ''),
              nullif(ej->>'headline', ''),
              nullif(ej#>>'{metadata,title}', '')
            ) as title,
            public.race_engine_try_uuid_v1(coalesce(
              nullif(ej->>'club_id', ''),
              nullif(ej->>'team_id', ''),
              nullif(ej->>'participating_club_id', ''),
              nullif(ej#>>'{metadata,club_id}', ''),
              nullif(ej#>>'{metadata,team_id}', ''),
              nullif(ej#>>'{payload,club_id}', '')
            )) as parsed_club_id,
            public.race_engine_try_uuid_v1(coalesce(
              nullif(ej->>'rider_id', ''),
              nullif(ej->>'cyclist_id', ''),
              nullif(ej#>>'{metadata,rider_id}', ''),
              nullif(ej#>>'{payload,rider_id}', '')
            )) as rider_id,
            coalesce(
              nullif(ej->>'rider_name', ''),
              nullif(ej->>'rider_name_snapshot', ''),
              nullif(ej->>'full_name', ''),
              nullif(ej#>>'{metadata,rider_name}', ''),
              nullif(ej#>>'{payload,rider_name}', '')
            ) as rider_name,
            coalesce(nullif(ej->>'event_order', '')::integer, nullif(ej->>'order_index', '')::integer, nullif(ej->>'sort_order', '')::integer) as source_event_order,
            coalesce(
              nullif(ej->>'event_km', '')::numeric,
              nullif(ej->>'km_marker', '')::numeric,
              nullif(ej->>'km', '')::numeric,
              nullif(ej->>'distance_km', '')::numeric,
              nullif(ej#>>'{metadata,event_km}', '')::numeric
            ) as event_km
          from report_rows
        )
        select
          'race_stage_report_events'::text as source_kind,
          n.source_event_order,
          coalesce(n.parsed_club_id, $2::uuid) as club_id,
          n.rider_id,
          n.rider_name,
          coalesce(n.source_event_order, 810000 + row_number() over (order by n.event_km nulls last, n.title, n.commentary)::integer) as event_order,
          n.event_km,
          coalesce(
            nullif(n.ej#>>'{metadata,phase_number}', '')::integer,
            case
              when n.event_km is null then null
              when n.event_km <= ($3::numeric * 0.25) then 1
              when n.event_km <= ($3::numeric * 0.50) then 2
              when n.event_km <= ($3::numeric * 0.75) then 3
              else 4
            end
          ) as phase_number,
          lower(coalesce(nullif(n.ej#>>'{metadata,command}', ''), replace(coalesce(n.event_type, 'tactical_command'), 'tactical_', ''))) as command_code,
          public.race_engine_interaction_type_from_report_v1(n.event_type, n.commentary) as interaction_type,
          public.race_engine_outcome_type_from_report_v1(n.event_type, n.commentary) as outcome_type,
          coalesce(n.title, 'Tactical action') as title,
          coalesce(n.commentary, n.title, 'A tactical action is recorded.') as commentary,
          nullif(regexp_replace(coalesce(n.commentary, ''), '^.*?([0-9]+)[ -]?rider.*$', '\1'), coalesce(n.commentary, ''))::integer as involved_rider_count,
          case
            when lower(coalesce(n.event_type, '') || ' ' || coalesce(n.commentary, '')) like '%breakaway%' then 4.000
            when lower(coalesce(n.event_type, '') || ' ' || coalesce(n.commentary, '')) like '%attack%' then 2.500
            when lower(coalesce(n.event_type, '') || ' ' || coalesce(n.commentary, '')) like '%protect%' then 2.000
            when lower(coalesce(n.event_type, '') || ' ' || coalesce(n.commentary, '')) like '%sprint%' then 2.000
            when lower(coalesce(n.event_type, '') || ' ' || coalesce(n.commentary, '')) like '%avoid%' then 0.500
            else 1.000
          end as stamina_cost_hint,
          nullif(regexp_replace(coalesce(n.commentary, ''), '^.*?([0-9]+)[ -]?second.*$', '\1'), coalesce(n.commentary, ''))::integer as gap_seconds,
          jsonb_build_object(
            'source_row', n.ej,
            'source_note', 'v9.3 converted only v5 tactical command race_stage_report_events into alive tactical interaction events; route markers, generic replay commentary, and other teams are excluded.'
          ) as metadata
        from normalized n
        join tmp_alive_team_scope ts
          on ts.club_id = n.parsed_club_id
        where coalesce(n.ej#>>'{metadata,source}', '') = 'race_engine_tactical_events_v1'
          and coalesce(n.event_type, '') like 'tactical_%'
      $q$ using v_stage_id, v_default_club_id, v_distance;

      get diagnostics v_report_candidate_count = row_count;
      v_report_rows_seen := v_report_candidate_count;
    exception when others then
      v_report_rows_seen := -1;
      v_report_candidate_count := 0;
      insert into tmp_alive_candidates (
        source_kind,
        club_id,
        event_order,
        interaction_type,
        outcome_type,
        title,
        commentary,
        metadata
      ) values (
        'report_event_parse_error',
        v_default_club_id,
        819999,
        'tactical_command',
        'parse_error',
        'Tactical report parse failed',
        'v9.3 could not parse race_stage_report_events; see metadata for SQL error.',
        jsonb_build_object('error', sqlerrm)
      );
    end;
  end if;

  -- If report rows were converted successfully, use them. Audit fallback is intentionally diagnostic only for now.
  select exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_stage_tactical_audit_v1'
  ) into v_audit_available;

  if not p_dry_run then
    delete from public.race_engine_stage_interaction_events e
    where e.simulation_run_id = p_simulation_run_id
      and e.stage_id = v_stage_id
      and (
        -- v9.2 was over-broad, so remove every v9.2 row for this simulation/stage,
        -- including other teams and null-team route markers that were accidentally converted.
        e.source in ('race_engine_stage_interactions_v9_2', 'race_engine_stage_interactions_v9_3')
        or (
          e.source in ('race_engine_stage_interactions_v9', 'race_engine_stage_interactions_v9_1')
          and (
            p_only_team_id is null
            or e.club_id in (select club_id from tmp_alive_team_scope)
            or e.club_id is null
          )
        )
      );
    get diagnostics v_deleted = row_count;

    insert into public.race_engine_stage_interaction_events (
      simulation_run_id,
      race_id,
      stage_id,
      club_id,
      rider_id,
      rider_name,
      event_order,
      event_km,
      phase_number,
      command_code,
      interaction_type,
      outcome_type,
      title,
      commentary,
      involved_rider_count,
      stamina_cost_hint,
      gap_seconds,
      metadata,
      source
    )
    select
      p_simulation_run_id,
      v_race_id,
      v_stage_id,
      c.club_id,
      c.rider_id,
      c.rider_name,
      coalesce(c.event_order, 810000 + c.candidate_order),
      c.event_km,
      c.phase_number,
      c.command_code,
      c.interaction_type,
      c.outcome_type,
      c.title,
      c.commentary,
      c.involved_rider_count,
      c.stamina_cost_hint,
      c.gap_seconds,
      c.metadata || jsonb_build_object('candidate_order', c.candidate_order),
      'race_engine_stage_interactions_v9_3'
    from tmp_alive_candidates c
    where c.source_kind <> 'report_event_parse_error'
    on conflict do nothing;

    get diagnostics v_inserted = row_count;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'source_kind', c.source_kind,
      'event_order', coalesce(c.event_order, 810000 + c.candidate_order),
      'club_id', c.club_id,
      'rider_id', c.rider_id,
      'rider_name', c.rider_name,
      'event_km', c.event_km,
      'phase_number', c.phase_number,
      'command_code', c.command_code,
      'interaction_type', c.interaction_type,
      'outcome_type', c.outcome_type,
      'title', c.title,
      'commentary', c.commentary,
      'stamina_cost_hint', c.stamina_cost_hint,
      'gap_seconds', c.gap_seconds,
      'involved_rider_count', c.involved_rider_count,
      'metadata', c.metadata
    ) order by coalesce(c.event_order, 810000 + c.candidate_order)
  ), '[]'::jsonb)
  into v_candidates
  from tmp_alive_candidates c
  where c.source_kind <> 'report_event_parse_error';

  return jsonb_build_object(
    'status', 'ok',
    'version', 'v9_3_tactical_report_only_alive_events',
    'dry_run', p_dry_run,
    'simulation_run_id', p_simulation_run_id,
    'race_id', v_race_id,
    'stage_id', v_stage_id,
    'stage_distance_km', v_distance,
    'only_team_id', p_only_team_id,
    'resolved_team_scope', v_scope,
    'resolved_team_scope_count', v_scope_count,
    'report_table_exists', v_report_table_exists,
    'report_rows_seen', v_report_rows_seen,
    'report_candidate_count', v_report_candidate_count,
    'audit_available', v_audit_available,
    'audit_rows_seen', v_audit_rows_seen,
    'command_rows_seen', v_command_rows_seen,
    'deleted_existing_events', v_deleted,
    'generated_candidate_count', jsonb_array_length(v_candidates),
    'inserted_events', case when p_dry_run then 0 else v_inserted end,
    'events', v_candidates,
    'important_note', 'v9.3 uses already-generated tactical race_stage_report_events from v5 as the primary source. It is still visible commentary only; v10 should change real simulation state/stamina/support/incidents.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_stage_post_audit_extras_v2(p_simulation_run_id uuid, p_only_team_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tactical jsonb;
  v_wear jsonb;
begin
  v_tactical := public.race_engine_generate_alive_tactical_events_v1(
    p_simulation_run_id,
    p_only_team_id,
    p_dry_run
  );

  -- Use the already fixed v8.5 wear function. In dry-run mode it only verifies idempotency.
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'race_engine_apply_stage_equipment_asset_wear_v1'
  ) then
    v_wear := public.race_engine_apply_stage_equipment_asset_wear_v1(p_simulation_run_id, p_dry_run);
  else
    v_wear := jsonb_build_object('status', 'skipped', 'reason', 'race_engine_apply_stage_equipment_asset_wear_v1 not found');
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'version', 'v9_post_audit_extras_wrapper',
    'dry_run', p_dry_run,
    'simulation_run_id', p_simulation_run_id,
    'tactical_events', v_tactical,
    'wear', v_wear,
    'important_note', 'Do not wire this wrapper into the production finalizer until the dry-run output is reviewed.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_club_scope_v1(p_club_id uuid)
 RETURNS TABLE(club_id uuid, scope_role text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_club_id is null then
    return;
  end if;

  return query select p_club_id, 'requested'::text;

  begin
    return query
    select c.id, 'developing_child'::text
    from public.clubs c
    where c.parent_club_id = p_club_id
      and c.id is not null;

    return query
    select c.parent_club_id, 'parent_main'::text
    from public.clubs c
    where c.id = p_club_id
      and c.parent_club_id is not null;
  exception when undefined_table or undefined_column then
    return;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_prepare_main_sponsor_objectives_on_offer_accept_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_signed_sponsor_id uuid;
  v_preview_sync_result jsonb;
  v_attach_result jsonb := null;
  v_normalize_result jsonb := null;
  v_preview_inserted integer := 0;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(new.sponsor_kind, '') <> 'main' then
    return new;
  end if;

  if coalesce(old.status, '') = coalesce(new.status, '') then
    return new;
  end if;

  if coalesce(new.status, '') <> 'accepted' then
    return new;
  end if;

  if coalesce(new.metadata ->> 'signed_sponsor_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_signed_sponsor_id := (new.metadata ->> 'signed_sponsor_id')::uuid;
  end if;

  if v_signed_sponsor_id is null then
    select cs.id
    into v_signed_sponsor_id
    from public.club_sponsors cs
    where cs.club_id = new.club_id
      and cs.season_number = new.season_number
      and cs.company_id = new.company_id
      and cs.sponsor_kind = 'main'
      and coalesce(cs.status, 'active') not in ('expired', 'ended', 'terminated', 'inactive')
    order by cs.created_at desc nulls last
    limit 1;
  end if;

  if v_signed_sponsor_id is null then
    raise exception
      'Could not resolve signed main sponsor for accepted offer %. Objective setup was not run.',
      new.id;
  end if;

  -- Preferred path: copy exact preview objectives from the offer modal.
  v_preview_sync_result := public.sponsor_sync_objectives_from_offer_preview_v1(
    v_signed_sponsor_id,
    new.id
  );

  if coalesce(v_preview_sync_result ->> 'inserted_count', '') ~ '^[0-9]+$' then
    v_preview_inserted := (v_preview_sync_result ->> 'inserted_count')::integer;
  end if;

  -- Only run generic attach/normalize if no preview objectives existed.
  -- This prevents race-specific preview objectives from being converted
  -- into generic window objectives.
  if v_preview_inserted <= 0 then
    v_attach_result := public.sponsor_attach_race_targets_to_main_sponsor_v1(
      v_signed_sponsor_id,
      false
    );

    v_normalize_result := public.sponsor_normalize_objective_modes_v1(
      v_signed_sponsor_id
    );
  else
    v_attach_result := jsonb_build_object(
      'status', 'skipped',
      'reason', 'preview_objectives_already_synced'
    );

    v_normalize_result := jsonb_build_object(
      'status', 'skipped',
      'reason', 'preview_objectives_should_keep_exact_targets'
    );
  end if;

  update public.club_sponsors cs
  set
    metadata = coalesce(cs.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'objective_setup_source', 'offer_accept_trigger',
        'objective_setup_at', now(),
        'objective_setup_offer_id', new.id,
        'objective_preview_sync_result', v_preview_sync_result,
        'objective_setup_attach_result', v_attach_result,
        'objective_setup_normalize_result', v_normalize_result
      ),
    updated_at = now()
  where cs.id = v_signed_sponsor_id;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_generate_stage_command_outcomes_v1(p_simulation_run_id uuid, p_only_team_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage_id uuid;
  v_race_id uuid;
  v_stage_distance_km numeric := 0;
  v_deleted integer := 0;
  v_inserted integer := 0;
  v_updated_interactions integer := 0;
  v_scope_count integer := 0;
  v_source_count integer := 0;
  v_outcome_count integer := 0;
  v_attack_count integer := 0;
  v_attack_success_count integer := 0;
  v_support_count integer := 0;
  v_incident_risk_rows integer := 0;
  v_incident_triggered_count integer := 0;
  v_mechanical_triggered_count integer := 0;
  v_events jsonb := '[]'::jsonb;
begin
  if p_simulation_run_id is null then raise exception 'p_simulation_run_id is required'; end if;

  /*
    v10.1 schema fix:
    Do NOT assume a table named public.race_simulation_runs exists.
    In the current schema, the working source of truth for this flow is the already-created
    v9.3 interaction table, which stores simulation_run_id, race_id, and stage_id.
    Fallback to race_stage_report_events only for diagnostics if v9.3 rows are missing.
  */
  select
    e.stage_id,
    e.race_id,
    coalesce(max(rs.distance_km), max(e.event_km), 0)::numeric
  into v_stage_id, v_race_id, v_stage_distance_km
  from public.race_engine_stage_interaction_events e
  left join public.race_stages rs on rs.id = e.stage_id
  where e.simulation_run_id = p_simulation_run_id
  group by e.stage_id, e.race_id
  order by count(*) desc, e.stage_id
  limit 1;

  if v_stage_id is null then
    select
      rse.stage_id,
      rse.race_id,
      coalesce(max(rs.distance_km), max(rse.km_marker), 0)::numeric
    into v_stage_id, v_race_id, v_stage_distance_km
    from public.race_stage_report_events rse
    left join public.race_stages rs on rs.id = rse.stage_id
    where rse.metadata->>'simulation_run_id' = p_simulation_run_id::text
    group by rse.stage_id, rse.race_id
    order by count(*) desc, rse.stage_id
    limit 1;
  end if;

  if v_stage_id is null then
    raise exception 'No v9.3 interaction events or report events found for simulation_run_id %. Run v9.3 first, then retry v10.1.', p_simulation_run_id;
  end if;

  drop table if exists pg_temp.tmp_v10_scope;
  create temp table tmp_v10_scope(club_id uuid primary key, scope_role text not null) on commit drop;

  if p_only_team_id is null then
    insert into tmp_v10_scope(club_id, scope_role)
    select distinct e.club_id, 'all_from_existing_interactions'
    from public.race_engine_stage_interaction_events e
    where e.simulation_run_id = p_simulation_run_id and e.stage_id = v_stage_id and e.club_id is not null;
  else
    insert into tmp_v10_scope(club_id, scope_role)
    select club_id, scope_role from public.race_engine_club_scope_v1(p_only_team_id)
    on conflict (club_id) do nothing;
  end if;

  select count(*) into v_scope_count from tmp_v10_scope;

  drop table if exists pg_temp.tmp_v10_source_events;
  create temp table tmp_v10_source_events as
  select
    -- v10.3: select only the source columns we need instead of e.*.
    -- This prevents collisions with generated fields such as outcome_type,
    -- involved_rider_count, gap_seconds, and other audit/output columns.
    e.id,
    e.simulation_run_id,
    e.race_id,
    e.stage_id,
    e.club_id,
    e.rider_id,
    e.rider_name,
    e.event_order,
    e.event_km,
    e.phase_number,
    e.command_code,
    e.stamina_cost_hint,
    e.metadata,
    e.source,
    lower(coalesce(e.command_code, '')) as cmd,
    coalesce((e.metadata->'source_row'->'metadata'->>'stamina_spent')::numeric, 0) as source_stamina_spent,
    coalesce((e.metadata->'source_row'->'metadata'->>'fatigue_gain')::numeric, 0) as source_fatigue_gain,
    coalesce((e.metadata->'source_row'->'metadata'->>'attack_attempts')::int, 0) as source_attack_attempts,
    coalesce((e.metadata->'source_row'->'metadata'->>'breakaway_km')::numeric, 0) as source_breakaway_km,
    coalesce((e.metadata->'source_row'->'metadata'->>'support_work_done_score')::numeric, 0) as source_support_score,
    coalesce((e.metadata->'source_row'->'metadata'->>'protection_received_score')::numeric, 0) as source_protection_score,
    public.race_engine_hash_roll_v1(p_simulation_run_id::text || ':' || e.id::text || ':tactical') as tactical_roll,
    public.race_engine_hash_roll_v1(p_simulation_run_id::text || ':' || e.id::text || ':incident') as incident_roll,
    public.race_engine_hash_roll_v1(p_simulation_run_id::text || ':' || e.id::text || ':mechanical') as mechanical_roll
  from public.race_engine_stage_interaction_events e
  where e.simulation_run_id = p_simulation_run_id
    and e.stage_id = v_stage_id
    and e.rider_id is not null
    and lower(coalesce(e.command_code, '')) in ('attack','join_breakaway','protect_leader','avoid_risks','sprint','leadout','lead_out','sprint_train','chase','breakaway_chaser','tempo','rouleur','follow_team_plan','balanced')
    and (p_only_team_id is null or exists (select 1 from tmp_v10_scope sc where sc.club_id = e.club_id));

  select count(*) into v_source_count from tmp_v10_source_events;

  drop table if exists pg_temp.tmp_v10_outcomes;
  create temp table tmp_v10_outcomes as
  with base as (
    select se.*,
      greatest(0.001, least(0.080, 0.006
        + case when se.cmd in ('sprint','leadout','lead_out','sprint_train') then 0.010 else 0 end
        + case when se.cmd in ('attack','join_breakaway','chase','breakaway_chaser') then 0.007 else 0 end
        + case when coalesce(se.phase_number,0) = 4 then 0.004 else 0 end
        + least(0.018, greatest(0,se.source_fatigue_gain)/1000.0)))::numeric(10,6) as baseline_incident_risk,
      greatest(0.001, least(0.050, 0.004
        + case when se.cmd in ('sprint','attack','join_breakaway','chase','breakaway_chaser') then 0.004 else 0 end
        + least(0.015, greatest(0,se.source_stamina_spent)/2500.0)))::numeric(10,6) as baseline_mechanical_risk
    from tmp_v10_source_events se
  ), adjusted as (
    select b.*,
      (case when b.cmd='avoid_risks' then greatest(0.001,b.baseline_incident_risk*0.45)
            when b.cmd='protect_leader' then greatest(0.001,b.baseline_incident_risk*0.85)
            else b.baseline_incident_risk end)::numeric(10,6) as adjusted_incident_risk,
      greatest(
        0.001,
        (
          case
            when b.cmd='avoid_risks' then greatest(0.001,b.baseline_mechanical_risk*0.65)
            else b.baseline_mechanical_risk
          end
        )
        * (
          1
          - least(
              25,
              coalesce(
                (public.equipment_get_mechanic_effects_v1(b.club_id, null::uuid[])->>'mechanical_risk_reduction_pct')::numeric,
                0
              )
            ) / 100.0
        )
      )::numeric(10,6) as adjusted_mechanical_risk
    from base b
  ), oc as (
    select a.*,
      case
        when a.cmd='attack' and a.tactical_roll < 0.22 then 'attack_opens_gap'
        when a.cmd='attack' and a.tactical_roll < 0.52 then 'attack_forces_chase'
        when a.cmd='attack' then 'attack_closed_down'
        when a.cmd='join_breakaway' and a.tactical_roll < 0.28 then 'joins_breakaway'
        when a.cmd='join_breakaway' and a.tactical_roll < 0.58 then 'tries_to_bridge_closed_down'
        when a.cmd='join_breakaway' then 'misses_breakaway_move'
        when a.cmd='protect_leader' then 'protection_work_created'
        when a.cmd='avoid_risks' then 'risk_reduction_created'
        when a.cmd in ('sprint','leadout','lead_out','sprint_train') then 'sprint_positioning_effort'
        when a.cmd in ('chase','breakaway_chaser','tempo','rouleur') then 'chase_or_tempo_work'
        else 'command_audited' end as generated_outcome_type,
      (case when a.cmd='attack' and a.tactical_roll<0.52 then true
            when a.cmd='join_breakaway' and a.tactical_roll<0.28 then true
            when a.cmd in ('protect_leader','avoid_risks') then true else false end) as tactical_success,
      case when a.cmd='attack' and a.tactical_roll<0.22 then 1+floor(public.race_engine_hash_roll_v1(a.id::text||':followers')*5)::int
           when a.cmd='attack' and a.tactical_roll<0.52 then 1+floor(public.race_engine_hash_roll_v1(a.id::text||':chase')*3)::int
           when a.cmd='join_breakaway' and a.tactical_roll<0.28 then 3+floor(public.race_engine_hash_roll_v1(a.id::text||':break_size')*7)::int
           when a.cmd in ('protect_leader','sprint','leadout','lead_out','sprint_train','chase','breakaway_chaser') then 1 else null end as involved_rider_count,
      case when a.cmd='attack' and a.tactical_roll<0.22 then 12+floor(public.race_engine_hash_roll_v1(a.id::text||':gap1')*28)::int
           when a.cmd='attack' and a.tactical_roll<0.52 then 4+floor(public.race_engine_hash_roll_v1(a.id::text||':gap2')*14)::int
           when a.cmd='join_breakaway' and a.tactical_roll<0.28 then 18+floor(public.race_engine_hash_roll_v1(a.id::text||':gap3')*45)::int else null end as gap_seconds,
      (case when a.cmd='attack' and a.tactical_roll<0.22 then greatest(4.5,coalesce(a.stamina_cost_hint,4)+3.5)
            when a.cmd='attack' and a.tactical_roll<0.52 then greatest(3.0,coalesce(a.stamina_cost_hint,4)+1.5)
            when a.cmd='attack' then greatest(2.0,coalesce(a.stamina_cost_hint,4)*0.65)
            when a.cmd='join_breakaway' and a.tactical_roll<0.28 then greatest(5.0,coalesce(a.stamina_cost_hint,4)+4.0)
            when a.cmd='join_breakaway' then greatest(2.5,coalesce(a.stamina_cost_hint,4)*0.75)
            when a.cmd='protect_leader' then greatest(2.0,coalesce(a.stamina_cost_hint,2)+1.0)
            when a.cmd='avoid_risks' then greatest(0.8,coalesce(a.stamina_cost_hint,1))
            when a.cmd in ('sprint','leadout','lead_out','sprint_train') then greatest(2.0,coalesce(a.stamina_cost_hint,2)+1.5)
            else greatest(1.0,coalesce(a.stamina_cost_hint,1)) end)::numeric(10,3) as stamina_delta,
      (case when a.cmd in ('attack','join_breakaway') then 1.00 when a.cmd='protect_leader' then 0.55 when a.cmd in ('sprint','leadout','lead_out','sprint_train') then 0.65 when a.cmd='avoid_risks' then 0.20 else 0.35 end)::numeric(10,3) as fatigue_multiplier,
      case when a.cmd in ('attack','join_breakaway') then 1 else 0 end as attack_attempt_delta,
      (case when a.cmd='attack' and a.tactical_roll<0.22 then greatest(4.0,(coalesce(a.event_km,0)*0.06))
            when a.cmd='join_breakaway' and a.tactical_roll<0.28 then greatest(8.0,(v_stage_distance_km-coalesce(a.event_km,0))*0.35) else 0 end)::numeric(10,3) as breakaway_km_delta,
      (case when a.cmd='protect_leader' then greatest(2.5,6.0-(a.tactical_roll*2.0)) else 0 end)::numeric(10,3) as support_work_delta,
      (case when a.cmd='protect_leader' then greatest(1.5,4.0-(a.tactical_roll*1.5)) else 0 end)::numeric(10,3) as protection_received_delta,
      (a.incident_roll < a.adjusted_incident_risk) as incident_triggered,
      (a.mechanical_roll < a.adjusted_mechanical_risk) as mechanical_triggered
    from adjusted a
  )
  select
    oc.id as source_interaction_event_id, oc.simulation_run_id, oc.race_id, oc.stage_id, oc.club_id, oc.rider_id, oc.rider_name,
    oc.event_order as source_event_order, oc.event_km, oc.phase_number, oc.cmd as command_code, oc.generated_outcome_type as outcome_type, oc.tactical_success,
    oc.involved_rider_count, oc.gap_seconds, oc.stamina_delta, (oc.stamina_delta*oc.fatigue_multiplier)::numeric(10,3) as fatigue_delta,
    oc.attack_attempt_delta, oc.breakaway_km_delta, oc.support_work_delta, oc.protection_received_delta,
    oc.baseline_incident_risk, oc.adjusted_incident_risk, oc.incident_roll, oc.incident_triggered,
    case when oc.incident_triggered and oc.cmd in ('sprint','leadout','lead_out','sprint_train') then 'bunch_sprint_crash'
         when oc.incident_triggered and oc.cmd in ('attack','join_breakaway') then 'attack_contact_or_slide'
         when oc.incident_triggered then 'minor_crash_or_near_miss' else null end as incident_type,
    oc.baseline_mechanical_risk, oc.adjusted_mechanical_risk, oc.mechanical_roll, oc.mechanical_triggered,
    case when oc.mechanical_triggered and oc.cmd in ('attack','join_breakaway','sprint') then 'high_load_mechanical'
         when oc.mechanical_triggered then 'minor_mechanical' else null end as mechanical_type,
    case when oc.incident_triggered or oc.mechanical_triggered then jsonb_build_object('equipment_damage_possible',true,'damage_severity_hint',case when oc.incident_triggered and oc.mechanical_triggered then 'medium' when oc.incident_triggered then 'low_to_medium' else 'low' end,'target_categories_hint',case when oc.incident_triggered then jsonb_build_array('frame','wheelset','tires','helmet') else jsonb_build_array('tires','wheelset','groupset') end,'note','v10 records possible equipment damage only. Later integration should apply extra wear through v8.5 idempotent wear system.') else '{}'::jsonb end as equipment_damage_json,
    (
      case
        when oc.generated_outcome_type='attack_opens_gap' then format('%s attacks at %s km. %s rider(s) react, and the peloton hesitates: gap opens to %s seconds. Extra stamina cost %s.', oc.rider_name, round(coalesce(oc.event_km,0)::numeric,1)::text, oc.involved_rider_count, oc.gap_seconds, round(oc.stamina_delta::numeric,1)::text)
        when oc.generated_outcome_type='attack_forces_chase' then format('%s attacks at %s km. The move forces an immediate chase, but the peloton keeps it under control. Extra stamina cost %s.', oc.rider_name, round(coalesce(oc.event_km,0)::numeric,1)::text, round(oc.stamina_delta::numeric,1)::text)
        when oc.generated_outcome_type='attack_closed_down' then format('%s tries to attack at %s km, but the move is closed down quickly. The failed acceleration still costs %s stamina.', oc.rider_name, round(coalesce(oc.event_km,0)::numeric,1)::text, round(oc.stamina_delta::numeric,1)::text)
        when oc.generated_outcome_type='joins_breakaway' then format('%s bridges into a %s-rider breakaway after %s km. The successful move burns %s stamina and adds %s breakaway km.', oc.rider_name, oc.involved_rider_count, round(coalesce(oc.event_km,0)::numeric,1)::text, round(oc.stamina_delta::numeric,1)::text, round(oc.breakaway_km_delta::numeric,1)::text)
        when oc.generated_outcome_type='tries_to_bridge_closed_down' then format('%s tries to join the breakaway at %s km, but the peloton closes the move. The attempt still costs %s stamina.', oc.rider_name, round(coalesce(oc.event_km,0)::numeric,1)::text, round(oc.stamina_delta::numeric,1)::text)
        when oc.generated_outcome_type='misses_breakaway_move' then format('%s looks for the breakaway at %s km but misses the timing. Small wasted effort: %s stamina.', oc.rider_name, round(coalesce(oc.event_km,0)::numeric,1)::text, round(oc.stamina_delta::numeric,1)::text)
        when oc.generated_outcome_type='protection_work_created' then format('%s protects the team leader at %s km. Support work +%s, protection received +%s, stamina cost %s.', oc.rider_name, round(coalesce(oc.event_km,0)::numeric,1)::text, round(oc.support_work_delta::numeric,1)::text, round(oc.protection_received_delta::numeric,1)::text, round(oc.stamina_delta::numeric,1)::text)
        when oc.generated_outcome_type='risk_reduction_created' then format('%s rides safely through %s km. Incident risk %s%% → %s%%, mechanical risk %s%% → %s%%.', oc.rider_name, round(coalesce(oc.event_km,0)::numeric,1)::text, round((oc.baseline_incident_risk*100)::numeric,3)::text, round((oc.adjusted_incident_risk*100)::numeric,3)::text, round((oc.baseline_mechanical_risk*100)::numeric,3)::text, round((oc.adjusted_mechanical_risk*100)::numeric,3)::text)
        when oc.generated_outcome_type='sprint_positioning_effort' then format('%s moves up for sprint positioning at %s km. Stamina cost %s; incident risk audit %s%%.', oc.rider_name, round(coalesce(oc.event_km,0)::numeric,1)::text, round(oc.stamina_delta::numeric,1)::text, round((oc.adjusted_incident_risk*100)::numeric,3)::text)
        else format('%s executes %s at %s km. Stamina cost %s.', oc.rider_name, oc.cmd, round(coalesce(oc.event_km,0)::numeric,1)::text, round(oc.stamina_delta::numeric,1)::text)
      end
      || case when oc.incident_triggered then format(' Incident triggered: %s.', case when oc.cmd in ('sprint','leadout','lead_out','sprint_train') then 'bunch_sprint_crash' when oc.cmd in ('attack','join_breakaway') then 'attack_contact_or_slide' else 'minor_crash_or_near_miss' end) else '' end
      || case when oc.mechanical_triggered then format(' Mechanical triggered: %s.', case when oc.cmd in ('attack','join_breakaway','sprint') then 'high_load_mechanical' else 'minor_mechanical' end) else '' end
    ) as commentary,
    jsonb_build_object('version','v10_4_postgres_format_decimal_fix','source_interaction_event_id',oc.id,'source_interaction_source',oc.source,'tactical_roll',oc.tactical_roll,'incident_roll',oc.incident_roll,'mechanical_roll',oc.mechanical_roll,'source_stamina_spent_total',oc.source_stamina_spent,'source_fatigue_gain_total',oc.source_fatigue_gain,'source_attack_attempts_before_v10',oc.source_attack_attempts,'source_breakaway_km_before_v10',oc.source_breakaway_km,'source_support_score_before_v10',oc.source_support_score,'source_protection_score_before_v10',oc.source_protection_score,'note','v10 stores tactical outcome deltas and updates visible commentary only. Official simulation/result state integration belongs to the next core finalizer migration.') as metadata
  from oc;

  select count(*) into v_outcome_count from tmp_v10_outcomes;
  select count(*) filter (where command_code in ('attack','join_breakaway')), count(*) filter (where command_code in ('attack','join_breakaway') and tactical_success), count(*) filter (where command_code='protect_leader'), count(*) filter (where adjusted_incident_risk>0), count(*) filter (where incident_triggered), count(*) filter (where mechanical_triggered)
    into v_attack_count, v_attack_success_count, v_support_count, v_incident_risk_rows, v_incident_triggered_count, v_mechanical_triggered_count
  from tmp_v10_outcomes;

  if not p_dry_run then
    delete from public.race_engine_stage_command_outcomes o using tmp_v10_outcomes t where o.simulation_run_id=p_simulation_run_id and o.source_interaction_event_id=t.source_interaction_event_id;
    get diagnostics v_deleted = row_count;

    insert into public.race_engine_stage_command_outcomes(simulation_run_id,race_id,stage_id,club_id,rider_id,rider_name,source_interaction_event_id,source_event_order,event_km,phase_number,command_code,outcome_type,tactical_success,involved_rider_count,gap_seconds,stamina_delta,fatigue_delta,attack_attempt_delta,breakaway_km_delta,support_work_delta,protection_received_delta,baseline_incident_risk,adjusted_incident_risk,incident_roll,incident_triggered,incident_type,baseline_mechanical_risk,adjusted_mechanical_risk,mechanical_roll,mechanical_triggered,mechanical_type,equipment_damage_json,commentary,metadata,source)
    select simulation_run_id,race_id,stage_id,club_id,rider_id,rider_name,source_interaction_event_id,source_event_order,event_km,phase_number,command_code,outcome_type,tactical_success,involved_rider_count,gap_seconds,stamina_delta,fatigue_delta,attack_attempt_delta,breakaway_km_delta,support_work_delta,protection_received_delta,baseline_incident_risk,adjusted_incident_risk,incident_roll,incident_triggered,incident_type,baseline_mechanical_risk,adjusted_mechanical_risk,mechanical_roll,mechanical_triggered,mechanical_type,equipment_damage_json,commentary,metadata,'race_engine_stage_interactions_v10'
    from tmp_v10_outcomes;
    get diagnostics v_inserted = row_count;

    update public.race_engine_stage_interaction_events e
    set commentary=t.commentary, outcome_type=t.outcome_type, involved_rider_count=t.involved_rider_count, stamina_cost_hint=t.stamina_delta, gap_seconds=t.gap_seconds, equipment_damage_json=t.equipment_damage_json,
        metadata=coalesce(e.metadata,'{}'::jsonb)||jsonb_build_object('v10_outcome',t.metadata,'v10_command_outcome_type',t.outcome_type,'v10_tactical_success',t.tactical_success,'v10_stamina_delta',t.stamina_delta,'v10_fatigue_delta',t.fatigue_delta,'v10_attack_attempt_delta',t.attack_attempt_delta,'v10_breakaway_km_delta',t.breakaway_km_delta,'v10_support_work_delta',t.support_work_delta,'v10_protection_received_delta',t.protection_received_delta,'v10_adjusted_incident_risk',t.adjusted_incident_risk,'v10_adjusted_mechanical_risk',t.adjusted_mechanical_risk,'v10_incident_triggered',t.incident_triggered,'v10_mechanical_triggered',t.mechanical_triggered),
        updated_at=now()
    from tmp_v10_outcomes t
    where e.id=t.source_interaction_event_id;
    get diagnostics v_updated_interactions = row_count;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('source_event_order',source_event_order,'event_km',event_km,'phase_number',phase_number,'rider_name',rider_name,'command_code',command_code,'outcome_type',outcome_type,'tactical_success',tactical_success,'involved_rider_count',involved_rider_count,'gap_seconds',gap_seconds,'stamina_delta',stamina_delta,'fatigue_delta',fatigue_delta,'attack_attempt_delta',attack_attempt_delta,'breakaway_km_delta',breakaway_km_delta,'support_work_delta',support_work_delta,'protection_received_delta',protection_received_delta,'adjusted_incident_risk_pct',round(adjusted_incident_risk*100,4),'incident_roll',incident_roll,'incident_triggered',incident_triggered,'incident_type',incident_type,'adjusted_mechanical_risk_pct',round(adjusted_mechanical_risk*100,4),'mechanical_roll',mechanical_roll,'mechanical_triggered',mechanical_triggered,'mechanical_type',mechanical_type,'commentary',commentary) order by source_event_order), '[]'::jsonb)
    into v_events
  from tmp_v10_outcomes;

  return jsonb_build_object('status','ok','version','v10_4_postgres_format_decimal_fix','dry_run',p_dry_run,'simulation_run_id',p_simulation_run_id,'race_id',v_race_id,'stage_id',v_stage_id,'stage_distance_km',v_stage_distance_km,'only_team_id',p_only_team_id,'scope_count',v_scope_count,'source_interaction_count',v_source_count,'generated_outcome_count',v_outcome_count,'attack_or_breakaway_command_count',v_attack_count,'attack_or_breakaway_success_count',v_attack_success_count,'protect_leader_command_count',v_support_count,'incident_risk_rows',v_incident_risk_rows,'incident_triggered_count',v_incident_triggered_count,'mechanical_triggered_count',v_mechanical_triggered_count,'deleted_existing_outcomes',v_deleted,'inserted_outcomes',v_inserted,'updated_interaction_events',v_updated_interactions,'important_note','v10 creates deterministic tactical/incident/mechanical outcome audit and updates visible interaction commentary on apply. It does not yet change official results/classifications/replay frames/fatigue tables.','events',v_events);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_stage_command_outcome_summary_v1(p_stage_id uuid, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_events jsonb := '[]'::jsonb;
  v_by_rider jsonb := '[]'::jsonb;
  v_by_command jsonb := '[]'::jsonb;
  v_by_phase jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
  v_stage_id uuid := p_stage_id;
  v_team_id uuid := p_team_id;
begin
  -- Full ordered event list from the already-installed v10.4 reader.
  with rows as (
    select *
    from public.race_engine_stage_command_outcomes_for_stage_v1(v_stage_id, v_team_id)
  )
  select coalesce(jsonb_agg(to_jsonb(rows) order by source_event_order), '[]'::jsonb)
  into v_events
  from rows;

  -- Overall summary.
  with rows as (
    select *
    from public.race_engine_stage_command_outcomes_for_stage_v1(v_stage_id, v_team_id)
  )
  select jsonb_build_object(
    'version', 'v10_5_command_outcome_summary',
    'stage_id', v_stage_id,
    'team_id', v_team_id,
    'event_count', count(*),
    'tactical_success_count', count(*) filter (where tactical_success),
    'attack_or_breakaway_rows', count(*) filter (where command_code in ('attack','join_breakaway')),
    'attack_attempts_added', coalesce(sum(attack_attempt_delta),0),
    'breakaway_km_added', coalesce(round(sum(breakaway_km_delta)::numeric, 3),0),
    'stamina_delta_total', coalesce(round(sum(stamina_delta)::numeric, 3),0),
    'fatigue_delta_total', coalesce(round(sum(fatigue_delta)::numeric, 3),0),
    'support_work_added', coalesce(round(sum(support_work_delta)::numeric, 3),0),
    'protection_received_added', coalesce(round(sum(protection_received_delta)::numeric, 3),0),
    'incident_risk_rows', count(*) filter (where adjusted_incident_risk_pct is not null),
    'incident_triggered_count', count(*) filter (where incident_triggered),
    'mechanical_triggered_count', count(*) filter (where mechanical_triggered),
    'official_integration_status', 'audit_only_not_yet_applied_to_official_results_or_rider_state',
    'next_core_step', 'apply these deltas inside the road-stage finalizer/rider-state pipeline, then route incident equipment damage through the v8.5 idempotent wear system'
  )
  into v_summary
  from rows;

  -- Rider totals.
  with rows as (
    select *
    from public.race_engine_stage_command_outcomes_for_stage_v1(v_stage_id, v_team_id)
  ), grouped as (
    select
      rider_name,
      count(*) as event_count,
      count(*) filter (where tactical_success) as tactical_success_count,
      coalesce(sum(attack_attempt_delta),0) as attack_attempts_added,
      coalesce(round(sum(breakaway_km_delta)::numeric,3),0) as breakaway_km_added,
      coalesce(round(sum(stamina_delta)::numeric,3),0) as stamina_delta_total,
      coalesce(round(sum(fatigue_delta)::numeric,3),0) as fatigue_delta_total,
      coalesce(round(sum(support_work_delta)::numeric,3),0) as support_work_added,
      coalesce(round(sum(protection_received_delta)::numeric,3),0) as protection_received_added,
      count(*) filter (where incident_triggered) as incident_count,
      count(*) filter (where mechanical_triggered) as mechanical_count
    from rows
    group by rider_name
  )
  select coalesce(jsonb_agg(to_jsonb(grouped) order by rider_name), '[]'::jsonb)
  into v_by_rider
  from grouped;

  -- Command/outcome totals.
  with rows as (
    select *
    from public.race_engine_stage_command_outcomes_for_stage_v1(v_stage_id, v_team_id)
  ), grouped as (
    select
      command_code,
      outcome_type,
      count(*) as event_count,
      count(*) filter (where tactical_success) as tactical_success_count,
      coalesce(sum(attack_attempt_delta),0) as attack_attempts_added,
      coalesce(round(sum(breakaway_km_delta)::numeric,3),0) as breakaway_km_added,
      coalesce(round(sum(stamina_delta)::numeric,3),0) as stamina_delta_total,
      coalesce(round(sum(fatigue_delta)::numeric,3),0) as fatigue_delta_total,
      coalesce(round(sum(support_work_delta)::numeric,3),0) as support_work_added,
      coalesce(round(sum(protection_received_delta)::numeric,3),0) as protection_received_added,
      count(*) filter (where incident_triggered) as incident_count,
      count(*) filter (where mechanical_triggered) as mechanical_count
    from rows
    group by command_code, outcome_type
  )
  select coalesce(jsonb_agg(to_jsonb(grouped) order by command_code, outcome_type), '[]'::jsonb)
  into v_by_command
  from grouped;

  -- Phase totals for stage-flow reading.
  with rows as (
    select *
    from public.race_engine_stage_command_outcomes_for_stage_v1(v_stage_id, v_team_id)
  ), grouped as (
    select
      phase_number,
      min(event_km) as first_km,
      max(event_km) as last_km,
      count(*) as event_count,
      coalesce(round(sum(stamina_delta)::numeric,3),0) as stamina_delta_total,
      coalesce(round(sum(fatigue_delta)::numeric,3),0) as fatigue_delta_total,
      coalesce(round(sum(support_work_delta)::numeric,3),0) as support_work_added,
      coalesce(round(sum(protection_received_delta)::numeric,3),0) as protection_received_added,
      coalesce(round(sum(breakaway_km_delta)::numeric,3),0) as breakaway_km_added,
      count(*) filter (where incident_triggered) as incident_count,
      count(*) filter (where mechanical_triggered) as mechanical_count
    from rows
    group by phase_number
  )
  select coalesce(jsonb_agg(to_jsonb(grouped) order by phase_number), '[]'::jsonb)
  into v_by_phase
  from grouped;

  return v_summary || jsonb_build_object(
    'by_rider', v_by_rider,
    'by_command_outcome', v_by_command,
    'by_phase', v_by_phase,
    'events', v_events
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_stage_command_outcome_official_deltas_v1(p_stage_id uuid, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(stage_id uuid, club_id uuid, rider_id uuid, rider_name text, event_count integer, first_event_km numeric, last_event_km numeric, command_codes text[], outcome_types text[], tactical_success_count integer, stamina_delta_total numeric, fatigue_delta_total numeric, attack_attempts_added integer, breakaway_km_added numeric, support_work_added numeric, protection_received_added numeric, incident_count integer, mechanical_count integer, incident_types text[], mechanical_types text[], official_delta_json jsonb)
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  if p_team_id is null then
    return query
    with base as (
      select o.*
      from public.race_engine_stage_command_outcomes o
      where o.stage_id = p_stage_id
    ), grouped as (
      select
        b.stage_id,
        b.club_id,
        b.rider_id,
        max(b.rider_name)::text as rider_name,
        count(*)::int as event_count,
        min(b.event_km)::numeric as first_event_km,
        max(b.event_km)::numeric as last_event_km,
        array_agg(distinct b.command_code order by b.command_code)::text[] as command_codes,
        array_agg(distinct b.outcome_type order by b.outcome_type)::text[] as outcome_types,
        count(*) filter (where coalesce(b.tactical_success,false))::int as tactical_success_count,
        coalesce(sum(b.stamina_delta),0)::numeric(12,3) as stamina_delta_total,
        coalesce(sum(b.fatigue_delta),0)::numeric(12,3) as fatigue_delta_total,
        coalesce(sum(b.attack_attempt_delta),0)::int as attack_attempts_added,
        coalesce(sum(b.breakaway_km_delta),0)::numeric(12,3) as breakaway_km_added,
        coalesce(sum(b.support_work_delta),0)::numeric(12,3) as support_work_added,
        coalesce(sum(b.protection_received_delta),0)::numeric(12,3) as protection_received_added,
        count(*) filter (where coalesce(b.incident_triggered,false))::int as incident_count,
        count(*) filter (where coalesce(b.mechanical_triggered,false))::int as mechanical_count,
        array_remove(array_agg(distinct b.incident_type order by b.incident_type), null)::text[] as incident_types,
        array_remove(array_agg(distinct b.mechanical_type order by b.mechanical_type), null)::text[] as mechanical_types
      from base b
      group by b.stage_id, b.club_id, b.rider_id
    )
    select
      g.stage_id,
      g.club_id,
      g.rider_id,
      g.rider_name,
      g.event_count,
      g.first_event_km,
      g.last_event_km,
      g.command_codes,
      g.outcome_types,
      g.tactical_success_count,
      g.stamina_delta_total,
      g.fatigue_delta_total,
      g.attack_attempts_added,
      g.breakaway_km_added,
      g.support_work_added,
      g.protection_received_added,
      g.incident_count,
      g.mechanical_count,
      g.incident_types,
      g.mechanical_types,
      jsonb_build_object(
        'version','v11_official_delta_bridge',
        'integration_status','bridge_only_not_applied_to_official_state',
        'stage_id',g.stage_id,
        'club_id',g.club_id,
        'rider_id',g.rider_id,
        'rider_name',g.rider_name,
        'event_count',g.event_count,
        'command_codes',to_jsonb(g.command_codes),
        'outcome_types',to_jsonb(g.outcome_types),
        'stamina_delta_total',g.stamina_delta_total,
        'fatigue_delta_total',g.fatigue_delta_total,
        'attack_attempts_added',g.attack_attempts_added,
        'breakaway_km_added',g.breakaway_km_added,
        'support_work_added',g.support_work_added,
        'protection_received_added',g.protection_received_added,
        'incident_count',g.incident_count,
        'mechanical_count',g.mechanical_count,
        'incident_types',to_jsonb(g.incident_types),
        'mechanical_types',to_jsonb(g.mechanical_types),
        'recommended_next_step','consume this row inside road-stage finalizer/rider-state pipeline and then apply incident equipment damage through v8.5 idempotent wear system'
      ) as official_delta_json
    from grouped g
    order by g.rider_name nulls last, g.rider_id;
  else
    return query
    with scope as (
      select s.club_id
      from public.race_engine_club_scope_v1(p_team_id) s
    ), base as (
      select o.*
      from public.race_engine_stage_command_outcomes o
      where o.stage_id = p_stage_id
        and o.club_id in (select scope.club_id from scope)
    ), grouped as (
      select
        b.stage_id,
        b.club_id,
        b.rider_id,
        max(b.rider_name)::text as rider_name,
        count(*)::int as event_count,
        min(b.event_km)::numeric as first_event_km,
        max(b.event_km)::numeric as last_event_km,
        array_agg(distinct b.command_code order by b.command_code)::text[] as command_codes,
        array_agg(distinct b.outcome_type order by b.outcome_type)::text[] as outcome_types,
        count(*) filter (where coalesce(b.tactical_success,false))::int as tactical_success_count,
        coalesce(sum(b.stamina_delta),0)::numeric(12,3) as stamina_delta_total,
        coalesce(sum(b.fatigue_delta),0)::numeric(12,3) as fatigue_delta_total,
        coalesce(sum(b.attack_attempt_delta),0)::int as attack_attempts_added,
        coalesce(sum(b.breakaway_km_delta),0)::numeric(12,3) as breakaway_km_added,
        coalesce(sum(b.support_work_delta),0)::numeric(12,3) as support_work_added,
        coalesce(sum(b.protection_received_delta),0)::numeric(12,3) as protection_received_added,
        count(*) filter (where coalesce(b.incident_triggered,false))::int as incident_count,
        count(*) filter (where coalesce(b.mechanical_triggered,false))::int as mechanical_count,
        array_remove(array_agg(distinct b.incident_type order by b.incident_type), null)::text[] as incident_types,
        array_remove(array_agg(distinct b.mechanical_type order by b.mechanical_type), null)::text[] as mechanical_types
      from base b
      group by b.stage_id, b.club_id, b.rider_id
    )
    select
      g.stage_id,
      g.club_id,
      g.rider_id,
      g.rider_name,
      g.event_count,
      g.first_event_km,
      g.last_event_km,
      g.command_codes,
      g.outcome_types,
      g.tactical_success_count,
      g.stamina_delta_total,
      g.fatigue_delta_total,
      g.attack_attempts_added,
      g.breakaway_km_added,
      g.support_work_added,
      g.protection_received_added,
      g.incident_count,
      g.mechanical_count,
      g.incident_types,
      g.mechanical_types,
      jsonb_build_object(
        'version','v11_official_delta_bridge',
        'integration_status','bridge_only_not_applied_to_official_state',
        'stage_id',g.stage_id,
        'club_id',g.club_id,
        'rider_id',g.rider_id,
        'rider_name',g.rider_name,
        'event_count',g.event_count,
        'command_codes',to_jsonb(g.command_codes),
        'outcome_types',to_jsonb(g.outcome_types),
        'stamina_delta_total',g.stamina_delta_total,
        'fatigue_delta_total',g.fatigue_delta_total,
        'attack_attempts_added',g.attack_attempts_added,
        'breakaway_km_added',g.breakaway_km_added,
        'support_work_added',g.support_work_added,
        'protection_received_added',g.protection_received_added,
        'incident_count',g.incident_count,
        'mechanical_count',g.mechanical_count,
        'incident_types',to_jsonb(g.incident_types),
        'mechanical_types',to_jsonb(g.mechanical_types),
        'recommended_next_step','consume this row inside road-stage finalizer/rider-state pipeline and then apply incident equipment damage through v8.5 idempotent wear system'
      ) as official_delta_json
    from grouped g
    order by g.rider_name nulls last, g.rider_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_stage_command_outcome_official_delta_summary_v1(p_stage_id uuid, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_rows jsonb;
  v_totals jsonb;
begin
  with d as (
    select *
    from public.race_engine_stage_command_outcome_official_deltas_v1(p_stage_id, p_team_id)
  )
  select coalesce(jsonb_agg(to_jsonb(d) order by d.rider_name nulls last), '[]'::jsonb)
  into v_rows
  from d;

  with d as (
    select *
    from public.race_engine_stage_command_outcome_official_deltas_v1(p_stage_id, p_team_id)
  )
  select jsonb_build_object(
    'rider_count', count(*),
    'event_count', coalesce(sum(event_count),0),
    'stamina_delta_total', coalesce(sum(stamina_delta_total),0),
    'fatigue_delta_total', coalesce(sum(fatigue_delta_total),0),
    'attack_attempts_added', coalesce(sum(attack_attempts_added),0),
    'breakaway_km_added', coalesce(sum(breakaway_km_added),0),
    'support_work_added', coalesce(sum(support_work_added),0),
    'protection_received_added', coalesce(sum(protection_received_added),0),
    'incident_count', coalesce(sum(incident_count),0),
    'mechanical_count', coalesce(sum(mechanical_count),0)
  )
  into v_totals
  from d;

  return jsonb_build_object(
    'version','v11_official_delta_bridge',
    'stage_id',p_stage_id,
    'team_id',p_team_id,
    'official_integration_status','bridge_only_not_yet_applied_to_official_results_or_rider_state',
    'totals',coalesce(v_totals,'{}'::jsonb),
    'by_rider',coalesce(v_rows,'[]'::jsonb),
    'next_core_step','Patch the road-stage finalizer/rider-state pipeline to consume these deltas, then route incident equipment damage through the v8.5 idempotent wear system.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_prepare_stage_command_delta_applications_v1(p_stage_id uuid, p_team_id uuid, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rows jsonb := '[]'::jsonb;
  v_inserted_or_updated integer := 0;
  v_existing_prepared integer := 0;
  v_total_events integer := 0;
  v_total_riders integer := 0;
  v_total_stamina numeric := 0;
  v_total_fatigue numeric := 0;
  v_total_attack_attempts integer := 0;
  v_total_breakaway_km numeric := 0;
  v_total_support numeric := 0;
  v_total_protection numeric := 0;
  v_total_incidents integer := 0;
  v_total_mechanicals integer := 0;
begin
  if p_stage_id is null then
    raise exception 'p_stage_id is required';
  end if;

  if p_team_id is null then
    raise exception 'p_team_id is required';
  end if;

  drop table if exists pg_temp.tmp_v12_delta_rows;

  create temp table tmp_v12_delta_rows as
  select
    d.stage_id,
    d.club_id,
    d.rider_id,
    d.rider_name,
    d.event_count,
    d.first_event_km,
    d.last_event_km,
    to_jsonb(d.command_codes) as command_codes,
    to_jsonb(d.outcome_types) as outcome_types,
    d.tactical_success_count,
    d.stamina_delta_total,
    d.fatigue_delta_total,
    d.attack_attempts_added,
    d.breakaway_km_added,
    d.support_work_added,
    d.protection_received_added,
    d.incident_count,
    d.mechanical_count,
    to_jsonb(d.incident_types) as incident_types,
    to_jsonb(d.mechanical_types) as mechanical_types,
    d.official_delta_json,
    jsonb_build_object(
      'version','v12_delta_application_queue',
      'source','race_engine_stage_command_outcome_official_deltas_v1',
      'integration_status','queued_only_not_yet_applied_to_official_state',
      'next_step','road-stage finalizer should consume prepared rows and then mark them consumed_by_finalizer',
      'prepared_for_team_id',p_team_id
    ) as metadata
  from public.race_engine_stage_command_outcome_official_deltas_v1(p_stage_id, p_team_id) d;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.rider_name), '[]'::jsonb)
  into v_rows
  from tmp_v12_delta_rows t;

  select
    count(*),
    coalesce(sum(event_count),0),
    coalesce(sum(stamina_delta_total),0),
    coalesce(sum(fatigue_delta_total),0),
    coalesce(sum(attack_attempts_added),0),
    coalesce(sum(breakaway_km_added),0),
    coalesce(sum(support_work_added),0),
    coalesce(sum(protection_received_added),0),
    coalesce(sum(incident_count),0),
    coalesce(sum(mechanical_count),0)
  into
    v_total_riders,
    v_total_events,
    v_total_stamina,
    v_total_fatigue,
    v_total_attack_attempts,
    v_total_breakaway_km,
    v_total_support,
    v_total_protection,
    v_total_incidents,
    v_total_mechanicals
  from tmp_v12_delta_rows;

  select count(*)
  into v_existing_prepared
  from public.race_engine_stage_command_outcome_delta_applications a
  where a.stage_id = p_stage_id
    and a.source_version = 'v12_delta_application_queue'
    and exists (
      select 1
      from public.race_engine_club_scope_v1(p_team_id) s
      where s.club_id = a.club_id
    );

  if not p_dry_run then
    insert into public.race_engine_stage_command_outcome_delta_applications (
      stage_id, club_id, rider_id, rider_name,
      event_count, first_event_km, last_event_km, command_codes, outcome_types, tactical_success_count,
      stamina_delta_total, fatigue_delta_total, attack_attempts_added, breakaway_km_added,
      support_work_added, protection_received_added,
      incident_count, mechanical_count, incident_types, mechanical_types,
      application_status, source_version, official_delta_json, metadata, prepared_at, updated_at
    )
    select
      t.stage_id, t.club_id, t.rider_id, t.rider_name,
      t.event_count, t.first_event_km, t.last_event_km, t.command_codes, t.outcome_types, t.tactical_success_count,
      t.stamina_delta_total, t.fatigue_delta_total, t.attack_attempts_added, t.breakaway_km_added,
      t.support_work_added, t.protection_received_added,
      t.incident_count, t.mechanical_count, t.incident_types, t.mechanical_types,
      'prepared', 'v12_delta_application_queue', t.official_delta_json, t.metadata, now(), now()
    from tmp_v12_delta_rows t
    on conflict (stage_id, club_id, rider_id, source_version)
    do update set
      rider_name = excluded.rider_name,
      event_count = excluded.event_count,
      first_event_km = excluded.first_event_km,
      last_event_km = excluded.last_event_km,
      command_codes = excluded.command_codes,
      outcome_types = excluded.outcome_types,
      tactical_success_count = excluded.tactical_success_count,
      stamina_delta_total = excluded.stamina_delta_total,
      fatigue_delta_total = excluded.fatigue_delta_total,
      attack_attempts_added = excluded.attack_attempts_added,
      breakaway_km_added = excluded.breakaway_km_added,
      support_work_added = excluded.support_work_added,
      protection_received_added = excluded.protection_received_added,
      incident_count = excluded.incident_count,
      mechanical_count = excluded.mechanical_count,
      incident_types = excluded.incident_types,
      mechanical_types = excluded.mechanical_types,
      application_status = case
        when public.race_engine_stage_command_outcome_delta_applications.application_status = 'consumed_by_finalizer'
          then public.race_engine_stage_command_outcome_delta_applications.application_status
        else 'prepared'
      end,
      official_delta_json = excluded.official_delta_json,
      metadata = excluded.metadata || jsonb_build_object('last_reprepared_at', now()),
      updated_at = now();

    get diagnostics v_inserted_or_updated = row_count;
  end if;

  return jsonb_build_object(
    'status','ok',
    'version','v12_delta_application_queue',
    'dry_run',p_dry_run,
    'stage_id',p_stage_id,
    'team_id',p_team_id,
    'source_rows',v_total_riders,
    'existing_prepared_rows_before',v_existing_prepared,
    'inserted_or_updated_rows',v_inserted_or_updated,
    'totals',jsonb_build_object(
      'rider_count',v_total_riders,
      'event_count',v_total_events,
      'stamina_delta_total',v_total_stamina,
      'fatigue_delta_total',v_total_fatigue,
      'attack_attempts_added',v_total_attack_attempts,
      'breakaway_km_added',v_total_breakaway_km,
      'support_work_added',v_total_support,
      'protection_received_added',v_total_protection,
      'incident_count',v_total_incidents,
      'mechanical_count',v_total_mechanicals
    ),
    'rows',v_rows,
    'official_integration_status','queued_only_not_yet_applied_to_official_results_or_rider_state',
    'next_core_step','Patch road-stage finalizer to consume prepared rows from race_engine_stage_command_outcome_delta_applications and mark them consumed_by_finalizer.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_mark_stage_command_delta_applications_consumed_v1(p_stage_id uuid, p_team_id uuid, p_consumer text DEFAULT 'road_stage_finalizer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rows integer := 0;
begin
  update public.race_engine_stage_command_outcome_delta_applications a
  set application_status = 'consumed_by_finalizer',
      consumed_at = now(),
      updated_at = now(),
      metadata = coalesce(a.metadata,'{}'::jsonb) || jsonb_build_object(
        'consumed_by', coalesce(p_consumer,'road_stage_finalizer'),
        'consumed_at', now()
      )
  where a.stage_id = p_stage_id
    and a.source_version = 'v12_delta_application_queue'
    and a.application_status = 'prepared'
    and exists (
      select 1
      from public.race_engine_club_scope_v1(p_team_id) s
      where s.club_id = a.club_id
    );

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'status','ok',
    'version','v12_delta_application_queue',
    'stage_id',p_stage_id,
    'team_id',p_team_id,
    'marked_consumed_rows',v_rows,
    'consumer',coalesce(p_consumer,'road_stage_finalizer')
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_keep_test_season_start_preview_offer_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uplift numeric := 0;
  v_base_guaranteed bigint;
  v_base_bonus bigint;
begin
  if tg_op = 'UPDATE'
     and coalesce(old.metadata ->> 'test_new_season_start_preview', '') = 'true'
     and coalesce(new.status, 'offered') = 'offered'
  then
    new.generated_game_month := 1;
    new.coverage_months := 12;
    new.proration_factor := 1;

    if coalesce(new.metadata ->> 'economic_model_version', '') in (
      'v5_one_total_split',
      'v6_reduced_30_market_split'
    ) then
      new.guaranteed_amount := greatest(0, coalesce(new.full_season_guaranteed_amount, new.guaranteed_amount, 0));
      new.bonus_pool_amount := greatest(0, coalesce(new.full_season_bonus_pool_amount, new.bonus_pool_amount, 0));
      new.monthly_amount := floor(new.guaranteed_amount::numeric / 12)::bigint;
      new.metadata := coalesce(new.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'test_new_season_start_preview', true,
          'test_preview_generated_game_month', 1,
          'test_preview_coverage_months', 12,
          'test_preview_proration_factor', 1,
          'test_preview_refresh_protected', true,
          'test_preview_refresh_protected_at', now(),
          'test_preview_economic_model', coalesce(new.metadata ->> 'economic_model_version', '')
        );
      return new;
    end if;

    v_base_guaranteed := greatest(0, coalesce(new.full_season_guaranteed_amount, new.guaranteed_amount, 0));
    v_base_bonus := greatest(0, coalesce(new.full_season_bonus_pool_amount, new.bonus_pool_amount, 0));

    if coalesce(new.main_sponsor_deal_type, 'standard') = 'naming_rights' then
      v_uplift := greatest(30, least(40, coalesce(
        new.naming_rights_uplift_pct,
        nullif(new.metadata ->> 'naming_rights_uplift_pct', '')::numeric,
        30
      )));
    end if;

    new.guaranteed_amount := floor(v_base_guaranteed::numeric * (1 + v_uplift / 100.0))::bigint;
    new.bonus_pool_amount := floor(v_base_bonus::numeric * (1 + v_uplift / 100.0))::bigint;
    new.monthly_amount := floor(new.guaranteed_amount::numeric / 12)::bigint;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_consume_stage_command_delta_applications_v1(p_stage_id uuid, p_team_id uuid DEFAULT NULL::uuid, p_consumer text DEFAULT 'road_stage_finalizer'::text, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_rows jsonb := '[]'::jsonb;
  v_totals jsonb := '{}'::jsonb;
  v_status_counts jsonb := '{}'::jsonb;
  v_consumed_rows integer := 0;
begin
  select coalesce(jsonb_agg(to_jsonb(q) order by q.rider_name), '[]'::jsonb)
  into v_rows
  from public.race_engine_stage_command_delta_queue_for_finalizer_v1(p_stage_id, p_team_id) q;

  select jsonb_build_object(
    'row_count', count(*),
    'prepared_rows', count(*) filter (where q.application_status = 'prepared'),
    'already_consumed_rows', count(*) filter (where q.application_status = 'consumed_by_finalizer'),
    'event_count', coalesce(sum(q.event_count),0),
    'stamina_delta_total', coalesce(sum(q.stamina_delta_total),0),
    'fatigue_delta_total', coalesce(sum(q.fatigue_delta_total),0),
    'attack_attempts_added', coalesce(sum(q.attack_attempts_added),0),
    'breakaway_km_added', coalesce(sum(q.breakaway_km_added),0),
    'support_work_added', coalesce(sum(q.support_work_added),0),
    'protection_received_added', coalesce(sum(q.protection_received_added),0),
    'incident_count', coalesce(sum(q.incident_count),0),
    'mechanical_count', coalesce(sum(q.mechanical_count),0)
  )
  into v_totals
  from public.race_engine_stage_command_delta_queue_for_finalizer_v1(p_stage_id, p_team_id) q;

  select coalesce(jsonb_object_agg(status_key, status_count), '{}'::jsonb)
  into v_status_counts
  from (
    select q.application_status as status_key, count(*) as status_count
    from public.race_engine_stage_command_delta_queue_for_finalizer_v1(p_stage_id, p_team_id) q
    group by q.application_status
  ) s;

  if not p_dry_run then
    update public.race_engine_stage_command_outcome_delta_applications a
    set
      application_status = 'consumed_by_finalizer',
      consumed_at = coalesce(a.consumed_at, now()),
      metadata = coalesce(a.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'consumed_by', p_consumer,
          'consumed_at', coalesce(a.consumed_at, now()),
          'consumed_stage_id', p_stage_id,
          'v13_note', 'Marked consumed only. Official state changes must be performed by the road-stage finalizer before calling this function.'
        )
    where a.stage_id = p_stage_id
      and a.application_status = 'prepared'
      and exists (
        select 1
        from public.race_engine_stage_command_delta_queue_for_finalizer_v1(p_stage_id, p_team_id) q
        where q.application_id = a.id
      );

    get diagnostics v_consumed_rows = row_count;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'version', 'v13_finalizer_consume_contract',
    'dry_run', p_dry_run,
    'stage_id', p_stage_id,
    'team_id', p_team_id,
    'consumer', p_consumer,
    'rows_seen_before_consume', jsonb_array_length(v_rows),
    'consumed_rows', v_consumed_rows,
    'status_counts_before_consume', v_status_counts,
    'totals_before_consume', v_totals,
    'rows', v_rows,
    'important_note', 'This function only marks v12 queued rows as consumed. The road-stage finalizer must first apply these deltas to official rider state/results/fatigue/support/incident/equipment flows.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_stage_command_delta_finalizer_schema_diagnostics_v1(p_stage_id uuid, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_queue_rows int := 0;
  v_prepared_rows int := 0;
  v_consumed_rows int := 0;
  v_stamina_delta_total numeric := 0;
  v_fatigue_delta_total numeric := 0;
  v_attack_attempts_added int := 0;
  v_breakaway_km_added numeric := 0;
  v_support_work_added numeric := 0;
  v_protection_received_added numeric := 0;
  v_incident_count int := 0;
  v_mechanical_count int := 0;
  v_candidate_tables jsonb := '[]'::jsonb;
  v_candidate_functions jsonb := '[]'::jsonb;
  v_key_table_checks jsonb := '{}'::jsonb;
  v_queue_sample jsonb := '[]'::jsonb;
  v_status_counts jsonb := '{}'::jsonb;
begin
  if to_regclass('public.race_engine_stage_command_outcome_delta_applications') is null then
    return jsonb_build_object(
      'status','missing_v12_queue_table',
      'version','v14_1_finalizer_schema_diagnostics',
      'stage_id',p_stage_id,
      'team_id',p_team_id,
      'message','Install/apply v12 delta application queue before running finalizer diagnostics.'
    );
  end if;

  select
    count(*)::int,
    count(*) filter (where application_status = 'prepared')::int,
    count(*) filter (where application_status = 'consumed_by_finalizer')::int,
    coalesce(sum(stamina_delta_total),0),
    coalesce(sum(fatigue_delta_total),0),
    coalesce(sum(attack_attempts_added),0)::int,
    coalesce(sum(breakaway_km_added),0),
    coalesce(sum(support_work_added),0),
    coalesce(sum(protection_received_added),0),
    coalesce(sum(incident_count),0)::int,
    coalesce(sum(mechanical_count),0)::int
  into
    v_queue_rows,
    v_prepared_rows,
    v_consumed_rows,
    v_stamina_delta_total,
    v_fatigue_delta_total,
    v_attack_attempts_added,
    v_breakaway_km_added,
    v_support_work_added,
    v_protection_received_added,
    v_incident_count,
    v_mechanical_count
  from public.race_engine_stage_command_outcome_delta_applications q
  where q.stage_id = p_stage_id
    and (p_team_id is null or q.metadata->>'prepared_for_team_id' = p_team_id::text or q.club_id = p_team_id);

  select coalesce(jsonb_object_agg(application_status, row_count), '{}'::jsonb)
  into v_status_counts
  from (
    select application_status, count(*)::int as row_count
    from public.race_engine_stage_command_outcome_delta_applications q
    where q.stage_id = p_stage_id
      and (p_team_id is null or q.metadata->>'prepared_for_team_id' = p_team_id::text or q.club_id = p_team_id)
    group by application_status
  ) s;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.rider_name), '[]'::jsonb)
  into v_queue_sample
  from (
    select
      q.id as application_id,
      q.club_id,
      q.rider_id,
      q.rider_name,
      q.application_status,
      q.stamina_delta_total,
      q.fatigue_delta_total,
      q.attack_attempts_added,
      q.breakaway_km_added,
      q.support_work_added,
      q.protection_received_added,
      q.incident_count,
      q.mechanical_count,
      q.consumed_at
    from public.race_engine_stage_command_outcome_delta_applications q
    where q.stage_id = p_stage_id
      and (p_team_id is null or q.metadata->>'prepared_for_team_id' = p_team_id::text or q.club_id = p_team_id)
    order by q.rider_name
    limit 20
  ) x;

  -- Candidate tables likely to be touched by the official integration.
  select coalesce(jsonb_agg(to_jsonb(t) order by t.table_name), '[]'::jsonb)
  into v_candidate_tables
  from (
    select
      c.table_name,
      jsonb_agg(c.column_name order by c.ordinal_position) as columns
    from information_schema.columns c
    where c.table_schema = 'public'
      and (
        c.table_name in (
          'race_stage_results',
          'race_stage_point_results',
          'race_stage_incidents',
          'race_stage_replay_frames',
          'race_stage_report_events',
          'race_simulation_runs',
          'race_stage_simulation_runs',
          'race_engine_stage_wear_applications',
          'race_engine_stage_command_outcome_delta_applications',
          'race_engine_stage_command_outcomes',
          'race_engine_stage_interaction_events'
        )
        or c.table_name ilike 'race%rider%state%'
        or c.table_name ilike 'race%stage%rider%'
        or c.table_name ilike 'race%simulation%rider%'
        or c.table_name ilike 'race%fatigue%'
        or c.table_name ilike 'rider%fatigue%'
        or c.table_name ilike 'race%incident%'
      )
    group by c.table_name
  ) t;

  -- Key table checks for the next patch. These are deliberately diagnostic only.
  v_key_table_checks := jsonb_build_object(
    'race_stage_results_exists', to_regclass('public.race_stage_results') is not null,
    'race_stage_results_has_metadata', exists (
      select 1 from information_schema.columns where table_schema='public' and table_name='race_stage_results' and column_name='metadata'
    ),
    'race_stage_results_has_stage_id', exists (
      select 1 from information_schema.columns where table_schema='public' and table_name='race_stage_results' and column_name='stage_id'
    ),
    'race_stage_results_has_rider_id', exists (
      select 1 from information_schema.columns where table_schema='public' and table_name='race_stage_results' and column_name='rider_id'
    ),
    'race_stage_incidents_exists', to_regclass('public.race_stage_incidents') is not null,
    'race_stage_incidents_has_metadata', exists (
      select 1 from information_schema.columns where table_schema='public' and table_name='race_stage_incidents' and column_name='metadata'
    ),
    'race_engine_stage_wear_applications_exists', to_regclass('public.race_engine_stage_wear_applications') is not null,
    'delta_queue_exists', to_regclass('public.race_engine_stage_command_outcome_delta_applications') is not null,
    'delta_queue_prepared_rows', v_prepared_rows,
    'delta_queue_consumed_rows', v_consumed_rows
  );

  -- Candidate functions likely relevant to patching the official finalizer safely.
  select coalesce(jsonb_agg(to_jsonb(f) order by f.function_name), '[]'::jsonb)
  into v_candidate_functions
  from (
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as arguments,
      pg_get_function_result(p.oid) as result_type
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname in (
          'run_race_stage_simulation_v1',
          'race_engine_finalize_road_stage_v1',
          'race_engine_finalize_time_trial_stage_v1',
          'race_engine_write_stage_results_v1',
          'race_engine_write_stage_point_results_v1',
          'race_engine_write_replay_frames_v1',
          'race_engine_write_replay_commentary_v1',
          'race_engine_write_cumulative_classifications_v1',
          'race_engine_apply_stage_equipment_asset_wear_v1',
          'race_engine_consume_stage_command_delta_applications_v1',
          'race_engine_stage_command_delta_queue_for_finalizer_v1'
        )
        or p.proname ilike 'race_engine%final%road%'
        or p.proname ilike 'race_engine%finalize%stage%'
        or p.proname ilike 'race_engine%fatigue%'
        or p.proname ilike 'race_engine%incident%'
        or p.proname ilike 'race_engine%equipment%wear%'
      )
  ) f;

  return jsonb_build_object(
    'status','ok',
    'version','v14_1_finalizer_schema_diagnostics',
    'stage_id',p_stage_id,
    'team_id',p_team_id,
    'queue_status','prepared_ready_not_consumed',
    'queue_totals', jsonb_build_object(
      'row_count', v_queue_rows,
      'prepared_rows', v_prepared_rows,
      'consumed_rows', v_consumed_rows,
      'event_count', coalesce((select sum(event_count)::int from public.race_engine_stage_command_outcome_delta_applications q where q.stage_id=p_stage_id and (p_team_id is null or q.metadata->>'prepared_for_team_id'=p_team_id::text or q.club_id=p_team_id)),0),
      'stamina_delta_total', v_stamina_delta_total,
      'fatigue_delta_total', v_fatigue_delta_total,
      'attack_attempts_added', v_attack_attempts_added,
      'breakaway_km_added', v_breakaway_km_added,
      'support_work_added', v_support_work_added,
      'protection_received_added', v_protection_received_added,
      'incident_count', v_incident_count,
      'mechanical_count', v_mechanical_count
    ),
    'status_counts', v_status_counts,
    'queue_sample', v_queue_sample,
    'key_table_checks', v_key_table_checks,
    'candidate_tables_and_columns', v_candidate_tables,
    'candidate_finalizer_functions', v_candidate_functions,
    'safe_next_step', 'Use this diagnostic output to patch the actual road-stage finalizer with exact table/function names. Do not mark v12 rows consumed until official rider state/results/fatigue/support/incident/equipment changes are applied successfully.',
    'do_not_do_yet', 'Do not call race_engine_consume_stage_command_delta_applications_v1(..., false) until the real finalizer consumes these deltas.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_build_offer_preview_objectives_v1(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_offer record;
  v_club_country text;
  v_club_group text;
  v_sponsor_group text;
  v_bonus bigint := 0;

  v_reward_1 bigint := 0;
  v_reward_2 bigint := 0;
  v_reward_3 bigint := 0;
  v_reward_4 bigint := 0;
  v_reward_5 bigint := 0;

  v_race_1 jsonb;
  v_race_2 jsonb;
  v_race_3 jsonb;
  v_race_4 jsonb;
  v_race_5 jsonb;

  v_used uuid[] := array[]::uuid[];
begin
  select
    o.id,
    o.bonus_pool_amount,
    o.metadata,
    sc.name as sponsor_name,
    upper(sc.country_code) as sponsor_country_code,
    c.name as club_name,
    upper(c.country_code) as club_country_code
  into v_offer
  from public.club_sponsor_offers o
  join public.sponsor_companies sc on sc.id = o.company_id
  join public.clubs c on c.id = o.club_id
  where o.id = p_offer_id
    and o.sponsor_kind = 'main';

  if not found then
    return '[]'::jsonb;
  end if;

  v_club_country := v_offer.club_country_code;
  v_bonus := greatest(0, coalesce(v_offer.bonus_pool_amount, 0));

  select cgm.group_code
  into v_club_group
  from public.country_market_group_members cgm
  where upper(cgm.country_code) = v_club_country
  limit 1;

  select cgm.group_code
  into v_sponsor_group
  from public.country_market_group_members cgm
  where upper(cgm.country_code) = v_offer.sponsor_country_code
  limit 1;

  v_reward_1 := round(v_bonus::numeric * 0.28)::bigint;
  v_reward_2 := round(v_bonus::numeric * 0.24)::bigint;
  v_reward_3 := round(v_bonus::numeric * 0.20)::bigint;
  v_reward_4 := round(v_bonus::numeric * 0.16)::bigint;
  v_reward_5 := greatest(0, v_bonus - v_reward_1 - v_reward_2 - v_reward_3 - v_reward_4);

  -- 1) Sponsor-country race, if possible.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_1
  from public.races r
  where upper(r.country_code) = v_offer.sponsor_country_code
    and r.start_date is not null
  order by
    case
      when r.category ilike '%UWT%' then 1
      when r.category ilike '%Pro%' then 2
      when r.category in ('2.1', '1.1') then 3
      else 4
    end,
    r.start_date asc nulls last,
    random()
  limit 1;

  if v_race_1 ? 'race_id' then
    v_used := v_used || (v_race_1 ->> 'race_id')::uuid;
  end if;

  -- 2) Regional / sponsor-market race.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_2
  from public.races r
  left join public.country_market_group_members cgm
    on upper(cgm.country_code) = upper(r.country_code)
  where r.start_date is not null
    and (v_sponsor_group is not null and cgm.group_code = v_sponsor_group)
    and not (r.id = any(v_used))
  order by
    case
      when r.category ilike '%UWT%' then 1
      when r.category ilike '%Pro%' then 2
      when r.category in ('2.1', '1.1') then 3
      else 4
    end,
    random()
  limit 1;

  if v_race_2 ? 'race_id' then
    v_used := v_used || (v_race_2 ->> 'race_id')::uuid;
  end if;

  -- 3) Home-market race, usually Serbia for BK Novi Beograd.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_3
  from public.races r
  where upper(r.country_code) = v_club_country
    and r.start_date is not null
    and not (r.id = any(v_used))
  order by
    case
      when r.category ilike '%UWT%' then 1
      when r.category ilike '%Pro%' then 2
      when r.category in ('2.1', '1.1') then 3
      else 4
    end,
    r.start_date asc nulls last,
    random()
  limit 1;

  if v_race_3 ? 'race_id' then
    v_used := v_used || (v_race_3 ->> 'race_id')::uuid;
  end if;

  -- 4) Prestige/global race.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_4
  from public.races r
  where r.start_date is not null
    and not (r.id = any(v_used))
    and (
      r.category ilike '%UWT%'
      or r.category ilike '%Pro%'
      or r.category in ('2.1', '1.1')
    )
  order by
    case
      when r.category ilike '%UWT%' then 1
      when r.category ilike '%Pro%' then 2
      when r.category in ('2.1', '1.1') then 3
      else 4
    end,
    random()
  limit 1;

  if v_race_4 ? 'race_id' then
    v_used := v_used || (v_race_4 ->> 'race_id')::uuid;
  end if;

  -- 5) Any remaining useful race for classification / jersey visibility.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_5
  from public.races r
  where r.start_date is not null
    and not (r.id = any(v_used))
  order by
    case
      when r.category ilike '%UWT%' then 1
      when r.category ilike '%Pro%' then 2
      when r.category in ('2.1', '1.1') then 3
      else 4
    end,
    random()
  limit 1;

  -- Fallbacks in case the calendar has no perfect sponsor-country match.
  v_race_1 := coalesce(v_race_1, v_race_4, v_race_5, '{}'::jsonb);
  v_race_2 := coalesce(v_race_2, v_race_4, v_race_5, v_race_1, '{}'::jsonb);
  v_race_3 := coalesce(v_race_3, v_race_4, v_race_5, v_race_1, '{}'::jsonb);
  v_race_4 := coalesce(v_race_4, v_race_5, v_race_1, '{}'::jsonb);
  v_race_5 := coalesce(v_race_5, v_race_4, v_race_1, '{}'::jsonb);

  return jsonb_build_array(
    jsonb_build_object(
      'title', coalesce(v_race_1 ->> 'race_name', 'Sponsor-market race') || ': start and visibility target',
      'description', 'Start this sponsor-market race and keep the sponsor visible in the team plan and race participation.',
      'target_race_id', v_race_1 ->> 'race_id',
      'target_race_name', v_race_1 ->> 'race_name',
      'target_country_code', v_race_1 ->> 'country_code',
      'target_category', v_race_1 ->> 'category',
      'check_date', v_race_1 ->> 'check_date',
      'required_result', 'race_start',
      'estimated_reward_amount', v_reward_1,
      'reward_label', '$' || to_char(v_reward_1, 'FM999,999,999')
    ),
    jsonb_build_object(
      'title', coalesce(v_race_2 ->> 'race_name', 'Sponsor-connected event') || ': win or podium',
      'description', 'Deliver a headline result for the sponsor by winning or finishing on the podium in this sponsor-connected race.',
      'target_race_id', v_race_2 ->> 'race_id',
      'target_race_name', v_race_2 ->> 'race_name',
      'target_country_code', v_race_2 ->> 'country_code',
      'target_category', v_race_2 ->> 'category',
      'check_date', v_race_2 ->> 'check_date',
      'required_result', 'race_podium',
      'estimated_reward_amount', v_reward_2,
      'reward_label', '$' || to_char(v_reward_2, 'FM999,999,999')
    ),
    jsonb_build_object(
      'title', coalesce(v_race_3 ->> 'race_name', 'Home-market event') || ': top-5 result',
      'description', 'The sponsor also expects strong visibility in the team’s home market. Finish top 5 in this race or a key stage.',
      'target_race_id', v_race_3 ->> 'race_id',
      'target_race_name', v_race_3 ->> 'race_name',
      'target_country_code', v_race_3 ->> 'country_code',
      'target_category', v_race_3 ->> 'category',
      'check_date', v_race_3 ->> 'check_date',
      'required_result', 'stage_top_5',
      'estimated_reward_amount', v_reward_3,
      'reward_label', '$' || to_char(v_reward_3, 'FM999,999,999')
    ),
    jsonb_build_object(
      'title', coalesce(v_race_4 ->> 'race_name', 'Prestige race') || ': GC top 10',
      'description', 'For a top-tier team, the sponsor expects visibility in a high-prestige race. Finish top 10 in the final general classification.',
      'target_race_id', v_race_4 ->> 'race_id',
      'target_race_name', v_race_4 ->> 'race_name',
      'target_country_code', v_race_4 ->> 'country_code',
      'target_category', v_race_4 ->> 'category',
      'check_date', v_race_4 ->> 'check_date',
      'required_result', 'gc_top_10',
      'estimated_reward_amount', v_reward_4,
      'reward_label', '$' || to_char(v_reward_4, 'FM999,999,999')
    ),
    jsonb_build_object(
      'title', coalesce(v_race_5 ->> 'race_name', 'Classification race') || ': points or mountain jersey visibility',
      'description', 'Score visible classification points, fight for a jersey, or place a rider in the key breakaway battle for sponsor exposure.',
      'target_race_id', v_race_5 ->> 'race_id',
      'target_race_name', v_race_5 ->> 'race_name',
      'target_country_code', v_race_5 ->> 'country_code',
      'target_category', v_race_5 ->> 'category',
      'check_date', v_race_5 ->> 'check_date',
      'required_result', 'classification_visibility',
      'estimated_reward_amount', v_reward_5,
      'reward_label', '$' || to_char(v_reward_5, 'FM999,999,999')
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_stage_command_deltas_to_official_state_v1(p_stage_id uuid, p_team_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true, p_consumer text DEFAULT 'road_stage_finalizer_v15'::text, p_mark_consumed boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_queue_count int := 0;
  v_state_match_count int := 0;
  v_missing_state_count int := 0;
  v_updated_state_count int := 0;
  v_inserted_incidents_count int := 0;
  v_marked_consumed_count int := 0;
  v_totals jsonb := '{}'::jsonb;
  v_missing jsonb := '[]'::jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_incident_rows jsonb := '[]'::jsonb;
begin
  drop table if exists pg_temp.tmp_v15_queue;
  drop table if exists pg_temp.tmp_v15_missing_states;
  drop table if exists pg_temp.tmp_v15_incident_outcomes;

  create temp table tmp_v15_queue on commit drop as
  select *
  from public.race_engine_stage_command_delta_queue_for_finalizer_v1(p_stage_id, p_team_id)
  where application_status = 'prepared';

  select count(*) into v_queue_count from tmp_v15_queue;

  select coalesce(jsonb_build_object(
    'row_count', count(*),
    'event_count', coalesce(sum(event_count),0),
    'stamina_delta_total', coalesce(sum(stamina_delta_total),0),
    'fatigue_delta_total', coalesce(sum(fatigue_delta_total),0),
    'attack_attempts_added', coalesce(sum(attack_attempts_added),0),
    'breakaway_km_added', coalesce(sum(breakaway_km_added),0),
    'support_work_added', coalesce(sum(support_work_added),0),
    'protection_received_added', coalesce(sum(protection_received_added),0),
    'incident_count', coalesce(sum(incident_count),0),
    'mechanical_count', coalesce(sum(mechanical_count),0)
  ), '{}'::jsonb)
  into v_totals
  from tmp_v15_queue;

  create temp table tmp_v15_missing_states on commit drop as
  select q.*
  from tmp_v15_queue q
  left join public.race_stage_rider_states rs
    on rs.stage_id = q.stage_id
   and rs.rider_id = q.rider_id
   and rs.team_id = q.club_id
  where rs.id is null;

  select count(*) into v_missing_state_count from tmp_v15_missing_states;

  select count(*) into v_state_match_count
  from tmp_v15_queue q
  join public.race_stage_rider_states rs
    on rs.stage_id = q.stage_id
   and rs.rider_id = q.rider_id
   and rs.team_id = q.club_id;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.rider_name), '[]'::jsonb)
  into v_missing
  from (
    select rider_id, rider_name, club_id, stamina_delta_total, fatigue_delta_total
    from tmp_v15_missing_states
  ) m;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.rider_name), '[]'::jsonb)
  into v_rows
  from (
    select
      q.application_id,
      q.club_id,
      q.rider_id,
      q.rider_name,
      q.event_count,
      q.stamina_delta_total,
      q.fatigue_delta_total,
      q.attack_attempts_added,
      q.breakaway_km_added,
      q.support_work_added,
      q.protection_received_added,
      q.incident_count,
      q.mechanical_count,
      rs.id as rider_state_id,
      rs.stamina_spent as stamina_spent_before,
      rs.finish_stamina as finish_stamina_before,
      rs.fatigue_gain as fatigue_gain_before,
      rs.fatigue_after_stage as fatigue_after_stage_before,
      rs.attack_attempts as attack_attempts_before,
      rs.breakaway_km as breakaway_km_before,
      rs.support_work_done_score as support_work_done_score_before,
      rs.protection_received_score as protection_received_score_before,
      (coalesce(rs.stamina_spent,0) + q.stamina_delta_total)::numeric(10,3) as stamina_spent_after,
      greatest(0, coalesce(rs.finish_stamina, rs.start_stamina, 100) - q.stamina_delta_total)::numeric(10,3) as finish_stamina_after,
      (coalesce(rs.fatigue_gain,0) + q.fatigue_delta_total)::numeric(10,3) as fatigue_gain_after,
      (coalesce(rs.fatigue_after_stage, coalesce(rs.fatigue_before_stage,0) + coalesce(rs.fatigue_gain,0)) + q.fatigue_delta_total)::numeric(10,3) as fatigue_after_stage_after,
      (coalesce(rs.attack_attempts,0) + q.attack_attempts_added)::int as attack_attempts_after,
      (coalesce(rs.breakaway_km,0) + q.breakaway_km_added)::numeric(10,3) as breakaway_km_after,
      (coalesce(rs.support_work_done_score,0) + q.support_work_added)::numeric(10,3) as support_work_done_score_after,
      (coalesce(rs.protection_received_score,0) + q.protection_received_added)::numeric(10,3) as protection_received_score_after
    from tmp_v15_queue q
    join public.race_stage_rider_states rs
      on rs.stage_id = q.stage_id
     and rs.rider_id = q.rider_id
     and rs.team_id = q.club_id
  ) r;

  create temp table tmp_v15_incident_outcomes on commit drop as
  select
    o.id as outcome_id,
    o.simulation_run_id,
    o.race_id,
    o.stage_id,
    o.club_id,
    o.rider_id,
    o.rider_name,
    o.event_km,
    o.phase_number,
    o.incident_type as tactical_incident_type,
    case
      when o.incident_type in ('bunch_sprint_crash','attack_contact_or_slide','minor_crash_or_near_miss') then 'crash'
      else coalesce(nullif(o.incident_type,''), 'crash')
    end as official_incident_type,
    'minor'::text as official_incident_severity,
    case
      when o.incident_type = 'bunch_sprint_crash' then 12
      when o.incident_type = 'attack_contact_or_slide' then 5
      when o.incident_type = 'minor_crash_or_near_miss' then 2
      else 2
    end as official_time_loss_seconds,
    o.equipment_damage_json,
    o.commentary,
    o.metadata
  from public.race_engine_stage_command_outcomes o
  join tmp_v15_queue q
    on q.stage_id = o.stage_id
   and q.club_id = o.club_id
   and q.rider_id = o.rider_id
  where o.stage_id = p_stage_id
    and o.incident_triggered is true
    and not exists (
      select 1
      from public.race_stage_incidents ri
      where ri.stage_id = o.stage_id
        and ri.rider_id = o.rider_id
        and ri.metadata->>'source_outcome_id' = o.id::text
    );

  select coalesce(jsonb_agg(to_jsonb(i) order by i.event_km, i.rider_name), '[]'::jsonb)
  into v_incident_rows
  from tmp_v15_incident_outcomes i;

  if v_queue_count = 0 then
    return jsonb_build_object(
      'status','ok_no_prepared_rows',
      'version','v15_1_apply_delta_to_official_rider_state',
      'dry_run',p_dry_run,
      'stage_id',p_stage_id,
      'team_id',p_team_id,
      'queue_count',0,
      'important_note','No prepared v12 rows were available. They may already be consumed or not prepared yet.'
    );
  end if;

  if v_missing_state_count > 0 then
    return jsonb_build_object(
      'status','blocked_missing_race_stage_rider_states',
      'version','v15_1_apply_delta_to_official_rider_state',
      'dry_run',p_dry_run,
      'stage_id',p_stage_id,
      'team_id',p_team_id,
      'queue_count',v_queue_count,
      'state_match_count',v_state_match_count,
      'missing_state_count',v_missing_state_count,
      'missing_rows',v_missing,
      'totals',v_totals,
      'important_note','No official state updates were applied. Create/fix race_stage_rider_states rows first, then rerun.'
    );
  end if;

  if not p_dry_run then
    update public.race_stage_rider_states rs
    set
      stamina_spent = (coalesce(rs.stamina_spent,0) + q.stamina_delta_total)::numeric(10,3),
      finish_stamina = greatest(0, coalesce(rs.finish_stamina, rs.start_stamina, 100) - q.stamina_delta_total)::numeric(10,3),
      fatigue_gain = (coalesce(rs.fatigue_gain,0) + q.fatigue_delta_total)::numeric(10,3),
      fatigue_after_stage = (coalesce(rs.fatigue_after_stage, coalesce(rs.fatigue_before_stage,0) + coalesce(rs.fatigue_gain,0)) + q.fatigue_delta_total)::numeric(10,3),
      attack_attempts = coalesce(rs.attack_attempts,0) + q.attack_attempts_added,
      breakaway_km = (coalesce(rs.breakaway_km,0) + q.breakaway_km_added)::numeric(10,3),
      support_work_done_score = (coalesce(rs.support_work_done_score,0) + q.support_work_added)::numeric(10,3),
      protection_received_score = (coalesce(rs.protection_received_score,0) + q.protection_received_added)::numeric(10,3),
      metadata = coalesce(rs.metadata,'{}'::jsonb) || jsonb_build_object(
        'v15_command_delta_application', jsonb_build_object(
          'version','v15_1_apply_delta_to_official_rider_state',
          'application_id', q.application_id,
          'consumer', p_consumer,
          'applied_at', now(),
          'stamina_delta_total', q.stamina_delta_total,
          'fatigue_delta_total', q.fatigue_delta_total,
          'attack_attempts_added', q.attack_attempts_added,
          'breakaway_km_added', q.breakaway_km_added,
          'support_work_added', q.support_work_added,
          'protection_received_added', q.protection_received_added,
          'incident_count', q.incident_count,
          'mechanical_count', q.mechanical_count
        )
      )
    from tmp_v15_queue q
    where rs.stage_id = q.stage_id
      and rs.rider_id = q.rider_id
      and rs.team_id = q.club_id;

    get diagnostics v_updated_state_count = row_count;

    insert into public.race_stage_incidents (
      simulation_run_id,
      race_id,
      stage_id,
      rider_id,
      team_id,
      incident_type,
      incident_severity,
      km_marker,
      phase_number,
      terrain_type,
      time_loss_seconds,
      caused_dnf,
      metadata
    )
    select
      i.simulation_run_id,
      i.race_id,
      i.stage_id,
      i.rider_id,
      i.club_id,
      i.official_incident_type,
      i.official_incident_severity,
      i.event_km,
      i.phase_number,
      null,
      i.official_time_loss_seconds,
      false,
      jsonb_build_object(
        'source','race_engine_stage_command_outcomes',
        'source_version','v15_1_apply_delta_to_official_rider_state',
        'source_outcome_id', i.outcome_id,
        'tactical_incident_type', i.tactical_incident_type,
        'commentary', i.commentary,
        'equipment_damage_json', i.equipment_damage_json,
        'created_by', p_consumer,
        'created_from_stage_command_delta', true
      )
    from tmp_v15_incident_outcomes i;

    get diagnostics v_inserted_incidents_count = row_count;

    if p_mark_consumed then
      update public.race_engine_stage_command_outcome_delta_applications qa
      set
        application_status = 'consumed_by_finalizer',
        consumed_at = now(),
        updated_at = now(),
        metadata = coalesce(qa.metadata,'{}'::jsonb) || jsonb_build_object(
          'consumed_by', p_consumer,
          'consumed_by_v15', true,
          'consumed_at', now(),
          'official_rider_state_rows_updated', v_updated_state_count,
          'official_incident_rows_inserted', v_inserted_incidents_count
        )
      where qa.id in (select application_id from tmp_v15_queue)
        and qa.application_status = 'prepared';

      get diagnostics v_marked_consumed_count = row_count;
    end if;
  end if;

  return jsonb_build_object(
    'status','ok',
    'version','v15_1_apply_delta_to_official_rider_state',
    'dry_run',p_dry_run,
    'stage_id',p_stage_id,
    'team_id',p_team_id,
    'consumer',p_consumer,
    'mark_consumed',p_mark_consumed,
    'queue_count',v_queue_count,
    'state_match_count',v_state_match_count,
    'missing_state_count',v_missing_state_count,
    'totals',v_totals,
    'rows',v_rows,
    'incident_rows_to_insert',v_incident_rows,
    'updated_state_count',v_updated_state_count,
    'inserted_incidents_count',v_inserted_incidents_count,
    'marked_consumed_count',v_marked_consumed_count,
    'official_integration_status',case when p_dry_run then 'dry_run_only_not_applied' else 'official_rider_state_applied_and_queue_consumed_if_enabled' end,
    'next_step','After apply, verify race_stage_rider_states deltas, race_stage_incidents, and v13 queue status. Then patch replay/report/finalizer flow and incident equipment damage through v8.5 wear system.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_sync_objectives_from_offer_preview_v1(p_club_sponsor_id uuid, p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sponsor public.club_sponsors%rowtype;
  v_offer public.club_sponsor_offers%rowtype;
  v_preview_objectives jsonb;
  v_obj jsonb;
  v_index integer := 0;
  v_inserted integer := 0;

  v_required_result text;
  v_evaluation_mode text;
  v_target_mode text;
  v_target_value integer;
  v_target_race_id uuid;
  v_check_date date;
  v_reward bigint;
  v_title text;
  v_country_code text;
begin
  if p_club_sponsor_id is null then
    raise exception 'Signed sponsor id is required.';
  end if;

  if p_offer_id is null then
    raise exception 'Offer id is required.';
  end if;

  select *
  into v_sponsor
  from public.club_sponsors cs
  where cs.id = p_club_sponsor_id
    and cs.sponsor_kind = 'main';

  if not found then
    raise exception 'Signed main sponsor not found.';
  end if;

  select *
  into v_offer
  from public.club_sponsor_offers o
  where o.id = p_offer_id
    and o.sponsor_kind = 'main';

  if not found then
    raise exception 'Main sponsor offer not found.';
  end if;

  v_preview_objectives := coalesce(v_offer.metadata -> 'preview_objectives', '[]'::jsonb);

  if jsonb_typeof(v_preview_objectives) <> 'array'
     or jsonb_array_length(v_preview_objectives) = 0 then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'no_preview_objectives',
      'club_sponsor_id', p_club_sponsor_id,
      'offer_id', p_offer_id
    );
  end if;

  -- For a newly signed sponsor, replace old generated placeholder objectives.
  -- Do not touch already paid/checked objectives. This should only matter
  -- if someone manually reruns the function later.
  if exists (
    select 1
    from public.club_sponsor_objectives o
    where o.club_sponsor_id = p_club_sponsor_id
      and (
        o.payout_transaction_id is not null
        or o.check_state in ('checked', 'paid')
        or o.objective_result_state in ('completed', 'failed', 'paid')
      )
  ) then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'existing_objectives_already_evaluated',
      'club_sponsor_id', p_club_sponsor_id,
      'offer_id', p_offer_id
    );
  end if;

  delete from public.club_sponsor_objectives o
  where o.club_sponsor_id = p_club_sponsor_id;

  for v_obj in
    select value
    from jsonb_array_elements(v_preview_objectives)
  loop
    v_index := v_index + 1;

    v_required_result := coalesce(v_obj ->> 'required_result', 'race_start');

    v_evaluation_mode := case
      when v_required_result = 'race_start' then 'race_start_count'
      when v_required_result in ('stage_top_5', 'stage_win') then 'stage_result_count'
      when v_required_result in ('gc_top_10', 'gc_top_5') then 'race_final_result'
      when v_required_result = 'classification_visibility' then 'race_final_result'
      else 'race_final_result'
    end;

    v_target_mode := case
      when v_required_result in ('stage_top_5', 'stage_win') then 'single_stage_race'
      else 'single_race'
    end;

    v_target_value := 1;

    v_target_race_id := case
      when coalesce(v_obj ->> 'target_race_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (v_obj ->> 'target_race_id')::uuid
      else null
    end;

    v_check_date := case
      when coalesce(v_obj ->> 'check_date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        then (v_obj ->> 'check_date')::date
      else null
    end;

    v_reward := case
      when coalesce(v_obj ->> 'estimated_reward_amount', '') ~ '^[0-9]+$'
        then (v_obj ->> 'estimated_reward_amount')::bigint
      else 0
    end;

    v_title := coalesce(
      nullif(v_obj ->> 'title', ''),
      'Sponsor objective ' || v_index::text
    );

    v_country_code := nullif(v_obj ->> 'target_country_code', '');

    insert into public.club_sponsor_objectives (
      club_sponsor_id,
      objective_code,
      title,
      reward_amount,
      target_value,
      current_value,
      country_code,
      status,
      metadata,
      target_race_id,
      target_check_game_date,
      check_state,
      objective_target_mode,
      evaluation_mode,
      eligible_from_game_date,
      eligible_to_game_date,
      eligible_country_code,
      progress_source,
      objective_result_state
    )
    values (
      p_club_sponsor_id,
      'preview_bonus_' || lpad(v_index::text, 2, '0') || '_' || v_required_result,
      v_title,
      v_reward,
      v_target_value,
      0,
      v_country_code,
      'active',
      coalesce(v_obj, '{}'::jsonb)
        || jsonb_build_object(
          'source', 'offer_preview_objective',
          'offer_id', p_offer_id,
          'preview_index', v_index,
          'required_result', v_required_result,
          'target_race_id', v_target_race_id,
          'target_check_game_date', v_check_date,
          'user_visible_deadline_label',
            case
              when v_check_date is not null then 'Will be checked after ' || v_check_date::text
              else 'Will be checked after the target race result'
            end
        ),
      v_target_race_id,
      v_check_date,
      'scheduled',
      v_target_mode,
      v_evaluation_mode,
      public.get_current_game_date_safe_v1(),
      public.get_game_date_for_season_end(v_sponsor.season_number),
      v_country_code,
      case
        when v_required_result = 'race_start' then 'race_entries'
        when v_required_result in ('stage_top_5', 'stage_win') then 'stage_results'
        else 'race_results'
      end,
      'pending'
    );

    v_inserted := v_inserted + 1;
  end loop;

  update public.club_sponsors cs
  set
    metadata = coalesce(cs.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'objectives_source', 'offer_preview_objectives',
        'objectives_synced_from_offer_id', p_offer_id,
        'objectives_synced_at', now(),
        'objectives_synced_count', v_inserted
      ),
    updated_at = now()
  where cs.id = p_club_sponsor_id;

  return jsonb_build_object(
    'status', 'completed',
    'club_sponsor_id', p_club_sponsor_id,
    'offer_id', p_offer_id,
    'inserted_count', v_inserted
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_race_startlist_consistency_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
begin
  with accepted_entries as (
    select
      count(*) filter (where rte.status = 'accepted') as accepted_entry_rows,
      count(distinct coalesce(rte.participating_club_id, rte.club_id))
        filter (where rte.status = 'accepted') as accepted_squads
    from public.race_team_entries rte
    where rte.race_id = p_race_id
  ),
  participant_riders as (
    select
      count(distinct rpr.team_id) as participant_squads,
      count(*) as participant_riders
    from public.race_participant_riders rpr
    where rpr.race_id = p_race_id
  ),
  missing_accepted_entries as (
    select
      jsonb_agg(
        jsonb_build_object(
          'team_id', rs.team_id,
          'participant_team_name', rs.participant_team_name,
          'rider_count', rs.rider_count,
          'current_club_name', c.name
        )
        order by coalesce(c.name, rs.participant_team_name)
      ) as rows
    from (
      select
        rpr.team_id,
        min(rpr.team_name_snapshot) as participant_team_name,
        count(*) as rider_count
      from public.race_participant_riders rpr
      where rpr.race_id = p_race_id
      group by rpr.team_id
    ) rs
    left join public.clubs c
      on c.id = rs.team_id
    where not exists (
      select 1
      from public.race_team_entries rte
      where rte.race_id = p_race_id
        and rte.status = 'accepted'
        and (
          rte.club_id = rs.team_id
          or rte.participating_club_id = rs.team_id
        )
    )
  ),
  accepted_without_participants as (
    select
      jsonb_agg(
        jsonb_build_object(
          'race_team_entry_id', rte.id,
          'club_id', rte.club_id,
          'participating_club_id', rte.participating_club_id,
          'team_name', c.name,
          'status', rte.status
        )
        order by c.name
      ) as rows
    from public.race_team_entries rte
    left join public.clubs c
      on c.id = coalesce(rte.participating_club_id, rte.club_id)
    where rte.race_id = p_race_id
      and rte.status = 'accepted'
      and not exists (
        select 1
        from public.race_participant_riders rpr
        where rpr.race_id = rte.race_id
          and (
            rpr.team_id = rte.club_id
            or rpr.team_id = rte.participating_club_id
          )
      )
  )
  select jsonb_build_object(
    'race_id', p_race_id,
    'accepted_squads', coalesce(ae.accepted_squads, 0),
    'accepted_entry_rows', coalesce(ae.accepted_entry_rows, 0),
    'participant_squads', coalesce(pr.participant_squads, 0),
    'participant_riders', coalesce(pr.participant_riders, 0),
    'missing_accepted_entries', coalesce(mae.rows, '[]'::jsonb),
    'accepted_without_participants', coalesce(awp.rows, '[]'::jsonb),
    'ok',
      coalesce(pr.participant_squads, 0) = 0
      or (
        coalesce(ae.accepted_squads, 0) = coalesce(pr.participant_squads, 0)
        and coalesce(jsonb_array_length(coalesce(mae.rows, '[]'::jsonb)), 0) = 0
        and coalesce(jsonb_array_length(coalesce(awp.rows, '[]'::jsonb)), 0) = 0
      )
  )
  into v_result
  from accepted_entries ae
  cross join participant_riders pr
  cross join missing_accepted_entries mae
  cross join accepted_without_participants awp;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.repair_race_startlist_consistency_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_updated_existing int := 0;
  v_inserted_missing int := 0;
  v_updated_rider_names int := 0;
  v_updated_team_names int := 0;
  v_audit jsonb;
begin
  -- Safe repair only:
  -- If a squad already exists in locked race_participant_riders,
  -- its race_team_entry may be restored/created as accepted.
  -- But accepted entries without participant riders are NOT auto-declined.

  with locked_squads as (
    select distinct
      rpr.race_id,
      rpr.team_id
    from public.race_participant_riders rpr
    where rpr.race_id = p_race_id
  ),
  upd as (
    update public.race_team_entries rte
    set
      status = 'accepted',
      participating_club_id = coalesce(rte.participating_club_id, rte.club_id),
      entry_source = coalesce(nullif(rte.entry_source, ''), 'repair_from_locked_startlist'),
      is_ai_filler = coalesce(rte.is_ai_filler, true),
      final_decision_at = coalesce(rte.final_decision_at, now()),
      updated_at = now()
    from locked_squads ls
    where rte.race_id = ls.race_id
      and (
        rte.club_id = ls.team_id
        or rte.participating_club_id = ls.team_id
      )
      and rte.status is distinct from 'accepted'
    returning 1
  )
  select count(*) into v_updated_existing
  from upd;

  with locked_squads as (
    select distinct
      rpr.race_id,
      rpr.team_id
    from public.race_participant_riders rpr
    where rpr.race_id = p_race_id
  ),
  ins as (
    insert into public.race_team_entries (
      race_id,
      club_id,
      participating_club_id,
      status,
      entry_source,
      is_ai_filler,
      final_decision_at
    )
    select
      ls.race_id,
      ls.team_id,
      ls.team_id,
      'accepted',
      'repair_from_locked_startlist',
      true,
      now()
    from locked_squads ls
    where not exists (
      select 1
      from public.race_team_entries rte
      where rte.race_id = ls.race_id
        and (
          rte.club_id = ls.team_id
          or rte.participating_club_id = ls.team_id
        )
    )
    returning 1
  )
  select count(*) into v_inserted_missing
  from ins;

  with upd as (
    update public.race_participant_riders rpr
    set rider_name_snapshot = trim(concat_ws(' ', r.first_name, r.last_name))
    from public.riders r
    where r.id = rpr.rider_id
      and rpr.race_id = p_race_id
      and nullif(trim(concat_ws(' ', r.first_name, r.last_name)), '') is not null
      and rpr.rider_name_snapshot is distinct from trim(concat_ws(' ', r.first_name, r.last_name))
    returning 1
  )
  select count(*) into v_updated_rider_names
  from upd;

  with upd as (
    update public.race_participant_riders rpr
    set team_name_snapshot = c.name
    from public.clubs c
    where c.id = rpr.team_id
      and rpr.race_id = p_race_id
      and nullif(trim(c.name), '') is not null
      and rpr.team_name_snapshot is distinct from c.name
    returning 1
  )
  select count(*) into v_updated_team_names
  from upd;

  v_audit := public.audit_race_startlist_consistency_v1(p_race_id);

  return jsonb_build_object(
    'race_id', p_race_id,
    'updated_existing_entries', v_updated_existing,
    'inserted_missing_entries', v_inserted_missing,
    'demoted_extra_accepted_entries', 0,
    'updated_rider_names', v_updated_rider_names,
    'updated_team_names', v_updated_team_names,
    'audit_after', v_audit
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_display_identity_v1(p_club_id uuid)
 RETURNS TABLE(club_id uuid, base_name text, display_name text, season_display_name text, original_club_name text, full_display_name text, locked_by_sponsor boolean, locked_until_game_date date, source_sponsor_id uuid, country_code text, club_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current_game_date date;

  v_club_id uuid;
  v_base_name text;
  v_country_code text;
  v_club_type text;
  v_parent_club_id uuid;

  v_own_display_name text;
  v_own_full_display_name text;
  v_own_original_name text;
  v_own_source_sponsor_id uuid;
  v_own_ends_game_date date;

  v_parent_display_name text;
  v_parent_source_sponsor_id uuid;
  v_parent_ends_game_date date;

  v_final_display_name text;
  v_final_original_name text;
  v_final_full_display_name text;
  v_final_source_sponsor_id uuid;
  v_final_locked_until date;
  v_final_locked boolean := false;
begin
  select
    c.id,
    c.name,
    c.country_code,
    c.club_type,
    c.parent_club_id
  into
    v_club_id,
    v_base_name,
    v_country_code,
    v_club_type,
    v_parent_club_id
  from public.clubs c
  where c.id = p_club_id
  limit 1;

  if v_club_id is null then
    return;
  end if;

  begin
    select public.get_current_game_date_date()
      into v_current_game_date;
  exception
    when others then
      v_current_game_date := null;
  end;

  -- Own ACTIVE sponsor identity only.
  select
    nullif(csi.display_name, ''),
    nullif(csi.full_display_name, ''),
    nullif(csi.original_club_name, ''),
    csi.source_sponsor_id,
    csi.ends_game_date
  into
    v_own_display_name,
    v_own_full_display_name,
    v_own_original_name,
    v_own_source_sponsor_id,
    v_own_ends_game_date
  from public.club_season_identities csi
  join public.club_sponsors cs
    on cs.id = csi.source_sponsor_id
   and cs.club_id = csi.club_id
  where csi.club_id = v_club_id
    and cs.status = 'active'
    and cs.sponsor_kind = 'main'
    and coalesce(csi.is_active, false) = true
    and nullif(csi.display_name, '') is not null
    and (
      v_current_game_date is null
      or (
        (csi.starts_game_date is null or csi.starts_game_date <= v_current_game_date)
        and (csi.ends_game_date is null or csi.ends_game_date >= v_current_game_date)
      )
    )
  order by
    csi.season_number desc,
    csi.updated_at desc nulls last,
    csi.created_at desc nulls last
  limit 1;

  -- Parent ACTIVE sponsor identity for developing teams only.
  if v_club_type = 'developing' and v_parent_club_id is not null then
    select
      nullif(csi.display_name, ''),
      csi.source_sponsor_id,
      csi.ends_game_date
    into
      v_parent_display_name,
      v_parent_source_sponsor_id,
      v_parent_ends_game_date
    from public.club_season_identities csi
    join public.club_sponsors cs
      on cs.id = csi.source_sponsor_id
     and cs.club_id = csi.club_id
    where csi.club_id = v_parent_club_id
      and cs.status = 'active'
      and cs.sponsor_kind = 'main'
      and coalesce(csi.is_active, false) = true
      and nullif(csi.display_name, '') is not null
      and (
        v_current_game_date is null
        or (
          (csi.starts_game_date is null or csi.starts_game_date <= v_current_game_date)
          and (csi.ends_game_date is null or csi.ends_game_date >= v_current_game_date)
        )
      )
    order by
      csi.season_number desc,
      csi.updated_at desc nulls last,
      csi.created_at desc nulls last
    limit 1;
  end if;

  if v_club_type = 'developing'
     and nullif(v_parent_display_name, '') is not null then
    v_final_display_name := v_parent_display_name || ' U23';
    v_final_original_name := v_base_name;
    v_final_full_display_name := v_final_display_name || ' (' || v_base_name || ')';
    v_final_source_sponsor_id := v_parent_source_sponsor_id;
    v_final_locked_until := v_parent_ends_game_date;
    v_final_locked := true;
  elsif nullif(v_own_display_name, '') is not null then
    v_final_display_name := v_own_display_name;
    v_final_original_name := coalesce(v_own_original_name, v_base_name, 'Team');
    v_final_full_display_name := coalesce(
      v_own_full_display_name,
      v_final_display_name || ' (' || coalesce(v_base_name, 'Team') || ')'
    );
    v_final_source_sponsor_id := v_own_source_sponsor_id;
    v_final_locked_until := v_own_ends_game_date;
    v_final_locked := true;
  else
    -- No active naming-rights sponsor: return original/base club identity.
    v_final_display_name := coalesce(v_base_name, 'Team');
    v_final_original_name := coalesce(v_base_name, 'Team');
    v_final_full_display_name := coalesce(v_base_name, 'Team');
    v_final_source_sponsor_id := null;
    v_final_locked_until := null;
    v_final_locked := false;
  end if;

  return query
  select
    v_club_id,
    v_base_name,
    v_final_display_name,
    v_final_display_name as season_display_name,
    v_final_original_name,
    v_final_full_display_name,
    v_final_locked,
    v_final_locked_until,
    v_final_source_sponsor_id,
    v_country_code,
    v_club_type;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_overview_finance_period_summary_v1(p_club_id uuid, p_before timestamp with time zone DEFAULT '2100-01-01 00:00:00+00'::timestamp with time zone, p_limit integer DEFAULT 5000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_club_id uuid := p_club_id;
  v_before timestamp with time zone := coalesce(p_before, '2100-01-01 00:00:00+00'::timestamptz);
  v_limit integer := coalesce(p_limit, 5000);
  v_result jsonb;
begin
  with statement_rows as (
    select
      s.created_at,
      s.transaction_id,
      lower(coalesce(s.type, '')) as type,
      coalesce(s.type_name, s.type, '') as type_name,
      lower(coalesce(s.category, '')) as category,
      coalesce(s.net_amount, 0)::bigint as net_amount,
      coalesce(s.metadata, '{}'::jsonb) as metadata
    from public.finance_get_club_statement_v2(
      v_club_id,
      v_limit,
      v_before
    ) s
  ),
  bounds as (
    select
      coalesce(max(created_at)::date, current_date) as max_tx_date
    from statement_rows
  ),
  classified as (
    select
      sr.*,
      sr.created_at::date as tx_date,
      case
        when sr.type = 'emergency_loan_disbursement' then false
        when sr.net_amount > 0 then true
        else false
      end as is_operating_income,
      case
        when sr.type = 'emergency_loan_principal_repayment' then false
        when sr.net_amount < 0 then true
        else false
      end as is_operating_expense
    from statement_rows sr
  ),
  period_totals as (
    select
      coalesce(sum(net_amount) filter (
        where is_operating_income
          and tx_date >= (select max_tx_date - 6 from bounds)
          and tx_date <= (select max_tx_date from bounds)
      ), 0) as weekly_income,

      coalesce(sum(abs(net_amount)) filter (
        where is_operating_expense
          and tx_date >= (select max_tx_date - 6 from bounds)
          and tx_date <= (select max_tx_date from bounds)
      ), 0) as weekly_expense,

      coalesce(sum(net_amount) filter (
        where is_operating_income
          and tx_date >= (select max_tx_date - 29 from bounds)
          and tx_date <= (select max_tx_date from bounds)
      ), 0) as monthly_income,

      coalesce(sum(abs(net_amount)) filter (
        where is_operating_expense
          and tx_date >= (select max_tx_date - 29 from bounds)
          and tx_date <= (select max_tx_date from bounds)
      ), 0) as monthly_expense,

      coalesce(sum(net_amount) filter (
        where is_operating_income
      ), 0) as season_income,

      coalesce(sum(abs(net_amount)) filter (
        where is_operating_expense
      ), 0) as season_expense
    from classified
  ),
  top_week_income as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', transaction_id,
          'type', type,
          'label', type_name,
          'amount', net_amount
        )
        order by abs(net_amount) desc
      ),
      '[]'::jsonb
    ) as rows
    from (
      select *
      from classified
      where is_operating_income
        and tx_date >= (select max_tx_date - 6 from bounds)
        and tx_date <= (select max_tx_date from bounds)
      order by abs(net_amount) desc
      limit 5
    ) x
  ),
  top_week_expense as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', transaction_id,
          'type', type,
          'label', type_name,
          'amount', net_amount
        )
        order by abs(net_amount) desc
      ),
      '[]'::jsonb
    ) as rows
    from (
      select *
      from classified
      where is_operating_expense
        and tx_date >= (select max_tx_date - 6 from bounds)
        and tx_date <= (select max_tx_date from bounds)
      order by abs(net_amount) desc
      limit 5
    ) x
  )
  select jsonb_build_object(
    'source', 'finance_get_club_statement_v2',
    'statementRowCount', (select count(*) from classified),
    'maxTransactionDate', (select max_tx_date from bounds),

    'weeklyOperatingIncome', weekly_income,
    'weeklyOperatingExpense', weekly_expense,
    'weeklyOperatingNet', weekly_income - weekly_expense,

    'monthlyOperatingIncome', monthly_income,
    'monthlyOperatingExpense', monthly_expense,
    'monthlyOperatingNet', monthly_income - monthly_expense,

    'seasonOperatingIncome', season_income,
    'seasonOperatingExpense', season_expense,
    'seasonOperatingNet', season_income - season_expense,

    'weekly_operating_income', weekly_income,
    'weekly_operating_expense', weekly_expense,
    'weekly_operating_net', weekly_income - weekly_expense,

    'monthly_operating_income', monthly_income,
    'monthly_operating_expense', monthly_expense,
    'monthly_operating_net', monthly_income - monthly_expense,

    'season_operating_income', season_income,
    'season_operating_expense', season_expense,
    'season_operating_net', season_income - season_expense,

    'topOperatingIncomes', (select rows from top_week_income),
    'topOperatingExpenses', (select rows from top_week_expense)
  )
  into v_result
  from period_totals;

  return coalesce(v_result, jsonb_build_object(
    'source', 'finance_get_club_statement_v2',
    'statementRowCount', 0,
    'weeklyOperatingIncome', 0,
    'weeklyOperatingExpense', 0,
    'monthlyOperatingIncome', 0,
    'monthlyOperatingExpense', 0,
    'seasonOperatingIncome', 0,
    'seasonOperatingExpense', 0
  ));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_team_display_name_sources_v1(p_old_name text DEFAULT 'BK Novi Beograd'::text)
 RETURNS TABLE(schema_name text, relation_name text, relation_type text, column_name text, matching_rows bigint, recommendation text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_count bigint;
  v_sql text;
begin
  for r in
    select
      c.table_schema,
      c.table_name,
      t.table_type,
      c.column_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type in ('BASE TABLE', 'VIEW')
      and c.data_type in ('text', 'character varying')
      and (
        c.column_name ilike '%club_name%'
        or c.column_name ilike '%team_name%'
        or c.column_name ilike '%display_name%'
        or c.column_name ilike '%name_snapshot%'
      )
    order by c.table_schema, c.table_name, c.ordinal_position
  loop
    v_sql := format(
      'select count(*)::bigint from %I.%I where %I ilike $1',
      r.table_schema,
      r.table_name,
      r.column_name
    );

    begin
      execute v_sql using '%' || p_old_name || '%' into v_count;
    exception
      when others then
        v_count := 0;
    end;

    if coalesce(v_count, 0) > 0 then
      schema_name := r.table_schema;
      relation_name := r.table_name;
      relation_type := r.table_type;
      column_name := r.column_name;
      matching_rows := v_count;

      recommendation :=
        case
          when r.table_name = 'clubs' and r.column_name = 'name'
            then 'KEEP: permanent/original club name. Do not overwrite.'
          when r.column_name ilike '%snapshot%'
            then 'CHECK: likely historical snapshot. Usually keep unless this is used as live display.'
          when r.table_type = 'VIEW'
            then 'PATCH VIEW: visible team name should use club_current_display_name_v1.'
          else
            'CHECK SOURCE: could be stored payload/history or live display source.'
        end;

      return next;
    end if;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_team_display_name_sources_for_club_v1(p_club_id uuid, p_old_name text DEFAULT 'BK Novi Beograd'::text, p_expected_name text DEFAULT 'Tikves Team'::text)
 RETURNS TABLE(schema_name text, relation_name text, relation_type text, name_column text, club_filter_column text, total_rows_for_club bigint, old_name_rows bigint, expected_name_rows bigint, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_filter_col text;
  v_total bigint;
  v_old bigint;
  v_expected bigint;
  v_sql text;
begin
  for r in
    select
      c.table_schema,
      c.table_name,
      t.table_type,
      c.column_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'VIEW'
      and c.data_type in ('text', 'character varying')
      and (
        c.column_name ilike '%club_name%'
        or c.column_name ilike '%team_name%'
        or c.column_name ilike '%display_name%'
        or c.column_name ilike '%name_snapshot%'
      )
    order by c.table_name, c.ordinal_position
  loop
    select c2.column_name
      into v_filter_col
    from information_schema.columns c2
    where c2.table_schema = r.table_schema
      and c2.table_name = r.table_name
      and c2.column_name in ('club_id', 'team_id')
    order by
      case c2.column_name
        when 'club_id' then 1
        when 'team_id' then 2
        else 9
      end
    limit 1;

    if v_filter_col is null then
      continue;
    end if;

    v_sql := format(
      'select
         count(*)::bigint,
         count(*) filter (where %I ilike $2)::bigint,
         count(*) filter (where %I ilike $3)::bigint
       from %I.%I
       where %I = $1',
      r.column_name,
      r.column_name,
      r.table_schema,
      r.table_name,
      v_filter_col
    );

    begin
      execute v_sql
        into v_total, v_old, v_expected
        using p_club_id, '%' || p_old_name || '%', '%' || p_expected_name || '%';
    exception
      when others then
        continue;
    end;

    if coalesce(v_total, 0) > 0 then
      schema_name := r.table_schema;
      relation_name := r.table_name;
      relation_type := r.table_type;
      name_column := r.column_name;
      club_filter_column := v_filter_col;
      total_rows_for_club := v_total;
      old_name_rows := coalesce(v_old, 0);
      expected_name_rows := coalesce(v_expected, 0);

      status :=
        case
          when coalesce(v_old, 0) > 0 then 'NEEDS_FIX_FOR_THIS_CLUB'
          when coalesce(v_expected, 0) > 0 then 'OK_EXPECTED_NAME_FOUND'
          else 'NO_OLD_OR_EXPECTED_NAME_FOR_THIS_CLUB'
        end;

      return next;
    end if;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_stage_command_delta_post_apply_verify_v1(p_stage_id uuid, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_queue_totals jsonb;
  v_status_counts jsonb;
  v_rider_rows jsonb;
  v_incidents jsonb;
  v_outcome_damage_rows jsonb;
begin
  select coalesce(jsonb_object_agg(application_status, row_count), '{}'::jsonb)
  into v_status_counts
  from (
    select application_status, count(*)::int as row_count
    from public.race_engine_stage_command_outcome_delta_applications q
    where q.stage_id = p_stage_id
      and (p_team_id is null or q.metadata->>'prepared_for_team_id' = p_team_id::text or q.club_id = p_team_id)
    group by application_status
  ) s;

  select jsonb_build_object(
    'row_count', count(*)::int,
    'prepared_rows', count(*) filter (where q.application_status = 'prepared')::int,
    'consumed_rows', count(*) filter (where q.application_status = 'consumed_by_finalizer')::int,
    'event_count', coalesce(sum(q.event_count),0)::int,
    'stamina_delta_total', coalesce(sum(q.stamina_delta_total),0),
    'fatigue_delta_total', coalesce(sum(q.fatigue_delta_total),0),
    'attack_attempts_added', coalesce(sum(q.attack_attempts_added),0)::int,
    'breakaway_km_added', coalesce(sum(q.breakaway_km_added),0),
    'support_work_added', coalesce(sum(q.support_work_added),0),
    'protection_received_added', coalesce(sum(q.protection_received_added),0),
    'incident_count', coalesce(sum(q.incident_count),0)::int,
    'mechanical_count', coalesce(sum(q.mechanical_count),0)::int
  )
  into v_queue_totals
  from public.race_engine_stage_command_outcome_delta_applications q
  where q.stage_id = p_stage_id
    and (p_team_id is null or q.metadata->>'prepared_for_team_id' = p_team_id::text or q.club_id = p_team_id);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.rider_name), '[]'::jsonb)
  into v_rider_rows
  from (
    select
      q.id as application_id,
      q.club_id,
      q.rider_id,
      q.rider_name,
      q.application_status,
      q.consumed_at,
      q.stamina_delta_total as queued_stamina_delta,
      q.fatigue_delta_total as queued_fatigue_delta,
      q.attack_attempts_added as queued_attack_attempts_added,
      q.breakaway_km_added as queued_breakaway_km_added,
      q.support_work_added as queued_support_work_added,
      q.protection_received_added as queued_protection_received_added,
      rs.id as rider_state_id,
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
      case when rs.id is not null then true else false end as official_state_row_found
    from public.race_engine_stage_command_outcome_delta_applications q
    left join public.race_stage_rider_states rs
      on rs.stage_id = q.stage_id
     and rs.rider_id = q.rider_id
     and rs.team_id = q.club_id
    where q.stage_id = p_stage_id
      and (p_team_id is null or q.metadata->>'prepared_for_team_id' = p_team_id::text or q.club_id = p_team_id)
    order by q.rider_name
  ) x;

  select coalesce(jsonb_agg(to_jsonb(i) order by i.km_marker, i.rider_id), '[]'::jsonb)
  into v_incidents
  from (
    select
      id,
      simulation_run_id,
      race_id,
      stage_id,
      rider_id,
      team_id,
      incident_type,
      incident_severity,
      km_marker,
      phase_number,
      time_loss_seconds,
      caused_dnf,
      metadata,
      created_at
    from public.race_stage_incidents
    where stage_id = p_stage_id
      and (p_team_id is null or team_id = p_team_id or team_id in (
        select club_id
        from public.race_engine_stage_command_outcome_delta_applications q
        where q.stage_id = p_stage_id
          and (q.metadata->>'prepared_for_team_id' = p_team_id::text or q.club_id = p_team_id)
      ))
      and coalesce(metadata->>'source_version','') in ('v15_apply_delta_to_official_rider_state','v15_1_apply_delta_to_official_rider_state')
  ) i;

  select coalesce(jsonb_agg(to_jsonb(o) order by o.event_km, o.rider_name), '[]'::jsonb)
  into v_outcome_damage_rows
  from (
    select
      o.id as outcome_id,
      o.simulation_run_id,
      o.race_id,
      o.stage_id,
      o.club_id,
      o.rider_id,
      o.rider_name,
      o.event_km,
      o.phase_number,
      o.command_code,
      o.outcome_type,
      o.incident_triggered,
      o.incident_type,
      o.mechanical_triggered,
      o.mechanical_type,
      o.equipment_damage_json,
      coalesce(o.equipment_damage_json->>'damage_severity_hint','none') as damage_severity_hint,
      coalesce((
        select jsonb_agg(distinct c.category order by c.category)
        from jsonb_array_elements_text(coalesce(o.equipment_damage_json->'target_categories_hint','[]'::jsonb)) c(category)
      ), '[]'::jsonb) as target_categories_hint,
      coalesce((
        select count(*)::int
        from jsonb_array_elements_text(coalesce(o.equipment_damage_json->'target_categories_hint','[]'::jsonb)) c(category)
        join public.club_equipment_inventory cei
          on cei.club_id = o.club_id
         and cei.equipment_category = c.category
         and coalesce(cei.status,'active') not in ('sold','discarded','retired','broken')
      ), 0) as matching_inventory_candidate_count,
      coalesce((
        select count(*)::int
        from public.race_engine_stage_wear_applications wa
        where wa.stage_id = o.stage_id
          and wa.club_id = o.club_id
          and wa.metadata->>'source_outcome_id' = o.id::text
      ), 0) as existing_incident_damage_wear_logs
    from public.race_engine_stage_command_outcomes o
    where o.stage_id = p_stage_id
      and (p_team_id is null or o.club_id = p_team_id or o.club_id in (
        select club_id
        from public.race_engine_stage_command_outcome_delta_applications q
        where q.stage_id = p_stage_id
          and (q.metadata->>'prepared_for_team_id' = p_team_id::text or q.club_id = p_team_id)
      ))
      and (o.incident_triggered or o.mechanical_triggered)
      and coalesce(o.equipment_damage_json->>'equipment_damage_possible','false') = 'true'
  ) o;

  return jsonb_build_object(
    'status','ok',
    'version','v16_post_apply_verify_and_damage_diagnostics',
    'stage_id',p_stage_id,
    'team_id',p_team_id,
    'queue_status_counts',v_status_counts,
    'queue_totals',v_queue_totals,
    'official_state_rows',v_rider_rows,
    'official_incidents_from_v15',v_incidents,
    'incident_equipment_damage_candidates',v_outcome_damage_rows,
    'safe_status',case when coalesce((v_queue_totals->>'prepared_rows')::int,0)=0 and coalesce((v_queue_totals->>'consumed_rows')::int,0)>0 then 'deltas_applied_and_queue_consumed' else 'check_queue_status_before_next_apply' end,
    'next_step','Use these diagnostics before adding incident equipment damage wear. Do not re-run v15 apply if queue rows are already consumed.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_incident_equipment_damage_v1(p_stage_id uuid, p_team_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true, p_consumer text DEFAULT 'road_stage_finalizer_v17_3'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_row jsonb;
  v_stage_date date;
  v_candidate_count int := 0;
  v_pending_count int := 0;
  v_existing_count int := 0;
  v_inserted_log_count int := 0;
  v_updated_equipment_count int := 0;
  v_result jsonb;
begin
  if to_regclass('public.race_engine_stage_command_outcomes') is null then
    return jsonb_build_object('status','error','version','v17_3_incident_equipment_damage','message','race_engine_stage_command_outcomes table missing');
  end if;

  if to_regclass('public.race_engine_stage_wear_applications') is null then
    return jsonb_build_object('status','error','version','v17_3_incident_equipment_damage','message','race_engine_stage_wear_applications table missing');
  end if;

  if to_regclass('public.club_equipment_inventory') is null then
    return jsonb_build_object('status','error','version','v17_3_incident_equipment_damage','message','club_equipment_inventory table missing');
  end if;

  select row_to_json(s)::jsonb
  into v_stage_row
  from public.race_stages s
  where s.id = p_stage_id
  limit 1;

  v_stage_date := coalesce(
    case when coalesce(v_stage_row->>'stage_date','') ~ '^\d{4}-\d{2}-\d{2}$' then (v_stage_row->>'stage_date')::date else null end,
    case when coalesce(v_stage_row->>'race_date','') ~ '^\d{4}-\d{2}-\d{2}$' then (v_stage_row->>'race_date')::date else null end,
    current_date
  );

  drop table if exists pg_temp.tmp_v17_damage_candidates;

  create temp table tmp_v17_damage_candidates (
    outcome_id uuid,
    simulation_run_id uuid,
    race_id uuid,
    stage_id uuid,
    club_id uuid,
    rider_id uuid,
    rider_name text,
    event_km numeric,
    phase_number int,
    command_code text,
    outcome_type text,
    incident_type text,
    mechanical_type text,
    damage_severity_hint text,
    equipment_category text,
    inventory_item_id uuid,
    inventory_display_name text,
    inventory_condition_before numeric,
    normal_wear_log_id uuid,
    candidate_source text,
    damage_loss numeric,
    already_applied boolean,
    pending_loss numeric,
    existing_damage_log_id uuid
  ) on commit drop;

  insert into tmp_v17_damage_candidates (
    outcome_id,
    simulation_run_id,
    race_id,
    stage_id,
    club_id,
    rider_id,
    rider_name,
    event_km,
    phase_number,
    command_code,
    outcome_type,
    incident_type,
    mechanical_type,
    damage_severity_hint,
    equipment_category,
    inventory_item_id,
    inventory_display_name,
    inventory_condition_before,
    normal_wear_log_id,
    candidate_source,
    damage_loss,
    already_applied,
    pending_loss,
    existing_damage_log_id
  )
  with relevant_clubs as (
    select distinct q.club_id
    from public.race_engine_stage_command_outcome_delta_applications q
    where q.stage_id = p_stage_id
      and (p_team_id is null or q.club_id = p_team_id or q.metadata->>'prepared_for_team_id' = p_team_id::text)
    union
    select p_team_id where p_team_id is not null
  ), damage_outcomes as (
    select
      o.*,
      coalesce(nullif(o.equipment_damage_json->>'damage_severity_hint',''),'low') as severity_hint
    from public.race_engine_stage_command_outcomes o
    where o.stage_id = p_stage_id
      and (o.incident_triggered or o.mechanical_triggered)
      and coalesce(o.equipment_damage_json->>'equipment_damage_possible','false') = 'true'
      and (
        p_team_id is null
        or o.club_id = p_team_id
        or o.club_id in (select club_id from relevant_clubs)
      )
  ), outcome_categories as (
    select
      o.*,
      lower(c.category) as equipment_category
    from damage_outcomes o
    cross join lateral jsonb_array_elements_text(coalesce(o.equipment_damage_json->'target_categories_hint','[]'::jsonb)) c(category)
    where lower(c.category) in ('frame','wheelset','tires','helmet','groupset','shoes')
  ), rider_rank_source as (
    select
      rs.stage_id,
      rs.team_id as club_id,
      rs.rider_id,
      row_number() over (partition by rs.stage_id, rs.team_id order by rs.rider_id::text) as rider_rank
    from public.race_stage_rider_states rs
    where rs.stage_id = p_stage_id
  ), normal_stage_wear as (
    select
      wa.id as normal_wear_log_id,
      wa.simulation_run_id,
      wa.stage_id,
      wa.club_id,
      wa.target_id as inventory_item_id,
      lower(coalesce(wa.target_key, cei.equipment_category)) as equipment_category,
      coalesce(nullif(cei.display_name,''), wa.target_id::text) as inventory_display_name,
      coalesce(cei.condition_percent,100)::numeric as condition_before,
      row_number() over (
        partition by wa.simulation_run_id, wa.stage_id, wa.club_id, lower(coalesce(wa.target_key, cei.equipment_category))
        order by wa.target_id::text
      ) as equipment_rank,
      count(*) over (
        partition by wa.simulation_run_id, wa.stage_id, wa.club_id, lower(coalesce(wa.target_key, cei.equipment_category))
      ) as equipment_count
    from public.race_engine_stage_wear_applications wa
    join public.club_equipment_inventory cei
      on cei.id = wa.target_id
    where wa.stage_id = p_stage_id
      and wa.target_type = 'equipment'
      and wa.target_table = 'club_equipment_inventory'
      and coalesce(wa.metadata->>'source','') = 'race_engine_stage_interactions_v8_5'
  ), fallback_inventory as (
    select
      oc.id as outcome_id,
      oc.equipment_category,
      cei.id as inventory_item_id,
      coalesce(nullif(cei.display_name,''), cei.id::text) as inventory_display_name,
      coalesce(cei.condition_percent,100)::numeric as condition_before,
      row_number() over (
        partition by oc.id, oc.equipment_category
        order by
          case when cei.assigned_rider_id = oc.rider_id then 0 else 1 end,
          coalesce(cei.condition_percent,100) desc,
          cei.id::text
      ) as rn
    from outcome_categories oc
    join public.club_equipment_inventory cei
      on cei.club_id = oc.club_id
     and lower(coalesce(cei.equipment_category,'')) = oc.equipment_category
     and coalesce(cei.status,'active') not in ('sold','discarded','retired','broken')
     and coalesce(cei.condition_percent,100) > 0
  ), chosen as (
    select
      oc.id as outcome_id,
      oc.simulation_run_id,
      oc.race_id,
      oc.stage_id,
      oc.club_id,
      oc.rider_id,
      oc.rider_name,
      oc.event_km,
      oc.phase_number,
      oc.command_code,
      oc.outcome_type,
      oc.incident_type,
      oc.mechanical_type,
      oc.severity_hint as damage_severity_hint,
      oc.equipment_category,
      coalesce(nsw.inventory_item_id, fi.inventory_item_id) as inventory_item_id,
      coalesce(nsw.inventory_display_name, fi.inventory_display_name) as inventory_display_name,
      coalesce(nsw.condition_before, fi.condition_before) as inventory_condition_before,
      nsw.normal_wear_log_id,
      case when nsw.inventory_item_id is not null then 'v8_5_normal_stage_wear_log_rider_rank_mapping' else 'fallback_inventory_assigned_or_best_condition' end as candidate_source
    from outcome_categories oc
    left join rider_rank_source rr
      on rr.stage_id = oc.stage_id
     and rr.club_id = oc.club_id
     and rr.rider_id = oc.rider_id
    left join normal_stage_wear nsw
      on nsw.simulation_run_id = oc.simulation_run_id
     and nsw.stage_id = oc.stage_id
     and nsw.club_id = oc.club_id
     and nsw.equipment_category = oc.equipment_category
     and nsw.equipment_rank = (1 + mod(greatest(coalesce(rr.rider_rank,1)-1,0), greatest(nsw.equipment_count,1)))
    left join fallback_inventory fi
      on fi.outcome_id = oc.id
     and fi.equipment_category = oc.equipment_category
     and fi.rn = 1
  ), with_loss as (
    select
      c.*,
      greatest(
        0,
        (
          case c.equipment_category
            when 'tires' then 1.500
            when 'wheelset' then 1.200
            when 'frame' then 0.800
            when 'helmet' then 0.600
            when 'groupset' then 0.700
            when 'shoes' then 0.400
            else 0.500
          end
          * case c.damage_severity_hint
              when 'low' then 0.65
              when 'low_to_medium' then 1.00
              when 'medium' then 1.50
              when 'high' then 2.50
              else 1.00
            end
        )
        * (
          1
          - least(
              30,
              coalesce(
                (public.equipment_get_mechanic_effects_v1(c.club_id, null::uuid[])->>'condition_loss_reduction_pct')::numeric,
                0
              )
            ) / 100.0
        )
        * (
          1
          - least(
              30,
              public.race_plan_equipment_van_protection_pct_for_stage_v1(c.stage_id, c.club_id)
            ) / 100.0
        )
        * (
          1
          - least(
              50,
              public.race_plan_mobile_workshop_field_recovery_pct_for_stage_v1(c.stage_id, c.club_id)
            ) / 100.0
        )
      )::numeric(10,3) as damage_loss
    from chosen c
    where c.inventory_item_id is not null
  )
  select
    wl.outcome_id,
    wl.simulation_run_id,
    wl.race_id,
    wl.stage_id,
    wl.club_id,
    wl.rider_id,
    wl.rider_name,
    wl.event_km,
    wl.phase_number,
    wl.command_code,
    wl.outcome_type,
    wl.incident_type,
    wl.mechanical_type,
    wl.damage_severity_hint,
    wl.equipment_category,
    wl.inventory_item_id,
    wl.inventory_display_name,
    wl.inventory_condition_before,
    wl.normal_wear_log_id,
    wl.candidate_source,
    wl.damage_loss,
    case when existing.id is not null then true else false end as already_applied,
    case when existing.id is not null then 0::numeric(10,3) else wl.damage_loss end as pending_loss,
    existing.id as existing_damage_log_id
  from with_loss wl
  left join public.race_engine_stage_incident_equipment_damage_applications existing
    on existing.simulation_run_id = wl.simulation_run_id
   and existing.stage_id = wl.stage_id
   and existing.club_id = wl.club_id
   and existing.inventory_item_id = wl.inventory_item_id
   and existing.source_outcome_id = wl.outcome_id
   and existing.equipment_category = wl.equipment_category;

  select count(*)::int into v_candidate_count from tmp_v17_damage_candidates;
  select count(*)::int into v_pending_count from tmp_v17_damage_candidates where pending_loss > 0;
  select count(*)::int into v_existing_count from tmp_v17_damage_candidates where already_applied;

  if not p_dry_run then
    insert into public.race_engine_stage_incident_equipment_damage_applications (
      simulation_run_id,
      race_id,
      stage_id,
      club_id,
      rider_id,
      rider_name,
      source_outcome_id,
      event_km,
      phase_number,
      command_code,
      outcome_type,
      incident_type,
      mechanical_type,
      equipment_category,
      inventory_item_id,
      inventory_display_name,
      condition_loss,
      applied_game_date,
      consumer,
      candidate_source,
      normal_wear_log_id,
      metadata
    )
    select
      c.simulation_run_id,
      c.race_id,
      c.stage_id,
      c.club_id,
      c.rider_id,
      c.rider_name,
      c.outcome_id,
      c.event_km,
      c.phase_number,
      c.command_code,
      c.outcome_type,
      c.incident_type,
      c.mechanical_type,
      c.equipment_category,
      c.inventory_item_id,
      c.inventory_display_name,
      c.pending_loss,
      v_stage_date,
      p_consumer,
      c.candidate_source,
      c.normal_wear_log_id,
      jsonb_build_object(
        'source','race_engine_stage_command_outcomes',
        'source_version','v17_3_incident_equipment_damage',
        'consumer',p_consumer,
        'source_outcome_id',c.outcome_id,
        'normal_wear_log_id',c.normal_wear_log_id,
        'candidate_source',c.candidate_source,
        'rider_id',c.rider_id,
        'rider_name',c.rider_name,
        'event_km',c.event_km,
        'phase_number',c.phase_number,
        'command_code',c.command_code,
        'outcome_type',c.outcome_type,
        'incident_type',c.incident_type,
        'mechanical_type',c.mechanical_type,
        'damage_severity_hint',c.damage_severity_hint,
        'equipment_category',c.equipment_category,
        'inventory_display_name',c.inventory_display_name,
        'condition_before_damage',c.inventory_condition_before,
        'condition_loss',c.pending_loss
      )
    from tmp_v17_damage_candidates c
    where c.pending_loss > 0
      and c.already_applied = false
    on conflict (simulation_run_id, stage_id, source_outcome_id, inventory_item_id, equipment_category) do nothing;

    get diagnostics v_inserted_log_count = row_count;

    update public.club_equipment_inventory cei
    set
      condition_percent = greatest(0, coalesce(cei.condition_percent,100) - c.pending_loss),
      updated_at = now()
    from tmp_v17_damage_candidates c
    join public.race_engine_stage_incident_equipment_damage_applications wa
      on wa.simulation_run_id = c.simulation_run_id
     and wa.stage_id = c.stage_id
     and wa.club_id = c.club_id
     and wa.inventory_item_id = c.inventory_item_id
     and wa.source_outcome_id = c.outcome_id
     and wa.equipment_category = c.equipment_category
    where cei.id = c.inventory_item_id
      and c.pending_loss > 0
      and c.already_applied = false;

    get diagnostics v_updated_equipment_count = row_count;
  end if;

  select jsonb_build_object(
    'status','ok',
    'version','v17_3_incident_equipment_damage',
    'dry_run',p_dry_run,
    'stage_id',p_stage_id,
    'team_id',p_team_id,
    'candidate_count',v_candidate_count,
    'pending_damage_count',v_pending_count,
    'already_applied_count',v_existing_count,
    'inserted_damage_wear_logs',v_inserted_log_count,
    'updated_equipment_count',v_updated_equipment_count,
    'total_pending_condition_loss',coalesce((select sum(pending_loss) from tmp_v17_damage_candidates),0),
    'total_damage_loss_all_candidates',coalesce((select sum(damage_loss) from tmp_v17_damage_candidates),0),
    'target_categories',coalesce((
      select jsonb_agg(distinct equipment_category order by equipment_category)
      from tmp_v17_damage_candidates
    ),'[]'::jsonb),
    'by_category',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.equipment_category)
      from (
        select equipment_category, count(*)::int as rows, sum(damage_loss) as damage_loss, sum(pending_loss) as pending_loss
        from tmp_v17_damage_candidates
        group by equipment_category
      ) x
    ),'[]'::jsonb),
    'candidates',coalesce((
      select jsonb_agg(to_jsonb(c) order by c.event_km, c.rider_name, c.equipment_category)
      from tmp_v17_damage_candidates c
    ),'[]'::jsonb),
    'important_note','v17 applies only incident/mechanical extra equipment damage. It does not re-run v15 rider-state deltas and does not touch race results/classifications.'
  ) into v_result;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_incident_equipment_damage_verify_v1(p_stage_id uuid, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rows jsonb;
  v_totals jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.rider_name, x.equipment_category), '[]'::jsonb)
  into v_rows
  from (
    select
      wa.id as wear_application_id,
      wa.simulation_run_id,
      wa.race_id,
      wa.stage_id,
      wa.club_id,
      wa.inventory_item_id,
      wa.equipment_category,
      wa.condition_loss,
      wa.applied_game_date,
      cei.display_name as inventory_display_name,
      cei.condition_percent as condition_after,
      wa.rider_id::text as rider_id,
      wa.rider_name,
      wa.source_outcome_id::text as source_outcome_id,
      wa.metadata->>'damage_severity_hint' as damage_severity_hint,
      wa.metadata->>'candidate_source' as candidate_source,
      wa.metadata
    from public.race_engine_stage_incident_equipment_damage_applications wa
    left join public.club_equipment_inventory cei on cei.id = wa.inventory_item_id
    where wa.stage_id = p_stage_id
      and (p_team_id is null or wa.club_id = p_team_id or wa.club_id in (
        select q.club_id
        from public.race_engine_stage_command_outcome_delta_applications q
        where q.stage_id = p_stage_id
          and (q.club_id = p_team_id or q.metadata->>'prepared_for_team_id' = p_team_id::text)
      ))
  ) x;

  select jsonb_build_object(
    'row_count', count(*)::int,
    'total_condition_loss', coalesce(sum(wa.condition_loss),0),
    'categories', coalesce(jsonb_agg(distinct wa.equipment_category order by wa.equipment_category), '[]'::jsonb),
    'source_outcomes', coalesce(jsonb_agg(distinct wa.source_outcome_id::text), '[]'::jsonb)
  )
  into v_totals
  from public.race_engine_stage_incident_equipment_damage_applications wa
  where wa.stage_id = p_stage_id
    and (p_team_id is null or wa.club_id = p_team_id or wa.club_id in (
      select q.club_id
      from public.race_engine_stage_command_outcome_delta_applications q
      where q.stage_id = p_stage_id
        and (q.club_id = p_team_id or q.metadata->>'prepared_for_team_id' = p_team_id::text)
    ));

  return jsonb_build_object(
    'status','ok',
    'version','v17_3_incident_equipment_damage_verify',
    'stage_id',p_stage_id,
    'team_id',p_team_id,
    'totals',v_totals,
    'rows',v_rows,
    'safe_note','These rows are extra incident/mechanical equipment damage logs only. Normal v8.5 stage equipment wear logs remain separate.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_stage_supply_consumption_schema_diagnostics_v1(p_stage_id uuid, p_club_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_id uuid;
  v_stage_date date;
  v_stage_plan_cols jsonb;
  v_supply_tables jsonb;
  v_supply_functions jsonb;
  v_candidate_stage_plan_rows jsonb;
  v_candidate_supply_rows jsonb;
  v_stage_plan_rider_count int;
  v_result jsonb;
begin
  select rs.race_id, rs.stage_date
    into v_race_id, v_stage_date
  from public.race_stages rs
  where rs.id = p_stage_id
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'table_name', c.table_name,
    'column_name', c.column_name,
    'data_type', c.data_type
  ) order by c.table_name, c.ordinal_position), '[]'::jsonb)
  into v_stage_plan_cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name in ('race_stage_plans','race_stage_plan_riders','race_preparations','race_preparation_supplies','club_race_supplies','club_supplies','race_supplies','club_supply_inventory','race_supply_inventory')
  ;

  select coalesce(jsonb_agg(jsonb_build_object(
    'table_name', t.table_name,
    'columns', (
      select jsonb_agg(c.column_name order by c.ordinal_position)
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = t.table_name
    )
  ) order by t.table_name), '[]'::jsonb)
  into v_supply_tables
  from information_schema.tables t
  where t.table_schema = 'public'
    and t.table_type = 'BASE TABLE'
    and (
      t.table_name ilike '%supply%'
      or t.table_name ilike '%supplies%'
      or t.table_name ilike '%race_preparation%'
      or t.table_name ilike '%stage_plan%'
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'schema_name', n.nspname,
    'function_name', p.proname,
    'arguments', pg_get_function_arguments(p.oid),
    'result_type', pg_get_function_result(p.oid)
  ) order by p.proname), '[]'::jsonb)
  into v_supply_functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (
      p.proname ilike '%supply%'
      or p.proname ilike '%supplies%'
      or p.proname ilike '%race_preparation%'
      or p.proname ilike '%stage_plan%'
      or p.proname ilike '%finalize%'
      or p.proname ilike '%simulation%'
    );

  select count(*)
    into v_stage_plan_rider_count
  from public.race_stage_plan_riders rspr
  join public.race_stage_plans rsp on rsp.id = rspr.race_stage_plan_id
  where rsp.stage_id = p_stage_id
    and (p_club_id is null or to_jsonb(rsp)->>'club_id' = p_club_id::text or to_jsonb(rsp)->'metadata'->>'participating_club_id' = p_club_id::text or to_jsonb(rsp)->'metadata'->>'club_id' = p_club_id::text or to_jsonb(rsp)->'metadata'->>'team_id' = p_club_id::text);

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  into v_candidate_stage_plan_rows
  from (
    select
      rsp.id,
      rsp.stage_id,
      to_jsonb(rsp)->>'club_id' as club_id,
      to_jsonb(rsp)->'metadata' as metadata,
      to_jsonb(rsp) as full_row_json
    from public.race_stage_plans rsp
    where rsp.stage_id = p_stage_id
      and (p_club_id is null or to_jsonb(rsp)->>'club_id' = p_club_id::text or to_jsonb(rsp)->'metadata'->>'participating_club_id' = p_club_id::text or to_jsonb(rsp)->'metadata'->>'club_id' = p_club_id::text or to_jsonb(rsp)->'metadata'->>'team_id' = p_club_id::text)
    limit 5
  ) x;

  -- This block is intentionally dynamic/defensive because project supply table names may differ.
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  into v_candidate_supply_rows
  from (
    select
      'race_preparation_supplies'::text as candidate_table,
      exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'race_preparation_supplies'
      ) as table_exists
    union all
    select 'club_race_supplies', exists (select 1 from information_schema.tables where table_schema='public' and table_name='club_race_supplies')
    union all
    select 'club_supplies', exists (select 1 from information_schema.tables where table_schema='public' and table_name='club_supplies')
    union all
    select 'club_supply_inventory', exists (select 1 from information_schema.tables where table_schema='public' and table_name='club_supply_inventory')
    union all
    select 'race_supply_inventory', exists (select 1 from information_schema.tables where table_schema='public' and table_name='race_supply_inventory')
  ) x;

  v_result := jsonb_build_object(
    'status','ok',
    'version','v18_1_stage_supply_consumption_schema_diagnostics',
    'stage_id',p_stage_id,
    'club_id',p_club_id,
    'race_id',v_race_id,
    'stage_date',v_stage_date,
    'stage_plan_rider_count',coalesce(v_stage_plan_rider_count,0),
    'current_ui_meaning',jsonb_build_object(
      'stage_supply_setup','planned per selected rider / stage',
      'stock_check','plan-only until the stage finalizer consumes it',
      'consumables','bidons, energy gels, nutrition packs should reduce after every finalized stage',
      'durables','race jersey complete and rain jackets should record stage uses / condition loss, not disappear after one stage'
    ),
    'required_backend_rule',jsonb_build_object(
      'trigger_point','after stage simulation/finalizer succeeds',
      'idempotency','one usage log per stage + club + supply item + source stage plan',
      'do_not_consume_on_save','saving Race Plan or Stage Plan must not reduce stock',
      'multi_stage_race','Stage 2 must see stock after Stage 1 consumption'
    ),
    'candidate_supply_tables',v_supply_tables,
    'candidate_supply_table_presence',v_candidate_supply_rows,
    'stage_plan_related_columns',v_stage_plan_cols,
    'candidate_stage_plan_rows',v_candidate_stage_plan_rows,
    'candidate_functions',v_supply_functions,
    'safe_next_step','Use this output to patch a schema-specific stage-supply finalizer that consumes consumables and increments durable stage-use/condition logs idempotently.'
  );

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_stage_supply_plan_payload_diagnostics_v1(p_stage_id uuid, p_club_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_id uuid;
  v_stage_date date;
  v_stage_number int;
  v_relevant_clubs jsonb;
  v_stage_plans jsonb;
  v_stage_supply_rows jsonb;
  v_preparation_supply_rows jsonb;
  v_club_stock jsonb;
  v_durable_units jsonb;
  v_existing_usage_events jsonb;
  v_apply_function jsonb;
  v_planned_totals jsonb;
begin
  select rs.race_id, rs.stage_date, rs.stage_number
    into v_race_id, v_stage_date, v_stage_number
  from public.race_stages rs
  where rs.id = p_stage_id
  limit 1;

  if v_race_id is null then
    select rsp.race_id, rsp.stage_date, rsp.stage_number
      into v_race_id, v_stage_date, v_stage_number
    from public.race_stage_plans rsp
    where rsp.stage_id = p_stage_id
    limit 1;
  end if;

  with scope as (
    select p_club_id as club_id, 'requested'::text as relation where p_club_id is not null
    union
    select c.id, 'developing_child'
    from public.clubs c
    where p_club_id is not null
      and c.parent_club_id = p_club_id
    union
    select c.parent_club_id, 'parent_main'
    from public.clubs c
    where p_club_id is not null
      and c.id = p_club_id
      and c.parent_club_id is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object('club_id', club_id, 'relation', relation) order by relation), '[]'::jsonb)
    into v_relevant_clubs
  from scope
  where club_id is not null;

  with scope as (
    select (x->>'club_id')::uuid as club_id
    from jsonb_array_elements(coalesce(v_relevant_clubs,'[]'::jsonb)) x
  ), plans as (
    select
      rsp.id as race_stage_plan_id,
      rsp.race_preparation_id,
      rsp.race_id,
      rsp.stage_id,
      rsp.stage_number,
      rsp.stage_date,
      rsp.status,
      rp.club_id as preparation_club_id,
      rp.participating_club_id,
      rp.rider_count,
      rp.status as preparation_status,
      rsp.rider_supplies_json,
      rsp.engine_stage_payload_json,
      rsp.metadata,
      rsp.created_at,
      rsp.updated_at,
      rsp.last_saved_at
    from public.race_stage_plans rsp
    left join public.race_preparations rp on rp.id = rsp.race_preparation_id
    where rsp.stage_id = p_stage_id
      and (
        p_club_id is null
        or rp.club_id in (select club_id from scope)
        or rp.participating_club_id in (select club_id from scope)
        or nullif(rsp.metadata->>'club_id','')::uuid in (select club_id from scope where (rsp.metadata->>'club_id') ~* '^[0-9a-f-]{36}$')
        or nullif(rsp.metadata->>'participating_club_id','')::uuid in (select club_id from scope where (rsp.metadata->>'participating_club_id') ~* '^[0-9a-f-]{36}$')
      )
  )
  select coalesce(jsonb_agg(to_jsonb(plans) order by last_saved_at desc nulls last, updated_at desc nulls last), '[]'::jsonb)
    into v_stage_plans
  from plans;

  with scope as (
    select (x->>'club_id')::uuid as club_id
    from jsonb_array_elements(coalesce(v_relevant_clubs,'[]'::jsonb)) x
  ), plans as (
    select rsp.id as race_stage_plan_id, rp.club_id, rp.participating_club_id
    from public.race_stage_plans rsp
    left join public.race_preparations rp on rp.id = rsp.race_preparation_id
    where rsp.stage_id = p_stage_id
      and (
        p_club_id is null
        or rp.club_id in (select club_id from scope)
        or rp.participating_club_id in (select club_id from scope)
      )
  ), rows as (
    select
      rsps.id,
      rsps.race_stage_plan_id,
      p.club_id as preparation_club_id,
      p.participating_club_id,
      coalesce(p.participating_club_id, p.club_id) as effective_club_id,
      rsps.supply_key,
      rsps.quantity_planned,
      rsps.quantity_consumed,
      rsps.supply_snapshot_json,
      rsps.bonus_snapshot_json,
      rsps.metadata,
      rsps.created_at,
      rsps.updated_at
    from public.race_stage_plan_supplies rsps
    join plans p on p.race_stage_plan_id = rsps.race_stage_plan_id
  )
  select coalesce(jsonb_agg(to_jsonb(rows) order by supply_key), '[]'::jsonb)
    into v_stage_supply_rows
  from rows;

  with scope as (
    select (x->>'club_id')::uuid as club_id
    from jsonb_array_elements(coalesce(v_relevant_clubs,'[]'::jsonb)) x
  ), prep as (
    select rp.id, rp.club_id, rp.participating_club_id
    from public.race_preparations rp
    where rp.race_id = v_race_id
      and (
        p_club_id is null
        or rp.club_id in (select club_id from scope)
        or rp.participating_club_id in (select club_id from scope)
      )
  ), rows as (
    select
      rps.id,
      rps.race_preparation_id,
      p.club_id as preparation_club_id,
      p.participating_club_id,
      coalesce(p.participating_club_id, p.club_id) as effective_club_id,
      rps.supply_key,
      rps.quantity_reserved,
      rps.quantity_consumed,
      rps.supply_snapshot_json,
      rps.bonus_snapshot_json,
      rps.metadata,
      rps.created_at,
      rps.updated_at
    from public.race_preparation_supplies rps
    join prep p on p.id = rps.race_preparation_id
  )
  select coalesce(jsonb_agg(to_jsonb(rows) order by supply_key), '[]'::jsonb)
    into v_preparation_supply_rows
  from rows;

  with scope as (
    select (x->>'club_id')::uuid as club_id
    from jsonb_array_elements(coalesce(v_relevant_clubs,'[]'::jsonb)) x
  ), rows as (
    select
      crs.id,
      crs.club_id,
      crs.supply_key,
      crs.display_name,
      crs.quantity_available,
      crs.total_purchased,
      crs.total_used,
      crs.last_purchased_game_date,
      crs.last_used_game_date,
      crs.metadata
    from public.club_race_supplies crs
    where p_club_id is null or crs.club_id in (select club_id from scope)
  )
  select coalesce(jsonb_agg(to_jsonb(rows) order by club_id, supply_key), '[]'::jsonb)
    into v_club_stock
  from rows;

  with scope as (
    select (x->>'club_id')::uuid as club_id
    from jsonb_array_elements(coalesce(v_relevant_clubs,'[]'::jsonb)) x
  ), rows as (
    select
      cru.club_id,
      cru.supply_key,
      count(*) as total_units,
      count(*) filter (where cru.status = 'usable') as usable_units,
      min(cru.stage_uses_remaining) as min_stage_uses_remaining,
      max(cru.stage_uses_remaining) as max_stage_uses_remaining,
      sum(cru.stage_uses_remaining) as total_stage_uses_remaining,
      max(cru.max_stage_uses) as max_stage_uses
    from public.club_race_supply_units cru
    where p_club_id is null or cru.club_id in (select club_id from scope)
    group by cru.club_id, cru.supply_key
  )
  select coalesce(jsonb_agg(to_jsonb(rows) order by club_id, supply_key), '[]'::jsonb)
    into v_durable_units
  from rows;

  with scope as (
    select (x->>'club_id')::uuid as club_id
    from jsonb_array_elements(coalesce(v_relevant_clubs,'[]'::jsonb)) x
  ), rows as (
    select
      e.id,
      e.club_id,
      e.race_stage_plan_id,
      e.idempotency_key,
      e.usage_json,
      e.result_json,
      e.applied_game_date,
      e.created_at
    from public.race_stage_supply_usage_events e
    left join public.race_stage_plans rsp on rsp.id = e.race_stage_plan_id
    where (rsp.stage_id = p_stage_id or e.usage_json->>'stage_id' = p_stage_id::text)
      and (p_club_id is null or e.club_id in (select club_id from scope))
  )
  select coalesce(jsonb_agg(to_jsonb(rows) order by created_at desc), '[]'::jsonb)
    into v_existing_usage_events
  from rows;

  with rows as (
    select
      p.proname as function_name,
      pg_get_function_arguments(p.oid) as arguments,
      pg_get_function_result(p.oid) as result_type,
      left(pg_get_functiondef(p.oid), 12000) as function_definition_prefix
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'apply_race_stage_supply_usage_v1'
    order by p.oid::text
  )
  select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb)
    into v_apply_function
  from rows;

  with rows as (
    select
      x.effective_club_id,
      x.supply_key,
      sum(x.quantity_planned)::int as quantity_planned,
      sum(coalesce(x.quantity_consumed,0))::int as quantity_consumed_already
    from jsonb_to_recordset(coalesce(v_stage_supply_rows,'[]'::jsonb)) as x(
      effective_club_id uuid,
      supply_key text,
      quantity_planned int,
      quantity_consumed int
    )
    group by x.effective_club_id, x.supply_key
  )
  select coalesce(jsonb_agg(to_jsonb(rows) order by supply_key), '[]'::jsonb)
    into v_planned_totals
  from rows;

  return jsonb_build_object(
    'status','ok',
    'version','v18_2_stage_supply_plan_payload_diagnostics',
    'stage_id',p_stage_id,
    'race_id',v_race_id,
    'stage_date',v_stage_date,
    'stage_number',v_stage_number,
    'requested_club_id',p_club_id,
    'relevant_clubs',coalesce(v_relevant_clubs,'[]'::jsonb),
    'stage_plan_count',jsonb_array_length(coalesce(v_stage_plans,'[]'::jsonb)),
    'stage_supply_row_count',jsonb_array_length(coalesce(v_stage_supply_rows,'[]'::jsonb)),
    'preparation_supply_row_count',jsonb_array_length(coalesce(v_preparation_supply_rows,'[]'::jsonb)),
    'existing_usage_event_count',jsonb_array_length(coalesce(v_existing_usage_events,'[]'::jsonb)),
    'stage_plans',coalesce(v_stage_plans,'[]'::jsonb),
    'stage_supply_rows',coalesce(v_stage_supply_rows,'[]'::jsonb),
    'planned_totals_from_stage_supply_rows',coalesce(v_planned_totals,'[]'::jsonb),
    'preparation_supply_rows',coalesce(v_preparation_supply_rows,'[]'::jsonb),
    'club_stock',coalesce(v_club_stock,'[]'::jsonb),
    'durable_unit_summary',coalesce(v_durable_units,'[]'::jsonb),
    'existing_usage_events',coalesce(v_existing_usage_events,'[]'::jsonb),
    'apply_race_stage_supply_usage_v1_definition',coalesce(v_apply_function,'[]'::jsonb),
    'safe_next_step','Use stage_supply_rows/planned_totals and the exact apply_race_stage_supply_usage_v1 payload contract to build the idempotent finalizer wrapper. Do not consume on Stage Plan save.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_stage_supply_consumption_v1(p_stage_id uuid, p_club_id uuid, p_dry_run boolean DEFAULT true, p_consumer text DEFAULT 'race_engine_stage_supply_consumption_v19'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_plan record;
  v_stage_plan_count integer := 0;
  v_existing_usage_count integer := 0;
  v_usage jsonb := '{}'::jsonb;
  v_result jsonb := '{}'::jsonb;
  v_idempotency_key text;
  v_rider_count integer := 0;
  v_bidons integer := 0;
  v_gels integer := 0;
  v_nutrition integer := 0;
  v_jerseys integer := 0;
  v_jackets integer := 0;
  v_stock_before jsonb := '[]'::jsonb;
  v_stock_after jsonb := '[]'::jsonb;
  v_durable_before jsonb := '[]'::jsonb;
  v_durable_after jsonb := '[]'::jsonb;
  v_missing_function boolean := false;
begin
  if p_stage_id is null then
    raise exception 'p_stage_id is required';
  end if;
  if p_club_id is null then
    raise exception 'p_club_id is required';
  end if;

  if to_regprocedure('public.apply_race_stage_supply_usage_v1(uuid,jsonb,date,text,uuid)') is null then
    v_missing_function := true;
  end if;

  select count(*)
  into v_stage_plan_count
  from public.race_stage_plans rsp
  join public.race_preparations rp on rp.id = rsp.race_preparation_id
  where rsp.stage_id = p_stage_id
    and (
      rp.club_id = p_club_id
      or rp.participating_club_id = p_club_id
      or rsp.metadata->>'participating_club_id' = p_club_id::text
      or rsp.metadata->>'club_id' = p_club_id::text
      or rsp.metadata->>'team_id' = p_club_id::text
    );

  select
    rsp.id as race_stage_plan_id,
    rsp.race_id,
    rsp.stage_id,
    rsp.stage_number,
    rsp.stage_date,
    rsp.status as stage_plan_status,
    rsp.rider_supplies_json,
    rp.id as race_preparation_id,
    rp.club_id as preparation_club_id,
    rp.participating_club_id,
    rp.status as preparation_status,
    coalesce(rsp.updated_at, rsp.created_at) as plan_updated_at
  into v_stage_plan
  from public.race_stage_plans rsp
  join public.race_preparations rp on rp.id = rsp.race_preparation_id
  where rsp.stage_id = p_stage_id
    and (
      rp.club_id = p_club_id
      or rp.participating_club_id = p_club_id
      or rsp.metadata->>'participating_club_id' = p_club_id::text
      or rsp.metadata->>'club_id' = p_club_id::text
      or rsp.metadata->>'team_id' = p_club_id::text
    )
  order by
    case when rp.club_id = p_club_id then 0 else 1 end,
    case when rp.status = 'submitted' then 0 else 1 end,
    coalesce(rsp.updated_at, rsp.created_at) desc
  limit 1;

  if v_stage_plan.race_stage_plan_id is null then
    return jsonb_build_object(
      'status','no_stage_plan_found',
      'version','v19_stage_supply_consumption',
      'stage_id',p_stage_id,
      'club_id',p_club_id,
      'dry_run',p_dry_run,
      'stage_plan_count',v_stage_plan_count,
      'message','No race_stage_plans row matched this stage + club. Nothing consumed.'
    );
  end if;

  with rider_values as (
    select
      e.key as rider_id_text,
      e.value as supplies
    from jsonb_each(coalesce(v_stage_plan.rider_supplies_json, '{}'::jsonb)) e
    where jsonb_typeof(e.value) = 'object'
  ), parsed as (
    select
      rider_id_text,
      case when coalesce(supplies->>'bidons', supplies->>'bidons_water_bottles', '0') ~ '^[0-9]+$'
           then coalesce(supplies->>'bidons', supplies->>'bidons_water_bottles', '0')::integer else 0 end as bidons,
      case when coalesce(supplies->>'gels', supplies->>'energy_gels', '0') ~ '^[0-9]+$'
           then coalesce(supplies->>'gels', supplies->>'energy_gels', '0')::integer else 0 end as gels,
      case when coalesce(supplies->>'nutrition_packs', supplies->>'nutrition', '0') ~ '^[0-9]+$'
           then coalesce(supplies->>'nutrition_packs', supplies->>'nutrition', '0')::integer else 0 end as nutrition,
      case
        when lower(coalesce(supplies->>'race_jersey_complete', supplies->>'race_jersey', 'false')) in ('true','t','1','yes','y','all') then 1
        when coalesce(supplies->>'race_jersey_complete', supplies->>'race_jersey', '0') ~ '^[0-9]+$'
          then least(coalesce(supplies->>'race_jersey_complete', supplies->>'race_jersey', '0')::integer, 1)
        else 0
      end as jersey_use,
      case
        when lower(coalesce(supplies->>'rain_jacket', supplies->>'rain_jackets', 'false')) in ('true','t','1','yes','y','all') then 1
        when coalesce(supplies->>'rain_jacket', supplies->>'rain_jackets', '0') ~ '^[0-9]+$'
          then least(coalesce(supplies->>'rain_jacket', supplies->>'rain_jackets', '0')::integer, 1)
        else 0
      end as jacket_use
    from rider_values
  )
  select
    count(*)::integer,
    coalesce(sum(bidons),0)::integer,
    coalesce(sum(gels),0)::integer,
    coalesce(sum(nutrition),0)::integer,
    coalesce(sum(jersey_use),0)::integer,
    coalesce(sum(jacket_use),0)::integer
  into v_rider_count, v_bidons, v_gels, v_nutrition, v_jerseys, v_jackets
  from parsed;

  v_usage := jsonb_build_object(
    'source','race_engine_apply_stage_supply_consumption_v1',
    'source_version','v19_stage_supply_consumption',
    'consumer',p_consumer,
    'race_id',v_stage_plan.race_id,
    'stage_id',p_stage_id,
    'stage_number',v_stage_plan.stage_number,
    'stage_date',v_stage_plan.stage_date,
    'race_stage_plan_id',v_stage_plan.race_stage_plan_id,
    'race_preparation_id',v_stage_plan.race_preparation_id,
    'preparation_club_id',v_stage_plan.preparation_club_id,
    'participating_club_id',v_stage_plan.participating_club_id,
    'rider_count',v_rider_count,
    'bidons_water_bottles',v_bidons,
    'energy_gels',v_gels,
    'nutrition_packs',v_nutrition,
    'race_jersey_complete',v_jerseys,
    'rain_jackets',v_jackets,
    'rain_jacket_counts_as_use',(v_jackets > 0),
    'bad_weather',(v_jackets > 0),
    'raw_rider_supplies_json',coalesce(v_stage_plan.rider_supplies_json, '{}'::jsonb)
  );

  v_idempotency_key := 'race_stage_supply_consumption:' || p_stage_id::text || ':' || p_club_id::text || ':' || v_stage_plan.race_stage_plan_id::text || ':v19';

  select count(*)
  into v_existing_usage_count
  from public.race_stage_supply_usage_events e
  where e.club_id = p_club_id
    and e.idempotency_key = v_idempotency_key;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.supply_key), '[]'::jsonb)
  into v_stock_before
  from (
    select supply_key, display_name, quantity_available, total_purchased, total_used, last_used_game_date
    from public.club_race_supplies
    where club_id = p_club_id
    order by supply_key
  ) s;

  if to_regprocedure('public.get_club_race_supply_unit_summary_v1(uuid)') is not null then
    select coalesce(jsonb_agg(to_jsonb(d) order by d.supply_key), '[]'::jsonb)
    into v_durable_before
    from public.get_club_race_supply_unit_summary_v1(p_club_id) d;
  end if;

  if p_dry_run then
    return jsonb_build_object(
      'status','ok',
      'dry_run',true,
      'version','v19_stage_supply_consumption',
      'stage_id',p_stage_id,
      'club_id',p_club_id,
      'race_stage_plan_id',v_stage_plan.race_stage_plan_id,
      'race_preparation_id',v_stage_plan.race_preparation_id,
      'preparation_club_id',v_stage_plan.preparation_club_id,
      'participating_club_id',v_stage_plan.participating_club_id,
      'stage_plan_count',v_stage_plan_count,
      'existing_usage_event_count_for_key',v_existing_usage_count,
      'idempotency_key',v_idempotency_key,
      'usage_payload',v_usage,
      'planned_totals',jsonb_build_object(
        'rider_count',v_rider_count,
        'bidons_water_bottles',v_bidons,
        'energy_gels',v_gels,
        'nutrition_packs',v_nutrition,
        'race_jersey_complete_stage_uses',v_jerseys,
        'rain_jackets_stage_uses',v_jackets
      ),
      'stock_before',v_stock_before,
      'durable_summary_before',v_durable_before,
      'missing_apply_function',v_missing_function,
      'safe_note','Dry-run only. No supplies consumed and no durable uses applied.'
    );
  end if;

  if v_missing_function then
    raise exception 'Missing required function public.apply_race_stage_supply_usage_v1(uuid,jsonb,date,text,uuid)';
  end if;

  select public.apply_race_stage_supply_usage_v1(
    p_club_id,
    v_usage,
    v_stage_plan.stage_date,
    v_idempotency_key,
    v_stage_plan.race_stage_plan_id
  ) into v_result;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.supply_key), '[]'::jsonb)
  into v_stock_after
  from (
    select supply_key, display_name, quantity_available, total_purchased, total_used, last_used_game_date
    from public.club_race_supplies
    where club_id = p_club_id
    order by supply_key
  ) s;

  if to_regprocedure('public.get_club_race_supply_unit_summary_v1(uuid)') is not null then
    select coalesce(jsonb_agg(to_jsonb(d) order by d.supply_key), '[]'::jsonb)
    into v_durable_after
    from public.get_club_race_supply_unit_summary_v1(p_club_id) d;
  end if;

  return jsonb_build_object(
    'status','ok',
    'dry_run',false,
    'version','v19_stage_supply_consumption',
    'stage_id',p_stage_id,
    'club_id',p_club_id,
    'race_stage_plan_id',v_stage_plan.race_stage_plan_id,
    'idempotency_key',v_idempotency_key,
    'usage_payload',v_usage,
    'applied_result',v_result,
    'stock_before',v_stock_before,
    'stock_after',v_stock_after,
    'durable_summary_before',v_durable_before,
    'durable_summary_after',v_durable_after,
    'official_integration_status','stage_supply_usage_applied_idempotently'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_stage_supply_consumption_verify_v1(p_stage_id uuid, p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_events jsonb := '[]'::jsonb;
  v_stock jsonb := '[]'::jsonb;
  v_durable jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb), count(*)
  into v_events, v_count
  from (
    select
      e.id,
      e.club_id,
      e.race_stage_plan_id,
      e.idempotency_key,
      e.usage_json,
      e.result_json,
      e.applied_game_date,
      e.created_at
    from public.race_stage_supply_usage_events e
    join public.race_stage_plans rsp on rsp.id = e.race_stage_plan_id
    where rsp.stage_id = p_stage_id
      and e.club_id = p_club_id
      and e.idempotency_key like 'race_stage_supply_consumption:%:v19'
    order by e.created_at
  ) e;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.supply_key), '[]'::jsonb)
  into v_stock
  from (
    select supply_key, display_name, quantity_available, total_purchased, total_used, last_used_game_date
    from public.club_race_supplies
    where club_id = p_club_id
    order by supply_key
  ) s;

  if to_regprocedure('public.get_club_race_supply_unit_summary_v1(uuid)') is not null then
    select coalesce(jsonb_agg(to_jsonb(d) order by d.supply_key), '[]'::jsonb)
    into v_durable
    from public.get_club_race_supply_unit_summary_v1(p_club_id) d;
  end if;

  return jsonb_build_object(
    'status','ok',
    'version','v19_stage_supply_consumption_verify',
    'stage_id',p_stage_id,
    'club_id',p_club_id,
    'usage_event_count',v_count,
    'usage_events',v_events,
    'club_stock',v_stock,
    'durable_unit_summary',v_durable,
    'safe_note','Consumables should be lower after apply; durable unit summary should show fewer remaining stage uses for jerseys/jackets.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_user_activity_v1(p_user_id uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_caller_id uuid;
  v_club record;
  v_reactivated_count integer := 0;
  v_archived_count integer := 0;
  v_referral_activity jsonb := '{}'::jsonb;
begin
  v_user_id := p_user_id;
  v_caller_id := auth.uid();

  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if v_caller_id is not null and v_caller_id <> v_user_id then
    raise exception 'Cannot mark activity for another user';
  end if;

  update public.profiles p
  set last_seen_at = now(),
      last_login_at = coalesce(p.last_login_at, now()),
      updated_at = now()
  where p.id = v_user_id;

  for v_club in
    select c.id, c.inactivity_status, c.is_active
    from public.clubs c
    where c.owner_user_id = v_user_id
      and c.is_ai = false
      and c.deleted_at is null
      and c.club_type = 'main'
  loop
    if v_club.inactivity_status in ('at_risk','inactive') then
      update public.clubs c
      set is_active = true,
          inactivity_status = 'active',
          inactive_at = null,
          inactivity_reason = null,
          updated_at = now()
      where c.id = v_club.id;

      insert into public.user_team_inactivity_events (
        user_id, club_id, previous_status, new_status, days_inactive, reason, metadata
      ) values (
        v_user_id, v_club.id, v_club.inactivity_status, 'active', null,
        'user_returned', jsonb_build_object('source','mark_user_activity_v1')
      );
      v_reactivated_count := v_reactivated_count + 1;
    elsif v_club.inactivity_status = 'archived' then
      v_archived_count := v_archived_count + 1;
    end if;
  end loop;

  v_referral_activity := public.referral_record_activity_day_v1(v_user_id);
  perform public.referral_try_paid_conversion_from_history_v1(v_user_id);

  return jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'reactivated_count', v_reactivated_count,
    'archived_count', v_archived_count,
    'archived_requires_manual_reactivation', v_archived_count > 0,
    'referral_activity', v_referral_activity
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_user_team_inactivity_v1(p_dry_run boolean DEFAULT true)
 RETURNS TABLE(club_id uuid, club_name text, user_id uuid, previous_status text, new_status text, days_inactive integer, action_taken text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  v_warning_days integer := 25;
  v_inactive_days integer := 30;
  v_removal_pending_days integer := 90;
  v_last_activity timestamptz;
  v_days_inactive integer;
  v_new_status text;
  v_action text;
  v_current_season integer;
begin
  begin
    v_current_season := public.get_current_season_number();
  exception when others then
    v_current_season := null;
  end;

  for r in
    select c.id club_id,c.name club_name,c.owner_user_id user_id,c.inactivity_status,c.is_active,c.created_at club_created_at,
           p.last_seen_at,p.last_login_at,au.last_sign_in_at
    from public.clubs c
    join public.profiles p on p.id=c.owner_user_id
    left join auth.users au on au.id=c.owner_user_id
    where c.club_type='main' and coalesce(c.is_ai,false)=false and c.owner_user_id is not null
      and c.deleted_at is null and coalesce(c.inactivity_status,'active')<>'closed'
  loop
    v_last_activity := greatest(
      coalesce(r.last_seen_at,'-infinity'::timestamptz),
      coalesce(r.last_login_at,'-infinity'::timestamptz),
      coalesce(r.last_sign_in_at,'-infinity'::timestamptz)
    );
    if v_last_activity='-infinity'::timestamptz then v_last_activity:=coalesce(r.club_created_at,now()); end if;
    v_days_inactive:=greatest(0,floor(extract(epoch from (now()-v_last_activity))/86400)::integer);
    v_new_status:=case when v_days_inactive>=v_removal_pending_days then 'season_end_removal_pending'
                       when v_days_inactive>=v_inactive_days then 'inactive'
                       when v_days_inactive>=v_warning_days then 'at_risk' else 'active' end;
    v_action:='no_change';
    if v_new_status<>coalesce(r.inactivity_status,'active') then
      v_action:=case when p_dry_run then 'would_update' else 'updated' end;
      if not p_dry_run then
        update public.clubs c set
          is_active=true,inactivity_status=v_new_status,inactive_ai_controlled=false,
          season_end_transition_pending=(v_new_status='season_end_removal_pending'),
          inactivity_season_end_action=case when v_new_status='season_end_removal_pending' then 'replace_with_ai_pool_team' else null end,
          inactive_at=case when v_new_status='inactive' and c.inactive_at is null then now() when v_new_status='active' then null else c.inactive_at end,
          archived_at=case when v_new_status='season_end_removal_pending' and c.archived_at is null then now() when v_new_status='active' then null else c.archived_at end,
          inactivity_reason=case when v_new_status='at_risk' then 'no_activity_warning_threshold_reached'
                                 when v_new_status='inactive' then 'no_activity_inactive_threshold_reached'
                                 when v_new_status='season_end_removal_pending' then 'no_activity_season_end_removal_threshold_reached' else null end,
          inactivity_days_snapshot=case when v_new_status='active' then 0 else v_days_inactive end,
          inactivity_effective_season=v_current_season,updated_at=now()
        where c.id=r.club_id;

        update public.profiles p set
          inactivity_warning_sent_at=case when v_new_status='at_risk' and p.inactivity_warning_sent_at is null then now() when v_new_status='active' then null else p.inactivity_warning_sent_at end,
          team_marked_inactive_at=case when v_new_status='inactive' and p.team_marked_inactive_at is null then now() when v_new_status='active' then null else p.team_marked_inactive_at end,
          team_archived_at=case when v_new_status='season_end_removal_pending' and p.team_archived_at is null then now() when v_new_status='active' then null else p.team_archived_at end,
          updated_at=now()
        where p.id=r.user_id;

        insert into public.user_team_inactivity_events(user_id,club_id,previous_status,new_status,days_inactive,reason,metadata)
        values(r.user_id,r.club_id,coalesce(r.inactivity_status,'active'),v_new_status,v_days_inactive,'automatic_inactivity_processor_v4_auth_aware',
          jsonb_build_object('last_activity_at',v_last_activity,'warning_days',v_warning_days,'inactive_days',v_inactive_days,'removal_pending_days',v_removal_pending_days,
                             'activity_source','greatest(profile_last_seen,profile_last_login,auth_last_sign_in)','dry_run',p_dry_run));
      end if;
    end if;
    club_id:=r.club_id; club_name:=r.club_name; user_id:=r.user_id; previous_status:=coalesce(r.inactivity_status,'active'); new_status:=v_new_status;
    days_inactive:=v_days_inactive; action_taken:=v_action; return next;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reactivate_my_team_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_club record;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select
    c.id,
    c.name,
    c.inactivity_status
  into v_club
  from public.clubs c
  where c.owner_user_id = v_user_id
    and c.is_ai = false
    and c.club_type = 'main'
    and c.deleted_at is null
  limit 1
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'reason', 'no_team_found'
    );
  end if;

  if v_club.inactivity_status = 'archived' then
    return jsonb_build_object(
      'success', false,
      'reason', 'team_archived_manual_review_required',
      'club_id', v_club.id,
      'club_name', v_club.name
    );
  end if;

  update public.clubs c
  set
    is_active = true,
    inactivity_status = 'active',
    inactive_at = null,
    inactivity_reason = null,
    updated_at = now()
  where c.id = v_club.id;

  update public.profiles p
  set
    last_seen_at = now(),
    updated_at = now()
  where p.id = v_user_id;

  insert into public.user_team_inactivity_events (
    user_id,
    club_id,
    previous_status,
    new_status,
    reason,
    metadata
  )
  values (
    v_user_id,
    v_club.id,
    v_club.inactivity_status,
    'active',
    'manual_user_reactivation',
    jsonb_build_object('source', 'reactivate_my_team_v1')
  );

  return jsonb_build_object(
    'success', true,
    'club_id', v_club.id,
    'club_name', v_club.name,
    'previous_status', v_club.inactivity_status,
    'new_status', 'active'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.queue_team_inactivity_emails_v1()
 RETURNS TABLE(queued_email_id uuid, club_id uuid, club_name text, email_type text, recipient_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  v_email_type text;
  v_subject text;
  v_body_text text;
  v_body_html text;
  v_email_id uuid;

  v_manager_name text;
  v_safe_manager_name text;
  v_safe_club_name text;

  v_home_url text := 'https://propelotonmanager.com';
  v_dashboard_url text := 'https://propelotonmanager.com/dashboard';
  v_brand_icon_url text := 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/5c3417dc-3924-4423-948a-745ae5902ed0.png';
begin
  for r in
    select
      c.id as club_id,
      c.name as club_name,
      c.owner_user_id as user_id,
      c.inactivity_status,
      c.inactivity_days_snapshot,
      c.inactivity_reason,
      p.email,
      p.username
    from public.clubs c
    join public.profiles p on p.id = c.owner_user_id
    where c.club_type = 'main'
      and coalesce(c.is_ai, false) = false
      and c.owner_user_id is not null
      and c.deleted_at is null
      and c.inactivity_status in (
        'at_risk',
        'inactive',
        'season_end_removal_pending'
      )
      and p.email is not null
      and trim(p.email) <> ''
      and p.email not ilike 'deleted_%@deleted.local'
  loop
    v_email_id := null;
    v_manager_name := coalesce(nullif(r.username, ''), 'manager');

    v_safe_manager_name := replace(replace(replace(replace(replace(
      v_manager_name,
      '&', '&amp;'
    ), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');

    v_safe_club_name := replace(replace(replace(replace(replace(
      r.club_name,
      '&', '&amp;'
    ), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');

    if r.inactivity_status = 'at_risk' then
      v_email_type := 'team_inactivity_warning_25_days';
      v_subject := 'Your ProPeloton Manager team is close to becoming inactive';

      v_body_text := format(
        'Hi %s,

Your team "%s" has had no manager activity for 25 days.

Your team is now marked as at risk, but nothing has been removed. Your team remains in the standings, races, results, and calendar.

If there is no activity after 30 days, your team will be marked inactive. If inactivity reaches 90 days, your team will stay visible until the end of the season. If you do not become active again before season-end processing, your team will be removed from the competition at the end of the season.

To keep managing your team, simply log in and open your dashboard:

%s

ProPeloton Manager
%s',
        v_manager_name,
        r.club_name,
        v_dashboard_url,
        v_home_url
      );

    elsif r.inactivity_status = 'inactive' then
      v_email_type := 'team_inactive_30_days';
      v_subject := 'Your ProPeloton Manager team is now inactive';

      v_body_text := format(
        'Hi %s,

Your team "%s" has had no manager activity for 30 days and is now marked as inactive.

Your team has not been removed. It remains visible in standings, race history, results, and calendar. It is not being managed by AI.

You can return and reactivate your team by logging in again.

If inactivity reaches 90 days, your team will stay visible until the end of the season. If you do not become active again before season-end processing, your team will be removed from the competition at the end of the season.

Open your dashboard:

%s

ProPeloton Manager
%s',
        v_manager_name,
        r.club_name,
        v_dashboard_url,
        v_home_url
      );

    elsif r.inactivity_status = 'season_end_removal_pending' then
      v_email_type := 'team_season_end_removal_pending_90_days';
      v_subject := 'Your ProPeloton Manager team is pending season-end removal';

      v_body_text := format(
        'Hi %s,

Your team "%s" has had no manager activity for 90 days.

Your team remains visible until the end of the current season. If you do not become active again before season-end processing, your team will be removed from the competition at the end of the season.

Your historical results and standings records are not deleted.

You can still return before season-end processing if you want to continue managing your team.

Open your dashboard:

%s

ProPeloton Manager
%s',
        v_manager_name,
        r.club_name,
        v_dashboard_url,
        v_home_url
      );
    end if;

    v_body_html := format(
      '<div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:640px">
        <p>Hi %s,</p>

        <p>%s</p>

        <p>%s</p>

        <p>%s</p>

        <p style="margin:24px 0">
          <a href="%s" style="display:inline-block;background:#facc15;color:#111827;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">
            Open dashboard
          </a>
        </p>

        <p style="color:#64748b;font-size:13px;margin-top:28px;margin-bottom:10px">
          <a href="%s" style="color:#64748b;text-decoration:none;font-weight:600">
            ProPeloton Manager
          </a>
        </p>

        <div style="margin-top:0">
          <a href="%s" style="display:inline-block;text-decoration:none">
            <img src="%s" alt="ProPeloton Manager" style="display:block;max-width:160px;height:auto;border:0" />
          </a>
        </div>
      </div>',
      v_safe_manager_name,

      case
        when r.inactivity_status = 'at_risk'
          then format('Your team <strong>%s</strong> has had no manager activity for 25 days.', v_safe_club_name)
        when r.inactivity_status = 'inactive'
          then format('Your team <strong>%s</strong> has had no manager activity for 30 days and is now marked as <strong>inactive</strong>.', v_safe_club_name)
        else
          format('Your team <strong>%s</strong> has had no manager activity for 90 days.', v_safe_club_name)
      end,

      case
        when r.inactivity_status = 'at_risk'
          then 'Your team is now marked as <strong>at risk</strong>, but nothing has been removed. Your team remains in the standings, races, results, and calendar.'
        when r.inactivity_status = 'inactive'
          then 'Your team has not been removed. It remains visible in standings, race history, results, and calendar. It is not being managed by AI.'
        else
          'Your team remains visible until the end of the current season. If you do not become active again before season-end processing, your team will be removed from the competition at the end of the season.'
      end,

      case
        when r.inactivity_status = 'at_risk'
          then 'If there is no activity after 30 days, your team will be marked inactive. If inactivity reaches 90 days, your team will stay visible until the end of the season. If you do not become active again before season-end processing, your team will be removed from the competition at the end of the season.'
        when r.inactivity_status = 'inactive'
          then 'You can return and reactivate your team by logging in again. If inactivity reaches 90 days, your team will stay visible until the end of the season. If you do not become active again before season-end processing, your team will be removed from the competition at the end of the season.'
        else
          'Your historical results and standings records are not deleted. You can still return before season-end processing if you want to continue managing your team.'
      end,

      v_dashboard_url,
      v_home_url,
      v_home_url,
      v_brand_icon_url
    );

    insert into public.game_email_queue (
      user_id,
      club_id,
      email_type,
      recipient_email,
      recipient_name,
      subject,
      body_text,
      body_html,
      metadata
    )
    values (
      r.user_id,
      r.club_id,
      v_email_type,
      r.email,
      r.username,
      v_subject,
      v_body_text,
      v_body_html,
      jsonb_build_object(
        'club_name', r.club_name,
        'inactivity_status', r.inactivity_status,
        'inactivity_days_snapshot', r.inactivity_days_snapshot,
        'inactivity_reason', r.inactivity_reason,
        'dashboard_url', v_dashboard_url,
        'home_url', v_home_url,
        'brand_icon_url', v_brand_icon_url,
        'queued_by', 'queue_team_inactivity_emails_v1'
      )
    )
    on conflict do nothing
    returning id into v_email_id;

    if v_email_id is not null then
      queued_email_id := v_email_id;
      club_id := r.club_id;
      club_name := r.club_name;
      email_type := v_email_type;
      recipient_email := r.email;
      return next;
    end if;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_resolve_latest_stage_simulation_run_v20(p_stage_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run_id uuid;
begin
  if p_stage_id is null then
    raise exception 'p_stage_id is required';
  end if;

  select rsr.id
  into v_run_id
  from public.race_stage_simulation_runs rsr
  where rsr.stage_id = p_stage_id
  order by
    case when rsr.status in ('completed','success','finished') then 0 else 1 end,
    coalesce(rsr.completed_at, rsr.updated_at, rsr.created_at) desc,
    rsr.id::text desc
  limit 1;

  return v_run_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_road_stage_post_finalizer_extensions_v20(p_simulation_run_id uuid, p_team_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true, p_consumer text DEFAULT 'road_stage_finalizer_v20'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_race_id uuid;
  v_run_status text;
  v_result jsonb := '{}'::jsonb;
  v_alive jsonb;
  v_outcomes jsonb;
  v_prepare jsonb;
  v_apply_state jsonb;
  v_damage jsonb;
  v_supplies jsonb;
  v_missing text[] := array[]::text[];
  v_supply_note text := null;
  v_tactical_available boolean := true;
  v_tactical_skip_reason text := null;
  v_error text;
begin
  if p_simulation_run_id is null then
    raise exception 'p_simulation_run_id is required';
  end if;

  select rsr.stage_id, rsr.race_id, rsr.status
  into v_stage_id, v_race_id, v_run_status
  from public.race_stage_simulation_runs rsr
  where rsr.id = p_simulation_run_id;

  if v_stage_id is null then
    raise exception 'No race_stage_simulation_runs row found for simulation_run_id %', p_simulation_run_id;
  end if;

  -- v9.3 visible tactical event conversion. Older simulations may have no source report events.
  if to_regprocedure('public.race_engine_generate_alive_tactical_events_v1(uuid,uuid,boolean)') is null then
    v_missing := array_append(v_missing, 'race_engine_generate_alive_tactical_events_v1(uuid,uuid,boolean)');
    v_alive := jsonb_build_object('skipped', true, 'reason', 'missing function');
  else
    begin
      v_alive := public.race_engine_generate_alive_tactical_events_v1(p_simulation_run_id, p_team_id, p_dry_run);
    exception when others then
      v_error := sqlerrm;
      v_tactical_available := false;
      v_tactical_skip_reason := 'v9.3 alive tactical event generation failed or no tactical source rows exist for this older simulation: ' || v_error;
      v_alive := jsonb_build_object(
        'status', 'skipped_no_tactical_source',
        'skipped', true,
        'error', v_error,
        'safe_note', 'Tactical postprocessing skipped for this stage. Supply consumption can still run.'
      );
    end;
  end if;

  -- v10 command outcomes. If there are no v9/report tactical events, do not abort the whole postprocessor.
  if v_tactical_available is false then
    v_outcomes := jsonb_build_object(
      'status', 'skipped_no_tactical_source',
      'skipped', true,
      'reason', v_tactical_skip_reason
    );
  elsif to_regprocedure('public.race_engine_generate_stage_command_outcomes_v1(uuid,uuid,boolean)') is null then
    v_missing := array_append(v_missing, 'race_engine_generate_stage_command_outcomes_v1(uuid,uuid,boolean)');
    v_outcomes := jsonb_build_object('skipped', true, 'reason', 'missing function');
  else
    begin
      v_outcomes := public.race_engine_generate_stage_command_outcomes_v1(p_simulation_run_id, p_team_id, p_dry_run);
    exception when others then
      v_error := sqlerrm;
      if v_error ilike '%No v9.3 interaction events or report events found%' then
        v_tactical_available := false;
        v_tactical_skip_reason := 'No v9.3 interaction/report tactical source rows exist for this simulation. This is expected for some older completed stages.';
        v_outcomes := jsonb_build_object(
          'status', 'skipped_no_tactical_source',
          'skipped', true,
          'error', v_error,
          'safe_note', 'Tactical deltas skipped; supplies can still be consumed idempotently.'
        );
      else
        raise;
      end if;
    end;
  end if;

  -- v12/v15/v17 require tactical outcomes. Skip them cleanly when no tactical source exists.
  if v_tactical_available is false then
    v_prepare := jsonb_build_object('status', 'skipped_no_tactical_source', 'skipped', true, 'reason', v_tactical_skip_reason);
    v_apply_state := jsonb_build_object('status', 'skipped_no_tactical_source', 'skipped', true, 'reason', v_tactical_skip_reason);
    v_damage := jsonb_build_object('status', 'skipped_no_tactical_source', 'skipped', true, 'reason', v_tactical_skip_reason);
  else
    if to_regprocedure('public.race_engine_prepare_stage_command_delta_applications_v1(uuid,uuid,boolean)') is null then
      v_missing := array_append(v_missing, 'race_engine_prepare_stage_command_delta_applications_v1(uuid,uuid,boolean)');
      v_prepare := jsonb_build_object('skipped', true, 'reason', 'missing function');
    else
      v_prepare := public.race_engine_prepare_stage_command_delta_applications_v1(v_stage_id, p_team_id, p_dry_run);
    end if;

    if to_regprocedure('public.race_engine_apply_stage_command_deltas_to_official_state_v1(uuid,uuid,boolean,text,boolean)') is null then
      v_missing := array_append(v_missing, 'race_engine_apply_stage_command_deltas_to_official_state_v1(uuid,uuid,boolean,text,boolean)');
      v_apply_state := jsonb_build_object('skipped', true, 'reason', 'missing function');
    else
      v_apply_state := public.race_engine_apply_stage_command_deltas_to_official_state_v1(
        v_stage_id,
        p_team_id,
        p_dry_run,
        p_consumer,
        true
      );
    end if;

    if to_regprocedure('public.race_engine_apply_incident_equipment_damage_v1(uuid,uuid,boolean,text)') is null then
      v_missing := array_append(v_missing, 'race_engine_apply_incident_equipment_damage_v1(uuid,uuid,boolean,text)');
      v_damage := jsonb_build_object('skipped', true, 'reason', 'missing function');
    else
      v_damage := public.race_engine_apply_incident_equipment_damage_v1(
        v_stage_id,
        p_team_id,
        p_dry_run,
        p_consumer
      );
    end if;
  end if;

  -- Supplies are independent from tactical events and should still run for older completed stages.
  if p_team_id is null then
    v_supply_note := 'Skipped supply consumption because p_team_id is null. Pass the preparation/main club id to consume race supplies.';
    v_supplies := jsonb_build_object('skipped', true, 'note', v_supply_note);
  elsif to_regprocedure('public.race_engine_apply_stage_supply_consumption_v1(uuid,uuid,boolean,text)') is null then
    v_missing := array_append(v_missing, 'race_engine_apply_stage_supply_consumption_v1(uuid,uuid,boolean,text)');
    v_supplies := jsonb_build_object('skipped', true, 'reason', 'missing function');
  else
    begin
      v_supplies := public.race_engine_apply_stage_supply_consumption_v1(
        v_stage_id,
        p_team_id,
        p_dry_run,
        p_consumer
      );
    exception when others then
      v_error := sqlerrm;
      v_supplies := jsonb_build_object(
        'status', 'supply_step_error',
        'skipped', true,
        'error', v_error,
        'safe_note', 'Supply step failed but tactical skip/error should not abort the wrapper result.'
      );
    end;
  end if;

  v_result := jsonb_build_object(
    'status', case
      when array_length(v_missing, 1) is not null then 'missing_functions'
      when v_tactical_available is false then 'ok_supply_only_or_no_tactical_source'
      else 'ok'
    end,
    'version', 'v20_1_no_tactical_safe_post_stage_orchestrator',
    'dry_run', p_dry_run,
    'consumer', p_consumer,
    'simulation_run_id', p_simulation_run_id,
    'run_status', v_run_status,
    'race_id', v_race_id,
    'stage_id', v_stage_id,
    'team_id', p_team_id,
    'tactical_available', v_tactical_available,
    'tactical_skip_reason', v_tactical_skip_reason,
    'missing_functions', coalesce(to_jsonb(v_missing), '[]'::jsonb),
    'safe_rule', 'Run after normal stage simulation succeeds. If old stages have no tactical source events, skip tactical deltas but still apply supplies idempotently.',
    'steps', jsonb_build_object(
      'alive_tactical_events_v9_3', coalesce(v_alive, jsonb_build_object('skipped', true)),
      'command_outcomes_v10_4', coalesce(v_outcomes, jsonb_build_object('skipped', true)),
      'delta_queue_v12', coalesce(v_prepare, jsonb_build_object('skipped', true)),
      'official_rider_state_v15_1', coalesce(v_apply_state, jsonb_build_object('skipped', true)),
      'incident_equipment_damage_v17_3', coalesce(v_damage, jsonb_build_object('skipped', true)),
      'stage_supply_consumption_v19', coalesce(v_supplies, jsonb_build_object('skipped', true, 'note', v_supply_note))
    ),
    'next_frontend_backend_step', 'Update the stage simulation Edge Function/cron path to call the scheduler wrapper after testing dry-run and one controlled apply cycle.'
  );

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_run_stage_simulation_with_postprocessors_v20(p_stage_id uuid, p_team_id uuid, p_post_dry_run boolean DEFAULT false, p_consumer text DEFAULT 'road_stage_finalizer_v20_wrapper'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_simulation_result jsonb;
  v_simulation_run_id uuid;
  v_post_result jsonb;
begin
  if p_stage_id is null then raise exception 'p_stage_id is required'; end if;
  if p_team_id is null then raise exception 'p_team_id is required so the supply inventory owner is explicit'; end if;

  if to_regprocedure('public.run_race_stage_simulation_v1(uuid)') is null then
    raise exception 'Missing public.run_race_stage_simulation_v1(uuid)';
  end if;

  v_simulation_result := public.run_race_stage_simulation_v1(p_stage_id);

  v_simulation_run_id := public.race_engine_try_uuid_v1(coalesce(
    v_simulation_result->>'simulation_run_id',
    v_simulation_result->>'run_id',
    v_simulation_result->>'race_stage_simulation_run_id'
  ));

  if v_simulation_run_id is null then
    v_simulation_run_id := public.race_engine_resolve_latest_stage_simulation_run_v20(p_stage_id);
  end if;

  if v_simulation_run_id is null then
    raise exception 'Could not resolve simulation run id for stage % after run_race_stage_simulation_v1', p_stage_id;
  end if;

  v_post_result := public.race_engine_apply_road_stage_post_finalizer_extensions_v20(
    v_simulation_run_id,
    p_team_id,
    p_post_dry_run,
    p_consumer
  );

  return jsonb_build_object(
    'status', 'ok',
    'version', 'v20_run_stage_simulation_with_postprocessors',
    'stage_id', p_stage_id,
    'team_id', p_team_id,
    'simulation_run_id', v_simulation_run_id,
    'simulation_result', v_simulation_result,
    'postprocessor_result', v_post_result
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_post_stage_orchestrator_verify_v20(p_stage_id uuid, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_alive_count integer := 0;
  v_outcome_count integer := 0;
  v_delta_prepared integer := 0;
  v_delta_consumed integer := 0;
  v_v15_incidents integer := 0;
  v_v17_damage_logs integer := 0;
  v_supply_usage_events integer := 0;
  v_supply_stock jsonb := '[]'::jsonb;
  v_latest_sim_run uuid;
begin
  v_latest_sim_run := public.race_engine_resolve_latest_stage_simulation_run_v20(p_stage_id);

  if to_regclass('public.race_engine_stage_interaction_events') is not null then
    select count(*) into v_alive_count
    from public.race_engine_stage_interaction_events e
    where e.stage_id = p_stage_id
      and (p_team_id is null or e.club_id = p_team_id or e.club_id in (select club_id from public.race_engine_club_scope_v1(p_team_id)));
  end if;

  if to_regclass('public.race_engine_stage_command_outcomes') is not null then
    select count(*) into v_outcome_count
    from public.race_engine_stage_command_outcomes o
    where o.stage_id = p_stage_id
      and (p_team_id is null or o.club_id = p_team_id or o.club_id in (select club_id from public.race_engine_club_scope_v1(p_team_id)));
  end if;

  if to_regclass('public.race_engine_stage_command_outcome_delta_applications') is not null then
    select
      count(*) filter (where q.application_status = 'prepared'),
      count(*) filter (where q.application_status = 'consumed_by_finalizer')
    into v_delta_prepared, v_delta_consumed
    from public.race_engine_stage_command_outcome_delta_applications q
    where q.stage_id = p_stage_id
      and (p_team_id is null or q.club_id = p_team_id or q.metadata->>'prepared_for_team_id' = p_team_id::text or q.club_id in (select club_id from public.race_engine_club_scope_v1(p_team_id)));
  end if;

  if to_regclass('public.race_stage_incidents') is not null then
    select count(*) into v_v15_incidents
    from public.race_stage_incidents i
    where i.stage_id = p_stage_id
      and i.metadata->>'source_version' = 'v15_1_apply_delta_to_official_rider_state'
      and (p_team_id is null or i.team_id = p_team_id or i.team_id in (select club_id from public.race_engine_club_scope_v1(p_team_id)));
  end if;

  if to_regclass('public.race_engine_stage_incident_equipment_damage_applications') is not null then
    select count(*) into v_v17_damage_logs
    from public.race_engine_stage_incident_equipment_damage_applications d
    where d.stage_id = p_stage_id
      and (p_team_id is null or d.club_id = p_team_id or d.club_id in (select club_id from public.race_engine_club_scope_v1(p_team_id)));
  end if;

  if to_regclass('public.race_stage_supply_usage_events') is not null then
    select count(*) into v_supply_usage_events
    from public.race_stage_supply_usage_events e
    where e.usage_json->>'stage_id' = p_stage_id::text
      and (p_team_id is null or e.club_id = p_team_id);
  end if;

  if p_team_id is not null and to_regclass('public.club_race_supplies') is not null then
    select coalesce(jsonb_agg(to_jsonb(s) order by s.supply_key), '[]'::jsonb)
    into v_supply_stock
    from public.club_race_supplies s
    where s.club_id = p_team_id;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'version', 'v20_post_stage_orchestrator_verify',
    'stage_id', p_stage_id,
    'team_id', p_team_id,
    'latest_simulation_run_id', v_latest_sim_run,
    'counts', jsonb_build_object(
      'alive_interaction_events', v_alive_count,
      'command_outcomes', v_outcome_count,
      'delta_prepared_rows', v_delta_prepared,
      'delta_consumed_rows', v_delta_consumed,
      'official_incidents_from_v15', v_v15_incidents,
      'incident_equipment_damage_logs_v17_3', v_v17_damage_logs,
      'stage_supply_usage_events_v19', v_supply_usage_events
    ),
    'club_supply_stock', v_supply_stock,
    'safe_status', case
      when v_delta_prepared = 0 and v_delta_consumed > 0 and v_supply_usage_events > 0 then 'post_stage_extensions_applied_for_team'
      else 'check_counts_before_assuming_complete'
    end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ppm_create_user_notification_direct_v1(p_user_id uuid, p_type_code text, p_title text, p_message text, p_action_url text DEFAULT NULL::text, p_payload_json jsonb DEFAULT '{}'::jsonb, p_event_key text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_code text;
  v_type_id bigint;
  v_source text;
  v_notification_id bigint;
  v_payload jsonb;
begin
  if p_user_id is null then raise exception 'ppm_create_user_notification_direct_v1: p_user_id is required'; end if;
  v_code := public.notification_canonical_type_code_v2(p_type_code);
  if v_code is null then return null; end if;

  select nt.id,coalesce(nullif(trim(nt.source),''),'game') into v_type_id,v_source
  from public.notification_types nt where nt.code=v_code and nt.is_active=true limit 1;
  if v_type_id is null then raise exception 'Notification type % not found or inactive',v_code; end if;

  v_payload := coalesce(p_payload_json,'{}'::jsonb) || jsonb_build_object('type_code',v_code);
  if nullif(trim(coalesce(p_event_key,'')),'') is not null then
    v_payload := v_payload || jsonb_build_object('event_key',p_event_key);
    select n.id into v_notification_id
    from public.notifications n
    join public.user_notifications un on un.notification_id=n.id
    where un.user_id=p_user_id and un.deleted_at is null
      and n.payload_json->>'event_key'=p_event_key
    order by n.id desc limit 1;
  end if;

  if v_notification_id is null and v_code='FINANCE_CLUB_LIQUIDATED' and nullif(v_payload->>'club_id','') is not null then
    select n.id into v_notification_id
    from public.notifications n
    join public.user_notifications un on un.notification_id=n.id
    join public.notification_types nt on nt.id=n.type_id
    where un.user_id=p_user_id and un.deleted_at is null
      and nt.code='FINANCE_CLUB_LIQUIDATED'
      and n.payload_json->>'club_id'=v_payload->>'club_id'
    order by n.id desc limit 1;
  end if;

  if v_notification_id is null then
    insert into public.notifications(type_id,title,message,source,action_url,payload_json)
    values(v_type_id,p_title,p_message,v_source,p_action_url,v_payload)
    returning id into v_notification_id;
  end if;

  insert into public.user_notifications(user_id,notification_id,status)
  select p_user_id,v_notification_id,'unread'
  where not exists(
    select 1 from public.user_notifications un
    where un.user_id=p_user_id and un.notification_id=v_notification_id and un.deleted_at is null
  );
  return v_notification_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_due_notification_safety_net_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current_game_date date;
  v_current_year int;
  v_season_number int;
  v_dev_window_start date;
  v_dev_window_end date;

  v_developing_window_count int := 0;
  v_stage_plan_locked_count int := 0;
  v_missing_stage_plan_count int := 0;

  v_row record;
  v_event_key text;
  v_action_url text;
  v_payload jsonb;
begin
  v_current_game_date := public.get_current_game_date_date();
  v_current_year := extract(year from v_current_game_date)::int;
  v_season_number := greatest(v_current_year - 1999, 1);

  -- Current rule used for developing team window:
  -- Season window: Oct 1 to Oct 14.
  v_dev_window_start := make_date(v_current_year, 10, 1);
  v_dev_window_end := make_date(v_current_year, 10, 14);


  -- ==========================================================
  -- A) DEVELOPING_TEAM_WINDOW_OPEN
  -- ==========================================================

  if v_current_game_date between v_dev_window_start and v_dev_window_end then
    for v_row in
      select
        main.id as main_club_id,
        main.name as main_club_name,
        main.owner_user_id,
        dev.id as developing_club_id,
        dev.name as developing_club_name
      from public.clubs dev
      join public.clubs main
        on main.id = dev.parent_club_id
      where dev.club_type = 'developing'
        and dev.parent_club_id is not null
        and main.owner_user_id is not null
    loop
      v_event_key :=
        'developing_team_window_open:'
        || v_row.main_club_id
        || ':season:'
        || v_season_number::text;

      v_action_url := '/dashboard/squad';

      v_payload := jsonb_build_object(
        'type_code', 'DEVELOPING_TEAM_WINDOW_OPEN',
        'club_id', v_row.main_club_id,
        'club_name', v_row.main_club_name,
        'developing_club_id', v_row.developing_club_id,
        'developing_club_name', v_row.developing_club_name,
        'season_number', v_season_number,
        'window_start_game_date', v_dev_window_start,
        'window_opens_on_game_date', v_dev_window_start,
        'window_end_game_date', v_dev_window_end,
        'window_closes_on_game_date', v_dev_window_end,
        'action_required', 'review_eligible_riders',
        'team_squad_path', '/dashboard/squad',
        'squad_path', '/dashboard/squad'
      );

      perform public.ppm_create_user_notification_direct_v1(
        v_row.owner_user_id,
        'DEVELOPING_TEAM_WINDOW_OPEN',
        'Developing team window open',
        'The developing team movement window is now open. Review riders who may need to move between your main and developing squads.',
        v_action_url,
        v_payload,
        v_event_key
      );

      v_developing_window_count := v_developing_window_count + 1;
    end loop;
  end if;


  -- ==========================================================
  -- B) STAGE_PLAN_LOCKED
  --    Rule: stage plan locks 3 hours before stage start.
  --    Date-level safety net creates the locked notification
  --    on the stage date only.
  -- ==========================================================

  for v_row in
    with stage_base as (
      select
        rp.id as race_preparation_id,
        rp.race_id,
        rp.club_id,
        c.name as club_name,
        c.owner_user_id,
        r.name as race_name,
        r.category as race_class,
        r.race_type,
        r.start_date::date as race_start_date,
        r.end_date::date as race_end_date,
        coalesce(r.stage_count, 1) as stage_count,
        rs.id as stage_id,
        rs.stage_number,
        rs.name as stage_name,
        rs.stage_date::date as stage_date,
        rs.start_city,
        rs.finish_city,
        coalesce(
          nullif(to_jsonb(rs)->>'planned_start_hour_number', '')::int,
          nullif(to_jsonb(rs)->>'stage_start_hour', '')::int,
          nullif(to_jsonb(rs)->>'start_hour', '')::int,
          nullif(to_jsonb(r)->>'planned_start_hour_number', '')::int,
          9
        ) as stage_start_hour,
        coalesce(
          nullif(to_jsonb(rs)->>'planned_start_minute', '')::int,
          nullif(to_jsonb(rs)->>'stage_start_minute', '')::int,
          nullif(to_jsonb(rs)->>'start_minute', '')::int,
          nullif(to_jsonb(r)->>'planned_start_minute', '')::int,
          30
        ) as stage_start_minute,
        count(rsp.*) as stage_plan_rows
      from public.race_preparations rp
      join public.clubs c
        on c.id = rp.club_id
      join public.races r
        on r.id = rp.race_id
      join public.race_stages rs
        on rs.race_id = r.id
      left join public.race_stage_plans rsp
        on rsp.race_preparation_id = rp.id
       and rsp.stage_id = rs.id
      where c.owner_user_id is not null
      group by
        rp.id,
        rp.race_id,
        rp.club_id,
        c.name,
        c.owner_user_id,
        r.name,
        r.category,
        r.race_type,
        r.start_date,
        r.end_date,
        r.stage_count,
        rs.id,
        rs.stage_number,
        rs.name,
        rs.stage_date,
        rs.start_city,
        rs.finish_city,
        r,
        rs
    ),
    calc as (
      select
        sb.*,
        (
          sb.stage_date::timestamp
          + make_interval(hours => sb.stage_start_hour, mins => sb.stage_start_minute)
        ) as stage_start_at,
        (
          sb.stage_date::timestamp
          + make_interval(hours => sb.stage_start_hour, mins => sb.stage_start_minute)
          - interval '3 hours'
        ) as stage_plan_lock_at,
        (
          sb.stage_date::timestamp
          + make_interval(hours => sb.stage_start_hour, mins => sb.stage_start_minute)
          - interval '3 hours'
        )::date as stage_plan_lock_on
      from stage_base sb
    )
    select *
    from calc
    where stage_date = v_current_game_date
      and stage_plan_lock_on <= v_current_game_date
      and stage_plan_rows > 0
      and not exists (
        select 1
        from public.notifications n
        where n.payload_json->>'event_key'
          = 'stage_plan_locked:' || calc.club_id || ':' || calc.race_id || ':' || calc.stage_id
      )
  loop
    v_event_key :=
      'stage_plan_locked:'
      || v_row.club_id
      || ':'
      || v_row.race_id
      || ':'
      || v_row.stage_id;

    v_action_url :=
      '/dashboard/race-preparation?tab=stagePlans&raceId='
      || v_row.race_id
      || '&stageId='
      || v_row.stage_id;

    v_payload := jsonb_build_object(
      'type_code', 'STAGE_PLAN_LOCKED',
      'status', 'locked',
      'club_id', v_row.club_id,
      'club_name', v_row.club_name,
      'race_id', v_row.race_id,
      'race_name', v_row.race_name,
      'race_class', v_row.race_class,
      'category', v_row.race_class,
      'race_type', v_row.race_type,
      'race_start_date', v_row.race_start_date,
      'race_end_date', v_row.race_end_date,
      'stage_count', v_row.stage_count,
      'stage_id', v_row.stage_id,
      'stage_number', v_row.stage_number,
      'stage_name', v_row.stage_name,
      'stage_date', v_row.stage_date,
      'start_city', v_row.start_city,
      'finish_city', v_row.finish_city,
      'stage_start_at', to_char(v_row.stage_start_at, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'stage_start_datetime', to_char(v_row.stage_start_at, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'stage_start_time_label', to_char(v_row.stage_start_at, 'HH24:MI'),
      'stage_plan_lock_at', to_char(v_row.stage_plan_lock_at, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'stage_plan_locked_at', to_char(v_row.stage_plan_lock_at, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'locked_at', to_char(v_row.stage_plan_lock_at, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'stage_plan_lock_on', v_row.stage_plan_lock_on,
      'stage_plans_lock_on', v_row.stage_plan_lock_on,
      'stage_plan_lock_time_label', to_char(v_row.stage_plan_lock_at, 'HH24:MI'),
      'lock_time_label', to_char(v_row.stage_plan_lock_at, 'HH24:MI'),
      'stage_plan_status', 'locked',
      'stage_plans_status', 'locked',
      'target_tab', 'stagePlans',
      'stage_plan_path', v_action_url,
      'stage_plans_path', v_action_url,
      'race_plan_path', '/dashboard/race-preparation?tab=racePlan&raceId=' || v_row.race_id,
      'race_preparation_path', '/dashboard/race-preparation?tab=racePlan&raceId=' || v_row.race_id,
      'race_page_path', '/dashboard/races/' || v_row.race_id,
      'race_detail_path', '/dashboard/races/' || v_row.race_id,
      'race_profile_path', '/dashboard/races/' || v_row.race_id,
      'calendar_path', '/dashboard/calendar',
      'team_calendar_path', '/dashboard/calendar',
      'image_url', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Stage%20Plan%20Locked.png'
    );

    perform public.ppm_create_user_notification_direct_v1(
      v_row.owner_user_id,
      'STAGE_PLAN_LOCKED',
      'Stage plan locked: ' || v_row.race_name || ' Stage ' || v_row.stage_number,
      'Stage ' || v_row.stage_number || ' plan for ' || v_row.race_name || ' is now locked and can no longer be changed.',
      v_action_url,
      v_payload,
      v_event_key
    );

    v_stage_plan_locked_count := v_stage_plan_locked_count + 1;
  end loop;


  -- ==========================================================
  -- C) STAGE_PLAN_MISSING_AT_LOCK
  --    Date-level safety net checks today and yesterday.
  --    No fine is applied here yet.
  -- ==========================================================

  for v_row in
    with stage_base as (
      select
        rp.id as race_preparation_id,
        rp.race_id,
        rp.club_id,
        c.name as club_name,
        c.owner_user_id,
        r.name as race_name,
        r.category as race_class,
        r.race_type,
        rs.id as stage_id,
        rs.stage_number,
        rs.name as stage_name,
        rs.stage_date::date as stage_date,
        rs.start_city,
        rs.finish_city,
        count(rsp.*) as stage_plan_rows
      from public.race_preparations rp
      join public.clubs c
        on c.id = rp.club_id
      join public.races r
        on r.id = rp.race_id
      join public.race_stages rs
        on rs.race_id = r.id
      left join public.race_stage_plans rsp
        on rsp.race_preparation_id = rp.id
       and rsp.stage_id = rs.id
      where c.owner_user_id is not null
      group by
        rp.id,
        rp.race_id,
        rp.club_id,
        c.name,
        c.owner_user_id,
        r.name,
        r.category,
        r.race_type,
        rs.id,
        rs.stage_number,
        rs.name,
        rs.stage_date,
        rs.start_city,
        rs.finish_city
    )
    select *
    from stage_base sb
    where sb.stage_date between (v_current_game_date - 1) and v_current_game_date
      and sb.stage_plan_rows = 0
      and not exists (
        select 1
        from public.notifications n
        where n.payload_json->>'event_key'
          = 'stage_plan_missing_at_lock:' || sb.club_id || ':' || sb.race_id || ':' || sb.stage_id
      )
  loop
    v_event_key :=
      'stage_plan_missing_at_lock:'
      || v_row.club_id
      || ':'
      || v_row.race_id
      || ':'
      || v_row.stage_id;

    v_action_url :=
      '/dashboard/race-preparation?tab=stagePlans&raceId='
      || v_row.race_id
      || '&stageId='
      || v_row.stage_id;

    v_payload := jsonb_build_object(
      'type_code', 'STAGE_PLAN_MISSING_AT_LOCK',
      'status', 'missing_stage_plan',
      'club_id', v_row.club_id,
      'club_name', v_row.club_name,
      'race_id', v_row.race_id,
      'race_name', v_row.race_name,
      'race_class', v_row.race_class,
      'category', v_row.race_class,
      'race_type', v_row.race_type,
      'stage_id', v_row.stage_id,
      'stage_number', v_row.stage_number,
      'stage_name', v_row.stage_name,
      'stage_date', v_row.stage_date,
      'start_city', v_row.start_city,
      'finish_city', v_row.finish_city,
      'missing_reason', 'no_stage_plan_found_after_lock',
      'fine_applied', false,
      'fine_status', 'not_applied_yet',
      'target_tab', 'stagePlans',
      'stage_plan_path', v_action_url,
      'stage_plans_path', v_action_url,
      'race_plan_path', '/dashboard/race-preparation?tab=racePlan&raceId=' || v_row.race_id,
      'race_preparation_path', '/dashboard/race-preparation?tab=racePlan&raceId=' || v_row.race_id,
      'race_page_path', '/dashboard/races/' || v_row.race_id,
      'race_detail_path', '/dashboard/races/' || v_row.race_id,
      'race_profile_path', '/dashboard/races/' || v_row.race_id,
      'calendar_path', '/dashboard/calendar',
      'team_calendar_path', '/dashboard/calendar'
    );

    perform public.ppm_create_user_notification_direct_v1(
      v_row.owner_user_id,
      'STAGE_PLAN_MISSING_AT_LOCK',
      'Stage plan missing: ' || v_row.race_name || ' Stage ' || v_row.stage_number,
      'No stage plan was found for Stage ' || v_row.stage_number || ' of ' || v_row.race_name || ' after the lock time.',
      v_action_url,
      v_payload,
      v_event_key
    );

    v_missing_stage_plan_count := v_missing_stage_plan_count + 1;
  end loop;


  return jsonb_build_object(
    'status', 'completed',
    'current_game_date', v_current_game_date,
    'developing_team_window_notifications_checked_or_created', v_developing_window_count,
    'stage_plan_locked_notifications_created', v_stage_plan_locked_count,
    'missing_stage_plan_notifications_created', v_missing_stage_plan_count,
    'fine_note', 'No fine applied by this patch. Fine logic should be connected later through the finance ledger model.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_due_game_notifications_scheduler_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game_result jsonb:=null; v_safety_result jsonb:=null; v_supplies_result jsonb:=null;
  v_jersey_result jsonb:=null; v_critical_eligibility_result jsonb:=null; v_penalty_recovery_result jsonb:=null;
  v_morale_result jsonb:=null; v_contract_result jsonb:=null; v_season_start_result jsonb:=null;
  v_game_error text:=null; v_safety_error text:=null; v_supplies_error text:=null; v_jersey_error text:=null;
  v_critical_eligibility_error text:=null; v_penalty_recovery_error text:=null;
  v_morale_error text:=null; v_contract_error text:=null; v_season_start_error text:=null;
begin
  begin v_season_start_result:=public.send_season_start_race_deadline_notice_if_due_v1(); exception when others then v_season_start_error:=sqlerrm; end;
  begin
    if to_regprocedure('public.process_due_game_notifications_v1()') is not null then execute 'select to_jsonb(public.process_due_game_notifications_v1())' into v_game_result;
    else v_game_error:='process_due_game_notifications_v1() not found'; end if;
  exception when others then v_game_error:=sqlerrm; end;
  begin
    if to_regprocedure('public.process_due_notification_safety_net_v1()') is not null then v_safety_result:=public.process_due_notification_safety_net_v1();
    else v_safety_error:='process_due_notification_safety_net_v1() not found'; end if;
  exception when others then v_safety_error:=sqlerrm; end;
  begin
    if to_regprocedure('public.process_due_race_supplies_low_notifications_v1()') is not null then v_supplies_result:=public.process_due_race_supplies_low_notifications_v1();
    else v_supplies_error:='process_due_race_supplies_low_notifications_v1() not found'; end if;
  exception when others then v_supplies_error:=sqlerrm; end;
  begin v_jersey_result:=public.process_due_mandatory_race_jersey_notifications_v1(); exception when others then v_jersey_error:=sqlerrm; end;
  begin v_critical_eligibility_result:=public.process_critical_race_eligibility_alerts_v1(); exception when others then v_critical_eligibility_error:=sqlerrm; end;
  begin v_penalty_recovery_result:=public.process_unapplied_prestart_disqualification_penalties_v1(); exception when others then v_penalty_recovery_error:=sqlerrm; end;
  begin
    if to_regprocedure('public.process_rider_daily_selection_morale_v1(date)') is not null then v_morale_result:=public.process_rider_daily_selection_morale_v1();
    else v_morale_error:='process_rider_daily_selection_morale_v1(date) not found'; end if;
  exception when others then v_morale_error:=sqlerrm; end;
  begin
    if to_regprocedure('public.process_rider_contract_expiry_notifications_v1(date)') is not null then v_contract_result:=public.process_rider_contract_expiry_notifications_v1();
    else v_contract_error:='process_rider_contract_expiry_notifications_v1(date) not found'; end if;
  exception when others then v_contract_error:=sqlerrm; end;
  return jsonb_build_object(
    'status',case when v_season_start_error is null and v_game_error is null and v_safety_error is null and v_supplies_error is null and v_jersey_error is null and v_critical_eligibility_error is null and v_penalty_recovery_error is null and v_morale_error is null and v_contract_error is null then 'completed' else 'completed_with_errors' end,
    'season_start_race_deadline_result',v_season_start_result,'season_start_race_deadline_error',v_season_start_error,
    'game_notifications_result',v_game_result,'game_notifications_error',v_game_error,
    'safety_net_result',v_safety_result,'safety_net_error',v_safety_error,
    'race_supplies_low_result',v_supplies_result,'race_supplies_low_error',v_supplies_error,
    'mandatory_race_jersey_result',v_jersey_result,'mandatory_race_jersey_error',v_jersey_error,
    'critical_race_eligibility_result',v_critical_eligibility_result,'critical_race_eligibility_error',v_critical_eligibility_error,
    'prestart_penalty_recovery_result',v_penalty_recovery_result,'prestart_penalty_recovery_error',v_penalty_recovery_error,
    'rider_morale_result',v_morale_result,'rider_morale_error',v_morale_error,
    'rider_contract_expiry_result',v_contract_result,'rider_contract_expiry_error',v_contract_error,'processed_at',now());
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_stage_postprocessor_candidates_v21(p_team_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(stage_id uuid, race_id uuid, race_stage_plan_id uuid, race_preparation_id uuid, main_club_id uuid, participating_club_id uuid, stage_number integer, stage_date date, simulation_run_id uuid, simulation_status text, completed_at timestamp with time zone, delta_prepared_rows integer, delta_consumed_rows integer, stage_supply_usage_events integer, incident_damage_logs integer, safe_recommendation text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  with stage_plans as (
    select
      rsp.stage_id,
      rsp.race_id,
      rsp.id as race_stage_plan_id,
      rsp.race_preparation_id,
      rp.club_id as main_club_id,
      coalesce(rp.participating_club_id, rp.club_id) as participating_club_id,
      rsp.stage_number,
      rsp.stage_date,
      rsp.updated_at
    from public.race_stage_plans rsp
    join public.race_preparations rp on rp.id = rsp.race_preparation_id
    where rsp.stage_id is not null
      and rsp.race_id is not null
      and (
        p_team_id is null
        or rp.club_id = p_team_id
        or coalesce(rp.participating_club_id, rp.club_id) = p_team_id
        or (
          to_regprocedure('public.race_engine_club_scope_v1(uuid)') is not null
          and exists (
            select 1
            from public.race_engine_club_scope_v1(p_team_id) s
            where s.club_id in (rp.club_id, coalesce(rp.participating_club_id, rp.club_id))
          )
        )
      )
  ), latest_runs as (
    select
      sp.*,
      lr.id as simulation_run_id,
      lr.status as simulation_status,
      lr.completed_at
    from stage_plans sp
    left join lateral (
      select rsr.*
      from public.race_stage_simulation_runs rsr
      where rsr.stage_id = sp.stage_id
      order by
        case when rsr.status in ('completed','success','finished') then 0 else 1 end,
        coalesce(rsr.completed_at, rsr.updated_at, rsr.created_at) desc,
        rsr.id::text desc
      limit 1
    ) lr on true
  ), counted as (
    select
      lr.*,
      coalesce(d.delta_prepared_rows, 0) as delta_prepared_rows,
      coalesce(d.delta_consumed_rows, 0) as delta_consumed_rows,
      coalesce(su.stage_supply_usage_events, 0) as stage_supply_usage_events,
      coalesce(idmg.incident_damage_logs, 0) as incident_damage_logs,
      coalesce(sk.no_effect_skip_rows, 0) as no_effect_skip_rows
    from latest_runs lr
    left join lateral (
      select
        count(*) filter (where q.application_status = 'prepared')::integer as delta_prepared_rows,
        count(*) filter (where q.application_status = 'consumed_by_finalizer')::integer as delta_consumed_rows
      from public.race_engine_stage_command_outcome_delta_applications q
      where q.stage_id = lr.stage_id
        and (
          q.club_id = lr.main_club_id
          or q.club_id = lr.participating_club_id
          or q.metadata->>'prepared_for_team_id' = lr.main_club_id::text
        )
    ) d on to_regclass('public.race_engine_stage_command_outcome_delta_applications') is not null
    left join lateral (
      select count(*)::integer as stage_supply_usage_events
      from public.race_stage_supply_usage_events e
      where e.club_id = lr.main_club_id
        and e.usage_json->>'stage_id' = lr.stage_id::text
    ) su on to_regclass('public.race_stage_supply_usage_events') is not null
    left join lateral (
      select count(*)::integer as incident_damage_logs
      from public.race_engine_stage_incident_equipment_damage_applications d2
      where d2.stage_id = lr.stage_id
        and d2.club_id in (lr.main_club_id, lr.participating_club_id)
    ) idmg on to_regclass('public.race_engine_stage_incident_equipment_damage_applications') is not null
    left join lateral (
      select count(*)::integer as no_effect_skip_rows
      from public.race_engine_stage_postprocessor_skip_logs sl
      where sl.stage_id = lr.stage_id
        and sl.main_club_id = lr.main_club_id
        and sl.race_stage_plan_id = lr.race_stage_plan_id
        and sl.simulation_run_id = lr.simulation_run_id
        and sl.skip_reason = 'skipped_no_postprocessor_effect'
    ) sk on true
  )
  select
    c.stage_id,
    c.race_id,
    c.race_stage_plan_id,
    c.race_preparation_id,
    c.main_club_id,
    c.participating_club_id,
    c.stage_number,
    c.stage_date,
    c.simulation_run_id,
    c.simulation_status,
    c.completed_at,
    c.delta_prepared_rows,
    c.delta_consumed_rows,
    c.stage_supply_usage_events,
    c.incident_damage_logs,
    case
      when c.simulation_run_id is null then 'no_simulation_run_yet'
      when c.simulation_status not in ('completed','success','finished') then 'simulation_not_completed_yet'
      when c.no_effect_skip_rows > 0 then 'skipped_no_postprocessor_effect'
      when c.delta_consumed_rows > 0 or c.stage_supply_usage_events > 0 or c.incident_damage_logs > 0 then 'already_postprocessed'
      else 'ready_for_v20_postprocessor'
    end as safe_recommendation
  from counted c
  order by
    case
      when c.simulation_run_id is null then 4
      when c.simulation_status not in ('completed','success','finished') then 3
      when c.no_effect_skip_rows > 0 then 2
      when c.delta_consumed_rows > 0 or c.stage_supply_usage_events > 0 or c.incident_damage_logs > 0 then 1
      else 0
    end,
    c.stage_date nulls last,
    c.completed_at nulls last,
    c.stage_id::text
  limit greatest(coalesce(p_limit, 50), 1);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_process_due_stage_simulations_with_postprocessors_v(p_team_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true, p_consumer text DEFAULT 'race_stage_scheduler_v21_2'::text, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_scheduler_result jsonb := null;
  v_candidates_before jsonb := '[]'::jsonb;
  v_candidates_after_scheduler jsonb := '[]'::jsonb;
  v_results jsonb := '[]'::jsonb;
  v_row record;
  v_precheck jsonb;
  v_apply_result jsonb;
  v_result_for_output jsonb;
  v_processed_count integer := 0;
  v_ready_count integer := 0;
  v_skipped_count integer := 0;
  v_error_count integer := 0;
  v_effect_count integer := 0;
  v_no_effect_count integer := 0;
  v_tactical_events integer := 0;
  v_command_outcomes integer := 0;
  v_delta_rows integer := 0;
  v_incident_damage_candidates integer := 0;
  v_supply_total integer := 0;
  v_error text;
begin
  if p_limit is null or p_limit < 1 then
    p_limit := 20;
  end if;

  if to_regprocedure('public.race_engine_apply_road_stage_post_finalizer_extensions_v20(uuid,uuid,boolean,text)') is null then
    raise exception 'Missing v20 function: public.race_engine_apply_road_stage_post_finalizer_extensions_v20(uuid,uuid,boolean,text)';
  end if;

  if to_regprocedure('public.race_engine_stage_postprocessor_candidates_v21(uuid,integer)') is null then
    raise exception 'Missing v21 candidate function: public.race_engine_stage_postprocessor_candidates_v21(uuid,integer)';
  end if;

  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
  into v_candidates_before
  from public.race_engine_stage_postprocessor_candidates_v21(p_team_id, p_limit) c;

  if not p_dry_run then
    if to_regprocedure('public.process_due_race_stage_simulations_v1()') is not null then
      v_scheduler_result := public.process_due_race_stage_simulations_v1();
    else
      v_scheduler_result := jsonb_build_object(
        'skipped', true,
        'reason', 'process_due_race_stage_simulations_v1() is missing; only already-completed simulations can be postprocessed.'
      );
    end if;
  else
    v_scheduler_result := jsonb_build_object(
      'skipped', true,
      'reason', 'dry_run=true, so the due-stage simulation scheduler was not called.'
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
  into v_candidates_after_scheduler
  from public.race_engine_stage_postprocessor_candidates_v21(p_team_id, p_limit) c;

  for v_row in
    select *
    from public.race_engine_stage_postprocessor_candidates_v21(p_team_id, p_limit)
    where safe_recommendation = 'ready_for_v20_postprocessor'
      and simulation_run_id is not null
      and simulation_status in ('completed','success','finished')
    order by stage_date nulls last, completed_at nulls last, stage_id::text
  loop
    v_ready_count := v_ready_count + 1;

    begin
      -- Always precheck with dry-run first. This prevents noisy zero-usage apply rows on old stages.
      v_precheck := public.race_engine_apply_road_stage_post_finalizer_extensions_v20(
        v_row.simulation_run_id,
        v_row.main_club_id,
        true,
        p_consumer || '_precheck'
      );

      v_tactical_events := coalesce(nullif(v_precheck #>> '{steps,alive_tactical_events_v9_3,inserted_events}', '')::integer, 0)
        + coalesce(nullif(v_precheck #>> '{steps,alive_tactical_events_v9_3,generated_candidate_count}', '')::integer, 0)
        + coalesce(nullif(v_precheck #>> '{steps,alive_tactical_events_v9_3,command_rows_seen}', '')::integer, 0);

      v_command_outcomes := coalesce(nullif(v_precheck #>> '{steps,command_outcomes_v10_4,generated_outcome_count}', '')::integer, 0);
      v_delta_rows := coalesce(nullif(v_precheck #>> '{steps,delta_queue_v12,source_rows}', '')::integer, 0);
      v_incident_damage_candidates := coalesce(nullif(v_precheck #>> '{steps,incident_equipment_damage_v17_3,candidate_count}', '')::integer, 0);

      v_supply_total :=
          coalesce(nullif(v_precheck #>> '{steps,stage_supply_consumption_v19,planned_totals,bidons_water_bottles}', '')::integer, 0)
        + coalesce(nullif(v_precheck #>> '{steps,stage_supply_consumption_v19,planned_totals,energy_gels}', '')::integer, 0)
        + coalesce(nullif(v_precheck #>> '{steps,stage_supply_consumption_v19,planned_totals,nutrition_packs}', '')::integer, 0)
        + coalesce(nullif(v_precheck #>> '{steps,stage_supply_consumption_v19,planned_totals,race_jersey_complete_stage_uses}', '')::integer, 0)
        + coalesce(nullif(v_precheck #>> '{steps,stage_supply_consumption_v19,planned_totals,rain_jackets_stage_uses}', '')::integer, 0);

      if (v_tactical_events + v_command_outcomes + v_delta_rows + v_incident_damage_candidates + v_supply_total) <= 0 then
        v_no_effect_count := v_no_effect_count + 1;

        -- In apply mode, remember this old/empty stage so future scheduler cycles do not keep selecting it.
        if not p_dry_run then
          insert into public.race_engine_stage_postprocessor_skip_logs (
            stage_id,
            race_id,
            race_stage_plan_id,
            race_preparation_id,
            simulation_run_id,
            main_club_id,
            participating_club_id,
            stage_number,
            stage_date,
            skip_reason,
            consumer,
            precheck_counts,
            precheck_result,
            created_at,
            updated_at
          ) values (
            v_row.stage_id,
            v_row.race_id,
            v_row.race_stage_plan_id,
            v_row.race_preparation_id,
            v_row.simulation_run_id,
            v_row.main_club_id,
            v_row.participating_club_id,
            v_row.stage_number,
            v_row.stage_date,
            'skipped_no_postprocessor_effect',
            p_consumer,
            jsonb_build_object(
              'tactical_events', v_tactical_events,
              'command_outcomes', v_command_outcomes,
              'delta_rows', v_delta_rows,
              'incident_damage_candidates', v_incident_damage_candidates,
              'planned_supply_total', v_supply_total
            ),
            v_precheck,
            now(),
            now()
          )
          on conflict (stage_id, main_club_id, race_stage_plan_id, simulation_run_id, skip_reason)
          do update set
            consumer = excluded.consumer,
            precheck_counts = excluded.precheck_counts,
            precheck_result = excluded.precheck_result,
            updated_at = now();
        end if;

        v_result_for_output := jsonb_build_object(
          'status', 'skipped_no_postprocessor_effect',
          'dry_run', p_dry_run,
          'safe_note', 'Precheck found no tactical events, no command deltas, no incident damage, and zero planned supply usage. Nothing should be applied for this old/empty stage plan.',
          'precheck_counts', jsonb_build_object(
            'tactical_events', v_tactical_events,
            'command_outcomes', v_command_outcomes,
            'delta_rows', v_delta_rows,
            'incident_damage_candidates', v_incident_damage_candidates,
            'planned_supply_total', v_supply_total
          ),
          'precheck_result', v_precheck
        );
      elsif p_dry_run then
        v_effect_count := v_effect_count + 1;
        v_result_for_output := jsonb_build_object(
          'status', 'would_apply_postprocessor_effects',
          'dry_run', true,
          'safe_note', 'Dry-run only. This stage has real postprocessor effects and is safe to apply in a controlled apply cycle.',
          'precheck_counts', jsonb_build_object(
            'tactical_events', v_tactical_events,
            'command_outcomes', v_command_outcomes,
            'delta_rows', v_delta_rows,
            'incident_damage_candidates', v_incident_damage_candidates,
            'planned_supply_total', v_supply_total
          ),
          'precheck_result', v_precheck
        );
      else
        v_effect_count := v_effect_count + 1;
        v_apply_result := public.race_engine_apply_road_stage_post_finalizer_extensions_v20(
          v_row.simulation_run_id,
          v_row.main_club_id,
          false,
          p_consumer
        );
        v_processed_count := v_processed_count + 1;
        v_result_for_output := jsonb_build_object(
          'status', 'applied_postprocessor_effects',
          'dry_run', false,
          'precheck_counts', jsonb_build_object(
            'tactical_events', v_tactical_events,
            'command_outcomes', v_command_outcomes,
            'delta_rows', v_delta_rows,
            'incident_damage_candidates', v_incident_damage_candidates,
            'planned_supply_total', v_supply_total
          ),
          'precheck_result', v_precheck,
          'apply_result', v_apply_result
        );
      end if;

      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'stage_id', v_row.stage_id,
        'race_id', v_row.race_id,
        'stage_date', v_row.stage_date,
        'stage_number', v_row.stage_number,
        'race_stage_plan_id', v_row.race_stage_plan_id,
        'simulation_run_id', v_row.simulation_run_id,
        'main_club_id', v_row.main_club_id,
        'participating_club_id', v_row.participating_club_id,
        'dry_run', p_dry_run,
        'postprocessor_result', v_result_for_output
      ));
    exception when others then
      v_error := sqlerrm;
      v_error_count := v_error_count + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'stage_id', v_row.stage_id,
        'race_id', v_row.race_id,
        'stage_date', v_row.stage_date,
        'stage_number', v_row.stage_number,
        'race_stage_plan_id', v_row.race_stage_plan_id,
        'simulation_run_id', v_row.simulation_run_id,
        'main_club_id', v_row.main_club_id,
        'participating_club_id', v_row.participating_club_id,
        'dry_run', p_dry_run,
        'status', 'postprocessor_error_skipped_candidate',
        'error', v_error,
        'safe_note', 'v21.2 catches per-stage errors so one old/bad stage does not abort the full scheduler batch.'
      ));
    end;
  end loop;

  select count(*)::integer
  into v_skipped_count
  from public.race_engine_stage_postprocessor_candidates_v21(p_team_id, p_limit) c
  where c.safe_recommendation <> 'ready_for_v20_postprocessor';

  return jsonb_build_object(
    'status', case when v_error_count > 0 then 'ok_with_skipped_errors' else 'ok' end,
    'version', 'v21_3_scheduler_skip_logged_effect_precheck',
    'dry_run', p_dry_run,
    'team_id', p_team_id,
    'consumer', p_consumer,
    'limit', p_limit,
    'scheduler_result', v_scheduler_result,
    'ready_for_postprocessor_count', v_ready_count,
    'effect_candidate_count', v_effect_count,
    'no_effect_skipped_count', v_no_effect_count,
    'processed_count', v_processed_count,
    'skipped_count', v_skipped_count,
    'error_count', v_error_count,
    'candidates_before', v_candidates_before,
    'candidates_after_scheduler', v_candidates_after_scheduler,
    'postprocessor_results', v_results,
    'safe_rule', 'v21.3 prechecks with v20 dry-run, applies only stages with real effects, and logs zero-effect old stages so future cycles skip them.',
    'edge_function_next_step', 'After testing dry-run and one small apply cycle with real effects, update your scheduler/Edge Function to call this v21 wrapper instead of process_due_race_stage_simulations_v1().'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_postprocessor_integration_verify_v21(p_team_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_candidates jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
  into v_candidates
  from public.race_engine_stage_postprocessor_candidates_v21(p_team_id, p_limit) c;

  select jsonb_build_object(
    'total_candidates', count(*),
    'ready_for_v20_postprocessor', count(*) filter (where safe_recommendation = 'ready_for_v20_postprocessor'),
    'already_postprocessed', count(*) filter (where safe_recommendation = 'already_postprocessed'),
    'simulation_not_completed_yet', count(*) filter (where safe_recommendation = 'simulation_not_completed_yet'),
    'no_simulation_run_yet', count(*) filter (where safe_recommendation = 'no_simulation_run_yet')
  )
  into v_summary
  from public.race_engine_stage_postprocessor_candidates_v21(p_team_id, p_limit);

  return jsonb_build_object(
    'status', 'ok',
    'version', 'v21_postprocessor_integration_verify',
    'team_id', p_team_id,
    'limit', p_limit,
    'summary', v_summary,
    'candidates', v_candidates,
    'safe_next_step', case
      when coalesce((v_summary->>'ready_for_v20_postprocessor')::integer, 0) > 0
        then 'Run race_engine_process_due_stage_simulations_with_postprocessors_v21(..., true, ...) as dry-run, inspect output, then apply false for one controlled scheduler cycle.'
      else 'No completed unprocessed stage was found for this filter. Configure/simulate the next stage, then run this verify again.'
    end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_my_notifications_read_by_ids(p_user_notification_ids bigint[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_updated integer;
begin
  if p_user_notification_ids is null
     or array_length(p_user_notification_ids, 1) is null then
    return 0;
  end if;

  update public.user_notifications un
  set
    status = 'read',
    read_at = now()
  where un.user_id = auth.uid()
    and un.deleted_at is null
    and un.status = 'unread'
    and un.id = any(p_user_notification_ids);

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_due_race_supplies_low_notifications_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current_game_date date;
  v_created_count integer := 0;
  v_resolved_count integer := 0;
  v_row record;
  v_existing_state public.club_race_supplies_low_notification_state%rowtype;
  v_event_key text;
  v_action_url text := '/dashboard/equipment?tab=race-supplies';
  v_payload jsonb;
begin
  v_current_game_date := public.get_current_game_date_date();

  -- Resolve clubs that are no longer low.
  with expected_supplies as (
    select *
    from (
      values
        ('bidons_water_bottles'::text, 'Bidons / Water Bottles'::text, 10::integer, 1::integer),
        ('energy_gels'::text, 'Energy Gels'::text, 10::integer, 2::integer),
        ('nutrition_packs'::text, 'Nutrition Packs'::text, 20::integer, 3::integer),
        ('race_jersey_complete'::text, 'Race Jersey Complete'::text, 3::integer, 4::integer),
        ('rain_jackets'::text, 'Rain Jackets'::text, 3::integer, 5::integer)
    ) as t(supply_key, display_name, threshold_quantity, sort_order)
  ),
  eligible_clubs as (
    select
      c.id as club_id
    from public.clubs c
    where c.owner_user_id is not null
      and coalesce(c.is_ai, false) = false
      and coalesce(c.club_type, 'main') = 'main'
      and exists (
        select 1
        from public.club_race_supplies crs
        where crs.club_id = c.id
      )
  ),
  current_low_clubs as (
    select distinct ec.club_id
    from eligible_clubs ec
    cross join expected_supplies es
    left join public.club_race_supplies crs
      on crs.club_id = ec.club_id
     and crs.supply_key = es.supply_key
    where coalesce(crs.quantity_available, 0) <= es.threshold_quantity
  ),
  resolved as (
    update public.club_race_supplies_low_notification_state s
    set
      is_low = false,
      last_resolved_game_date = v_current_game_date,
      last_resolved_at = now(),
      updated_at = now()
    where s.is_low = true
      and not exists (
        select 1
        from current_low_clubs clc
        where clc.club_id = s.club_id
      )
    returning s.club_id
  )
  select count(*)
  into v_resolved_count
  from resolved;

  for v_row in
    with expected_supplies as (
      select *
      from (
        values
          ('bidons_water_bottles'::text, 'Bidons / Water Bottles'::text, 10::integer, 1::integer),
          ('energy_gels'::text, 'Energy Gels'::text, 10::integer, 2::integer),
          ('nutrition_packs'::text, 'Nutrition Packs'::text, 20::integer, 3::integer),
          ('race_jersey_complete'::text, 'Race Jersey Complete'::text, 3::integer, 4::integer),
          ('rain_jackets'::text, 'Rain Jackets'::text, 3::integer, 5::integer)
      ) as t(supply_key, display_name, threshold_quantity, sort_order)
    ),
    eligible_clubs as (
      select
        c.id as club_id,
        c.name as club_name,
        c.owner_user_id
      from public.clubs c
      where c.owner_user_id is not null
        and coalesce(c.is_ai, false) = false
        and coalesce(c.club_type, 'main') = 'main'
        and exists (
          select 1
          from public.club_race_supplies crs
          where crs.club_id = c.id
        )
    ),
    low_items as (
      select
        ec.club_id,
        ec.club_name,
        ec.owner_user_id,
        es.supply_key,
        es.display_name,
        es.threshold_quantity,
        es.sort_order,
        coalesce(crs.quantity_available, 0) as quantity_available
      from eligible_clubs ec
      cross join expected_supplies es
      left join public.club_race_supplies crs
        on crs.club_id = ec.club_id
       and crs.supply_key = es.supply_key
      where coalesce(crs.quantity_available, 0) <= es.threshold_quantity
    )
    select
      li.club_id,
      li.club_name,
      li.owner_user_id,
      count(*)::integer as low_supply_count,
      array_agg(li.supply_key order by li.sort_order) as low_supply_keys,
      md5(string_agg(li.supply_key, ',' order by li.sort_order)) as low_supply_signature,
      string_agg(
        li.display_name || ': ' || li.quantity_available::text || ' left, threshold ' || li.threshold_quantity::text,
        '; '
        order by li.sort_order
      ) as critical_summary,
      jsonb_agg(
        jsonb_build_object(
          'supply_key', li.supply_key,
          'supply_name', li.display_name,
          'available_quantity', li.quantity_available,
          'threshold', li.threshold_quantity
        )
        order by li.sort_order
      ) as critical_items,

      max(li.quantity_available) filter (where li.supply_key = 'bidons_water_bottles') as bidons_available,
      max(li.quantity_available) filter (where li.supply_key = 'energy_gels') as energy_gels_available,
      max(li.quantity_available) filter (where li.supply_key = 'nutrition_packs') as nutrition_packs_available,
      max(li.quantity_available) filter (where li.supply_key = 'race_jersey_complete') as race_jersey_complete_available,
      max(li.quantity_available) filter (where li.supply_key = 'rain_jackets') as rain_jackets_available
    from low_items li
    group by li.club_id, li.club_name, li.owner_user_id
  loop
    select *
    into v_existing_state
    from public.club_race_supplies_low_notification_state s
    where s.club_id = v_row.club_id;

    if v_existing_state.club_id is null
       or v_existing_state.is_low = false
       or v_existing_state.low_supply_signature is distinct from v_row.low_supply_signature then

      v_event_key :=
        'race_supplies_low:'
        || v_row.club_id
        || ':'
        || v_current_game_date::text
        || ':'
        || v_row.low_supply_signature;

      v_payload := jsonb_build_object(
        'type_code', 'RACE_SUPPLIES_LOW',
        'club_id', v_row.club_id,
        'club_name', v_row.club_name,
        'critical_count', v_row.low_supply_count,
        'critical_items_count', v_row.low_supply_count,
        'low_supply_count', v_row.low_supply_count,
        'shortage_count', v_row.low_supply_count,
        'stock_status', 'critical_low_stock',
        'supply_status', 'restock_required',
        'critical_summary', v_row.critical_summary,
        'low_stock_summary', v_row.critical_summary,
        'critical_items', v_row.critical_items,
        'low_items', v_row.critical_items,
        'bidons_available', v_row.bidons_available,
        'water_bottles_available', v_row.bidons_available,
        'energy_gels_available', v_row.energy_gels_available,
        'gels_available', v_row.energy_gels_available,
        'nutrition_packs_available', v_row.nutrition_packs_available,
        'race_jersey_complete_available', v_row.race_jersey_complete_available,
        'race_jersey_available', v_row.race_jersey_complete_available,
        'rain_jackets_available', v_row.rain_jackets_available,
        'race_supplies_path', v_action_url,
        'equipment_path', '/dashboard/equipment',
        'action_url', v_action_url
      );

      perform public.ppm_create_user_notification_direct_v1(
        v_row.owner_user_id,
        'RACE_SUPPLIES_LOW',
        'Race supplies critically low',
        'Some race supplies are critically low. Restock before your next race preparation.',
        v_action_url,
        v_payload,
        v_event_key
      );

      v_created_count := v_created_count + 1;
    end if;

    insert into public.club_race_supplies_low_notification_state (
      club_id,
      is_low,
      low_supply_signature,
      low_supply_keys,
      last_notified_game_date,
      last_notified_at,
      updated_at
    )
    values (
      v_row.club_id,
      true,
      v_row.low_supply_signature,
      v_row.low_supply_keys,
      case
        when v_existing_state.club_id is null
          or v_existing_state.is_low = false
          or v_existing_state.low_supply_signature is distinct from v_row.low_supply_signature
        then v_current_game_date
        else v_existing_state.last_notified_game_date
      end,
      case
        when v_existing_state.club_id is null
          or v_existing_state.is_low = false
          or v_existing_state.low_supply_signature is distinct from v_row.low_supply_signature
        then now()
        else v_existing_state.last_notified_at
      end,
      now()
    )
    on conflict (club_id) do update
    set
      is_low = excluded.is_low,
      low_supply_signature = excluded.low_supply_signature,
      low_supply_keys = excluded.low_supply_keys,
      last_notified_game_date = excluded.last_notified_game_date,
      last_notified_at = excluded.last_notified_at,
      updated_at = now();
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'current_game_date', v_current_game_date,
    'low_stock_notifications_created', v_created_count,
    'low_stock_states_resolved', v_resolved_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_homepage_snapshot_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_active_managers integer := 0;
  v_total_teams integer := 0;
  v_total_races integer := 0;
  v_total_stages integer := 0;

  v_game_time_label text := 'Season 1 • Game time unavailable';
  v_clock record;
begin
  /*
    Active managers:
    Real user-owned main clubs only.
    AI teams are excluded.
    Developing/U23 teams are excluded so one user is not counted twice.
  */
  select count(distinct c.owner_user_id)::integer
  into v_active_managers
  from public.clubs c
  where c.owner_user_id is not null
    and coalesce(c.is_ai, false) = false
    and coalesce(c.club_type, 'main') = 'main'
    and coalesce(c.is_active, true) = true;

  /*
    Total teams:
    Main teams only, including AI.
    Developing/U23 teams are not counted separately on the public homepage.
  */
  select count(*)::integer
  into v_total_teams
  from public.clubs c
  where coalesce(c.club_type, 'main') = 'main';

  /*
    Total races/tours:
    Counts all race records in the game.
  */
  select count(*)::integer
  into v_total_races
  from public.races;

  /*
    Total stages:
    Counts all stage records in the game.
  */
  select count(*)::integer
  into v_total_stages
  from public.race_stages;

  /*
    Authoritative game time:
    This uses the existing game-clock function already present in your database.
  */
  select *
  into v_clock
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
    'total_teams', coalesce(v_total_teams, 0),
    'total_races', coalesce(v_total_races, 0),
    'total_stages', coalesce(v_total_stages, 0)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_homepage_race_days_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_stage_plan_readiness_ui_v1(p_race_preparation_id uuid DEFAULT NULL::uuid, p_race_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_summary jsonb := '[]'::jsonb;
  v_stages jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(s) order by s.race_preparation_id, s.race_id), '[]'::jsonb)
  into v_summary
  from (
    select
      r.race_preparation_id,
      r.race_id,
      r.total_stage_plans,
      r.saved_stage_plans,
      r.usable_stage_plans,
      r.missing_stage_plans,
      r.saved_without_supplies,
      r.saved_but_empty,
      r.incomplete_stage_plans,
      r.all_required_stage_plans_saved,
      r.has_missing_stage_plans,
      r.has_problem_stage_plans,
      r.readiness_status,
      r.readiness_label,
      case
        when r.readiness_status = 'all_stage_plans_saved'
          then 'green'
        when r.readiness_status = 'saved_with_supply_warnings'
          then 'yellow'
        when r.readiness_status = 'problem_stage_plans'
          then 'red'
        when r.readiness_status = 'missing_stage_plans'
          then 'orange'
        else 'gray'
      end as ui_tone,
      case
        when r.readiness_status = 'all_stage_plans_saved'
          then 'All stage plans are saved and ready.'
        when r.readiness_status = 'saved_with_supply_warnings'
          then 'Some stages are saved without supplies. Review supplies before race start.'
        when r.readiness_status = 'problem_stage_plans'
          then 'Some saved stage plans are empty or incomplete. Review them before race start.'
        when r.readiness_status = 'missing_stage_plans'
          then 'Some stage plans are still missing. Open Stage Plans and save each stage before race start.'
        else 'Review stage plan readiness.'
      end as recommended_action
    from public.race_stage_plan_readiness_summary_v1(
      p_race_preparation_id,
      p_race_id
    ) r
  ) s;

  select coalesce(jsonb_agg(to_jsonb(st) order by st.stage_date, st.stage_number), '[]'::jsonb)
  into v_stages
  from (
    select
      r.race_stage_plan_id,
      r.race_preparation_id,
      r.race_id,
      r.stage_id,
      r.stage_number,
      r.stage_date,
      r.status,
      r.last_saved_at,
      r.submitted_at,

      r.rider_role_count,
      r.rider_equipment_count,
      r.rider_supply_count,
      r.rider_individual_tactic_count,
      r.team_tactic_rider_count,

      r.has_saved_plan,
      r.has_core_rider_plan,
      r.has_supply_plan,
      r.has_tactical_plan,
      r.is_placeholder,
      r.is_usable_for_engine,

      r.readiness_status,
      r.readiness_label,

      case
        when r.readiness_status = 'saved_with_plan_data'
          then 'green'
        when r.readiness_status = 'saved_with_plan_data_no_supplies'
          then 'yellow'
        when r.readiness_status = 'missing_stage_plan_placeholder'
          then 'orange'
        when r.readiness_status in ('saved_but_empty', 'incomplete_stage_plan')
          then 'red'
        else 'gray'
      end as ui_tone,

      case
        when r.readiness_status = 'saved_with_plan_data'
          then 'Stage plan saved.'
        when r.readiness_status = 'saved_with_plan_data_no_supplies'
          then 'Stage plan saved, but no supplies are assigned.'
        when r.readiness_status = 'missing_stage_plan_placeholder'
          then 'Open this stage and save a real stage plan.'
        when r.readiness_status = 'saved_but_empty'
          then 'This stage plan was saved but contains no rider plan data.'
        when r.readiness_status = 'incomplete_stage_plan'
          then 'This stage plan is incomplete. Review rider roles, equipment, tactics and supplies.'
        else 'Review this stage plan.'
      end as recommended_action,

      r.metadata
    from public.race_stage_plan_readiness_v1(
      p_race_preparation_id,
      p_race_id,
      null
    ) r
  ) st;

  return jsonb_build_object(
    'status', 'ok',
    'version', 'v23_stage_plan_readiness_ui',
    'race_preparation_id', p_race_preparation_id,
    'race_id', p_race_id,
    'summary', v_summary,
    'stages', v_stages
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_profile_birthday_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_max_day int;
  v_is_leap boolean;
begin
  if (new.birthday_month is null and new.birthday_day is not null)
     or (new.birthday_month is not null and new.birthday_day is null) then
    raise exception 'Birthday month and birthday day must be supplied together.';
  end if;

  if new.birthday_month is not null and new.birthday_day is not null then
    if new.birthday_month in (1, 3, 5, 7, 8, 10, 12) then
      v_max_day := 31;
    elsif new.birthday_month in (4, 6, 9, 11) then
      v_max_day := 30;
    elsif new.birthday_month = 2 then
      if new.birthday_year is null then
        v_max_day := 29;
      else
        v_is_leap :=
          (new.birthday_year % 4 = 0 and new.birthday_year % 100 <> 0)
          or (new.birthday_year % 400 = 0);

        v_max_day := case when v_is_leap then 29 else 28 end;
      end if;
    else
      raise exception 'Invalid birthday month.';
    end if;

    if new.birthday_day < 1 or new.birthday_day > v_max_day then
      raise exception 'Invalid birthday day for selected month.';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.birthday_locked = true and (
      new.birthday_month is distinct from old.birthday_month
      or new.birthday_day is distinct from old.birthday_day
      or new.birthday_year is distinct from old.birthday_year
    ) then
      raise exception 'Birthday cannot be changed after it has been saved.';
    end if;
  end if;

  if new.birthday_month is not null
     and new.birthday_day is not null
     and new.birthday_locked = false then
    new.birthday_locked := true;
    new.birthday_set_at := coalesce(new.birthday_set_at, now());
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_birthday_gifts_v1(p_today date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_month int := extract(month from p_today)::int;
  v_day int := extract(day from p_today)::int;
  v_year int := extract(year from p_today)::int;

  v_processed int := 0;
  v_credited int := 0;
  v_emails_queued int := 0;
  v_notifications_created int := 0;
  v_audit_rows int := 0;

  v_email_inserted int := 0;
  v_notification_type_id bigint;

  v_inserted_ledger_id uuid;
  v_email_queue_id uuid;
  v_inserted_notification_id bigint;
  v_user_notification_id bigint;

  v_system_key text;

  v_brand_icon_url text := 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/5c3417dc-3924-4423-948a-745ae5902ed0.png';

  r record;
begin
  select nt.id
  into v_notification_type_id
  from public.notification_types nt
  where nt.code = 'BIRTHDAY_GIFT_10_COINS'
    and nt.is_active = true
  limit 1;

  for r in
    select
      p.id as user_id,
      p.username,
      p.email,
      p.birthday_month,
      p.birthday_day,
      p.birthday_year
    from public.profiles p
    where p.birthday_month = v_month
      and p.birthday_day = v_day
      and p.email is not null
      and p.email not like 'deleted_%@deleted.local'
  loop
    v_processed := v_processed + 1;

    v_system_key := 'birthday_gift_v1_' || v_year::text || '_' || r.user_id::text;

    v_inserted_ledger_id := null;
    v_email_queue_id := null;
    v_inserted_notification_id := null;
    v_user_notification_id := null;
    v_email_inserted := 0;

    insert into public.user_coin_ledger (
      user_id,
      delta,
      reason,
      payload_json
    )
    select
      r.user_id,
      10,
      'birthday_gift',
      jsonb_build_object(
        'system_key', v_system_key,
        'gift_coins', 10,
        'birthday_month', r.birthday_month,
        'birthday_day', r.birthday_day,
        'birthday_year', r.birthday_year,
        'gift_year', v_year,
        'processed_on', p_today
      )
    where not exists (
      select 1
      from public.user_coin_ledger l
      where l.user_id = r.user_id
        and l.reason = 'birthday_gift'
        and l.payload_json ->> 'system_key' = v_system_key
    )
    returning id into v_inserted_ledger_id;

    if v_inserted_ledger_id is not null then
      insert into public.user_wallets (
        user_id,
        balance,
        created_at,
        updated_at
      )
      values (
        r.user_id,
        10,
        now(),
        now()
      )
      on conflict (user_id) do update
      set
        balance = public.user_wallets.balance + 10,
        updated_at = now();

      v_credited := v_credited + 1;

      insert into public.game_email_queue (
        user_id,
        club_id,
        email_type,
        recipient_email,
        recipient_name,
        subject,
        body_text,
        body_html,
        status,
        attempts,
        queued_at,
        metadata
      )
      select
        r.user_id,
        null,
        'birthday_gift_10_coins',
        r.email,
        coalesce(r.username, 'Manager'),
        'Happy birthday from ProPeloton Manager!',
        'Happy birthday, ' || coalesce(r.username, 'Manager') || E'!\n\n'
          || 'Everyone at ProPeloton Manager wishes you a fantastic birthday, full of good energy, great moments, and many successful kilometers ahead.'
          || E'\n\nAs a small gift from us, we have added 10 birthday coins to your account. Use them to continue building your cycling legacy and pushing your team forward.'
          || E'\n\nThank you for being part of the ProPeloton Manager world.'
          || E'\n\nBest wishes,'
          || E'\nYour ProPeloton Manager Team',
        '<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;padding:24px;color:#111827;line-height:1.6;">'
          || '<h2 style="margin:0 0 16px;font-size:24px;color:#111827;">Happy birthday, '
          || coalesce(r.username, 'Manager')
          || '!</h2>'
          || '<p style="font-size:15px;margin:0 0 14px;">Everyone at <strong>ProPeloton Manager</strong> wishes you a fantastic birthday, full of good energy, great moments, and many successful kilometers ahead.</p>'
          || '<p style="font-size:15px;margin:0 0 14px;">As a small gift from us, we have added <strong>10 birthday coins</strong> to your account.</p>'
          || '<p style="font-size:15px;margin:0 0 20px;">Use them to continue building your cycling legacy, developing your riders, and pushing your team toward the next big result.</p>'
          || '<div style="background:#fff7d6;border:1px solid #f2d46b;border-radius:10px;padding:14px 16px;margin:20px 0;">'
          || '<div style="font-size:14px;color:#4b5563;margin-bottom:4px;">Birthday gift added</div>'
          || '<div style="font-size:22px;font-weight:700;color:#111827;">+10 Coins</div>'
          || '</div>'
          || '<p style="font-size:15px;margin:0 0 6px;">Thank you for being part of the ProPeloton Manager world.</p>'
          || '<p style="font-size:15px;margin:0 0 18px;">Best wishes,<br><strong>Your ProPeloton Manager Team</strong></p>'
          || '<div style="margin-top:18px;">'
          || '<img src="' || v_brand_icon_url || '" alt="ProPeloton Manager" style="width:72px;height:72px;border-radius:16px;display:block;" />'
          || '</div>'
          || '</div>',
        'pending',
        0,
        now(),
        jsonb_build_object(
          'system_key', v_system_key,
          'gift_coins', 10,
          'ledger_id', v_inserted_ledger_id,
          'processed_on', p_today,
          'brand_icon_url', v_brand_icon_url
        )
      where not exists (
        select 1
        from public.game_email_queue q
        where q.user_id = r.user_id
          and q.email_type = 'birthday_gift_10_coins'
          and q.metadata ->> 'system_key' = v_system_key
      )
      returning id into v_email_queue_id;

      get diagnostics v_email_inserted = row_count;
      v_emails_queued := v_emails_queued + v_email_inserted;

      if v_notification_type_id is not null then
        insert into public.notifications (
          type_id,
          title,
          message,
          source,
          created_by_user_id,
          action_url,
          payload_json,
          expires_at,
          created_at
        )
        select
          v_notification_type_id,
          'Happy birthday, ' || coalesce(r.username, 'Manager') || '!',
          'Your birthday gift is here. We added 10 coins to your ProPeloton Manager account.',
          'game',
          null,
          '/dashboard/pro',
          jsonb_build_object(
            'system_key', v_system_key,
            'gift_coins', 10,
            'ledger_id', v_inserted_ledger_id,
            'email_queue_id', v_email_queue_id,
            'processed_on', p_today,
            'birthday_month', r.birthday_month,
            'birthday_day', r.birthday_day,
            'birthday_year', r.birthday_year,
            'gift_year', v_year,
            'notification_code', 'BIRTHDAY_GIFT_10_COINS'
          ),
          null,
          now()
        where not exists (
          select 1
          from public.notifications n
          join public.user_notifications un on un.notification_id = n.id
          where un.user_id = r.user_id
            and n.type_id = v_notification_type_id
            and n.payload_json ->> 'system_key' = v_system_key
        )
        returning id into v_inserted_notification_id;

        if v_inserted_notification_id is not null then
          insert into public.user_notifications (
            user_id,
            notification_id,
            status,
            read_at,
            deleted_at,
            created_at
          )
          values (
            r.user_id,
            v_inserted_notification_id,
            'unread',
            null,
            null,
            now()
          )
          returning id into v_user_notification_id;

          v_notifications_created := v_notifications_created + 1;
        end if;
      end if;

      insert into public.birthday_gift_audit (
        user_id,
        email,
        username,
        gift_year,
        processed_date,
        processed_at,
        birthday_month,
        birthday_day,
        birthday_year,
        birthday_matches_processed_date,
        gift_coins,
        system_key,
        ledger_id,
        email_queue_id,
        notification_id,
        user_notification_id,
        wallet_credit_created,
        email_queued,
        notification_created,
        source,
        status,
        created_at,
        updated_at
      )
      values (
        r.user_id,
        r.email,
        r.username,
        v_year,
        p_today,
        now(),
        r.birthday_month,
        r.birthday_day,
        r.birthday_year,
        r.birthday_month = v_month and r.birthday_day = v_day,
        10,
        v_system_key,
        v_inserted_ledger_id,
        v_email_queue_id,
        v_inserted_notification_id,
        v_user_notification_id,
        true,
        v_email_queue_id is not null,
        v_inserted_notification_id is not null,
        'process_birthday_gifts_v1',
        'completed',
        now(),
        now()
      )
      on conflict (user_id, gift_year) do update
      set
        email = excluded.email,
        username = excluded.username,
        processed_date = excluded.processed_date,
        processed_at = excluded.processed_at,
        birthday_month = excluded.birthday_month,
        birthday_day = excluded.birthday_day,
        birthday_year = excluded.birthday_year,
        birthday_matches_processed_date = excluded.birthday_matches_processed_date,
        ledger_id = coalesce(public.birthday_gift_audit.ledger_id, excluded.ledger_id),
        email_queue_id = coalesce(public.birthday_gift_audit.email_queue_id, excluded.email_queue_id),
        notification_id = coalesce(public.birthday_gift_audit.notification_id, excluded.notification_id),
        user_notification_id = coalesce(public.birthday_gift_audit.user_notification_id, excluded.user_notification_id),
        wallet_credit_created = public.birthday_gift_audit.wallet_credit_created or excluded.wallet_credit_created,
        email_queued = public.birthday_gift_audit.email_queued or excluded.email_queued,
        notification_created = public.birthday_gift_audit.notification_created or excluded.notification_created,
        status = excluded.status,
        updated_at = now();

      v_audit_rows := v_audit_rows + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'processed_profiles', v_processed,
    'credited_users', v_credited,
    'emails_queued', v_emails_queued,
    'notifications_created', v_notifications_created,
    'audit_rows', v_audit_rows,
    'month', v_month,
    'day', v_day,
    'year', v_year
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.jsonb_number_any_v1(p_value jsonb, p_keys text[], p_default numeric DEFAULT 0)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_key text;
  v_text text;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    return p_default;
  end if;

  foreach v_key in array p_keys loop
    v_text := nullif(trim(p_value ->> v_key), '');

    if v_text is not null and v_text ~ '^-?[0-9]+(\.[0-9]+)?$' then
      return v_text::numeric;
    end if;
  end loop;

  return p_default;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_stage_plan_sport_director_suggestion_v1(p_race_preparation_id uuid, p_stage_id uuid, p_club_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_prep public.race_preparations%rowtype;
  v_stage_plan public.race_stage_plans%rowtype;

  v_sport_director record;
  v_sport_director_level numeric := 1;
  v_sport_director_quality text := 'basic';
  v_accuracy_factor numeric := 0.65;

  v_profile jsonb := '{}'::jsonb;
  v_stage_name text := null;
  v_profile_type text := '';
  v_terrain_type text := '';
  v_finish_type text := '';
  v_stage_format text := '';
  v_distance_km numeric := 0;
  v_elevation_gain_m numeric := 0;
  v_sprint_count integer := 0;
  v_kom_count integer := 0;
  v_bad_weather boolean := false;
  v_stage_kind text := 'balanced';

  v_phase_ranges jsonb := '[]'::jsonb;
  v_team_plan text := 'balanced';

  v_roles_json jsonb := '{}'::jsonb;
  v_equipment_json jsonb := '{}'::jsonb;
  v_supplies_json jsonb := '{}'::jsonb;
  v_individual_tactics_json jsonb := '{}'::jsonb;
  v_team_tactic_json jsonb := '{}'::jsonb;
  v_explanations jsonb := '[]'::jsonb;

  v_rider_count integer := 0;
begin
  select *
  into v_prep
  from public.race_preparations rp
  where rp.id = p_race_preparation_id;

  if not found then
    return jsonb_build_object(
      'status', 'error',
      'code', 'race_preparation_not_found',
      'message', 'Race preparation was not found.'
    );
  end if;

  select *
  into v_stage_plan
  from public.race_stage_plans rsp
  where rsp.race_preparation_id = p_race_preparation_id
    and rsp.stage_id = p_stage_id
  order by rsp.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'status', 'error',
      'code', 'stage_plan_not_found',
      'message', 'Stage plan row was not found for this race preparation and stage.'
    );
  end if;

  select
    rps.*,
    coalesce(rps.staff_snapshot_json, '{}'::jsonb) as staff_snapshot
  into v_sport_director
  from public.race_preparation_staff rps
  where rps.race_preparation_id = p_race_preparation_id
    and lower(coalesce(rps.role_type, '')) in (
      'sport_director',
      'sports_director',
      'director_sportif',
      'sport director'
    )
  order by rps.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'status', 'error',
      'code', 'sport_director_required',
      'message', 'A Sport Director must be assigned in the Race Plan before auto-fill can be used.',
      'safe_frontend_label', 'Sport Director required'
    );
  end if;

  v_sport_director_level := greatest(
    1,
    public.jsonb_number_any_v1(
      v_sport_director.staff_snapshot,
      array[
        'level',
        'staff_level',
        'experience_level',
        'skill_level',
        'overall',
        'overall_rating',
        'rating'
      ],
      1
    )
  );

  v_sport_director_quality :=
    case
      when v_sport_director_level >= 5 then 'excellent'
      when v_sport_director_level >= 4 then 'very_good'
      when v_sport_director_level >= 3 then 'good'
      when v_sport_director_level >= 2 then 'average'
      else 'basic'
    end;

  v_accuracy_factor :=
    case
      when v_sport_director_level >= 5 then 0.95
      when v_sport_director_level >= 4 then 0.88
      when v_sport_director_level >= 3 then 0.80
      when v_sport_director_level >= 2 then 0.72
      else 0.65
    end;

  v_profile := coalesce(v_stage_plan.stage_profile_snapshot_json, '{}'::jsonb);
  v_stage_name := nullif(v_profile ->> 'name', '');
  v_profile_type := lower(coalesce(v_profile ->> 'profile_type', ''));
  v_terrain_type := lower(coalesce(v_profile ->> 'terrain_type', ''));
  v_finish_type := lower(coalesce(v_profile ->> 'finish_type', ''));
  v_stage_format := lower(coalesce(v_profile ->> 'stage_format', ''));
  v_distance_km := public.jsonb_number_any_v1(v_profile, array['distance_km'], 0);
  v_elevation_gain_m := public.jsonb_number_any_v1(v_profile, array['elevation_gain_m'], 0);

  v_sprint_count :=
    case
      when jsonb_typeof(v_profile -> 'intermediate_sprints_json') = 'array'
      then jsonb_array_length(v_profile -> 'intermediate_sprints_json')
      else 0
    end;

  v_kom_count :=
    case
      when jsonb_typeof(v_profile -> 'mountain_climbs_json') = 'array'
      then jsonb_array_length(v_profile -> 'mountain_climbs_json')
      else 0
    end;

  v_bad_weather :=
    lower(coalesce(v_profile #>> '{weather_snapshot,condition}', '')) in (
      'rain',
      'heavy_rain',
      'storm',
      'snow',
      'wind_rain'
    );

  v_stage_kind :=
    case
      when v_stage_format in ('prologue', 'individual_time_trial', 'team_time_trial')
        then 'time_trial'
      when v_profile_type in ('climber', 'mountain') or v_terrain_type = 'mountain' or v_elevation_gain_m >= 1500
        then 'mountain'
      when v_profile_type in ('puncheur', 'hilly') or v_terrain_type = 'hilly' or v_kom_count >= 2
        then 'hilly'
      when v_profile_type in ('sprinter', 'flat') or v_finish_type = 'flat_finish' or v_sprint_count >= 2
        then 'sprint'
      else 'balanced'
    end;

  v_team_plan :=
    case
      when v_stage_kind = 'time_trial' then 'balanced'
      when v_stage_kind = 'mountain' then 'climber_support'
      when v_stage_kind = 'hilly' then 'breakaway'
      when v_stage_kind = 'sprint' then 'sprint_control'
      else 'balanced'
    end;

  if v_distance_km > 0 then
    v_phase_ranges := jsonb_build_array(
      jsonb_build_object(
        'key', 'phase_1',
        'number', 1,
        'label', 'Phase 1',
        'fromKm', 0,
        'toKm', round((v_distance_km * 0.25)::numeric, 1),
        'rangeLabel', '0–' || round((v_distance_km * 0.25)::numeric, 1)::text || ' km'
      ),
      jsonb_build_object(
        'key', 'phase_2',
        'number', 2,
        'label', 'Phase 2',
        'fromKm', round((v_distance_km * 0.25)::numeric, 1),
        'toKm', round((v_distance_km * 0.50)::numeric, 1),
        'rangeLabel', round((v_distance_km * 0.25)::numeric, 1)::text || '–' || round((v_distance_km * 0.50)::numeric, 1)::text || ' km'
      ),
      jsonb_build_object(
        'key', 'phase_3',
        'number', 3,
        'label', 'Phase 3',
        'fromKm', round((v_distance_km * 0.50)::numeric, 1),
        'toKm', round((v_distance_km * 0.75)::numeric, 1),
        'rangeLabel', round((v_distance_km * 0.50)::numeric, 1)::text || '–' || round((v_distance_km * 0.75)::numeric, 1)::text || ' km'
      ),
      jsonb_build_object(
        'key', 'phase_4',
        'number', 4,
        'label', 'Phase 4',
        'fromKm', round((v_distance_km * 0.75)::numeric, 1),
        'toKm', round(v_distance_km::numeric, 1),
        'rangeLabel', round((v_distance_km * 0.75)::numeric, 1)::text || '–' || round(v_distance_km::numeric, 1)::text || ' km'
      )
    );
  else
    v_phase_ranges := jsonb_build_array(
      jsonb_build_object('key', 'phase_1', 'number', 1, 'label', 'Phase 1', 'fromKm', 0, 'toKm', 25, 'rangeLabel', '0–25%'),
      jsonb_build_object('key', 'phase_2', 'number', 2, 'label', 'Phase 2', 'fromKm', 25, 'toKm', 50, 'rangeLabel', '25–50%'),
      jsonb_build_object('key', 'phase_3', 'number', 3, 'label', 'Phase 3', 'fromKm', 50, 'toKm', 75, 'rangeLabel', '50–75%'),
      jsonb_build_object('key', 'phase_4', 'number', 4, 'label', 'Phase 4', 'fromKm', 75, 'toKm', 100, 'rangeLabel', '75–100%')
    );
  end if;

  with rider_source as (
    select
      rpr.rider_id,
      rpr.start_number,
      rpr.race_role,
      rpr.default_equipment_setup_id,
      coalesce(rpr.rider_snapshot_json, '{}'::jsonb) as rider_snapshot,
      coalesce(rpr.bonus_snapshot_json, '{}'::jsonb) as bonus_snapshot
    from public.race_preparation_riders rpr
    where rpr.race_preparation_id = p_race_preparation_id
  ),
  scored as (
    select
      rs.*,

      coalesce(
        nullif(rs.rider_snapshot ->> 'full_name', ''),
        nullif(trim(coalesce(rs.rider_snapshot ->> 'first_name', '') || ' ' || coalesce(rs.rider_snapshot ->> 'last_name', '')), ''),
        rs.rider_id::text
      ) as rider_name,

      public.jsonb_number_any_v1(rs.rider_snapshot, array['sprint', 'sprint_skill'], 50) as sprint_score,
      public.jsonb_number_any_v1(rs.rider_snapshot, array['climbing', 'mountain', 'climb', 'climbing_skill'], 50) as climb_score,
      public.jsonb_number_any_v1(rs.rider_snapshot, array['flat', 'flat_skill'], 50) as flat_score,
      round((public.jsonb_number_any_v1(rs.rider_snapshot, array['climbing', 'mountain', 'climb', 'climbing_skill'], 50) * 0.35 + public.jsonb_number_any_v1(rs.rider_snapshot, array['flat', 'flat_skill'], 50) * 0.15 + public.jsonb_number_any_v1(rs.rider_snapshot, array['endurance', 'stamina'], 50) * 0.20 + public.jsonb_number_any_v1(rs.rider_snapshot, array['race_iq', 'race_intelligence', 'intelligence'], 50) * 0.15 + public.jsonb_number_any_v1(rs.rider_snapshot, array['resistance'], 50) * 0.15),2) as hill_score /* derived_hilly_v1 */,
      public.jsonb_number_any_v1(rs.rider_snapshot, array['time_trial', 'timetrial', 'tt'], 50) as tt_score,
      public.jsonb_number_any_v1(rs.rider_snapshot, array['endurance', 'stamina'], 50) as endurance_score,
      public.jsonb_number_any_v1(rs.rider_snapshot, array['teamwork', 'team_work'], 50) as teamwork_score,
      public.jsonb_number_any_v1(rs.rider_snapshot, array['race_iq', 'race_intelligence', 'intelligence'], 50) as race_iq_score,
      public.jsonb_number_any_v1(rs.rider_snapshot, array['recovery'], 50) as recovery_score,
      public.jsonb_number_any_v1(rs.rider_snapshot, array['fatigue'], 0) as fatigue_score,
      public.jsonb_number_any_v1(rs.rider_snapshot, array['race_sharpness', 'race_sharpness_percent', 'sharpness'], 50) as sharpness_score
    from rider_source rs
  ),
  ranked as (
    select
      s.*,
      (
        s.sprint_score * 0.45 +
        s.flat_score * 0.20 +
        s.endurance_score * 0.15 +
        s.race_iq_score * 0.10 +
        s.teamwork_score * 0.10 -
        s.fatigue_score * 0.08 +
        s.sharpness_score * 0.05
      ) as sprint_rank_score,

      (
        s.climb_score * 0.38 +
        s.hill_score * 0.18 +
        s.endurance_score * 0.18 +
        s.recovery_score * 0.10 +
        s.race_iq_score * 0.10 -
        s.fatigue_score * 0.08 +
        s.sharpness_score * 0.05
      ) as climb_rank_score,

      (
        s.climb_score * 0.25 +
        s.endurance_score * 0.25 +
        s.recovery_score * 0.15 +
        s.race_iq_score * 0.15 +
        s.flat_score * 0.10 +
        s.hill_score * 0.10 -
        s.fatigue_score * 0.08 +
        s.sharpness_score * 0.05
      ) as gc_rank_score,

      (
        s.flat_score * 0.30 +
        s.endurance_score * 0.25 +
        s.teamwork_score * 0.20 +
        s.race_iq_score * 0.10 +
        s.hill_score * 0.10 -
        s.fatigue_score * 0.05
      ) as helper_rank_score,

      (
        s.tt_score * 0.40 +
        s.flat_score * 0.20 +
        s.endurance_score * 0.20 +
        s.teamwork_score * 0.10 +
        s.race_iq_score * 0.10 -
        s.fatigue_score * 0.07
      ) as tt_rank_score
    from scored s
  ),
  numbered as (
    select
      r.*,
      row_number() over (order by r.sprint_rank_score desc, r.start_number nulls last) as sprint_rank,
      row_number() over (order by r.climb_rank_score desc, r.start_number nulls last) as climb_rank,
      row_number() over (order by r.gc_rank_score desc, r.start_number nulls last) as gc_rank,
      row_number() over (order by r.helper_rank_score desc, r.start_number nulls last) as helper_rank,
      row_number() over (order by r.tt_rank_score desc, r.start_number nulls last) as tt_rank
    from ranked r
  ),
  assigned as (
    select
      n.*,
      case
        when v_stage_kind = 'time_trial'
          then 'free_role'

        when v_stage_kind = 'sprint' and n.sprint_rank = 1
          then 'sprinter'
        when v_stage_kind = 'sprint' and n.sprint_rank = 2
          then 'lead_out_rider'
        when v_stage_kind = 'sprint' and n.sprint_rank = 3
          then 'sprint_train_rider'
        when v_stage_kind = 'sprint' and n.gc_rank = 1
          then 'team_leader_gc'
        when v_stage_kind = 'sprint' and n.helper_rank <= 5
          then 'helper_domestique'

        when v_stage_kind = 'mountain' and n.gc_rank = 1
          then 'team_leader_gc'
        when v_stage_kind = 'mountain' and n.climb_rank = 1
          then 'climber'
        when v_stage_kind = 'mountain' and n.climb_rank <= 3
          then 'mountain_domestique'
        when v_stage_kind = 'mountain' and n.helper_rank <= 5
          then 'helper_domestique'

        when v_stage_kind = 'hilly' and n.gc_rank = 1
          then 'team_leader_gc'
        when v_stage_kind = 'hilly' and n.climb_rank = 1
          then 'climber'
        when v_stage_kind = 'hilly' and n.helper_rank = 1
          then 'breakaway_rider'
        when v_stage_kind = 'hilly' and n.helper_rank <= 3
          then 'rouleur'
        when v_stage_kind = 'hilly' and n.sprint_rank = 1
          then 'sprinter'

        when n.gc_rank = 1
          then 'team_leader_gc'
        when n.sprint_rank = 1
          then 'sprinter'
        when n.climb_rank = 1
          then 'climber'
        when n.helper_rank <= 4
          then 'helper_domestique'
        else 'free_role'
      end as suggested_role
    from numbered n
  ),
  commands as (
    select
      a.*,
      case
        when a.suggested_role = 'team_leader_gc' and v_stage_kind in ('mountain', 'hilly')
          then jsonb_build_object(
            'phase_1', jsonb_build_object('label', 'Phase 1', 'from_km', (v_phase_ranges -> 0 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 0 ->> 'toKm')::numeric, 'command', 'avoid_risks'),
            'phase_2', jsonb_build_object('label', 'Phase 2', 'from_km', (v_phase_ranges -> 1 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 1 ->> 'toKm')::numeric, 'command', 'stay_near_front'),
            'phase_3', jsonb_build_object('label', 'Phase 3', 'from_km', (v_phase_ranges -> 2 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 2 ->> 'toKm')::numeric, 'command', 'climb_hard'),
            'phase_4', jsonb_build_object('label', 'Phase 4', 'from_km', (v_phase_ranges -> 3 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 3 ->> 'toKm')::numeric, 'command', 'follow_team_plan')
          )

        when a.suggested_role = 'team_leader_gc'
          then jsonb_build_object(
            'phase_1', jsonb_build_object('label', 'Phase 1', 'from_km', (v_phase_ranges -> 0 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 0 ->> 'toKm')::numeric, 'command', 'avoid_risks'),
            'phase_2', jsonb_build_object('label', 'Phase 2', 'from_km', (v_phase_ranges -> 1 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 1 ->> 'toKm')::numeric, 'command', 'avoid_risks'),
            'phase_3', jsonb_build_object('label', 'Phase 3', 'from_km', (v_phase_ranges -> 2 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 2 ->> 'toKm')::numeric, 'command', 'stay_near_front'),
            'phase_4', jsonb_build_object('label', 'Phase 4', 'from_km', (v_phase_ranges -> 3 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 3 ->> 'toKm')::numeric, 'command', 'follow_team_plan')
          )

        when a.suggested_role = 'sprinter'
          then jsonb_build_object(
            'phase_1', jsonb_build_object('label', 'Phase 1', 'from_km', (v_phase_ranges -> 0 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 0 ->> 'toKm')::numeric, 'command', 'conserve_energy'),
            'phase_2', jsonb_build_object('label', 'Phase 2', 'from_km', (v_phase_ranges -> 1 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 1 ->> 'toKm')::numeric, 'command', 'follow_team_plan'),
            'phase_3', jsonb_build_object('label', 'Phase 3', 'from_km', (v_phase_ranges -> 2 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 2 ->> 'toKm')::numeric, 'command', 'stay_near_front'),
            'phase_4', jsonb_build_object('label', 'Phase 4', 'from_km', (v_phase_ranges -> 3 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 3 ->> 'toKm')::numeric, 'command', 'sprint')
          )

        when a.suggested_role in ('lead_out_rider', 'sprint_train_rider')
          then jsonb_build_object(
            'phase_1', jsonb_build_object('label', 'Phase 1', 'from_km', (v_phase_ranges -> 0 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 0 ->> 'toKm')::numeric, 'command', 'conserve_energy'),
            'phase_2', jsonb_build_object('label', 'Phase 2', 'from_km', (v_phase_ranges -> 1 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 1 ->> 'toKm')::numeric, 'command', 'follow_team_plan'),
            'phase_3', jsonb_build_object('label', 'Phase 3', 'from_km', (v_phase_ranges -> 2 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 2 ->> 'toKm')::numeric, 'command', 'stay_near_front'),
            'phase_4', jsonb_build_object('label', 'Phase 4', 'from_km', (v_phase_ranges -> 3 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 3 ->> 'toKm')::numeric, 'command', 'lead_out')
          )

        when a.suggested_role in ('climber', 'mountain_domestique')
          then jsonb_build_object(
            'phase_1', jsonb_build_object('label', 'Phase 1', 'from_km', (v_phase_ranges -> 0 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 0 ->> 'toKm')::numeric, 'command', 'conserve_energy'),
            'phase_2', jsonb_build_object('label', 'Phase 2', 'from_km', (v_phase_ranges -> 1 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 1 ->> 'toKm')::numeric, 'command', 'follow_team_plan'),
            'phase_3', jsonb_build_object('label', 'Phase 3', 'from_km', (v_phase_ranges -> 2 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 2 ->> 'toKm')::numeric, 'command', 'climb_hard'),
            'phase_4', jsonb_build_object('label', 'Phase 4', 'from_km', (v_phase_ranges -> 3 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 3 ->> 'toKm')::numeric, 'command', 'follow_team_plan')
          )

        when a.suggested_role = 'breakaway_rider'
          then jsonb_build_object(
            'phase_1', jsonb_build_object('label', 'Phase 1', 'from_km', (v_phase_ranges -> 0 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 0 ->> 'toKm')::numeric, 'command', 'attack'),
            'phase_2', jsonb_build_object('label', 'Phase 2', 'from_km', (v_phase_ranges -> 1 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 1 ->> 'toKm')::numeric, 'command', 'join_breakaway'),
            'phase_3', jsonb_build_object('label', 'Phase 3', 'from_km', (v_phase_ranges -> 2 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 2 ->> 'toKm')::numeric, 'command', 'follow_team_plan'),
            'phase_4', jsonb_build_object('label', 'Phase 4', 'from_km', (v_phase_ranges -> 3 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 3 ->> 'toKm')::numeric, 'command', 'follow_team_plan')
          )

        when a.suggested_role in ('helper_domestique', 'rouleur')
          then jsonb_build_object(
            'phase_1', jsonb_build_object('label', 'Phase 1', 'from_km', (v_phase_ranges -> 0 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 0 ->> 'toKm')::numeric, 'command', 'protect_leader'),
            'phase_2', jsonb_build_object('label', 'Phase 2', 'from_km', (v_phase_ranges -> 1 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 1 ->> 'toKm')::numeric, 'command', 'protect_leader'),
            'phase_3', jsonb_build_object('label', 'Phase 3', 'from_km', (v_phase_ranges -> 2 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 2 ->> 'toKm')::numeric, 'command', 'control_tempo'),
            'phase_4', jsonb_build_object('label', 'Phase 4', 'from_km', (v_phase_ranges -> 3 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 3 ->> 'toKm')::numeric, 'command', 'protect_leader')
          )

        else jsonb_build_object(
          'phase_1', jsonb_build_object('label', 'Phase 1', 'from_km', (v_phase_ranges -> 0 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 0 ->> 'toKm')::numeric, 'command', 'follow_team_plan'),
          'phase_2', jsonb_build_object('label', 'Phase 2', 'from_km', (v_phase_ranges -> 1 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 1 ->> 'toKm')::numeric, 'command', 'follow_team_plan'),
          'phase_3', jsonb_build_object('label', 'Phase 3', 'from_km', (v_phase_ranges -> 2 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 2 ->> 'toKm')::numeric, 'command', 'follow_team_plan'),
          'phase_4', jsonb_build_object('label', 'Phase 4', 'from_km', (v_phase_ranges -> 3 ->> 'fromKm')::numeric, 'to_km', (v_phase_ranges -> 3 ->> 'toKm')::numeric, 'command', 'follow_team_plan')
        )
      end as suggested_commands,

      jsonb_build_object(
        'gels', case when v_stage_kind = 'time_trial' then 0 when v_distance_km >= 130 then 3 else 2 end,
        'bidons', case when v_stage_kind = 'time_trial' then 0 when v_distance_km >= 130 or v_bad_weather = false then 3 else 2 end,
        'nutrition_packs', case when v_stage_kind = 'time_trial' then 0 when v_distance_km >= 90 then 1 else 0 end,
        'rain_jacket', case when v_stage_kind = 'time_trial' then false else v_bad_weather end,
        'race_jersey_complete', case when v_stage_kind = 'time_trial' then false else true end
      ) as suggested_supplies
    from assigned a
  )
  select
    coalesce(jsonb_object_agg(c.rider_id::text, c.suggested_role), '{}'::jsonb),
    coalesce(
      jsonb_object_agg(c.rider_id::text, c.default_equipment_setup_id::text)
        filter (where c.default_equipment_setup_id is not null),
      '{}'::jsonb
    ),
    coalesce(jsonb_object_agg(c.rider_id::text, c.suggested_supplies), '{}'::jsonb),
    coalesce(jsonb_object_agg(c.rider_id::text, c.suggested_commands), '{}'::jsonb),
    count(*)::integer
  into
    v_roles_json,
    v_equipment_json,
    v_supplies_json,
    v_individual_tactics_json,
    v_rider_count
  from commands c;

  if v_rider_count = 0 then
    return jsonb_build_object(
      'status', 'error',
      'code', 'no_riders_found',
      'message', 'No riders were found in the Race Plan for this race preparation.'
    );
  end if;

  v_team_tactic_json := jsonb_build_object(
    'plan', v_team_plan,
    'notes', 'Auto-filled by Sport Director suggestion. Review and click Save to store it.',
    'phase_count', 4,
    'stage_phase_ranges', v_phase_ranges,
    'is_time_trial_stage', v_stage_kind = 'time_trial',
    'is_team_time_trial_stage', v_stage_format = 'team_time_trial',
    'engine_model_version', 'sport_director_suggestion_v1',
    'suggestion_source', 'generate_stage_plan_sport_director_suggestion_v1',
    'individual_tactics_by_rider', v_individual_tactics_json
  );

  v_explanations := jsonb_build_array(
    'Stage profile detected as ' || v_stage_kind || '.',
    'Team tactic suggested as ' || v_team_plan || '.',
    'Rider roles were selected from Race Plan rider snapshots, weighted by stage profile, rider skills, fatigue and sharpness where available.',
    'Sport Director quality is ' || v_sport_director_quality || ' with accuracy factor ' || round(v_accuracy_factor * 100, 0)::text || '%.',
    'This suggestion is not saved automatically. Review it and click Save.'
  );

  return jsonb_build_object(
    'status', 'ok',
    'version', 'v24_sport_director_suggestion_v1',
    'safe_note', 'Suggestion only. No database rows were changed.',
    'race_preparation_id', p_race_preparation_id,
    'race_id', v_stage_plan.race_id,
    'stage_id', p_stage_id,
    'stage_number', v_stage_plan.stage_number,
    'stage_name', v_stage_name,
    'stage_kind', v_stage_kind,
    'profile', jsonb_build_object(
      'profile_type', v_profile_type,
      'terrain_type', v_terrain_type,
      'finish_type', v_finish_type,
      'stage_format', v_stage_format,
      'distance_km', v_distance_km,
      'elevation_gain_m', v_elevation_gain_m,
      'sprint_count', v_sprint_count,
      'kom_count', v_kom_count,
      'bad_weather', v_bad_weather
    ),
    'sport_director', jsonb_build_object(
      'assignment_id', v_sport_director.id,
      'staff_id', v_sport_director.staff_id,
      'role_type', v_sport_director.role_type,
      'name', coalesce(
        nullif(v_sport_director.staff_snapshot ->> 'staff_name', ''),
        nullif(v_sport_director.staff_snapshot ->> 'full_name', ''),
        nullif(v_sport_director.staff_snapshot ->> 'name', ''),
        'Sport Director'
      ),
      'level', v_sport_director_level,
      'quality', v_sport_director_quality,
      'accuracy_factor', v_accuracy_factor
    ),
    'suggestion', jsonb_build_object(
      'team_tactic_json', v_team_tactic_json,
      'rider_roles_json', v_roles_json,
      'rider_equipment_json', v_equipment_json,
      'rider_supplies_json', v_supplies_json,
      'rider_individual_tactics_json', v_individual_tactics_json
    ),
    'explanation', v_explanations
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_sport_director_quality_from_snapshot_v1(p_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_expertise numeric := public.jsonb_number_any_v1(p_snapshot, array['expertise'], 40);
  v_experience numeric := public.jsonb_number_any_v1(p_snapshot, array['experience'], 40);
  v_leadership numeric := public.jsonb_number_any_v1(p_snapshot, array['leadership'], 40);
  v_efficiency numeric := public.jsonb_number_any_v1(p_snapshot, array['efficiency'], 40);
  v_score numeric;
  v_level integer;
  v_quality text;
  v_accuracy numeric;
begin
  v_score :=
    v_expertise * 0.35 +
    v_experience * 0.25 +
    v_leadership * 0.25 +
    v_efficiency * 0.15;

  v_level :=
    case
      when v_score >= 80 then 5
      when v_score >= 68 then 4
      when v_score >= 55 then 3
      when v_score >= 42 then 2
      else 1
    end;

  v_quality :=
    case
      when v_level >= 5 then 'excellent'
      when v_level >= 4 then 'very_good'
      when v_level >= 3 then 'good'
      when v_level >= 2 then 'average'
      else 'basic'
    end;

  v_accuracy :=
    case
      when v_level >= 5 then 0.95
      when v_level >= 4 then 0.88
      when v_level >= 3 then 0.80
      when v_level >= 2 then 0.72
      else 0.65
    end;

  return jsonb_build_object(
    'score', round(v_score, 1),
    'level', v_level,
    'quality', v_quality,
    'accuracy_factor', v_accuracy,
    'expertise', v_expertise,
    'experience', v_experience,
    'leadership', v_leadership,
    'efficiency', v_efficiency
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_club_home_kit_v1(p_club_id uuid, p_image_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be authenticated to save a team jersey.';
  end if;

  if p_club_id is null then
    raise exception 'Club id is required.';
  end if;

  if nullif(btrim(coalesce(p_image_url, '')), '') is null then
    raise exception 'Jersey image URL is required.';
  end if;

  if not exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
      and c.owner_user_id = v_user_id
      and c.deleted_at is null
  ) then
    raise exception 'You can only save a jersey for your own active club.';
  end if;

  insert into public.team_kits (
    team_id,
    name,
    config,
    updated_at
  )
  values (
    p_club_id,
    'home',
    jsonb_build_object(
      'version', 1,
      'mode', 'generic_pool',
      'template', 'generic_pool',
      'image_url', p_image_url,
      'image_data_url', null,
      'source', 'create_club'
    ),
    now()
  )
  on conflict (team_id, name)
  do update
  set
    config = excluded.config,
    updated_at = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_due_user_emails_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_birthday_result jsonb;
begin
  v_birthday_result := public.process_birthday_gifts_v1(current_date);

  return jsonb_build_object(
    'ok', true,
    'birthday_result', v_birthday_result
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public._clubs_after_insert_seed_starter_equipment_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Prefer the safe wrapper if it exists.
  if to_regprocedure('public.equipment_seed_starter_inventory_for_club_safe(uuid)') is not null then
    perform public.equipment_seed_starter_inventory_for_club_safe(new.id);
  elsif to_regprocedure('public.equipment_seed_starter_inventory_for_club(uuid)') is not null then
    perform public.equipment_seed_starter_inventory_for_club(new.id);
  else
    raise exception 'Starter equipment seed function is missing';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_club_home_kit_config_v1(p_club_id uuid, p_config jsonb)
 RETURNS TABLE(id uuid, team_id uuid, name text, config jsonb, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_original_generic_url text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be authenticated to save a team jersey.';
  end if;

  if p_club_id is null then
    raise exception 'Club id is required.';
  end if;

  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'Jersey config must be a JSON object.';
  end if;

  if not exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
      and c.owner_user_id = v_user_id
      and c.deleted_at is null
  ) then
    raise exception 'You can only save a jersey for your own active club.';
  end if;

  v_original_generic_url :=
    nullif(btrim(coalesce(p_config ->> 'original_generic_image_url', '')), '');

  return query
  insert into public.team_kits as tk (
    team_id,
    name,
    config,
    updated_at
  )
  values (
    p_club_id,
    'home',
    jsonb_build_object(
      'version', 1,
      'template', coalesce(nullif(p_config ->> 'template', ''), 'image-kit'),
      'mode', coalesce(nullif(p_config ->> 'mode', ''), 'image_url'),
      'image_url', nullif(btrim(coalesce(p_config ->> 'image_url', '')), ''),
      'image_data_url', nullif(coalesce(p_config ->> 'image_data_url', ''), ''),
      'original_generic_image_url', v_original_generic_url,
      'source', coalesce(nullif(p_config ->> 'source', ''), 'customize_team')
    ),
    now()
  )
  on conflict on constraint team_kits_team_id_name_key
  do update
  set
    config = excluded.config,
    updated_at = now()
  returning
    tk.id,
    tk.team_id,
    tk.name,
    tk.config,
    tk.updated_at;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_objective_race_start_false_fail_guard_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_code text;
  v_progress jsonb;
  v_current_value integer;
  v_target_value integer;
  v_current_game_date date;
  v_due_date date;
  v_club_id uuid;
  v_payout_id uuid;
begin
  v_code := coalesce(new.objective_code, new.metadata->>'objective_code');

  if v_code not in (
    'race_start',
    'target_race_visibility',
    'country_visibility',
    'category_visibility',
    'season_country_starts',
    'season_category_starts'
  ) then
    return new;
  end if;

  if coalesce(new.objective_result_state, '') not in ('failed', 'missed') then
    return new;
  end if;

  begin
    select public.get_current_game_date_date()
    into v_current_game_date;
  exception when others then
    v_current_game_date := current_date;
  end;

  begin
    v_due_date := nullif(coalesce(
      new.metadata->>'target_check_game_date',
      new.metadata->>'eligible_to_game_date',
      new.metadata->>'contract_end_game_date'
    ), '')::date;
  exception when others then
    v_due_date := null;
  end;

  v_progress := public.sponsor_count_visibility_progress_v1(new.id, null);
  v_current_value := coalesce((v_progress->>'current_value')::integer, 0);
  v_target_value := greatest(1, coalesce((v_progress->>'target_value')::integer, new.target_value, 1));

  -- If progress proves the task was achieved, correct the false failure and pay.
  if v_current_value >= v_target_value then
    select cs.club_id
    into v_club_id
    from public.club_sponsors cs
    where cs.id = new.club_sponsor_id;

    if new.payout_transaction_id is null
       and coalesce(new.reward_amount, 0) > 0
       and v_club_id is not null then
      select public.finance_grant_sponsor_contract_payment(
        v_club_id,
        new.club_sponsor_id,
        new.reward_amount::bigint,
        jsonb_build_object(
          'source', 'sponsor_visibility_false_fail_guard',
          'reason', 'Prevented false failed visibility objective because qualifying race starts exist',
          'club_sponsor_id', new.club_sponsor_id::text,
          'objective_id', new.id::text,
          'objective_code', v_code,
          'progress', v_progress,
          'guard_applied_at', now()
        )
      )
      into v_payout_id;

      new.payout_transaction_id := v_payout_id;
    end if;

    new.current_value := v_current_value;
    new.check_state := 'checked';
    new.objective_result_state := 'completed';
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'visibility_false_fail_guard_applied', true,
        'guard_reason', 'Processor attempted to fail visibility objective, but qualifying starts existed',
        'guard_progress', v_progress,
        'guard_payout_transaction_id', coalesce(v_payout_id::text, new.payout_transaction_id::text),
        'guard_applied_at', now()
      );

    return new;
  end if;

  -- If it is not due yet, do not allow an early false failure.
  if v_due_date is not null and v_due_date > v_current_game_date then
    new.current_value := v_current_value;
    new.check_state := 'scheduled';
    new.objective_result_state := 'pending';
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'visibility_false_fail_guard_reverted_early_failure', true,
        'guard_reason', 'Visibility objective was marked failed before due date',
        'guard_progress', v_progress,
        'guard_due_date', v_due_date,
        'guard_current_game_date', v_current_game_date,
        'guard_applied_at', now()
      );

    return new;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_user_tutorial_progress_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_tutorial_progress_v1(p_tutorial_key text)
 RETURNS TABLE(tutorial_key text, status text, last_step_key text, started_at timestamp with time zone, completed_at timestamp with time zone, skipped_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_key text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be authenticated.';
  end if;

  v_key := lower(btrim(coalesce(p_tutorial_key, '')));

  if v_key = '' then
    raise exception 'Tutorial key is required.';
  end if;

  return query
  select
    p.tutorial_key,
    p.status,
    p.last_step_key,
    p.started_at,
    p.completed_at,
    p.skipped_at
  from public.user_tutorial_progress p
  where p.user_id = v_user_id
    and p.tutorial_key = v_key;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_my_tutorial_progress_v1(p_tutorial_key text, p_status text, p_last_step_key text DEFAULT NULL::text)
 RETURNS user_tutorial_progress
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_key text;
  v_status text;
  v_last_step_key text;
  v_row public.user_tutorial_progress;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be authenticated.';
  end if;

  v_key := lower(btrim(coalesce(p_tutorial_key, '')));
  v_status := lower(btrim(coalesce(p_status, '')));
  v_last_step_key := nullif(btrim(coalesce(p_last_step_key, '')), '');

  if v_key = '' then
    raise exception 'Tutorial key is required.';
  end if;

  if v_status not in ('not_started', 'started', 'completed', 'skipped') then
    raise exception 'Invalid tutorial status.';
  end if;

  insert into public.user_tutorial_progress (
    user_id,
    tutorial_key,
    status,
    last_step_key,
    started_at,
    completed_at,
    skipped_at
  )
  values (
    v_user_id,
    v_key,
    v_status,
    v_last_step_key,
    case when v_status = 'started' then now() else null end,
    case when v_status = 'completed' then now() else null end,
    case when v_status = 'skipped' then now() else null end
  )
  on conflict (user_id, tutorial_key)
  do update set
    status = excluded.status,
    last_step_key = excluded.last_step_key,
    started_at = case
      when excluded.status = 'started'
        then coalesce(public.user_tutorial_progress.started_at, now())
      else public.user_tutorial_progress.started_at
    end,
    completed_at = case
      when excluded.status = 'completed' then now()
      when excluded.status in ('not_started', 'started') then null
      else public.user_tutorial_progress.completed_at
    end,
    skipped_at = case
      when excluded.status = 'skipped' then now()
      when excluded.status in ('not_started', 'started') then null
      else public.user_tutorial_progress.skipped_at
    end
  returning * into v_row;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_calculate_bonus_reward_v1(p_bonus_pool_amount numeric, p_objective_code text, p_race_category text DEFAULT NULL::text, p_target_specificity text DEFAULT 'user_choice'::text, p_contract_months integer DEFAULT 12)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_min_pct numeric;
  v_max_pct numeric;
  v_pct numeric;
  v_category_multiplier numeric := 1.00;
  v_specificity_multiplier numeric := 1.00;
  v_time_multiplier numeric := 1.00;
  v_reward numeric;
  v_cap numeric;
begin
  select
    r.min_bonus_pool_pct,
    r.max_bonus_pool_pct
  into
    v_min_pct,
    v_max_pct
  from public.sponsor_bonus_objective_rules_v1 r
  where r.objective_code = p_objective_code;

  if v_min_pct is null then
    v_min_pct := 0.08;
    v_max_pct := 0.12;
  end if;

  v_pct := (v_min_pct + v_max_pct) / 2.0;

  v_category_multiplier := case
    when p_race_category in ('1.2', '2.2') then 0.75
    when p_race_category in ('1.1', '2.1') then 1.00
    when p_race_category ilike '%pro%' then 1.25
    when p_race_category ilike '%uwt%' then 1.50
    else 1.00
  end;

  v_specificity_multiplier := case
    when p_target_specificity in ('exact_race', 'sponsor_exact_race') then 1.15
    when p_target_specificity in ('exact_stage', 'sponsor_exact_stage') then 1.25
    else 1.00
  end;

  v_time_multiplier := case
    when coalesce(p_contract_months, 12) <= 2 then 0.55
    when coalesce(p_contract_months, 12) <= 6 then 0.70
    else 1.00
  end;

  v_reward :=
    coalesce(p_bonus_pool_amount, 0)
    * v_pct
    * v_category_multiplier
    * v_specificity_multiplier
    * v_time_multiplier;

  v_cap := coalesce(p_bonus_pool_amount, 0) * 0.60;

  if coalesce(p_bonus_pool_amount, 0) <= 0 then
    return 0;
  end if;

  return greatest(
    1000,
    least(round(v_reward), round(v_cap))
  )::bigint;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_suggest_visibility_target_value_v1(p_contract_start date, p_contract_end date, p_visibility_kind text, p_target_code text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_available integer := 0;
  v_days integer;
  v_target integer;
begin
  if p_contract_start is null or p_contract_end is null then
    return 1;
  end if;

  v_days := greatest(1, p_contract_end - p_contract_start + 1);

  if p_visibility_kind in ('target_race_visibility', 'race_start') then
    return 1;
  end if;

  if p_visibility_kind in ('country_visibility', 'season_country_starts') then
    select count(*)
    into v_available
    from public.races r
    where coalesce(r.end_date, r.start_date) between p_contract_start and p_contract_end
      and r.country_code = p_target_code;
  elsif p_visibility_kind in ('category_visibility', 'season_category_starts') then
    select count(*)
    into v_available
    from public.races r
    where coalesce(r.end_date, r.start_date) between p_contract_start and p_contract_end
      and r.category = p_target_code;
  else
    return 1;
  end if;

  if v_available <= 0 then
    return 1;
  end if;

  v_target := case
    when v_days <= 70 then least(2, greatest(1, ceil(v_available * 0.25)::integer))
    when v_days <= 180 then least(4, greatest(1, ceil(v_available * 0.30)::integer))
    else least(8, greatest(1, ceil(v_available * 0.35)::integer))
  end;

  return greatest(1, v_target);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_count_visibility_progress_v1(p_objective_id uuid, p_until_race_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club_id uuid; v_objective_code text; v_metadata_code text; v_target_value integer:=1;
  v_target_race_text text; v_target_race_id uuid; v_target_country_code text; v_target_category text;
  v_from_text text; v_to_text text; v_from_date date; v_to_date date; v_until_date date;
  v_current_value integer:=0; v_rider_rows integer:=0; v_races jsonb:='[]'::jsonb;
begin
  select cs.club_id,o.objective_code,o.metadata->>'objective_code',coalesce(o.target_value,1),
         coalesce(o.metadata->>'target_race_id',to_jsonb(o)->>'target_race_id'),
         coalesce(o.metadata->>'target_country_code',o.metadata->>'target_race_country',to_jsonb(o)->>'country_code'),
         coalesce(o.metadata->>'target_category',o.metadata->>'target_race_category'),
         coalesce(to_jsonb(o)->>'eligible_from_game_date',o.metadata->>'eligible_from_game_date',o.metadata->>'contract_start_game_date'),
         coalesce(to_jsonb(o)->>'eligible_to_game_date',o.metadata->>'eligible_to_game_date',o.metadata->>'target_check_game_date',o.metadata->>'contract_end_game_date')
  into v_club_id,v_objective_code,v_metadata_code,v_target_value,v_target_race_text,v_target_country_code,v_target_category,v_from_text,v_to_text
  from public.club_sponsor_objectives o join public.club_sponsors cs on cs.id=o.club_sponsor_id where o.id=p_objective_id;
  if v_club_id is null then return jsonb_build_object('objective_id',p_objective_id::text,'error','objective_not_found','current_value',0,'target_value',1); end if;

  -- Preview objective rows retain their semantic code in metadata.
  if v_metadata_code in ('race_start','target_race_visibility','country_visibility','season_country_starts','category_visibility','season_category_starts') then
    v_objective_code:=v_metadata_code;
  elsif v_objective_code ilike '%target_race_visibility%' then
    v_objective_code:='target_race_visibility';
  elsif v_objective_code ilike '%category_visibility%' then
    v_objective_code:='category_visibility';
  end if;

  begin if nullif(v_target_race_text,'') is not null then v_target_race_id:=v_target_race_text::uuid; end if; exception when others then v_target_race_id:=null; end;
  begin if nullif(v_from_text,'') is not null then v_from_date:=v_from_text::date; end if; exception when others then v_from_date:=null; end;
  begin if nullif(v_to_text,'') is not null then v_to_date:=v_to_text::date; end if; exception when others then v_to_date:=null; end;
  if p_until_race_id is not null then select coalesce(r.end_date,r.start_date) into v_until_date from public.races r where r.id=p_until_race_id; end if;
  if v_until_date is null then v_until_date:=public.get_current_game_date_date(); end if;

  with eligible_clubs as (
    select v_club_id as club_id union select c.id from public.clubs c where c.parent_club_id=v_club_id and c.club_type='developing'
  ), qualifying as (
    select rpt.race_id,max(r.name) race_name,max(r.country_code) country_code,max(r.category) category,
           max(coalesce(r.end_date,r.start_date)) race_date,
           (select count(*) from public.race_participant_riders_v1 rpr where rpr.race_id=rpt.race_id and rpr.club_id in(select club_id from eligible_clubs))::int rider_rows
    from public.race_participant_teams_v1 rpt join public.races r on r.id=rpt.race_id
    where rpt.club_id in(select club_id from eligible_clubs)
      and coalesce(r.end_date,r.start_date)<=v_until_date
      and (v_from_date is null or coalesce(r.end_date,r.start_date)>=v_from_date)
      and (v_to_date is null or coalesce(r.end_date,r.start_date)<=v_to_date)
      and (
        (v_objective_code in ('race_start','target_race_visibility') and v_target_race_id is not null and rpt.race_id=v_target_race_id)
        or (v_objective_code in ('country_visibility','season_country_starts') and v_target_country_code is not null and r.country_code=v_target_country_code)
        or (v_objective_code in ('category_visibility','season_category_starts') and v_target_category is not null and r.category=v_target_category)
      )
    group by rpt.race_id
  )
  select count(*)::int,coalesce(sum(q.rider_rows),0)::int,
         coalesce(jsonb_agg(jsonb_build_object('race_id',q.race_id::text,'race_name',q.race_name,'race_date',q.race_date,'country_code',q.country_code,'category',q.category,'rider_rows',q.rider_rows) order by q.race_date),'[]'::jsonb)
  into v_current_value,v_rider_rows,v_races from qualifying q;
  return jsonb_build_object('objective_id',p_objective_id::text,'objective_code',v_objective_code,'club_id',v_club_id::text,
    'target_value',greatest(1,coalesce(v_target_value,1)),'current_value',coalesce(v_current_value,0),'participant_found',coalesce(v_current_value,0)>0,
    'rider_rows',coalesce(v_rider_rows,0),'target_race_id',v_target_race_id::text,'target_country_code',v_target_country_code,
    'target_category',v_target_category,'until_date',v_until_date,'qualifying_races',v_races);
end;$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_process_visibility_objectives_for_race_v1(p_race_id uuid, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_date date;
  v_race_country text;
  v_race_category text;
  v_results jsonb := '[]'::jsonb;
  rec record;
  v_progress jsonb;
  v_current_value integer;
  v_target_value integer;
  v_completed boolean;
  v_due boolean;
  v_target_check_date date;
  v_payout_id uuid;
begin
  select
    coalesce(r.end_date, r.start_date),
    r.country_code,
    r.category
  into
    v_race_date,
    v_race_country,
    v_race_category
  from public.races r
  where r.id = p_race_id;

  if v_race_date is null then
    return jsonb_build_object(
      'status', 'error',
      'message', 'race_not_found',
      'race_id', p_race_id::text
    );
  end if;

  for rec in
    select
      o.id as objective_id,
      o.club_sponsor_id,
      cs.club_id,
      cs.name as sponsor_name,
      o.objective_code,
      o.reward_amount,
      o.target_value,
      o.current_value,
      o.check_state,
      o.objective_result_state,
      o.payout_transaction_id,
      o.metadata,
      nullif(coalesce(o.metadata->>'target_race_id', to_jsonb(o)->>'target_race_id'), '') as target_race_id_text,
      coalesce(o.metadata->>'target_country_code', o.metadata->>'target_race_country', to_jsonb(o)->>'country_code') as target_country_code,
      coalesce(o.metadata->>'target_category', o.metadata->>'target_race_category') as target_category,
      nullif(coalesce(o.metadata->>'target_check_game_date', o.metadata->>'eligible_to_game_date'), '') as target_check_date_text
    from public.club_sponsor_objectives o
    join public.club_sponsors cs
      on cs.id = o.club_sponsor_id
    where cs.status = 'active'
      and o.objective_code in (
        'race_start',
        'target_race_visibility',
        'country_visibility',
        'category_visibility',
        'season_country_starts',
        'season_category_starts'
      )
      and coalesce(o.objective_result_state, 'pending') <> 'completed'
      and coalesce(o.status, 'active') = 'active'
      and (
        (
          o.objective_code in ('race_start', 'target_race_visibility')
          and nullif(coalesce(o.metadata->>'target_race_id', to_jsonb(o)->>'target_race_id'), '') = p_race_id::text
        )
        or (
          o.objective_code in ('country_visibility', 'season_country_starts')
          and coalesce(o.metadata->>'target_country_code', o.metadata->>'target_race_country', to_jsonb(o)->>'country_code') = v_race_country
        )
        or (
          o.objective_code in ('category_visibility', 'season_category_starts')
          and coalesce(o.metadata->>'target_category', o.metadata->>'target_race_category') = v_race_category
        )
        or (
          nullif(coalesce(o.metadata->>'target_check_game_date', o.metadata->>'eligible_to_game_date'), '') is not null
          and nullif(coalesce(o.metadata->>'target_check_game_date', o.metadata->>'eligible_to_game_date'), '')::date <= v_race_date
        )
      )
  loop
    v_progress := public.sponsor_count_visibility_progress_v1(rec.objective_id, p_race_id);
    v_current_value := coalesce((v_progress->>'current_value')::integer, 0);
    v_target_value := greatest(1, coalesce((v_progress->>'target_value')::integer, rec.target_value, 1));
    v_completed := v_current_value >= v_target_value;

    begin
      v_target_check_date := rec.target_check_date_text::date;
    exception when others then
      v_target_check_date := null;
    end;

    v_due :=
      (
        rec.objective_code in ('race_start', 'target_race_visibility')
        and rec.target_race_id_text = p_race_id::text
      )
      or (
        v_target_check_date is not null
        and v_race_date >= v_target_check_date
      );

    v_payout_id := rec.payout_transaction_id;

    if v_completed then
      if not p_dry_run
         and v_payout_id is null
         and coalesce(rec.reward_amount, 0) > 0 then
        select public.finance_grant_sponsor_contract_payment(
          rec.club_id,
          rec.club_sponsor_id,
          rec.reward_amount::bigint,
          jsonb_build_object(
            'source', 'sponsor_visibility_objective_processor',
            'club_sponsor_id', rec.club_sponsor_id::text,
            'sponsor_name', rec.sponsor_name,
            'objective_id', rec.objective_id::text,
            'objective_code', rec.objective_code,
            'race_id', p_race_id::text,
            'reward_amount', rec.reward_amount,
            'progress', v_progress,
            'processed_at', now()
          )
        )
        into v_payout_id;
      end if;

      if not p_dry_run then
        update public.club_sponsor_objectives
        set
          current_value = v_current_value,
          check_state = 'checked',
          objective_result_state = 'completed',
          payout_transaction_id = coalesce(v_payout_id, payout_transaction_id),
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object(
              'last_visibility_progress', v_progress,
              'visibility_processor_completed', true,
              'visibility_processor_race_id', p_race_id::text,
              'visibility_processor_payout_transaction_id', coalesce(v_payout_id::text, null),
              'visibility_processor_checked_at', now()
            ),
          updated_at = now()
        where id = rec.objective_id;
      end if;

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'objective_id', rec.objective_id::text,
          'objective_code', rec.objective_code,
          'result', 'completed',
          'current_value', v_current_value,
          'target_value', v_target_value,
          'payout_transaction_id', coalesce(v_payout_id::text, null),
          'dry_run', p_dry_run
        )
      );

    elsif v_due then
      if not p_dry_run then
        update public.club_sponsor_objectives
        set
          current_value = v_current_value,
          check_state = 'checked',
          objective_result_state = 'failed',
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object(
              'last_visibility_progress', v_progress,
              'visibility_processor_failed', true,
              'visibility_processor_race_id', p_race_id::text,
              'visibility_processor_checked_at', now()
            ),
          updated_at = now()
        where id = rec.objective_id;
      end if;

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'objective_id', rec.objective_id::text,
          'objective_code', rec.objective_code,
          'result', 'failed',
          'current_value', v_current_value,
          'target_value', v_target_value,
          'dry_run', p_dry_run
        )
      );

    else
      if not p_dry_run then
        update public.club_sponsor_objectives
        set
          current_value = greatest(coalesce(current_value, 0), v_current_value),
          check_state = 'scheduled',
          objective_result_state = 'pending',
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object(
              'last_visibility_progress', v_progress,
              'visibility_processor_progress_updated', true,
              'visibility_processor_race_id', p_race_id::text,
              'visibility_processor_checked_at', now()
            ),
          updated_at = now()
        where id = rec.objective_id;
      end if;

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'objective_id', rec.objective_id::text,
          'objective_code', rec.objective_code,
          'result', 'progress_updated',
          'current_value', v_current_value,
          'target_value', v_target_value,
          'dry_run', p_dry_run
        )
      );
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'race_id', p_race_id::text,
    'race_date', v_race_date,
    'processed_count', jsonb_array_length(v_results),
    'results', v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_sponsor_process_visibility_objectives_after_race_status_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if lower(coalesce(new.status::text, '')) in (
    'finished',
    'completed',
    'finalized',
    'results_published',
    'done',
    'simulated'
  ) then
    perform public.sponsor_process_visibility_objectives_for_race_v1(new.id, false);
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_offer_visibility_preview_normalizer_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game_date date;
  v_contract_start date;
  v_contract_end date;
  v_months integer;
  v_bonus_pool numeric;
  v_selector integer;

  v_existing_clean jsonb := '[]'::jsonb;
  v_visibility_objective jsonb := null;

  v_race_id uuid;
  v_race_name text;
  v_race_start date;
  v_race_end date;
  v_race_country text;
  v_race_category text;
  v_race_type text;

  v_country_code text;
  v_country_race_count integer;
  v_country_target_value integer;
  v_country_reward bigint;

  v_category text;
  v_category_race_count integer;
  v_category_target_value integer;
  v_category_reward bigint;

  v_exact_reward bigint;
begin
  -- Only normalize open main sponsor offers.
  if coalesce(new.sponsor_kind, '') <> 'main'
     or coalesce(new.status, '') <> 'offered' then
    return new;
  end if;

  -- Resolve current game date safely.
  begin
    select public.get_current_game_date_date()
      into v_game_date;
  exception when others then
    begin
      select make_date(2000, public.get_current_game_month(), 1)
        into v_game_date;
    exception when others then
      v_game_date := date '2000-01-01';
    end;
  end;

  v_months := greatest(1, least(12, coalesce(new.coverage_months, 12)));
  v_bonus_pool := greatest(0, coalesce(new.bonus_pool_amount, 0));

  v_contract_start := v_game_date;
  v_contract_end := least(
    date '2000-12-31',
    (
      v_contract_start
      + (v_months::text || ' months')::interval
      - interval '1 day'
    )::date
  );

  -- Remove old visibility objectives and disabled race_finish from preview.
  -- Keep other non-visibility/result objectives generated by the existing system.
  select coalesce(jsonb_agg(e.obj), '[]'::jsonb)
  into v_existing_clean
  from jsonb_array_elements(
    coalesce(new.metadata->'preview_objectives', '[]'::jsonb)
  ) as e(obj)
  where coalesce(e.obj->>'objective_code', e.obj->>'required_result', '') not in (
    'race_start',
    'target_race_visibility',
    'country_visibility',
    'category_visibility',
    'season_country_starts',
    'season_category_starts',
    'race_finish'
  );

  -- Pick one future race during contract window for exact visibility.
  select
    r.id,
    r.name,
    r.start_date,
    r.end_date,
    r.country_code,
    r.category,
    r.race_type
  into
    v_race_id,
    v_race_name,
    v_race_start,
    v_race_end,
    v_race_country,
    v_race_category,
    v_race_type
  from public.races r
  where coalesce(r.end_date, r.start_date) between v_contract_start and v_contract_end
    and lower(coalesce(r.status::text, 'scheduled')) not in (
      'finished',
      'completed',
      'finalized',
      'results_published',
      'done',
      'simulated'
    )
  order by md5(r.id::text || coalesce(new.id::text, random()::text))
  limit 1;

  -- Pick one sponsor target country with available races.
  select
    x.country_code,
    x.race_count
  into
    v_country_code,
    v_country_race_count
  from (
    select
      r.country_code,
      count(*)::integer as race_count
    from public.races r
    where coalesce(r.end_date, r.start_date) between v_contract_start and v_contract_end
      and r.country_code is not null
      and lower(coalesce(r.status::text, 'scheduled')) not in (
        'finished',
        'completed',
        'finalized',
        'results_published',
        'done',
        'simulated'
      )
    group by r.country_code
  ) x
  order by md5(x.country_code || coalesce(new.id::text, random()::text))
  limit 1;

  -- Pick one sponsor target category with available races.
  select
    x.category,
    x.race_count
  into
    v_category,
    v_category_race_count
  from (
    select
      r.category,
      count(*)::integer as race_count
    from public.races r
    where coalesce(r.end_date, r.start_date) between v_contract_start and v_contract_end
      and r.category is not null
      and lower(coalesce(r.status::text, 'scheduled')) not in (
        'finished',
        'completed',
        'finalized',
        'results_published',
        'done',
        'simulated'
      )
    group by r.category
  ) x
  order by md5(x.category || coalesce(new.id::text, random()::text))
  limit 1;

  -- Deterministic spread between exact race / country / category visibility.
  v_selector := mod(abs(hashtext(coalesce(new.id::text, random()::text))), 3);

  -- Option 0: exact race visibility.
  if v_selector = 0 and v_race_id is not null then
    v_exact_reward := public.sponsor_calculate_bonus_reward_v1(
      v_bonus_pool,
      'target_race_visibility',
      v_race_category,
      'sponsor_exact_race',
      v_months
    );

    v_visibility_objective := jsonb_build_object(
      'objective_code', 'target_race_visibility',
      'required_result', 'target_race_visibility',
      'title', 'Sponsor visibility in ' || v_race_name,
      'description', 'Start the sponsor-selected race: ' || v_race_name || '. Your main team or development team must appear on the race start list.',
      'reward_label', '$' || v_exact_reward::text,
      'estimated_reward_amount', v_exact_reward,
      'reward_amount', v_exact_reward,
      'target_value', 1,
      'current_value', 0,
      'target_race_id', v_race_id::text,
      'target_race_name', v_race_name,
      'target_country_code', v_race_country,
      'target_category', v_race_category,
      'target_race_type', v_race_type,
      'target_race_start_date', v_race_start::text,
      'target_race_end_date', coalesce(v_race_end, v_race_start)::text,
      'target_check_game_date', coalesce(v_race_end, v_race_start)::text,
      'check_date', coalesce(v_race_end, v_race_start)::text,
      'eligible_from_game_date', v_contract_start::text,
      'eligible_to_game_date', v_contract_end::text,
      'evaluation_mode', 'race_finalized',
      'progress_source', 'race_participation',
      'objective_target_mode', 'specific_race',
      'sponsor_target_owner', 'sponsor_exact_race',
      'manager_choice_scope', 'no_choice_exact_race',
      'balanced_by_rules_v1', true
    );

  -- Option 1: country visibility.
  elsif v_selector = 1 and v_country_code is not null then
    v_country_target_value := public.sponsor_suggest_visibility_target_value_v1(
      v_contract_start,
      v_contract_end,
      'country_visibility',
      v_country_code
    );

    v_country_reward := public.sponsor_calculate_bonus_reward_v1(
      v_bonus_pool,
      'country_visibility',
      null,
      'user_choice',
      v_months
    );

    v_visibility_objective := jsonb_build_object(
      'objective_code', 'country_visibility',
      'required_result', 'country_visibility',
      'title', 'Race in ' || v_country_code,
      'description', 'Start ' || v_country_target_value::text || ' race(s) in ' || v_country_code || ' before the sponsor contract ends. You can choose any qualifying race.',
      'reward_label', '$' || v_country_reward::text,
      'estimated_reward_amount', v_country_reward,
      'reward_amount', v_country_reward,
      'target_value', v_country_target_value,
      'current_value', 0,
      'target_country_code', v_country_code,
      'available_qualifying_races', coalesce(v_country_race_count, 0),
      'target_check_game_date', v_contract_end::text,
      'check_date', v_contract_end::text,
      'eligible_from_game_date', v_contract_start::text,
      'eligible_to_game_date', v_contract_end::text,
      'evaluation_mode', 'race_finalized',
      'progress_source', 'race_participation',
      'objective_target_mode', 'country_visibility',
      'sponsor_target_owner', 'sponsor_country',
      'manager_choice_scope', 'manager_chooses_qualifying_races',
      'balanced_by_rules_v1', true
    );

  -- Option 2: category visibility.
  elsif v_selector = 2 and v_category is not null then
    v_category_target_value := public.sponsor_suggest_visibility_target_value_v1(
      v_contract_start,
      v_contract_end,
      'category_visibility',
      v_category
    );

    v_category_reward := public.sponsor_calculate_bonus_reward_v1(
      v_bonus_pool,
      'category_visibility',
      v_category,
      'user_choice',
      v_months
    );

    v_visibility_objective := jsonb_build_object(
      'objective_code', 'category_visibility',
      'required_result', 'category_visibility',
      'title', 'Start ' || v_category || ' races',
      'description', 'Start ' || v_category_target_value::text || ' race(s) of category ' || v_category || ' before the sponsor contract ends. You can choose any qualifying race.',
      'reward_label', '$' || v_category_reward::text,
      'estimated_reward_amount', v_category_reward,
      'reward_amount', v_category_reward,
      'target_value', v_category_target_value,
      'current_value', 0,
      'target_category', v_category,
      'available_qualifying_races', coalesce(v_category_race_count, 0),
      'target_check_game_date', v_contract_end::text,
      'check_date', v_contract_end::text,
      'eligible_from_game_date', v_contract_start::text,
      'eligible_to_game_date', v_contract_end::text,
      'evaluation_mode', 'race_finalized',
      'progress_source', 'race_participation',
      'objective_target_mode', 'category_visibility',
      'sponsor_target_owner', 'sponsor_category',
      'manager_choice_scope', 'manager_chooses_qualifying_races',
      'balanced_by_rules_v1', true
    );
  end if;

  -- Fallback to exact race if selector target was unavailable.
  if v_visibility_objective is null and v_race_id is not null then
    v_exact_reward := public.sponsor_calculate_bonus_reward_v1(
      v_bonus_pool,
      'target_race_visibility',
      v_race_category,
      'sponsor_exact_race',
      v_months
    );

    v_visibility_objective := jsonb_build_object(
      'objective_code', 'target_race_visibility',
      'required_result', 'target_race_visibility',
      'title', 'Sponsor visibility in ' || v_race_name,
      'description', 'Start the sponsor-selected race: ' || v_race_name || '.',
      'reward_label', '$' || v_exact_reward::text,
      'estimated_reward_amount', v_exact_reward,
      'reward_amount', v_exact_reward,
      'target_value', 1,
      'current_value', 0,
      'target_race_id', v_race_id::text,
      'target_race_name', v_race_name,
      'target_country_code', v_race_country,
      'target_category', v_race_category,
      'target_race_type', v_race_type,
      'target_race_start_date', v_race_start::text,
      'target_race_end_date', coalesce(v_race_end, v_race_start)::text,
      'target_check_game_date', coalesce(v_race_end, v_race_start)::text,
      'check_date', coalesce(v_race_end, v_race_start)::text,
      'eligible_from_game_date', v_contract_start::text,
      'eligible_to_game_date', v_contract_end::text,
      'evaluation_mode', 'race_finalized',
      'progress_source', 'race_participation',
      'objective_target_mode', 'specific_race',
      'sponsor_target_owner', 'sponsor_exact_race',
      'manager_choice_scope', 'no_choice_exact_race',
      'balanced_by_rules_v1', true,
      'fallback_objective', true
    );
  end if;

  new.metadata := coalesce(new.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'visibility_preview_normalized_version', 'v1',
      'visibility_preview_contract_start', v_contract_start::text,
      'visibility_preview_contract_end', v_contract_end::text,
      'visibility_preview_coverage_months', v_months,
      'visibility_preview_normalized_at', now(),
      'race_finish_generation_disabled', true,
      'preview_objectives',
        case
          when v_visibility_objective is null then v_existing_clean
          else jsonb_build_array(v_visibility_objective) || v_existing_clean
        end
    );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_sync_signed_offer_preview_objectives_v1(p_club_sponsor_id uuid, p_offer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sponsor record;
  v_offer record;
  v_offer_id uuid;
  v_preview_objectives jsonb := '[]'::jsonb;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;

  obj jsonb;
  v_code text;
  v_title text;
  v_reward_amount numeric;
  v_target_value integer;
  v_current_value integer;
  v_country_code text;
  v_objective_id uuid;
  v_objective_key text;
begin
  select
    cs.*,
    to_jsonb(cs) as sponsor_json
  into v_sponsor
  from public.club_sponsors cs
  where cs.id = p_club_sponsor_id;

  if v_sponsor.id is null then
    return jsonb_build_object(
      'status', 'error',
      'message', 'club_sponsor_not_found',
      'club_sponsor_id', p_club_sponsor_id::text
    );
  end if;

  v_offer_id := p_offer_id;

  -- Try to resolve source offer id from sponsor metadata/json if present.
  if v_offer_id is null then
    begin
      v_offer_id := nullif(coalesce(
        v_sponsor.sponsor_json->>'offer_id',
        v_sponsor.sponsor_json->>'source_offer_id',
        v_sponsor.sponsor_json->'metadata'->>'offer_id',
        v_sponsor.sponsor_json->'metadata'->>'source_offer_id'
      ), '')::uuid;
    exception when others then
      v_offer_id := null;
    end;
  end if;

  -- If no explicit offer id, find the latest accepted/offered matching offer
  -- for this sponsor/company/club.
  if v_offer_id is null then
    select o.id
    into v_offer_id
    from public.club_sponsor_offers o
    left join public.sponsor_companies sc
      on sc.id = o.company_id
    where o.club_id = v_sponsor.club_id
      and o.sponsor_kind = v_sponsor.sponsor_kind
      and o.status in ('accepted', 'offered')
      and (
        sc.name = v_sponsor.name
        or o.id::text = coalesce(
          v_sponsor.sponsor_json->>'offer_id',
          v_sponsor.sponsor_json->>'source_offer_id',
          v_sponsor.sponsor_json->'metadata'->>'offer_id',
          v_sponsor.sponsor_json->'metadata'->>'source_offer_id'
        )
      )
    order by
      case o.status when 'accepted' then 0 else 1 end,
      o.updated_at desc nulls last,
      o.created_at desc nulls last
    limit 1;
  end if;

  if v_offer_id is null then
    return jsonb_build_object(
      'status', 'skipped',
      'message', 'source_offer_not_found',
      'club_sponsor_id', p_club_sponsor_id::text,
      'sponsor_name', v_sponsor.name
    );
  end if;

  select
    o.*,
    to_jsonb(o) as offer_json
  into v_offer
  from public.club_sponsor_offers o
  where o.id = v_offer_id;

  if v_offer.id is null then
    return jsonb_build_object(
      'status', 'error',
      'message', 'offer_id_not_found',
      'offer_id', v_offer_id::text
    );
  end if;

  v_preview_objectives := coalesce(v_offer.metadata->'preview_objectives', '[]'::jsonb);

  if jsonb_typeof(v_preview_objectives) is distinct from 'array' then
    return jsonb_build_object(
      'status', 'skipped',
      'message', 'preview_objectives_not_array',
      'offer_id', v_offer_id::text
    );
  end if;

  for obj in
    select value
    from jsonb_array_elements(v_preview_objectives)
  loop
    v_code := nullif(coalesce(
      obj->>'objective_code',
      obj->>'required_result'
    ), '');

    -- Disabled by design.
    if v_code is null or v_code = 'race_finish' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_title := coalesce(
      nullif(obj->>'title', ''),
      v_code
    );

    begin
      v_reward_amount := coalesce(
        nullif(obj->>'reward_amount', '')::numeric,
        nullif(obj->>'estimated_reward_amount', '')::numeric,
        0
      );
    exception when others then
      v_reward_amount := 0;
    end;

    begin
      v_target_value := greatest(1, coalesce(nullif(obj->>'target_value', '')::integer, 1));
    exception when others then
      v_target_value := 1;
    end;

    begin
      v_current_value := greatest(0, coalesce(nullif(obj->>'current_value', '')::integer, 0));
    exception when others then
      v_current_value := 0;
    end;

    v_country_code := nullif(coalesce(
      obj->>'target_country_code',
      obj->>'target_race_country',
      obj->>'country_code'
    ), '');

    v_objective_key := md5(
      v_code || '|' ||
      coalesce(obj->>'target_race_id', '') || '|' ||
      coalesce(obj->>'target_country_code', '') || '|' ||
      coalesce(obj->>'target_category', '') || '|' ||
      coalesce(obj->>'target_check_game_date', '') || '|' ||
      coalesce(obj->>'title', '')
    );

    select o.id
    into v_objective_id
    from public.club_sponsor_objectives o
    where o.club_sponsor_id = p_club_sponsor_id
      and (
        o.metadata->>'source_offer_objective_key' = v_objective_key
        or (
          o.objective_code = v_code
          and coalesce(o.metadata->>'target_race_id', '') = coalesce(obj->>'target_race_id', '')
          and coalesce(o.metadata->>'target_country_code', '') = coalesce(obj->>'target_country_code', '')
          and coalesce(o.metadata->>'target_category', '') = coalesce(obj->>'target_category', '')
        )
      )
    order by o.created_at desc nulls last
    limit 1;

    if v_objective_id is null then
      insert into public.club_sponsor_objectives (
        club_sponsor_id,
        objective_code,
        title,
        reward_amount,
        target_value,
        current_value,
        country_code,
        status,
        check_state,
        objective_result_state,
        metadata
      )
      values (
        p_club_sponsor_id,
        v_code,
        v_title,
        v_reward_amount,
        v_target_value,
        v_current_value,
        v_country_code,
        'active',
        'scheduled',
        'pending',
        obj
          || jsonb_build_object(
            'synced_from_offer_preview_v1', true,
            'source_offer_id', v_offer_id::text,
            'source_offer_objective_key', v_objective_key,
            'club_sponsor_id', p_club_sponsor_id::text,
            'synced_at', now()
          )
      )
      returning id into v_objective_id;

      v_inserted := v_inserted + 1;
    else
      update public.club_sponsor_objectives
      set
        objective_code = v_code,
        title = v_title,
        reward_amount = v_reward_amount,
        target_value = v_target_value,
        current_value = v_current_value,
        country_code = v_country_code,
        status = 'active',
        check_state = case
          when objective_result_state = 'completed' then check_state
          else 'scheduled'
        end,
        objective_result_state = case
          when objective_result_state = 'completed' then objective_result_state
          else 'pending'
        end,
        metadata = coalesce(metadata, '{}'::jsonb)
          || obj
          || jsonb_build_object(
            'synced_from_offer_preview_v1', true,
            'source_offer_id', v_offer_id::text,
            'source_offer_objective_key', v_objective_key,
            'club_sponsor_id', p_club_sponsor_id::text,
            'resynced_at', now()
          ),
        updated_at = now()
      where id = v_objective_id;

      v_updated := v_updated + 1;
    end if;

    -- Optional physical columns, if your schema has them.
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'club_sponsor_objectives'
        and column_name = 'target_race_id'
    ) and nullif(obj->>'target_race_id', '') is not null then
      execute 'update public.club_sponsor_objectives set target_race_id = $1 where id = $2'
      using (obj->>'target_race_id')::uuid, v_objective_id;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'club_sponsor_objectives'
        and column_name = 'target_race_name'
    ) then
      execute 'update public.club_sponsor_objectives set target_race_name = $1 where id = $2'
      using nullif(obj->>'target_race_name', ''), v_objective_id;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'club_sponsor_objectives'
        and column_name = 'target_check_game_date'
    ) then
      execute 'update public.club_sponsor_objectives set target_check_game_date = $1 where id = $2'
      using nullif(coalesce(obj->>'target_check_game_date', obj->>'check_date'), '')::date, v_objective_id;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'club_sponsor_objectives'
        and column_name = 'required_result'
    ) then
      execute 'update public.club_sponsor_objectives set required_result = $1 where id = $2'
      using coalesce(obj->>'required_result', v_code), v_objective_id;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'club_sponsor_id', p_club_sponsor_id::text,
    'sponsor_name', v_sponsor.name,
    'offer_id', v_offer_id::text,
    'preview_objective_count', jsonb_array_length(v_preview_objectives),
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', v_skipped
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_sponsor_sync_signed_offer_preview_objectives_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(new.status, '') = 'active'
     and coalesce(new.sponsor_kind, '') = 'main' then
    perform public.sponsor_sync_signed_offer_preview_objectives_v1(new.id, null);
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_objective_completed_state_preserve_guard_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.objective_result_state = 'completed' then
    new.objective_result_state := 'completed';
    new.check_state := 'checked';

    new.current_value := greatest(
      coalesce(new.current_value, 0),
      coalesce(old.current_value, 0),
      coalesce(new.target_value, 0),
      coalesce(old.target_value, 0),
      1
    );

    new.payout_transaction_id := coalesce(
      new.payout_transaction_id,
      old.payout_transaction_id
    );

    -- Do not let a later offer-preview sync reduce the completed reward.
    new.reward_amount := greatest(
      coalesce(new.reward_amount, 0),
      coalesce(old.reward_amount, 0)
    );

    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'completed_state_preserve_guard_applied', true,
        'completed_state_preserve_guard_reason', 'Prevented completed objective from being reverted by a later sync/update',
        'completed_state_preserve_guard_at', now()
      );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_main_sponsor_objective_result_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result_state text;
  v_old_result_state text;

  v_notification_code text;
  v_event_state text;
  v_event_key text;

  v_club_sponsor_json jsonb;
  v_sponsor_kind text;
  v_company_id_text text;
  v_club_id uuid;
  v_owner_user_id uuid;
  v_sponsor_name text := 'Main sponsor';

  v_title text;
  v_message text;
  v_action_url text := '#/dashboard/finance?tab=sponsors';
begin
  -- Only act on real final result transitions.
  v_result_state := lower(coalesce(
    nullif(new.objective_result_state, ''),
    nullif(new.status, ''),
    nullif(new.check_state, ''),
    ''
  ));

  v_old_result_state := lower(coalesce(
    nullif(old.objective_result_state, ''),
    nullif(old.status, ''),
    nullif(old.check_state, ''),
    ''
  ));

  -- Achieved if result state says achieved/completed/success/paid
  -- or if a payout transaction has just appeared.
  if (
    v_result_state in ('achieved', 'completed', 'complete', 'success', 'succeeded', 'paid')
    or (old.payout_transaction_id is null and new.payout_transaction_id is not null)
  ) then
    v_notification_code := 'MAIN_SPONSOR_OBJECTIVE_ACHIEVED';
    v_event_state := 'achieved';

  -- Failed if result state says failed/missed/not achieved
  -- or if failed_reason has just appeared.
  elsif (
    v_result_state in ('failed', 'missed', 'not_achieved', 'not_completed', 'expired_failed')
    or (old.failed_reason is null and new.failed_reason is not null)
  ) then
    v_notification_code := 'MAIN_SPONSOR_OBJECTIVE_FAILED';
    v_event_state := 'failed';

  else
    return new;
  end if;

  -- Avoid repeats when the row is updated again after final result.
  if v_event_state = 'achieved'
    and old.payout_transaction_id is not null
    and new.payout_transaction_id is not distinct from old.payout_transaction_id
    and v_old_result_state = v_result_state then
    return new;
  end if;

  if v_event_state = 'failed'
    and old.failed_reason is not null
    and new.failed_reason is not distinct from old.failed_reason
    and v_old_result_state = v_result_state then
    return new;
  end if;

  select to_jsonb(cs)
  into v_club_sponsor_json
  from public.club_sponsors cs
  where cs.id = new.club_sponsor_id;

  if v_club_sponsor_json is null then
    return new;
  end if;

  v_sponsor_kind := lower(nullif(coalesce(
    v_club_sponsor_json->>'sponsor_kind',
    v_club_sponsor_json->>'signed_kind',
    v_club_sponsor_json->>'kind',
    v_club_sponsor_json->>'type'
  ), ''));

  -- If sponsor kind is known and is not main/primary, skip.
  -- If the column/metadata does not exist, do not skip.
  if v_sponsor_kind is not null
    and v_sponsor_kind not in ('main', 'primary') then
    return new;
  end if;

  if coalesce(v_club_sponsor_json->>'club_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_club_id := (v_club_sponsor_json->>'club_id')::uuid;
  else
    return new;
  end if;

  select c.owner_user_id
  into v_owner_user_id
  from public.clubs c
  where c.id = v_club_id;

  if v_owner_user_id is null then
    return new;
  end if;

  v_company_id_text := coalesce(
    v_club_sponsor_json->>'sponsor_company_id',
    v_club_sponsor_json->>'company_id'
  );

  if coalesce(v_company_id_text, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select sc.name
    into v_sponsor_name
    from public.sponsor_companies sc
    where sc.id = v_company_id_text::uuid;
  end if;

  v_sponsor_name := coalesce(
    nullif(v_sponsor_name, ''),
    nullif(v_club_sponsor_json->>'sponsor_name', ''),
    nullif(v_club_sponsor_json->>'company_name', ''),
    'Main sponsor'
  );

  v_event_key := 'main_sponsor_objective:' || v_event_state || ':' || new.id::text;

  -- Idempotency guard: do not create duplicate notification for same objective result.
  if exists (
    select 1
    from public.notifications n
    join public.notification_types nt
      on nt.id = n.type_id
    where nt.code = v_notification_code
      and n.payload_json->>'event_key' = v_event_key
  ) then
    return new;
  end if;

  if v_event_state = 'achieved' then
    v_title := 'Main sponsor objective achieved';
    v_message :=
      'Your team completed "' || new.title || '" and received a sponsor bonus of $' ||
      to_char(coalesce(new.reward_amount, 0), 'FM999G999G999G999') || '.';
  else
    v_title := 'Main sponsor objective missed';
    v_message :=
      'Your team did not complete "' || new.title || '". The sponsor bonus of $' ||
      to_char(coalesce(new.reward_amount, 0), 'FM999G999G999G999') || ' was not paid.';
  end if;

  perform public.create_infrastructure_notification(
    v_owner_user_id,
    v_notification_code,
    v_title,
    v_message,
    v_action_url,
    jsonb_build_object(
      'event_key', v_event_key,
      'event_state', v_event_state,

      'club_id', v_club_id,
      'club_sponsor_id', new.club_sponsor_id,
      'sponsor_name', v_sponsor_name,

      'objective_id', new.id,
      'objective_code', new.objective_code,
      'objective_name', new.title,
      'objective_title', new.title,
      'objective_target_mode', new.objective_target_mode,
      'evaluation_mode', new.evaluation_mode,

      'bonus_amount_cash', new.reward_amount,
      'bonus_cash', new.reward_amount,
      'reward_amount', new.reward_amount,

      'current_value', new.current_value,
      'target_value', new.target_value,

      'country_code', new.country_code,
      'eligible_country_code', new.eligible_country_code,
      'eligible_from_game_date', new.eligible_from_game_date,
      'eligible_to_game_date', new.eligible_to_game_date,
      'target_check_game_date', new.target_check_game_date,

      'status', new.status,
      'check_state', new.check_state,
      'objective_result_state', new.objective_result_state,
      'failed_reason', new.failed_reason,
      'reason', new.failed_reason,

      'payout_transaction_id', new.payout_transaction_id,
      'checked_at', coalesce(new.checked_at, now()),
      'result_source', new.result_source,
      'progress_source', new.progress_source,

      'action_url', v_action_url
    )
  );

  return new;
end;
$function$
;

