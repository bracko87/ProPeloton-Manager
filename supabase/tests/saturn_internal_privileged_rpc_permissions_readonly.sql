-- SAT-10 read-only regression: exact privileged RPC execute grants.
-- Expected: all 7 denied for anon and authenticated; all allowed to
-- service_role. No game records or real user credentials are needed.
select p.oid::regprocedure::text as signature,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute,
  p.prosecdef as security_definer
from pg_proc p
where p.pronamespace='public'::regnamespace
  and p.proname in (
    'race_get_rider_numeric_skill_value_v1',
    'race_calculate_rider_favorite_score_v1',
    'finance_transfer_club_to_club_internal',
    'finance_get_or_create_system_account',
    'generate_race_stage_weather_v1',
    'finance_process_weekly_rider_wages',
    '_finance_process_weekly_rider_wages_core_v1'
  )
order by signature;
