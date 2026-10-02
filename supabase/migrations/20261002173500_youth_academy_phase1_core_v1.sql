-- Premium Youth Academy / U16 - Phase 1 core.
-- Fixed user capacity: 16. No infrastructure dependency in V1.
-- Youth riders are structurally separate from professional riders.

create table if not exists public.youth_academies(
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null unique references public.clubs(id) on delete cascade,
  is_ai boolean not null default false,
  is_active boolean not null default true,
  activated_at timestamptz not null default now(),
  activated_season integer not null,
  capacity integer not null default 16 check(capacity=16),
  reputation integer not null default 0 check(reputation between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.youth_academy_season_budgets(
  academy_id uuid not null references public.youth_academies(id) on delete cascade,
  season_number integer not null,
  season_budget bigint not null default 100000 check(season_budget>=0),
  spent_amount bigint not null default 0 check(spent_amount>=0),
  committed_amount bigint not null default 0 check(committed_amount>=0),
  scouting_range text not null default 'local'
    check(scouting_range in ('local','regional','continental','world')),
  scouting_budget bigint not null default 5000 check(scouting_budget>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(academy_id,season_number)
);

create table if not exists public.youth_academy_scouting_programs(
  range_code text primary key,
  label text not null,
  season_cost bigint not null check(season_cost>=0),
  sort_order integer not null,
  is_active boolean not null default true
);

insert into public.youth_academy_scouting_programs(range_code,label,season_cost,sort_order,is_active)
values
  ('local','Local',5000,1,true),
  ('regional','Regional',20000,2,true),
  ('continental','Continental',50000,3,true),
  ('world','Worldwide',120000,4,true)
on conflict(range_code) do update
set label=excluded.label,
    season_cost=excluded.season_cost,
    sort_order=excluded.sort_order,
    is_active=true;

create table if not exists public.youth_academy_settings(
  academy_id uuid primary key references public.youth_academies(id) on delete cascade,
  recruitment_decider text not null default 'manager'
    check(recruitment_decider in ('manager','academy_director')),
  race_entry_decider text not null default 'manager'
    check(race_entry_decider in ('manager','academy_director')),
  race_squad_decider text not null default 'u16_head_coach'
    check(race_squad_decider in ('manager','u16_head_coach')),
  camp_decider text not null default 'manager'
    check(camp_decider in ('manager','academy_director')),
  equipment_decider text not null default 'manager'
    check(equipment_decider in ('manager','academy_director')),
  recruitment_negotiation_decider text not null default 'manager'
    check(recruitment_negotiation_decider in ('manager','academy_director')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.youth_riders(
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.youth_academies(id) on delete cascade,
  country_code text not null,
  first_name text not null,
  last_name text not null,
  display_name text generated always as (trim(first_name||' '||last_name)) stored,
  birth_date date not null,
  role text not null default 'all_rounder',
  sprint smallint not null check(sprint between 1 and 100),
  climbing smallint not null check(climbing between 1 and 100),
  time_trial smallint not null check(time_trial between 1 and 100),
  endurance smallint not null check(endurance between 1 and 100),
  flat smallint not null check(flat between 1 and 100),
  recovery smallint not null check(recovery between 1 and 100),
  resistance smallint not null check(resistance between 1 and 100),
  race_iq smallint not null check(race_iq between 1 and 100),
  teamwork smallint not null check(teamwork between 1 and 100),
  hidden_potential smallint not null check(hidden_potential between 1 and 100),
  readiness smallint not null default 70 check(readiness between 0 and 100),
  fatigue smallint not null default 0 check(fatigue between 0 and 100),
  development_focus text not null default 'balanced',
  workload text not null default 'moderate'
    check(workload in ('light','moderate','high')),
  joined_game_date date not null,
  joined_season integer not null,
  status text not null default 'academy'
    check(status in ('academy','graduating','released','graduated')),
  is_starter_rider boolean not null default false,
  is_ai_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists youth_riders_academy_status_idx
on public.youth_riders(academy_id,status);

create table if not exists public.youth_rider_agreements(
  id uuid primary key default gen_random_uuid(),
  youth_rider_id uuid not null references public.youth_riders(id) on delete cascade,
  academy_id uuid not null references public.youth_academies(id) on delete cascade,
  stipend_weekly integer not null check(stipend_weekly>=0),
  accommodation_weekly integer not null default 0 check(accommodation_weekly>=0),
  starts_on date not null,
  ends_on date,
  status text not null default 'active'
    check(status in ('active','expired','ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists youth_rider_active_agreement_uidx
on public.youth_rider_agreements(youth_rider_id)
where status='active';

create table if not exists public.youth_academy_ledger(
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.youth_academies(id) on delete cascade,
  season_number integer not null,
  game_date date not null,
  category text not null,
  description text not null,
  amount bigint not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.youth_ai_academy_season_selection(
  season_number integer not null,
  club_id uuid not null references public.clubs(id) on delete cascade,
  academy_id uuid references public.youth_academies(id) on delete cascade,
  selection_reason text not null check(selection_reason in ('worldteam_all','proteam_random_half')),
  created_at timestamptz not null default now(),
  primary key(season_number,club_id)
);

alter table public.youth_academies enable row level security;
alter table public.youth_academy_season_budgets enable row level security;
alter table public.youth_academy_settings enable row level security;
alter table public.youth_riders enable row level security;
alter table public.youth_rider_agreements enable row level security;
alter table public.youth_academy_ledger enable row level security;
alter table public.youth_ai_academy_season_selection enable row level security;

create or replace function private.youth_academy_age_v1(p_birth_date date)
returns integer
language sql
stable
set search_path=public,pg_temp
as $function$
  select extract(year from age(public.get_current_game_date_date(),p_birth_date))::integer;
$function$;

create or replace function private.youth_potential_band_v1(p_potential integer)
returns text
language sql
immutable
as $function$
  select case
    when coalesce(p_potential,0) >= 82 then 'Exceptional'
    when coalesce(p_potential,0) >= 74 then 'Very Promising'
    when coalesce(p_potential,0) >= 63 then 'Promising'
    else 'Limited'
  end;
$function$;

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
    v_potential:=52+floor(random()*21)::integer; -- 52..72
    if random()<0.03 then
      v_potential:=73+floor(random()*9)::integer; -- rare stronger local starter
    end if;
  else
    v_potential:=48+floor(random()*35)::integer; -- 48..82 normal discovery pool
    if random()<0.015 then
      v_potential:=83+floor(random()*7)::integer; -- rare wonderkid
    end if;
  end if;

  v_birth_date:=make_date(
    extract(year from v_game_date)::integer-v_age,
    1+floor(random()*12)::integer,
    1+floor(random()*28)::integer
  );

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

create or replace function private.create_youth_academy_staff_v1(
  p_club_id uuid,
  p_country_code text,
  p_role_type text
)
returns uuid
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_first text;
  v_last text;
  v_expertise integer:=48+floor(random()*13)::integer;
  v_experience integer:=45+floor(random()*16)::integer;
  v_potential integer:=55+floor(random()*16)::integer;
  v_leadership integer:=48+floor(random()*16)::integer;
  v_efficiency integer:=48+floor(random()*16)::integer;
  v_loyalty integer:=55+floor(random()*21)::integer;
  v_salary integer;
  v_birth date;
  v_id uuid;
begin
  select fn.first_name into v_first
  from public.first_names_master fn
  where upper(fn.country_code)=upper(p_country_code)
  order by random() limit 1;

  select ln.last_name into v_last
  from public.last_names_master ln
  where upper(ln.country_code)=upper(p_country_code)
  order by random() limit 1;

  if v_first is null then
    select first_name into v_first from public.first_names_master order by random() limit 1;
  end if;
  if v_last is null then
    select last_name into v_last from public.last_names_master order by random() limit 1;
  end if;

  v_salary:=public.calculate_staff_weekly_salary(
    p_role_type,v_expertise,v_experience,v_potential,v_leadership,v_efficiency,v_loyalty,'youth'
  );
  v_birth:=make_date(
    extract(year from public.get_current_game_date_date())::int-(32+floor(random()*24)::int),
    1+floor(random()*12)::int,
    1+floor(random()*28)::int
  );

  insert into public.club_staff(
    club_id,role_type,specialization,team_scope,staff_name,first_name,last_name,
    country_code,expertise,experience,potential,leadership,efficiency,loyalty,
    salary_weekly,contract_expires_at,birth_date,is_active,notes
  )
  values(
    p_club_id,p_role_type,'youth_development','youth',
    trim(coalesce(v_first,'Alex')||' '||coalesce(v_last,'Staff')),
    coalesce(v_first,'Alex'),coalesce(v_last,'Staff'),upper(p_country_code),
    v_expertise,v_experience,v_potential,v_leadership,v_efficiency,v_loyalty,
    v_salary,public.get_game_date_for_season_end(coalesce(public.get_current_season_number(),1)),
    v_birth,true,jsonb_build_object('youth_academy_staff',true,'auto_assigned',true)
  )
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.get_my_youth_academy_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_club public.clubs%rowtype;
  v_academy public.youth_academies%rowtype;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_premium boolean:=false;
  v_budget jsonb;
  v_settings jsonb;
  v_riders jsonb;
  v_staff jsonb;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select * into v_club
  from public.clubs c
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and c.parent_club_id is null
    and coalesce(c.club_type,'main')<>'developing'
  order by c.created_at asc limit 1;

  if v_club.id is null then raise exception 'Main club not found'; end if;

  v_premium:=public.user_has_premium_access_v1(v_user);

  select * into v_academy
  from public.youth_academies a
  where a.club_id=v_club.id limit 1;

  if v_academy.id is null then
    return jsonb_build_object(
      'premium',v_premium,
      'activated',false,
      'club_id',v_club.id,
      'club_name',v_club.name,
      'country_code',v_club.country_code,
      'capacity',16,
      'starter_riders',6,
      'default_season_budget',100000,
      'default_scouting_range','local',
      'default_scouting_cost',5000
    );
  end if;

  select to_jsonb(b) into v_budget
  from public.youth_academy_season_budgets b
  where b.academy_id=v_academy.id and b.season_number=v_season;

  select to_jsonb(s) into v_settings
  from public.youth_academy_settings s
  where s.academy_id=v_academy.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,
    'display_name',r.display_name,
    'country_code',r.country_code,
    'age',private.youth_academy_age_v1(r.birth_date),
    'role',r.role,
    'assessment_band',private.youth_potential_band_v1(r.hidden_potential),
    'development_focus',r.development_focus,
    'workload',r.workload,
    'readiness',r.readiness,
    'fatigue',r.fatigue,
    'status',r.status,
    'stipend_weekly',coalesce(agr.stipend_weekly,0)
  ) order by r.birth_date), '[]'::jsonb)
  into v_riders
  from public.youth_riders r
  left join public.youth_rider_agreements agr
    on agr.youth_rider_id=r.id and agr.status='active'
  where r.academy_id=v_academy.id
    and r.status in ('academy','graduating');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',cs.id,
    'role_type',cs.role_type,
    'staff_name',cs.staff_name,
    'country_code',cs.country_code,
    'expertise',cs.expertise,
    'experience',cs.experience,
    'potential',cs.potential,
    'leadership',cs.leadership,
    'efficiency',cs.efficiency,
    'salary_weekly',cs.salary_weekly
  ) order by cs.role_type), '[]'::jsonb)
  into v_staff
  from public.club_staff cs
  where cs.club_id=v_club.id
    and cs.is_active=true
    and cs.role_type in ('youth_academy_director','u16_head_coach','youth_scout');

  return jsonb_build_object(
    'premium',v_premium,
    'activated',true,
    'read_only',not v_premium,
    'club_id',v_club.id,
    'club_name',v_club.name,
    'country_code',v_club.country_code,
    'academy',jsonb_build_object(
      'id',v_academy.id,
      'capacity',16,
      'active_riders',jsonb_array_length(v_riders),
      'reputation',v_academy.reputation,
      'activated_season',v_academy.activated_season
    ),
    'budget',coalesce(v_budget,'{}'::jsonb),
    'settings',coalesce(v_settings,'{}'::jsonb),
    'riders',v_riders,
    'staff',v_staff,
    'scouting_programs',(
      select coalesce(jsonb_agg(to_jsonb(p) order by p.sort_order),'[]'::jsonb)
      from public.youth_academy_scouting_programs p where p.is_active=true
    )
  );
end;
$function$;

grant execute on function public.get_my_youth_academy_v1() to authenticated;

create or replace function public.activate_my_youth_academy_v1(
  p_season_budget bigint default 100000
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_club public.clubs%rowtype;
  v_academy_id uuid;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_i integer;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Youth Academy is available only to Premium members.';
  end if;

  select * into v_club
  from public.clubs c
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and c.parent_club_id is null
    and coalesce(c.club_type,'main')<>'developing'
  order by c.created_at asc limit 1;

  if v_club.id is null then raise exception 'Main club not found'; end if;

  perform pg_advisory_xact_lock(hashtext('youth_academy_activate:'||v_club.id::text));

  select a.id into v_academy_id
  from public.youth_academies a where a.club_id=v_club.id limit 1;

  if v_academy_id is null then
    insert into public.youth_academies(
      club_id,is_ai,is_active,activated_season,capacity
    )
    values(v_club.id,false,true,v_season,16)
    returning id into v_academy_id;

    insert into public.youth_academy_settings(academy_id)
    values(v_academy_id);

    for v_i in 1..6 loop
      perform private.create_youth_rider_v1(
        v_academy_id,v_club.country_code,true,false
      );
    end loop;

    perform private.create_youth_academy_staff_v1(
      v_club.id,v_club.country_code,'youth_academy_director'
    );
    perform private.create_youth_academy_staff_v1(
      v_club.id,v_club.country_code,'u16_head_coach'
    );
  end if;

  insert into public.youth_academy_season_budgets(
    academy_id,season_number,season_budget,scouting_range,scouting_budget
  )
  values(
    v_academy_id,v_season,greatest(coalesce(p_season_budget,100000),0),
    'local',5000
  )
  on conflict(academy_id,season_number) do nothing;

  return public.get_my_youth_academy_v1();
end;
$function$;

grant execute on function public.activate_my_youth_academy_v1(bigint) to authenticated;

create or replace function public.update_my_youth_academy_settings_v1(
  p_recruitment_decider text default null,
  p_race_entry_decider text default null,
  p_race_squad_decider text default null,
  p_camp_decider text default null,
  p_equipment_decider text default null,
  p_recruitment_negotiation_decider text default null,
  p_scouting_range text default null,
  p_season_budget bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_scout_cost bigint;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  select a.id into v_academy_id
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user and c.deleted_at is null
  limit 1;

  if v_academy_id is null then raise exception 'Youth Academy is not activated'; end if;

  update public.youth_academy_settings s
  set
    recruitment_decider=coalesce(p_recruitment_decider,s.recruitment_decider),
    race_entry_decider=coalesce(p_race_entry_decider,s.race_entry_decider),
    race_squad_decider=coalesce(p_race_squad_decider,s.race_squad_decider),
    camp_decider=coalesce(p_camp_decider,s.camp_decider),
    equipment_decider=coalesce(p_equipment_decider,s.equipment_decider),
    recruitment_negotiation_decider=coalesce(
      p_recruitment_negotiation_decider,s.recruitment_negotiation_decider
    ),
    updated_at=now()
  where s.academy_id=v_academy_id;

  if p_scouting_range is not null then
    select p.season_cost into v_scout_cost
    from public.youth_academy_scouting_programs p
    where p.range_code=p_scouting_range and p.is_active=true;

    if v_scout_cost is null then raise exception 'Invalid scouting range'; end if;
  end if;

  update public.youth_academy_season_budgets b
  set
    season_budget=coalesce(p_season_budget,b.season_budget),
    scouting_range=coalesce(p_scouting_range,b.scouting_range),
    scouting_budget=case
      when p_scouting_range is not null then v_scout_cost
      else b.scouting_budget
    end,
    updated_at=now()
  where b.academy_id=v_academy_id and b.season_number=v_season;

  return public.get_my_youth_academy_v1();
end;
$function$;

grant execute on function public.update_my_youth_academy_settings_v1(
  text,text,text,text,text,text,text,bigint
) to authenticated;

-- Dedicated Youth Academy staff roles. They are Premium roles but deliberately
-- have no infrastructure dependency in V1.
insert into public.staff_role_catalog(
  role_type,display_name,role_group,max_absolute,facility_key,is_market_role,
  requires_developing_team,gameplay_status,description,updated_at
)
values
  (
    'youth_academy_director','Youth Academy Director','youth_academy',1,null,true,
    false,'live',
    'Runs the U16 academy budget, programme, recruitment delegation, camps and operating requests.',
    now()
  ),
  (
    'u16_head_coach','U16 Head Coach','youth_academy',1,null,true,
    false,'live',
    'Controls U16 training, workload, development focus and normal youth race squad selection.',
    now()
  ),
  (
    'youth_scout','Youth Scout','youth_academy',1,null,true,
    false,'live',
    'Discovers and assesses Youth Academy prospects within the funded scouting range.',
    now()
  )
on conflict(role_type) do update
set display_name=excluded.display_name,
    role_group=excluded.role_group,
    max_absolute=excluded.max_absolute,
    facility_key=null,
    is_market_role=true,
    requires_developing_team=false,
    gameplay_status='live',
    description=excluded.description,
    updated_at=now();

-- Staff-page capacity RPC: Youth Academy roles are fixed one-per-role and
-- unlocked only for Premium clubs with an activated academy.
create or replace function public.get_staff_role_capacity_overview_for_club(p_club_id uuid)
returns table(
  role_type text,
  limit_count integer,
  active_count integer,
  open_slots integer,
  can_hire boolean
)
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
with infra as (
  select
    coalesce(ci.hq_level,1) as hq_level,
    coalesce(ci.training_center_level,0) as training_center_level,
    coalesce(ci.medical_center_level,0) as medical_center_level,
    coalesce(ci.scouting_level,0) as scouting_level,
    coalesce(ci.youth_academy_level,0) as youth_academy_level,
    coalesce(ci.mechanics_workshop_level,0) as mechanics_workshop_level
  from public.club_infrastructure ci where ci.club_id=p_club_id
),
safe_infra as (
  select * from infra
  union all select 1,0,0,0,0,0 where not exists(select 1 from infra)
),
club_access as (
  select
    public.user_has_premium_access_v1(c.owner_user_id) as is_premium,
    exists(
      select 1 from public.clubs d
      where d.parent_club_id=c.id and d.club_type='developing'
        and d.deleted_at is null
        and public.is_developing_team_access_active_v1(d.id)
    ) as has_active_developing_team,
    exists(
      select 1 from public.youth_academies a
      where a.club_id=c.id and a.is_active=true
    ) as has_youth_academy
  from public.clubs c where c.id=p_club_id
),
safe_access as (
  select * from club_access
  union all select false,false,false where not exists(select 1 from club_access)
),
limits as (
  select v.role_type,v.limit_count
  from safe_infra i
  cross join safe_access access
  cross join lateral(values
    ('head_coach'::text,1::integer),
    ('trainer'::text,case when i.training_center_level>=3 then 2 else 1 end),
    ('team_doctor'::text,case when i.medical_center_level>=3 then 2 else 1 end),
    ('physio'::text,case when i.medical_center_level>=5 then 5 when i.medical_center_level>=4 then 4 when i.medical_center_level>=3 then 3 when i.medical_center_level>=1 then 2 else 1 end),
    ('nutritionist'::text,case when i.medical_center_level>=2 then 1 else 0 end),
    ('mechanic'::text,case when i.mechanics_workshop_level>=4 then 5 when i.mechanics_workshop_level>=3 then 4 when i.mechanics_workshop_level>=2 then 3 when i.mechanics_workshop_level>=1 then 2 else 1 end),
    ('sport_director'::text,case when i.hq_level>=4 then 2 when i.hq_level>=2 then 1 else 0 end),
    ('scout_analyst'::text,case when i.scouting_level>=4 then 5 when i.scouting_level>=3 then 4 when i.scouting_level>=2 then 3 when i.scouting_level>=1 then 2 else 1 end),
    ('u23_head_coach'::text,case when access.is_premium and access.has_active_developing_team and i.youth_academy_level>=1 then 1 else 0 end),
    ('youth_academy_director'::text,case when access.is_premium and access.has_youth_academy then 1 else 0 end),
    ('u16_head_coach'::text,case when access.is_premium and access.has_youth_academy then 1 else 0 end),
    ('youth_scout'::text,case when access.is_premium and access.has_youth_academy then 1 else 0 end)
  ) as v(role_type,limit_count)
),
active_counts as (
  select cs.role_type,count(*)::integer as active_count
  from public.club_staff cs
  where cs.club_id=p_club_id and cs.is_active=true
  group by cs.role_type
)
select
  l.role_type,l.limit_count,
  coalesce(a.active_count,0)::integer,
  greatest(l.limit_count-coalesce(a.active_count,0),0)::integer,
  (l.limit_count>coalesce(a.active_count,0))::boolean
from limits l
left join active_counts a on a.role_type=l.role_type
order by case l.role_type
  when 'head_coach' then 1 when 'trainer' then 2 when 'team_doctor' then 3
  when 'physio' then 4 when 'nutritionist' then 5 when 'mechanic' then 6
  when 'sport_director' then 7 when 'scout_analyst' then 8 when 'u23_head_coach' then 9
  when 'youth_academy_director' then 10 when 'u16_head_coach' then 11
  when 'youth_scout' then 12 else 99 end;
$function$;

-- Main capacity/catalog RPC receives the same V1 no-infrastructure rule.
create or replace function public.get_club_staff_role_capacity(p_club_id uuid)
returns table(
  role_type text,display_name text,role_group text,assigned_count integer,
  max_absolute integer,current_capacity integer,open_slots integer,
  is_unlocked boolean,locked_reason text,facility_key text,gameplay_status text
)
language sql
stable security definer
set search_path=public
as $function$
with role_rows as (
  select rc.role_type,rc.display_name,rc.role_group,rc.max_absolute,
         rc.facility_key,rc.requires_developing_team,rc.gameplay_status
  from public.staff_role_catalog rc
  where rc.is_market_role=true
),
infra as (
  select coalesce(max(ci.hq_level),0)::integer as hq_level,
         coalesce(max(ci.training_center_level),0)::integer as training_center_level,
         coalesce(max(ci.medical_center_level),0)::integer as medical_center_level,
         coalesce(max(ci.youth_academy_level),0)::integer as youth_academy_level,
         coalesce(max(ci.scouting_level),0)::integer as scouting_level,
         coalesce(max(ci.mechanics_workshop_level),0)::integer as mechanics_workshop_level
  from public.club_infrastructure ci where ci.club_id=p_club_id
),
assigned as (
  select cs.role_type,count(*)::integer as assigned_count
  from public.club_staff cs
  where cs.club_id=p_club_id and coalesce(cs.is_active,true)=true
  group by cs.role_type
),
club_status as (
  select
    exists(select 1 from public.clubs dc where dc.parent_club_id=p_club_id and coalesce(dc.club_type,'')='developing' and dc.deleted_at is null) as has_developing_team,
    public.user_has_premium_access_v1(c.owner_user_id) as is_premium,
    exists(select 1 from public.youth_academies a where a.club_id=p_club_id and a.is_active=true) as has_youth_academy
  from public.clubs c where c.id=p_club_id
),
capacity_calc as (
  select rr.*,coalesce(a.assigned_count,0)::integer as assigned_count,
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
      when rr.role_type in ('youth_academy_director','u16_head_coach','youth_scout')
        then case when cs.is_premium and cs.has_youth_academy then 1 else 0 end
      else 0
    end::integer as raw_current_capacity
  from role_rows rr cross join infra i cross join club_status cs
  left join assigned a on a.role_type=rr.role_type
)
select
  cc.role_type,cc.display_name,cc.role_group,cc.assigned_count,cc.max_absolute,
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
  when 'coaching' then 1 when 'developing_team' then 2 when 'youth_academy' then 3
  when 'medical' then 4 when 'technical' then 5 when 'race' then 6
  when 'scouting' then 7 else 99 end,cc.display_name;
$function$;

-- Hiring guards and youth team_scope support.
do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='hire_staff_candidate'
  order by p.oid desc limit 1;

  if v_oid is null then raise exception 'hire_staff_candidate not found'; end if;
  v_def:=replace(pg_get_functiondef(v_oid),E'\r\n',E'\n');

  v_new:=replace(
    v_def,
    $$  if v_candidate.role_type = 'u23_head_coach'
     and not public.current_user_has_premium_v1() then
    raise exception 'Premium membership is required to hire a U23 Head Coach.';
  end if;$$,
    $$  if v_candidate.role_type = 'u23_head_coach'
     and not public.current_user_has_premium_v1() then
    raise exception 'Premium membership is required to hire a U23 Head Coach.';
  end if;

  if v_candidate.role_type in ('youth_academy_director','u16_head_coach','youth_scout') then
    if not public.current_user_has_premium_v1() then
      raise exception 'Premium membership is required to hire Youth Academy staff.';
    end if;

    if not exists(
      select 1 from public.youth_academies ya
      where ya.club_id=v_club_id and ya.is_active=true
    ) then
      raise exception 'Activate Youth Academy before hiring Youth Academy staff.';
    end if;
  end if;$$
  );
  if v_new=v_def then raise exception 'Youth staff Premium guard patch point not found'; end if;
  v_def:=v_new;

  v_new:=replace(
    v_def,
    $$      when 'u23' then 'u23'
      else 'all'
    end;$$,
    $$      when 'u23' then 'u23'
      when 'youth' then 'youth'
      else 'all'
    end;$$
  );
  if v_new=v_def then raise exception 'Youth team_scope patch point not found'; end if;

  execute v_new;
end $$;

-- Initial replacement candidates for all three Youth Academy roles.
do $$
declare
  v_role text;
  v_i integer;
  v_first text;
  v_last text;
  v_country text;
  v_expertise integer;
  v_experience integer;
  v_potential integer;
  v_leadership integer;
  v_efficiency integer;
  v_loyalty integer;
begin
  foreach v_role in array array['youth_academy_director','u16_head_coach','youth_scout']
  loop
    for v_i in 1..18 loop
      select country_code into v_country
      from public.first_names_master
      where country_code is not null
      order by random() limit 1;

      select first_name into v_first
      from public.first_names_master
      where country_code=v_country
      order by random() limit 1;

      select last_name into v_last
      from public.last_names_master
      where country_code=v_country
      order by random() limit 1;

      v_expertise:=42+floor(random()*42)::integer;
      v_experience:=38+floor(random()*45)::integer;
      v_potential:=48+floor(random()*38)::integer;
      v_leadership:=40+floor(random()*43)::integer;
      v_efficiency:=42+floor(random()*42)::integer;
      v_loyalty:=45+floor(random()*41)::integer;

      insert into public.staff_candidates(
        role_type,specialization,staff_name,first_name,last_name,country_code,
        expertise,experience,potential,leadership,efficiency,loyalty,
        salary_weekly,is_available,notes,birth_date
      )
      values(
        v_role,'youth_development',
        trim(coalesce(v_first,'Alex')||' '||coalesce(v_last,'Staff')),
        coalesce(v_first,'Alex'),coalesce(v_last,'Staff'),coalesce(v_country,'GB'),
        v_expertise,v_experience,v_potential,v_leadership,v_efficiency,v_loyalty,
        public.calculate_staff_weekly_salary(
          v_role,v_expertise,v_experience,v_potential,v_leadership,v_efficiency,v_loyalty,'youth'
        ),
        true,jsonb_build_object('team_scope_hint','youth','youth_academy_staff',true),
        make_date(
          extract(year from public.get_current_game_date_date())::integer-(30+floor(random()*28)::integer),
          1+floor(random()*12)::integer,
          1+floor(random()*28)::integer
        )
      );
    end loop;
  end loop;
end $$;

create or replace function public.seed_ai_youth_academies_for_season_v1(
  p_season integer default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_season integer:=coalesce(p_season,public.get_current_season_number(),1);
  v_club record;
  v_academy_id uuid;
  v_current integer;
  v_target integer;
  v_i integer;
  v_world integer:=0;
  v_pro integer:=0;
  v_riders integer:=0;
begin
  -- Every active AI WorldTeam.
  for v_club in
    select c.*
    from public.clubs c
    where c.club_type='main' and c.is_ai=true and c.is_active=true
      and c.deleted_at is null and c.club_tier='worldteam'
  loop
    insert into public.youth_academies(club_id,is_ai,is_active,activated_season,capacity)
    values(v_club.id,true,true,v_season,16)
    on conflict(club_id) do update set is_ai=true,is_active=true,updated_at=now()
    returning id into v_academy_id;

    insert into public.youth_ai_academy_season_selection(
      season_number,club_id,academy_id,selection_reason
    )
    values(v_season,v_club.id,v_academy_id,'worldteam_all')
    on conflict(season_number,club_id) do update
      set academy_id=excluded.academy_id,selection_reason=excluded.selection_reason;

    select count(*) into v_current
    from public.youth_riders r
    where r.academy_id=v_academy_id and r.status='academy'
      and private.youth_academy_age_v1(r.birth_date)<=16;

    v_target:=10+floor(random()*6)::integer;
    for v_i in (v_current+1)..v_target loop
      if v_i>=1 then
        perform private.create_youth_rider_v1(v_academy_id,v_club.country_code,false,true);
        v_riders:=v_riders+1;
      end if;
    end loop;
    v_world:=v_world+1;
  end loop;

  -- Roughly half of active AI ProTeams, but at least 15 when available.
  for v_club in
    with pool as (
      select c.*,row_number() over(order by random()) as rn,
             count(*) over() as total_count
      from public.clubs c
      where c.club_type='main' and c.is_ai=true and c.is_active=true
        and c.deleted_at is null and c.club_tier='proteam'
    )
    select *
    from pool
    where rn<=least(total_count,greatest(15,ceil(total_count/2.0)::integer))
  loop
    insert into public.youth_academies(club_id,is_ai,is_active,activated_season,capacity)
    values(v_club.id,true,true,v_season,16)
    on conflict(club_id) do update set is_ai=true,is_active=true,updated_at=now()
    returning id into v_academy_id;

    insert into public.youth_ai_academy_season_selection(
      season_number,club_id,academy_id,selection_reason
    )
    values(v_season,v_club.id,v_academy_id,'proteam_random_half')
    on conflict(season_number,club_id) do update
      set academy_id=excluded.academy_id,selection_reason=excluded.selection_reason;

    select count(*) into v_current
    from public.youth_riders r
    where r.academy_id=v_academy_id and r.status='academy'
      and private.youth_academy_age_v1(r.birth_date)<=16;

    v_target:=10+floor(random()*6)::integer;
    for v_i in (v_current+1)..v_target loop
      if v_i>=1 then
        perform private.create_youth_rider_v1(v_academy_id,v_club.country_code,false,true);
        v_riders:=v_riders+1;
      end if;
    end loop;
    v_pro:=v_pro+1;
  end loop;

  return jsonb_build_object(
    'season',v_season,
    'worldteam_academies',v_world,
    'proteam_academies',v_pro,
    'riders_created',v_riders
  );
end;
$function$;

revoke all on function public.seed_ai_youth_academies_for_season_v1(integer)
from public,anon,authenticated;
grant execute on function public.seed_ai_youth_academies_for_season_v1(integer)
to service_role;

-- Seed the current season so human Premium academies will not race alone.
select public.seed_ai_youth_academies_for_season_v1(
  coalesce(public.get_current_season_number(),1)
);
