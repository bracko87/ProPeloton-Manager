create table if not exists public.national_association_race_team_identities (
  association_id uuid primary key
    references public.national_associations(id) on delete cascade,
  country_code text not null,
  technical_club_id uuid not null unique
    references public.clubs(id) on delete restrict,
  identity_source text not null
    check (identity_source in ('existing_national_team_pool','generated_hidden_national_team')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.national_association_race_team_identities enable row level security;

create table if not exists public.nations_group_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null
    references public.nations_competition_groups(id) on delete cascade,
  race_day integer not null check (race_day between 1 and 3),
  race_type text not null
    check (race_type in ('team_time_trial','flat_road_race','hilly_mountain_road_race')),
  cycle_key text not null,
  event_date date,
  race_id uuid references public.races(id) on delete set null,
  stage_id uuid references public.race_stages(id) on delete set null,
  source_stage_id uuid references public.race_stages(id) on delete set null,
  status text not null default 'planned'
    check (status in ('planned','scheduled','ready','running','completed','cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(group_id,race_day)
);

create index if not exists nations_group_events_race_idx
  on public.nations_group_events(race_id)
  where race_id is not null;

create index if not exists nations_group_events_stage_idx
  on public.nations_group_events(stage_id)
  where stage_id is not null;

alter table public.nations_group_events enable row level security;

create or replace function private.ensure_national_association_race_team_v1(
  p_association_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_assoc public.national_associations%rowtype;
  v_existing public.national_association_race_team_identities%rowtype;
  v_club_id uuid;
  v_division text;
  v_name text;
begin
  if p_association_id is null then
    raise exception 'Association ID is required.';
  end if;

  select * into v_existing
  from public.national_association_race_team_identities
  where association_id=p_association_id;

  if v_existing.technical_club_id is not null then
    return v_existing.technical_club_id;
  end if;

  select * into v_assoc
  from public.national_associations
  where id=p_association_id;

  if v_assoc.id is null then
    raise exception 'National Association not found.';
  end if;

  select c.id
  into v_club_id
  from public.clubs c
  where upper(c.country_code)=upper(v_assoc.country_code)
    and c.is_ai=true
    and c.deleted_at is null
    and public.is_national_team_club_v1(c.id)
  order by
    case
      when lower(c.name)=lower(v_assoc.country_code||' National Team') then 0
      when lower(c.name) like '%national team%' then 1
      else 2
    end,
    c.is_active desc,
    c.created_at
  limit 1;

  if v_club_id is null then
    v_division:=coalesce(
      public.safe_get_amateur_division_for_country(v_assoc.country_code),
      'INTERNATIONAL'
    );
    v_name:=upper(v_assoc.country_code)||' National Team';

    insert into public.clubs(
      owner_user_id,name,country_code,primary_color,secondary_color,logo_path,
      motto,crest_style,world_tier,reputation,cash_balance,club_tier,
      amateur_division,season_points,is_ai,is_active,club_type,
      created_game_date,inactivity_status,inactive_ai_controlled
    )
    values(
      null,v_name,upper(v_assoc.country_code),'#1D4ED8','#FACC15',
      'https://flagcdn.com/w160/'||lower(v_assoc.country_code)||'.png',
      'National Team',null,3,0,0,'amateur'::public.club_tier,
      v_division,0,true,false,'main',public.get_current_game_date_date(),
      'active',false
    )
    returning id into v_club_id;
  end if;

  insert into public.national_association_race_team_identities(
    association_id,country_code,technical_club_id,identity_source
  )
  values(
    v_assoc.id,
    upper(v_assoc.country_code),
    v_club_id,
    case
      when exists(
        select 1 from public.clubs c
        where c.id=v_club_id
          and c.created_game_date=public.get_current_game_date_date()
          and lower(c.name)=lower(upper(v_assoc.country_code)||' National Team')
      )
      then 'generated_hidden_national_team'
      else 'existing_national_team_pool'
    end
  )
  on conflict(association_id) do update
  set country_code=excluded.country_code,
      technical_club_id=excluded.technical_club_id,
      updated_at=now();

  return v_club_id;
end;
$function$;

revoke all on function private.ensure_national_association_race_team_v1(uuid)
from public,anon,authenticated;

create or replace function private.ensure_nations_group_runtime_v1(
  p_group_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_group public.nations_competition_groups%rowtype;
  v_entry record;
  v_cycle_key text;
  v_team_count integer:=0;
begin
  select * into v_group
  from public.nations_competition_groups
  where id=p_group_id;

  if v_group.id is null then
    raise exception 'Nations group not found.';
  end if;

  v_cycle_key:='nations:'||v_group.id::text;

  insert into public.nations_group_events(
    group_id,race_day,race_type,cycle_key,status,metadata
  )
  values
    (v_group.id,1,'team_time_trial',v_cycle_key,'planned',
      jsonb_build_object('standard_package',true,'team_cost_cash',0,'team_cost_coins',0)),
    (v_group.id,2,'flat_road_race',v_cycle_key,'planned',
      jsonb_build_object('standard_package',true,'team_cost_cash',0,'team_cost_coins',0)),
    (v_group.id,3,'hilly_mountain_road_race',v_cycle_key,'planned',
      jsonb_build_object('standard_package',true,'team_cost_cash',0,'team_cost_coins',0))
  on conflict(group_id,race_day) do update
  set cycle_key=excluded.cycle_key,
      race_type=excluded.race_type,
      metadata=public.nations_group_events.metadata||excluded.metadata,
      updated_at=now();

  for v_entry in
    select distinct ce.association_id
    from public.nations_group_entries nge
    join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
    where nge.group_id=v_group.id
  loop
    perform private.ensure_national_association_race_team_v1(v_entry.association_id);
    v_team_count:=v_team_count+1;
  end loop;

  return jsonb_build_object(
    'group_id',v_group.id,
    'cycle_key',v_cycle_key,
    'event_count',3,
    'technical_team_count',v_team_count
  );
end;
$function$;

revoke all on function private.ensure_nations_group_runtime_v1(uuid)
from public,anon,authenticated;

create or replace function private.trg_ensure_nations_group_runtime_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status='drawn'
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform private.ensure_nations_group_runtime_v1(new.id);
  end if;
  return new;
exception when others then
  insert into public.national_association_maintenance_log(
    game_date,task_key,status,details
  )
  values(
    public.get_current_game_date_date(),
    'nations_group_runtime',
    'error',
    jsonb_build_object('group_id',new.id,'message',sqlerrm)
  );
  return new;
end;
$function$;

drop trigger if exists trg_ensure_nations_group_runtime_v1
on public.nations_competition_groups;

create trigger trg_ensure_nations_group_runtime_v1
after insert or update of status
on public.nations_competition_groups
for each row
execute function private.trg_ensure_nations_group_runtime_v1();
