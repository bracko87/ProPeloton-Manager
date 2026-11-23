-- SAT-11: Targeted direct Data API grant hardening, Nov 23 2026.
-- All 24 target functions are postgres-owned SECURITY DEFINER functions.
-- Invoker references, triggers and view dependencies are checked again inside
-- this transaction before grants change. Definer callers / postgres cron retain use.
-- This migration performs no finance, training, race or season functions.
do $guard$
declare
 v_sig text;
 v_oid oid;
 v_name text;
 v_bad int;
begin
 for v_sig in select v.signature from (values
  ('public.finance_charge_club_staff_wages(uuid,text)'),
  ('public.finance_charge_weekly_team_policy_costs(uuid,text)'),
  ('public.finance_record_missed_startlist_fine_v1(uuid)'),
  ('public.finance_record_prestart_disqualification_fine_v1(uuid)'),
  ('public.finance_run_due_monthly_tax_audits_guarded_v1(boolean)'),
  ('public.finance_sync_team_policy_nonrecurring_costs_v1(uuid)'),
  ('public.process_birthday_gifts_v1(date)'),
  ('public.process_daily_health_cases()'),
  ('public.process_daily_training_camp_activities()'),
  ('public.process_daily_training_camps()'),
  ('public.process_forward_daily_automation_v1()'),
  ('public.process_inactive_clubs_for_season_transition_v1(uuid,integer,integer,boolean)'),
  ('public.process_one_daily_tick_backlog_smart_v1(integer)'),
  ('public.process_one_daily_tick_backlog_v1(integer)'),
  ('public.process_rider_contract_season_expiry_v1(uuid,integer,integer)'),
  ('public.process_rider_submission_deadlines_v1()'),
  ('public.process_sponsors_for_season_transition_v1(uuid,integer,integer)'),
  ('public.process_staff_contract_season_expiry_v1(uuid,integer,integer)'),
  ('public.process_user_team_inactivity_v1(boolean)'),
  ('public.process_weekly_rider_development_for_window(date,date,boolean)'),
  ('public.race_engine_due_stage_watchdog_run_v1()'),
  ('public.run_competition_season_transition_v1(uuid,integer,integer)'),
  ('public.run_season_reset_if_due()'),
  ('public.run_season_reset()')
 ) v(signature)
 loop
   v_oid := to_regprocedure(v_sig);
   if v_oid is null then raise exception 'SAT11 function missing: %',v_sig; end if;
   select proname into v_name from pg_proc where oid=v_oid;
   if not exists(select 1 from pg_proc p where p.oid=v_oid and p.prosecdef and p.proowner='postgres'::regrole) then
     raise exception 'SAT11 owner or security definition drift: %',v_sig;
   end if;
   select count(*)::int into v_bad
   from pg_proc c
   where c.oid<>v_oid and not c.prosecdef and c.prosrc ilike '%'||v_name||'%';
   if v_bad<>0 then raise exception 'SAT11 unexpected invoker caller %: %',v_sig,v_bad; end if;
   if exists(select 1 from pg_trigger t where t.tgfoid=v_oid and not t.tgisinternal) then
     raise exception 'SAT11 unexpected trigger: %',v_sig;
   end if;
   if exists(select 1 from pg_depend d join pg_rewrite rw on d.objid=rw.oid where d.refobjid=v_oid) then
     raise exception 'SAT11 unexpected view dependency: %',v_sig;
   end if;
 end loop;
