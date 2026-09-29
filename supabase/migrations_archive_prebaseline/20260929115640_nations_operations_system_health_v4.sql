-- Monitor National Association and World Nations runtime in System Health.

insert into public.system_monitor_processes(
  process_key,label,category,description,source_kind,source_ref,
  user_sensitive,incident_severity,expected_interval_minutes,stale_after_minutes,
  email_alerts_enabled,is_enabled,sort_order
)
values
(
  'cron:national-association-nations-runtime-v1',
  'National Association & World Nations runtime',
  'Championship Operations',
  'Maintains National Association eligibility and elections, National Team call-ups/duty, World Nations scheduling, round draws and host selection.',
  'cron',
  'national-association-nations-runtime-v1',
  true,'critical',15,45,true,true,122
),
(
  'check:nations_operations',
  'National Association & World Nations operations',
  'Championship Operations',
  'Validates the World Nations edition, schedules, group draws, overdue events, National Team squads and seven-rider lineups.',
  'business_check',
  null,
  true,'critical',15,45,true,true,406
)
on conflict(process_key) do update
set label=excluded.label,
    category=excluded.category,
    description=excluded.description,
    source_kind=excluded.source_kind,
    source_ref=excluded.source_ref,
    user_sensitive=excluded.user_sensitive,
    incident_severity=excluded.incident_severity,
    expected_interval_minutes=excluded.expected_interval_minutes,
    stale_after_minutes=excluded.stale_after_minutes,
    email_alerts_enabled=excluded.email_alerts_enabled,
    is_enabled=excluded.is_enabled,
    sort_order=excluded.sort_order,
    updated_at=now();

create or replace function public.check_nations_operations_health_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_season integer;
  v_generation_gate date;
  v_active_associations integer:=0;
  v_edition_id uuid;
  v_unscheduled integer:=0;
  v_drawn_empty integer:=0;
  v_overdue_events integer:=0;
  v_bad_squads integer:=0;
  v_bad_lineups integer:=0;
  v_issue_count integer:=0;
  v_details jsonb;
  v_summary text;
begin
  select season_number into v_season
  from public.game_state
  where id=true;

  v_generation_gate:=public.game_date_from_parts(v_season,1,28);

  select count(*)::integer
  into v_active_associations
  from public.national_associations a
  where a.status='active'
    and private.national_association_active_member_count_v1(a.id)>=(
      select minimum_active_members
      from public.national_association_config
      where id=true
    );

  select id into v_edition_id
  from public.nations_competition_editions
  where season_number=v_season
  limit 1;

  if v_edition_id is not null then
    select count(*)::integer
    into v_unscheduled
    from public.nations_competition_groups g
    join public.nations_competition_rounds r on r.id=g.round_id
    where r.edition_id=v_edition_id
      and (
        r.starts_on_game_date is null
        or r.ends_on_game_date is null
        or (
          select count(*)
          from public.nations_group_events e
          where e.group_id=g.id
            and e.event_date is not null
        )<>3
      );

    select count(*)::integer
    into v_drawn_empty
    from public.nations_competition_groups g
    join public.nations_competition_rounds r on r.id=g.round_id
    where r.edition_id=v_edition_id
      and r.status in ('drawn','active','in_progress')
      and g.status in ('drawn','active','in_progress')
      and not exists(
        select 1 from public.nations_group_entries nge where nge.group_id=g.id
      );

    select count(*)::integer
    into v_overdue_events
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id=e.group_id
    join public.nations_competition_rounds r on r.id=g.round_id
    where r.edition_id=v_edition_id
      and e.event_date<v_today
      and e.status in ('planned','scheduled','ready');
  end if;

  select count(*)::integer
  into v_bad_squads
  from public.national_team_squads s
  where s.season_number=v_season
    and s.cycle_key like 'nations:%'
    and s.status in ('confirmed','on_duty')
    and (
      select count(*) from public.national_team_squad_members sm where sm.squad_id=s.id
    )<>10;

  select count(*)::integer
  into v_bad_lineups
  from public.national_team_lineups l
  join public.national_team_squads s on s.id=l.squad_id
  where s.season_number=v_season
    and s.cycle_key like 'nations:%'
    and l.status in ('confirmed','locked','completed')
    and (
      select count(*) from public.national_team_lineup_members lm where lm.lineup_id=l.id
    )<>7;

  v_issue_count :=
    case when v_today>=v_generation_gate and v_active_associations>0 and v_edition_id is null then 1 else 0 end
    + v_unscheduled + v_drawn_empty + v_overdue_events + v_bad_squads + v_bad_lineups;

  v_details:=jsonb_build_object(
    'game_date',v_today,
    'season_number',v_season,
    'generation_gate',v_generation_gate,
    'active_associations',v_active_associations,
    'edition_id',v_edition_id,
    'edition_missing_after_gate',
      v_today>=v_generation_gate and v_active_associations>0 and v_edition_id is null,
    'unscheduled_groups',v_unscheduled,
    'drawn_groups_without_entries',v_drawn_empty,
    'overdue_events',v_overdue_events,
    'invalid_confirmed_squads',v_bad_squads,
    'invalid_lineups',v_bad_lineups
  );

  v_summary:=case
    when v_issue_count=0 then
      case
        when v_today<v_generation_gate then 'World Nations operations are healthy; seasonal generation is waiting for the January election window.'
        when v_active_associations=0 then 'World Nations operations are healthy; no active National Associations are currently eligible.'
        else 'World Nations operations are healthy.'
      end
    else format('%s World Nations operational issue(s) detected.',v_issue_count)
  end;

  perform public.log_system_business_check_v1(
    'check:nations_operations',
    case when v_issue_count>0 then 'error' else 'success' end,
    v_summary,
    v_details
  );

  if v_issue_count>0 then
    perform public.raise_system_incident_v1(
      'check:nations_operations',
      'critical',
      'World Nations operations require attention',
      v_summary,
      'business:nations-operations',
      v_details
    );
  else
    perform public.resolve_system_incident_by_dedupe_v1(
      'business:nations-operations',
      'World Nations operations are healthy.'
    );
  end if;

  return jsonb_build_object(
    'status',case when v_issue_count>0 then 'error' else 'success' end,
    'issues',v_issue_count,
    'summary',v_summary,
    'details',v_details
  );
end;
$function$;

create or replace function public.process_national_association_nations_runtime_v2()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_runtime jsonb;
  v_health jsonb;
begin
  v_runtime:=public.process_national_association_nations_runtime_v1();
  v_health:=public.check_nations_operations_health_v1();
  return coalesce(v_runtime,'{}'::jsonb)
    || jsonb_build_object('operations_health',v_health);
end;
$function$;

grant execute on function public.check_nations_operations_health_v1() to service_role;
grant execute on function public.process_national_association_nations_runtime_v2() to service_role;

do $do$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname='national-association-nations-runtime-v1'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'national-association-nations-runtime-v1',
    '*/15 * * * *',
    'select public.process_national_association_nations_runtime_v2();'
  );
end;
$do$;
