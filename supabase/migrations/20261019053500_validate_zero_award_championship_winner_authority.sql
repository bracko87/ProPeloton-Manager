-- Keep Phase 11 sporting integrity strict while treating a zero-award FINISH
-- winner record as required, not as an unexpected scoring point.
-- The future-race attrition guard always persists the rank-one FINISH row;
-- this authority validator must agree. Historic official results untouched.
CREATE OR REPLACE FUNCTION public.universal_race_stage_validate_authority_trigger_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_validation jsonb;
  v_expected_persisted_rows integer := 0;
  v_actual_persisted_rows integer := 0;
  v_persisted_mismatch_count integer := 0;
begin
  if new.engine_version = 'race_engine_ts_v1'
     and new.simulation_mode = 'deterministic_road_race_v1'
  then
    select run.*
    into v_run
    from public.race_stage_simulation_runs run
    where run.id = new.simulation_run_id
      and run.stage_id = new.stage_id;

    if not found then
      raise exception 'Authoritative Phase 11 run % for stage % was not found.',
        new.simulation_run_id,
        new.stage_id;
    end if;

    v_validation := public.universal_race_stage_validate_point_contract_v1(
      new.stage_id,
      v_run.input_snapshot_json,
      v_run.result_summary_json -> 'output_snapshot'
    );

    if coalesce(v_validation ->> 'status', '') <> 'point_contract_ready' then
      raise exception using
        errcode = 'P0001',
        message = format(
          'Phase 11 authority activation blocked by sporting-integrity validation for stage %s: %s',
          new.stage_id,
          v_validation::text
        );
    end if;

    v_expected_persisted_rows := coalesce(
      (v_validation #>> '{canonical,expected_scoring_rows}')::integer,
      0
    );

    -- A real winner must be recorded at FINISH even when the stage awards
    -- no sporting points or time bonuses (NC/NCQ and other non-scoring stages).
    -- The original scoring contract only counts reward-bearing rank slots.
    v_expected_persisted_rows := v_expected_persisted_rows + (
      select count(*)::integer
      from public.race_stage_points p
      where p.stage_id=new.stage_id
        and upper(p.point_type)='FINISH'
        and jsonb_array_length(p.points_scheme)=0
        and jsonb_array_length(p.time_bonus_seconds)=0
    );

    select count(*)::integer
    into v_actual_persisted_rows
    from public.race_stage_point_results result
    where result.stage_id = new.stage_id;

    with expected as (
      select
        point.id as point_id,
        rank_number,
        coalesce((point.points_scheme ->> (rank_number - 1))::integer, 0) as expected_points,
        coalesce((point.time_bonus_seconds ->> (rank_number - 1))::integer, 0) as expected_bonus
      from public.race_stage_points point
      cross join lateral generate_series(
        1,
        greatest(
          jsonb_array_length(point.points_scheme),
          jsonb_array_length(point.time_bonus_seconds),
          case when upper(point.point_type)='FINISH'
            and jsonb_array_length(point.points_scheme)=0
            and jsonb_array_length(point.time_bonus_seconds)=0
          then 1 else 0 end
        )
      ) as rank_number
      where point.stage_id = new.stage_id
        and upper(point.point_type) <> 'START'
    )
    select count(*)::integer
    into v_persisted_mismatch_count
    from expected expected_row
    where (
      select count(*)
      from public.race_stage_point_results result
      where result.stage_id = new.stage_id
        and result.point_id = expected_row.point_id
        and result.rank = expected_row.rank_number
        and result.points_awarded = expected_row.expected_points
        and result.bonus_seconds_awarded = expected_row.expected_bonus
    ) <> 1;

    if v_actual_persisted_rows <> v_expected_persisted_rows
       or v_persisted_mismatch_count <> 0
    then
      raise exception using
        errcode = 'P0001',
        message = format(
          'Phase 11 authority activation blocked because persisted point rows are incomplete for stage %s (expected=%s actual=%s mismatches=%s).',
          new.stage_id,
          v_expected_persisted_rows,
          v_actual_persisted_rows,
          v_persisted_mismatch_count
        );
    end if;
  end if;

  return new;
end;
$function$;
