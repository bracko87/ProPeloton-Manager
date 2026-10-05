create or replace function public.monitor_youth_competition_health_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  s timestamptz:=clock_timestamp();
  gd date:=public.get_current_game_date_date();
  v_underfilled integer:=0;
  v_missing_runtime integer:=0;
  v_world integer:=0;
  v_west integer:=0;
  v_east integer:=0;
  v_issues integer:=0;
begin
  select count(*) into v_underfilled
  from public.youth_races r
  where r.status='scheduled' and r.race_date>gd and r.race_date<=gd+7
    and (select count(*) from public.youth_race_entries e where e.race_id=r.id and e.status in ('entered','completed')) < r.team_limit;

  select count(*) into v_missing_runtime
  from public.youth_races r
  where r.status='scheduled' and r.race_date>=gd and r.race_date<=gd+14
    and (r.planned_start_hour_number is null or not exists(select 1 from public.youth_race_stages s2 where s2.race_id=r.id));

  select count(*) into v_world from public.youth_academy_competition_memberships
  where season_number=public.get_current_season_number() and competition_class='world';
  select count(*) into v_west from public.youth_academy_competition_memberships
  where season_number=public.get_current_season_number() and division_code='CONTINENTAL_WEST';
  select count(*) into v_east from public.youth_academy_competition_memberships
  where season_number=public.get_current_season_number() and division_code='CONTINENTAL_EAST';

  v_issues:=(case when v_underfilled>0 then 1 else 0 end)
           +(case when v_missing_runtime>0 then 1 else 0 end)
           +(case when v_world<>16 then 1 else 0 end)
           +(case when v_west<>20 then 1 else 0 end)
           +(case when v_east<>20 then 1 else 0 end);

  perform public.log_system_business_check_v1(
    'check:youth_competition',
    case when v_issues>0 then 'warning' else 'success' end,
    case when v_issues>0 then format('Youth competition has %s health area(s) requiring attention.',v_issues)
         else 'Youth Academy competition scheduling, fields and hierarchy are healthy.' end,
    jsonb_build_object('underfilled_within_7_days',v_underfilled,'missing_runtime_within_14_days',v_missing_runtime,
      'world_teams',v_world,'continental_west_teams',v_west,'continental_east_teams',v_east)
  );

  if v_issues>0 then
    perform public.raise_system_incident_v1(
      'check:youth_competition','high','Youth Academy competition requires attention',
      format('Underfilled races: %s; missing runtime: %s; World/West/East sizes: %s/%s/%s.',
        v_underfilled,v_missing_runtime,v_world,v_west,v_east),
      'business:youth-competition',
      jsonb_build_object('underfilled_within_7_days',v_underfilled,'missing_runtime_within_14_days',v_missing_runtime,
        'world_teams',v_world,'continental_west_teams',v_west,'continental_east_teams',v_east)
    );
  else
    perform public.resolve_system_incident_by_dedupe_v1('business:youth-competition','Youth Academy competition scheduling, fields and hierarchy are healthy.');
  end if;

  insert into public.system_monitor_runs(process_key,status,started_at,finished_at,duration_ms,summary,details)
  values('check:youth_competition',
    case when v_issues>0 then 'warning' else 'success' end,
    s,clock_timestamp(),greatest(0,(extract(epoch from(clock_timestamp()-s))*1000)::bigint),
    case when v_issues>0 then 'Youth Academy competition health has active warnings.' else 'Youth Academy competition health is green.' end,
    jsonb_build_object('underfilled_within_7_days',v_underfilled,'missing_runtime_within_14_days',v_missing_runtime,
      'world_teams',v_world,'continental_west_teams',v_west,'continental_east_teams',v_east)
  );

  return jsonb_build_object('status',case when v_issues>0 then 'warning' else 'success' end,
    'underfilled_within_7_days',v_underfilled,'missing_runtime_within_14_days',v_missing_runtime,
    'world_teams',v_world,'continental_west_teams',v_west,'continental_east_teams',v_east);
end;
$function$;

create or replace function public.get_admin_youth_race_operations_v1(p_days integer default 14)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare gd date:=public.get_current_game_date_date();
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;

  return jsonb_build_object(
    'game_date',gd,
    'allocation_window_days',14,
    'final_fill_days',7,
    'races',coalesce((
      select jsonb_agg(x.item order by x.race_date,x.start_hour,x.race_name)
      from (
        select
          r.race_date,
          coalesce(r.planned_start_hour_number,99) start_hour,
          r.race_name,
          jsonb_build_object(
            'race_id',r.id,'race_name',r.race_name,'race_date',r.race_date,
            'competition_class',r.competition_class,'division_code',r.division_code,
            'team_limit',r.team_limit,
            'entries_count',(select count(*) from public.youth_race_entries e where e.race_id=r.id and e.status in ('entered','completed')),
            'planned_start_time_label',r.planned_start_time_label,'start_time_region_code',r.start_time_region_code,
            'stage_count',(select count(*) from public.youth_race_stages ys where ys.race_id=r.id),
            'scheduled_stage_count',(select count(*) from public.youth_race_stages ys where ys.race_id=r.id and ys.status='scheduled'),
            'health',case
              when r.race_date<=gd+7 and (select count(*) from public.youth_race_entries e where e.race_id=r.id and e.status in ('entered','completed'))<r.team_limit then 'warning'
              when r.planned_start_hour_number is null or not exists(select 1 from public.youth_race_stages ys where ys.race_id=r.id) then 'warning'
              else 'healthy' end
          ) item
        from public.youth_races r
        where r.status='scheduled' and r.race_date>=gd and r.race_date<=gd+greatest(1,p_days)
      ) x
    ),'[]'::jsonb)
  );
end;
$function$;

insert into public.system_monitor_processes(
 process_key,label,category,description,source_kind,source_ref,user_sensitive,
 incident_severity,expected_interval_minutes,stale_after_minutes,email_alerts_enabled,is_enabled,sort_order
) values
 ('check:youth_competition','Youth Academy competition','gameplay','Monitors Youth race fields, stage runtime/start times and World/Continental hierarchy.','business_check',null,true,'high',60,180,true,true,265)
on conflict(process_key) do update set
 label=excluded.label,category=excluded.category,description=excluded.description,
 user_sensitive=excluded.user_sensitive,incident_severity=excluded.incident_severity,
 expected_interval_minutes=excluded.expected_interval_minutes,stale_after_minutes=excluded.stale_after_minutes,
 email_alerts_enabled=excluded.email_alerts_enabled,is_enabled=excluded.is_enabled,sort_order=excluded.sort_order;
