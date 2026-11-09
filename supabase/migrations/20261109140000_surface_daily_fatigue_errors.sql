-- Do not swallow daily fatigue exceptions, as this masks the real cause.
-- All other daily jobs retain their existing independent error handling.
CREATE OR REPLACE FUNCTION public.process_daily_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_season int;
  v_month smallint;
  v_day smallint;
  v_paused boolean;
  v_date date;
begin
  select season_number,month_number,day_number,is_paused
  into v_season,v_month,v_day,v_paused
  from public.game_state
  where id=true;

  if coalesce(v_paused,false) then return; end if;

  v_date:=public.get_current_game_date_date();

  begin perform public.run_retirement_daily_jobs(); exception when others then raise warning 'run_retirement_daily_jobs failed: %',sqlerrm; end;
  begin perform public.process_due_rider_contract_starts_v1(v_date,null,null,null); exception when others then raise warning 'process_due_rider_contract_starts_v1 failed: %',sqlerrm; end;
  begin perform public.process_developing_team_age_limits_v1(v_date); exception when others then raise warning 'process_developing_team_age_limits_v1 failed: %',sqlerrm; end;
  begin perform public.notify_developing_team_window_open(); exception when others then raise warning 'notify_developing_team_window_open failed: %',sqlerrm; end;
  begin perform public.prepare_next_season_race_calendar_if_due_v1(); exception when others then raise warning 'prepare_next_season_race_calendar_if_due_v1 failed: %',sqlerrm; end;
  begin perform public.process_daily_training_camp_activities(); exception when others then raise warning 'process_daily_training_camp_activities failed: %',sqlerrm; end;
  begin perform public.process_daily_regular_training(); exception when others then raise warning 'process_daily_regular_training failed: %',sqlerrm; end;
  begin perform public.process_daily_training_camps(); exception when others then raise warning 'process_daily_training_camps failed: %',sqlerrm; end;
  begin perform public.process_weekly_rider_development(); exception when others then raise warning 'process_weekly_rider_development failed: %',sqlerrm; end;
  begin perform public.finance_process_weekly_rider_wages_guarded_v1(); exception when others then raise warning 'finance_process_weekly_rider_wages_guarded_v1 failed: %',sqlerrm; end;
  begin perform public.finance_process_weekly_team_policy_costs(); exception when others then raise warning 'finance_process_weekly_team_policy_costs failed: %',sqlerrm; end;
  begin perform public.finance_process_weekly_developing_team_accommodation_v1(); exception when others then raise warning 'finance_process_weekly_developing_team_accommodation_v1 failed: %',sqlerrm; end;
  begin perform public.finance_process_team_policy_nonrecurring_costs_v1(); exception when others then raise warning 'finance_process_team_policy_nonrecurring_costs_v1 failed: %',sqlerrm; end;
  -- Sporting-integrity critical: propagate failures rather than swallowing them.
  -- Backlog cannot be marked processed when fatigue computation failed.
  perform public.process_daily_fatigue();
  begin perform public.process_daily_health_cases(); exception when others then raise warning 'process_daily_health_cases failed: %',sqlerrm; end;
  begin perform public.process_daily_morale_v1(); exception when others then raise warning 'process_daily_morale_v1 failed: %',sqlerrm; end;
  begin perform public.process_staff_courses(); exception when others then raise warning 'process_staff_courses failed: %',sqlerrm; end;
  begin perform public.staff_market_run_daily_refresh(150,72); exception when others then raise warning 'staff_market_run_daily_refresh failed: %',sqlerrm; end;
  begin perform public.complete_due_rider_scout_tasks(); exception when others then raise warning 'complete_due_rider_scout_tasks failed: %',sqlerrm; end;
  begin perform public.create_staff_contract_expiry_notifications(); exception when others then raise warning 'create_staff_contract_expiry_notifications failed: %',sqlerrm; end;
  begin perform public.run_daily_market_jobs_detailed(); exception when others then raise warning 'run_daily_market_jobs_detailed failed: %',sqlerrm; end;
  begin perform public.process_daily_coach_training_plans_v1(v_date); exception when others then raise warning 'process_daily_coach_training_plans_v1 failed: %',sqlerrm; end;
  begin perform public.apply_team_policy_rider_support_v1(v_date); exception when others then raise warning 'apply_team_policy_rider_support_v1 failed: %',sqlerrm; end;
  begin perform public.process_national_team_selection_deadlines_v1(); exception when others then raise warning 'process_national_team_selection_deadlines_v1 failed: %',sqlerrm; end;

  -- Youth Academy daily lifecycle: scouting reset, staff decisions, temporary
  -- cover cleanup, weekly Youth payroll/development, camps, races and graduation.
  begin
    perform public.process_youth_academy_game_day_v1(v_date);
  exception when others then
    raise warning 'process_youth_academy_game_day_v1 failed: %',sqlerrm;
  end;

  begin
    perform public.ensure_rider_skill_weekly_snapshots_v1(v_date);
  exception when others then
    raise warning 'ensure_rider_skill_weekly_snapshots_v1 failed: %',sqlerrm;
  end;
end;
$function$;
