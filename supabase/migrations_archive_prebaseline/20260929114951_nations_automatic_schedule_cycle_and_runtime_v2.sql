-- World Nations automatic schedule, active-cycle resolution and runtime orchestration.

create table if not exists public.nations_competition_schedule_config (
  id boolean primary key default true check (id = true),
  final_month smallint not null default 11 check (final_month between 1 and 12),
  final_day smallint not null default 24 check (final_day between 1 and 31),
  final_qualification_gap_days smallint not null default 42 check (final_qualification_gap_days between 21 and 90),
  preliminary_gap_days smallint not null default 49 check (preliminary_gap_days between 21 and 90),
  earliest_preliminary_month smallint not null default 2 check (earliest_preliminary_month between 1 and 12),
  earliest_preliminary_day smallint not null default 15 check (earliest_preliminary_day between 1 and 28),
  host_selection_days_before_final smallint not null default 30 check (host_selection_days_before_final between 7 and 90),
  updated_at timestamptz not null default now()
);

insert into public.nations_competition_schedule_config(
  id, final_month, final_day, final_qualification_gap_days,
  preliminary_gap_days, earliest_preliminary_month, earliest_preliminary_day,
  host_selection_days_before_final
)
values(true,11,24,42,49,2,15,30)
on conflict(id) do nothing;

