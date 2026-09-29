insert into public.notification_types(
  code,name,source,icon_name,priority,is_active,preference_group,default_image_url
)
values
  ('NATIONS_RACE_RESULT','World Nations Race Result','game','flag',72,true,'races',null),
  ('NATIONS_FINAL_RESULT','World Nations Final Result','game','trophy',90,true,'races',null)
on conflict(code) do update
set name=excluded.name,
    source=excluded.source,
    icon_name=excluded.icon_name,
    priority=excluded.priority,
    is_active=true,
    preference_group=excluded.preference_group;

create or replace function private.notify_nations_event_result_v1(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_event public.nations_group_events%rowtype;
  v_group public.nations_competition_groups%rowtype;
  v_round public.nations_competition_rounds%rowtype;
  v_entry record;
  v_team_id uuid;
  v_team_rank integer;
  v_positions integer[];
  v_event_points integer;
  v_best_rank integer;
  v_top_three jsonb;
  v_race_label text;
  v_message text;
  v_count integer:=0;
begin
  select * into v_event
  from public.nations_group_events
  where id=p_event_id;

  if v_event.id is null or v_event.status<>'completed' or v_event.stage_id is null then
    return 0;
  end if;

  select * into v_group
  from public.nations_competition_groups
  where id=v_event.group_id;

  select * into v_round
  from public.nations_competition_rounds
  where id=v_group.round_id;

  v_race_label:=case v_event.race_type
    when 'team_time_trial' then 'Team Time Trial'
    when 'flat_road_race' then 'Flat Road Race'
    else 'Hilly / Mountain Road Race'
  end;

  for v_entry in
    select
      nge.id as group_entry_id,
      ce.association_id,
      ce.country_code,
      a.name as association_name
    from public.nations_group_entries nge
    join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
    join public.national_associations a on a.id=ce.association_id
    where nge.group_id=v_group.id
      and nge.status<>'withdrawn'
    order by ce.country_code
  loop
    select technical_club_id
    into v_team_id
    from public.national_association_race_team_identities
    where association_id=v_entry.association_id;

    v_team_rank:=null;
    v_positions:='{}'::integer[];
    v_event_points:=0;
    v_best_rank:=null;
    v_top_three:='[]'::jsonb;

    if v_event.race_type='team_time_trial' then
      select ts.team_rank
      into v_team_rank
      from public.race_stage_team_states ts
      join public.race_stage_simulation_runs sr on sr.id=ts.simulation_run_id
      where ts.stage_id=v_event.stage_id
        and ts.team_id=v_team_id
        and sr.status='completed'
      order by sr.created_at desc
      limit 1;

      v_event_points:=public.nations_ttt_points_v1(coalesce(v_team_rank,999));
      v_best_rank:=v_team_rank;
      v_message:=v_entry.country_code||' finished '||
        case when v_team_rank is null then 'without a classified team result'
             else '#'||v_team_rank::text end||
        ' in the '||v_race_label||' and earned '||v_event_points::text||
        ' Nations point(s).';
    else
      select coalesce(array_agg(x.rank order by x.rank),'{}'::integer[])
      into v_positions
      from (
        select r.rank
        from public.race_stage_results r
        where r.stage_id=v_event.stage_id
          and r.team_id=v_team_id
          and r.status='finished'
          and r.rank is not null
        order by r.rank
      ) x;

      select min(x.rank)
      into v_best_rank
      from unnest(v_positions) x(rank);

      select coalesce(jsonb_agg(
        jsonb_build_object(
          'rank',x.rank,
          'rider_id',x.rider_id,
          'rider_name',x.rider_name_snapshot
        ) order by x.rank
      ),'[]'::jsonb)
      into v_top_three
      from (
        select r.rank,r.rider_id,r.rider_name_snapshot
        from public.race_stage_results r
        where r.stage_id=v_event.stage_id
          and r.team_id=v_team_id
          and r.status='finished'
          and r.rank is not null
        order by r.rank
        limit 3
      ) x;

      v_event_points:=public.calculate_nation_road_race_points_v1(v_positions);
      v_message:=v_entry.country_code||' earned '||v_event_points::text||
        ' Nations point(s) in the '||v_race_label||
        '. The best three riders count toward the nation score.';
    end if;

    perform private.notify_national_association_members_v1(
      v_entry.association_id,
      'NATIONS_RACE_RESULT',
      v_round.round_label||' · Day '||v_event.race_day::text||' completed',
      v_message,
      case when v_event.race_id is not null
        then '/dashboard/races/'||v_event.race_id::text
        else '/dashboard/world-nations'
      end,
      jsonb_build_object(
        'event_id',v_event.id,
        'race_id',v_event.race_id,
        'stage_id',v_event.stage_id,
        'race_day',v_event.race_day,
        'race_type',v_event.race_type,
        'race_label',v_race_label,
        'event_date',v_event.event_date,
        'round_id',v_round.id,
        'round_type',v_round.round_type,
        'round_label',v_round.round_label,
        'group_id',v_group.id,
        'group_label',v_group.group_label,
        'association_id',v_entry.association_id,
        'association_name',v_entry.association_name,
        'country_code',v_entry.country_code,
        'event_points',v_event_points,
        'nation_race_rank',v_team_rank,
        'best_rider_rank',v_best_rank,
        'top_three_riders',v_top_three,
        'world_nations_path','/dashboard/world-nations'
      ),
      'nations-race-result:'||v_event.id::text||':'||v_entry.association_id::text
    );
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$;

revoke all on function private.notify_nations_event_result_v1(uuid)
from public,anon,authenticated;

create or replace function private.trg_notify_nations_event_result_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status='completed'
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform private.notify_nations_event_result_v1(new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_notify_nations_event_result_v1 on public.nations_group_events;
create trigger trg_notify_nations_event_result_v1
after insert or update of status
on public.nations_group_events
for each row execute function private.trg_notify_nations_event_result_v1();

create or replace function private.trg_notify_nations_final_result_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_ctx record;
begin
  if tg_op<>'UPDATE'
     or old.status is not distinct from new.status
     or new.status not in ('winner','eliminated') then
    return new;
  end if;

  select
    r.round_type,
    r.round_label,
    g.group_label,
    ce.association_id,
    ce.country_code,
    a.name as association_name
  into v_ctx
  from public.nations_competition_groups g
  join public.nations_competition_rounds r on r.id=g.round_id
  join public.nations_competition_entries ce on ce.id=new.competition_entry_id
  join public.national_associations a on a.id=ce.association_id
  where g.id=new.group_id;

  if v_ctx.round_type<>'world_final' then
    return new;
  end if;

  perform private.notify_national_association_members_v1(
    v_ctx.association_id,
    'NATIONS_FINAL_RESULT',
    'World Nations Final completed',
    v_ctx.country_code||' finished '||
      case when new.final_group_rank is null then 'the World Nations Final'
           else '#'||new.final_group_rank::text||' in the World Nations Final' end||
      ' with '||coalesce(new.total_points,0)::text||' point(s).',
    '/dashboard/world-nations',
    jsonb_build_object(
      'group_entry_id',new.id,
      'association_id',v_ctx.association_id,
      'association_name',v_ctx.association_name,
      'country_code',v_ctx.country_code,
      'round_label',v_ctx.round_label,
      'group_label',v_ctx.group_label,
      'final_group_rank',new.final_group_rank,
      'total_points',new.total_points,
      'ttt_points',new.ttt_points,
      'flat_points',new.flat_points,
      'mountain_points',new.mountain_points,
      'race_wins',new.race_wins,
      'podium_finishes',new.podium_finishes,
      'status',new.status
    ),
    'nations-final-result:'||new.id::text
  );

  return new;
end;
$function$;

drop trigger if exists trg_notify_nations_final_result_v1 on public.nations_group_entries;
create trigger trg_notify_nations_final_result_v1
after update of status
on public.nations_group_entries
for each row execute function private.trg_notify_nations_final_result_v1();

create or replace function public.process_nations_race_runtime_v2()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_core jsonb;
  v_season integer;
  v_edition_id uuid;
  v_event record;
  v_expected integer;
  v_valid_teams integer;
  v_sim_started boolean;
  v_ready integer:=0;
  v_blocked integer:=0;
begin
  v_core:=public.process_nations_race_runtime_v1();

  select season_number into v_season
  from public.game_state where id=true;

  select id into v_edition_id
  from public.nations_competition_editions
  where season_number=v_season
    and status<>'completed'
  limit 1;

  if v_edition_id is null then
    return coalesce(v_core,'{}'::jsonb)
      || jsonb_build_object('race_gates_ready',0,'race_gates_blocked',0);
  end if;

  for v_event in
    select e.id,e.group_id,e.race_id,e.stage_id,e.status
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id=e.group_id
    join public.nations_competition_rounds r on r.id=g.round_id
    where r.edition_id=v_edition_id
      and e.race_id is not null
      and e.stage_id is not null
      and e.status not in ('completed','cancelled')
  loop
    select count(*)::integer
    into v_expected
    from public.nations_group_entries nge
    where nge.group_id=v_event.group_id
      and nge.status<>'withdrawn';

    select count(*)::integer
    into v_valid_teams
    from (
      select rpr.team_id
      from public.race_participant_riders rpr
      where rpr.race_id=v_event.race_id
        and rpr.team_id is not null
      group by rpr.team_id
      having count(*)=7
    ) x;

    select exists(
      select 1
      from public.race_stage_simulation_runs sr
      where sr.stage_id=v_event.stage_id
        and sr.status in ('running','completed')
    )
    into v_sim_started;

    update public.race_entry_rules
    set target_teams=greatest(v_expected,1),
        min_teams=greatest(v_expected,1),
        max_teams=greatest(v_expected,1),
        min_riders_per_team=7,
        max_riders_per_team=7,
        applications_status='closed',
        updated_at=now()
    where race_id=v_event.race_id;

    if not v_sim_started then
      if v_expected>0 and v_valid_teams=v_expected then
        update public.races
        set status='scheduled',updated_at=now()
        where id=v_event.race_id
          and status in ('draft','scheduled');

        update public.nations_group_events
        set status='ready',
            metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
              'race_gate_ready',true,
              'expected_teams',v_expected,
              'valid_7_rider_teams',v_valid_teams
            ),
            updated_at=now()
        where id=v_event.id
          and status not in ('running','completed','cancelled');

        v_ready:=v_ready+1;
      else
        update public.races
        set status='draft',updated_at=now()
        where id=v_event.race_id
          and status in ('draft','scheduled');

        update public.nations_group_events
        set status='waiting_for_lineups',
            metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
              'race_gate_ready',false,
              'expected_teams',v_expected,
              'valid_7_rider_teams',v_valid_teams
            ),
            updated_at=now()
        where id=v_event.id
          and status not in ('running','completed','cancelled');

        v_blocked:=v_blocked+1;
      end if;
    end if;
  end loop;

  return coalesce(v_core,'{}'::jsonb)
    || jsonb_build_object(
      'race_gates_ready',v_ready,
      'race_gates_blocked',v_blocked
    );
