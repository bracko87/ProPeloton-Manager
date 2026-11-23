-- Read-only SAT-11 privilege audit: expected 24 / 24 PUBLIC and authenticated DENIED;
-- service_role still ALLOWED. Does not call any processor or change game state.
select p.oid::regprocedure::text as function_signature,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as player_can_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_can_execute,
  p.prosecdef as security_definer
from pg_proc p
where p.pronamespace='public'::regnamespace
  and p.proname in (
    'finance_charge_club_staff_wages',
    'finance_charge_weekly_team_policy_costs',
    'finance_record_missed_startlist_fine_v1',
    'finance_record_prestart_disqualification_fine_v1',
    'finance_run_due_monthly_tax_audits_guarded_v1',
    'finance_sync_team_policy_nonrecurring_costs_v1',
    'process_birthday_gifts_v1',
    'process_daily_health_cases',
    'process_daily_training_camp_activities',
    'process_daily_training_camps',
    'process_forward_daily_automation_v1',
    'process_inactive_clubs_for_season_transition_v1',
    'process_one_daily_tick_backlog_smart_v1',
    'process_one_daily_tick_backlog_v1',
    'process_rider_contract_season_expiry_v1',
    'process_rider_submission_deadlines_v1',
    'process_sponsors_for_season_transition_v1',
    'process_staff_contract_season_expiry_v1',
    'process_user_team_inactivity_v1',
    'process_weekly_rider_development_for_window',
    'race_engine_due_stage_watchdog_run_v1',
    'run_competition_season_transition_v1',
    'run_season_reset_if_due',
    'run_season_reset'
  )
order by function_signature;
