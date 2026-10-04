
update public.staff_role_catalog
set max_absolute=3
where role_type='youth_scout';

create or replace function public.generate_staff_candidate_profile(
  p_role_type text,
  p_country_code text,
  p_quality_tier text default null
)
returns table(
  role_type text,specialization text,staff_name text,country_code text,
  expertise integer,experience integer,potential integer,leadership integer,
  efficiency integer,loyalty integer,salary_weekly integer,notes jsonb,
  first_name text,last_name text
)
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_role_type text:=lower(trim(p_role_type));
  v_country_code text:=coalesce(nullif(upper(trim(p_country_code)),''),'RS');
  v_first_names text[]:=array[
    'Marco','Luca','Milan','Nikola','Ivan','Petar','Andrej','Stefan',
    'Carlos','Miguel','Luis','Javier','Thomas','Julien','Pierre',
    'Daniel','Martin','Jan','Erik','Sven','Mateo','Hugo'
  ];
  v_last_names text[]:=array[
    'Bellini','Rossi','Kovacs','Petrovic','Moraru','Garcia','Sanchez',
    'Martin','Dubois','Moreau','Muller','Schmidt','Novak','Horvat',
    'Ilic','Nikolic','Font','Riba','Conti','Bianchi'
  ];
  v_specializations text[];
  v_role_salary_base numeric;
  v_base integer;
  v_score numeric;
begin
  if v_role_type='head_coach' then
    v_specializations:=array['Youth Development','Training Systems','Race Preparation','Team Leadership','Recovery Planning'];
    v_role_salary_base:=700;
  elsif v_role_type='trainer' then
    v_specializations:=array['Sprint Training','Climbing Training','Endurance Training','Time Trial Training','General Conditioning'];
    v_role_salary_base:=560;
  elsif v_role_type='team_doctor' then
    v_specializations:=array['Sports Medicine','Injury Prevention','Illness Management','Recovery Medicine','Medical Planning'];
    v_role_salary_base:=650;
  elsif v_role_type='physio' then
    v_specializations:=array['Rehabilitation','Massage Therapy','Mobility Work','Recovery Planning','Return-to-Fitness'];
    v_role_salary_base:=550;
  elsif v_role_type='mechanic' then
    v_specializations:=array['Race Bikes','Repairs','Equipment Setup','Workshop Efficiency','Bike Reliability'];
    v_role_salary_base:=520;
  elsif v_role_type='scout_analyst' then
    v_specializations:=array['Evaluation Accuracy','Scouting Network','Performance Data Analysis','Prospect Discovery'];
    v_role_salary_base:=500;
  elsif v_role_type='nutritionist' then
    v_specializations:=array['Race Nutrition','Recovery Nutrition','Hydration Planning','Weight Management'];
    v_role_salary_base:=560;
  elsif v_role_type='sport_director' then
    v_specializations:=array['Race Tactics','Teamwork','Domestique Coordination','Morale Management'];
    v_role_salary_base:=650;
  elsif v_role_type='u23_head_coach' then
    v_specializations:=array['Youth Development','U23 Race Tactics','Talent Progression','Development Planning'];
    v_role_salary_base:=620;
  elsif v_role_type='youth_academy_director' then
    v_specializations:=array['Academy Management','Talent Pathways','Youth Programme Planning','Development Strategy'];
    v_role_salary_base:=480;
  elsif v_role_type='u16_head_coach' then
    v_specializations:=array['U16 Development','Youth Race Planning','Technical Development','Workload Management'];
    v_role_salary_base:=450;
  elsif v_role_type='youth_scout' then
    v_specializations:=array['Youth Talent ID','Local Prospects','Regional Prospects','Potential Assessment','Academy Recruitment'];
    v_role_salary_base:=390;
  else
    raise exception 'Unsupported staff role: %',p_role_type;
  end if;

  v_base:=case lower(coalesce(p_quality_tier,'mixed'))
    when 'elite' then 78 when 'strong' then 68 when 'solid' then 58
    when 'prospect' then 50 else 54+floor(random()*18)::integer end;

  first_name:=v_first_names[1+floor(random()*array_length(v_first_names,1))::integer];
  last_name:=v_last_names[1+floor(random()*array_length(v_last_names,1))::integer];
  role_type:=v_role_type;
  country_code:=v_country_code;
  staff_name:=first_name||' '||last_name;
  specialization:=v_specializations[1+floor(random()*array_length(v_specializations,1))::integer];

  expertise:=greatest(35,least(92,v_base+floor(random()*17)::integer-8));
  experience:=greatest(35,least(92,v_base+floor(random()*17)::integer-8));
  potential:=greatest(35,least(95,v_base+floor(random()*20)::integer-5));
  leadership:=greatest(35,least(92,v_base+floor(random()*17)::integer-8));
  efficiency:=greatest(35,least(92,v_base+floor(random()*17)::integer-8));
  loyalty:=greatest(35,least(92,v_base+floor(random()*17)::integer-8));

  v_score:=expertise*0.22+experience*0.18+potential*0.18+
    leadership*0.14+efficiency*0.18+loyalty*0.10;

  salary_weekly:=greatest(
    300,round(v_role_salary_base*(0.75+(v_score/100.0)))::integer
  );

  notes:=jsonb_build_object(
    'generated_reason','staff_market_daily_refresh_v3',
    'generated_for_market',true,
    'quality_tier',coalesce(p_quality_tier,'mixed'),
    'profile_version','youth_staff_market_v2',
    'team_scope_hint',
      case when v_role_type in ('youth_academy_director','u16_head_coach','youth_scout')
        then 'youth' else 'all' end
  );

  return next;
