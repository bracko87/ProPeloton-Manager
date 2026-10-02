-- Premium Youth Academy / U16 - Phase 3
-- Separate results-only race circuit, age-based workload limits, regional/world
-- rankings, World Series qualification and December Youth World Final.

-- The U16 Head Coach is the normal race operator. Managers may retain control.
-- Drop the Phase 1 manager/Director constraint before migrating delegated rows.
alter table public.youth_academy_settings
  drop constraint if exists youth_academy_settings_race_entry_decider_check;
alter table public.youth_academy_settings
  drop constraint if exists youth_academy_settings_race_entry_decider_chk;

update public.youth_academy_settings
set race_entry_decider='u16_head_coach',updated_at=now()
where race_entry_decider='academy_director';

alter table public.youth_academy_settings
  add constraint youth_academy_settings_race_entry_decider_check
  check(race_entry_decider in ('manager','u16_head_coach'));
alter table public.youth_academy_settings
  alter column race_entry_decider set default 'u16_head_coach';

create table if not exists public.youth_races(
  id uuid primary key default gen_random_uuid(),
  season_number integer not null,
  race_date date not null,
  race_name text not null,
  race_level text not null
    check(race_level in ('regional','world_series','world_final')),
  region_code text not null
    check(region_code in ('europe','americas','asia','africa','oceania','other','world')),
  terrain_type text not null
    check(terrain_type in ('flat','hilly','mountain','time_trial','mixed')),
  distance_km integer not null check(distance_km between 30 and 120),
  entry_cost bigint not null default 0 check(entry_cost>=0),
  lineup_size smallint not null default 5 check(lineup_size between 3 and 7),
  qualification_rank_limit smallint,
  status text not null default 'scheduled'
    check(status in ('scheduled','completed','cancelled')),
  results_published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(season_number,race_date,race_name)
);

create index if not exists youth_races_season_date_idx
on public.youth_races(season_number,race_date,status);

