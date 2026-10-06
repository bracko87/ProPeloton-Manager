-- Youth race responsibility + variable field sizes v10
-- Manager controls follow the assigned race-participation responsibility.
-- Race fields vary naturally from 6 to 20 teams instead of being forced to 16.

create or replace function private.youth_race_target_teams_v10(
  p_race_id uuid,
  p_competition_class text
)
returns integer
language sql
immutable
set search_path=pg_temp
as $function$
  select case lower(coalesce(p_competition_class,'regional'))
    when 'world' then
      (array[10,12,14,16,18,20])[
        1 + mod(
          ascii(substr(md5(p_race_id::text),1,1)) +
          ascii(substr(md5(p_race_id::text),2,1)),
          6
        )
      ]
    when 'continental' then
      (array[8,10,12,14,16,18])[
        1 + mod(
          ascii(substr(md5(p_race_id::text),1,1)) +
          ascii(substr(md5(p_race_id::text),2,1)),
          6
        )
      ]
    else
      (array[6,8,10,12,14,16])[
        1 + mod(
          ascii(substr(md5(p_race_id::text),1,1)) +
          ascii(substr(md5(p_race_id::text),2,1)),
          6
        )
      ]
  end;
$function$;

create or replace function private.enforce_youth_variable_field_v10()
returns trigger
language plpgsql
set search_path=public,private,pg_temp
as $function$
begin
  if new.status='scheduled' then
    new.team_limit:=20;
    new.min_teams:=6;
    new.target_teams:=private.youth_race_target_teams_v10(
      new.id,new.competition_class
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists youth_variable_field_v10 on public.youth_races;
create trigger youth_variable_field_v10
before insert or update of status,competition_class,team_limit,min_teams,target_teams
on public.youth_races
for each row
execute function private.enforce_youth_variable_field_v10();

-- Apply the varied targets to all currently scheduled races.
update public.youth_races
set
  team_limit=20,
  min_teams=6,
  target_teams=private.youth_race_target_teams_v10(id,competition_class),
  updated_at=now()
where status='scheduled';

-- Trim only excess AI entries. Human/user entries are always preserved.
create temporary table pg_temp.youth_v10_ai_trim
on commit drop
as
with ranked as (
  select
    e.id entry_id,
    e.race_id,
    e.academy_id,
    r.season_number,
    r.target_teams,
    (
      select count(*)::integer
      from public.youth_race_entries h
      join public.youth_academies ha on ha.id=h.academy_id
      where h.race_id=e.race_id
        and h.status in ('entered','completed')
        and not ha.is_ai
    ) human_count,
    row_number() over(
      partition by e.race_id
      order by
        case
          when private.youth_regional_division_for_country_v1(c.country_code)=
               private.youth_regional_division_for_country_v1(r.host_country_code)
          then 0 else 1
        end,
        private.youth_academy_strength_v1(a.id) desc,
        e.id
    )::integer ai_rank
  from public.youth_race_entries e
  join public.youth_races r on r.id=e.race_id
  join public.youth_academies a on a.id=e.academy_id and a.is_ai
  join public.clubs c on c.id=a.club_id
  where r.status='scheduled'
    and r.race_date>public.get_current_game_date_date()
    and e.status='entered'
)
select entry_id,race_id,academy_id,season_number
from ranked
where ai_rank>greatest(0,target_teams-human_count);

delete from public.youth_race_lineups l
using pg_temp.youth_v10_ai_trim x
where l.entry_id=x.entry_id;

with refunds as (
  select
    x.academy_id,
    x.season_number,
    sum(abs(l.amount))::bigint refund_amount
  from pg_temp.youth_v10_ai_trim x
  join public.youth_academy_ledger l
    on l.academy_id=x.academy_id
   and l.category='race_travel'
   and l.metadata->>'race_id'=x.race_id::text
  group by x.academy_id,x.season_number
)
update public.youth_academy_season_budgets b
set
  spent_amount=greatest(0,b.spent_amount-r.refund_amount),
  updated_at=now()
from refunds r
where b.academy_id=r.academy_id
  and b.season_number=r.season_number;

delete from public.youth_academy_ledger l
using pg_temp.youth_v10_ai_trim x
where l.academy_id=x.academy_id
  and l.category='race_travel'
  and l.metadata->>'race_id'=x.race_id::text;

update public.youth_race_entries e
set status='withdrawn',updated_at=now()
from pg_temp.youth_v10_ai_trim x
where e.id=x.entry_id;

update public.youth_race_invitations i
set
  status='declined',
  responded_on=public.get_current_game_date_date(),
  metadata=coalesce(i.metadata,'{}'::jsonb)||
    jsonb_build_object(
      'field_trim_v10',true,
      'field_trim_reason','variable_target'
    ),
  updated_at=now()
from pg_temp.youth_v10_ai_trim x
where i.race_id=x.race_id
  and i.academy_id=x.academy_id
  and i.status in ('pending','accepted');

create or replace function private.fill_youth_race_field_v2(
  p_race_id uuid,
  p_game_date date,
  p_final_fill boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  r public.youth_races%rowtype;
  x record;
  current_count integer:=0;
  v_target integer:=6;
  e_id uuid;
  requested_strategy text:='balanced';
begin
  select * into r
  from public.youth_races
  where id=p_race_id
  for update;

  if r.id is null or r.status<>'scheduled' or r.race_date<=p_game_date then
    return jsonb_build_object('race_id',p_race_id,'reason','not_open');
  end if;

  v_target:=least(
    coalesce(r.team_limit,20),
    greatest(
      6,
      coalesce(
        r.target_teams,
        private.youth_race_target_teams_v10(r.id,r.competition_class)
      )
    )
  );

  select count(*)::integer
  into current_count
  from public.youth_race_entries e
  where e.race_id=r.id
    and e.status in ('entered','completed');

  if current_count>=v_target then
    return jsonb_build_object(
      'race_id',r.id,
      'teams',current_count,
      'target_teams',v_target,
      'team_limit',coalesce(r.team_limit,20),
      'target_met',true
    );
  end if;

  for x in
    select
      a.id academy_id,
      c.country_code,
      m.competition_class membership_class,
      (
        select count(*)::integer
        from public.youth_race_entries me
        join public.youth_races mr on mr.id=me.race_id
        where me.academy_id=a.id
          and me.status in ('entered','completed')
          and mr.season_number=r.season_number
          and extract(month from mr.race_date)=extract(month from r.race_date)
      ) monthly_starts
    from public.youth_academies a
    join public.clubs c on c.id=a.club_id
    left join public.youth_academy_competition_memberships m
      on m.academy_id=a.id and m.season_number=r.season_number
    where a.is_active
      and a.is_ai
      and c.deleted_at is null
      and not exists(
        select 1
        from public.youth_race_entries e
        where e.race_id=r.id
          and e.academy_id=a.id
          and e.status in ('entered','completed')
      )
      and (
        select count(*)
        from public.youth_riders yr
        where yr.academy_id=a.id
          and yr.status='academy'
          and private.youth_rider_available_for_race_v1(yr.id,r.id)
      )>=3
    order by
      case
        when private.youth_regional_division_for_country_v1(c.country_code)=
             private.youth_regional_division_for_country_v1(r.host_country_code)
        then 0 else 1
      end,
      case
        when private.youth_continental_division_for_country_v1(c.country_code)=
             private.youth_continental_division_for_country_v1(r.host_country_code)
        then 0 else 1
      end,
      case when m.competition_class=r.competition_class then 0 else 1 end,
      monthly_starts,
      private.youth_academy_strength_v1(a.id) desc,
      a.id
  loop
    exit when current_count>=v_target;

    insert into public.youth_race_invitations(
      race_id,academy_id,invitation_type,status,invited_on,response_deadline,
      priority_score,metadata
    )
    values(
      r.id,x.academy_id,'wildcard','pending',
      p_game_date,r.race_date-7,500,
      jsonb_build_object(
        'source','ai_variable_field_filler_v10',
        'target_teams',v_target
      )
    )
    on conflict(race_id,academy_id) do update
    set
      status=case
        when public.youth_race_invitations.status='accepted'
          then 'accepted'
        else 'pending'
      end,
      response_deadline=excluded.response_deadline,
      metadata=coalesce(public.youth_race_invitations.metadata,'{}'::jsonb)
        ||excluded.metadata,
      updated_at=now();

    perform private.ensure_youth_monthly_race_plan_v1(
      x.academy_id,r.season_number,extract(month from r.race_date)::integer
    );

    update public.youth_monthly_race_plans p
    set
      world_race_limit=6,
      continental_race_limit=10,
      regional_race_limit=6,
      max_monthly_cost=greatest(p.max_monthly_cost,250000),
      approved=true,
      approved_at=coalesce(p.approved_at,now())
    where p.academy_id=x.academy_id
      and p.season_number=r.season_number
      and p.month_number=extract(month from r.race_date)::integer;

    update public.youth_academy_season_budgets b
    set season_budget=greatest(b.season_budget,2000000),updated_at=now()
    where b.academy_id=x.academy_id
      and b.season_number=r.season_number;

    begin
      e_id:=private.enter_youth_race_v1(
        x.academy_id,r.id,'ai_head_coach',requested_strategy
      );
      if e_id is not null then
        current_count:=current_count+1;
      end if;
    exception when others then
      update public.youth_race_invitations
      set
        metadata=coalesce(metadata,'{}'::jsonb)||
          jsonb_build_object('fill_error',sqlerrm),
        updated_at=now()
      where race_id=r.id and academy_id=x.academy_id;
    end;
  end loop;

  return jsonb_build_object(
    'race_id',r.id,
    'teams',current_count,
    'target_teams',v_target,
    'team_limit',coalesce(r.team_limit,20),
    'target_met',current_count>=v_target
  );
end;
$function$;

create or replace function public.process_youth_team_allocations_v2(
  p_game_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  gd date:=coalesce(p_game_date,public.get_current_game_date_date());
  x record;
  n integer:=0;
  f integer:=0;
  staff_applications integer:=0;
  decision_result jsonb;
begin
  perform public.sync_youth_scheduled_race_invitations_v2(
    public.get_current_season_number()
  );
  staff_applications:=private.submit_due_youth_staff_applications_v1(gd);
  decision_result:=private.resolve_due_youth_race_applications_v8(gd);
  perform private.fill_due_youth_lineups_v1(gd);

  for x in
    select id,race_date
    from public.youth_races
    where status='scheduled'
      and race_date>gd
      and race_date<=gd+14
    order by race_date,id
  loop
    perform private.ensure_youth_race_runtime_v1(x.id);
    perform private.fill_youth_race_field_v2(
      x.id,gd,x.race_date<=gd+7
    );
    if x.race_date<=gd+7 then
      f:=f+1;
    end if;
    n:=n+1;
  end loop;

  return jsonb_build_object(
    'game_date',gd,
    'application_window_days',150,
    'allocation_window_days',14,
    'decision_days_before_race',7,
    'field_target_minimum',6,
    'field_target_maximum',20,
    'staff_applications',staff_applications,
    'application_decisions',decision_result,
    'races_processed',n,
    'final_decision_window_races',f
  );
end;
$function$;

-- Manual manager entry is available only when race participation belongs to Manager.
create or replace function public.enter_my_youth_race_v1(
  p_race_id uuid,
  p_strategy text default 'balanced'
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_country text;
  v_entry_decider text;
  v_game_date date:=public.get_current_game_date_date();
  v_race public.youth_races%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  select
    a.id,
    c.country_code,
    coalesce(s.race_entry_decider,'u16_head_coach')
  into v_academy_id,v_country,v_entry_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  left join private.youth_effective_settings_v1 s on s.academy_id=a.id
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and a.is_active=true
  limit 1;

  if v_academy_id is null then
    raise exception 'Youth Academy is not activated';
  end if;
  if v_entry_decider<>'manager' then
    raise exception 'Race participation is delegated to the U16 Head Coach.';
  end if;

  select * into v_race
  from public.youth_races
  where id=p_race_id
  for update;

  if v_race.id is null or v_race.status<>'scheduled' then
    raise exception 'Youth race is not open for applications';
  end if;
  if v_race.race_date<=v_game_date+7 then
    raise exception 'Applications close 7 game days before the race';
  end if;
  if v_race.race_date>v_game_date+150 then
    raise exception 'Applications open 150 game days before the race';
  end if;
  if v_race.competition_class='regional'
     and private.youth_regional_division_for_country_v1(v_country)<>v_race.division_code then
    raise exception 'This Regional race belongs to another Youth market division';
  end if;

  if exists(
    select 1 from public.youth_race_entries e
    where e.race_id=p_race_id
      and e.academy_id=v_academy_id
      and e.status in ('entered','completed')
  ) then
    return public.get_my_youth_race_calendar_v1();
  end if;

  insert into public.youth_race_invitations(
    race_id,academy_id,invitation_type,status,invited_on,response_deadline,
    priority_score,metadata
  )
  values(
    p_race_id,v_academy_id,
    case when v_race.competition_class='regional'
      then 'regional_local' else 'wildcard' end,
    'pending',v_game_date,v_race.race_date-7,2000,
    jsonb_build_object(
      'source','manager_application_v10',
      'manual_manager_application',true,
      'application_submitted_on',v_game_date,
      'application_source','manager',
      'requested_strategy',
        case when p_strategy in ('conservative','balanced','aggressive')
          then p_strategy else 'balanced' end,
      'application_decision_on',v_race.race_date-7
    )
  )
  on conflict(race_id,academy_id) do update
  set
    status='pending',
    invited_on=least(public.youth_race_invitations.invited_on,excluded.invited_on),
    response_deadline=excluded.response_deadline,
    responded_on=null,
    priority_score=greatest(public.youth_race_invitations.priority_score,excluded.priority_score),
    metadata=coalesce(public.youth_race_invitations.metadata,'{}'::jsonb)
      ||excluded.metadata,
    updated_at=now();

  if not private.youth_race_academy_qualified_v1(v_academy_id,p_race_id) then
    raise exception 'Academy does not currently have enough eligible Youth Riders';
  end if;

  return public.get_my_youth_race_calendar_v1();
end;
$function$;

-- The same ownership rule applies to withdrawal/decline actions.
create or replace function public.decline_my_youth_race_invitation_v1(
  p_race_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_entry_decider text;
  v_game_date date:=public.get_current_game_date_date();
  v_race public.youth_races%rowtype;
  v_entry public.youth_race_entries%rowtype;
  v_refund bigint:=0;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  select a.id,coalesce(s.race_entry_decider,'u16_head_coach')
  into v_academy_id,v_entry_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  left join private.youth_effective_settings_v1 s on s.academy_id=a.id
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and a.is_active=true
  limit 1;

  if v_academy_id is null then
    raise exception 'Youth Academy is not activated';
  end if;
  if v_entry_decider<>'manager' then
    raise exception 'Race participation is delegated to the U16 Head Coach.';
  end if;

  select * into v_race
  from public.youth_races
  where id=p_race_id
  for update;

  if v_race.id is null then raise exception 'Youth race not found'; end if;
  if v_race.status<>'scheduled' or v_race.race_date<=v_game_date then
    raise exception 'This Youth race can no longer be withdrawn';
  end if;

  select * into v_entry
  from public.youth_race_entries
  where race_id=p_race_id
    and academy_id=v_academy_id
    and status='entered'
  for update;

  if v_entry.id is not null then
    v_refund:=case
      when v_entry.total_participation_cost>0
        then v_entry.total_participation_cost
      else v_entry.entry_cost
    end;

    delete from public.youth_race_lineups where entry_id=v_entry.id;

    update public.youth_race_entries
    set status='withdrawn',updated_at=now()
    where id=v_entry.id;

    if v_refund>0 and not exists(
      select 1
      from public.youth_academy_ledger l
      where l.academy_id=v_academy_id
        and l.category='race_withdrawal_refund'
        and l.metadata->>'race_id'=p_race_id::text
    ) then
      update public.youth_academy_season_budgets
      set
        spent_amount=greatest(0,spent_amount-v_refund),
        updated_at=now()
      where academy_id=v_academy_id
        and season_number=v_race.season_number;

      insert into public.youth_academy_ledger(
        academy_id,season_number,game_date,category,description,amount,metadata
      )
      values(
        v_academy_id,v_race.season_number,v_game_date,
        'race_withdrawal_refund',
        'Youth race withdrawal refund: '||v_race.race_name,
        v_refund,
        jsonb_build_object(
          'race_id',p_race_id,
          'reason','manager_withdrawal'
        )
      );
    end if;
  end if;

  update public.youth_race_invitations
  set
    status='declined',
    responded_on=v_game_date,
    metadata=coalesce(metadata,'{}'::jsonb)||
      jsonb_build_object(
        'withdrawn_by_manager',true,
        'withdrawn_on',v_game_date
      ),
    updated_at=now()
  where race_id=p_race_id
    and academy_id=v_academy_id
    and status in ('pending','accepted','waitlist');

  if v_entry.id is null and not found then
    raise exception 'No pending application or entered Youth race found';
  end if;

  return public.get_my_youth_race_calendar_v1();
end;
$function$;

create or replace function public.monitor_youth_competition_health_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  s timestamptz:=clock_timestamp();
  gd date:=public.get_current_game_date_date();
  v_under_target integer:=0;
  v_cold integer:=0;
  v_missing_runtime integer:=0;
  v_world integer:=0;
  v_west integer:=0;
  v_east integer:=0;
  v_issues integer:=0;
begin
  select count(*) into v_under_target
  from public.youth_races r
  where r.status='scheduled'
    and r.race_date>gd
    and r.race_date<=gd+7
    and (
      select count(*)
      from public.youth_race_entries e
      where e.race_id=r.id
        and e.status in ('entered','completed')
    )<coalesce(r.target_teams,6);

  select count(*) into v_cold
  from public.youth_races r
  where r.status='scheduled'
    and r.race_date>gd
    and not private.youth_race_city_weather_eligible_v9(
      r.host_country_code,
      r.host_city,
      r.race_date,
      coalesce(r.race_end_date,r.race_date)
    );

  select count(*) into v_missing_runtime
  from public.youth_races r
  where r.status='scheduled'
    and r.race_date>=gd
    and r.race_date<=gd+14
    and (
      not exists(
        select 1 from public.youth_race_stages s2 where s2.race_id=r.id
      )
      or exists(
        select 1
        from public.youth_race_stages s2
        where s2.race_id=r.id
          and (
            s2.planned_start_hour_number is null
            or s2.start_city is null
            or s2.finish_city is null
          )
      )
    );

  select count(*) into v_world
  from public.youth_academy_competition_memberships
  where season_number=public.get_current_season_number()
    and competition_class='world';

  select count(*) into v_west
  from public.youth_academy_competition_memberships
  where season_number=public.get_current_season_number()
    and division_code='CONTINENTAL_WEST';

  select count(*) into v_east
  from public.youth_academy_competition_memberships
  where season_number=public.get_current_season_number()
    and division_code='CONTINENTAL_EAST';

  v_issues:=
      (case when v_under_target>0 then 1 else 0 end)
    + (case when v_cold>0 then 1 else 0 end)
    + (case when v_missing_runtime>0 then 1 else 0 end)
    + (case when v_world<>16 then 1 else 0 end)
    + (case when v_west<>20 then 1 else 0 end)
    + (case when v_east<>20 then 1 else 0 end);

  perform public.log_system_business_check_v1(
    'check:youth_competition',
    case when v_issues>0 then 'warning' else 'success' end,
    case when v_issues>0
      then format(
        'Youth competition has %s health area(s) requiring attention.',
        v_issues
      )
      else
        'Youth Academy competition climate, variable race fields and hierarchy are healthy.'
    end,
    jsonb_build_object(
      'below_target_within_7_days',v_under_target,
      'races_below_city_climate_rule',v_cold,
      'missing_runtime_within_14_days',v_missing_runtime,
      'world_teams',v_world,
      'continental_west_teams',v_west,
      'continental_east_teams',v_east
    )
  );

  if v_issues>0 then
    perform public.raise_system_incident_v1(
      'check:youth_competition',
      'high',
      'Youth Academy competition requires attention',
      format(
        'Below target: %s; cold-weather races: %s; missing runtime: %s; World/West/East sizes: %s/%s/%s.',
        v_under_target,v_cold,v_missing_runtime,v_world,v_west,v_east
      ),
      'business:youth-competition',
      jsonb_build_object(
        'below_target_within_7_days',v_under_target,
        'races_below_city_climate_rule',v_cold,
        'missing_runtime_within_14_days',v_missing_runtime,
        'world_teams',v_world,
        'continental_west_teams',v_west,
        'continental_east_teams',v_east
      )
    );
  else
    perform public.resolve_system_incident_by_dedupe_v1(
      'business:youth-competition',
      'Youth Academy climate, variable race fields and hierarchy are healthy.'
    );
  end if;

  insert into public.system_monitor_runs(
    process_key,status,started_at,finished_at,duration_ms,summary,details
  )
  values(
    'check:youth_competition',
    case when v_issues>0 then 'warning' else 'success' end,
    s,
    clock_timestamp(),
    greatest(0,(extract(epoch from(clock_timestamp()-s))*1000)::bigint),
    case when v_issues>0
      then 'Youth Academy competition health has active warnings.'
      else 'Youth Academy competition health is green.'
    end,
    jsonb_build_object(
      'below_target_within_7_days',v_under_target,
      'races_below_city_climate_rule',v_cold,
      'missing_runtime_within_14_days',v_missing_runtime,
      'world_teams',v_world,
      'continental_west_teams',v_west,
      'continental_east_teams',v_east
    )
  );

  return jsonb_build_object(
    'status',case when v_issues>0 then 'warning' else 'success' end,
    'below_target_within_7_days',v_under_target,
    'races_below_city_climate_rule',v_cold,
    'missing_runtime_within_14_days',v_missing_runtime,
    'world_teams',v_world,
    'continental_west_teams',v_west,
    'continental_east_teams',v_east
  );
end;
$function$;

-- Refill only to each race's own target.
select public.process_youth_team_allocations_v2(
  public.get_current_game_date_date()
);
