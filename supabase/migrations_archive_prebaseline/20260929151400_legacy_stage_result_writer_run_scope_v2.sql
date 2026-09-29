create or replace function public.race_engine_write_stage_results_v1(
  p_simulation_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_inserted_count integer := 0;
begin
  select race_id, stage_id
  into v_race_id, v_stage_id
  from public.race_stage_simulation_runs
  where id = p_simulation_run_id
    and status = 'completed';

  if v_race_id is null or v_stage_id is null then
    raise exception 'Completed simulation run % not found.', p_simulation_run_id;
  end if;

  delete from public.race_stage_results
  where race_id = v_race_id
    and stage_id = v_stage_id;

  insert into public.race_stage_results (
    race_id,
    stage_id,
    rider_id,
    team_id,
    rank,
    status,
    elapsed_seconds,
    gap_seconds,
    bonus_seconds,
    penalty_seconds,
    finish_points,
    sprint_points,
    mountain_points,
    rider_name_snapshot,
    team_name_snapshot,
    simulation_run_id,
    output_contract
  )
  select
    rs.race_id,
    rs.stage_id,
    rs.rider_id,
    rs.team_id,
    rs.finish_position,
    rs.stage_status,
    rs.finish_time_seconds,
    rs.gap_seconds,
    0,
    coalesce((rs.metadata->>'incident_time_loss_seconds')::integer, 0),
    coalesce(pc.points, 0),
    0,
    coalesce(mc.points, 0),
    rs.metadata->>'rider_name',
    rs.metadata->>'team_name',
    p_simulation_run_id,
    'run_scoped_v1'
  from public.race_stage_rider_states rs
  left join public.race_classification_standings pc
    on pc.race_id = rs.race_id
   and pc.after_stage_id = rs.stage_id
   and pc.classification_type = 'points'
   and pc.entity_type = 'rider'
   and pc.rider_id = rs.rider_id
  left join public.race_classification_standings mc
    on mc.race_id = rs.race_id
   and mc.after_stage_id = rs.stage_id
   and mc.classification_type = 'mountain'
   and mc.entity_type = 'rider'
   and mc.rider_id = rs.rider_id
  where rs.simulation_run_id = p_simulation_run_id;

  get diagnostics v_inserted_count = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'simulation_run_id', p_simulation_run_id,
    'race_id', v_race_id,
    'stage_id', v_stage_id,
    'inserted_count', v_inserted_count
  );
end;
$function$;
