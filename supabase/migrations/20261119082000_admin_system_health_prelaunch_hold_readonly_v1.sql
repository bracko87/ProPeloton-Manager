-- ProPeloton Manager System Health: acknowledge the verified December 2026
-- pre-release hold without disguising actual incidents or restarting cron.
-- Live production function already updated on 2026-11-19.
-- Read-only admin overview; grants and admin access check are preserved.
-- Disabling cron without a VERIFIED release schedule remains an error.
CREATE OR REPLACE FUNCTION public.get_admin_system_health_overview_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_temp'
AS $function$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_app_admin_v1() then raise exception 'Administrator access required' using errcode='42501'; end if;
 with pr as (
   select p.*,lr.status latest_status,lr.started_at latest_started_at,lr.finished_at latest_finished_at,
     lr.duration_ms latest_duration_ms,lr.summary latest_summary,lr.error_message latest_error_message,
     cj.active cron_active,
     (select count(*)::int from public.system_incidents i where i.process_key=p.process_key and i.status in ('open','acknowledged')) open_incidents
   from public.system_monitor_processes p
   left join lateral(select * from public.system_monitor_runs r where r.process_key=p.process_key order by r.started_at desc limit 1) lr on true
   left join cron.job cj on p.source_kind='cron' and cj.jobname=p.source_ref
   where p.is_enabled
 )
 select jsonb_build_object(
   'summary',jsonb_build_object(
     'open_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged')),
     'critical_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged') and severity='critical'),
     'high_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged') and severity='high'),
     'warning_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged') and severity='warning'),
     'monitored_processes',(select count(*) from public.system_monitor_processes where is_enabled),
     'user_sensitive_processes',(select count(*) from public.system_monitor_processes where is_enabled and user_sensitive),
     'alert_email',(select alert_email from public.system_health_config_v1 where id=true)
   ),
   'processes',coalesce((select jsonb_agg(jsonb_build_object(
     'process_key',process_key,'label',label,'category',category,'description',description,'source_kind',source_kind,'source_ref',source_ref,
     'user_sensitive',user_sensitive,'incident_severity',incident_severity,'expected_interval_minutes',expected_interval_minutes,
     'stale_after_minutes',stale_after_minutes,'latest_status',latest_status,'latest_started_at',latest_started_at,
     'latest_finished_at',latest_finished_at,'latest_duration_ms',latest_duration_ms,'latest_summary',latest_summary,
     'latest_error_message',latest_error_message,'cron_active',cron_active,'open_incidents',open_incidents
   ) order by sort_order,label) from pr),'[]'::jsonb),
   'incidents',coalesce((select jsonb_agg(jsonb_build_object(
     'id',i.id,'process_key',i.process_key,'process_label',p.label,'category',p.category,'severity',i.severity,'status',i.status,
     'title',i.title,'message',i.message,'details',i.details,'first_seen_at',i.first_seen_at,'last_seen_at',i.last_seen_at,
     'occurrence_count',i.occurrence_count,'last_emailed_at',i.last_emailed_at,'acknowledged_at',i.acknowledged_at,
     'resolved_at',i.resolved_at,'resolution_note',i.resolution_note,
     'is_unread',not exists(select 1 from public.system_incident_admin_reads rr where rr.incident_id=i.id and rr.admin_user_id=auth.uid())
   ) order by case i.severity when 'critical' then 1 when 'high' then 2 else 3 end,i.last_seen_at desc)
   from public.system_incidents i join public.system_monitor_processes p on p.process_key=i.process_key
   where i.status in ('open','acknowledged')),'[]'::jsonb)
 ) into result;
 return result || jsonb_build_object(
   'national_championship_lifecycle',public.national_championship_lifecycle_overview_v1(),
   'release_hold',coalesce((
     select jsonb_build_object(
       'active',coalesce(
          ctl.status='scheduled' and ctl.launched_at is null
          and now()<ctl.release_at
          and j.active=true
          and r.status='completed'
          and (r.validation_report->>'ok')::boolean=true
          and (select count(*) from private.game_world_reset_cron_snapshot_v1 s
               where s.reset_run_id=ctl.reset_run_id and s.originally_active)=64
          and c.is_paused and g.is_paused
          and g.season_number=1 and g.month_number=1 and g.day_number=1
          and g.hour_number=1 and g.minute_number=0,
          false
       ),
       'release_at',ctl.release_at,
       'mode','scheduled_prelaunch_hold'
     )
     from private.ppm_december_2026_release_control_v1 ctl
     left join public.game_world_reset_runs r on r.id=ctl.reset_run_id
     cross join public.game_clock_config c
     cross join public.game_state g
     left join cron.job j on j.jobname='ppm-december-2026-release-v1'
     where ctl.id=true and c.id=true and g.id=true
   ),jsonb_build_object('active',false))
 );
end;
$function$