create table if not exists public.youth_race_entries(
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.youth_races(id) on delete cascade,
  academy_id uuid not null references public.youth_academies(id) on delete cascade,
  entered_on date not null,
  entered_by text not null
    check(entered_by in ('manager','u16_head_coach','ai_head_coach','system')),
  strategy text not null default 'balanced'
    check(strategy in ('conservative','balanced','aggressive')),
  entry_cost bigint not null default 0 check(entry_cost>=0),
  status text not null default 'entered'
    check(status in ('entered','withdrawn','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(race_id,academy_id)
);

create table if not exists public.youth_race_lineups(
  entry_id uuid not null references public.youth_race_entries(id) on delete cascade,
  youth_rider_id uuid not null references public.youth_riders(id) on delete cascade,
  slot_no smallint not null check(slot_no between 1 and 7),
  selected_by text not null
    check(selected_by in ('manager','u16_head_coach','ai_head_coach','system')),
  created_at timestamptz not null default now(),
  primary key(entry_id,youth_rider_id),
  unique(entry_id,slot_no)
);

create table if not exists public.youth_race_results(
  race_id uuid not null references public.youth_races(id) on delete cascade,
  entry_id uuid not null references public.youth_race_entries(id) on delete cascade,
  academy_id uuid not null references public.youth_academies(id) on delete cascade,
  youth_rider_id uuid not null references public.youth_riders(id) on delete cascade,
  result_status text not null check(result_status in ('finished','dnf','dns')),
  finish_position integer,
  time_seconds integer,
  gap_seconds integer,
  performance_score numeric(8,3),
  regional_points integer not null default 0,
  world_points integer not null default 0,
  fatigue_delta smallint not null default 0,
  development_bonus smallint not null default 0,
  incident_code text,
  created_at timestamptz not null default now(),
  primary key(race_id,youth_rider_id)
);

create index if not exists youth_race_results_rider_idx
on public.youth_race_results(youth_rider_id,race_id);

create table if not exists public.youth_race_processing_log(
  race_id uuid primary key references public.youth_races(id) on delete cascade,
  processed_game_date date not null,
  entry_count integer not null default 0,
  rider_count integer not null default 0,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.youth_races enable row level security;
alter table public.youth_race_entries enable row level security;
alter table public.youth_race_lineups enable row level security;
alter table public.youth_race_results enable row level security;
alter table public.youth_race_processing_log enable row level security;

create or replace function private.youth_region_for_country_v1(p_country_code text)
returns text
language sql
immutable
as $function$
  select case
    when upper(coalesce(p_country_code,''))=any(array[
      'AL','AD','AT','BY','BE','BA','BG','HR','CY','CZ','DK','EE','FI','FR',
      'DE','GR','HU','IS','IE','IT','XK','LV','LI','LT','LU','MT','MD','MC',
      'ME','NL','MK','NO','PL','PT','RO','RU','SM','RS','SK','SI','ES','SE',
      'CH','TR','UA','GB'
    ]) then 'europe'
    when upper(coalesce(p_country_code,''))=any(array[
      'US','CA','MX','AR','BO','BR','CL','CO','EC','GY','PY','PE','SR','UY',
      'VE','BZ','CR','SV','GT','HN','NI','PA','CU','DO','HT','JM','TT'
    ]) then 'americas'
    when upper(coalesce(p_country_code,''))=any(array[
      'CN','JP','KR','KP','IN','PK','BD','LK','NP','BT','TH','VN','MY','SG',
      'ID','PH','MM','KH','LA','MN','KZ','UZ','KG','TJ','TM','AF','IR','IQ',
      'IL','JO','LB','SA','AE','QA','BH','KW','OM','YE','GE','AM','AZ'
    ]) then 'asia'
    when upper(coalesce(p_country_code,''))=any(array[
      'DZ','AO','BJ','BW','BF','BI','CM','CV','CF','TD','KM','CG','CD','CI',
      'DJ','EG','GQ','ER','SZ','ET','GA','GM','GH','GN','GW','KE','LS','LR',
      'LY','MG','MW','ML','MR','MU','MA','MZ','NA','NE','NG','RW','ST','SN',
      'SC','SL','SO','ZA','SS','SD','TZ','TG','TN','UG','ZM','ZW'
    ]) then 'africa'
    when upper(coalesce(p_country_code,''))=any(array[
      'AU','NZ','FJ','PG','WS','TO','VU','SB','KI','FM','MH','PW','NR','TV'
    ]) then 'oceania'
    else 'other'
  end;
$function$;

create or replace function private.youth_race_monthly_start_limit_v1(p_age integer)
returns integer
language sql
immutable
as $function$
  select case
    when p_age<=12 then 2
    when p_age=13 then 3
    when p_age=14 then 4
    when p_age=15 then 5
    else 5
  end;
$function$;

create or replace function private.youth_race_base_points_v1(p_position integer)
returns integer
language sql
immutable
as $function$
  select case p_position
    when 1 then 100 when 2 then 80 when 3 then 65 when 4 then 55 when 5 then 48
    when 6 then 42 when 7 then 36 when 8 then 32 when 9 then 28 when 10 then 24
    when 11 then 20 when 12 then 17 when 13 then 14 when 14 then 12 when 15 then 10
    when 16 then 8 when 17 then 6 when 18 then 4 when 19 then 2 when 20 then 1
    else 0
  end;
$function$;

create or replace function private.youth_deterministic_fraction_v1(p_key text)
returns numeric
language sql
immutable
as $function$
  select mod(hashtext(coalesce(p_key,''))::bigint+2147483648,10000)::numeric/10000.0;
$function$;

create or replace function private.youth_race_capability_v1(
  p_rider public.youth_riders,
  p_terrain text
)
returns numeric
language sql
immutable
as $function$
  select case p_terrain
    when 'flat' then
      p_rider.sprint*0.28+p_rider.flat*0.25+p_rider.endurance*0.15+
      p_rider.resistance*0.10+p_rider.race_iq*0.12+p_rider.teamwork*0.10
    when 'hilly' then
      p_rider.climbing*0.22+p_rider.endurance*0.20+p_rider.resistance*0.18+
      p_rider.flat*0.10+p_rider.race_iq*0.18+p_rider.recovery*0.12
    when 'mountain' then
      p_rider.climbing*0.34+p_rider.endurance*0.20+p_rider.resistance*0.16+
      p_rider.recovery*0.12+p_rider.race_iq*0.12+p_rider.teamwork*0.06
    when 'time_trial' then
      p_rider.time_trial*0.38+p_rider.flat*0.18+p_rider.endurance*0.20+
      p_rider.resistance*0.10+p_rider.race_iq*0.14
    else
      (p_rider.sprint+p_rider.climbing+p_rider.time_trial+p_rider.endurance+
       p_rider.flat+p_rider.recovery+p_rider.resistance+p_rider.race_iq+
       p_rider.teamwork)::numeric/9.0
  end;
$function$;

create or replace function private.youth_race_rider_eligible_v1(
  p_rider_id uuid,
  p_race_date date
)
returns boolean
language plpgsql
stable
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_rider public.youth_riders%rowtype;
  v_age integer;
  v_recent_starts integer;
begin
  select * into v_rider from public.youth_riders where id=p_rider_id;
  if v_rider.id is null or v_rider.status<>'academy' then return false; end if;

  v_age:=extract(year from age(p_race_date,v_rider.birth_date))::integer;
  if v_age<12 or v_age>16 then return false; end if;

  select count(*)::integer into v_recent_starts
  from public.youth_race_results rr
  join public.youth_races r on r.id=rr.race_id
  where rr.youth_rider_id=p_rider_id
    and rr.result_status in ('finished','dnf')
    and r.race_date>=p_race_date-30
    and r.race_date<p_race_date;

  return v_recent_starts<private.youth_race_monthly_start_limit_v1(v_age)
    and v_rider.fatigue<78
    and v_rider.readiness>=45;
end;
$function$;

create or replace function public.seed_youth_race_calendar_for_season_v1(
  p_season integer default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_season integer:=coalesce(p_season,public.get_current_season_number(),1);
  v_month integer;
  v_region text;
  v_round integer;
  v_day integer;
  v_terrain text;
  v_inserted integer:=0;
  v_name text;
  v_date date;
  v_regions text[]:=array['europe','americas','asia','africa','oceania','other'];
begin
  for v_month in 1..12 loop
    foreach v_region in array v_regions loop
      for v_round in 1..2 loop
        v_day:=case v_round when 1 then 6 else 20 end+
          case v_region
            when 'europe' then 0 when 'americas' then 1 when 'asia' then 2
            when 'africa' then 3 when 'oceania' then 4 else 5 end;
        if v_day>28 then v_day:=28; end if;

        v_date:=public.game_date_from_parts(v_season,v_month,v_day);
        v_terrain:=(array['flat','hilly','mountain','mixed','time_trial'])
          [1+mod(v_month+v_round+
            case v_region when 'europe' then 0 when 'americas' then 1
            when 'asia' then 2 when 'africa' then 3 when 'oceania' then 4 else 5 end,5)];
        v_name:=initcap(v_region)||' U16 Youth Cup '||v_month||'.'||v_round;

        insert into public.youth_races(
          season_number,race_date,race_name,race_level,region_code,terrain_type,
          distance_km,entry_cost,lineup_size,qualification_rank_limit,metadata
        )
        values(
          v_season,v_date,v_name,'regional',v_region,v_terrain,
          48+v_month+v_round*4,150,5,null,
          jsonb_build_object('calendar_source','phase3','series','regional_youth_cup')
        )
        on conflict(season_number,race_date,race_name) do nothing;
        if found then v_inserted:=v_inserted+1; end if;
      end loop;
    end loop;

    if v_month in (4,8,11) then
      v_date:=public.game_date_from_parts(v_season,v_month,27);
      insert into public.youth_races(
        season_number,race_date,race_name,race_level,region_code,terrain_type,
        distance_km,entry_cost,lineup_size,qualification_rank_limit,metadata
      )
      values(
        v_season,v_date,'Youth World Series '||v_month,'world_series','world',
        case v_month when 4 then 'hilly' when 8 then 'mountain' else 'mixed' end,
        78,350,5,40,
        jsonb_build_object('calendar_source','phase3','qualification','top_40_regional_rider')
      )
      on conflict(season_number,race_date,race_name) do nothing;
      if found then v_inserted:=v_inserted+1; end if;
    end if;
  end loop;

  v_date:=public.game_date_from_parts(v_season,12,28);
  insert into public.youth_races(
    season_number,race_date,race_name,race_level,region_code,terrain_type,
    distance_km,entry_cost,lineup_size,qualification_rank_limit,metadata
  )
  values(
    v_season,v_date,'Youth World Final','world_final','world','mixed',
    90,500,5,60,
    jsonb_build_object('calendar_source','phase3','qualification','top_60_world_rider')
  )
  on conflict(season_number,race_date,race_name) do nothing;
  if found then v_inserted:=v_inserted+1; end if;

  return jsonb_build_object('season_number',v_season,'races_inserted',v_inserted);
end;
$function$;

revoke all on function public.seed_youth_race_calendar_for_season_v1(integer)
from public,anon,authenticated;
grant execute on function public.seed_youth_race_calendar_for_season_v1(integer)
to service_role;

create or replace function private.youth_rider_regional_rank_v1(
  p_youth_rider_id uuid,
  p_season integer
)
returns integer
language sql
stable
security definer
set search_path=public,private,pg_temp
as $function$
  with rider_region as (
    select private.youth_region_for_country_v1(r.country_code) region_code
    from public.youth_riders r where r.id=p_youth_rider_id
  ),
  points as (
    select rr.youth_rider_id,sum(rr.regional_points)::bigint points
    from public.youth_race_results rr
    join public.youth_races r on r.id=rr.race_id
    join public.youth_riders yr on yr.id=rr.youth_rider_id
    cross join rider_region rg
    where r.season_number=p_season
      and private.youth_region_for_country_v1(yr.country_code)=rg.region_code
    group by rr.youth_rider_id
  ),
  ranked as (
    select youth_rider_id,
      dense_rank() over(order by points desc,youth_rider_id)::integer rank_no
    from points
  )
  select rank_no from ranked where youth_rider_id=p_youth_rider_id;
$function$;

create or replace function private.youth_rider_world_rank_v1(
  p_youth_rider_id uuid,
  p_season integer
)
returns integer
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  with points as (
    select rr.youth_rider_id,sum(rr.world_points)::bigint points
    from public.youth_race_results rr
    join public.youth_races r on r.id=rr.race_id
    where r.season_number=p_season
    group by rr.youth_rider_id
  ),
  ranked as (
    select youth_rider_id,
      dense_rank() over(order by points desc,youth_rider_id)::integer rank_no
    from points
  )
  select rank_no from ranked where youth_rider_id=p_youth_rider_id;
$function$;

create or replace function private.youth_race_academy_qualified_v1(
  p_academy_id uuid,
  p_race_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_race public.youth_races%rowtype;
begin
  select * into v_race from public.youth_races where id=p_race_id;
  if v_race.id is null then return false; end if;

  if v_race.race_level='regional' then
    return exists(
      select 1 from public.youth_riders r
      where r.academy_id=p_academy_id and r.status='academy'
        and private.youth_region_for_country_v1(r.country_code)=v_race.region_code
    );
  elsif v_race.race_level='world_series' then
    return exists(
      select 1 from public.youth_riders r
      where r.academy_id=p_academy_id and r.status='academy'
        and coalesce(private.youth_rider_regional_rank_v1(
          r.id,v_race.season_number
        ),9999)<=coalesce(v_race.qualification_rank_limit,40)
    );
  else
    return exists(
      select 1 from public.youth_riders r
      where r.academy_id=p_academy_id and r.status='academy'
        and coalesce(private.youth_rider_world_rank_v1(
          r.id,v_race.season_number
        ),9999)<=coalesce(v_race.qualification_rank_limit,60)
    );
  end if;
end;
$function$;

create or replace function private.select_youth_race_lineup_v1(
  p_entry_id uuid,
  p_selected_by text default 'u16_head_coach'
)
returns integer
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_entry public.youth_race_entries%rowtype;
  v_race public.youth_races%rowtype;
  v_rider record;
  v_slot integer:=0;
  v_coach_score numeric:=50;
begin
  select * into v_entry from public.youth_race_entries where id=p_entry_id;
  if v_entry.id is null then raise exception 'Youth race entry not found'; end if;
  select * into v_race from public.youth_races where id=v_entry.race_id;

  delete from public.youth_race_lineups where entry_id=p_entry_id;

  select coalesce(max(cs.expertise*0.55+cs.experience*0.20+cs.leadership*0.25),50)
  into v_coach_score
  from public.youth_academies a
  left join public.club_staff cs
    on cs.club_id=a.club_id and cs.role_type='u16_head_coach' and cs.is_active=true
  where a.id=v_entry.academy_id;

  for v_rider in
    select r.id,
      private.youth_race_capability_v1(r,v_race.terrain_type)
      +r.readiness*0.13-r.fatigue*0.16
      +v_coach_score*0.05 as selection_score
    from public.youth_riders r
    where r.academy_id=v_entry.academy_id
      and private.youth_race_rider_eligible_v1(r.id,v_race.race_date)
      and (
        v_race.race_level<>'regional'
        or private.youth_region_for_country_v1(r.country_code)=v_race.region_code
      )
      and (
        v_race.race_level='regional'
        or (
          v_race.race_level='world_series'
          and coalesce(private.youth_rider_regional_rank_v1(
            r.id,v_race.season_number
          ),9999)<=coalesce(v_race.qualification_rank_limit,40)
        )
        or (
          v_race.race_level='world_final'
          and coalesce(private.youth_rider_world_rank_v1(
            r.id,v_race.season_number
          ),9999)<=coalesce(v_race.qualification_rank_limit,60)
        )
      )
    order by selection_score desc,r.id
    limit v_race.lineup_size
  loop
    v_slot:=v_slot+1;
    insert into public.youth_race_lineups(
      entry_id,youth_rider_id,slot_no,selected_by
    )
    values(p_entry_id,v_rider.id,v_slot,p_selected_by);
  end loop;

  return v_slot;
end;
$function$;

create or replace function private.enter_youth_race_v1(
  p_academy_id uuid,
  p_race_id uuid,
  p_entered_by text,
  p_strategy text default 'balanced'
)
returns uuid
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_race public.youth_races%rowtype;
  v_academy public.youth_academies%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_entry_id uuid;
  v_lineup integer;
  v_game_date date:=public.get_current_game_date_date();
begin
  select * into v_race from public.youth_races where id=p_race_id for update;
  select * into v_academy from public.youth_academies where id=p_academy_id;
  if v_race.id is null or v_academy.id is null then raise exception 'Race or Academy not found'; end if;
  if v_race.status<>'scheduled' or v_race.race_date<=v_game_date then
    raise exception 'Youth race entry is closed';
  end if;
  if not private.youth_race_academy_qualified_v1(p_academy_id,p_race_id) then
    raise exception 'Academy is not qualified for this Youth race';
  end if;

  select * into v_budget
  from public.youth_academy_season_budgets
  where academy_id=p_academy_id and season_number=v_race.season_number
  for update;
  if v_budget.academy_id is null then raise exception 'Youth Academy season budget not found'; end if;
  if v_budget.season_budget-v_budget.spent_amount-v_budget.committed_amount<v_race.entry_cost then
    raise exception 'Youth Academy budget is insufficient for race travel/logistics';
  end if;

  insert into public.youth_race_entries(
    race_id,academy_id,entered_on,entered_by,strategy,entry_cost,status
  )
  values(
    p_race_id,p_academy_id,v_game_date,p_entered_by,
    case when p_strategy in ('conservative','balanced','aggressive')
      then p_strategy else 'balanced' end,
    v_race.entry_cost,'entered'
  )
  on conflict(race_id,academy_id) do update
  set status='entered',strategy=excluded.strategy,updated_at=now()
  returning id into v_entry_id;

  if not exists(
    select 1 from public.youth_academy_ledger l
    where l.academy_id=p_academy_id
      and l.category='race_travel'
      and l.metadata->>'race_id'=p_race_id::text
  ) then
    update public.youth_academy_season_budgets
    set spent_amount=spent_amount+v_race.entry_cost,updated_at=now()
    where academy_id=p_academy_id and season_number=v_race.season_number;

    insert into public.youth_academy_ledger(
      academy_id,season_number,game_date,category,description,amount,metadata
    )
    values(
      p_academy_id,v_race.season_number,v_game_date,'race_travel',
      'Youth race travel/logistics: '||v_race.race_name,
      -v_race.entry_cost,jsonb_build_object('race_id',p_race_id)
    );
  end if;

  select race_squad_decider into p_entered_by
  from public.youth_academy_settings where academy_id=p_academy_id;

  if coalesce(p_entered_by,'u16_head_coach')='u16_head_coach'
     or v_academy.is_ai then
    v_lineup:=private.select_youth_race_lineup_v1(
      v_entry_id,
      case when v_academy.is_ai then 'ai_head_coach' else 'u16_head_coach' end
    );
    if v_lineup<3 then
      update public.youth_race_entries set status='withdrawn',updated_at=now()
      where id=v_entry_id;
      raise exception 'Not enough eligible Youth Riders for this race';
    end if;
  end if;

  return v_entry_id;
end;
$function$;

create or replace function private.auto_enter_youth_races_v1(
  p_game_date date
)
returns integer
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_pair record;
  v_count integer:=0;
  v_strategy text;
begin
  -- Seven days before each event the delegated Head Coach/AI chooses whether
  -- the race fits the Academy and roster. Manager-controlled Academies are left
  -- untouched.
  for v_pair in
    select r.id race_id,a.id academy_id,a.is_ai,
      coalesce(s.race_entry_decider,'u16_head_coach') race_entry_decider
    from public.youth_races r
    cross join public.youth_academies a
    left join public.youth_academy_settings s on s.academy_id=a.id
    where r.status='scheduled'
      and r.race_date=p_game_date+7
      and a.is_active=true
      and (a.is_ai or coalesce(s.race_entry_decider,'u16_head_coach')='u16_head_coach')
      and not exists(
        select 1 from public.youth_race_entries e
        where e.race_id=r.id and e.academy_id=a.id
      )
      and private.youth_race_academy_qualified_v1(a.id,r.id)
  loop
    v_strategy:=case
      when private.youth_deterministic_fraction_v1(v_pair.race_id::text||v_pair.academy_id::text||'strategy')<0.22
        then 'conservative'
      when private.youth_deterministic_fraction_v1(v_pair.race_id::text||v_pair.academy_id::text||'strategy')>0.78
        then 'aggressive'
      else 'balanced'
    end;
    begin
      perform private.enter_youth_race_v1(
        v_pair.academy_id,v_pair.race_id,
        case when v_pair.is_ai then 'ai_head_coach' else 'u16_head_coach' end,
        v_strategy
      );
      v_count:=v_count+1;
    exception when others then
      -- A delegated Academy may skip because of budget, eligibility or fatigue.
      null;
    end;
  end loop;
  return v_count;
end;
$function$;

create or replace function private.simulate_youth_race_v1(p_race_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_race public.youth_races%rowtype;
  v_row record;
  v_position integer:=0;
  v_finished integer:=0;
  v_dnf integer:=0;
  v_dns integer:=0;
  v_points integer;
  v_regional integer;
  v_world integer;
  v_gap integer;
  v_time integer;
  v_fatigue integer;
  v_dev integer;
begin
  select * into v_race from public.youth_races where id=p_race_id for update;
  if v_race.id is null then raise exception 'Youth race not found'; end if;
  if exists(select 1 from public.youth_race_processing_log where race_id=p_race_id) then
    return (select result from public.youth_race_processing_log where race_id=p_race_id);
  end if;

  create temporary table if not exists pg_temp.youth_race_scores(
    entry_id uuid,academy_id uuid,youth_rider_id uuid,
    result_status text,score numeric
  ) on commit drop;
  truncate pg_temp.youth_race_scores;

  insert into pg_temp.youth_race_scores(
    entry_id,academy_id,youth_rider_id,result_status,score
  )
  select
    e.id,e.academy_id,l.youth_rider_id,
    case
      when r.id is null or r.status<>'academy' then 'dns'
      when not private.youth_race_rider_eligible_v1(r.id,v_race.race_date) then 'dns'
      when private.youth_deterministic_fraction_v1(
        p_race_id::text||r.id::text||'incident'
      )<0.025 then 'dnf'
      else 'finished'
    end,
    case when r.id is null then 0 else
      private.youth_race_capability_v1(r,v_race.terrain_type)
      +r.readiness*0.10-r.fatigue*0.14
      +case e.strategy when 'aggressive' then 1.4 when 'conservative' then -0.4 else 0 end
      +coalesce((
        select avg(inv.quality_score)::numeric*0.025
        from public.youth_academy_equipment_inventory inv
        where inv.academy_id=e.academy_id and inv.status in ('available','in_use')
      ),0)
      +coalesce((
        select max(cs.expertise*0.55+cs.experience*0.20+cs.leadership*0.25)*0.04
        from public.youth_academies a
        left join public.club_staff cs
          on cs.club_id=a.club_id and cs.role_type='u16_head_coach' and cs.is_active=true
        where a.id=e.academy_id
      ),2)
      +(private.youth_deterministic_fraction_v1(
        p_race_id::text||r.id::text||'form'
      )-0.5)*8.0
    end
  from public.youth_race_entries e
  join public.youth_race_lineups l on l.entry_id=e.id
  left join public.youth_riders r on r.id=l.youth_rider_id
  where e.race_id=p_race_id and e.status='entered';

  for v_row in
    select * from pg_temp.youth_race_scores
    order by
      case result_status when 'finished' then 0 when 'dnf' then 1 else 2 end,
      score desc,youth_rider_id
  loop
    if v_row.result_status='finished' then
      v_position:=v_position+1;
      v_finished:=v_finished+1;
      v_points:=private.youth_race_base_points_v1(v_position);
      if v_race.race_level='regional' then
        v_regional:=v_points;
        v_world:=round(v_points*0.35)::integer;
      elsif v_race.race_level='world_series' then
        v_regional:=0;
        v_world:=round(v_points*1.5)::integer;
      else
        v_regional:=0;
        v_world:=v_points*2;
      end if;
      v_gap:=greatest(0,round((100-v_row.score)*2.2)::integer+v_position*2);
      if v_position=1 then v_gap:=0; end if;
      v_time:=round(v_race.distance_km*85+greatest(0,70-v_row.score)*3)::integer;
      v_fatigue:=case
        when v_race.distance_km>=85 then 15
        when v_race.distance_km>=70 then 12 else 9 end;
      v_dev:=case when private.youth_deterministic_fraction_v1(
        p_race_id::text||v_row.youth_rider_id::text||'development'
      )<case when v_position<=5 then 0.18 else 0.10 end then 1 else 0 end;
    elsif v_row.result_status='dnf' then
      v_dnf:=v_dnf+1;
      v_regional:=0;v_world:=0;v_gap:=null;v_time:=null;v_fatigue:=11;v_dev:=0;
    else
      v_dns:=v_dns+1;
      v_regional:=0;v_world:=0;v_gap:=null;v_time:=null;v_fatigue:=0;v_dev:=0;
    end if;

    insert into public.youth_race_results(
      race_id,entry_id,academy_id,youth_rider_id,result_status,finish_position,
      time_seconds,gap_seconds,performance_score,regional_points,world_points,
      fatigue_delta,development_bonus,incident_code
    )
    values(
      p_race_id,v_row.entry_id,v_row.academy_id,v_row.youth_rider_id,
      v_row.result_status,
      case when v_row.result_status='finished' then v_position else null end,
      v_time,v_gap,v_row.score,v_regional,v_world,v_fatigue,v_dev,
      case when v_row.result_status='dnf' then 'race_incident' else null end
    );

    if v_fatigue>0 then
      update public.youth_riders
      set fatigue=least(100,fatigue+v_fatigue),
          readiness=greatest(0,readiness-round(v_fatigue*0.65)::integer),
          updated_at=now()
      where id=v_row.youth_rider_id;
    end if;

    if v_dev>0 then
      perform private.apply_youth_attribute_delta_v1(
        v_row.youth_rider_id,
        case v_race.terrain_type
          when 'flat' then 'flat' when 'hilly' then 'endurance'
          when 'mountain' then 'climbing' when 'time_trial' then 'time_trial'
          else 'race_iq' end,
        1
      );
    end if;
  end loop;

  update public.youth_race_entries
  set status='completed',updated_at=now()
  where race_id=p_race_id and status='entered';

  update public.youth_races
  set status='completed',results_published_at=now(),updated_at=now()
  where id=p_race_id;

  insert into public.youth_race_processing_log(
    race_id,processed_game_date,entry_count,rider_count,result
  )
  values(
    p_race_id,v_race.race_date,
    (select count(*) from public.youth_race_entries where race_id=p_race_id and status='completed'),
    v_finished+v_dnf+v_dns,
    jsonb_build_object(
      'race_id',p_race_id,'finished',v_finished,'dnf',v_dnf,'dns',v_dns,
      'results_only',true,'replay_available',false
    )
  );

  return (select result from public.youth_race_processing_log where race_id=p_race_id);
end;
$function$;

create or replace function public.process_youth_race_day_v1(p_game_date date)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_race record;
  v_auto_entries integer:=0;
  v_processed integer:=0;
begin
  if not exists(select 1 from public.youth_races where season_number=v_season) then
    perform public.seed_youth_race_calendar_for_season_v1(v_season);
  end if;

  -- Repair AI Academy support rows from early Phase 1 seeds.
  insert into public.youth_academy_settings(
    academy_id,race_entry_decider,race_squad_decider
  )
  select a.id,'u16_head_coach','u16_head_coach'
  from public.youth_academies a
  where a.is_active=true
  on conflict(academy_id) do nothing;

  insert into public.youth_academy_season_budgets(
    academy_id,season_number,season_budget,spent_amount,committed_amount,
    scouting_range,scouting_budget,scouting_committed_amount
  )
  select a.id,v_season,100000,0,5000,'local',5000,5000
  from public.youth_academies a
  where a.is_active=true
  on conflict(academy_id,season_number) do nothing;

  v_auto_entries:=private.auto_enter_youth_races_v1(p_game_date);

  for v_race in
    select id from public.youth_races
    where status='scheduled' and race_date<=p_game_date
    order by race_date,id
  loop
    perform private.simulate_youth_race_v1(v_race.id);
    v_processed:=v_processed+1;
  end loop;

  return jsonb_build_object(
    'game_date',p_game_date,
    'auto_entries',v_auto_entries,
    'races_processed',v_processed
  );
end;
$function$;

revoke all on function public.process_youth_race_day_v1(date)
from public,anon,authenticated;
grant execute on function public.process_youth_race_day_v1(date)
to service_role;

-- Add race processing to the existing Youth Academy day processor.
do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='process_youth_academy_game_day_v1'
  order by p.oid desc limit 1;

  if v_oid is null then raise exception 'process_youth_academy_game_day_v1 not found'; end if;
  v_def:=replace(pg_get_functiondef(v_oid),E'\r\n',E'\n');

  v_new:=replace(
    v_def,
    '  v_dev jsonb;',
    '  v_dev jsonb;'||E'\n'||'  v_races jsonb;'
  );
  if v_new=v_def then raise exception 'Youth race daily declaration patch point not found'; end if;
  v_def:=v_new;

  v_new:=replace(
    v_def,
    '  v_dev:=private.process_youth_development_week_v1(p_game_date);',
    '  v_dev:=private.process_youth_development_week_v1(p_game_date);'||E'\n'||
    '  v_races:=public.process_youth_race_day_v1(p_game_date);'
  );
  if v_new=v_def then raise exception 'Youth race daily execution patch point not found'; end if;
  v_def:=v_new;

  v_new:=replace(
    v_def,
    E'    ''development'',v_dev,\n    ''ai_graduated_to_developing'',v_ai_graduated,',
    E'    ''development'',v_dev,\n    ''races'',v_races,\n    ''ai_graduated_to_developing'',v_ai_graduated,'
  );
  if v_new=v_def then raise exception 'Youth race daily report patch point not found'; end if;

  execute v_new;
end $$;

create or replace function public.get_my_youth_race_calendar_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_region text;
  v_game_date date:=public.get_current_game_date_date();
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_entry_decider text;
  v_squad_decider text;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select a.id,private.youth_region_for_country_v1(c.country_code),
         s.race_entry_decider,s.race_squad_decider
  into v_academy_id,v_region,v_entry_decider,v_squad_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  left join public.youth_academy_settings s on s.academy_id=a.id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active=true
  limit 1;

  if v_academy_id is null then
    return jsonb_build_object('activated',false,'races','[]'::jsonb);
  end if;

  return jsonb_build_object(
    'activated',true,
    'season_number',v_season,
    'game_date',v_game_date,
    'academy_region',v_region,
    'race_entry_decider',coalesce(v_entry_decider,'u16_head_coach'),
    'race_squad_decider',coalesce(v_squad_decider,'u16_head_coach'),
    'races',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',r.id,
        'race_date',r.race_date,
        'race_name',r.race_name,
        'race_level',r.race_level,
        'region_code',r.region_code,
        'terrain_type',r.terrain_type,
        'distance_km',r.distance_km,
        'entry_cost',r.entry_cost,
        'lineup_size',r.lineup_size,
        'status',r.status,
        'qualified',private.youth_race_academy_qualified_v1(v_academy_id,r.id),
        'entry_id',e.id,
        'entry_status',e.status,
        'strategy',e.strategy,
        'entered_by',e.entered_by,
        'eligible_rider_ids',coalesce((
          select jsonb_agg(yr.id order by yr.display_name)
          from public.youth_riders yr
          where yr.academy_id=v_academy_id
            and private.youth_race_rider_eligible_v1(yr.id,r.race_date)
            and (
              r.race_level<>'regional'
              or private.youth_region_for_country_v1(yr.country_code)=r.region_code
            )
            and (
              r.race_level='regional'
              or (
                r.race_level='world_series'
                and coalesce(private.youth_rider_regional_rank_v1(
                  yr.id,r.season_number
                ),9999)<=coalesce(r.qualification_rank_limit,40)
              )
              or (
                r.race_level='world_final'
                and coalesce(private.youth_rider_world_rank_v1(
                  yr.id,r.season_number
                ),9999)<=coalesce(r.qualification_rank_limit,60)
              )
            )
        ),'[]'::jsonb),
        'lineup',coalesce((
          select jsonb_agg(jsonb_build_object(
            'rider_id',yr.id,'name',yr.display_name,'age',
            extract(year from age(r.race_date,yr.birth_date))::integer,
            'role',yr.role,'readiness',yr.readiness,'fatigue',yr.fatigue,
            'eligible',private.youth_race_rider_eligible_v1(yr.id,r.race_date)
          ) order by l.slot_no)
          from public.youth_race_lineups l
          join public.youth_riders yr on yr.id=l.youth_rider_id
          where l.entry_id=e.id
        ),'[]'::jsonb),
        'my_results',coalesce((
          select jsonb_agg(jsonb_build_object(
            'rider_id',yr.id,'name',yr.display_name,
            'status',rr.result_status,'position',rr.finish_position,
            'gap_seconds',rr.gap_seconds,'regional_points',rr.regional_points,
            'world_points',rr.world_points
          ) order by rr.finish_position nulls last,yr.display_name)
          from public.youth_race_results rr
          join public.youth_riders yr on yr.id=rr.youth_rider_id
          where rr.race_id=r.id and rr.academy_id=v_academy_id
        ),'[]'::jsonb),
        'top_results',case when r.status='completed' then coalesce((
          select jsonb_agg(x.item order by x.position)
          from (
            select rr.finish_position position,jsonb_build_object(
              'position',rr.finish_position,'rider_name',yr.display_name,
              'country_code',yr.country_code,'academy_name',c.name,
              'gap_seconds',rr.gap_seconds
            ) item
            from public.youth_race_results rr
            join public.youth_riders yr on yr.id=rr.youth_rider_id
            join public.youth_academies a on a.id=rr.academy_id
            join public.clubs c on c.id=a.club_id
            where rr.race_id=r.id and rr.result_status='finished'
            order by rr.finish_position
            limit 10
          ) x
        ),'[]'::jsonb) else '[]'::jsonb end
      ) order by r.race_date,r.race_name),'[]'::jsonb)
      from public.youth_races r
      left join public.youth_race_entries e
        on e.race_id=r.id and e.academy_id=v_academy_id
      where r.season_number=v_season
        and (
          (r.race_level='regional' and r.region_code=v_region)
          or r.race_level in ('world_series','world_final')
        )
    ),
    'riders',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',yr.id,'name',yr.display_name,'age',
        extract(year from age(v_game_date,yr.birth_date))::integer,
        'role',yr.role,'readiness',yr.readiness,'fatigue',yr.fatigue
      ) order by yr.display_name),'[]'::jsonb)
      from public.youth_riders yr
      where yr.academy_id=v_academy_id and yr.status='academy'
    )
  );
