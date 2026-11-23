-- SAT-10B read-only regression: public roles cannot run world-clock or
-- global race processor RPCs. Service role continues to have explicit EXECUTE.
select p.oid::regprocedure::text as signature,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute,
  p.prosecdef as security_definer
from pg_proc p
where p.pronamespace='public'::regnamespace
  and p.proname in (
    'advance_game_state_one_hour_manual',
    'advance_game_state_one_hour',
    'advance_game_state_one_minute_v1',
    'run_game_tick_if_unpaused',
    'run_game_minute_tick_if_unpaused_v1',
    'run_daily_game_processors_v1',
    'run_hourly_game_processors_v1',
    'process_due_race_days_v1',
    'process_one_backlog_game_processor_child_step_v1',
    'auto_fill_race_ai_team_applications_season_v1',
    'generate_race_weather_for_race_v1'
  )
order by signature;
