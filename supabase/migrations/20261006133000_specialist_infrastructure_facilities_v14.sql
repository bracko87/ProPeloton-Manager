-- Four single-level specialist infrastructure facilities v14.
-- Team Residential Campus, Sprint Performance Circuit,
-- Climbing Performance Center and Team Time Trial Center.

alter table public.club_infrastructure
  add column if not exists team_residential_campus_level smallint not null default 0,
  add column if not exists sprint_performance_circuit_level smallint not null default 0,
  add column if not exists climbing_performance_center_level smallint not null default 0,
  add column if not exists team_time_trial_center_level smallint not null default 0;

alter table public.infrastructure_facility_upgrade_config
  drop constraint if exists infrastructure_facility_upgrade_config_facility_key_check,
  add constraint infrastructure_facility_upgrade_config_facility_key_check
    check(facility_key in (
      'club_house',
      'training_center',
      'medical_center',
      'scouting_office',
      'youth_academy',
      'mechanics_workshop',
      'team_residential_campus',
      'sprint_performance_circuit',
      'climbing_performance_center',
      'team_time_trial_center'
    ));

alter table public.club_infrastructure
  drop constraint if exists club_infrastructure_team_residential_campus_level_check,
  add constraint club_infrastructure_team_residential_campus_level_check
    check(team_residential_campus_level between 0 and 1),
  drop constraint if exists club_infrastructure_sprint_performance_circuit_level_check,
  add constraint club_infrastructure_sprint_performance_circuit_level_check
    check(sprint_performance_circuit_level between 0 and 1),
  drop constraint if exists club_infrastructure_climbing_performance_center_level_check,
  add constraint club_infrastructure_climbing_performance_center_level_check
    check(climbing_performance_center_level between 0 and 1),
  drop constraint if exists club_infrastructure_team_time_trial_center_level_check,
  add constraint club_infrastructure_team_time_trial_center_level_check
    check(team_time_trial_center_level between 0 and 1);

-- Max levels are derived automatically by public.infrastructure_facility_max_levels from upgrade config rows.

insert into public.infrastructure_facility_upgrade_config(
  facility_key,target_level,cost_cash,duration_game_days,
  unlock_summary,effect_summary,monthly_maintenance_cash
)
values
(
  'team_residential_campus',1,850000,180,
  'Requires Youth Academy Level 1.',
  'Club-owned home-base accommodation for First Team, U23, U16 and permanent staff; home-base accommodation costs are waived; U16 and U23 recovery effectiveness +5%; race and Training Camp hotels remain chargeable.',
  6000
),
(
  'sprint_performance_circuit',1,700000,120,
  'Requires Training Center Level 2.',
  'Sprint-focused development +4% First Team, +8% U23, +12% U16; U23 and U16 sprint-related race-development progress +5%.',
  4000
),
(
  'climbing_performance_center',1,800000,150,
  'Requires Training Center Level 2.',
  'Climbing-focused development +4% First Team, +8% U23, +12% U16; U23 and U16 climbing-related race-development progress +5%.',
  5000
),
(
  'team_time_trial_center',1,1200000,180,
  'Requires Training Center Level 2.',
  'Time Trial-focused development +4% First Team, +7% U23, +10% U16; U23/U16 TTT race-development progress +5%; Team Time Trial pacing efficiency +5%.',
  7000
)
on conflict(facility_key,target_level) do update
set cost_cash=excluded.cost_cash,
    duration_game_days=excluded.duration_game_days,
    unlock_summary=excluded.unlock_summary,
    effect_summary=excluded.effect_summary,
    monthly_maintenance_cash=excluded.monthly_maintenance_cash,
    updated_at=now();

update public.infrastructure_facility_upgrade_config
set effect_summary=
  'U23 regular-training development +6%; U23 race-development progress +5%; U16 regular development +8%; U16 race-development progress +6%.',
    updated_at=now()
where facility_key='youth_academy' and target_level=1;

update public.infrastructure_facility_upgrade_config
set effect_summary=
  'U23 regular-training development +12%; U23 race-development progress +10%; U23 Head Coach development effect +10%; U23 off-focus decay -20%; U16 regular development +15%; U16 race-development progress +12%; U16 Head Coach development effectiveness +12%.',
    updated_at=now()
where facility_key='youth_academy' and target_level=2;