end;
$function$;

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
  v_lineup_blocked integer:=0;
  v_unsafe_races integer:=0;
  v_issue_count integer:=0;
  v_details jsonb;
  v_summary text;
begin
  select season_number into v_season
  from public.game_state where id=true;

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
      and e.status in ('planned','scheduled','ready','waiting_for_lineups');

    select count(*)::integer
    into v_lineup_blocked
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id=e.group_id
    join public.nations_competition_rounds r on r.id=g.round_id
    where r.edition_id=v_edition_id
      and e.event_date between v_today and v_today+3
      and e.status not in ('completed','cancelled','running')
      and (
        e.race_id is null
        or (
          select count(*)
          from (
            select rpr.team_id
            from public.race_participant_riders rpr
            where rpr.race_id=e.race_id
              and rpr.team_id is not null
            group by rpr.team_id
            having count(*)=7
          ) ready_teams
        ) < (
          select count(*)
          from public.nations_group_entries nge
          where nge.group_id=e.group_id
            and nge.status<>'withdrawn'
        )
      );

    select count(*)::integer
    into v_unsafe_races
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id=e.group_id
    join public.nations_competition_rounds r on r.id=g.round_id
    join public.races rr on rr.id=e.race_id
    where r.edition_id=v_edition_id
      and rr.status in ('scheduled','active')
      and e.status not in ('completed','cancelled','running')
      and (
        select count(*)
        from (
          select rpr.team_id
          from public.race_participant_riders rpr
          where rpr.race_id=e.race_id
            and rpr.team_id is not null
          group by rpr.team_id
          having count(*)=7
        ) ready_teams
      ) < (
        select count(*)
        from public.nations_group_entries nge
        where nge.group_id=e.group_id
          and nge.status<>'withdrawn'
      );
  end if;

  select count(*)::integer
  into v_bad_squads
  from public.national_team_squads s
  where s.season_number=v_season
    and s.cycle_key like 'nations:%'
    and s.status in ('confirmed','on_duty')
    and (
      select count(*)
      from public.national_team_squad_members sm
      where sm.squad_id=s.id
    )<>10;

  select count(*)::integer
  into v_bad_lineups
  from public.national_team_lineups l
  join public.national_team_squads s on s.id=l.squad_id
  where s.season_number=v_season
    and s.cycle_key like 'nations:%'
    and l.status in ('confirmed','locked','completed')
    and (
      select count(*)
      from public.national_team_lineup_members lm
      where lm.lineup_id=l.id
    )<>7;

  v_issue_count :=
    case
      when v_today>=v_generation_gate and v_active_associations>0 and v_edition_id is null then 1
      else 0
    end
    + v_unscheduled
    + v_drawn_empty
    + v_overdue_events
    + v_bad_squads
    + v_bad_lineups
    + v_lineup_blocked
    + v_unsafe_races;

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
    'invalid_lineups',v_bad_lineups,
    'lineup_blocked_events_next_3_days',v_lineup_blocked,
    'unsafe_scheduled_events',v_unsafe_races
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

create or replace function public.process_national_association_nations_runtime_v4()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_core jsonb;
  v_races jsonb;
  v_health jsonb;
begin
  v_core:=public.process_national_association_nations_runtime_v1();
  v_races:=public.process_nations_race_runtime_v2();
  v_health:=public.check_nations_operations_health_v1();

  return coalesce(v_core,'{}'::jsonb)
    || jsonb_build_object(
      'race_runtime',v_races,
      'operations_health',v_health
    );
end;
$function$;

create or replace function public.run_admin_nations_runtime_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not public.is_app_admin_v1() then
    raise exception 'Administrator access required.';
  end if;

  return public.process_national_association_nations_runtime_v4();
end;
$function$;

do $$
begin
  if exists(select 1 from cron.job where jobname='national-association-nations-runtime-v1') then
    perform cron.unschedule('national-association-nations-runtime-v1');
  end if;
end
$$;

select cron.schedule(
  'national-association-nations-runtime-v1',
  '*/15 * * * *',
  'select public.process_national_association_nations_runtime_v4();'
);
