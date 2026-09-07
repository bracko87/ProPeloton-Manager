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
  v_current_effective integer := 0;
  v_missing integer := 0;
  v_total_owned integer := 0;
  v_same_day_used integer := 0;
  v_reserved integer := 0;
  v_blocked boolean := false;
  v_reason text;
  v_dq_required integer;
  v_dq_available integer;
  v_dq_missing integer;
  v_start_at timestamptz;
  v_hours numeric;
  v_status text;
  v_explanation text;
begin
  select s.id,s.race_id,s.stage_number,s.stage_date::date as stage_date
  into v_stage from public.race_stages s where s.id=p_stage_id;
  if v_stage.id is null then return jsonb_build_object('status','stage_not_found','stage_id',p_stage_id,'team_id',p_team_id); end if;

  select r.id,r.name,r.category,coalesce(r.is_stage_race,false) as is_stage_race into v_race from public.races r where r.id=v_stage.race_id;
  select c.id,c.name,coalesce(c.is_ai,false) as is_ai into v_team from public.clubs c where c.id=p_team_id;
  if v_team.id is null then return jsonb_build_object('status','team_not_found','stage_id',p_stage_id,'team_id',p_team_id); end if;

  v_owner:=public.universal_race_resource_owner_club_v1(p_team_id);
  select c.name into v_owner_name from public.clubs c where c.id=v_owner;
  v_required:=public.universal_race_team_required_jerseys_v1(v_stage.race_id,p_team_id);
  v_current_effective:=public.universal_race_stage_effective_supply_available_v1(p_stage_id,p_team_id,'race_jersey_complete');
  v_effective:=v_current_effective;
  v_reserved:=public.universal_race_stage_other_supply_reservations_v1(p_stage_id,p_team_id,'race_jersey_complete');

  select count(*)::integer into v_total_owned
  from public.club_race_supply_units u
  where u.club_id=v_owner and u.supply_key='race_jersey_complete' and u.status in ('ready','assigned') and u.stage_uses_remaining>0;

  select count(*)::integer into v_same_day_used
  from public.club_race_supply_units u
  where u.club_id=v_owner and u.supply_key='race_jersey_complete' and u.status in ('ready','assigned') and u.stage_uses_remaining>0 and u.last_used_game_date=v_stage.stage_date;

  select true,d.reason_code,d.required_jersey_units,d.available_jersey_units,d.missing_jersey_units
  into v_blocked,v_reason,v_dq_required,v_dq_available,v_dq_missing
  from public.race_team_stage_disqualifications d
  where d.race_id=v_stage.race_id and d.team_id=p_team_id and v_stage.stage_number>=d.from_stage_number
  order by d.from_stage_number desc,d.created_at desc limit 1;
  v_blocked:=coalesce(v_blocked,false);

  if v_blocked then
    v_required:=coalesce(v_dq_required,v_required);
    v_effective:=coalesce(v_dq_available,v_effective);
    v_missing:=coalesce(v_dq_missing,greatest(v_required-v_effective,0));
  else
    v_missing:=greatest(v_required-v_effective,0);
  end if;

  v_start_at:=public.race_stage_planned_start_game_at_v1(p_stage_id);
  if v_start_at is not null then v_hours:=extract(epoch from (v_start_at-public.get_current_game_timestamp()))/3600.0; end if;

  v_status:=case when v_blocked then 'entry_blocked' when v_required>0 and v_effective<v_required then 'at_risk' else 'eligible' end;
  v_explanation:=case
    when v_blocked then format('The team was blocked after failing the mandatory pre-start jersey check: %s required, %s available, %s missing.',v_required,v_effective,v_missing)
    when v_required>0 and v_effective<v_required then format('%s Race Jersey Kits are required, but only %s are effectively available for this stage. %s additional kit%s must become usable before the stage eligibility check.',v_required,v_effective,v_missing,case when v_missing=1 then '' else 's' end)
    else format('Race eligibility is currently satisfied: %s required and %s effectively available Race Jersey Kits.',v_required,v_effective)
  end;

  return jsonb_build_object(
    'status',v_status,'severity',case when v_blocked then 'blocked' when v_missing>0 then 'critical' else 'ok' end,
    'race_id',v_stage.race_id,'race_name',v_race.name,'race_class_code',v_race.category,'is_stage_race',v_race.is_stage_race,
    'stage_id',p_stage_id,'stage_number',v_stage.stage_number,'stage_date',v_stage.stage_date,'stage_start_game_at',v_start_at,
    'hours_until_stage_start',case when v_hours is null then null else round(v_hours,2) end,
    'team_id',p_team_id,'team_name',v_team.name,'resource_owner_club_id',v_owner,'resource_owner_club_name',v_owner_name,
    'required_jersey_units',v_required,'effective_available_jersey_units',v_effective,'current_effective_available_jersey_units',v_current_effective,
    'missing_jersey_units',v_missing,'total_usable_owned_units_before_same_day_rule',v_total_owned,'same_day_used_units',v_same_day_used,
    'other_race_reserved_units',v_reserved,'already_disqualified',v_blocked,'disqualification_reason_code',v_reason,
    'explanation',v_explanation,'action_url','/dashboard/equipment?tab=race-supplies',
    'race_preparation_url','/dashboard/race-preparation?tab=acceptedRaces&raceId='||v_stage.race_id::text,
    'consequence',case when v_race.is_stage_race then 'team_removed_from_stage_and_all_remaining_stages' else 'team_removed_from_race' end,
    'eligibility_model','canonical_effective_race_supply_v1'
  );