create or replace function public.team_residential_campus_active_v1(
  p_club_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  with resolved as (
    select case
      when c.club_type='developing' then coalesce(c.parent_club_id,c.id)
      else c.id
    end infrastructure_club_id
    from public.clubs c
    where c.id=p_club_id
    limit 1
  )
  select coalesce(ci.team_residential_campus_level,0)>=1
  from resolved r
  left join public.club_infrastructure ci
    on ci.club_id=r.infrastructure_club_id;
$function$;

create or replace function public.specialist_training_bonus_bps_v1(
  p_club_id uuid,
  p_focus_code text
)
returns integer
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  with resolved as (
    select
      case when c.club_type='developing'
        then coalesce(c.parent_club_id,c.id)
        else c.id end infrastructure_club_id,
      c.club_type='developing' is_u23
    from public.clubs c
    where c.id=p_club_id
    limit 1
  )
  select case lower(coalesce(p_focus_code,''))
    when 'sprint' then
      case when coalesce(ci.sprint_performance_circuit_level,0)>=1
        then case when r.is_u23 then 800 else 400 end else 0 end
    when 'climbing' then
      case when coalesce(ci.climbing_performance_center_level,0)>=1
        then case when r.is_u23 then 800 else 400 end else 0 end
    when 'time_trial' then
      case when coalesce(ci.team_time_trial_center_level,0)>=1
        then case when r.is_u23 then 700 else 400 end else 0 end
    else 0
  end::integer
  from resolved r
  left join public.club_infrastructure ci
    on ci.club_id=r.infrastructure_club_id;
$function$;

create or replace function private.youth_u16_infrastructure_development_multiplier_v1(
  p_academy_id uuid,
  p_focus_code text,
  p_is_race boolean default false
)
returns numeric
language plpgsql
stable
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_club_id uuid;
  v_youth_level integer:=0;
  v_sprint integer:=0;
  v_climb integer:=0;
  v_ttt integer:=0;
  v_bonus_bps integer:=0;
begin
  select a.club_id into v_club_id
  from public.youth_academies a where a.id=p_academy_id;
  if v_club_id is null then return 1.0; end if;

  select
    coalesce(ci.youth_academy_level,0),
    coalesce(ci.sprint_performance_circuit_level,0),
    coalesce(ci.climbing_performance_center_level,0),
    coalesce(ci.team_time_trial_center_level,0)
  into v_youth_level,v_sprint,v_climb,v_ttt
  from public.club_infrastructure ci
  where ci.club_id=v_club_id;

  if coalesce(p_is_race,false) then
    v_bonus_bps:=case v_youth_level
      when 1 then 600 when 2 then 1200 else 0 end;
    v_bonus_bps:=v_bonus_bps+
      case lower(coalesce(p_focus_code,''))
        when 'sprint' then case when v_sprint>=1 then 500 else 0 end
        when 'climbing' then case when v_climb>=1 then 500 else 0 end
        when 'time_trial' then case when v_ttt>=1 then 500 else 0 end
        else 0 end;
  else
    v_bonus_bps:=case v_youth_level
      when 1 then 800 when 2 then 1500 else 0 end;
    if v_youth_level>=2 then
      v_bonus_bps:=v_bonus_bps+1200;
    end if;
    v_bonus_bps:=v_bonus_bps+
      case lower(coalesce(p_focus_code,''))
        when 'sprint' then case when v_sprint>=1 then 1200 else 0 end
        when 'climbing' then case when v_climb>=1 then 1200 else 0 end
        when 'time_trial' then case when v_ttt>=1 then 1000 else 0 end
        else 0 end;
  end if;

  return 1.0+v_bonus_bps::numeric/10000.0;
end;
$function$;

create or replace function public.start_club_facility_upgrade(
  p_club_id uuid,
  p_facility text
)
returns public.club_infrastructure_jobs
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_uid uuid;
  v_facility text;
  v_infra public.club_infrastructure%rowtype;
  v_current_level smallint;
  v_target_level smallint;
  v_max_level integer;
  v_config public.infrastructure_facility_upgrade_config%rowtype;
  v_current_game_date date;
  v_started_game_date date;
  v_complete_game_date date;
  v_job public.club_infrastructure_jobs%rowtype;
  v_finance_tx_id uuid;
begin
  v_uid:=auth.uid();
  if v_uid is null then raise exception 'Not authenticated'; end if;

  v_facility:=lower(trim(coalesce(p_facility,'')));
  if v_facility='scouting' then v_facility:='scouting_office'; end if;

  if v_facility not in (
    'club_house','training_center','medical_center','scouting_office',
    'youth_academy','mechanics_workshop','team_residential_campus',
    'sprint_performance_circuit','climbing_performance_center',
    'team_time_trial_center'
  ) then
    raise exception 'Unknown facility: %',p_facility;
  end if;

  if not exists(
    select 1
    from public.clubs c
    left join public.club_memberships cm
      on cm.club_id=c.id and cm.user_id=v_uid
    where c.id=p_club_id
      and (c.owner_user_id=v_uid or cm.user_id is not null)
  ) then
    raise exception 'Not allowed to manage infrastructure for this club';
  end if;

  v_current_game_date:=public.get_current_game_date_date();
  if v_current_game_date is null then
    raise exception 'start_club_facility_upgrade: could not resolve current game date';
  end if;

  select * into v_infra
  from public.club_infrastructure
  where club_id=p_club_id
  for update;
  if not found then
    raise exception 'Infrastructure row not found for club %',p_club_id;
  end if;

  case v_facility
    when 'club_house' then v_current_level:=v_infra.hq_level;
    when 'training_center' then v_current_level:=v_infra.training_center_level;
    when 'medical_center' then v_current_level:=v_infra.medical_center_level;
    when 'youth_academy' then v_current_level:=v_infra.youth_academy_level;
    when 'mechanics_workshop' then v_current_level:=v_infra.mechanics_workshop_level;
    when 'scouting_office' then v_current_level:=v_infra.scouting_level;
    when 'team_residential_campus' then v_current_level:=v_infra.team_residential_campus_level;
    when 'sprint_performance_circuit' then v_current_level:=v_infra.sprint_performance_circuit_level;
    when 'climbing_performance_center' then v_current_level:=v_infra.climbing_performance_center_level;
    when 'team_time_trial_center' then v_current_level:=v_infra.team_time_trial_center_level;
    else raise exception 'Unknown facility: %',v_facility;
  end case;

  if v_facility='team_residential_campus'
     and coalesce(v_infra.youth_academy_level,0)<1 then
    raise exception 'Team Residential Campus requires Youth Academy Level 1';
  end if;

  if v_facility in (
      'sprint_performance_circuit',
      'climbing_performance_center',
      'team_time_trial_center'
    )
    and coalesce(v_infra.training_center_level,0)<2 then
    raise exception '% requires Training Center Level 2',
      initcap(replace(v_facility,'_',' '));
  end if;

  select max(target_level) into v_max_level
  from public.infrastructure_facility_upgrade_config
  where facility_key=v_facility;
  if v_max_level is null then
    raise exception 'No upgrade configuration found for facility %',v_facility;
  end if;
  if v_current_level>=v_max_level then
    raise exception 'Facility % is already at max level %',v_facility,v_max_level;
  end if;

  if exists(
    select 1 from public.club_infrastructure_jobs j
    where j.club_id=p_club_id
      and j.job_type='facility_upgrade'
      and j.target_key=v_facility
      and j.status='pending'
  ) then
    raise exception 'A pending facility upgrade already exists for %',v_facility;
  end if;

  v_target_level:=v_current_level+1;
  select * into v_config
  from public.infrastructure_facility_upgrade_config
  where facility_key=v_facility and target_level=v_target_level;
  if not found then
    raise exception 'Missing upgrade configuration for facility %, target level %',
      v_facility,v_target_level;
  end if;

  v_started_game_date:=v_current_game_date;
  v_complete_game_date:=v_current_game_date+v_config.duration_game_days;

  insert into public.club_infrastructure_jobs(
    club_id,job_type,target_key,status,facility_target_level,asset_quantity,
    cost_cash,finance_transaction_id,started_at,complete_at,completed_at,
    duration_game_days,started_game_date,complete_game_date,created_by_user_id,
    metadata
  )
  values(
    p_club_id,'facility_upgrade',v_facility,'pending',v_target_level,null,
    v_config.cost_cash,null,now(),
    now()+make_interval(days=>v_config.duration_game_days),null,
    v_config.duration_game_days,v_started_game_date,v_complete_game_date,v_uid,
    jsonb_build_object(
      'kind','facility_upgrade','facility',v_facility,
      'from_level',v_current_level,'to_level',v_target_level,
      'cost_cash',v_config.cost_cash,
      'duration_game_days',v_config.duration_game_days,
      'started_game_date',v_started_game_date,
      'complete_game_date',v_complete_game_date,
      'unlock_summary',v_config.unlock_summary,
      'effect_summary',v_config.effect_summary,
      'timing_model','game_days'
    )
  )
  returning * into v_job;

  perform set_config('finance.internal','1',true);
  v_finance_tx_id:=public.finance_spend_from_club(
    p_club_id:=p_club_id,
    p_amount:=v_config.cost_cash,
    p_type:='infrastructure_facility_start',
    p_sink_code:='SINK',
    p_idempotency_key:='infra_job:'||v_job.id::text,
    p_metadata:=jsonb_build_object(
      'job_id',v_job.id,'job_type','facility_upgrade',
      'target_key',v_facility,'from_level',v_current_level,
      'target_level',v_target_level,'cost_cash',v_config.cost_cash,
      'duration_game_days',v_config.duration_game_days,
      'started_game_date',v_started_game_date,
      'complete_game_date',v_complete_game_date,
      'unlock_summary',v_config.unlock_summary,
      'effect_summary',v_config.effect_summary,
      'timing_model','game_days'
    )
  );

  update public.club_infrastructure_jobs
  set finance_transaction_id=v_finance_tx_id
  where id=v_job.id
  returning * into v_job;

  return v_job;
end;
$function$;

create or replace function private.apply_special_facility_completion_v1()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
begin
  if new.job_type='facility_upgrade'
     and new.status='completed'
     and old.status is distinct from 'completed'
     and new.facility_target_level is not null then
    update public.club_infrastructure
    set
      team_residential_campus_level=
        case when new.target_key='team_residential_campus'
          then greatest(team_residential_campus_level,new.facility_target_level)
          else team_residential_campus_level end,
      sprint_performance_circuit_level=
        case when new.target_key='sprint_performance_circuit'
          then greatest(sprint_performance_circuit_level,new.facility_target_level)
          else sprint_performance_circuit_level end,
      climbing_performance_center_level=
        case when new.target_key='climbing_performance_center'
          then greatest(climbing_performance_center_level,new.facility_target_level)
          else climbing_performance_center_level end,
      team_time_trial_center_level=
        case when new.target_key='team_time_trial_center'
          then greatest(team_time_trial_center_level,new.facility_target_level)
          else team_time_trial_center_level end,
      updated_at=now()
    where club_id=new.club_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_apply_special_facility_completion_v1
on public.club_infrastructure_jobs;
create trigger trg_apply_special_facility_completion_v1
after update of status on public.club_infrastructure_jobs
for each row
execute function private.apply_special_facility_completion_v1();

create or replace function public.trg_apply_specialist_facility_regular_training_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_club_id uuid;
  v_bonus_bps integer:=0;
  v_before numeric:=0;
  v_after numeric:=0;
  v_focus text;
begin
  if new.source is distinct from 'regular_training'
     or coalesce(new.activity_type,'')<>'training'
     or coalesce(new.participated,false)=false then
    return new;
  end if;
  if lower(coalesce(new.metadata->>'development_eligible','true'))
     in ('false','0','no') then return new; end if;
  if lower(coalesce(new.metadata->>'specialist_facility_effect_applied','false'))
     in ('true','1','yes') then return new; end if;

  select cr.club_id into v_club_id
  from public.club_riders cr
  join public.clubs c on c.id=cr.club_id and c.deleted_at is null
  where cr.rider_id=new.rider_id
  limit 1;
  if v_club_id is null then return new; end if;

  v_focus:=lower(coalesce(new.metadata->>'focus_code',''));
  v_bonus_bps:=public.specialist_training_bonus_bps_v1(v_club_id,v_focus);
  if v_bonus_bps<=0 then return new; end if;

  v_before:=coalesce(nullif(new.metadata->>'development_value_base','')::numeric,0);
  if v_before<=0 then return new; end if;
  v_after:=round(v_before*(1+v_bonus_bps::numeric/10000.0),4);

  new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
    'specialist_facility_focus',v_focus,
    'specialist_facility_bonus_bps',v_bonus_bps,
    'development_before_specialist_facility',round(v_before,4),
    'development_value_base',v_after,
    'specialist_facility_effect_applied',true,
    'specialist_facility_effect_version','specialist_facilities_v1'
  );
  return new;
