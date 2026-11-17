-- ProPeloton Manager: permanent non-destructive guards for the final Season 1 test.
-- Production already contains these functions/triggers.
-- Safe to apply again; deliberately excludes one-time race cancellation,
-- AI finance refunds, academy delegation correction and stage scoring repairs.
-- They were already applied and audited; never replay old-game data repairs.

-- Give newly CREATED human teams a usable initial regular-training default,
-- leaving their existing choices untouched.
create or replace function public.ppm_seed_new_human_club_default_training_v1()
returns trigger language plpgsql security definer set search_path=''
as $t$
begin
 if new.is_ai=false then
   insert into public.club_regular_training_defaults
     (club_id,team_scope,focus_code,intensity,auto_when_free)
   values(new.id,case when new.club_type='developing' then 'all' else 'first_team' end,
          'general','normal',true)
   on conflict (club_id) do nothing;
 end if;
 return new;
end $t$;
revoke all on function public.ppm_seed_new_human_club_default_training_v1() from public,anon,authenticated;
drop trigger if exists trg_ppm_seed_new_human_club_default_training_v1 on public.clubs;
create trigger trg_ppm_seed_new_human_club_default_training_v1
after insert on public.clubs for each row when (new.is_ai=false)
execute function public.ppm_seed_new_human_club_default_training_v1();

-- Future races cannot be scheduled outside a known eligible city climate window.
-- Does not rewrite historical completed races or alter financial ledgers.
create or replace function private.ppm_youth_city_climate_schedule_guard_v1()
returns trigger language plpgsql security definer set search_path=''
as $guard$
begin
 if new.status='scheduled' and new.race_date is not null
  and nullif(new.host_city,'') is not null
  and nullif(new.host_country_code,'') is not null
  and not private.youth_race_city_weather_eligible_v9(
    new.host_country_code,new.host_city,new.race_date,
    coalesce(new.race_end_date,new.race_date))
 then
   new.status:='cancelled';
   new.metadata:=coalesce(new.metadata,'{}'::jsonb)
     ||jsonb_build_object('hidden_from_calendar',true,
       'calendar_exclusion','city_climate_rule_v9',
       'weather_climate_guard_v1',true);
 end if;
 return new;
end $guard$;
revoke all on function private.ppm_youth_city_climate_schedule_guard_v1()
from public,anon,authenticated;
drop trigger if exists zz_ppm_youth_climate_schedule_guard_v1 on public.youth_races;
create trigger zz_ppm_youth_climate_schedule_guard_v1
before insert or update of status,host_country_code,host_city,race_date,race_end_date
on public.youth_races for each row
execute function private.ppm_youth_city_climate_schedule_guard_v1();

-- After a *completed protected restart*, a cron run missed before resumption
-- must not become a false critical incident before its FIRST post-resume due time.
-- Real missed runs after the first due slot +15 min still raise alerts.
create or replace function private.ppm_cron_reset_first_due_grace_v1(p_job_name text)
returns boolean language sql stable security definer set search_path=''
as $fn$
with gate as (
 select g.updated_at resumed_at
 from private.game_world_reset_maintenance_gate_v1 g
 where g.id=true and g.locked=false and g.updated_at is not null
), base as (
 select g.resumed_at,date_trunc('day',g.resumed_at) day_start,
  (select max(d.start_time) from cron.job_run_details d
   join cron.job j on j.jobid=d.jobid where j.jobname=p_job_name)
  last_cron_run_at
 from gate g
), next_run as (
 select *,
 case p_job_name
 when 'weekly-rider-wages-check' then
   day_start+(case when resumed_at<day_start+interval '12 hours'
    then interval '12 hours' else interval '1 day' end)
 when 'weekly-staff-wages-check' then
   day_start+interval '5 minutes'+
   (case when resumed_at<day_start+interval '5 minutes'
     then interval '0 minutes'
     when resumed_at<day_start+interval '12 hours 5 minutes'
     then interval '12 hours' else interval '1 day' end)
 when 'process-birthday-gifts-daily-1200-utc' then
   day_start+interval '12 hours'+
   (case when resumed_at<day_start+interval '12 hours'
     then interval '0 hours' else interval '1 day' end)
 else null::timestamptz end first_due_at
 from base
)
select coalesce(
 (select p_job_name in
   ('weekly-rider-wages-check','weekly-staff-wages-check',
    'process-birthday-gifts-daily-1200-utc')
   and resumed_at>=now()-interval '2 days'
   and coalesce(last_cron_run_at,'-infinity'::timestamptz)<resumed_at
   and now()<first_due_at+interval '15 minutes'
  from next_run),false)
$fn$;
revoke all on function private.ppm_cron_reset_first_due_grace_v1(text)
 from public,anon,authenticated;

-- Patch only one existing watchdog branch rather than replacing its many
-- unrelated production checks. Reapplication is idempotent.
do $patch$
declare v_current text;
v_needle text:='    if p.stale_after_minutes is not null then';
begin
 select pg_get_functiondef('public.run_system_health_watchdog_base_v1()'::regprocedure)
 into v_current;
 if v_current is null then raise exception 'Watchdog source missing'; end if;
 if strpos(v_current,'private.ppm_cron_reset_first_due_grace_v1')=0 then
  if strpos(v_current,v_needle)=0
   then raise exception 'Cannot locate watchdog cron-stale condition'; end if;
  execute replace(v_current,v_needle,
 '    if p.stale_after_minutes is not null
       and private.ppm_cron_reset_first_due_grace_v1(p.source_ref)
    then
      perform public.resolve_system_incident_by_dedupe_v1(
        ''cron-stale:''||p.source_ref,
        ''The prior scheduled slot fell during protected game reset maintenance; the first new due run has not yet passed.''
      );
      continue;
    end if;
'||v_needle);
 end if;
end $patch$;
