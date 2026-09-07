create or replace function public.universal_race_stage_process_lifecycle_v1(
  p_max_publications integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_pass jsonb;
  v_current_game_at timestamp without time zone;
  v_fast_forwarded integer := 0;
  v_published integer := 0;
begin
  -- Bound each database statement to one official publication. The Supabase
  -- worker invokes lifecycle both before and after calculation, so catch-up can
  -- still publish up to two stages per minute without a long transaction.
  v_pass := public.universal_race_stage_process_lifecycle_core_v1(1);

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  update public.race_stage_automation_state state
  set details = coalesce(state.details,'{}'::jsonb) || jsonb_build_object(
        'replay_closes_at_real',clock_timestamp(),
        'historical_catchup_replay_fast_forwarded',true,
        'historical_catchup_fast_forwarded_at_real',clock_timestamp(),
        'historical_catchup_current_game_at',v_current_game_at
      ),
      last_checked_at=clock_timestamp(),
      updated_at=clock_timestamp()
  from public.race_stage_simulation_runs run
  where run.id=state.simulation_run_id
    and state.last_status='replay_live'
    and state.scheduled_game_at < v_current_game_at
    and run.status='running'
    and run.engine_version='race_engine_ts_v1'
    and run.simulation_mode='deterministic_road_race_v1'
    and coalesce(run.result_summary_json->>'calculation_contract','')='universal_phase11b_calculated_hidden_v1'
    and not exists (
      select 1 from public.race_stage_authoritative_runs a where a.stage_id=state.stage_id
    )
    and (
      nullif(state.details->>'replay_closes_at_real','') is null
      or (state.details->>'replay_closes_at_real')::timestamptz > clock_timestamp()
    );
  get diagnostics v_fast_forwarded=row_count;

  v_published := coalesce(nullif(v_pass->>'published_count','')::integer,0);

  return jsonb_build_object(
    'status','completed',
    'current_game_at',v_current_game_at,
    'historical_catchup_fast_forwarded_count',v_fast_forwarded,
    'published_count',v_published,
    'pass',v_pass,
    'historical_catchup_rule','past_stage_start_only_v1',
    'publication_budget_per_lifecycle_call',1
  );
end;
$function$;

revoke all on function public.universal_race_stage_process_lifecycle_v1(integer) from public;
revoke all on function public.universal_race_stage_process_lifecycle_v1(integer) from anon;
revoke all on function public.universal_race_stage_process_lifecycle_v1(integer) from authenticated;
grant execute on function public.universal_race_stage_process_lifecycle_v1(integer) to service_role;