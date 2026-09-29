create or replace function public.universal_race_stage_survival_heartbeat_v1(
  p_stage_id uuid,
  p_simulation_run_id uuid,
  p_phase text,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_updated integer := 0;
begin
  update public.race_stage_simulation_runs sr
  set updated_at=clock_timestamp(),
      result_summary_json=coalesce(sr.result_summary_json,'{}'::jsonb) || jsonb_build_object(
        'survival_phase',coalesce(nullif(p_phase,''),'unknown'),
        'survival_heartbeat_at_real',clock_timestamp(),
        'survival_details',coalesce(p_details,'{}'::jsonb)
      )
  where sr.id=p_simulation_run_id
    and sr.stage_id=p_stage_id
    and sr.engine_version='race_engine_ts_v1'
    and sr.simulation_mode='deterministic_road_race_v1'
    and sr.status='running'
    and coalesce(sr.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
    and not exists (select 1 from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id);
  get diagnostics v_updated=row_count;

  if v_updated > 0 then
    update public.race_stage_automation_state st
    set last_checked_at=clock_timestamp(),
        details=coalesce(st.details,'{}'::jsonb) || jsonb_build_object(
          'survival_phase',coalesce(nullif(p_phase,''),'unknown'),
          'survival_heartbeat_at_real',clock_timestamp(),
          'survival_details',coalesce(p_details,'{}'::jsonb)
        ),
        updated_at=clock_timestamp()
    where st.stage_id=p_stage_id and st.simulation_run_id=p_simulation_run_id;
  end if;

  return jsonb_build_object(
    'status',case when v_updated>0 then 'heartbeat_recorded' else 'heartbeat_not_recorded' end,
    'stage_id',p_stage_id,
    'simulation_run_id',p_simulation_run_id,
    'phase',coalesce(nullif(p_phase,''),'unknown'),
    'updated_rows',v_updated,
    'model_version','race_calculation_survival_v1'
  );
end;
$function$;