create or replace function public.schedule_nations_edition_v1(p_edition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_edition public.nations_competition_editions%rowtype;
  v_cfg public.nations_competition_schedule_config%rowtype;
  v_final_date date;
  v_final_qual_date date;
  v_first_allowed date;
  v_prelim_count integer:=0;
  v_effective_gap integer;
  v_round record;
  v_group record;
  v_prelims_after integer;
  v_start date;
  v_scheduled_groups integer:=0;
  v_schedule jsonb:='[]'::jsonb;
begin
  select * into v_edition
  from public.nations_competition_editions
  where id=p_edition_id;

  if v_edition.id is null then
    raise exception 'World Nations edition not found.';
  end if;

  select * into v_cfg
  from public.nations_competition_schedule_config
  where id=true;

  v_final_date:=public.game_date_from_parts(
    v_edition.season_number,
    coalesce(v_cfg.final_month,11),
    coalesce(v_cfg.final_day,24)
  );

  v_final_qual_date:=v_final_date-coalesce(v_cfg.final_qualification_gap_days,42);

  v_first_allowed:=public.game_date_from_parts(
    v_edition.season_number,
    coalesce(v_cfg.earliest_preliminary_month,2),
    coalesce(v_cfg.earliest_preliminary_day,15)
  );

  select count(*)::integer
  into v_prelim_count
  from public.nations_competition_rounds
  where edition_id=v_edition.id
    and round_type='preliminary';

  if v_prelim_count>0 then
    v_effective_gap:=least(
      coalesce(v_cfg.preliminary_gap_days,49)::integer,
      greatest(
        21,
        floor(((v_final_qual_date-v_first_allowed)::numeric)/(v_prelim_count+1))::integer
      )
    );

    if v_final_qual_date-(v_effective_gap*v_prelim_count)<v_first_allowed then
      raise exception 'Not enough season space to schedule % preliminary Nations rounds safely.',v_prelim_count;
    end if;
  else
    v_effective_gap:=coalesce(v_cfg.preliminary_gap_days,49);
  end if;

  for v_round in
    select *
    from public.nations_competition_rounds
    where edition_id=v_edition.id
    order by round_index
  loop
    if v_round.round_type='world_final' then
      v_start:=v_final_date;
    elsif v_round.round_type='final_qualification' then
      v_start:=v_final_qual_date;
    else
      select count(*)::integer
      into v_prelims_after
      from public.nations_competition_rounds r2
      where r2.edition_id=v_edition.id
        and r2.round_type='preliminary'
        and r2.round_index>v_round.round_index;

      v_start:=v_final_qual_date-(v_effective_gap*(v_prelims_after+1));
    end if;

    for v_group in
      select id
      from public.nations_competition_groups
      where round_id=v_round.id
      order by group_number
    loop
      perform public.set_nations_group_schedule_v1(v_group.id,v_start);
      v_scheduled_groups:=v_scheduled_groups+1;
    end loop;

    v_schedule:=v_schedule||jsonb_build_array(jsonb_build_object(
      'round_id',v_round.id,
      'round_index',v_round.round_index,
      'round_type',v_round.round_type,
      'round_label',v_round.round_label,
      'day1_date',v_start,
      'day2_date',v_start+1,
      'day3_date',v_start+2
    ));
  end loop;

  return jsonb_build_object(
    'edition_id',v_edition.id,
    'season_number',v_edition.season_number,
    'scheduled_groups',v_scheduled_groups,
    'preliminary_gap_days',v_effective_gap,
    'rounds',v_schedule
  );
end;
$function$;

create or replace function public.get_my_current_nations_cycle_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_season integer;
  v_today date;
  v_association_id uuid;
  v_edition public.nations_competition_editions%rowtype;
  v_entry public.nations_competition_entries%rowtype;
  v_cycle record;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_today
  from public.game_state gs
  where gs.id=true;

  select m.association_id
  into v_association_id
  from public.national_association_memberships m
  join public.national_associations a
    on a.id=m.association_id
   and a.status='active'
  where m.user_id=v_uid
    and m.status='active'
    and private.national_association_member_is_eligible_v1(m.association_id,v_uid)
  order by m.created_at desc
  limit 1;

  if v_association_id is null then
    return jsonb_build_object('state','no_active_association','season_number',v_season,'current_game_date',v_today);
  end if;

  select * into v_edition
  from public.nations_competition_editions
  where season_number=v_season
  limit 1;

  if v_edition.id is null then
    return jsonb_build_object(
      'state','waiting_for_edition','association_id',v_association_id,
      'season_number',v_season,'current_game_date',v_today
    );
  end if;

  select * into v_entry
  from public.nations_competition_entries
  where edition_id=v_edition.id
    and association_id=v_association_id
  limit 1;

  if v_entry.id is null then
    return jsonb_build_object(
      'state','not_entered','association_id',v_association_id,'edition_id',v_edition.id,
      'season_number',v_season,'current_game_date',v_today
    );
  end if;

  if v_entry.status='eliminated' then
    return jsonb_build_object(
      'state','eliminated','association_id',v_association_id,'edition_id',v_edition.id,
      'entry_status',v_entry.status,'season_number',v_season,'current_game_date',v_today
    );
  elsif v_entry.status='champion' then
    return jsonb_build_object(
      'state','champion','association_id',v_association_id,'edition_id',v_edition.id,
      'entry_status',v_entry.status,'season_number',v_season,'current_game_date',v_today
    );
  end if;

  select
    r.id as round_id,
    r.round_index,
    r.round_type,
    r.round_label,
    r.status as round_status,
    g.id as group_id,
    g.group_number,
    g.group_label,
    g.status as group_status,
    nge.id as group_entry_id,
    nge.status as group_entry_status,
    min(e.event_date) as start_date,
    max(e.event_date) as end_date,
    max(e.event_date) filter(where e.race_day=1) as day1_date,
    max(e.event_date) filter(where e.race_day=2) as day2_date,
    max(e.event_date) filter(where e.race_day=3) as day3_date
  into v_cycle
  from public.nations_group_entries nge
  join public.nations_competition_groups g on g.id=nge.group_id
  join public.nations_competition_rounds r on r.id=g.round_id
  left join public.nations_group_events e on e.group_id=g.id
  where nge.competition_entry_id=v_entry.id
    and r.status<>'completed'
    and g.status<>'completed'
    and nge.status not in ('eliminated','withdrawn')
  group by
    r.id,r.round_index,r.round_type,r.round_label,r.status,
    g.id,g.group_number,g.group_label,g.status,
    nge.id,nge.status
  order by r.round_index
  limit 1;

  if v_cycle.group_id is null then
    return jsonb_build_object(
      'state','waiting_for_next_round','association_id',v_association_id,'edition_id',v_edition.id,
      'entry_status',v_entry.status,'season_number',v_season,'current_game_date',v_today
    );
  end if;

  return jsonb_build_object(
    'state','active_cycle',
    'association_id',v_association_id,
    'edition_id',v_edition.id,
    'entry_id',v_entry.id,
    'entry_status',v_entry.status,
    'season_number',v_season,
    'current_game_date',v_today,
    'cycle_key','nations:'||v_cycle.group_id::text,
    'round_id',v_cycle.round_id,
    'round_index',v_cycle.round_index,
    'round_type',v_cycle.round_type,
    'round_label',v_cycle.round_label,
    'round_status',v_cycle.round_status,
    'group_id',v_cycle.group_id,
    'group_number',v_cycle.group_number,
    'group_label',v_cycle.group_label,
    'group_status',v_cycle.group_status,
    'group_entry_id',v_cycle.group_entry_id,
    'group_entry_status',v_cycle.group_entry_status,
    'start_date',v_cycle.start_date,
    'end_date',v_cycle.end_date,
    'day1_date',v_cycle.day1_date,
    'day2_date',v_cycle.day2_date,
    'day3_date',v_cycle.day3_date
  );
end;
$function$;

create or replace function public.process_national_association_nations_runtime_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_status jsonb;
  v_elections jsonb;
  v_expired integer;
  v_duties jsonb;
  v_plan jsonb;
  v_edition_id uuid;
  v_schedule jsonb:=null;
  v_next_round record;
  v_draw jsonb:=null;
  v_final_start date;
  v_host_days integer:=30;
  v_host jsonb:=null;
begin
  v_status:=public.refresh_national_association_statuses_v1();
  v_elections:=public.process_national_coach_elections_v1();
  v_expired:=public.expire_national_team_callups_v1();
  v_duties:=public.refresh_national_team_duty_status_v1();
  v_plan:=public.process_nations_competition_planning_v1();

  v_edition_id:=nullif(v_plan->>'edition_id','')::uuid;

  if v_edition_id is null then
    select id into v_edition_id
    from public.nations_competition_editions
    where season_number=(select season_number from public.game_state where id=true)
    limit 1;
  end if;

  if v_edition_id is not null then
    v_schedule:=public.schedule_nations_edition_v1(v_edition_id);

    select r.id,r.round_type
    into v_next_round
    from public.nations_competition_rounds r
    where r.edition_id=v_edition_id
      and r.status='planned'
      and (
        r.round_index=1
        or exists(
          select 1
          from public.nations_competition_rounds prev
          where prev.edition_id=r.edition_id
            and prev.round_index=r.round_index-1
            and prev.status='completed'
        )
      )
    order by r.round_index
    limit 1;

    if v_next_round.id is not null then
      v_draw:=public.draw_nations_round_v1(v_next_round.id);

      update public.nations_competition_editions
      set status=case
          when v_next_round.round_type='world_final' then 'world_final'
          else 'qualification'
        end,
        updated_at=now()
      where id=v_edition_id
        and status<>'completed';
    end if;

    select min(e.event_date)
    into v_final_start
    from public.nations_competition_rounds r
    join public.nations_competition_groups g on g.round_id=r.id
    join public.nations_group_events e on e.group_id=g.id
    where r.edition_id=v_edition_id
      and r.round_type='world_final';

    select host_selection_days_before_final::integer
    into v_host_days
    from public.nations_competition_schedule_config
    where id=true;

    if v_final_start is not null
       and v_today>=v_final_start-coalesce(v_host_days,30)
       and not exists(
         select 1
         from public.nations_competition_editions
         where id=v_edition_id
           and host_association_id is not null
       )
       and exists(
         select 1
         from public.nations_host_applications
         where edition_id=v_edition_id
           and status in ('submitted','eligible')
       )
    then
      v_host:=public.select_nations_host_v1(v_edition_id);
    end if;
  end if;

  return jsonb_build_object(
    'game_date',v_today,
    'association_statuses',v_status,
    'coach_elections',v_elections,
    'expired_callups',v_expired,
    'national_duties',v_duties,
    'nations_planning',v_plan,
    'nations_schedule',v_schedule,
    'next_round_draw',v_draw,
    'host_selection',v_host
  );
end;
$function$;

grant execute on function public.schedule_nations_edition_v1(uuid) to authenticated;
grant execute on function public.get_my_current_nations_cycle_v1() to authenticated;
grant execute on function public.process_national_association_nations_runtime_v1() to service_role;

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
    'select public.process_national_association_nations_runtime_v1();'
  );
end;
$do$;