end;
$guard$;
revoke execute on function public.finance_charge_club_staff_wages(uuid,text) from public, anon, authenticated;
revoke execute on function public.finance_charge_weekly_team_policy_costs(uuid,text) from public, anon, authenticated;
revoke execute on function public.finance_record_missed_startlist_fine_v1(uuid) from public, anon, authenticated;
revoke execute on function public.finance_record_prestart_disqualification_fine_v1(uuid) from public, anon, authenticated;
revoke execute on function public.finance_run_due_monthly_tax_audits_guarded_v1(boolean) from public, anon, authenticated;
revoke execute on function public.finance_sync_team_policy_nonrecurring_costs_v1(uuid) from public, anon, authenticated;
revoke execute on function public.process_birthday_gifts_v1(date) from public, anon, authenticated;
revoke execute on function public.process_daily_health_cases() from public, anon, authenticated;
revoke execute on function public.process_daily_training_camp_activities() from public, anon, authenticated;
revoke execute on function public.process_daily_training_camps() from public, anon, authenticated;
revoke execute on function public.process_forward_daily_automation_v1() from public, anon, authenticated;
revoke execute on function public.process_inactive_clubs_for_season_transition_v1(uuid,integer,integer,boolean) from public, anon, authenticated;
revoke execute on function public.process_one_daily_tick_backlog_smart_v1(integer) from public, anon, authenticated;
revoke execute on function public.process_one_daily_tick_backlog_v1(integer) from public, anon, authenticated;
revoke execute on function public.process_rider_contract_season_expiry_v1(uuid,integer,integer) from public, anon, authenticated;
revoke execute on function public.process_rider_submission_deadlines_v1() from public, anon, authenticated;
revoke execute on function public.process_sponsors_for_season_transition_v1(uuid,integer,integer) from public, anon, authenticated;
revoke execute on function public.process_staff_contract_season_expiry_v1(uuid,integer,integer) from public, anon, authenticated;
revoke execute on function public.process_user_team_inactivity_v1(boolean) from public, anon, authenticated;
revoke execute on function public.process_weekly_rider_development_for_window(date,date,boolean) from public, anon, authenticated;
revoke execute on function public.race_engine_due_stage_watchdog_run_v1() from public, anon, authenticated;
revoke execute on function public.run_competition_season_transition_v1(uuid,integer,integer) from public, anon, authenticated;
revoke execute on function public.run_season_reset_if_due() from public, anon, authenticated;
revoke execute on function public.run_season_reset() from public, anon, authenticated;
grant execute on function public.finance_charge_club_staff_wages(uuid,text) to service_role;
grant execute on function public.finance_charge_weekly_team_policy_costs(uuid,text) to service_role;
grant execute on function public.finance_record_missed_startlist_fine_v1(uuid) to service_role;
grant execute on function public.finance_record_prestart_disqualification_fine_v1(uuid) to service_role;
grant execute on function public.finance_run_due_monthly_tax_audits_guarded_v1(boolean) to service_role;
grant execute on function public.finance_sync_team_policy_nonrecurring_costs_v1(uuid) to service_role;
grant execute on function public.process_birthday_gifts_v1(date) to service_role;
grant execute on function public.process_daily_health_cases() to service_role;
grant execute on function public.process_daily_training_camp_activities() to service_role;
grant execute on function public.process_daily_training_camps() to service_role;
grant execute on function public.process_forward_daily_automation_v1() to service_role;
grant execute on function public.process_inactive_clubs_for_season_transition_v1(uuid,integer,integer,boolean) to service_role;
grant execute on function public.process_one_daily_tick_backlog_smart_v1(integer) to service_role;
grant execute on function public.process_one_daily_tick_backlog_v1(integer) to service_role;
grant execute on function public.process_rider_contract_season_expiry_v1(uuid,integer,integer) to service_role;
grant execute on function public.process_rider_submission_deadlines_v1() to service_role;
grant execute on function public.process_sponsors_for_season_transition_v1(uuid,integer,integer) to service_role;
grant execute on function public.process_staff_contract_season_expiry_v1(uuid,integer,integer) to service_role;
grant execute on function public.process_user_team_inactivity_v1(boolean) to service_role;
grant execute on function public.process_weekly_rider_development_for_window(date,date,boolean) to service_role;
grant execute on function public.race_engine_due_stage_watchdog_run_v1() to service_role;
grant execute on function public.run_competition_season_transition_v1(uuid,integer,integer) to service_role;
grant execute on function public.run_season_reset_if_due() to service_role;
grant execute on function public.run_season_reset() to service_role;