end;
$function$;

drop trigger if exists trg_zzzzzzz_specialist_facility_regular_training_v1
on public.rider_daily_activity;
create trigger trg_zzzzzzz_specialist_facility_regular_training_v1
before insert or update on public.rider_daily_activity
for each row
execute function public.trg_apply_specialist_facility_regular_training_v1();

create or replace function public.trg_apply_specialist_race_development_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_parent uuid;
  v_club_type text;
  v_infra public.club_infrastructure%rowtype;
  v_key text;
  v_progress jsonb;
  v_value numeric;
  v_total numeric:=0;
begin
  if new.team_id is null or new.progress_json is null then return new; end if;
  if lower(coalesce(new.metadata->>'specialist_race_development_applied','false'))
     in ('true','1','yes') then return new; end if;

  select c.club_type,coalesce(c.parent_club_id,c.id)
  into v_club_type,v_parent
  from public.clubs c where c.id=new.team_id;
  if coalesce(v_club_type,'')<>'developing' then return new; end if;

  select * into v_infra from public.club_infrastructure where club_id=v_parent;
  if not found then return new; end if;

  if lower(coalesce(new.stage_format,''))='team_time_trial'
     and v_infra.team_time_trial_center_level>=1 then
    v_key:='time_trial';
  elsif (
      lower(coalesce(new.terrain_type,'')) like '%mountain%'
      or lower(coalesce(new.terrain_type,'')) like '%climb%'
      or lower(coalesce(new.profile_type,'')) like '%mountain%'
      or lower(coalesce(new.profile_type,'')) like '%climb%'
      or lower(coalesce(new.terrain_type,'')) like '%hill%'
      or lower(coalesce(new.profile_type,'')) like '%hill%'
    ) and v_infra.climbing_performance_center_level>=1 then
    v_key:='climbing';
  elsif (
      lower(coalesce(new.terrain_type,'')) like '%flat%'
      or lower(coalesce(new.profile_type,'')) like '%flat%'
    ) and v_infra.sprint_performance_circuit_level>=1 then
    v_key:='sprint';
  else
    return new;
  end if;

  v_progress:=coalesce(new.progress_json,'{}'::jsonb);
  if jsonb_typeof(v_progress->v_key)<>'number' then return new; end if;
  v_value:=coalesce((v_progress->>v_key)::numeric,0);
  v_progress:=jsonb_set(
    v_progress,array[v_key],to_jsonb(round(v_value*1.05,4)),true
  );
  select coalesce(sum((value#>>'{}')::numeric),0) into v_total
  from jsonb_each(v_progress) where jsonb_typeof(value)='number';

  new.progress_json:=v_progress;
  new.total_progress_points:=round(v_total,4);
  new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
    'specialist_race_development_attribute',v_key,
    'specialist_race_development_bonus_bps',500,
    'specialist_race_development_applied',true,
    'specialist_facility_effect_version','specialist_facilities_v1'
  );
  return new;
end;
$function$;

drop trigger if exists trg_zz_specialist_race_development_v1
on public.rider_race_development_events;
create trigger trg_zz_specialist_race_development_v1
before insert on public.rider_race_development_events
for each row
execute function public.trg_apply_specialist_race_development_v1();

-- U16 development now receives Youth Academy + specialist building effects.
do $patch_u16_weekly$
declare
  ddl text;
begin
  ddl:=pg_get_functiondef(
    'private.process_youth_development_week_v1(date)'::regprocedure
  );
  if position('v_infra_multiplier numeric' in ddl)=0 then
    ddl:=replace(
      ddl,
      '  v_workload text;'||chr(10),
      '  v_workload text;'||chr(10)||
      '  v_infra_multiplier numeric:=1.0;'||chr(10)||
      '  v_campus_active boolean:=false;'||chr(10)
    );
    ddl:=replace(
      ddl,
      '    v_focus:=private.youth_focus_for_role_v1(v_rider.role,v_rider.development_focus);',
      '    v_focus:=private.youth_focus_for_role_v1(v_rider.role,v_rider.development_focus);'||
      chr(10)||'    v_infra_multiplier:=private.youth_u16_infrastructure_development_multiplier_v1(v_rider.academy_id,v_focus,false);'||
      chr(10)||'    v_campus_active:=public.team_residential_campus_active_v1(v_academy.club_id);'
    );
    ddl:=replace(
      ddl,
      '    if v_gap>0'||chr(10)||
      '       and private.youth_attribute_value_v1(v_rider,v_focus)<v_rider.hidden_potential',
      '    v_chance:=least(0.90,v_chance*v_infra_multiplier);'||
      chr(10)||chr(10)||
      '    if v_gap>0'||chr(10)||
      '       and private.youth_attribute_value_v1(v_rider,v_focus)<v_rider.hidden_potential'
    );
    ddl:=replace(
      ddl,
      '    update public.youth_riders'||chr(10)||
      '    set workload=v_workload,',
      '    if v_campus_active then'||
      chr(10)||'      v_fatigue_after:=greatest(0,round(v_fatigue_after*0.95)::integer);'||
      chr(10)||'      v_readiness_after:=least(100,round(v_readiness_after+(100-v_readiness_after)*0.05)::integer);'||
      chr(10)||'    end if;'||
      chr(10)||chr(10)||
      '    update public.youth_riders'||chr(10)||
      '    set workload=v_workload,'
    );
    ddl:=replace(
      ddl,
      '''training_philosophy'',v_philosophy',
      '''training_philosophy'',v_philosophy,'||
      chr(10)||'        ''u16_infrastructure_development_multiplier'',round(v_infra_multiplier,4),'||
      chr(10)||'        ''team_residential_campus_active'',v_campus_active'
    );
    execute ddl;
  end if;
end;
$patch_u16_weekly$;

-- U16 race-development chance gets Youth Academy and specialist bonuses.
create or replace function private.simulate_youth_race_v1(p_race_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  r public.youth_races%rowtype;
  x record;
  pos integer:=0; finished integer:=0; dnf integer:=0; dns integer:=0;
  general_pts integer; regional_pts integer; world_pts integer;
  gap integer; total_time integer; fatigue_delta integer; dev integer;
  sprint_pts integer; mountain_pts integer; tt_pts integer;
  dev_focus text; dev_multiplier numeric:=1.0; dev_chance numeric:=0;
begin
  select * into r from public.youth_races where id=p_race_id for update;
  if r.id is null then raise exception 'Youth race not found'; end if;
  if exists(select 1 from public.youth_race_processing_log where race_id=p_race_id) then
    return (select result from public.youth_race_processing_log where race_id=p_race_id);
  end if;

  if not exists(select 1 from public.youth_race_stages s where s.race_id=p_race_id) then
    perform private.ensure_youth_race_runtime_v1(p_race_id);
  end if;
  if exists(select 1 from public.youth_race_stages s where s.race_id=p_race_id and s.status='scheduled') then
    raise exception 'Youth race still has unfinished stages';
  end if;

  create temporary table if not exists pg_temp.youth_race_final_v2(
    entry_id uuid,academy_id uuid,youth_rider_id uuid,result_status text,
    total_time integer,sprint_points integer,mountain_points integer,time_trial_points integer
  ) on commit drop;
  truncate pg_temp.youth_race_final_v2;

  insert into pg_temp.youth_race_final_v2(
    entry_id,academy_id,youth_rider_id,result_status,total_time,
    sprint_points,mountain_points,time_trial_points
  )
  select
    sr.entry_id,sr.academy_id,sr.youth_rider_id,
    case
      when bool_or(sr.result_status='dns') then 'dns'
      when bool_or(sr.result_status='dnf') or count(*)<greatest(1,r.race_days) then 'dnf'
      else 'finished'
    end,
    case when bool_and(sr.result_status='finished') then sum(sr.time_seconds)::integer else null end,
    sum(sr.sprint_points)::integer,sum(sr.mountain_points)::integer,sum(sr.time_trial_points)::integer
  from public.youth_race_stage_results sr
  where sr.race_id=p_race_id
  group by sr.entry_id,sr.academy_id,sr.youth_rider_id;

  for x in
    select * from pg_temp.youth_race_final_v2
    order by case result_status when 'finished' then 0 when 'dnf' then 1 else 2 end,
             total_time nulls last,youth_rider_id
  loop
    sprint_pts:=coalesce(x.sprint_points,0);
    mountain_pts:=coalesce(x.mountain_points,0);
    tt_pts:=coalesce(x.time_trial_points,0);

    if x.result_status='finished' then
      pos:=pos+1; finished:=finished+1;
      general_pts:=private.youth_rider_general_points_v1(r.competition_class,pos);
      regional_pts:=case when r.competition_class='regional' then general_pts else 0 end;
      world_pts:=case when r.competition_class='regional' then round(general_pts*0.35)::integer else general_pts end;
      total_time:=x.total_time;
      select greatest(0,total_time-min(z.total_time))::integer into gap
      from pg_temp.youth_race_final_v2 z where z.result_status='finished';
      fatigue_delta:=greatest(0,round(greatest(1,r.race_days)*2.0)::integer);

      dev_focus:=case r.terrain_type
        when 'flat' then 'sprint'
        when 'hilly' then 'climbing'
        when 'mountain' then 'climbing'
        when 'time_trial' then 'time_trial'
        else 'race_iq' end;
      dev_multiplier:=private.youth_u16_infrastructure_development_multiplier_v1(
        x.academy_id,dev_focus,true
      );
      dev_chance:=least(
        0.50,
        (case when pos<=5 then 0.18 else 0.10 end)*dev_multiplier
      );
      dev:=case when private.youth_deterministic_fraction_v1(
        p_race_id::text||x.youth_rider_id::text||':development'
      )<dev_chance then 1 else 0 end;
    elsif x.result_status='dnf' then
      dnf:=dnf+1; general_pts:=0; regional_pts:=0; world_pts:=0;
      total_time:=null; gap:=null; fatigue_delta:=2; dev:=0;
    else
      dns:=dns+1; general_pts:=0; regional_pts:=0; world_pts:=0;
      total_time:=null; gap:=null; fatigue_delta:=0; dev:=0;
    end if;

    insert into public.youth_race_results(
      race_id,entry_id,academy_id,youth_rider_id,result_status,finish_position,
      time_seconds,gap_seconds,performance_score,regional_points,world_points,
      fatigue_delta,development_bonus,incident_code,
      general_points,sprint_points,mountain_points,time_trial_points,ranking_points
    )
    values(
      p_race_id,x.entry_id,x.academy_id,x.youth_rider_id,x.result_status,
      case when x.result_status='finished' then pos else null end,
      total_time,gap,
      case when total_time is null then 0 else 1000000.0/greatest(total_time,1) end,
      regional_pts,world_pts,fatigue_delta,dev,
      case when x.result_status='dnf' then 'race_incident' else null end,
      general_pts,sprint_pts,mountain_pts,tt_pts,
      general_pts+sprint_pts+mountain_pts+tt_pts
    );

    if dev>0 then
      perform private.apply_youth_attribute_delta_v1(x.youth_rider_id,dev_focus,1);
    end if;
  end loop;

  update public.youth_race_entries set status='completed',updated_at=now()
  where race_id=p_race_id and status='entered';
  update public.youth_races
  set status='completed',results_published_at=now(),updated_at=now()
  where id=p_race_id;

  perform private.pay_youth_race_team_prizes_v1(p_race_id);

  insert into public.youth_race_processing_log(
    race_id,processed_game_date,entry_count,rider_count,result
  )
  values(
    p_race_id,coalesce(r.race_end_date,r.race_date),
    (select count(*) from public.youth_race_entries where race_id=p_race_id and status='completed'),
    finished+dnf+dns,
    jsonb_build_object(
      'race_id',p_race_id,'finished',finished,'dnf',dnf,'dns',dns,
      'results_only',true,'replay_available',false,
      'classification_model','youth_v2_infrastructure_v1'
    )
  );

  return (select result from public.youth_race_processing_log where race_id=p_race_id);
end;
$function$;

-- Campus waives U16 home accommodation but preserves the agreed stipend.
create or replace function private.process_youth_academy_weekly_payroll_v1(
  p_game_date date
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_academy record;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_week_start date:=date_trunc('week',p_game_date)::date;
  v_stipend_cost bigint;
  v_accommodation_cost bigint;
  v_rider_cost bigint;
  v_staff_cost bigint;
  v_total bigint;
  v_campus boolean;
  v_processed integer:=0;
begin
  if extract(isodow from p_game_date)::integer<>1 then
    return jsonb_build_object('weekly_run',false,'processed',0);
  end if;

  for v_academy in
    select a.id,a.club_id from public.youth_academies a where a.is_active=true
  loop
    if exists(
      select 1 from public.youth_academy_ledger l
      where l.academy_id=v_academy.id and l.season_number=v_season
        and l.category='weekly_payroll'
        and l.metadata->>'week_start'=v_week_start::text
    ) then continue; end if;

    v_campus:=public.team_residential_campus_active_v1(v_academy.club_id);

    select
      coalesce(sum(agr.stipend_weekly),0)::bigint,
      coalesce(sum(agr.accommodation_weekly),0)::bigint
    into v_stipend_cost,v_accommodation_cost
    from public.youth_rider_agreements agr
    where agr.academy_id=v_academy.id and agr.status='active';

    v_rider_cost:=coalesce(v_stipend_cost,0)+
      case when v_campus then 0 else coalesce(v_accommodation_cost,0) end;

    select coalesce(sum(cs.salary_weekly),0)::bigint into v_staff_cost
    from public.club_staff cs
    where cs.club_id=v_academy.club_id and cs.is_active=true
      and cs.role_type in ('youth_academy_director','u16_head_coach','youth_scout');

    v_total:=coalesce(v_rider_cost,0)+coalesce(v_staff_cost,0);

    update public.youth_academy_season_budgets
    set spent_amount=spent_amount+v_total,
        committed_amount=greatest(
          scouting_committed_amount,
          committed_amount-least(
            committed_amount-scouting_committed_amount,greatest(v_rider_cost,0)
          )
        ),
        updated_at=now()
    where academy_id=v_academy.id and season_number=v_season;

    insert into public.youth_academy_ledger(
      academy_id,season_number,game_date,category,description,amount,metadata
    ) values(
      v_academy.id,v_season,p_game_date,'weekly_payroll',
      'Youth Academy weekly rider support and staff payroll',-v_total,
      jsonb_build_object(
        'week_start',v_week_start,
        'rider_stipends',v_stipend_cost,
        'external_accommodation_before_campus',v_accommodation_cost,
        'accommodation_charged',case when v_campus then 0 else v_accommodation_cost end,
        'campus_accommodation_saving',case when v_campus then v_accommodation_cost else 0 end,
        'team_residential_campus_active',v_campus,
        'rider_support',v_rider_cost,
        'staff_salary',v_staff_cost,'total',v_total
      )
    );
    v_processed:=v_processed+1;
  end loop;

  return jsonb_build_object(
    'weekly_run',true,'week_start',v_week_start,'processed',v_processed
  );
end;
$function$;

-- Campus waives senior home-base housing policy charges.
do $patch_team_policy_estimate$
declare ddl text;
begin
  ddl:=pg_get_functiondef('public.get_club_team_policy_estimate(uuid)'::regprocedure);
  if position('team_residential_campus_active_v1' in ddl)=0 then
    ddl:=replace(
      ddl,
      '  v_housing_weekly := v_housing_unit * (v_rider_count + v_staff_count);',
      '  v_housing_weekly := v_housing_unit * (v_rider_count + v_staff_count);'||
      chr(10)||'  if public.team_residential_campus_active_v1(p_club_id) then'||
      chr(10)||'    v_housing_weekly := 0;'||
      chr(10)||'  end if;'
    );
    execute ddl;
  end if;
end;
$patch_team_policy_estimate$;

do $patch_team_policy_recurring$
declare ddl text;
begin
  ddl:=pg_get_functiondef('public.get_club_team_policy_recurring_costs(uuid)'::regprocedure);
  if position('team_residential_campus_active_v1' in ddl)=0 then
    ddl:=replace(
      ddl,
      '    end;'||chr(10)||chr(10)||'  -- nutrition weekly flat team budget',
      '    end;'||chr(10)||
      '  if public.team_residential_campus_active_v1(p_club_id) then'||
      chr(10)||'    v_housing_rate := 0;'||
      chr(10)||'  end if;'||
      chr(10)||chr(10)||'  -- nutrition weekly flat team budget'
    );
    execute ddl;
  end if;
end;
$patch_team_policy_recurring$;

-- U23 riders from outside the parent club country require $150/week external
-- housing until the Residential Campus is built.
create or replace function public.finance_process_weekly_developing_team_accommodation_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,finance,pg_temp
as $function$
declare
  gd date:=public.get_current_game_date_date();
  week_key text;
  x record;
  rider_count integer;
  amount bigint;
  existing_id uuid;
  funds jsonb;
  charged integer:=0;
  total bigint:=0;
begin
  if gd is null then return jsonb_build_object('ok',false,'reason','game_date_missing'); end if;
  if extract(isodow from gd)::integer<>1 then
    return jsonb_build_object('ok',true,'did_run',false,'reason','not_week_start','game_date',gd);
  end if;
  week_key:=to_char(gd,'IYYY-IW');

  for x in
    select p.id parent_club_id,p.country_code,d.id developing_club_id
    from public.clubs p
    join public.clubs d on d.parent_club_id=p.id and d.club_type='developing'
    where p.club_type='main' and p.deleted_at is null and d.deleted_at is null
      and p.owner_user_id is not null and coalesce(p.is_ai,false)=false
  loop
    if public.team_residential_campus_active_v1(x.parent_club_id) then
      continue;
    end if;

    select count(*)::integer into rider_count
    from public.club_riders cr
    join public.riders r on r.id=cr.rider_id
    where cr.club_id=x.developing_club_id
      and upper(coalesce(r.country_code,''))<>upper(coalesce(x.country_code,''));

    amount:=greatest(0,coalesce(rider_count,0))*150;
    if amount<=0 then continue; end if;

    select t.id into existing_id
    from finance.transactions t
    where t.idempotency_key=
      'u23_home_accommodation:'||x.parent_club_id::text||':'||week_key
    limit 1;
    if existing_id is not null then continue; end if;

    funds:=public.finance_ensure_mandatory_funds(
      x.parent_club_id,amount,'u23_home_accommodation',week_key,
      'mandatory_funds:u23_home_accommodation:'||x.parent_club_id::text||':'||week_key
    );
    if coalesce((funds->>'ok')::boolean,false) is not true then continue; end if;

    perform public.finance_spend_from_club(
      x.parent_club_id,amount,'u23_home_accommodation','SINK',
      'u23_home_accommodation:'||x.parent_club_id::text||':'||week_key,
      jsonb_build_object(
        'developing_club_id',x.developing_club_id,
        'non_local_u23_riders',rider_count,
        'weekly_rate_per_rider',150,
        'week_key',week_key,'game_date',gd,
        'source','u23_home_accommodation'
      )
    );
    charged:=charged+1;
    total:=total+amount;
  end loop;

  return jsonb_build_object(
    'ok',true,'did_run',true,'game_date',gd,'week_key',week_key,
    'clubs_charged',charged,'total_charged',total
  );
end;
$function$;

-- One monthly maintenance processor for the four new facilities.
create or replace function public.finance_process_monthly_special_facility_maintenance_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,finance,pg_temp
as $function$
declare
  gd date:=public.get_current_game_date_date();
  period_key text;
  r record;
  existing_id uuid;
  funds jsonb;
  charged integer:=0;
  skipped integer:=0;
  failed integer:=0;
  total bigint:=0;
begin
  if gd is null then return jsonb_build_object('ok',false,'reason','game_date_missing'); end if;
  if extract(day from gd)::integer<>1 then
    return jsonb_build_object('ok',true,'did_run',false,'reason','not_month_start','game_date',gd);
  end if;
  period_key:=to_char(gd,'YYYY-MM');

  for r in
    select c.id club_id,v.facility_key,v.level,cfg.monthly_maintenance_cash
    from public.clubs c
    join public.club_infrastructure ci on ci.club_id=c.id
    cross join lateral(values
      ('team_residential_campus',ci.team_residential_campus_level),
      ('sprint_performance_circuit',ci.sprint_performance_circuit_level),
      ('climbing_performance_center',ci.climbing_performance_center_level),
      ('team_time_trial_center',ci.team_time_trial_center_level)
    ) v(facility_key,level)
    join public.infrastructure_facility_upgrade_config cfg
      on cfg.facility_key=v.facility_key and cfg.target_level=v.level
    where c.club_type='main' and c.deleted_at is null
      and c.owner_user_id is not null and coalesce(c.is_ai,false)=false
      and v.level>0 and cfg.monthly_maintenance_cash>0
  loop
    select t.id into existing_id
    from finance.transactions t
    where t.idempotency_key=
      r.facility_key||'_monthly_maintenance:'||r.club_id::text||':'||period_key
    limit 1;
    if existing_id is not null then skipped:=skipped+1; continue; end if;

    funds:=public.finance_ensure_mandatory_funds(
      r.club_id,r.monthly_maintenance_cash,
      r.facility_key||'_monthly_maintenance',period_key,
      'mandatory_funds:'||r.facility_key||'_monthly_maintenance:'||
        r.club_id::text||':'||period_key
    );
    if coalesce((funds->>'ok')::boolean,false) is not true then
      failed:=failed+1; continue;
    end if;

    perform public.finance_spend_from_club(
      r.club_id,r.monthly_maintenance_cash,
      r.facility_key||'_monthly_maintenance','SINK',
      r.facility_key||'_monthly_maintenance:'||r.club_id::text||':'||period_key,
      jsonb_build_object(
        'facility_key',r.facility_key,'facility_level',r.level,
        'monthly_maintenance_cash',r.monthly_maintenance_cash,
        'period_key',period_key,'game_date',gd,
        'source','special_facility_monthly_maintenance'
      )
    );
    charged:=charged+1;
    total:=total+r.monthly_maintenance_cash;
  end loop;

  return jsonb_build_object(
    'ok',failed=0,'did_run',true,'game_date',gd,'period_key',period_key,
    'charged',charged,'skipped',skipped,'failed',failed,'total_charged',total
  );
end;
$function$;

do $patch_monthly_maintenance$
declare ddl text;
begin
  ddl:=pg_get_functiondef('public.finance_run_due_monthly_tax_audits(boolean)'::regprocedure);
  if position('finance_process_monthly_special_facility_maintenance_v1' in ddl)=0 then
    ddl:=replace(
      ddl,
      '  perform public.finance_process_monthly_scouting_office_maintenance_v1();',
      '  perform public.finance_process_monthly_scouting_office_maintenance_v1();'||
      chr(10)||'  perform public.finance_process_monthly_special_facility_maintenance_v1();'
    );
    execute ddl;
  end if;
end;
$patch_monthly_maintenance$;

do $patch_daily_tick_u23_housing$
declare ddl text;
begin
  ddl:=pg_get_functiondef('public.process_daily_tick()'::regprocedure);
  if position('finance_process_weekly_developing_team_accommodation_v1' in ddl)=0 then
    ddl:=replace(
      ddl,
      '  begin perform public.finance_process_weekly_team_policy_costs(); exception when others then raise warning ''finance_process_weekly_team_policy_costs failed: %'',sqlerrm; end;',
      '  begin perform public.finance_process_weekly_team_policy_costs(); exception when others then raise warning ''finance_process_weekly_team_policy_costs failed: %'',sqlerrm; end;'||
      chr(10)||'  begin perform public.finance_process_weekly_developing_team_accommodation_v1(); exception when others then raise warning ''finance_process_weekly_developing_team_accommodation_v1 failed: %'',sqlerrm; end;'
    );
    execute ddl;
  end if;
end;
$patch_daily_tick_u23_housing$;

-- 5% U23 recovery improvement from the Campus.
do $patch_u23_recovery$
declare ddl text;
begin
  ddl:=pg_get_functiondef('public.process_daily_fatigue()'::regprocedure);
  if position('team_residential_campus_active_v1(v_club_id)' in ddl)=0 then
    ddl:=replace(
      ddl,
      '    v_new_fatigue := greatest(',
      '    if public.team_residential_campus_active_v1(v_club_id)'||
      chr(10)||'       and exists(select 1 from public.clubs c where c.id=v_club_id and c.club_type=''developing'') then'||
      chr(10)||'      v_daily_recovery:=round(v_daily_recovery*1.05)::integer;'||
      chr(10)||'    end if;'||
      chr(10)||chr(10)||'    v_new_fatigue := greatest('
    );
    execute ddl;
  end if;
end;
$patch_u23_recovery$;

-- Team Time Trial Center: 5% faster team pacing for First Team and U23 TTTs.
create or replace function public.apply_team_time_trial_center_bonus_v1(
  p_simulation_run_id uuid
)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_count integer:=0;
begin
  with eligible as (
    select ts.id,ts.team_id
    from public.race_stage_team_states ts
    join public.clubs c on c.id=ts.team_id
    join public.club_infrastructure ci
      on ci.club_id=case when c.club_type='developing'
        then coalesce(c.parent_club_id,c.id) else c.id end
    where ts.simulation_run_id=p_simulation_run_id
      and ci.team_time_trial_center_level>=1
      and not coalesce((ts.metadata->>'ttt_center_bonus_applied')::boolean,false)
  )
  update public.race_stage_team_states ts
  set
    team_finish_time_seconds=greatest(1,round(ts.team_finish_time_seconds*0.95)::integer),
    metadata=coalesce(ts.metadata,'{}'::jsonb)||jsonb_build_object(
      'ttt_center_bonus_applied',true,
      'ttt_center_pacing_efficiency_bonus_bps',500
    )
  from eligible e
  where ts.id=e.id;

  get diagnostics v_count=row_count;

  update public.race_stage_rider_states rs
  set
    finish_time_seconds=greatest(1,round(rs.finish_time_seconds*0.95)::integer),
    metadata=coalesce(rs.metadata,'{}'::jsonb)||jsonb_build_object(
      'ttt_center_bonus_applied',true,
      'ttt_center_pacing_efficiency_bonus_bps',500
    )
  where rs.simulation_run_id=p_simulation_run_id
    and coalesce((rs.metadata->>'is_dropped_rider')::boolean,false)=false
    and exists(
      select 1
      from public.clubs c
      join public.club_infrastructure ci
        on ci.club_id=case when c.club_type='developing'
          then coalesce(c.parent_club_id,c.id) else c.id end
      where c.id=rs.team_id and ci.team_time_trial_center_level>=1
    );

  with ranked as (
    select id,row_number() over(
      order by team_finish_time_seconds,team_id
    )::integer new_rank
    from public.race_stage_team_states
    where simulation_run_id=p_simulation_run_id
  )
  update public.race_stage_team_states ts
  set team_rank=r.new_rank
  from ranked r
  where ts.id=r.id;

  return v_count;
end;
$function$;

do $patch_ttt_runner$
declare ddl text;
begin
  ddl:=pg_get_functiondef('public.run_race_stage_team_time_trial_v1(uuid)'::regprocedure);
  if position('apply_team_time_trial_center_bonus_v1' in ddl)=0 then
    ddl:=replace(
      ddl,
      '  v_state_result :='||chr(10)||
      '    public.race_engine_write_team_time_trial_states_v1('||chr(10)||
      '      v_run_id'||chr(10)||
      '    );',
      '  v_state_result :='||chr(10)||
      '    public.race_engine_write_team_time_trial_states_v1('||chr(10)||
      '      v_run_id'||chr(10)||
      '    );'||chr(10)||chr(10)||
      '  perform public.apply_team_time_trial_center_bonus_v1(v_run_id);'
    );
    execute ddl;
  end if;
end;
$patch_ttt_runner$;

-- Infrastructure watchdog: configuration and state must remain coherent.
create or replace function public.monitor_special_infrastructure_health_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  missing_cfg integer:=0;
  invalid_level integer:=0;
  invalid_prereq integer:=0;
  issues integer:=0;
  details jsonb;
begin
  select count(*) into missing_cfg
  from (values
    ('team_residential_campus'),
    ('sprint_performance_circuit'),
    ('climbing_performance_center'),
    ('team_time_trial_center')
  ) v(facility_key)
  where not exists(
    select 1 from public.infrastructure_facility_upgrade_config c
    where c.facility_key=v.facility_key and c.target_level=1
  );

  select count(*) into invalid_level
  from public.club_infrastructure ci
  where ci.team_residential_campus_level not between 0 and 1
     or ci.sprint_performance_circuit_level not between 0 and 1
     or ci.climbing_performance_center_level not between 0 and 1
     or ci.team_time_trial_center_level not between 0 and 1;

  select count(*) into invalid_prereq
  from public.club_infrastructure ci
  where (ci.team_residential_campus_level>0 and ci.youth_academy_level<1)
     or (
       (ci.sprint_performance_circuit_level>0
        or ci.climbing_performance_center_level>0
        or ci.team_time_trial_center_level>0)
       and ci.training_center_level<2
     );

  issues:=missing_cfg+invalid_level+invalid_prereq;
  details:=jsonb_build_object(
    'missing_facility_configs',missing_cfg,
    'invalid_facility_levels',invalid_level,
    'built_facilities_with_missing_prerequisite',invalid_prereq
  );

  return private.youth_watchdog_finish_v1(
    'check:special_infrastructure',
    issues,
    'high',
    'Specialist infrastructure requires attention',
    format('Specialist infrastructure integrity found %s problem record(s).',issues),
    'Residential Campus and specialist performance facilities are healthy.',
    details
  );
end;
$function$;

insert into public.system_monitor_processes(
  process_key,label,category,description,source_kind,source_ref,user_sensitive,
  incident_severity,expected_interval_minutes,stale_after_minutes,
  email_alerts_enabled,is_enabled,sort_order
) values(
  'check:special_infrastructure',
  'Specialist infrastructure',
  'gameplay',
  'Monitors Residential Campus and Sprint, Climbing and Team Time Trial specialist facilities, prerequisites and configuration.',
  'business_check',null,true,'high',5,15,true,true,268
)
on conflict(process_key) do update set
  label=excluded.label,category=excluded.category,description=excluded.description,
  incident_severity=excluded.incident_severity,
  expected_interval_minutes=excluded.expected_interval_minutes,
  stale_after_minutes=excluded.stale_after_minutes,
  email_alerts_enabled=excluded.email_alerts_enabled,
  is_enabled=excluded.is_enabled,sort_order=excluded.sort_order;

do $patch_watchdog$
declare ddl text;
begin
  ddl:=pg_get_functiondef('public.run_system_health_watchdog_v1()'::regprocedure);
  if position('monitor_special_infrastructure_health_v1' in ddl)=0 then
    ddl:=replace(
      ddl,
      '  v_youth jsonb;',
      '  v_youth jsonb;'||chr(10)||'  v_special_infrastructure jsonb;'
    );
    ddl:=replace(
      ddl,
      '  return coalesce(v_base,''{}''::jsonb)',
      '  begin'||
      chr(10)||'    v_special_infrastructure:=public.monitor_special_infrastructure_health_v1();'||
      chr(10)||'  exception when others then'||
      chr(10)||'    v_special_infrastructure:=jsonb_build_object(''status'',''error'',''message'',sqlerrm,''sqlstate'',sqlstate);'||
      chr(10)||'  end;'||
      chr(10)||chr(10)||'  return coalesce(v_base,''{}''::jsonb)'
    );
    ddl:=replace(
      ddl,
      '''youth_academy_watchdog'',v_youth',
      '''youth_academy_watchdog'',v_youth,'||
      chr(10)||'      ''special_infrastructure'',v_special_infrastructure'
    );
    execute ddl;
  end if;
end;
$patch_watchdog$;

select public.monitor_special_infrastructure_health_v1();
