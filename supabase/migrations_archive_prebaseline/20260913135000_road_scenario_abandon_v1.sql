-- Road Scenario V1 fallback/abandon handling.
-- A scenario reservation is authoritative only when the scenario-driven primary
-- engine becomes the official calculated result. If emergency fallback wins,
-- mark the reservation failed so it no longer participates in anti-repeat history.

create or replace function public.universal_race_stage_abandon_scenario_v1(
  p_stage_id uuid,
  p_simulation_run_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated public.race_engine_scenario_runs%rowtype;
begin
  update public.race_engine_scenario_runs
  set simulation_run_id = p_simulation_run_id,
      selection_status = 'failed',
      scenario_deviations_json = coalesce(scenario_deviations_json,'[]'::jsonb) ||
        jsonb_build_array(jsonb_build_object(
          'kind','scenario_abandoned',
          'reason',coalesce(nullif(p_reason,''),'primary_not_official'),
          'at',clock_timestamp()
        )),
      updated_at = clock_timestamp()
  where stage_id = p_stage_id
    and selection_status = 'reserved'
  returning * into v_updated;

  if not found then
    return jsonb_build_object('status','not_found_or_not_reserved','stage_id',p_stage_id);
  end if;

  return jsonb_build_object(
    'status','failed',
    'stage_id',p_stage_id,
    'scenario_type',v_updated.scenario_type,
    'template_id',v_updated.template_id,
    'reason',coalesce(nullif(p_reason,''),'primary_not_official')
  );
end;
$$;

revoke all on function public.universal_race_stage_abandon_scenario_v1(uuid,uuid,text) from public;
grant execute on function public.universal_race_stage_abandon_scenario_v1(uuid,uuid,text) to service_role;
