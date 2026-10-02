-- Youth Academy Phase 1 follow-up:
-- - Keep Youth staff hidden unless Premium + Youth Academy are active.
-- - Give Youth roles explicit, moderate salary bases.
-- - Guarantee generated Youth Riders are truly age 12-16 on creation.

create or replace function public.calculate_staff_weekly_salary(
  p_role_type text,
  p_expertise integer,
  p_experience integer,
  p_potential integer,
  p_leadership integer,
  p_efficiency integer,
  p_loyalty integer,
  p_team_scope text default 'all'
)
returns integer
language plpgsql
immutable
as $function$
declare
  v_role_base integer;
  v_quality_score numeric;
  v_scope_multiplier numeric:=1.0;
  v_salary numeric;
begin
  v_role_base:=
    case p_role_type
      when 'head_coach' then 550
      when 'team_doctor' then 520
      when 'sport_director' then 580
      when 'mechanic' then 430
      when 'scout_analyst' then 410
      when 'youth_academy_director' then 480
      when 'u16_head_coach' then 450
      when 'youth_scout' then 390
      else 450
    end;

  v_quality_score:=
    (
      coalesce(p_expertise,0)*0.30
      + coalesce(p_experience,0)*0.15
      + coalesce(p_potential,0)*0.10
      + coalesce(p_leadership,0)*0.15
      + coalesce(p_efficiency,0)*0.25
      + coalesce(p_loyalty,0)*0.05
    );

  v_scope_multiplier:=
    case coalesce(p_team_scope,'all')
      when 'all' then 1.05
      when 'first_team' then 1.00
      when 'u23' then 0.92
      when 'youth' then 0.90
      else 1.00
    end;

  v_salary:=
    (v_role_base+greatest(v_quality_score-40,0)*16)*v_scope_multiplier;

  return greatest(300,round(v_salary)::int);
end;
$function$;

-- Reprice only automatically generated, not-yet-hired Youth candidates.
update public.staff_candidates sc
set salary_weekly=public.calculate_staff_weekly_salary(
  sc.role_type,
  sc.expertise,
  sc.experience,
  sc.potential,
  sc.leadership,
  sc.efficiency,
  sc.loyalty,
  'youth'
)
where sc.is_available=true
  and sc.role_type in ('youth_academy_director','u16_head_coach','youth_scout');

create or replace function public.get_staff_market_candidates_for_club(
  p_club_id uuid,
  p_page integer default 1,
  p_page_size integer default 500
)
returns table(
  id uuid,
  role_type text,
  specialization text,
  first_name text,
  last_name text,
  staff_name text,
  country_code text,
  birth_date date,
  expertise smallint,
  experience smallint,
  potential smallint,
  leadership smallint,
  efficiency smallint,
  loyalty smallint,
  salary_weekly integer,
  is_available boolean,
  listed_at_game_ts timestamp without time zone,
  expires_at_game_ts timestamp without time zone,
  notes jsonb,
  market_region text
)
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
declare
  v_region text;
  v_offset integer;
  v_is_premium boolean:=false;
  v_has_youth_academy boolean:=false;
begin
  v_region:=public.staff_market_region_for_club(p_club_id);
  v_offset:=greatest(0,(greatest(p_page,1)-1)*greatest(p_page_size,1));

  select
    public.user_has_premium_access_v1(c.owner_user_id),
    exists(
      select 1
      from public.youth_academies ya
      where ya.club_id=c.id
        and ya.is_active=true
    )
  into v_is_premium,v_has_youth_academy
  from public.clubs c
  where c.id=p_club_id;

  return query
  select
    sc.id,sc.role_type,sc.specialization,sc.first_name,sc.last_name,
    sc.staff_name,sc.country_code,sc.birth_date,sc.expertise,sc.experience,
    sc.potential,sc.leadership,sc.efficiency,sc.loyalty,sc.salary_weekly,
    sc.is_available,sc.listed_at_game_ts,sc.expires_at_game_ts,sc.notes,
    public.staff_market_region_from_country(sc.country_code)
  from public.staff_candidates sc
  where sc.is_available=true
    and (
      sc.role_type<>'u23_head_coach'
      or coalesce(v_is_premium,false)
    )
    and (
      sc.role_type not in ('youth_academy_director','u16_head_coach','youth_scout')
      or (
        coalesce(v_is_premium,false)
        and coalesce(v_has_youth_academy,false)
      )
    )
    and public.staff_market_candidate_visible_to_club(p_club_id,sc.country_code)
    and (
      v_region is null
      or public.staff_market_region_from_country(sc.country_code)=v_region
    )
  order by
    sc.expires_at_game_ts asc nulls last,
    sc.role_type asc,
    sc.salary_weekly desc,
    sc.staff_name asc
  limit greatest(p_page_size,1)
  offset v_offset;
