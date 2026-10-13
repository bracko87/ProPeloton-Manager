-- Independent idempotent recovery for missed Monday Youth Academy work.
-- The heavy daily processor intentionally catches some subsystem failures;
-- a successful backlog day alone cannot guarantee its weekly child jobs ran.
-- Existing private functions skip already processed riders/academies.
create or replace function private.ensure_youth_weekly_processing_v1()
returns jsonb language plpgsql security definer
set search_path='pg_catalog','public','private','pg_temp'
as $fn$
declare
 v_today date;
 v_monday date;
 v_payroll jsonb := '{"processed":0,"skipped":true}'::jsonb;
 v_development jsonb := '{"processed":0,"skipped":true}'::jsonb;
 v_missing_payroll boolean;
 v_missing_development boolean;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('private.ensure_youth_weekly_processing_v1',0)) then
   return jsonb_build_object('status','already_running');
 end if;
 v_today:=public.get_current_game_date_date();
 v_monday:=date_trunc('week',v_today)::date;
 select exists(
   select 1 from public.youth_academies a
   where a.is_active=true and not exists (
     select 1 from public.youth_academy_ledger l
     where l.academy_id=a.id and l.season_number=public.get_current_season_number()
       and l.category='weekly_payroll' and l.metadata->>'week_start'=v_monday::text
   )
 ) into v_missing_payroll;
 select exists(
   select 1 from public.youth_riders r
   join public.youth_academies a on a.id=r.academy_id and a.is_active=true
   where r.status='academy' and private.youth_academy_age_v1(r.birth_date) between 12 and 16
     and not exists(
       select 1 from public.youth_development_weekly_runs d
       where d.youth_rider_id=r.id and d.week_start=v_monday
     )
 ) into v_missing_development;
 if v_missing_payroll then
   v_payroll:=private.process_youth_academy_weekly_payroll_v1(v_monday);
 end if;
 if v_missing_development then
   v_development:=private.process_youth_development_week_v1(v_monday);
 end if;
 return jsonb_build_object(
   'status','success','week_start',v_monday,
   'payroll',v_payroll,'development',v_development,
   'recovered_payroll',v_missing_payroll,
   'recovered_development',v_missing_development);
end
$fn$;
revoke all on function private.ensure_youth_weekly_processing_v1() from public,anon,authenticated;
select cron.schedule(
 'youth-weekly-processing-recovery-v1',
 '6-59/10 * * * *',
 $$set statement_timeout='180s'; select private.ensure_youth_weekly_processing_v1();$$
);
