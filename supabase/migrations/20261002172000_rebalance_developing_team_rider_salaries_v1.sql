-- Rebalance Developing Team rider salaries.
-- Developing riders should earn broadly comparable weekly wages to ordinary
-- Amateur/Continental riders of similar current ability instead of a flat
-- 120-260 development wage band.

create or replace function public.calculate_developing_rider_weekly_salary_v1(
  p_rider_id uuid
)
returns integer
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
declare
  v_overall numeric;
  v_potential integer;
  v_age integer;
  v_base numeric;
  v_potential_factor numeric:=1.00;
  v_age_factor numeric:=1.00;
  v_salary integer;
begin
  select
    coalesce(
      r.overall::numeric,
      round((
        coalesce(r.sprint,0)+coalesce(r.climbing,0)+coalesce(r.time_trial,0)+
        coalesce(r.endurance,0)+coalesce(r.flat,0)+coalesce(r.recovery,0)+
        coalesce(r.resistance,0)+coalesce(r.race_iq,0)+coalesce(r.teamwork,0)
      )::numeric/9.0)
    ),
    coalesce(r.potential,50),
    greatest(
      16,
      extract(year from age(public.get_current_game_date_date(),r.birth_date))::integer
    )
  into v_overall,v_potential,v_age
  from public.riders r
  where r.id=p_rider_id;

  if v_overall is null then
    raise exception 'Developing rider % not found',p_rider_id;
  end if;

  -- Ability bands are anchored to the current ordinary-rider wage economy.
  -- The 45-49 band lands around 360-440/week instead of the old 120-260.
  v_base:=
    case
      when v_overall < 45 then 250 + greatest(v_overall-38,0)*12
      when v_overall < 50 then 360 + (v_overall-45)*20
      when v_overall < 55 then 425 + (v_overall-50)*30
      when v_overall < 60 then 550 + (v_overall-55)*80
      when v_overall < 65 then 950 + (v_overall-60)*175
      when v_overall < 70 then 1750 + (v_overall-65)*250
      else 2900 + least(v_overall-70,15)*350
    end;

  if v_potential >= v_overall + 20 then
    v_potential_factor:=1.10;
  elsif v_potential >= v_overall + 12 then
    v_potential_factor:=1.05;
  end if;

  if v_age <= 18 then
    v_age_factor:=0.95;
  elsif v_age >= 23 then
    v_age_factor:=1.03;
  end if;

  v_salary:=greatest(
    250,
    (round((v_base*v_potential_factor*v_age_factor)/5.0)*5)::integer
  );

  return v_salary;
end;
$function$;

revoke all on function public.calculate_developing_rider_weekly_salary_v1(uuid)
from public,anon;
grant execute on function public.calculate_developing_rider_weekly_salary_v1(uuid)
to authenticated,service_role;

-- Future seeded Developing Team riders use the new salary formula.
do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='seed_developing_team_roster'
  order by p.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'seed_developing_team_roster not found';
  end if;

  v_def:=replace(pg_get_functiondef(v_oid),E'\r\n',E'\n');

  v_new:=replace(
    v_def,
    'v_salary_weekly := 120 + floor(random() * 141)::int; -- 120..260',
    'v_salary_weekly := public.calculate_developing_rider_weekly_salary_v1(v_rider_id);'
  );

  if v_new=v_def then
    raise exception 'Developing Team seed salary patch point not found';
  end if;

  execute v_new;
end $$;

-- Backfill helper also uses the same ability-based formula.
do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='backfill_developing_team_contracts'
  order by p.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'backfill_developing_team_contracts not found';
  end if;

  v_def:=replace(pg_get_functiondef(v_oid),E'\r\n',E'\n');

  v_new:=replace(
    v_def,
    'v_salary_weekly := 150 + floor(random() * 251)::int;',
    'v_salary_weekly := public.calculate_developing_rider_weekly_salary_v1(v_rider.id);'
  );

  if v_new=v_def then
    raise exception 'Developing Team backfill salary patch point not found';
  end if;

  execute v_new;
end $$;

-- Increase every current Developing Team rider now. Never reduce an existing
-- salary if a rider already negotiated above the new formula.
with developing_riders as (
  select distinct
    r.id as rider_id,
    d.id as developing_club_id,
    d.parent_club_id as main_club_id,
    public.calculate_developing_rider_weekly_salary_v1(r.id) as calculated_salary
  from public.clubs d
  join public.club_riders cr on cr.club_id=d.id
  join public.riders r on r.id=cr.rider_id
  where d.club_type='developing'
    and d.deleted_at is null
),
updated_contracts as (
  update public.rider_contracts rc
  set
    salary_weekly=greatest(coalesce(rc.salary_weekly,0),dr.calculated_salary),
    updated_at=now()
  from developing_riders dr
  where rc.rider_id=dr.rider_id
    and rc.status='active'
    and rc.club_id in (dr.developing_club_id,dr.main_club_id)
  returning rc.rider_id,rc.salary_weekly
)
update public.riders r
set salary=greatest(
  coalesce(r.salary,0),
  dr.calculated_salary,
  coalesce((
    select max(uc.salary_weekly)
    from updated_contracts uc
    where uc.rider_id=r.id
  ),0)
)
from developing_riders dr
where r.id=dr.rider_id;