end;
$function$;

-- Replace Youth Rider generator to produce exact current ages 12-16.
create or replace function private.create_youth_rider_v1(
  p_academy_id uuid,
  p_country_code text,
  p_is_starter boolean default false,
  p_is_ai boolean default false
)
returns uuid
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_game_date date:=public.get_current_game_date_date();
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_age integer;
  v_first text;
  v_last text;
  v_role text;
  v_base integer;
  v_special integer;
  v_potential integer;
  v_id uuid;
  v_birth_date date;
  v_stipend integer;
  v_earliest_birth date;
  v_latest_birth date;
  v_birth_span integer;
begin
  v_age:=12+floor(random()*5)::integer;

  select fn.first_name into v_first
  from public.first_names_master fn
  where upper(fn.country_code)=upper(p_country_code)
  order by random() limit 1;

  if v_first is null then
    select fn.first_name into v_first
    from public.first_names_master fn order by random() limit 1;
  end if;

  select ln.last_name into v_last
  from public.last_names_master ln
  where upper(ln.country_code)=upper(p_country_code)
  order by random() limit 1;

  if v_last is null then
    select ln.last_name into v_last
    from public.last_names_master ln order by random() limit 1;
  end if;

  v_role:=(array[
    'all_rounder','sprinter','climber','time_trial','domestique','breakaway'
  ])[1+floor(random()*6)::integer];

  v_base:=20+((v_age-12)*3)+floor(random()*9)::integer;
  v_special:=4+floor(random()*5)::integer;

  if p_is_starter then
    v_potential:=52+floor(random()*21)::integer;
    if random()<0.03 then
      v_potential:=73+floor(random()*9)::integer;
    end if;
  else
    v_potential:=48+floor(random()*35)::integer;
    if random()<0.015 then
      v_potential:=83+floor(random()*7)::integer;
    end if;
  end if;

  -- A rider aged N today was born after (today - N - 1 years)
  -- and no later than (today - N years).
  v_earliest_birth:=(v_game_date-(v_age+1)*interval '1 year'+interval '1 day')::date;
  v_latest_birth:=(v_game_date-v_age*interval '1 year')::date;
  v_birth_span:=greatest(v_latest_birth-v_earliest_birth,0);
  v_birth_date:=v_earliest_birth+floor(random()*(v_birth_span+1))::integer;

  insert into public.youth_riders(
    academy_id,country_code,first_name,last_name,birth_date,role,
    sprint,climbing,time_trial,endurance,flat,recovery,resistance,race_iq,teamwork,
    hidden_potential,readiness,fatigue,joined_game_date,joined_season,
    is_starter_rider,is_ai_generated
  )
  values(
    p_academy_id,upper(p_country_code),coalesce(v_first,'Alex'),coalesce(v_last,'Rider'),
    v_birth_date,v_role,
    least(65,v_base+case when v_role='sprinter' then v_special else floor(random()*4)::int end),
    least(65,v_base+case when v_role='climber' then v_special else floor(random()*4)::int end),
    least(65,v_base+case when v_role='time_trial' then v_special else floor(random()*4)::int end),
    least(65,v_base+floor(random()*5)::int),
    least(65,v_base+case when v_role in ('sprinter','all_rounder') then floor(v_special/2.0)::int else floor(random()*4)::int end),
    least(65,v_base+floor(random()*5)::int),
    least(65,v_base+case when v_role='breakaway' then v_special else floor(random()*4)::int end),
    least(65,v_base+floor(random()*5)::int),
    least(65,v_base+case when v_role='domestique' then v_special else floor(random()*4)::int end),
    v_potential,65+floor(random()*21)::integer,0,v_game_date,v_season,
    p_is_starter,p_is_ai
  )
  returning id into v_id;

  v_stipend:=80+floor(random()*51)::integer;

  insert into public.youth_rider_agreements(
    youth_rider_id,academy_id,stipend_weekly,accommodation_weekly,
    starts_on,ends_on,status
  )
  values(
    v_id,p_academy_id,v_stipend,0,v_game_date,
    public.get_game_date_for_season_end(v_season),'active'
  );

  return v_id;
end;
$function$;