end;
$function$;

create or replace function public.insert_generated_staff_candidate(
  p_role_type text,
  p_country_code text,
  p_quality_tier text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_profile record;
  v_identity record;
  v_candidate_id uuid;
  v_now_game_ts timestamp;
  v_birth_date date;
  v_lifetime_hours integer:=72;
begin
  select * into v_profile
  from public.generate_staff_candidate_profile(
    p_role_type,p_country_code,p_quality_tier
  );

  select * into v_identity
  from public.generate_staff_identity(p_country_code);

  v_now_game_ts:=public.get_current_game_date_timestamp();
  v_birth_date:=public.generate_staff_birth_date_v1(
    p_role_type,v_now_game_ts::date
  );

  insert into public.staff_candidates(
    role_type,specialization,staff_name,country_code,
    expertise,experience,potential,leadership,efficiency,loyalty,
    salary_weekly,is_available,notes,first_name,last_name,
    listed_at_game_ts,expires_at_game_ts,birth_date,market_region,
    created_at,updated_at
  )
  values(
    p_role_type,v_profile.specialization,
    concat_ws(' ',v_identity.first_name,v_identity.last_name),
    p_country_code,v_profile.expertise,v_profile.experience,
    v_profile.potential,v_profile.leadership,v_profile.efficiency,
    v_profile.loyalty,v_profile.salary_weekly,true,
    coalesce(v_profile.notes,'{}'::jsonb) || jsonb_build_object(
      'birth_date_source','generated_v1'
    ),
    v_identity.first_name,v_identity.last_name,
    v_now_game_ts,v_now_game_ts+make_interval(hours=>v_lifetime_hours),
    v_birth_date,public.staff_market_region_from_country(p_country_code),
    now(),now()
  )
  returning id into v_candidate_id;

  return v_candidate_id;
end;
$function$;

create or replace function public.staff_market_target_available_count(
  p_role_type text
)
returns integer
language sql
stable
set search_path=public
as $function$
  select case p_role_type
    when 'head_coach' then 70 when 'trainer' then 60
    when 'team_doctor' then 50 when 'physio' then 60
    when 'mechanic' then 70 when 'scout_analyst' then 90
    when 'nutritionist' then 50 when 'sport_director' then 50
    when 'u23_head_coach' then 50
    when 'youth_academy_director' then 40
    when 'u16_head_coach' then 50
    when 'youth_scout' then 70
    else 50 end;
$function$;

create or replace function public.staff_market_daily_refill_cap(
  p_role_type text
)
returns integer
language sql
stable
set search_path=public
as $function$
  select case p_role_type
    when 'head_coach' then 6 when 'trainer' then 10
    when 'team_doctor' then 6 when 'physio' then 10
    when 'mechanic' then 8 when 'scout_analyst' then 10
    when 'nutritionist' then 5 when 'sport_director' then 5
    when 'u23_head_coach' then 5
    when 'youth_academy_director' then 5
    when 'u16_head_coach' then 6
    when 'youth_scout' then 10
    else 5 end;
$function$;

create or replace function public.staff_market_role_weight(
  p_role_type text
)
returns integer
language sql
stable
set search_path=public
as $function$
  select case p_role_type
    when 'head_coach' then 8 when 'trainer' then 12
    when 'team_doctor' then 8 when 'physio' then 12
    when 'mechanic' then 10 when 'scout_analyst' then 12
    when 'nutritionist' then 5 when 'sport_director' then 6
    when 'u23_head_coach' then 4
    when 'youth_academy_director' then 4
    when 'u16_head_coach' then 5
    when 'youth_scout' then 7
    else 1 end;
$function$;

create or replace function public.staff_market_pick_role()
returns text
language plpgsql
set search_path=public
as $function$
declare
  v_roll integer;
  v_total integer;
begin
  with role_weights as (
    select * from (values
      ('head_coach'::text,public.staff_market_role_weight('head_coach')),
      ('trainer',public.staff_market_role_weight('trainer')),
      ('team_doctor',public.staff_market_role_weight('team_doctor')),
      ('physio',public.staff_market_role_weight('physio')),
      ('mechanic',public.staff_market_role_weight('mechanic')),
      ('scout_analyst',public.staff_market_role_weight('scout_analyst')),
      ('nutritionist',public.staff_market_role_weight('nutritionist')),
      ('sport_director',public.staff_market_role_weight('sport_director')),
      ('u23_head_coach',public.staff_market_role_weight('u23_head_coach')),
      ('youth_academy_director',public.staff_market_role_weight('youth_academy_director')),
      ('u16_head_coach',public.staff_market_role_weight('u16_head_coach')),
      ('youth_scout',public.staff_market_role_weight('youth_scout'))
    ) x(role_type,weight) where weight>0
  )
  select sum(weight)::integer into v_total from role_weights;

  v_roll:=floor(random()*v_total)::integer+1;

  return (
    with role_weights as (
      select * from (values
        ('head_coach'::text,public.staff_market_role_weight('head_coach')),
        ('trainer',public.staff_market_role_weight('trainer')),
        ('team_doctor',public.staff_market_role_weight('team_doctor')),
        ('physio',public.staff_market_role_weight('physio')),
        ('mechanic',public.staff_market_role_weight('mechanic')),
        ('scout_analyst',public.staff_market_role_weight('scout_analyst')),
        ('nutritionist',public.staff_market_role_weight('nutritionist')),
        ('sport_director',public.staff_market_role_weight('sport_director')),
        ('u23_head_coach',public.staff_market_role_weight('u23_head_coach')),
        ('youth_academy_director',public.staff_market_role_weight('youth_academy_director')),
        ('u16_head_coach',public.staff_market_role_weight('u16_head_coach')),
        ('youth_scout',public.staff_market_role_weight('youth_scout'))
      ) x(role_type,weight) where weight>0
    ),
    weighted as (
      select role_type,weight,
        sum(weight) over(order by role_type) running_weight
      from role_weights
    )
    select role_type from weighted
    where running_weight>=v_roll
    order by running_weight limit 1
  );
end;
$function$;

create or replace function public.staff_market_refill_available_candidates(
  p_role_type text default null
)
returns integer
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_role text;
  v_target integer;
  v_current integer;
  v_missing integer;
  v_i integer;
  v_country_code text;
  v_generated integer:=0;
  v_roles text[];
begin
  v_roles:=array[
    'head_coach','trainer','team_doctor','physio','mechanic',
    'scout_analyst','nutritionist','sport_director','u23_head_coach',
    'youth_academy_director','u16_head_coach','youth_scout'
  ];

  if p_role_type is not null then
    if not (p_role_type=any(v_roles)) then
      raise exception 'Unknown staff role: %',p_role_type;
    end if;
    v_roles:=array[p_role_type];
  end if;

  foreach v_role in array v_roles loop
    v_target:=public.staff_market_target_available_count(v_role);
    select count(*)::integer into v_current
    from public.staff_candidates sc
    where sc.role_type=v_role and coalesce(sc.is_available,false)=true;

    v_missing:=greatest(v_target-coalesce(v_current,0),0);

    if v_missing>0 then
      for v_i in 1..v_missing loop
        v_country_code:=public.staff_market_pick_country_for_generation();
        perform public.insert_generated_staff_candidate(
          v_role,v_country_code,null
        );
        v_generated:=v_generated+1;
      end loop;
    end if;
  end loop;
  return v_generated;
end;
$function$;

create or replace function public.get_staff_role_capacity_overview_for_club(
  p_club_id uuid
)
returns table(
  role_type text,limit_count integer,active_count integer,
  open_slots integer,can_hire boolean
)
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
with infra as (
  select
    coalesce(ci.hq_level,1) hq_level,
    coalesce(ci.training_center_level,0) training_center_level,
    coalesce(ci.medical_center_level,0) medical_center_level,
    coalesce(ci.scouting_level,0) scouting_level,
    coalesce(ci.youth_academy_level,0) youth_academy_level,
    coalesce(ci.mechanics_workshop_level,0) mechanics_workshop_level
  from public.club_infrastructure ci where ci.club_id=p_club_id
),
safe_infra as (
  select * from infra
  union all select 1,0,0,0,0,0 where not exists(select 1 from infra)
),
club_access as (
  select
    public.user_has_premium_access_v1(c.owner_user_id) is_premium,
    exists(
      select 1 from public.clubs d
      where d.parent_club_id=c.id and d.club_type='developing'
        and d.deleted_at is null
        and public.is_developing_team_access_active_v1(d.id)
    ) has_active_developing_team,
    exists(
      select 1 from public.youth_academies a
      where a.club_id=c.id and a.is_active=true
    ) has_youth_academy
  from public.clubs c where c.id=p_club_id
),
safe_access as (
  select * from club_access
  union all select false,false,false where not exists(select 1 from club_access)
),
limits as (
  select v.role_type,v.limit_count
  from safe_infra i cross join safe_access access
  cross join lateral(values
    ('head_coach'::text,1::integer),
    ('trainer',case when i.training_center_level>=3 then 2 else 1 end),
    ('team_doctor',case when i.medical_center_level>=3 then 2 else 1 end),
    ('physio',case when i.medical_center_level>=5 then 5 when i.medical_center_level>=4 then 4 when i.medical_center_level>=3 then 3 when i.medical_center_level>=1 then 2 else 1 end),
    ('nutritionist',case when i.medical_center_level>=2 then 1 else 0 end),
    ('mechanic',case when i.mechanics_workshop_level>=4 then 5 when i.mechanics_workshop_level>=3 then 4 when i.mechanics_workshop_level>=2 then 3 when i.mechanics_workshop_level>=1 then 2 else 1 end),
    ('sport_director',case when i.hq_level>=4 then 2 when i.hq_level>=2 then 1 else 0 end),
    ('scout_analyst',case when i.scouting_level>=4 then 5 when i.scouting_level>=3 then 4 when i.scouting_level>=2 then 3 when i.scouting_level>=1 then 2 else 1 end),
    ('u23_head_coach',case when access.is_premium and access.has_active_developing_team and i.youth_academy_level>=1 then 1 else 0 end),
    ('youth_academy_director',case when access.is_premium and access.has_youth_academy then 1 else 0 end),
    ('u16_head_coach',case when access.is_premium and access.has_youth_academy then 1 else 0 end),
    ('youth_scout',case when access.is_premium and access.has_youth_academy then 3 else 0 end)
  ) v(role_type,limit_count)
),
active_counts as (
  select cs.role_type,count(*)::integer active_count
  from public.club_staff cs
  where cs.club_id=p_club_id and cs.is_active=true
  group by cs.role_type
)
select l.role_type,l.limit_count,
  coalesce(a.active_count,0)::integer,
  greatest(l.limit_count-coalesce(a.active_count,0),0)::integer,
  (l.limit_count>coalesce(a.active_count,0))::boolean
from limits l
left join active_counts a on a.role_type=l.role_type
order by case l.role_type
  when 'head_coach' then 1 when 'trainer' then 2 when 'team_doctor' then 3
  when 'physio' then 4 when 'nutritionist' then 5 when 'mechanic' then 6
  when 'sport_director' then 7 when 'scout_analyst' then 8
  when 'u23_head_coach' then 9 when 'youth_academy_director' then 10
  when 'u16_head_coach' then 11 when 'youth_scout' then 12 else 99 end;
$function$;

create or replace function public.get_club_staff_role_capacity(
  p_club_id uuid
)
returns table(
  role_type text,display_name text,role_group text,assigned_count integer,
  max_absolute integer,current_capacity integer,open_slots integer,
  is_unlocked boolean,locked_reason text,facility_key text,gameplay_status text
)
language sql
stable
security definer
set search_path=public
as $function$
with role_rows as (
  select rc.role_type,rc.display_name,rc.role_group,rc.max_absolute,
    rc.facility_key,rc.requires_developing_team,rc.gameplay_status
  from public.staff_role_catalog rc where rc.is_market_role=true
),
infra as (
  select coalesce(max(ci.hq_level),0)::integer hq_level,
    coalesce(max(ci.training_center_level),0)::integer training_center_level,
    coalesce(max(ci.medical_center_level),0)::integer medical_center_level,
    coalesce(max(ci.youth_academy_level),0)::integer youth_academy_level,
    coalesce(max(ci.scouting_level),0)::integer scouting_level,
    coalesce(max(ci.mechanics_workshop_level),0)::integer mechanics_workshop_level
  from public.club_infrastructure ci where ci.club_id=p_club_id
),
assigned as (
  select cs.role_type,count(*)::integer assigned_count
  from public.club_staff cs
  where cs.club_id=p_club_id and coalesce(cs.is_active,true)=true
  group by cs.role_type
),
club_status as (
  select
    exists(select 1 from public.clubs dc where dc.parent_club_id=p_club_id and coalesce(dc.club_type,'')='developing' and dc.deleted_at is null) has_developing_team,
    public.user_has_premium_access_v1(c.owner_user_id) is_premium,
    exists(select 1 from public.youth_academies a where a.club_id=p_club_id and a.is_active=true) has_youth_academy
  from public.clubs c where c.id=p_club_id
),
capacity_calc as (
  select rr.*,coalesce(a.assigned_count,0)::integer assigned_count,
    cs.has_developing_team,cs.is_premium,cs.has_youth_academy,
    i.hq_level,i.training_center_level,i.medical_center_level,
    i.youth_academy_level,i.scouting_level,i.mechanics_workshop_level,
    case
      when rr.role_type='trainer' then case when i.hq_level<1 then 0 when i.training_center_level>=5 then 3 when i.training_center_level>=3 then 2 else 1 end
      when rr.role_type='team_doctor' then case when i.hq_level<1 then 0 when i.medical_center_level>=3 then 2 else 1 end
      when rr.role_type='physio' then case when i.hq_level<1 then 0 when i.medical_center_level>=5 then 5 when i.medical_center_level>=4 then 4 when i.medical_center_level>=3 then 3 when i.medical_center_level>=1 then 2 else 1 end
      when rr.role_type='nutritionist' then case when i.hq_level<1 then 0 when i.medical_center_level>=2 then 1 else 0 end
      when rr.role_type='head_coach' then case when i.hq_level>=1 then 1 else 0 end
      when rr.role_type='scout_analyst' then case when i.hq_level<1 then 0 when i.scouting_level>=4 then 5 when i.scouting_level>=3 then 4 when i.scouting_level>=2 then 3 when i.scouting_level>=1 then 2 else 1 end
      when rr.role_type='mechanic' then case when i.hq_level<1 then 0 when i.mechanics_workshop_level>=4 then 5 when i.mechanics_workshop_level>=3 then 4 when i.mechanics_workshop_level>=2 then 3 when i.mechanics_workshop_level>=1 then 2 else 1 end
      when rr.role_type='u23_head_coach' then case when cs.has_developing_team and cs.is_premium and i.youth_academy_level>=1 then 1 else 0 end
      when rr.role_type='sport_director' then case when i.hq_level>=4 then 2 when i.hq_level>=2 then 1 else 0 end
      when rr.role_type in ('youth_academy_director','u16_head_coach')
        then case when cs.is_premium and cs.has_youth_academy then 1 else 0 end
      when rr.role_type='youth_scout'
        then case when cs.is_premium and cs.has_youth_academy then 3 else 0 end
      else 0
    end::integer raw_current_capacity
  from role_rows rr cross join infra i cross join club_status cs
  left join assigned a on a.role_type=rr.role_type
)
select cc.role_type,cc.display_name,cc.role_group,cc.assigned_count,
  cc.max_absolute,
  least(cc.max_absolute,cc.raw_current_capacity)::integer,
  greatest(least(cc.max_absolute,cc.raw_current_capacity)-cc.assigned_count,0)::integer,
  case
    when cc.role_type in ('youth_academy_director','u16_head_coach','youth_scout')
      then cc.is_premium and cc.has_youth_academy
    when cc.requires_developing_team and not cc.has_developing_team then false
    else least(cc.max_absolute,cc.raw_current_capacity)>0
  end,
  case
    when cc.role_type in ('youth_academy_director','u16_head_coach','youth_scout') and not cc.is_premium
      then 'Premium membership is required for Youth Academy staff.'
    when cc.role_type in ('youth_academy_director','u16_head_coach','youth_scout') and not cc.has_youth_academy
      then 'Activate Youth Academy first.'
    when cc.role_type='u23_head_coach' and not cc.is_premium
      then 'Premium membership is required for the U23 Head Coach.'
    when cc.requires_developing_team and not cc.has_developing_team
      then 'Developing Team is not unlocked.'
    when cc.role_type='u23_head_coach' and cc.youth_academy_level<1
      then 'Youth Academy Lv 1 is required.'
    when cc.role_type='sport_director' and cc.hq_level<2
      then 'Club House Lv 2 is required.'
    when cc.role_type='trainer' and cc.hq_level<1
      then 'Club House Lv 1 is required.'
    when cc.role_type='nutritionist' and cc.hq_level>=1 and cc.medical_center_level<2
      then 'Medical Center Lv 2 is required.'
    when cc.hq_level<1 and cc.role_type not in ('u23_head_coach','youth_academy_director','u16_head_coach','youth_scout')
      then 'Club House Lv 1 is required.'
    else null
  end,
  cc.facility_key,cc.gameplay_status
from capacity_calc cc
order by case cc.role_group
  when 'coaching' then 1 when 'developing_team' then 2
  when 'youth_academy' then 3 when 'medical' then 4
  when 'technical' then 5 when 'race' then 6
  when 'scouting' then 7 else 99 end,cc.display_name;
$function$;

select public.staff_market_refill_available_candidates('youth_academy_director');
select public.staff_market_refill_available_candidates('u16_head_coach');
select public.staff_market_refill_available_candidates('youth_scout');