end;
$function$;

create or replace function public.staff_advisory_scan_all_sport_director_race_eligibility_v1(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  a record;
  x record;
  e jsonb;
  st public.staff_advisory_event_state%rowtype;
  v_found boolean;
  v_signature text;
  v_result jsonb;
  v_results jsonb:='[]'::jsonb;
  v_generated integer:=0;
  v_active boolean;
begin
  for a in
    select aa.id as access_id,aa.club_id,aa.staff_id
    from public.staff_advisory_access aa
    join public.club_staff s on s.id=aa.staff_id and s.club_id=aa.club_id
    join public.clubs c on c.id=aa.club_id
    where aa.role_type='sport_director' and aa.entitlement_state='active' and aa.expires_at>public.staff_advisory_game_now_v1()
      and s.is_active=true and s.role_type::text='sport_director' and c.deleted_at is null and c.is_active=true
  loop
    x:=null;
    select q.* into x
    from (
      select t.race_id,t.club_id as team_id,rs.id as stage_id,rs.stage_date,rs.stage_number
      from public.race_participant_teams_v1 t
      join public.races r on r.id=t.race_id
      join public.race_stages rs on rs.race_id=t.race_id
      where public.universal_race_resource_owner_club_v1(t.club_id)=a.club_id
        and lower(coalesce(t.status,'accepted'))='accepted'
        and lower(coalesce(r.status,'scheduled')) in ('scheduled','active')
        and rs.stage_date::date between public.get_current_game_date_date() and public.get_current_game_date_date()+7
        and not coalesce(rs.weather_cancelled,false)
        and not exists(select 1 from public.race_stage_authoritative_runs ar where ar.stage_id=rs.id)
      order by rs.stage_date,rs.stage_number,rs.id
    ) q
    where public.race_team_stage_eligibility_v1(q.stage_id,q.team_id)->>'status'='at_risk'
    limit 1;

    v_active:=x.stage_id is not null;
    if v_active then
      e:=public.race_team_stage_eligibility_v1(x.stage_id,x.team_id);
      v_signature:=md5(concat_ws('|',e->>'race_id',e->>'stage_id',e->>'team_id',e->>'required_jersey_units',e->>'effective_available_jersey_units',e->>'same_day_used_units',e->>'other_race_reserved_units'));
    else
      e:='{}'::jsonb; v_signature:='none';
    end if;

    select * into st from public.staff_advisory_event_state where access_id=a.access_id and event_code='sd_race_eligibility_critical';
    v_found:=found;

    if v_active and (p_force or not v_found or not coalesce(st.condition_active,false) or st.last_signature is distinct from v_signature) then
      v_result:=public.staff_advisory_emit_sport_director_event_v1(
        a.access_id,'sd_race_eligibility_critical','Sports Director Advisory — Race Eligibility Critical',
        format('%s is at risk of removal from %s. %s Race Jersey Kits are required for Stage %s, but only %s are effectively available. %s kit%s missing.',coalesce(e->>'team_name','Your team'),coalesce(e->>'race_name','the race'),e->>'required_jersey_units',e->>'stage_number',e->>'effective_available_jersey_units',e->>'missing_jersey_units',case when e->>'missing_jersey_units'='1' then '' else 's' end),
        'race_eligibility_critical',e,
        jsonb_build_array('Open Race Supplies and resolve the shortage before the stage eligibility check.','If the shortage remains unresolved, the team will be removed and the normal missed-start/no-show penalty will apply.'),
        'sport_director_race_eligibility_critical',v_signature
      );
      if v_result->>'status'='generated' then v_generated:=v_generated+1; v_results:=v_results||jsonb_build_array(v_result); end if;
    end if;

    insert into public.staff_advisory_event_state(access_id,event_code,condition_active,last_signature,last_notified_at,last_checked_at,state_json,updated_at)
    values(a.access_id,'sd_race_eligibility_critical',v_active,v_signature,case when v_active and (p_force or not v_found or not coalesce(st.condition_active,false) or st.last_signature is distinct from v_signature) then now() else null end,now(),e,now())
    on conflict(access_id,event_code) do update set condition_active=excluded.condition_active,last_signature=excluded.last_signature,
      last_notified_at=coalesce(excluded.last_notified_at,public.staff_advisory_event_state.last_notified_at),last_checked_at=now(),state_json=excluded.state_json,updated_at=now();
  end loop;

  return jsonb_build_object('status','checked','generated_count',v_generated,'results',v_results,'checked_at',now());
end;
$function$;

create or replace function public.staff_advisory_scan_all_mechanic_race_eligibility_v1(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  a record;
  x record;
  e jsonb;
  st public.staff_advisory_event_state%rowtype;
  v_found boolean;
  v_signature text;
  v_result jsonb;
  v_results jsonb:='[]'::jsonb;
  v_generated integer:=0;
  v_active boolean;
  v_detail text;
begin
  for a in
    select aa.id as access_id,aa.club_id,aa.staff_id
    from public.staff_advisory_access aa
    join public.club_staff s on s.id=aa.staff_id and s.club_id=aa.club_id
    join public.clubs c on c.id=aa.club_id
    where aa.role_type='mechanic' and aa.entitlement_state='active' and aa.expires_at>public.staff_advisory_game_now_v1()
      and s.is_active=true and s.role_type::text='mechanic' and c.deleted_at is null and c.is_active=true
  loop
    x:=null;
    select q.* into x
    from (
      select t.race_id,t.club_id as team_id,rs.id as stage_id,rs.stage_date,rs.stage_number
      from public.race_participant_teams_v1 t
      join public.races r on r.id=t.race_id
      join public.race_stages rs on rs.race_id=t.race_id
      where public.universal_race_resource_owner_club_v1(t.club_id)=a.club_id
        and lower(coalesce(t.status,'accepted'))='accepted'
        and lower(coalesce(r.status,'scheduled')) in ('scheduled','active')
        and rs.stage_date::date between public.get_current_game_date_date() and public.get_current_game_date_date()+7
        and not coalesce(rs.weather_cancelled,false)
        and not exists(select 1 from public.race_stage_authoritative_runs ar where ar.stage_id=rs.id)
      order by rs.stage_date,rs.stage_number,rs.id
    ) q
    where public.race_team_stage_eligibility_v1(q.stage_id,q.team_id)->>'status'='at_risk'
    limit 1;

    v_active:=x.stage_id is not null;
    if v_active then
      e:=public.race_team_stage_eligibility_v1(x.stage_id,x.team_id);
      v_signature:=md5(concat_ws('|',e->>'race_id',e->>'stage_id',e->>'team_id',e->>'required_jersey_units',e->>'effective_available_jersey_units',e->>'same_day_used_units',e->>'other_race_reserved_units'));
      v_detail:=format('%s usable jersey unit%s are owned before same-day restrictions; %s were already used on the stage date and %s are reserved for another race. Effective availability is %s, while %s are required.',e->>'total_usable_owned_units_before_same_day_rule',case when e->>'total_usable_owned_units_before_same_day_rule'='1' then '' else 's' end,e->>'same_day_used_units',e->>'other_race_reserved_units',e->>'effective_available_jersey_units',e->>'required_jersey_units');
    else
      e:='{}'::jsonb; v_signature:='none'; v_detail:=null;
    end if;

    select * into st from public.staff_advisory_event_state where access_id=a.access_id and event_code='mechanic_race_supply_eligibility_critical';
    v_found:=found;

    if v_active and (p_force or not v_found or not coalesce(st.condition_active,false) or st.last_signature is distinct from v_signature) then
      v_result:=public.staff_advisory_emit_mechanic_event_v1(
        a.access_id,'mechanic_race_supply_eligibility_critical','Chief Mechanic Advisory — Race Jersey Eligibility',
        format('%s is short of mandatory Race Jersey Kits for %s — Stage %s. %s',coalesce(e->>'team_name','Your team'),coalesce(e->>'race_name','the race'),e->>'stage_number',v_detail),
        'race_supply_eligibility_critical',e,
        jsonb_build_array('Restock or free enough usable Race Jersey Kits before the stage eligibility check.','The effective availability figure uses the same race-specific calculation as the race engine, including same-day use and other race reservations.'),
        'mechanic:race_eligibility:'||v_signature
      );
      if v_result->>'status'='generated' then v_generated:=v_generated+1; v_results:=v_results||jsonb_build_array(v_result); end if;
    end if;

    insert into public.staff_advisory_event_state(access_id,event_code,condition_active,last_signature,last_notified_at,last_checked_at,state_json,updated_at)
    values(a.access_id,'mechanic_race_supply_eligibility_critical',v_active,v_signature,case when v_active and (p_force or not v_found or not coalesce(st.condition_active,false) or st.last_signature is distinct from v_signature) then now() else null end,now(),e,now())
    on conflict(access_id,event_code) do update set condition_active=excluded.condition_active,last_signature=excluded.last_signature,
      last_notified_at=coalesce(excluded.last_notified_at,public.staff_advisory_event_state.last_notified_at),last_checked_at=now(),state_json=excluded.state_json,updated_at=now();
  end loop;

  return jsonb_build_object('status','checked','generated_count',v_generated,'results',v_results,'checked_at',now());
end;
$function$;

create or replace function public.staff_advisory_notification_category_codes_v1(p_category_code text)
returns table(report_code text)
language sql
immutable
as $function$
  select code from unnest(
    case p_category_code
      when 'trainingReadiness' then array['weekly_training_readiness','hc_high_fatigue_alert','hc_fatigue_watch','hc_rider_availability','hc_training_schedule_gap','hc_squad_readiness','hc_rider_skill_change']::text[]
      when 'raceProgrammePreparation' then array['weekly_race_programme','sd_race_programme_gap','sd_race_programme_continuity_gap','sd_race_preparation_missing','sd_race_preparation_ready']::text[]
      when 'startlistStagePlans' then array['sd_startlist_deadline_alert','sd_stage_plans_missing','sd_stage_plans_incomplete','sd_race_eligibility_critical']::text[]
      when 'medicalRecovery' then array['weekly_medical_treatment','daily_health_recovery','td_injury_treatment_plan','td_sickness_treatment_plan','td_recovery_setback','td_recovery_improvement','td_medical_clearance']::text[]
      when 'equipmentWorkshopSupplies' then array['weekly_equipment_workshop_review','weekly_equipment_review','mechanic_equipment_condition_priority','mechanic_workshop_readiness_restored','mechanic_race_supply_eligibility_critical']::text[]
      when 'scoutingRecruitment' then array['weekly_recruitment_review','scout_priority_prospect']::text[]
      else array[]::text[]
    end
  ) as code;
$function$;

create or replace function public.staff_advisory_run_hourly_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_due jsonb;
  v_head_coach_events jsonb;
  v_sport_director_events jsonb;
  v_sport_director_eligibility jsonb;
  v_team_doctor_events jsonb;
  v_mechanic_events jsonb;
  v_mechanic_eligibility jsonb;
  v_scout_events jsonb;
begin
  v_due:=public.staff_advisory_generate_due_reports_v1(false);
  v_head_coach_events:=public.staff_advisory_scan_all_head_coach_events_v1(false);
  v_sport_director_events:=public.staff_advisory_scan_all_sport_director_events_v1(false);
  v_sport_director_eligibility:=public.staff_advisory_scan_all_sport_director_race_eligibility_v1(false);
  v_team_doctor_events:=public.staff_advisory_scan_all_team_doctor_events_v1(false);
  v_mechanic_events:=public.staff_advisory_scan_all_mechanic_events_v1(false);
  v_mechanic_eligibility:=public.staff_advisory_scan_all_mechanic_race_eligibility_v1(false);
  v_scout_events:=public.staff_advisory_scan_all_scout_events_v1(false);
  return jsonb_build_object('scheduled_reports',v_due,'head_coach_events',v_head_coach_events,'sport_director_events',v_sport_director_events,'sport_director_race_eligibility',v_sport_director_eligibility,'team_doctor_events',v_team_doctor_events,'mechanic_events',v_mechanic_events,'mechanic_race_eligibility',v_mechanic_eligibility,'scout_events',v_scout_events,'ran_at',now());
end;
$function$;

create or replace function public.process_due_game_notifications_scheduler_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_game_result jsonb:=null; v_safety_result jsonb:=null; v_supplies_result jsonb:=null;
  v_jersey_result jsonb:=null; v_critical_eligibility_result jsonb:=null; v_penalty_recovery_result jsonb:=null;
  v_morale_result jsonb:=null; v_contract_result jsonb:=null; v_season_start_result jsonb:=null;
  v_game_error text:=null; v_safety_error text:=null; v_supplies_error text:=null; v_jersey_error text:=null;
  v_critical_eligibility_error text:=null; v_penalty_recovery_error text:=null;
  v_morale_error text:=null; v_contract_error text:=null; v_season_start_error text:=null;
begin
  begin v_season_start_result:=public.send_season_start_race_deadline_notice_if_due_v1(); exception when others then v_season_start_error:=sqlerrm; end;
  begin
    if to_regprocedure('public.process_due_game_notifications_v1()') is not null then execute 'select to_jsonb(public.process_due_game_notifications_v1())' into v_game_result;
    else v_game_error:='process_due_game_notifications_v1() not found'; end if;
  exception when others then v_game_error:=sqlerrm; end;
  begin
    if to_regprocedure('public.process_due_notification_safety_net_v1()') is not null then v_safety_result:=public.process_due_notification_safety_net_v1();
    else v_safety_error:='process_due_notification_safety_net_v1() not found'; end if;
  exception when others then v_safety_error:=sqlerrm; end;
  begin
    if to_regprocedure('public.process_due_race_supplies_low_notifications_v1()') is not null then v_supplies_result:=public.process_due_race_supplies_low_notifications_v1();
    else v_supplies_error:='process_due_race_supplies_low_notifications_v1() not found'; end if;
  exception when others then v_supplies_error:=sqlerrm; end;
  begin v_jersey_result:=public.process_due_mandatory_race_jersey_notifications_v1(); exception when others then v_jersey_error:=sqlerrm; end;
  begin v_critical_eligibility_result:=public.process_critical_race_eligibility_alerts_v1(); exception when others then v_critical_eligibility_error:=sqlerrm; end;
  begin v_penalty_recovery_result:=public.process_unapplied_prestart_disqualification_penalties_v1(); exception when others then v_penalty_recovery_error:=sqlerrm; end;
  begin
    if to_regprocedure('public.process_rider_daily_selection_morale_v1(date)') is not null then v_morale_result:=public.process_rider_daily_selection_morale_v1();
    else v_morale_error:='process_rider_daily_selection_morale_v1(date) not found'; end if;
  exception when others then v_morale_error:=sqlerrm; end;
  begin
    if to_regprocedure('public.process_rider_contract_expiry_notifications_v1(date)') is not null then v_contract_result:=public.process_rider_contract_expiry_notifications_v1();
    else v_contract_error:='process_rider_contract_expiry_notifications_v1(date) not found'; end if;
  exception when others then v_contract_error:=sqlerrm; end;
  return jsonb_build_object(
    'status',case when v_season_start_error is null and v_game_error is null and v_safety_error is null and v_supplies_error is null and v_jersey_error is null and v_critical_eligibility_error is null and v_penalty_recovery_error is null and v_morale_error is null and v_contract_error is null then 'completed' else 'completed_with_errors' end,
    'season_start_race_deadline_result',v_season_start_result,'season_start_race_deadline_error',v_season_start_error,
    'game_notifications_result',v_game_result,'game_notifications_error',v_game_error,
    'safety_net_result',v_safety_result,'safety_net_error',v_safety_error,
    'race_supplies_low_result',v_supplies_result,'race_supplies_low_error',v_supplies_error,
    'mandatory_race_jersey_result',v_jersey_result,'mandatory_race_jersey_error',v_jersey_error,
    'critical_race_eligibility_result',v_critical_eligibility_result,'critical_race_eligibility_error',v_critical_eligibility_error,
    'prestart_penalty_recovery_result',v_penalty_recovery_result,'prestart_penalty_recovery_error',v_penalty_recovery_error,
    'rider_morale_result',v_morale_result,'rider_morale_error',v_morale_error,
    'rider_contract_expiry_result',v_contract_result,'rider_contract_expiry_error',v_contract_error,'processed_at',now());
end;
$function$;