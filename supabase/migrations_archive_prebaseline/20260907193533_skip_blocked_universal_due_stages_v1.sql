create or replace function public.universal_race_stage_claim_next_due_v1(
  p_worker_id text default 'netlify_phase11b_v1'::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage_id uuid;
  v_claim jsonb;
  v_blocked jsonb := '[]'::jsonb;
begin
  select * into v_control
  from public.race_engine_runtime_control_v1
  where singleton_id=true;

  if not found or not coalesce(v_control.typescript_lifecycle_enabled,false) then
    return jsonb_build_object('status','disabled');
  end if;

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  for v_stage_id in
    select stage.id
    from public.race_stages stage
    join public.races race on race.id=stage.race_id
    where not coalesce(stage.weather_cancelled,false)
      and stage.planned_start_hour_number is not null
      and public.race_startlist_engine_ready_v1(stage.race_id)
      and (
        stage.stage_date::timestamp
          + make_interval(
              hours=>coalesce(stage.planned_start_hour_number,12),
              mins=>coalesce(stage.planned_start_minute,0)
            )
      ) >= v_control.typescript_activation_game_at
      and (
        stage.stage_date::timestamp
          + make_interval(
              hours=>coalesce(stage.planned_start_hour_number,12),
              mins=>coalesce(stage.planned_start_minute,0)
            )
          - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3))
      ) <= v_current_game_at
      and not exists (
        select 1
        from public.race_stage_authoritative_runs authority
        where authority.stage_id=stage.id
      )
      and not exists (
        select 1
        from public.race_stage_simulation_runs run
        where run.stage_id=stage.id
          and run.engine_version='race_engine_ts_v1'
          and run.simulation_mode='deterministic_road_race_v1'
          and run.status in ('running','completed')
          and coalesce(run.result_summary_json->>'calculation_contract','') in (
            'phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1'
          )
      )
      and not exists (
        select 1
        from public.race_stage_simulation_runs failed_run
        where failed_run.stage_id=stage.id
          and failed_run.engine_version='race_engine_ts_v1'
          and failed_run.simulation_mode='deterministic_road_race_v1'
          and failed_run.status='failed'
          and failed_run.failed_at is not null
          and failed_run.failed_at > clock_timestamp()-interval '10 minutes'
      )
    order by stage.stage_date,stage.planned_start_hour_number,stage.planned_start_minute,stage.race_id,stage.stage_number
    limit 100
  loop
    begin
      v_claim := public.universal_race_stage_claim_calculation_v1(v_stage_id);
    exception when others then
      v_blocked := v_blocked || jsonb_build_array(
        jsonb_build_object(
          'stage_id', v_stage_id,
          'sqlstate', sqlstate,
          'message', sqlerrm
        )
      );
      continue;
    end;

    if coalesce(v_claim->>'status','')='claimed' then
      return v_claim || jsonb_build_object(
        'worker_id',coalesce(nullif(p_worker_id,''),'supabase_edge_phase11b_v1'),
        'scheduler_skipped_blocks',v_blocked
      );
    end if;
  end loop;

  return jsonb_build_object(
    'status','no_due_stage',
    'current_game_at',v_current_game_at,
    'scheduler_skipped_blocks',v_blocked
  );
end;
$function$;
