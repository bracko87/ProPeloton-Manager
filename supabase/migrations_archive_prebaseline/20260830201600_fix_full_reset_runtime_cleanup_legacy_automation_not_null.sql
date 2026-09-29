create or replace function public.game_world_reset_clear_runtime_execution_state_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_cleared integer := 0;
begin
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','hourly_game_processor_runs');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','game_day_processor_runs');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','game_daily_tick_backlog_v1');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','game_daily_tick_backlog_processor_runs_v1');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','game_daily_tick_log');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','game_job_runtime_guard');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','cron_guard_run_log_v1');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_scheduler_tick_runs');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_stage_process_runs_v2');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_stage_processor_shadow_run_v2');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_stage_runner_handoff_history_v2');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_stage_runner_handoff_v2');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_stage_prize_adapter_test_run_v2');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_stage_ranking_adapter_test_run_v2');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_phase3aa_prize_finance_execution_run_v1');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_phase3aa_prize_sporting_plan_run_v2');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_phase3aa_report_reconciliation_plan_run_v1');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','universal_race_integration_test_runs');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_timeline_rollback_audit_v1');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','rider_health_condition_effect_runs_v1');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','rider_market_daily_runs');

  update public.automation_forward_activation_v1
  set activated_at_real = clock_timestamp(),
      activated_game_timestamp = timestamptz '2000-01-01 01:00:00+00',
      activated_game_date = date '2000-01-01',
      daily_processing_starts_on = date '2000-01-02',
      note = 'Fresh Season 1 activation created by Full Game World Reset. Daily processing starts Jan 2; future backlog is never processed early.',
      updated_at = clock_timestamp()
  where id=true;

  update public.race_engine_runtime_control_v1
  set typescript_activation_game_at = timestamp '2000-01-01 01:00:00',
      updated_at = clock_timestamp(),
      updated_by = 'game_world_reset_v1',
      notes = coalesce(notes,'') || E'\nFull Game World Reset: all runtime execution memory cleared and TypeScript activation rebased to S1 Jan 1 01:00.'
  where singleton_id=true
    and active_engine='typescript_v1'
    and coalesce(typescript_lifecycle_enabled,false)=true;

  if to_regclass('public.race_stage_automation_settings') is not null then
    update public.race_stage_automation_settings
    set activation_game_at = timestamp '2000-01-01 01:00:00',
        last_processor_at = null,
        last_processor_result = '{}'::jsonb,
        updated_at = clock_timestamp();
  end if;

  update public.races
  set metadata = coalesce(metadata,'{}'::jsonb) - array[
        'captains_pending_rider_deadline','team_list_announcement_finalized',
        'team_list_announcement_finalized_at','team_list_announcement_processed',
        'team_list_announcement_processed_at','team_list_announcement_team_count',
        'race_startlist_captain_model_version','race_startlist_captains_finalized',
        'race_startlist_captains_finalized_at','race_startlist_expected_team_count',
        'race_startlist_rider_count','ai_startlist_remaining_unfillable_team_count',
        'ai_startlist_replaced_team_count','ai_startlist_replacement_checked_at',
        'forward_only_terminal_closed_at','forward_only_terminal_closed_on_game_date',
        'forward_only_terminal_closure','forward_only_terminal_closure_reason',
        'test_weather_override','test_weather_override_applied_at','test_weather_override_reason'
      ]::text[],
      updated_at = clock_timestamp()
  where start_date >= date '2000-01-01' and start_date < date '2001-01-01';

  return jsonb_build_object(
    'ok',true,
    'cleared_runtime_table_count',v_cleared,
    'forward_activation_game_at','2000-01-01 01:00:00+00',
    'daily_processing_starts_on','2000-01-02',
    'typescript_activation_game_at','2000-01-01 01:00:00'
  );
end;
$function$;