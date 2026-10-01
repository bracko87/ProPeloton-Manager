-- Fix National Association status regression and make the National Team Standing
-- show the complete current World Nations field, including zero-point nations.

create or replace function public.refresh_national_association_statuses_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_season integer;
  v_month integer;
  v_day integer;
  v_minimum integer;
  v_activation_target integer;
  v_renewal_target integer;
  v_deadline_month integer;
  v_deadline_day integer;
  v_deadline date;
  v_activated integer:=0;
  v_inactivated integer:=0;
  v_renewal_inactivated integer:=0;
begin
  select season_number::integer,month_number::integer,day_number::integer
  into v_season,v_month,v_day
  from public.game_state
  where id=true;

  select
    minimum_active_members::integer,
    activation_coin_target::integer,
    renewal_coin_target::integer,
    renewal_deadline_month::integer,
    renewal_deadline_day::integer
  into
    v_minimum,
    v_activation_target,
    v_renewal_target,
    v_deadline_month,
    v_deadline_day
  from public.national_association_config
  where id=true;

  v_deadline:=public.game_date_from_parts(
    v_season,
    coalesce(v_deadline_month,2),
    coalesce(v_deadline_day,1)
  );

  update public.national_associations a
  set status='active',
      activated_on_game_date=coalesce(a.activated_on_game_date,v_today),
      renewal_paid_through_season=coalesce(a.renewal_paid_through_season,v_season),
      inactive_on_game_date=null,
      last_status_change_on_game_date=v_today,
      updated_at=now()
  where a.status in ('forming','inactive')
    and a.activated_on_game_date is null
    and private.national_association_active_member_count_v1(a.id)>=coalesce(v_minimum,5)
    and coalesce((
      select sum(e.amount)
      from public.national_association_activation_coin_events e
      where e.association_id=a.id
    ),0)>=coalesce(v_activation_target,50);

  get diagnostics v_activated=row_count;

  if v_today>=v_deadline then
    update public.national_associations a
    set status='inactive',
        inactive_on_game_date=v_today,
        last_status_change_on_game_date=v_today,
        updated_at=now()
    where a.status='active'
      and coalesce(a.renewal_paid_through_season,0)<v_season;

    get diagnostics v_renewal_inactivated=row_count;

    update public.national_coach_terms t
    set status='ineligible',
        term_end_game_date=greatest(t.term_start_game_date,v_today),
        updated_at=now()
    where t.status='active'
      and exists(
        select 1
        from public.national_associations a
        where a.id=t.association_id
          and a.status='inactive'
      );
  end if;

  v_inactivated:=v_renewal_inactivated;

  return jsonb_build_object(
    'game_date',v_today,
    'season_number',v_season,
    'activated',v_activated,
    'inactivated_at_renewal_deadline',v_inactivated,
    'minimum_members_for_initial_activation',coalesce(v_minimum,5),
    'activation_coin_target',coalesce(v_activation_target,50),
    'renewal_coin_target',coalesce(v_renewal_target,30),
    'renewal_deadline',v_deadline
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
  v_integrity jsonb;
  v_vacancies jsonb;
begin
  v_vacancies:=public.process_national_coach_vacancies_v1();
  v_core:=public.process_national_association_nations_runtime_v1();
  v_races:=public.process_nations_race_runtime_v2();
  v_health:=public.check_nations_operations_health_v1();
  v_integrity:=public.check_national_association_integrity_v1();

  return coalesce(v_core,'{}'::jsonb)||jsonb_build_object(
    'coach_vacancies',v_vacancies,
    'race_runtime',v_races,
    'operations_health',v_health,
    'association_integrity',v_integrity
  );
end;
$function$;

create or replace function public.get_nations_team_standings_v1(
  p_season_number integer default null::integer
)
returns table(
  standing_rank bigint,
  association_id uuid,
  association_name text,
  country_code text,
  country_name text,
  season_points bigint,
  qualification_points bigint,
  world_final_points bigint,
  all_time_points bigint,
  seasons_scored bigint
)
language sql
stable
security definer
set search_path=''
as $function$
  with target as (
    select coalesce(
      p_season_number,
      (select gs.season_number from public.game_state gs where gs.id=true)
    )::integer season_number
  ),
  listed_associations as (
    select distinct ce.association_id
    from public.nations_competition_entries ce
    join public.nations_competition_editions ed on ed.id=ce.edition_id
    where ed.season_number=(select season_number from target)
      and ce.status<>'withdrawn'
    union
    select a.id
    from public.national_associations a
    where a.status='active'
  ),
  scored as (
    select
      a.id association_id,
      a.name association_name,
      a.country_code,
      coalesce(c.name,a.country_code) country_name,
      coalesce(sum(rp.points) filter(
        where rp.season_number=(select season_number from target)
      ),0)::bigint season_points,
      coalesce(sum(rp.points) filter(
        where rp.season_number=(select season_number from target)
          and rp.phase='qualification'
      ),0)::bigint qualification_points,
      coalesce(sum(rp.points) filter(
        where rp.season_number=(select season_number from target)
          and rp.phase='world_final'
      ),0)::bigint world_final_points,
      coalesce(sum(rp.points),0)::bigint all_time_points,
      count(distinct rp.season_number)::bigint seasons_scored
    from listed_associations la
    join public.national_associations a on a.id=la.association_id
    left join public.countries c on upper(c.code)=upper(a.country_code)
    left join public.nations_team_ranking_points rp on rp.association_id=a.id
    group by a.id,a.name,a.country_code,c.name
  )
  select
    row_number() over(
      order by all_time_points desc,season_points desc,country_code
    ) standing_rank,
    association_id,
    association_name,
    country_code,
    country_name,
    season_points,
    qualification_points,
    world_final_points,
    all_time_points,
    seasons_scored
  from scored
  order by standing_rank;
$function$;

update public.national_associations a
set status='active',
    inactive_on_game_date=null,
    last_status_change_on_game_date=public.get_current_game_date_date(),
    updated_at=now()
where a.activated_on_game_date is not null
  and coalesce(a.renewal_paid_through_season,0)>=(select season_number from public.game_state where id=true)
  and exists(
    select 1
    from public.nations_competition_entries ce
    join public.nations_competition_editions ed on ed.id=ce.edition_id
    where ce.association_id=a.id
      and ed.season_number=(select season_number from public.game_state where id=true)
      and ce.status<>'withdrawn'
  );
