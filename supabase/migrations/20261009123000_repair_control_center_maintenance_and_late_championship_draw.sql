-- Repair two bounded lifecycle gaps found by Control Center monitoring.
--
-- 1. Preserve expired generated free-agent riders while any national-team or
--    race-planning record still references them.
-- 2. Lock ready championship editions created after the January draw window,
--    without changing dates or touching already locked editions.

create or replace function public.cleanup_expired_generated_free_agents()
returns table(deleted_free_agents integer, deleted_riders integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_deleted_free_agents integer := 0;
  v_deleted_riders integer := 0;
begin
  with deleted_fa as (
    delete from public.rider_free_agents fa
    where fa.source_type = 'generated'
      and fa.status = 'expired'
      and not exists (
        select 1 from public.club_riders cr where cr.rider_id = fa.rider_id
      )
      and not exists (
        select 1 from public.rider_contracts rc where rc.rider_id = fa.rider_id
      )
      and not exists (
        select 1
        from public.rider_free_agent_negotiations n
        where n.free_agent_id = fa.id
          and n.status = 'open'
      )
    returning fa.rider_id
  )
  select count(*) into v_deleted_free_agents from deleted_fa;

  with deleted_r as (
    delete from public.riders r
    where not exists (
      select 1 from public.rider_free_agents fa where fa.rider_id = r.id
    )
      and not exists (
        select 1 from public.club_riders cr where cr.rider_id = r.id
      )
      and not exists (
        select 1 from public.rider_contracts rc where rc.rider_id = r.id
      )
      and not exists (
        select 1 from public.rider_scout_reports rs where rs.rider_id = r.id
      )
      and not exists (
        select 1 from public.national_team_squad_members ntsm where ntsm.rider_id = r.id
      )
      and not exists (
        select 1 from public.national_team_lineup_members ntlm where ntlm.rider_id = r.id
      )
      and not exists (
        select 1 from public.race_preparation_riders rpr where rpr.rider_id = r.id
      )
      and not exists (
        select 1 from public.race_stage_plan_riders rspr where rspr.rider_id = r.id
      )
      and not exists (
        select 1 from public.rider_contract_transition_audit_v1 audit where audit.rider_id = r.id
      )
    returning r.id
  )
  select count(*) into v_deleted_riders from deleted_r;

  return query select v_deleted_free_agents, v_deleted_riders;
end;
$function$;

create or replace function public.process_championship_calendar_draw_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_season integer;
  v_game_date date;
  v_month integer;
  v_batch_size integer:=15;
  v_locked_now integer:=0;
  v_total integer:=0;
  v_locked integer:=0;
  v_world_id uuid;
  v_world_locked boolean:=false;
  v_last_batch date;
  v_health jsonb;
  v_expected_editions integer:=0;
  v_existing_editions integer:=0;
  r record;
begin
  select season_number,
         public.game_date_from_parts(season_number,month_number,day_number),
         month_number
  into v_season,v_game_date,v_month
  from public.game_state
  where id=true;

  select count(distinct upper(country_code))::int
  into v_expected_editions
  from public.riders
  where nullif(trim(country_code),'') is not null;

  select count(*)::int
  into v_existing_editions
  from public.national_championship_editions
  where season_number=v_season
    and discipline='road';

  if v_existing_editions<v_expected_editions then
    perform public.ensure_national_championship_editions_for_season_v1(v_season);
  end if;

  v_world_id:=public.ensure_world_road_championship_for_season_v1(v_season);

  update public.world_road_championship_editions
  set schedule_draw_status='locked',
      schedule_locked_at=coalesce(schedule_locked_at,now()),
      decision_deadline=least(coalesce(decision_deadline,race_date-10),race_date-10),
      final_confirmation_open_date=coalesce(final_confirmation_open_date,race_date-7),
      final_decision_deadline=coalesce(final_decision_deadline,race_date-3),
      updated_at=now()
  where id=v_world_id
    and schedule_draw_status<>'locked';

  select last_batch_game_date
  into v_last_batch
  from public.championship_calendar_draw_state_v1
  where season_number=v_season;

  -- The normal draw remains limited to 15 countries per January game day.
  if v_month=1 and v_last_batch is distinct from v_game_date then
    for r in
      select id
      from public.national_championship_editions
      where season_number=v_season
        and discipline='road'
        and schedule_draw_status='pending'
        and climate_status='ready'
        and route_status='ready'
      order by md5(v_season::text||':'||country_code)
      limit v_batch_size
    loop
      update public.national_championship_editions
      set schedule_draw_status='locked',
          schedule_drawn_on_game_date=v_game_date,
          schedule_locked_at=now(),
          final_participation_decision_deadline=
            coalesce(final_participation_decision_deadline,final_date-7),
          updated_at=now()
      where id=r.id;
      v_locked_now:=v_locked_now+1;
    end loop;
  elsif v_month<>1 then
    -- Editions can appear later when a newly generated rider introduces a
    -- nationality. Catch up only ready, still-future editions. Dates and any
    -- previously locked schedule are preserved.
    for r in
      select id
      from public.national_championship_editions
      where season_number=v_season
        and discipline='road'
        and schedule_draw_status='pending'
        and climate_status='ready'
        and route_status='ready'
        and final_date>=v_game_date
      order by md5(v_season::text||':'||country_code)
      limit v_batch_size
    loop
      update public.national_championship_editions
      set schedule_draw_status='locked',
          schedule_drawn_on_game_date=v_game_date,
          schedule_locked_at=coalesce(schedule_locked_at,now()),
          final_participation_decision_deadline=
            coalesce(final_participation_decision_deadline,final_date-7),
          updated_at=now()
      where id=r.id
        and schedule_draw_status='pending';
      if found then
        v_locked_now:=v_locked_now+1;
      end if;
    end loop;
  end if;

  select count(*)::int,
         count(*) filter (where schedule_draw_status='locked')::int
  into v_total,v_locked
  from public.national_championship_editions
  where season_number=v_season
    and discipline='road';

  select exists(
    select 1
    from public.world_road_championship_editions
    where season_number=v_season
      and schedule_draw_status='locked'
  ) into v_world_locked;

  insert into public.championship_calendar_draw_state_v1(
    season_number,status,batch_size,total_country_editions,locked_country_editions,
    world_draw_locked,last_batch_game_date,completed_at,last_error
  )
  values(
    v_season,
    case when v_locked=v_total and v_world_locked then 'completed' else 'in_progress' end,
    v_batch_size,
    v_total,
    v_locked,
    v_world_locked,
    case when v_locked_now>0 then v_game_date else v_last_batch end,
    case when v_locked=v_total and v_world_locked then now() else null end,
    null
  )
  on conflict (season_number) do update
  set status=excluded.status,
      batch_size=excluded.batch_size,
      total_country_editions=excluded.total_country_editions,
      locked_country_editions=excluded.locked_country_editions,
      world_draw_locked=excluded.world_draw_locked,
      last_batch_game_date=coalesce(excluded.last_batch_game_date,public.championship_calendar_draw_state_v1.last_batch_game_date),
      completed_at=coalesce(public.championship_calendar_draw_state_v1.completed_at,excluded.completed_at),
      last_error=null,
      updated_at=now();

  begin
    v_health:=public.championship_calendar_draw_health_check_v1();
  exception when undefined_function then
    v_health:=jsonb_build_object('status','health_check_not_installed_yet');
  end;

  return jsonb_build_object(
    'status',case when v_locked=v_total and v_world_locked then 'completed' else 'in_progress' end,
    'season_number',v_season,
    'game_date',v_game_date,
    'january_only',true,
    'late_catch_up_enabled',true,
    'batch_size',v_batch_size,
    'locked_this_game_day',v_locked_now,
    'country_editions_total',v_total,
    'country_editions_locked',v_locked,
    'world_draw_locked',v_world_locked,
    'health',v_health
  );
end;
$function$;