end;
$function$;

revoke all on function public.get_my_youth_race_calendar_v1()
from public,anon;
grant execute on function public.get_my_youth_race_calendar_v1()
to authenticated;

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
  v_entry_decider text;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  select a.id,s.race_entry_decider
  into v_academy_id,v_entry_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  left join public.youth_academy_settings s on s.academy_id=a.id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active=true
  limit 1;

  if v_academy_id is null then raise exception 'Youth Academy is not activated'; end if;
  if coalesce(v_entry_decider,'u16_head_coach')<>'manager' then
    raise exception 'Race participation is delegated to the U16 Head Coach';
  end if;

  perform private.enter_youth_race_v1(v_academy_id,p_race_id,'manager',p_strategy);
  return public.get_my_youth_race_calendar_v1();
end;
$function$;

revoke all on function public.enter_my_youth_race_v1(uuid,text)
from public,anon;
grant execute on function public.enter_my_youth_race_v1(uuid,text)
to authenticated;

create or replace function public.save_my_youth_race_lineup_v1(
  p_race_id uuid,
  p_rider_ids uuid[],
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
  v_entry public.youth_race_entries%rowtype;
  v_race public.youth_races%rowtype;
  v_squad_decider text;
  v_rider_id uuid;
  v_slot integer:=0;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  select a.id,s.race_squad_decider
  into v_academy_id,v_squad_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  left join public.youth_academy_settings s on s.academy_id=a.id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active=true
  limit 1;

  if coalesce(v_squad_decider,'u16_head_coach')<>'manager' then
    raise exception 'Race squad selection is delegated to the U16 Head Coach';
  end if;

  select * into v_entry from public.youth_race_entries
  where race_id=p_race_id and academy_id=v_academy_id and status='entered'
  for update;
  select * into v_race from public.youth_races where id=p_race_id;

  if v_entry.id is null then raise exception 'Enter the race before selecting a lineup'; end if;
  if cardinality(p_rider_ids)<3 or cardinality(p_rider_ids)>v_race.lineup_size then
    raise exception 'Youth race lineup must contain between 3 and % riders',v_race.lineup_size;
  end if;

  delete from public.youth_race_lineups where entry_id=v_entry.id;

  foreach v_rider_id in array p_rider_ids loop
    if not exists(
      select 1 from public.youth_riders yr
      where yr.id=v_rider_id and yr.academy_id=v_academy_id
        and private.youth_race_rider_eligible_v1(yr.id,v_race.race_date)
    ) then
      raise exception 'One or more selected Youth Riders are not eligible';
    end if;
    v_slot:=v_slot+1;
    insert into public.youth_race_lineups(
      entry_id,youth_rider_id,slot_no,selected_by
    )
    values(v_entry.id,v_rider_id,v_slot,'manager');
  end loop;

  update public.youth_race_entries
  set strategy=case when p_strategy in ('conservative','balanced','aggressive')
    then p_strategy else 'balanced' end,
      updated_at=now()
  where id=v_entry.id;

  return public.get_my_youth_race_calendar_v1();
end;
$function$;

revoke all on function public.save_my_youth_race_lineup_v1(uuid,uuid[],text)
from public,anon;
grant execute on function public.save_my_youth_race_lineup_v1(uuid,uuid[],text)
to authenticated;

create or replace function public.get_my_youth_rankings_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_region text;
  v_season integer:=coalesce(public.get_current_season_number(),1);
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select a.id,private.youth_region_for_country_v1(c.country_code)
  into v_academy_id,v_region
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active=true
  limit 1;

  if v_academy_id is null then
    return jsonb_build_object('activated',false);
  end if;

  return jsonb_build_object(
    'activated',true,
    'season_number',v_season,
    'region_code',v_region,
    'regional',(
      with totals as (
        select yr.id,yr.display_name,yr.country_code,yr.academy_id,
          sum(rr.regional_points)::bigint points,
          count(*) filter(where rr.result_status='finished')::integer starts
        from public.youth_riders yr
        join public.youth_race_results rr on rr.youth_rider_id=yr.id
        join public.youth_races r on r.id=rr.race_id
        where r.season_number=v_season
          and private.youth_region_for_country_v1(yr.country_code)=v_region
        group by yr.id,yr.display_name,yr.country_code,yr.academy_id
      ),
      ranked as (
        select t.*,dense_rank() over(order by points desc,id)::integer rank_no
        from totals t
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'rank',x.rank_no,'rider_id',x.id,'rider_name',x.display_name,
        'country_code',x.country_code,'academy_id',x.academy_id,
        'academy_name',c.name,'points',x.points,'starts',x.starts,
        'is_mine',x.academy_id=v_academy_id
      ) order by x.rank_no),'[]'::jsonb)
      from (select * from ranked order by rank_no limit 100) x
      join public.youth_academies a on a.id=x.academy_id
      join public.clubs c on c.id=a.club_id
    ),
    'world',(
      with totals as (
        select yr.id,yr.display_name,yr.country_code,yr.academy_id,
          sum(rr.world_points)::bigint points,
          count(*) filter(where rr.result_status='finished')::integer starts
        from public.youth_riders yr
        join public.youth_race_results rr on rr.youth_rider_id=yr.id
        join public.youth_races r on r.id=rr.race_id
        where r.season_number=v_season
        group by yr.id,yr.display_name,yr.country_code,yr.academy_id
      ),
      ranked as (
        select t.*,dense_rank() over(order by points desc,id)::integer rank_no
        from totals t
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'rank',x.rank_no,'rider_id',x.id,'rider_name',x.display_name,
        'country_code',x.country_code,'academy_id',x.academy_id,
        'academy_name',c.name,'points',x.points,'starts',x.starts,
        'is_mine',x.academy_id=v_academy_id
      ) order by x.rank_no),'[]'::jsonb)
      from (select * from ranked order by rank_no limit 100) x
      join public.youth_academies a on a.id=x.academy_id
      join public.clubs c on c.id=a.club_id
    )
  );
end;
$function$;

revoke all on function public.get_my_youth_rankings_v1()
from public,anon;
grant execute on function public.get_my_youth_rankings_v1()
to authenticated;

-- Seed current season immediately.
select public.seed_youth_race_calendar_for_season_v1(
  coalesce(public.get_current_season_number(),1)
);
