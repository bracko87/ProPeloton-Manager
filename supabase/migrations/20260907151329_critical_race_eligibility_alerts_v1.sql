create table if not exists public.race_eligibility_notification_state (
  stage_id uuid not null references public.race_stages(id) on delete cascade,
  team_id uuid not null references public.clubs(id) on delete cascade,
  race_id uuid not null references public.races(id) on delete cascade,
  condition_active boolean not null default false,
  last_signature text,
  initial_notified_at timestamptz,
  urgent_notified_at timestamptz,
  final_notified_at timestamptz,
  resolved_at timestamptz,
  last_checked_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(stage_id, team_id)
);

create or replace function public.race_stage_planned_start_game_at_v1(p_stage_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_date date;
  v_label text;
  v_hour integer := 12;
  v_minute integer := 0;
begin
  select s.stage_date::date,
         coalesce(nullif(to_jsonb(s)->>'planned_start_time_label',''), nullif(to_jsonb(s)->>'start_time_label',''))
  into v_date, v_label
  from public.race_stages s
  where s.id=p_stage_id;

  if v_date is null then return null; end if;

  if coalesce(v_label,'') ~ '^[0-2][0-9]:[0-5][0-9]$' then
    v_hour := least(23, split_part(v_label,':',1)::integer);
    v_minute := split_part(v_label,':',2)::integer;
  end if;

  return make_timestamptz(
    extract(year from v_date)::integer,
    extract(month from v_date)::integer,
    extract(day from v_date)::integer,
    v_hour,
    v_minute,
    0,
    'UTC'
  );
end;
$function$;

create or replace function public.race_team_stage_eligibility_v1(p_stage_id uuid, p_team_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_stage record;
  v_race record;
  v_team record;
  v_owner uuid;
  v_owner_name text;
  v_required integer := 0;
  v_effective integer := 0;
  v_missing integer := 0;
  v_total_owned integer := 0;
  v_same_day_used integer := 0;
  v_reserved integer := 0;
  v_blocked boolean := false;
  v_reason text;
  v_start_at timestamptz;
  v_hours numeric;
  v_status text;
  v_explanation text;
begin
  select s.id,s.race_id,s.stage_number,s.stage_date::date as stage_date
  into v_stage from public.race_stages s where s.id=p_stage_id;
  if v_stage.id is null then
    return jsonb_build_object('status','stage_not_found','stage_id',p_stage_id,'team_id',p_team_id);
  end if;

  select r.id,r.name,r.category,coalesce(r.is_stage_race,false) as is_stage_race
  into v_race from public.races r where r.id=v_stage.race_id;

  select c.id,c.name,coalesce(c.is_ai,false) as is_ai
  into v_team from public.clubs c where c.id=p_team_id;
  if v_team.id is null then
    return jsonb_build_object('status','team_not_found','stage_id',p_stage_id,'team_id',p_team_id);
  end if;

  v_owner := public.universal_race_resource_owner_club_v1(p_team_id);
  select c.name into v_owner_name from public.clubs c where c.id=v_owner;

  v_required := public.universal_race_team_required_jerseys_v1(v_stage.race_id,p_team_id);
  v_effective := public.universal_race_stage_effective_supply_available_v1(p_stage_id,p_team_id,'race_jersey_complete');
  v_reserved := public.universal_race_stage_other_supply_reservations_v1(p_stage_id,p_team_id,'race_jersey_complete');
  v_missing := greatest(v_required-v_effective,0);

  select count(*)::integer
  into v_total_owned
  from public.club_race_supply_units u
  where u.club_id=v_owner
    and u.supply_key='race_jersey_complete'
    and u.status in ('ready','assigned')
    and u.stage_uses_remaining>0;

  select count(*)::integer
  into v_same_day_used
  from public.club_race_supply_units u
  where u.club_id=v_owner
    and u.supply_key='race_jersey_complete'
    and u.status in ('ready','assigned')
    and u.stage_uses_remaining>0
    and u.last_used_game_date=v_stage.stage_date;

  select true,d.reason_code
  into v_blocked,v_reason
  from public.race_team_stage_disqualifications d
  where d.race_id=v_stage.race_id
    and d.team_id=p_team_id
    and v_stage.stage_number>=d.from_stage_number
  order by d.from_stage_number desc,d.created_at desc
  limit 1;
  v_blocked := coalesce(v_blocked,false);

  v_start_at := public.race_stage_planned_start_game_at_v1(p_stage_id);
  if v_start_at is not null then
    v_hours := extract(epoch from (v_start_at-public.get_current_game_timestamp()))/3600.0;
  end if;

  v_status := case
    when v_blocked then 'entry_blocked'
    when v_required>0 and v_effective<v_required then 'at_risk'
    else 'eligible'
  end;

  v_explanation := case
    when v_blocked then 'The team is blocked from this stage because a mandatory pre-start eligibility requirement was not met.'
    when v_required>0 and v_effective<v_required then
      format('%s Race Jersey Kits are required, but only %s are effectively available for this stage. %s additional kit%s must become usable before the stage eligibility check.',v_required,v_effective,v_missing,case when v_missing=1 then '' else 's' end)
    else format('Race eligibility is currently satisfied: %s required and %s effectively available Race Jersey Kits.',v_required,v_effective)
  end;

  return jsonb_build_object(
    'status',v_status,
    'severity',case when v_blocked then 'blocked' when v_missing>0 then 'critical' else 'ok' end,
    'race_id',v_stage.race_id,
    'race_name',v_race.name,
    'race_class_code',v_race.category,
    'is_stage_race',v_race.is_stage_race,
    'stage_id',p_stage_id,
    'stage_number',v_stage.stage_number,
    'stage_date',v_stage.stage_date,
    'stage_start_game_at',v_start_at,
    'hours_until_stage_start',case when v_hours is null then null else round(v_hours,2) end,
    'team_id',p_team_id,
    'team_name',v_team.name,
    'resource_owner_club_id',v_owner,
    'resource_owner_club_name',v_owner_name,
    'required_jersey_units',v_required,
    'effective_available_jersey_units',v_effective,
    'missing_jersey_units',v_missing,
    'total_usable_owned_units_before_same_day_rule',v_total_owned,
    'same_day_used_units',v_same_day_used,
    'other_race_reserved_units',v_reserved,
    'already_disqualified',v_blocked,
    'disqualification_reason_code',v_reason,
    'explanation',v_explanation,
    'action_url','/dashboard/equipment?tab=race-supplies',
    'race_preparation_url','/dashboard/race-preparation?tab=acceptedRaces&raceId='||v_stage.race_id::text,
    'consequence',case when v_race.is_stage_race then 'team_removed_from_stage_and_all_remaining_stages' else 'team_removed_from_race' end,
    'eligibility_model','canonical_effective_race_supply_v1'
  );
end;
$function$;

create or replace function public.get_my_critical_race_eligibility_alerts_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp','auth'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.get_current_game_date_date();
  v_alerts jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  with candidate as (
    select distinct on (t.race_id,t.club_id)
      t.race_id,t.club_id as team_id,s.id as stage_id,s.stage_date,s.stage_number
    from public.race_participant_teams_v1 t
    join public.races r on r.id=t.race_id
    join public.race_stages s on s.race_id=t.race_id
    join public.clubs owner on owner.id=public.universal_race_resource_owner_club_v1(t.club_id)
    where owner.owner_user_id=v_user
      and coalesce((select c.is_ai from public.clubs c where c.id=t.club_id),false)=false
      and lower(coalesce(t.status,'accepted'))='accepted'
      and lower(coalesce(r.status,'scheduled')) in ('scheduled','active')
      and s.stage_date::date between v_today and v_today+7
      and not coalesce(s.weather_cancelled,false)
    order by t.race_id,t.club_id,s.stage_date,s.stage_number,s.id
  ), eligibility as (
    select c.*,public.race_team_stage_eligibility_v1(c.stage_id,c.team_id) as e from candidate c
  )
  select coalesce(jsonb_agg(e.e order by e.stage_date,e.stage_number),'[]'::jsonb)
  into v_alerts
  from eligibility e
  where e.e->>'status' in ('at_risk','entry_blocked');

  return jsonb_build_object(
    'status','ok',
    'current_game_at',public.get_current_game_timestamp(),
    'alert_count',jsonb_array_length(v_alerts),
    'alerts',v_alerts,
    'persistent_until_resolved',true
  );
end;
$function$;

create or replace function public.create_mandatory_race_jersey_escalation_v1(
  p_user_id uuid,
  p_eligibility jsonb,
  p_level text
)
returns bigint
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_title text;
  v_message text;
  v_event_key text;
  v_id bigint;
  v_race_id uuid := nullif(p_eligibility->>'race_id','')::uuid;
  v_stage_id uuid := nullif(p_eligibility->>'stage_id','')::uuid;
  v_team_id uuid := nullif(p_eligibility->>'team_id','')::uuid;
  v_race_name text := coalesce(p_eligibility->>'race_name','the race');
  v_required integer := coalesce((p_eligibility->>'required_jersey_units')::integer,0);
  v_available integer := coalesce((p_eligibility->>'effective_available_jersey_units')::integer,0);
  v_missing integer := coalesce((p_eligibility->>'missing_jersey_units')::integer,0);
  v_hours numeric := nullif(p_eligibility->>'hours_until_stage_start','')::numeric;
begin
  if p_user_id is null or v_race_id is null or v_stage_id is null or v_team_id is null then return null; end if;

  if p_level='initial' then
    return public.create_mandatory_race_jersey_warning_v1(p_user_id,v_race_id,v_stage_id,v_team_id,v_required,v_available);
  elsif p_level='final' then
    v_title := 'FINAL WARNING — team will be removed';
    v_message := format('%s still has only %s usable Race Jersey Kits but needs %s for %s. %s additional kit%s must be available before the stage eligibility check. If this remains unresolved, your team will be removed from the race and the normal missed-start/no-show penalty will apply.',coalesce(p_eligibility->>'team_name','Your team'),v_available,v_required,v_race_name,v_missing,case when v_missing=1 then '' else 's' end);
  else
    v_title := 'Race eligibility at risk — action required';
    v_message := format('%s is at risk of removal from %s: %s Race Jersey Kits required, only %s effectively available. Resolve the shortage%s.',coalesce(p_eligibility->>'team_name','Your team'),v_race_name,v_required,v_available,case when v_hours is not null then format(' before the stage start in about %s game hours',greatest(round(v_hours,1),0)) else ' before the stage eligibility check' end);
  end if;

  v_event_key := 'mandatory_jersey_'||p_level||':'||v_race_id::text||':'||v_stage_id::text||':'||v_team_id::text;

  select public.ppm_create_user_notification_direct_v1(
    p_user_id,
    'RACE_JERSEYS_MANDATORY_WARNING',
    v_title,
    v_message,
    '/dashboard/equipment?tab=race-supplies',
    p_eligibility || jsonb_build_object(
      'mandatory',true,
      'advisor_notification',false,
      'event_type','critical_race_eligibility_'||p_level,
      'alert_level',p_level,
      'persistent_dashboard_alert',true,
      'normal_missed_start_penalty_applies_if_disqualified',true,
      'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/mandatory%20race%20jersey.png'
    ),
    v_event_key
  ) into v_id;
  return v_id;
end;
$function$;

create or replace function public.process_critical_race_eligibility_alerts_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_today date := public.get_current_game_date_date();
  x record;
  e jsonb;
  st public.race_eligibility_notification_state%rowtype;
  v_state_found boolean;
  v_hours numeric;
  v_signature text;
  v_initial boolean;
  v_urgent boolean;
  v_final boolean;
  v_checked integer:=0;
  v_active integer:=0;
  v_initial_count integer:=0;
  v_urgent_count integer:=0;
  v_final_count integer:=0;
  v_resolved integer:=0;
begin
  for x in
    with next_stage as (
      select distinct on (t.race_id,t.club_id)
        t.race_id,t.club_id as team_id,
        public.universal_race_resource_owner_club_v1(t.club_id) as resource_owner_club_id,
        s.id as stage_id,s.stage_date,s.stage_number
      from public.race_participant_teams_v1 t
      join public.races r on r.id=t.race_id
      join public.race_stages s on s.race_id=t.race_id
      where lower(coalesce(r.status,'scheduled')) in ('scheduled','active')
        and lower(coalesce(t.status,'accepted'))='accepted'
        and s.stage_date::date between v_today and v_today+7
        and not coalesce(s.weather_cancelled,false)
        and not exists(select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.id)
      order by t.race_id,t.club_id,s.stage_date,s.stage_number,s.id
    )
    select n.*,owner.owner_user_id,c.name as team_name
    from next_stage n
    join public.clubs owner on owner.id=n.resource_owner_club_id
    join public.clubs c on c.id=n.team_id
    where owner.owner_user_id is not null and coalesce(c.is_ai,false)=false
  loop
    perform public.sync_race_supply_units_from_summary_v1(x.resource_owner_club_id);
    e := public.race_team_stage_eligibility_v1(x.stage_id,x.team_id);
    v_checked := v_checked+1;

    select * into st from public.race_eligibility_notification_state s where s.stage_id=x.stage_id and s.team_id=x.team_id;
    v_state_found := found;

    if e->>'status'='at_risk' then
      v_active := v_active+1;
      v_hours := nullif(e->>'hours_until_stage_start','')::numeric;
      v_signature := md5(concat_ws('|',e->>'required_jersey_units',e->>'effective_available_jersey_units',e->>'same_day_used_units',e->>'other_race_reserved_units'));
      v_initial := (not v_state_found) or st.condition_active=false or st.initial_notified_at is null or st.last_signature is distinct from v_signature;
      v_urgent := v_hours is not null and v_hours>3 and v_hours<=24 and ((not v_state_found) or st.urgent_notified_at is null or st.last_signature is distinct from v_signature);
      v_final := v_hours is not null and v_hours>0 and v_hours<=3 and ((not v_state_found) or st.final_notified_at is null or st.last_signature is distinct from v_signature);

      if v_initial then
        perform public.create_mandatory_race_jersey_escalation_v1(x.owner_user_id,e,'initial');
        v_initial_count:=v_initial_count+1;
      end if;
      if v_urgent then
        perform public.create_mandatory_race_jersey_escalation_v1(x.owner_user_id,e,'urgent');
        v_urgent_count:=v_urgent_count+1;
      end if;
      if v_final then
        perform public.create_mandatory_race_jersey_escalation_v1(x.owner_user_id,e,'final');
        v_final_count:=v_final_count+1;
      end if;

      insert into public.race_eligibility_notification_state(stage_id,team_id,race_id,condition_active,last_signature,initial_notified_at,urgent_notified_at,final_notified_at,resolved_at,last_checked_at,metadata,updated_at)
      values(x.stage_id,x.team_id,x.race_id,true,v_signature,
        case when v_initial then now() else null end,
        case when v_urgent then now() else null end,
        case when v_final then now() else null end,
        null,now(),e,now())
      on conflict(stage_id,team_id) do update set
        race_id=excluded.race_id,
        condition_active=true,
        last_signature=excluded.last_signature,
        initial_notified_at=case when public.race_eligibility_notification_state.last_signature is distinct from excluded.last_signature then excluded.initial_notified_at else coalesce(public.race_eligibility_notification_state.initial_notified_at,excluded.initial_notified_at) end,
        urgent_notified_at=case when public.race_eligibility_notification_state.last_signature is distinct from excluded.last_signature then excluded.urgent_notified_at else coalesce(public.race_eligibility_notification_state.urgent_notified_at,excluded.urgent_notified_at) end,
        final_notified_at=case when public.race_eligibility_notification_state.last_signature is distinct from excluded.last_signature then excluded.final_notified_at else coalesce(public.race_eligibility_notification_state.final_notified_at,excluded.final_notified_at) end,
        resolved_at=null,last_checked_at=now(),metadata=excluded.metadata,updated_at=now();
    else
      if v_state_found and st.condition_active then v_resolved:=v_resolved+1; end if;
      if v_state_found then
        update public.race_eligibility_notification_state
        set condition_active=false,resolved_at=case when condition_active then now() else resolved_at end,last_checked_at=now(),metadata=e,updated_at=now()
        where stage_id=x.stage_id and team_id=x.team_id;
      end if;
    end if;
  end loop;

  return jsonb_build_object('status','completed','current_game_at',public.get_current_game_timestamp(),'teams_checked',v_checked,'active_critical_alerts',v_active,'initial_notifications',v_initial_count,'urgent_notifications',v_urgent_count,'final_notifications',v_final_count,'resolved_alerts',v_resolved,'scan_frequency_target','every_scheduler_invocation');
end;
$function$;